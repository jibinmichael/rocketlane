import type { Actor } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef } from "@/core/domain/ids"
import { isTaskComplete } from "@/core/domain/status"
import type { GovernanceConfig, Policy } from "@/core/governance/policy"
import type {
  PermissionAction,
  PermissionCheck,
  PermissionEvaluator,
} from "@/core/governance/permissions"
import { fnv1a } from "@/core/ingestion/hash"
import type { ActionClass, Mission, PlanStep } from "@/core/mission/mission"
import { ALL_CLOSURE_RULES, type ClosureRules, resolveClosure } from "@/core/resolver/blockers"
import { labelOf } from "@/core/resolver/target"

/**
 * Plan authority boundary (spec §3, D-18). The agent proposes WHAT (targets, exclusions). The
 * system derives HOW: every step comes from the dependency closure, never from the model, and only
 * this module can produce a FlightPlan. `Executor.execute` accepts nothing else.
 */

export type ProposedPlan = {
  readonly missionId: string
  readonly goalText: string
  readonly targets: readonly EntityRef[]
  readonly excluded: readonly EntityRef[]
  readonly actor: Actor
}

const flightPlanBrand: unique symbol = Symbol("FlightPlan")

export type FlightPlan = {
  readonly [flightPlanBrand]: true
  readonly missionId: string
  readonly steps: readonly PlanStep[]
  readonly entityIds: ReadonlySet<string>
  readonly openButNotRequired: ReadonlyArray<{ readonly ref: EntityRef; readonly label: string }>
  readonly permissionDenials: readonly PermissionCheck[]
  readonly requiresPlanConfirmation: boolean
}

export type PlanRejection = {
  readonly reason:
    | "NO_TARGETS"
    | "TARGET_NOT_FOUND"
    | "UNSUPPORTED_TARGET_KIND"
    | "NOTHING_TO_UNDO"
    | "NO_PRIOR_STATE"
  readonly detail: string
}

export type FlightPlanContext = {
  readonly graph: WorkspaceGraph
  readonly permissions: PermissionEvaluator
  readonly governance: GovernanceConfig
  /** The engine's policy set. Omit for the four supplied policies. Drives which requirements the plan derives. */
  readonly policies?: readonly Policy[]
  /** A-05: batch (more than one target) gets one upfront confirmation. */
  readonly batchThreshold?: number
}

export function stepId(
  missionId: string,
  ref: EntityRef,
  transition: PlanStep["transition"],
): string {
  return `step-${fnv1a(`${missionId}|${ref.kind}:${ref.id}|${transition}`)}`
}

export function validateFlightPlan(
  proposed: ProposedPlan,
  ctx: FlightPlanContext,
): { ok: true; plan: FlightPlan } | { ok: false; rejection: PlanRejection } {
  if (proposed.targets.length === 0) {
    return { ok: false, rejection: { reason: "NO_TARGETS", detail: "no target resolved" } }
  }
  const targets = dedupe(proposed.targets)
  for (const target of targets) {
    if (target.kind === "phase") {
      return {
        ok: false,
        rejection: { reason: "UNSUPPORTED_TARGET_KIND", detail: `${target.kind}:${target.id}` },
      }
    }
    if (!exists(target, ctx.graph)) {
      return {
        ok: false,
        rejection: { reason: "TARGET_NOT_FOUND", detail: `${target.kind}:${target.id}` },
      }
    }
  }

  const excludedKeys = new Set(proposed.excluded.map(key))
  const steps: PlanStep[] = []
  const entityIds = new Set<string>()
  const openButNotRequired: Array<{ ref: EntityRef; label: string }> = []
  const permissionDenials: PermissionCheck[] = []
  const isBatch = targets.length > (ctx.batchThreshold ?? 1)
  const seen = new Set<string>()

  for (const target of targets) {
    // "Leave X open" on a target drops it from the plan entirely; the outcome reports it as cancelled.
    if (excludedKeys.has(key(target))) continue
    // A target the world has already completed needs no writes: the plan says so explicitly.
    if (isComplete(target, ctx.graph)) {
      steps.push(satisfiedStep(proposed.missionId, target, ctx.graph))
      continue
    }
    const closure = resolveClosure(
      target,
      ctx.graph,
      ctx.governance,
      excludedKeys,
      closureRulesFor(ctx.policies),
    )
    for (const id of closure.entityIds) entityIds.add(id)
    for (const task of closure.openButNotRequired) {
      openButNotRequired.push({ ref: { kind: "task", id: task.id }, label: task.name })
    }
    for (const required of closure.requiredTransitions) {
      const id = stepId(proposed.missionId, required.ref, required.to)
      if (seen.has(id)) continue
      seen.add(id)

      const action = permissionActionFor(required.ref, required.to)
      const permission = ctx.permissions.check(proposed.actor, action, required.ref, ctx.graph)
      if (!permission.allowed) permissionDenials.push(permission)

      const actionClass = classify(required.ref, required.to)
      steps.push({
        id,
        ref: required.ref,
        label: labelOf(required.ref, ctx.graph),
        transition: required.to,
        forTarget: target,
        actionClass,
        status: permission.allowed ? "pending" : "permission_denied",
        verification: "UNVERIFIED",
        failureClass: null,
        retries: 0,
        observedVersion: versionOf(required.ref, ctx.graph),
        blockers: [],
        note: null,
        before: null,
        reverts: null,
      })
    }
  }

  const plan: FlightPlan = {
    [flightPlanBrand]: true,
    missionId: proposed.missionId,
    steps,
    entityIds,
    openButNotRequired,
    permissionDenials,
    requiresPlanConfirmation:
      isBatch && steps.some((s) => s.status === "pending" && s.actionClass === "HIGH_IMPACT"),
  }
  return { ok: true, plan }
}

