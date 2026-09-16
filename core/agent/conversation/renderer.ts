import {
  type Block,
  type BlockAction,
  count,
  entity,
  type Inline,
  type PathNode,
  plural,
  policy,
  text,
  time,
} from "@/core/agent/conversation/blocks"
import type { Intent } from "@/core/agent/intent/intent"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef } from "@/core/domain/ids"
import { isTaskComplete } from "@/core/domain/status"
import type { PolicyId, ReasonCode } from "@/core/governance/policy"
import type { Mission, PlanStep } from "@/core/mission/mission"
import { type Blocker, nextActionable } from "@/core/resolver/blockers"
import { labelOf } from "@/core/resolver/target"
import type { AgentEvent } from "@/core/telemetry/events"

/**
 * Mission state → blocks (D-11). No free-form prose; every sentence is a template over structured
 * fields. Progressive disclosure order (spec §7): outcome → blocker → why → path → action → result
 * → what remains.
 */

const POLICY_LABEL: Record<PolicyId | "DATA", string> = {
  P1_PROJECT_MILESTONES: "Policy 1",
  P2_MILESTONE_SUBTASKS: "Policy 2",
  P3_TASK_PREDECESSORS: "Policy 3",
  P4_TASK_TIME: "Policy 4",
  DATA: "Data",
}

const REASON_PHRASE: Record<ReasonCode, string> = {
  MILESTONES_INCOMPLETE: "not all milestones are complete",
  SUBTASKS_OPEN: "it has open subtasks",
  PREDECESSORS_INCOMPLETE: "a predecessor is incomplete",
  NO_TIME_LOGGED: "no time is logged",
  DATA_FLAGGED: "its dependency data needs fixing",
  OK: "",
}

type Ctx = { mission: Mission; graph: WorkspaceGraph; events: readonly AgentEvent[] }

export function renderMission(
  mission: Mission,
  graph: WorkspaceGraph,
  events: readonly AgentEvent[] = [],
): Block[] {
  const ctx: Ctx = { mission, graph, events }
  const blocks: Block[] = []
  const isBatch = mission.targets.length > 1

  if (isBatch) {
    blocks.push(...renderBatch(ctx))
    return blocks
  }

  const target = mission.targets[0]
  if (!target) return blocks
  const targetLabel = mission.targetLabels[0] ?? labelOf(target, graph)
  const writes = mission.plan.filter((s) => s.transition === "COMPLETED")

  // 1. Outcome
  if (mission.state === "FAILED" && mission.plan.length === 0) {
    blocks.push(block("boundary", "error", [[text("I couldn't act on that target.")]]))
    return blocks
  }
  if (writes.length === 0 && mission.state === "COMPLETED") {
    blocks.push(
      block("already_complete", "neutral", [
        [entity(target, targetLabel), text(" is already complete. Nothing to do.")],
      ]),
    )
    return blocks
  }
  const initialBlocked =
    mission.plan.some((s) => s.transition === "TIME_LOGGED") || mission.blockers.length > 0
  if (initialBlocked && !mission.landedAt) {
    blocks.push(
      block("outcome.blocked", "blocked", [
        [text("I can't complete "), entity(target, targetLabel), text(" yet.")],
      ]),
    )
  } else if (!mission.landedAt) {
    blocks.push(
      block("outcome.ready", "neutral", [
        [
          entity(target, targetLabel),
          text(` can be completed. `),
          count(writes.length),
          text(` ${plural(writes.length, "update")} required.`),
        ],
      ]),
    )
  }

  // 2–4. Current blocker, why, shortest path (only while something is still open)
  const current = nextActionable(mission.blockers)
  if (current && !mission.landedAt && mission.state !== "CANCELLED") {
    blocks.push(...renderBlockerChain(ctx, current))
  }

  // 5. Results so far (verified writes, reconciliations, mismatches), in plan order
  for (const step of mission.plan) blocks.push(...renderStepResult(ctx, step))

  // 6. State changes (course correction)
  for (const notice of mission.stateChanges) {
    const affectedSteps = mission.plan.filter((s) => notice.affectedStepIds.includes(s.id))
    const seenRefs = new Set<string>()
    const affected = affectedSteps.filter((s) => {
      const key = `${s.ref.kind}:${s.ref.id}`
      if (seenRefs.has(key)) return false
      seenRefs.add(key)
      return true
    })
    blocks.push(
      block(
        "state_change",
        "paused",
        [
          [
            entity(target, targetLabel),
            text(" changed while I was working. I paused before the next update."),
          ],
          [
            text("What changed: "),
            entity(notice.ref, labelOf(notice.ref, graph)),
            text(` ${notice.summary} by ${actorName(graph, notice.actorId)} at `),
            time(notice.at),
            text("."),
          ],
          affected.length > 0
            ? [
                text("What it affects: "),
                ...joinEntities(affected.map((s) => [s.ref, s.label] as const)),
                text("."),
              ]
            : [text("What it affects: nothing still planned.")],
        ],
        mission.state === "STALE"
          ? [
              { kind: "continue", label: "Continue" },
              { kind: "cancel", label: "Stop" },
            ]
          : [],
      ),
    )
    if (mission.state !== "STALE" && notice.replan) {
      blocks.push(
        block("replanned", "neutral", [
          [
            text("Replanned. "),
            count(notice.replan.kept),
            text(` of `),
            count(notice.replan.planned),
            text(" updates still apply."),
          ],
        ]),
      )
    }
  }

  // 7. Pending decision
  blocks.push(...renderPending(ctx, target))

  // 8. Terminal
  blocks.push(...renderTerminal(ctx, target, targetLabel))
  return blocks
}

