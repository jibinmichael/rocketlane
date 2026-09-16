import type { Task } from "@/core/domain/entities"
import { hoursTracked } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef, TaskId } from "@/core/domain/ids"
import { isTaskComplete, isTaskOpen } from "@/core/domain/status"
import { DEFAULT_GOVERNANCE_CONFIG, evaluateGovernance } from "@/core/governance/engine"
import type { GovernanceConfig, PolicyId, ReasonCode } from "@/core/governance/policy"

/**
 * Dependency resolution (spec §6, §8B, §33). Traverses the actual relationships in the data.
 * Produces structured Blockers with the shortest useful path; the full closure stays available.
 */

export type RequiredChange =
  | { readonly kind: "complete_task"; readonly taskId: TaskId }
  | { readonly kind: "log_time"; readonly taskId: TaskId }
  | { readonly kind: "unblock_task"; readonly taskId: TaskId }
  | { readonly kind: "fix_data"; readonly taskId: TaskId; readonly flag: string }

export type Blocker = {
  readonly target: EntityRef
  readonly policyId: PolicyId | "DATA"
  readonly reasonCode: ReasonCode
  /** The node the user must act on first (nearest actionable). */
  readonly actionable: EntityRef
  /** From the mission target down to the actionable node, inclusive. */
  readonly dependencyPath: readonly EntityRef[]
  readonly requiredChange: RequiredChange
  /** True when the system can perform the change itself once preconditions hold; false when a human input is needed. */
  readonly systemCanAct: boolean
}

export type RequiredTransition = {
  readonly ref: EntityRef
  readonly to: "COMPLETED" | "TIME_LOGGED"
}

export type ClosureResult = {
  /** Ordered so that every entry's own requirements appear before it (execution order). */
  readonly requiredTransitions: readonly RequiredTransition[]
  readonly blockers: readonly Blocker[]
  readonly entityIds: ReadonlySet<string>
  /** Open tasks in scope that are not required by any policy (consequence, D-07). */
  readonly openButNotRequired: readonly Task[]
}

/**
 * Compute everything needed to complete `target`: required transitions in dependency order and the
 * current blockers with their shortest useful path.
 */
/** Which requirements the closure derives. Each maps to one supplied policy; the engine's policy set decides. */
export type ClosureRules = {
  readonly milestones: boolean
  readonly subtasks: boolean
  readonly predecessors: boolean
  readonly timeLogged: boolean
}

export const ALL_CLOSURE_RULES: ClosureRules = {
  milestones: true,
  subtasks: true,
  predecessors: true,
  timeLogged: true,
}

export function resolveClosure(
  target: EntityRef,
  graph: WorkspaceGraph,
  config: GovernanceConfig = DEFAULT_GOVERNANCE_CONFIG,
  excluded: ReadonlySet<string> = new Set(),
  rules: ClosureRules = ALL_CLOSURE_RULES,
): ClosureResult {
  const required: RequiredTransition[] = []
  const blockers: Blocker[] = []
  const entityIds = new Set<string>()
  const visited = new Set<TaskId>()

  const visitTask = (task: Task, path: readonly EntityRef[]): void => {
    if (visited.has(task.id)) return
    // A user exclusion ("leave Go-Live open") prunes that node and everything that exists only for it.
    if (excluded.has(`task:${task.id}`)) return
    visited.add(task.id)
    entityIds.add(task.id)
    const here: EntityRef = { kind: "task", id: task.id }
    const pathHere = [...path, here]
    if (isTaskComplete(task.status)) return

    for (const flag of task.flags) {
      blockers.push({
        target: path[0] ?? here,
        policyId: "DATA",
        reasonCode: "DATA_FLAGGED",
        actionable: here,
        dependencyPath: pathHere,
        requiredChange: { kind: "fix_data", taskId: task.id, flag },
        systemCanAct: false,
      })
    }

    // Predecessors first (policy 3), then subtasks of milestones (policy 2), then time (policy 4).
    if (rules.predecessors) {
      for (const predecessor of graph.predecessorsOf(task.id)) visitTask(predecessor, pathHere)
    }
    if (task.isMilestone && rules.subtasks) {
      for (const subtask of graph.subtasksOf(task.id)) {
        if (isTaskOpen(subtask.status, config.interpretation)) visitTask(subtask, pathHere)
      }
    }
    if (rules.timeLogged && hoursTracked(task) <= config.minimumHours) {
      required.push({ ref: here, to: "TIME_LOGGED" })
    }
    if (task.status === "BLOCKED") {
      blockers.push({
        target: path[0] ?? here,
        policyId: "DATA",
        reasonCode: "DATA_FLAGGED",
        actionable: here,
        dependencyPath: pathHere,
        requiredChange: { kind: "unblock_task", taskId: task.id },
        systemCanAct: false,
      })
    }
    required.push({ ref: here, to: "COMPLETED" })
  }

  if (target.kind === "project") {
    entityIds.add(target.id)
    const project = graph.project(target.id)
    if (project && project.status !== "COMPLETED") {
      if (rules.milestones) {
        for (const milestone of graph.milestonesOf(target.id)) visitTask(milestone, [target])
      }
      required.push({ ref: target, to: "COMPLETED" })
    }
  } else if (target.kind === "task") {
    const task = graph.task(target.id)
    if (task) visitTask(task, [])
  }

  // Current blockers derive from governance on the target as it stands now, walked to the nearest actionable node.
  const currentBlockers = traceCurrentBlockers(target, graph, config)
  for (const b of currentBlockers) blockers.push(b)

  const openButNotRequired =
    target.kind === "project"
      ? graph
          .tasksOf(target.id)
          .filter((t) => isTaskOpen(t.status, config.interpretation) && !visited.has(t.id))
      : []

  return {
    requiredTransitions: required,
    blockers: dedupe(blockers),
    entityIds,
    openButNotRequired,
  }
}

