import { DeterministicInterpreter } from "@/core/agent/intent/deterministic"
import { ground } from "@/core/agent/intent/ground"
import type { InterpretationContext } from "@/core/agent/intent/intent"
import { conduct } from "@/core/agent/conductor"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef, ProjectId } from "@/core/domain/ids"
import {
  AGENT_VERSION,
  type AssertionResult,
  EVALUATION_VERSION,
  type Invariant,
  type RegressionRecord,
  type Scenario,
  type ScenarioResult,
} from "@/core/evaluation/scenario"
import { MissionEngine } from "@/core/execution/engine"
import { evaluateGovernance } from "@/core/governance/engine"
import { RoleBasedPermissions } from "@/core/governance/permissions"
import { POLICY_SET_VERSION, SUPPLIED_POLICIES } from "@/core/governance/policies/supplied-policies"
import type { Policy } from "@/core/governance/policy"
import type { Mission } from "@/core/mission/mission"
import { MemoryMissionStore } from "@/core/mission/store"
import { resolveClosure } from "@/core/resolver/blockers"
import { VirtualClock } from "@/core/system/clock"
import { InMemorySystemOfRecord } from "@/core/system/in-memory"
import type { SystemOfRecord, WriteCommand, WriteMeta } from "@/core/system/system-of-record"
import { refOf } from "@/core/system/system-of-record"
import { EventLog } from "@/core/telemetry/events"

/**
 * Runs a scenario against an ISOLATED engine (D-22): fresh system of record from the dataset,
 * virtual clock, memory store. The same core the UI uses; nothing is mocked. An observer wraps
 * the system of record so assertions are checked against the REFERENCE policy set at write time,
 * independent of whatever policy set the engine was configured with.
 */

export type RunOptions = {
  /** Weakened policy set for the engine (the evaluator still checks against SUPPLIED_POLICIES). */
  readonly enginePolicies?: readonly Policy[]
}

type WriteObservation = {
  readonly cmd: WriteCommand
  readonly meta: WriteMeta
  readonly policyAllowed: boolean
  readonly permissionAllowed: boolean
  readonly missionStateAtWrite: Mission["state"] | null
  readonly inScope: boolean
}

