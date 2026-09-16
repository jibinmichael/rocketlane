import type { Actor } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef } from "@/core/domain/ids"
import type { GovernanceConfig, Policy } from "@/core/governance/policy"
import type {
  PermissionAction,
  PermissionCheck,
  PermissionEvaluator,
} from "@/core/governance/permissions"
import { fnv1a } from "@/core/ingestion/hash"
import type { ActionClass, PlanStep } from "@/core/mission/mission"
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
  readonly reason: "NO_TARGETS" | "TARGET_NOT_FOUND"
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
  for (const target of proposed.targets) {
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
  const isBatch = proposed.targets.length > (ctx.batchThreshold ?? 1)
  const seen = new Set<string>()

  for (const target of proposed.targets) {
    // "Leave X open" on a target drops it from the plan entirely; the outcome reports it as cancelled.
    if (excludedKeys.has(key(target))) continue
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
        note: permission.allowed ? null : permission.reason,
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
    requiresPlanConfirmation: isBatch && steps.some((s) => s.actionClass === "HIGH_IMPACT"),
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

function classify(ref: EntityRef, transition: PlanStep["transition"]): ActionClass {
  if (transition === "TIME_LOGGED") return "DECISION_REQUIRED"
  if (ref.kind === "project") {
    // A-05: completing a project is high impact; completing one with no tasks on record even more so.
    return "HIGH_IMPACT"
  }
  return "SAFE_WRITE"
}

function permissionActionFor(ref: EntityRef, transition: PlanStep["transition"]): PermissionAction {
  if (transition === "TIME_LOGGED") return "log_time"
  return ref.kind === "project" ? "complete_project" : "complete_task"
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
