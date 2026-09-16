import {
  type ActivityItem,
  entity,
  type Inline,
  plural,
  text,
} from "@/core/agent/conversation/blocks"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef } from "@/core/domain/ids"
import type { Mission } from "@/core/mission/mission"
import { labelOf } from "@/core/resolver/target"
import type { AgentEvent, AgentEventType } from "@/core/telemetry/events"

/**
 * Observable work, from the audit log (spec §26, §36). Every item is a real event translated into
 * one short label with a semantic icon; nothing is simulated and nothing is chain-of-thought.
 *
 * A phase is the work between two human boundaries (an input, an approval, a decline, a replan).
 * The current phase renders expanded; earlier phases collapse to one sentence, so the mission is
 * live while it runs and a clean conversation afterwards.
 */

/** The supplied policies, as a person would read them. */
const POLICY_EVIDENCE: Record<string, string> = {
  P1_PROJECT_MILESTONES:
    "Policy 1 · a project cannot be marked completed unless all its milestone tasks are completed",
  P2_MILESTONE_SUBTASKS:
    "Policy 2 · a milestone task cannot be marked completed if it has open subtasks",
  P3_TASK_PREDECESSORS:
    "Policy 3 · a task cannot be marked completed if a predecessor is not yet completed",
  P4_TASK_TIME:
    "Policy 4 · a task cannot be marked completed if no time has been logged against it",
}
const POLICY_ORDER = [
  "P1_PROJECT_MILESTONES",
  "P2_MILESTONE_SUBTASKS",
  "P3_TASK_PREDECESSORS",
  "P4_TASK_TIME",
] as const

/** One evidence line per policy in the brief: what it says and how it came out for this target. */
function policyEvidence(matched: ReadonlySet<string>, failed: ReadonlySet<string>): string[] {
  return POLICY_ORDER.map((id) => {
    const rule = POLICY_EVIDENCE[id] ?? id
    if (failed.has(id)) return `${rule} · not passed`
    if (matched.has(id)) return `${rule} · passed`
    return `${rule} · not triggered by this action`
  })
}
const MATCHED = "__matched"
const FAILED = "__failed"
const matchedOf = (item: ActivityItem): ReadonlySet<string> =>
  new Set((item as { [MATCHED]?: readonly string[] })[MATCHED] ?? [])
const failedOf = (item: ActivityItem): ReadonlySet<string> =>
  new Set((item as { [FAILED]?: readonly string[] })[FAILED] ?? [])

export type ActivityPhase = {
  readonly index: number
  /** Index in the event log where the phase starts (a boundary event, or 0). */
  readonly startIndex: number
  readonly items: readonly ActivityItem[]
  readonly summary: readonly Inline[]
}

const BOUNDARY: ReadonlySet<AgentEventType> = new Set([
  "INPUT_RECEIVED",
  "ACTION_APPROVED",
  "ACTION_DECLINED",
  "MISSION_REPLANNED",
  "MISSION_PAUSED",
  "MISSION_RESUMED",
])

export function activityPhases(
  mission: Mission,
  graph: WorkspaceGraph,
  events: readonly AgentEvent[],
): ActivityPhase[] {
  const phases: ActivityPhase[] = []
  let items: ActivityItem[] = []
  let startIndex = 0
  let index = 0
  const close = () => {
    if (items.length > 0) phases.push({ index, startIndex, items, summary: summarize(items) })
    index += 1
    items = []
  }
  events.forEach((event, i) => {
    if (BOUNDARY.has(event.type) && i > 0) {
      close()
      startIndex = i
    }
    const item = itemFor(event, mission, graph, items, phases.length)
    if (item) items.push(item)
  })
  close()
  return phases
}