export function closureRulesFor(policies: readonly Policy[] | undefined): ClosureRules {
  if (!policies) return ALL_CLOSURE_RULES
  const ids = new Set(policies.map((p) => p.id))
  return {
    milestones: ids.has("P1_PROJECT_MILESTONES"),
    subtasks: ids.has("P2_MILESTONE_SUBTASKS"),
    predecessors: ids.has("P3_TASK_PREDECESSORS"),
    timeLogged: ids.has("P4_TASK_TIME"),
  }
}

/**
 * Undo (D-30): the reverse of a landed mission is itself a mission. Every step reverses one
 * verified write of the source, in reverse order, restoring exactly the status that step recorded
 * before it wrote. Same permission, governance, write and verify loop; nothing is guessed.
 */
export function validateUndoPlan(
  source: Mission,
  undoMissionId: string,
  actor: Actor,
  ctx: FlightPlanContext,
): { ok: true; plan: FlightPlan } | { ok: false; rejection: PlanRejection } {
  const done = source.plan.filter(
    (s) =>
      s.status === "succeeded" && (s.transition === "COMPLETED" || s.transition === "TIME_LOGGED"),
  )
  if (done.length === 0) {
    return { ok: false, rejection: { reason: "NOTHING_TO_UNDO", detail: source.id } }
  }
  const unknown = done.find((s) => s.transition === "COMPLETED" && s.before === null)
  if (unknown) {
    return { ok: false, rejection: { reason: "NO_PRIOR_STATE", detail: `${key(unknown.ref)}` } }
  }
  const steps: PlanStep[] = []
  const entityIds = new Set<string>()
  const permissionDenials: PermissionCheck[] = []
  for (const s of [...done].reverse()) {
    const transition = s.transition === "COMPLETED" ? "REVERTED" : "TIME_REMOVED"
    const permission = ctx.permissions.check(
      actor,
      permissionActionFor(s.ref, transition),
      s.ref,
      ctx.graph,
    )
    if (!permission.allowed) permissionDenials.push(permission)
    entityIds.add(key(s.ref))
    steps.push({
      id: stepId(undoMissionId, s.ref, transition),
      ref: s.ref,
      label: labelOf(s.ref, ctx.graph),
      transition,
      forTarget: s.forTarget,
      actionClass: classify(s.ref, transition),
      status: permission.allowed ? "pending" : "permission_denied",
      verification: "UNVERIFIED",
      failureClass: null,
      retries: 0,
      observedVersion: versionOf(s.ref, ctx.graph),
      blockers: [],
      note: null,
      before: s.before,
      reverts: s.id,
    })
  }
  return {
    ok: true,
    plan: {
      [flightPlanBrand]: true,
      missionId: undoMissionId,
      steps,
      entityIds,
      openButNotRequired: [],
      permissionDenials,
      requiresPlanConfirmation: false,
    },
  }
}

function classify(ref: EntityRef, transition: PlanStep["transition"]): ActionClass {
  if (transition === "TIME_LOGGED") return "DECISION_REQUIRED"
  if (transition === "TIME_REMOVED") return "SAFE_WRITE"
  if (ref.kind === "project") {
    // A-05: completing a project is high impact; completing one with no tasks on record even more so.
    return "HIGH_IMPACT"
  }
  return "SAFE_WRITE"
}

function permissionActionFor(ref: EntityRef, transition: PlanStep["transition"]): PermissionAction {
  if (transition === "TIME_LOGGED") return "log_time"
  if (transition === "TIME_REMOVED") return "remove_time"
  if (transition === "REVERTED") return "revert_completion"
  return ref.kind === "project" ? "complete_project" : "complete_task"
}

function satisfiedStep(missionId: string, target: EntityRef, graph: WorkspaceGraph): PlanStep {
  return {
    id: stepId(missionId, target, "COMPLETED"),
    ref: target,
    label: labelOf(target, graph),
    transition: "COMPLETED",
    forTarget: target,
    actionClass: classify(target, "COMPLETED"),
    status: "already_complete",
    verification: "VERIFIED",
    failureClass: null,
    retries: 0,
    observedVersion: versionOf(target, graph),
    blockers: [],
    note: null,
    before: null,
    reverts: null,
  }
}

function isComplete(ref: EntityRef, graph: WorkspaceGraph): boolean {
  switch (ref.kind) {
    case "project":
      return graph.project(ref.id)?.status === "COMPLETED"
    case "task": {
      const task = graph.task(ref.id)
      return task !== null && isTaskComplete(task.status)
    }
    case "phase":
      return false
  }
}

function dedupe(refs: readonly EntityRef[]): readonly EntityRef[] {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const k = key(ref)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function exists(ref: EntityRef, graph: WorkspaceGraph): boolean {
  switch (ref.kind) {
    case "project":
      return graph.project(ref.id) !== null
    case "task":
      return graph.task(ref.id) !== null
    case "phase":
      return graph.phase(ref.id) !== null
  }
}

function versionOf(ref: EntityRef, graph: WorkspaceGraph): number | null {
  switch (ref.kind) {
    case "project":
      return graph.project(ref.id)?.version ?? null
    case "task":
      return graph.task(ref.id)?.version ?? null
    case "phase":
      return graph.phase(ref.id)?.version ?? null
  }
}

function key(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`
}