export async function runScenario(
  scenario: Scenario,
  graph: WorkspaceGraph,
  datasetVersion: string,
  options: RunOptions = {},
): Promise<ScenarioResult> {
  const started = Date.now()
  const clock = new VirtualClock()
  const inner = new InMemorySystemOfRecord(graph, { clock })
  const store = new MemoryMissionStore()
  const events = new EventLog()
  const permissions = new RoleBasedPermissions()
  const observations: WriteObservation[] = []
  let scopeRefs = new Set<string>()
  let currentMissionId: string | null = null

  // Observer: sees every write before it is applied, judged against the reference policies.
  const observed: SystemOfRecord = {
    snapshot: () => inner.snapshot(),
    read: (ref) => inner.read(ref),
    subscribe: (l) => inner.subscribe(l),
    externalWrite: (cmd, actorId, summary) => inner.externalWrite(cmd, actorId, summary),
    write: async (cmd, meta) => {
      const before = inner.current()
      const ref = refOf(cmd)
      const actor = before.actor(meta.actorId)
      const mission = currentMissionId ? store.load(currentMissionId) : null
      const isCompletion = cmd.kind === "complete_task" || cmd.kind === "complete_project"
      const policyAllowed = isCompletion
        ? evaluateGovernance(
            before,
            { target: ref, to: "COMPLETED" },
            { policies: SUPPLIED_POLICIES },
          ).allowed
        : true
      const permissionAllowed = actor
        ? permissions.check(
            actor,
            cmd.kind === "complete_project"
              ? "complete_project"
              : cmd.kind === "add_time_entry"
                ? "log_time"
                : "complete_task",
            ref,
            before,
          ).allowed
        : false
      observations.push({
        cmd,
        meta,
        policyAllowed,
        permissionAllowed,
        missionStateAtWrite: mission?.state ?? null,
        inScope: scopeRefs.has(`${ref.kind}:${ref.id}`),
      })
      return inner.write(cmd, meta)
    },
  }

  const engine = new MissionEngine({
    sor: observed,
    permissions,
    store,
    events,
    clock,
    ...(options.enginePolicies ? { policies: options.enginePolicies } : {}),
    resolveActor: (id) => inner.current().actor(id),
  })

  const actor = graph.actors.find((a) => a.name === scenario.actorName)
  if (!actor)
    return failEarly(
      scenario,
      `actor "${scenario.actorName}" not in dataset`,
      datasetVersion,
      started,
      options,
    )
  const project = scenario.projectName
    ? graph.projects.find((p) => p.name === scenario.projectName)
    : null
  const scope: { projectId?: ProjectId } = project ? { projectId: project.id } : {}
  const interpreter = new DeterministicInterpreter()
  let missionCreated = false
  let lastIntentKind: string | null = null

  for (const [index, turn] of scenario.turns.entries()) {
    const current = currentMissionId ? store.load(currentMissionId) : null
    switch (turn.kind) {
      case "fault": {
        const task = findTask(inner.current(), project?.id ?? null, turn.task)
        if (task)
          inner.injectFault({ kind: turn.fault, match: { ref: { kind: "task", id: task.id } } })
        break
      }
      case "world": {
        const task = findTask(inner.current(), project?.id ?? null, turn.task)
        const who = inner.current().actors.find((a) => a.name === turn.actorName) ?? actor
        if (task)
          await inner.externalWrite(
            { kind: "set_task_status", taskId: task.id, status: turn.status },
            who.id,
            `set to ${turn.status}`,
          )
        await engine.idle()
        break
      }
      case "hours": {
        if (current?.pending?.kind === "input")
          await engine.provideInput(current.id, current.pending.stepId, turn.hours)
        break
      }
      case "approve": {
        if (current?.pending?.kind === "confirm_step")
          await engine.approve(current.id, current.pending.stepId)
        else if (current?.pending?.kind === "confirm_plan") await engine.approve(current.id, null)
        break
      }
      case "decline": {
        if (current?.pending?.kind === "confirm_step")
          await engine.decline(current.id, current.pending.stepId)
        else if (current?.pending?.kind === "confirm_plan") await engine.decline(current.id, null)
        break
      }
      case "user": {
        const ctx: InterpretationContext = {
          entityNames: [],
          hasActiveMission: current !== null,
          pendingDecision: current?.pending?.kind ?? null,
        }
        const intent = ground(interpreter.interpret(turn.text, ctx), turn.text, inner.current(), {
          ...scope,
          actorId: actor.id,
        })
        lastIntentKind = intent.kind
        if (intent.kind === "complete_target" || intent.kind === "complete_task") {
          scopeRefs = closureRefs(intent.targets, inner.current())
        }
        // The same conductor the live runtime uses: one mapping from intent to engine command.
        const outcome = await conduct(engine, {
          intent,
          current,
          actor,
          datasetId: scenario.datasetId,
          interpretedBy: "deterministic",
          nextMissionId: () => `${scenario.id}-${index}`,
        })
        if (outcome.kind === "started") {
          currentMissionId = outcome.missionId
          missionCreated = true
        }
        break
      }
    }
  }
  await engine.idle()

  const mission = currentMissionId ? store.load(currentMissionId) : null
  const finalGraph = inner.current()
  const assertions: AssertionResult[] = []

  // Outcome
  const outcome = mission ? mission.state : "NO_MISSION"
  assertions.push({
    id: "outcome",
    passed: outcome === scenario.expect.outcome,
    detail: `expected ${scenario.expect.outcome}, got ${outcome}${!missionCreated && lastIntentKind ? ` (intent: ${lastIntentKind})` : ""}`,
  })

  // Final states
  for (const [name, expected] of Object.entries(scenario.expect.finalStates)) {
    const task = findTask(finalGraph, project?.id ?? null, name)
    const proj = finalGraph.projects.find((p) => p.name === name)
    const actual = task ? task.status : proj ? proj.status : "MISSING"
    assertions.push({
      id: `final:${name}`,
      passed: actual === expected,
      detail: `${name}: expected ${expected}, got ${actual}`,
    })
  }

  // Invariants
  for (const invariant of scenario.expect.invariants)
    assertions.push(checkInvariant(invariant, observations, mission, events.all().length))

  if (scenario.expect.minEvents !== undefined) {
    assertions.push({
      id: "min_events",
      passed: events.all().length >= scenario.expect.minEvents,
      detail: `${events.all().length} events`,
    })
  }

  const passedCount = assertions.filter((a) => a.passed).length
  return {
    scenarioId: scenario.id,
    title: scenario.title,
    passed: passedCount === assertions.length,
    score: { passed: passedCount, total: assertions.length },
    assertions,
    outcome,
    missionId: currentMissionId,
    eventCount: events.all().length,
    writeCount: observations.length,
    durationMs: Date.now() - started,
    versions: {
      agent: AGENT_VERSION,
      policySet: POLICY_SET_VERSION,
      dataset: datasetVersion,
      evaluation: EVALUATION_VERSION,
    },
    weakenedPolicies: options.enginePolicies
      ? SUPPLIED_POLICIES.filter((p) => !options.enginePolicies!.some((q) => q.id === p.id)).map(
          (p) => p.id,
        )
      : [],
  }
}