/**
 * Walk from the target through failing policy evidence until reaching a node the user can act on.
 * The path returned is the shortest useful path (spec §6): first blocker at each level, depth-first.
 */
export function traceCurrentBlockers(
  target: EntityRef,
  graph: WorkspaceGraph,
  config: GovernanceConfig = DEFAULT_GOVERNANCE_CONFIG,
): readonly Blocker[] {
  const result: Blocker[] = []
  const seen = new Set<string>()

  const walk = (ref: EntityRef, path: readonly EntityRef[]): void => {
    const key = `${ref.kind}:${ref.id}`
    if (seen.has(key)) return
    seen.add(key)
    const pathHere = [...path, ref]
    if (ref.kind === "task") {
      const task = graph.task(ref.id)
      if (!task || isTaskComplete(task.status)) return
    }
    const decision = evaluateGovernance(graph, { target: ref, to: "COMPLETED" }, { config })
    if (decision.allowed) {
      if (ref.kind === "task" && path.length > 0) {
        // Reached an actionable, completable node below the target.
        result.push({
          target: path[0]!,
          policyId: blockingPolicyFor(path, graph, config),
          reasonCode: "PREDECESSORS_INCOMPLETE",
          actionable: ref,
          dependencyPath: pathHere,
          requiredChange: { kind: "complete_task", taskId: ref.id },
          systemCanAct: true,
        })
      }
      return
    }
    for (const flag of decision.dataFlags) {
      result.push({
        target: path[0] ?? ref,
        policyId: "DATA",
        reasonCode: "DATA_FLAGGED",
        actionable: ref,
        dependencyPath: pathHere,
        requiredChange: { kind: "fix_data", taskId: flag.taskId, flag: flag.flag },
        systemCanAct: false,
      })
    }
    for (const evaluation of decision.evaluations) {
      if (evaluation.allowed || !evaluation.triggerMatched) continue
      if (evaluation.policyId === "P4_TASK_TIME" && ref.kind === "task") {
        result.push({
          target: path[0] ?? ref,
          policyId: "P4_TASK_TIME",
          reasonCode: "NO_TIME_LOGGED",
          actionable: ref,
          dependencyPath: pathHere,
          requiredChange: { kind: "log_time", taskId: ref.id },
          systemCanAct: false,
        })
        continue
      }
      for (const evidence of evaluation.evidence) walk(evidence.ref, pathHere)
    }
  }

  walk(target, [])
  return dedupe(result)
}

function blockingPolicyFor(
  path: readonly EntityRef[],
  graph: WorkspaceGraph,
  config: GovernanceConfig,
): PolicyId {
  const parent = path[path.length - 1]
  if (!parent) return "P3_TASK_PREDECESSORS"
  const decision = evaluateGovernance(graph, { target: parent, to: "COMPLETED" }, { config })
  const failing = decision.evaluations.find((e) => e.triggerMatched && !e.allowed)
  return failing?.policyId ?? "P3_TASK_PREDECESSORS"
}

function dedupe(blockers: readonly Blocker[]): readonly Blocker[] {
  const seen = new Set<string>()
  const result: Blocker[] = []
  for (const b of blockers) {
    const key = `${b.actionable.kind}:${b.actionable.id}:${b.requiredChange.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(b)
  }
  return result
}

/** The first blocker whose required change can be acted on now — the "shortest useful path". */
export function nextActionable(blockers: readonly Blocker[]): Blocker | null {
  const ordered = [...blockers].sort((a, b) => b.dependencyPath.length - a.dependencyPath.length)
  return ordered[0] ?? null
}