function renderBlockerChain(ctx: Ctx, current: Blocker): Block[] {
  const { graph, mission } = ctx
  const blocks: Block[] = []
  const path = current.dependencyPath
  // Each hop explains why the node above cannot complete, from the target down to the actionable node.
  const lines: Inline[][] = []
  for (let i = 1; i < path.length; i += 1) {
    const above = path[i - 1]!
    const below = path[i]!
    if (above.kind === "project") {
      lines.push([
        entity(above, labelOf(above, graph)),
        text(" can't complete: milestone "),
        entity(below, labelOf(below, graph)),
        text(" is incomplete."),
        text(" "),
        policy("P1_PROJECT_MILESTONES", POLICY_LABEL.P1_PROJECT_MILESTONES),
      ])
    } else {
      const aboveTask = above.kind === "task" ? graph.task(above.id) : null
      const belowTask = below.kind === "task" ? graph.task(below.id) : null
      const isSubtask = belowTask?.parentTaskId === aboveTask?.id
      lines.push(
        isSubtask
          ? [
              entity(above, labelOf(above, graph)),
              text(" can't complete: subtask "),
              entity(below, labelOf(below, graph)),
              text(" is open."),
              text(" "),
              policy("P2_MILESTONE_SUBTASKS", POLICY_LABEL.P2_MILESTONE_SUBTASKS),
            ]
          : [
              entity(above, labelOf(above, graph)),
              text(" can't complete: predecessor "),
              entity(below, labelOf(below, graph)),
              text(" is incomplete."),
              text(" "),
              policy("P3_TASK_PREDECESSORS", POLICY_LABEL.P3_TASK_PREDECESSORS),
            ],
      )
    }
  }
  if (current.requiredChange.kind === "log_time") {
    lines.push([
      entity(current.actionable, labelOf(current.actionable, graph)),
      text(" can't complete: no time is logged."),
      text(" "),
      policy("P4_TASK_TIME", POLICY_LABEL.P4_TASK_TIME),
    ])
  }
  if (
    current.requiredChange.kind === "fix_data" ||
    current.requiredChange.kind === "unblock_task"
  ) {
    lines.push([
      entity(current.actionable, labelOf(current.actionable, graph)),
      text(` can't complete: ${REASON_PHRASE.DATA_FLAGGED}.`),
      text(" "),
      policy("DATA", "Data"),
    ])
  }
  if (lines.length === 0 && path.length > 0) {
    lines.push([
      entity(current.target, labelOf(current.target, graph)),
      text(` can't complete: ${REASON_PHRASE[current.reasonCode]}.`),
    ])
  }

  const pathNodes: PathNode[] = path.map((ref, i) => ({
    ref,
    label: labelOf(ref, graph),
    state:
      i === 0
        ? "target"
        : i === path.length - 1
          ? "actionable"
          : isComplete(ref, graph)
            ? "complete"
            : "open",
  }))
  blocks.push({ ...block("blocker", "blocked", lines), path: pathNodes })

  const remaining = mission.plan.filter(
    (s) =>
      s.transition === "COMPLETED" && (s.status === "pending" || s.status === "waiting_confirm"),
  ).length
  const first = firstActionLabel(current, graph)
  blocks.push(
    block("resolution_path", "neutral", [
      [
        count(remaining),
        text(` ${plural(remaining, "update")} to complete `),
        entity(current.target, labelOf(current.target, graph)),
        text(". First: "),
        ...first,
        text("."),
      ],
    ]),
  )
  return blocks
}

