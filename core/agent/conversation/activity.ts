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
      const milestones = graph.milestonesOf(target.id).length
      return {
        icon: "milestone",
        label: "Checking milestones",
        detail: [text(`${milestones} ${plural(milestones, "milestone")}`)],
      }
    }
    case "POLICY_CHECKED": {
      if (event.detail["phase"] === "plan") {
        // One line per phase, however many targets were consulted.
        if (soFar.some((i) => i.icon === "policy")) return null
        const checked = typeof event.detail["checked"] === "number" ? event.detail["checked"] : null
        return {
          icon: "policy",
          label: "Checking governance",
          detail:
            checked !== null
              ? [text(`${checked} ${plural(checked, "policy", "policies")} checked`)]
              : null,
        }
      }
      // Execution-time checks after a human boundary: the plan is being revalidated.
      if (phaseIndex > 0 && !soFar.some((i) => i.icon === "refresh")) {
        return { icon: "refresh", label: "Rechecking dependencies", detail: null }
      }
      return null
    }
    case "DEPENDENCY_FOUND": {
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