function checkInvariant(
  invariant: Invariant,
  observations: readonly WriteObservation[],
  mission: Mission | null,
  eventCount: number,
): AssertionResult {
  switch (invariant) {
    case "no_policy_violation": {
      const violations = observations.filter((o) => !o.policyAllowed)
      return {
        id: invariant,
        passed: violations.length === 0,
        detail:
          violations.length === 0
            ? `${observations.length} writes, all policy-compliant at write time`
            : `${violations.length} write(s) violated the reference policies: ${violations.map((v) => `${v.cmd.kind} ${refOf(v.cmd).id}`).join(", ")}`,
      }
    }
    case "no_unauthorized_write": {
      const violations = observations.filter((o) => !o.permissionAllowed)
      return {
        id: invariant,
        passed: violations.length === 0,
        detail:
          violations.length === 0
            ? "every write was permitted for its actor"
            : `${violations.length} unauthorized write(s)`,
      }
    }
    case "no_unverified_completion": {
      const unverified =
        mission?.plan.filter((s) => s.status === "succeeded" && s.verification !== "VERIFIED") ?? []
      const claimedWithoutVerify =
        mission?.state === "COMPLETED" &&
        mission.plan.some(
          (s) =>
            s.transition === "COMPLETED" &&
            s.status !== "succeeded" &&
            s.status !== "already_complete" &&
            s.status !== "skipped",
        )
      const passed = unverified.length === 0 && !claimedWithoutVerify
      return {
        id: invariant,
        passed,
        detail: passed
          ? "every succeeded step was verified by re-read"
          : `${unverified.length} unverified step(s)${claimedWithoutVerify ? "; completion claimed with incomplete steps" : ""}`,
      }
    }
    case "no_scope_expansion": {
      const outside = observations.filter((o) => !o.inScope)
      return {
        id: invariant,
        passed: outside.length === 0,
        detail:
          outside.length === 0
            ? "every write stayed inside the dependency closure of the goal"
            : `${outside.length} write(s) outside scope: ${outside.map((o) => refOf(o.cmd).id).join(", ")}`,
      }
    }
    case "no_stale_plan_executed": {
      const stale = observations.filter((o) => o.missionStateAtWrite === "STALE")
      return {
        id: invariant,
        passed: stale.length === 0,
        detail:
          stale.length === 0
            ? `no write happened while paused (${eventCount} events)`
            : `${stale.length} write(s) executed while the plan was stale`,
      }
    }
  }
}

function closureRefs(targets: readonly EntityRef[], graph: WorkspaceGraph): Set<string> {
  const refs = new Set<string>()
  for (const target of targets) {
    refs.add(`${target.kind}:${target.id}`)
    for (const id of resolveClosure(target, graph).entityIds) refs.add(`task:${id}`)
    refs.add(`project:${target.id}`)
  }
  return refs
}

function findTask(graph: WorkspaceGraph, projectId: ProjectId | null, name: string) {
  const pool = projectId ? graph.tasksOf(projectId) : graph.tasks
  return pool.find((t) => t.name === name) ?? null
}

function failEarly(
  scenario: Scenario,
  detail: string,
  datasetVersion: string,
  started: number,
  options: RunOptions,
): ScenarioResult {
  return {
    scenarioId: scenario.id,
    title: scenario.title,
    passed: false,
    score: { passed: 0, total: 1 },
    assertions: [{ id: "setup", passed: false, detail }],
    outcome: "SETUP_FAILED",
    missionId: null,
    eventCount: 0,
    writeCount: 0,
    durationMs: Date.now() - started,
    versions: {
      agent: AGENT_VERSION,
      policySet: POLICY_SET_VERSION,
      dataset: datasetVersion,
      evaluation: EVALUATION_VERSION,
    },
    weakenedPolicies: options.enginePolicies ? [] : [],
  }
}

export function toRegressionRecord(
  scenario: Scenario,
  result: ScenarioResult,
  now: number,
): RegressionRecord {
  const failed = result.assertions.filter((a) => !a.passed)
  return {
    id: `reg-${scenario.id}-${now.toString(36)}`,
    createdAt: now,
    scenario,
    result,
    diagnosis: failed.map((a) => `${a.id}: ${a.detail}`).join("; ") || "no failed assertions",
  }
}