function firstActionLabel(blocker: Blocker, graph: WorkspaceGraph): Inline[] {
  const label = labelOf(blocker.actionable, graph)
  switch (blocker.requiredChange.kind) {
    case "log_time":
      return [text("log time on "), entity(blocker.actionable, label)]
    case "complete_task":
      return [text("complete "), entity(blocker.actionable, label)]
    case "unblock_task":
      return [text("unblock "), entity(blocker.actionable, label), text(" (outside my authority)")]
    case "fix_data":
      return [text("fix the dependency data on "), entity(blocker.actionable, label)]
  }
}

function renderStepResult(ctx: Ctx, step: PlanStep): Block[] {
  const { graph, events } = ctx
  const blocks: Block[] = []
  const reconciled = events.find(
    (e) => e.type === "WRITE_TIMEOUT_RECONCILED" && e.refs.some((r) => r.id === step.ref.id),
  )
  if (reconciled) {
    const applied = reconciled.detail["applied"] === true
    blocks.push(
      block("timeout_reconciled", "paused", [
        [
          text("The write to "),
          entity(step.ref, step.label),
          text(
            ` timed out. I re-read it: ${applied ? "it had applied" : "it had not applied"}.${applied ? "" : " Retrying once with the same request."}`,
          ),
        ],
      ]),
    )
  }
  if (step.transition !== "COMPLETED") {
    if (step.status === "succeeded") {
      blocks.push(
        block("result.verified", "success", [
          [text("Verified: time logged on "), entity(step.ref, step.label), text(".")],
        ]),
      )
    }
    return blocks
  }
  if (step.status === "succeeded") {
    const suffix =
      step.retries > 0
        ? ` ${step.retries} ${plural(step.retries, "retry", "retries")}, no duplicate write.`
        : ""
    blocks.push(
      block("result.verified", "success", [
        [text("Verified: "), entity(step.ref, step.label), text(` is Completed.${suffix}`)],
      ]),
    )
  } else if (step.status === "failed" && step.verification === "MISMATCH") {
    blocks.push(
      block("result.mismatch", "error", [
        [
          text("The update did not verify. "),
          entity(step.ref, step.label),
          text(` is still ${statusWord(step.ref, graph)}. I have not marked it complete.`),
        ],
      ]),
    )
  } else if (step.status === "failed") {
    blocks.push(
      block("result.mismatch", "error", [
        [
          entity(step.ref, step.label),
          text(
            ` could not be updated (${step.failureClass ?? "failure"}). State reconciled, not completed.`,
          ),
        ],
      ]),
    )
  } else if (step.status === "skipped" && step.note === "declined by user") {
    blocks.push(
      block("declined", "neutral", [
        [
          text("Not done. "),
          entity(step.ref, step.label),
          text(` stays ${statusWord(step.ref, graph)}. Nothing was written.`),
        ],
      ]),
    )
  }
  return blocks
}