function itemFor(
  event: AgentEvent,
  mission: Mission,
  graph: WorkspaceGraph,
  soFar: readonly ActivityItem[],
  phaseIndex: number,
): ActivityItem | null {
  const target = mission.targets[0]
  const batch = mission.targets.length > 1
  switch (event.type) {
    case "MISSION_STARTED":
      if (batch) {
        return {
          icon: "project",
          label: `Checking ${mission.targets.length} ${plural(mission.targets.length, "project")}`,
          detail: null,
          evidence: mission.targets.map((t) => labelOf(t, graph)),
        }
      }
      return target
        ? {
            icon: target.kind === "project" ? "project" : "task",
            label: target.kind === "project" ? "Checking project" : "Checking task",
            detail: [entity(target, labelOf(target, graph))],
          }
        : null
    case "PLAN_CREATED": {
      if (batch || !target || target.kind !== "project") return null
      const milestoneTasks = graph.milestonesOf(target.id)
      const milestones = milestoneTasks.length
      return {
        icon: "milestone",
        label: "Checking milestones",
        detail: [text(`${milestones} ${plural(milestones, "milestone")}`)],
        evidence: milestoneTasks.map(
          (t) => `${t.name} · ${t.status.toLowerCase().replace("_", " ")}`,
        ),
      }
    }
    case "POLICY_CHECKED": {
      if (event.detail["phase"] === "plan") {
        const checked = typeof event.detail["checked"] === "number" ? event.detail["checked"] : 4
        const policies =
          typeof event.detail["policies"] === "string"
            ? event.detail["policies"]
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean)
            : []
        // One line per phase, however many targets were consulted: later checks fold into the
        // same line so the evidence stays complete (all four policies, each with its result).
        const existing = soFar.find((i) => i.icon === "policy")
        if (existing) {
          const matched = new Set([...matchedOf(existing), ...policies])
          Object.assign(existing, {
            [MATCHED]: [...matched],
            evidence: policyEvidence(matched, failedOf(existing)),
          })
          return null
        }
        const matched = new Set(policies)
        return {
          icon: "policy",
          label: "Checking governance",
          detail: [text(`${checked} ${plural(checked, "policy", "policies")} checked`)],
          evidence: policyEvidence(matched, new Set()),
          [MATCHED]: [...matched],
        } as ActivityItem
      }
      // Execution-time checks after a human boundary: the plan is being revalidated.
      if (phaseIndex > 0 && !soFar.some((i) => i.icon === "refresh")) {
        return { icon: "refresh", label: "Rechecking dependencies", detail: null }
      }
      return null
    }
    case "DEPENDENCY_FOUND": {
      // The policy that produced a blocker did not pass: reflect it on the governance line.
      const policyItem = soFar.find((i) => i.icon === "policy")
      const failedPolicy =
        typeof event.detail["policy"] === "string" ? event.detail["policy"] : null
      if (policyItem && failedPolicy && failedPolicy !== "DATA") {
        const failed = new Set([...failedOf(policyItem), failedPolicy])
        Object.assign(policyItem, {
          [FAILED]: [...failed],
          evidence: policyEvidence(matchedOf(policyItem), failed),
        })
      }
      // One line per phase: the deepest path, target excluded.
      const path = event.refs.slice(1)
      if (path.length === 0) return null
      const existing = soFar.find((i) => i.icon === "dependency")
      const detail: Inline[] = []
      path.forEach((ref: EntityRef, i) => {
        if (i > 0) detail.push(text(" → "))
        detail.push(entity(ref, labelOf(ref, graph)))
      })
      if (existing) {
        const existingDepth = existing.detail
          ? existing.detail.filter((d) => d.kind === "entity").length
          : 0
        if (path.length <= existingDepth) return null
        // Replace in place: the caller pushes; we mutate the found item instead.
        Object.assign(existing, { detail })
        return null
      }
      return { icon: "dependency", label: "Tracing dependencies", detail }
    }
    case "ACTION_STARTED": {
      const ref = event.refs[0]
      if (event.detail["command"] === "add_time_entry") {
        const hours = event.detail["hours"]
        return {
          icon: "time",
          label: "Logging time",
          detail: typeof hours === "number" ? [text(`${hours}h`)] : null,
        }
      }
      if (event.detail["command"] === "complete_project" && ref) {
        return {
          icon: "project",
          label: "Verifying project",
          detail: [entity(ref, labelOf(ref, graph))],
        }
      }
      return null
    }
    case "ACTION_COMPLETED": {
      const ref = event.refs[0]
      if (!ref) return null
      if (event.detail["result"] === "add_time_entry") {
        return { icon: "check", label: "Time verified", detail: [entity(ref, labelOf(ref, graph))] }
      }
      if (event.detail["result"] === "complete_task") {
        return { icon: "check", label: labelOf(ref, graph), detail: [text("Verified")] }
      }
      return null
    }
    case "ACTION_SKIPPED": {
      const ref = event.refs[0]
      if (!ref) return null
      return { icon: "check", label: labelOf(ref, graph), detail: [text("Already complete")] }
    }
    default:
      return null
  }
}

/** One past-tense sentence for a finished phase. */
function summarize(items: readonly ActivityItem[]): Inline[] {
  const parts: string[] = []
  const has = (icon: ActivityItem["icon"], label?: string) =>
    items.some((i) => i.icon === icon && (label === undefined || i.label === label))
  if (has("project", "Checking project")) parts.push("checked the project")
  if (has("task", "Checking task")) parts.push("checked the task")
  if (items.some((i) => i.label.startsWith("Checking ") && i.label.endsWith("projects")))
    parts.push("checked the projects")
  if (has("milestone")) parts.push("checked milestones")
  if (has("policy")) parts.push("checked governance")
  if (has("dependency")) parts.push("traced dependencies")
  if (has("time")) parts.push("logged time")
  if (has("refresh")) parts.push("rechecked dependencies")
  const verified = items.filter((i) => i.icon === "check" && i.label !== "Time verified").length
  if (verified > 0) parts.push(`verified ${verified} ${plural(verified, "update")}`)
  if (has("project", "Verifying project")) parts.push("verified the project")
  if (parts.length === 0) parts.push(`${items.length} ${plural(items.length, "step")}`)
  const sentence =
    parts.length === 1
      ? parts[0]!
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
  return [text(sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".")]
}