function renderPending(ctx: Ctx, target: EntityRef): Block[] {
  const { mission, graph } = ctx
  const pending = mission.pending
  if (!pending) return []
  if (pending.kind === "input_hours") {
    const step = mission.plan.find((s) => s.id === pending.stepId)!
    return [
      block(
        "action_request.input",
        "waiting",
        [
          [
            text("I need hours for "),
            entity(step.ref, step.label),
            text(". I won't invent a time entry."),
          ],
        ],
        [{ kind: "log_time", stepId: step.id, label: "Log time" }],
      ),
    ]
  }
  if (pending.kind === "confirm_step") {
    const step = mission.plan.find((s) => s.id === pending.stepId)!
    const milestones = target.kind === "project" ? graph.milestonesOf(target.id) : []
    const done = milestones.filter((m) => isTaskComplete(m.status)).length
    const open = mission.openButNotRequired.length
    const lines: Inline[][] = [
      [
        text("Complete "),
        entity(step.ref, step.label),
        text("? "),
        count(done),
        text(` of `),
        count(milestones.length),
        text(` ${plural(milestones.length, "milestone")} complete.`),
      ],
    ]
    if (open > 0) {
      lines.push([
        count(open),
        text(
          ` ${plural(open, "task")} ${open === 1 ? "remains" : "remain"} open. This does not block completion under current policies.`,
        ),
      ])
    }
    lines.push([text("Status → Completed.")])
    return [
      {
        ...block("action_request.confirm", "waiting", lines, [
          {
            kind: "approve",
            stepId: step.id,
            label: step.ref.kind === "project" ? "Complete project" : "Complete",
            impact: "high",
          },
          { kind: "decline", stepId: step.id, label: "Not now" },
        ]),
        detail: open > 0 ? mission.openButNotRequired.map((t) => [entity(t.ref, t.label)]) : null,
      },
    ]
  }
  return []
}

function renderTerminal(ctx: Ctx, target: EntityRef, targetLabel: string): Block[] {
  const { mission, graph } = ctx
  switch (mission.state) {
    case "COMPLETED":
      return [
        block(
          "landing",
          "success",
          [
            [
              entity(target, targetLabel),
              text(" completed. Verified at "),
              time(mission.landedAt ?? mission.updatedAt),
              text("."),
            ],
          ],
          [{ kind: "view_activity", label: "View activity" }],
        ),
      ]
    case "CANCELLED": {
      const written = mission.plan.filter((s) => s.status === "succeeded").length
      return [
        block("cancelled", "paused", [
          [
            text("Stopped. "),
            count(written),
            text(
              ` ${plural(written, "update")} completed before you cancelled; nothing further was written.`,
            ),
          ],
        ]),
      ]
    }
    case "PERMISSION_DENIED": {
      const denied = mission.plan.find((s) => s.status === "permission_denied")
      const project =
        target.kind === "project"
          ? graph.project(target.id)
          : denied
            ? graph.project(graph.task(denied.ref.id as never)?.projectId as never)
            : null
      const owner = project?.ownerName ?? "the project owner"
      return [
        block(
          "permission_denied",
          "blocked",
          [
            [
              text("Only the project owner can complete "),
              entity(target, targetLabel),
              text(`. ${owner} owns it.`),
            ],
          ],
          project?.ownerName
            ? [
                {
                  kind: "ask_owner",
                  ownerName: project.ownerName,
                  label: `Ask ${project.ownerName} to complete`,
                },
              ]
            : [],
        ),
      ]
    }
    case "BLOCKED": {
      const declined = mission.plan.some((s) => s.note === "declined by user")
      if (declined) return []
      const blocker = nextActionable(mission.blockers)
      if (!blocker)
        return [
          block("outcome.blocked", "blocked", [
            [
              entity(target, targetLabel),
              text(" stays open. I can't complete it under current policies."),
            ],
          ]),
        ]
      return []
    }
    default:
      return []
  }
}

function renderBatch(ctx: Ctx): Block[] {
  const { mission, graph } = ctx
  const blocks: Block[] = []
  const writes = mission.plan.filter((s) => s.transition === "COMPLETED")
  const projects = mission.targets.length

  if (mission.pending?.kind === "confirm_plan") {
    blocks.push({
      ...block(
        "action_request.batch_confirm",
        "waiting",
        [
          [
            count(writes.length),
            text(` ${plural(writes.length, "update")} across `),
            count(projects),
            text(
              ` ${plural(projects, "project")}. Project completions are high impact; I'll confirm once for the set.`,
            ),
          ],
        ],
        [
          {
            kind: "approve",
            stepId: null,
            label: `Run ${writes.length} ${plural(writes.length, "update")}`,
            impact: "high",
          },
          { kind: "decline", stepId: null, label: "Not now" },
        ],
      ),
      detail: mission.targets.map((ref, i) => [entity(ref, mission.targetLabels[i] ?? ref.id)]),
    })
    return blocks
  }

  const outcome = mission.outcome
  if (!outcome) {
    blocks.push(
      block("status", "neutral", [
        [text("Working through "), count(projects), text(` ${plural(projects, "project")}.`)],
      ]),
    )
    return blocks
  }
  const lines: Inline[][] = []
  const bucket = (n: number, label: string) => {
    if (n > 0) lines.push([count(n), text(` ${label}.`)])
  }
  bucket(outcome.completed, "completed")
  bucket(outcome.blocked, "blocked by governance")
  bucket(outcome.alreadyComplete, "already complete")
  bucket(outcome.failed, "failed — state reconciled, not completed")
  bucket(outcome.permissionDenied, "not permitted for you")
  bucket(outcome.cancelled, "cancelled")
  bucket(outcome.completedBeforeScopeChange, "completed before the scope change")
  const detail = outcome.perTarget.map((t) => [
    entity(t.ref, t.label),
    text(` — ${t.outcome.replace(/_/g, " ")}`),
  ])
  blocks.push({
    ...block("partial_summary", mission.state === "COMPLETED" ? "success" : "neutral", lines, [
      { kind: "view_activity", label: "View activity" },
    ]),
    detail,
  })
  if (mission.state === "CANCELLED") {
    blocks.push(block("cancelled", "paused", [[text("Stopped. Nothing further was written.")]]))
  }
  void graph
  return blocks
}

/** Replies that do not (yet) belong to a mission. */
export function renderIntentReply(
  intent: Intent,
  graph: WorkspaceGraph,
  mission: Mission | null,
): Block[] {
  switch (intent.kind) {
    case "ambiguous":
      return [
        block(
          "clarification",
          "waiting",
          [[text(`Which one do you mean by "${intent.query}"?`)]],
          intent.candidates.map((c) => ({ kind: "pick_candidate", ref: c.ref, label: c.label })),
        ),
      ]
    case "unsupported":
      if (intent.reason === "target_not_found") {
        return [
          block("boundary", "neutral", [
            [
              text(
                `I couldn't find "${intent.query}" among the projects and tasks in this workspace.`,
              ),
            ],
          ]),
        ]
      }
      if (intent.reason === "no_target") {
        return [
          block("boundary", "neutral", [
            [text("Tell me which project or task, and I'll take it from there.")],
          ]),
        ]
      }
      return [
        block("boundary", "neutral", [
          [text("I can only act on projects, tasks and governance in this workspace.")],
        ]),
      ]
    case "show_status": {
      if (!mission)
        return [
          block("status", "neutral", [
            [text("No mission is running. Tell me what you want done.")],
          ]),
        ]
      const writes = mission.plan.filter((s) => s.transition === "COMPLETED")
      const done = writes.filter(
        (s) => s.status === "succeeded" || s.status === "already_complete",
      ).length
      return [
        block("status", "neutral", [
          [
            count(done),
            text(" of "),
            count(writes.length),
            text(` updates done. Mission is ${mission.state.toLowerCase().replace(/_/g, " ")}.`),
          ],
        ]),
      ]
    }
    case "show_path": {
      if (!mission) return [block("status", "neutral", [[text("No mission is running.")]])]
      const blocker = nextActionable(mission.blockers)
      if (!blocker) return [block("status", "neutral", [[text("Nothing is blocked right now.")]])]
      return [
        {
          ...block("blocker", "neutral", [[text("Full path from the goal to the first action:")]]),
          path: blocker.dependencyPath.map((ref, i) => ({
            ref,
            label: labelOf(ref, graph),
            state:
              i === 0
                ? "target"
                : i === blocker.dependencyPath.length - 1
                  ? "actionable"
                  : isComplete(ref, graph)
                    ? "complete"
                    : "open",
          })),
        },
      ]
    }
    case "explain_blocker": {
      if (!mission) return [block("status", "neutral", [[text("No mission is running.")]])]
      const blocker = nextActionable(mission.blockers)
      if (!blocker) return [block("status", "neutral", [[text("Nothing is blocked right now.")]])]
      return renderBlockerChain({ mission, graph, events: [] }, blocker)
    }
    case "change_scope":
      return [
        block("scope_change", "paused", [
          [
            text("Stopped. "),
            entity(intent.exclude, labelOf(intent.exclude, graph)),
            text(" stays open. Continuing with the remaining updates."),
          ],
        ]),
      ]
    case "cancel":
      return []
    case "continue":
      return []
    case "create_routine":
      return [
        block("boundary", "neutral", [
          [
            text(
              "Routine checks are designed but not built in this prototype. See the README's known limitations.",
            ),
          ],
        ]),
      ]
    case "log_time":
      if (!mission)
        return [
          block("boundary", "neutral", [
            [text("Start a mission first; I log time only as part of completing something.")],
          ]),
        ]
      return []
    case "approve":
    case "decline":
      return mission
        ? []
        : [block("boundary", "neutral", [[text("Nothing is waiting for a decision.")]])]
    case "complete_target":
    case "complete_task":
      return []
  }
}

// ------------------------------------------------------------------------------------------------

let blockCounter = 0

function block(
  type: Block["type"],
  tone: Block["tone"],
  lines: readonly (readonly Inline[])[],
  actions: readonly BlockAction[] = [],
): Block {
  blockCounter += 1
  return { id: `${type}-${blockCounter}`, type, lines, actions, detail: null, path: null, tone }
}

function joinEntities(items: ReadonlyArray<readonly [EntityRef, string]>): Inline[] {
  const out: Inline[] = []
  items.forEach(([ref, label], i) => {
    if (i > 0) out.push(text(i === items.length - 1 ? " and " : ", "))
    out.push(entity(ref, label))
  })
  return out
}

function isComplete(ref: EntityRef, graph: WorkspaceGraph): boolean {
  if (ref.kind === "project") return graph.project(ref.id)?.status === "COMPLETED"
  if (ref.kind === "task") {
    const t = graph.task(ref.id)
    return t !== null && isTaskComplete(t.status)
  }
  return false
}

function statusWord(ref: EntityRef, graph: WorkspaceGraph): string {
  if (ref.kind === "project") return (graph.project(ref.id)?.rawStatus ?? "open").toLowerCase()
  if (ref.kind === "task")
    return (graph.task(ref.id)?.status ?? "open").toLowerCase().replace("_", " ")
  return "open"
}

function actorName(graph: WorkspaceGraph, actorId: string): string {
  return graph.actor(actorId as never)?.name ?? "someone"
}

export { POLICY_LABEL }
