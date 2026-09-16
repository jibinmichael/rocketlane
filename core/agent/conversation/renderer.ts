import {
  type ActivityItem,
  type Block,
  type BlockAction,
  count,
  entity,
  type Inline,
  type PathNode,
  plural,
  policy,
  type SemanticIcon,
  text,
  time,
} from "@/core/agent/conversation/blocks"
import type { Intent } from "@/core/agent/intent/intent"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { ActorId, EntityRef } from "@/core/domain/ids"
import { isTaskComplete } from "@/core/domain/status"
import type { PolicyId, ReasonCode } from "@/core/governance/policy"
import {
  isTerminal,
  type Mission,
  type PlanStep,
  type TargetOutcome,
  type RequiredInput,
} from "@/core/mission/mission"
import { activityPhases } from "@/core/agent/conversation/activity"
import { type EvaluationCheckId, evaluateMission } from "@/core/evaluation/mission-evaluation"
import { type Blocker, nextActionable } from "@/core/resolver/blockers"
import { labelOf } from "@/core/resolver/target"
import { fnv1a } from "@/core/ingestion/hash"
import { MISSION_LABEL } from "@/core/mission/labels"
import type { AgentEvent, AgentEventType } from "@/core/telemetry/events"

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

type Anchored = { readonly at: number; readonly order: number; readonly block: Block }

/**
 * The mission as a conversation, in the order things happened (spec §7, §14). Anchors are indices
 * into the audit log, so the order is the system's, not the clock's. Durable blocks (speech,
 * blockers, asks, decisions, changes, results) stay readable; observable work is one `activity`
 * block per phase that collapses to a sentence once the phase is over.
 */
export function renderMission(
  mission: Mission,
  graph: WorkspaceGraph,
  events: readonly AgentEvent[] = [],
): Block[] {
  const ctx: Ctx = { mission, graph, events }
  if (mission.targets.length > 1) return renderBatch(ctx)

  const target = mission.targets[0]
  if (!target) return []
  const targetLabel = mission.targetLabels[0] ?? labelOf(target, graph)
  const writes = mission.plan.filter((s) => s.transition === "COMPLETED")
  // Over for now: terminal, or blocked until the world changes. Either way the evidence is in.
  const terminal = isTerminal(mission) || mission.state === "BLOCKED"
  const last = events.length
  const timeline: Anchored[] = []
  const add = (at: number, order: number, ...blocks: readonly Block[]) => {
    for (const b of blocks) timeline.push({ at: Math.max(at, 0), order, block: b })
  }
  const indexOf = (type: AgentEventType, from = 0) =>
    events.findIndex((e, i) => i >= from && e.type === type)

  if (mission.state === "FAILED" && mission.plan.length === 0) {
    return [block("boundary", "error", [[text("I couldn't act on that target.")]])]
  }

  // A person asked; the agent says what it understood and what it will do. A routine asked nobody.
  if (mission.origin === "user") add(0, 0, acknowledgeGoal(target, targetLabel))

  // Observable work, one block per phase; only the current phase stays open.
  const phases = activityPhases(mission, graph, events)
  for (const phase of phases) {
    const current = !terminal && phase.index === phases[phases.length - 1]?.index
    add(phase.startIndex, 1, activityBlock(phase.index, phase.items, phase.summary, !current))
  }

  // Already complete: nothing to do, said once.
  if (mission.state === "COMPLETED" && writes.every((s) => s.status === "already_complete")) {
    add(
      last,
      8,
      block("already_complete", "neutral", [
        [entity(target, targetLabel), text(" is already complete. Nothing to do.")],
      ]),
    )
    return finish(timeline)
  }

  // Outcome and the shortest useful path, anchored where the agent stopped.
  const stops = [indexOf("MISSION_BLOCKED"), indexOf("ACTION_REQUESTED")].filter((i) => i >= 0)
  const stopAt = stops.length > 0 ? Math.min(...stops) : Math.max(indexOf("PLAN_CREATED"), 0)
  const initialBlocked =
    mission.state === "BLOCKED" ||
    mission.plan.some((s) => s.transition === "TIME_LOGGED") ||
    mission.blockers.length > 0
  if (!mission.landedAt) {
    add(
      stopAt,
      2,
      initialBlocked
        ? block("outcome.blocked", "blocked", [
            [text("I can't complete "), entity(target, targetLabel), text(" yet.")],
          ])
        : block("outcome.ready", "neutral", [
            [
              entity(target, targetLabel),
              text(` can be completed. `),
              count(writes.length),
              text(` ${plural(writes.length, "update")} required.`),
            ],
          ]),
    )
  }
  const current = nextActionable(mission.blockers)
  if (current && !mission.landedAt && mission.state !== "CANCELLED") {
    add(stopAt, 3, ...renderBlockerChain(ctx, current))
  }

  // Every accepted answer is acknowledged before the work it unlocks.
  events.forEach((e, i) => {
    if (e.type === "INPUT_RECEIVED") add(i, 0, acknowledgeInput(e, graph))
  })

  // Durable step results: reconciliations, mismatches, declines.
  for (const step of mission.plan) {
    const blocks = renderStepResult(ctx, step)
    if (blocks.length === 0) continue
    const at = events.findIndex(
      (e) =>
        (e.type === "WRITE_TIMEOUT_RECONCILED" ||
          e.type === "ACTION_FAILED" ||
          e.type === "ACTION_DECLINED") &&
        e.refs.some((r) => r.id === step.ref.id),
    )
    add(at < 0 ? last : at, 4, ...blocks)
  }

  // Course correction: what changed, what it affects, what the agent did about it.
  for (const notice of mission.stateChanges) {
    const at = events.findIndex(
      (e) => (e.type === "MISSION_PAUSED" || e.type === "STATE_CHANGED") && e.at >= notice.at,
    )
    add(at < 0 ? last : at, 5, renderStateChange(ctx, target, targetLabel, notice))
    if (mission.state !== "STALE" && notice.replan) {
      const replanAt = indexOf("MISSION_REPLANNED", Math.max(at, 0))
      add(replanAt < 0 ? last : replanAt, 6, renderCourseCorrection(ctx, notice.replan))
    }
  }

  // Pause and resume, as they happened.
  events.forEach((e, i) => {
    if (e.type === "PAUSE_REQUESTED" && e.detail["inFlight"] === true) {
      add(
        i,
        5,
        block("pause_requested", "paused", [
          [text("Pause requested.")],
          [
            text(
              "I'm finishing the update already in progress, then I'll pause. I won't start the next update.",
            ),
          ],
        ]),
      )
    }
    if (e.type === "MISSION_PAUSED" && e.detail["reason"] === "USER") {
      const isCurrent =
        mission.state === "PAUSED" &&
        !events.some((later, j) => j > i && later.type === "MISSION_PAUSED")
      add(i, 7, renderPaused(ctx, e, i, isCurrent))
    }
    if (e.type === "MISSION_RESUMED") add(i, 0, renderResumed(e))
  })

  // The one thing the agent needs from a person, where it asked.
  const requested = events
    .map((e, i) => (e.type === "ACTION_REQUESTED" ? i : -1))
    .filter((i) => i >= 0)
  add(
    requested.length > 0 ? requested[requested.length - 1]! : last,
    7,
    ...renderPending(ctx, target),
  )

  // Outcome, then the evidence that it held.
  add(last, 8, ...renderTerminal(ctx, target, targetLabel))
  if (terminal) add(last, 9, evaluationBlock(mission, events, graph))
  return finish(timeline)
}

function finish(timeline: readonly Anchored[]): Block[] {
  return [...timeline].sort((a, b) => a.at - b.at || a.order - b.order).map((t) => t.block)
}

function acknowledgeGoal(target: EntityRef, label: string): Block {
  return block("acknowledgement", "neutral", [
    [text("Got it. I'll get "), entity(target, label), text(" to completed.")],
    [text("I'll check its governance requirements and resolve anything blocking it.")],
  ])
}

function acknowledgeInput(event: AgentEvent, graph: WorkspaceGraph): Block {
  const ref = event.refs[0]
  const value = event.detail["value"]
  const field = event.detail["input"]
  const what =
    field === "hours" && typeof value === "number"
      ? `${value} ${plural(value, "hour")}`
      : String(value ?? "")
  return block("acknowledgement", "neutral", [
    [
      text(`Got it — ${what}`),
      ...(ref ? [text(" for "), entity(ref, labelOf(ref, graph))] : []),
      text("."),
    ],
    [text("I'll log that, verify it, and continue with the original goal.")],
  ])
}

function activityBlock(
  index: number,
  items: readonly ActivityItem[],
  summary: readonly Inline[],
  collapsed: boolean,
): Block {
  return {
    ...block("activity", "neutral", [summary]),
    id: `activity-${index}`,
    activity: items,
    collapsed,
  }
}

const CHECK_LABEL: Record<EvaluationCheckId, string> = {
  policy_violation: "Governance",
  unauthorized_write: "Authorization",
  unverified_completion: "Verification",
  scope_expansion: "Scope",
  expected_final_state: "Final state",
}

/** Evidence that the invariants held for this run, judged from the log and a fresh read. Collapsed. */
function evaluationBlock(
  mission: Mission,
  events: readonly AgentEvent[],
  graph: WorkspaceGraph,
): Block {
  const evaluation = evaluateMission(mission, events, graph)
  const failed = evaluation.checks.filter((c) => !c.passed).length
  const verdict =
    failed === 0
      ? "Governance held, every write was authorized and verified, scope was kept, and the final state matches."
      : `${failed} ${plural(failed, "check")} failed.`
  const versions = evaluation.versions
  return {
    ...block("evaluation", failed === 0 ? "neutral" : "error", [
      [text("Evaluation")],
      [text(verdict)],
    ]),
    id: `evaluation-${mission.id}`,
    activity: evaluation.checks.map((c) => ({
      icon: c.passed ? ("check" as const) : ("error" as const),
      label: CHECK_LABEL[c.id],
      detail: [text(c.detail)],
    })),
    detail: [
      [
        text(
          `Agent ${versions.agent} · Policies ${versions.policySet} · Dataset ${versions.dataset} · Evaluation ${versions.evaluation} · ${evaluation.writes} ${plural(evaluation.writes, "write")}`,
        ),
      ],
    ],
    collapsed: true,
  }
}

/** Pause assurance: what happened, where we stopped, what did not happen, what resume will do. */
function renderPaused(ctx: Ctx, event: AgentEvent, index: number, isCurrent: boolean): Block {
  const { mission, events, graph } = ctx
  const reconciled = [...events]
    .slice(0, index)
    .reverse()
    .find((e) => e.type === "ACTION_RECONCILED")
  const inFlight = event.detail["inFlight"] === true && reconciled !== undefined
  const lastVerifiedLabel =
    typeof event.detail["lastVerified"] === "string" ? event.detail["lastVerified"] : null
  const lastVerified = lastVerifiedLabel
    ? mission.plan.find((s) => s.label === lastVerifiedLabel && s.status === "succeeded")
    : undefined
  const lines: Inline[][] = [[text("Got it. I've paused the mission.")]]
  if (inFlight && reconciled) {
    const ref = reconciled.refs[0]
    const verified = reconciled.detail["verified"] === true
    lines.push([
      text("The update to "),
      ...(ref ? [entity(ref, labelOf(ref, graph))] : [text("the current item")]),
      text(
        verified
          ? " was already in progress; it completed before the pause took effect and was verified."
          : " was already in progress; it did not verify, so it is not marked complete and the state was reconciled.",
      ),
    ])
  } else {
    lines.push([text("I stopped before starting the next update.")])
  }
  lines.push(
    lastVerified
      ? [
          text("The last verified update was "),
          entity(lastVerified.ref, lastVerified.label),
          text("."),
        ]
      : [text("No updates had been made yet.")],
  )
  lines.push([
    text(
      "No further updates were started. Nothing else will change until you resume; I'll recheck the current state first.",
    ),
  ])
  return block(
    "paused",
    "paused",
    lines,
    isCurrent
      ? [
          { kind: "continue", label: "Resume" },
          { kind: "cancel", label: "Stop" },
        ]
      : [],
  )
}

function renderResumed(event: AgentEvent): Block {
  if (event.detail["withdrawn"] === true) {
    return block("resumed", "neutral", [
      [text("Got it. The pause was withdrawn before it took effect; I'm continuing.")],
    ])
  }
  const changed = event.detail["changed"] === true
  const lines: Inline[][] = [[text("Got it. I'll recheck the current state, then continue.")]]
  if (changed) {
    lines.push([
      text(
        "Resuming requires a course correction. The project changed while this mission was paused. I rechecked the current state and updated the remaining plan.",
      ),
    ])
  }
  return block("resumed", "neutral", lines)
}

function renderStateChange(
  ctx: Ctx,
  target: EntityRef,
  targetLabel: string,
  notice: Mission["stateChanges"][number],
): Block {
  const { mission, graph } = ctx
  const affectedSteps = mission.plan.filter((s) => notice.affectedStepIds.includes(s.id))
  const seenRefs = new Set<string>()
  const affected = affectedSteps.filter((s) => {
    const key = `${s.ref.kind}:${s.ref.id}`
    if (seenRefs.has(key)) return false
    seenRefs.add(key)
    return true
  })
  return block(
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
  )
}

function renderCourseCorrection(
  ctx: Ctx,
  replan: { readonly kept: number; readonly planned: number },
): Block {
  const { mission, graph } = ctx
  const next = nextActionable(mission.blockers)
  const detail: Inline[] = [
    count(replan.kept),
    text(` of `),
    count(replan.planned),
    text(` ${plural(replan.planned, "update")} still ${replan.kept === 1 ? "applies" : "apply"}.`),
  ]
  if (next && !mission.landedAt)
    detail.push(text(" Next: "), ...firstActionLabel(next, graph), text("."))
  return {
    ...block("course_correction", "neutral", [
      [
        text(
          "Course correction. The previous plan is no longer valid; I've updated the remaining steps.",
        ),
      ],
    ]),
    detail: [detail],
  }
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
  if (step.transition !== "COMPLETED") return blocks
  if (step.status === "failed" && step.verification === "MISMATCH") {
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
          text(` stays ${statusWord(step.ref, graph)}.`),
          text(earlierUpdatesNote(ctx.mission)),
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
  if (pending.kind === "input") {
    const step = mission.plan.find((s) => s.id === pending.stepId)
    if (!step) return []
    const { input } = pending
    // Why it stopped, from the policy evidence; what it needs; whose action this will be. The
    // composer is the input: the conversation is the control surface (spec §27).
    const actor = actorName(graph, mission.actorId)
    const task = step.ref.kind === "task" ? graph.task(step.ref.id) : null
    const assignees = (task?.assigneeNames ?? []).filter((name) => name !== actor)
    const attribution =
      assignees.length > 0
        ? `${step.label} is assigned to ${joinNames(assignees)}; I'll record the ${input.field} as yours, ${actor}.`
        : `I'll record them as your ${input.field}, ${actor}.`
    if (mission.origin === "routine") {
      // A routine never invents the value; it leaves a waiting mission and says who must supply it.
      return [
        block("notification.blocked", "waiting", [
          [
            entity(target, mission.targetLabels[0] ?? labelOf(target, graph)),
            text(" is blocked because "),
            entity(step.ref, step.label),
            text(
              ` ${inputReason(input)} ${POLICY_LABEL[input.policyId]} requires ${input.field} before completion. I need the number of ${input.field} from the authorized actor.`,
            ),
          ],
          inputQuestion(input, step),
          [text(attribution)],
        ]),
      ]
    }
    return [
      block("action_request.input", "waiting", [
        [
          entity(step.ref, step.label),
          text(
            ` ${inputReason(input)} ${POLICY_LABEL[input.policyId]} requires ${input.field} before completion.`,
          ),
        ],
        inputQuestion(input, step),
        [text(attribution)],
      ]),
    ]
  }
  if (pending.kind === "confirm_step") {
    const step = mission.plan.find((s) => s.id === pending.stepId)
    if (!step) return []
    const milestones = target.kind === "project" ? graph.milestonesOf(target.id) : []
    const done = milestones.filter((m) => isTaskComplete(m.status)).length
    const open = mission.openButNotRequired.length
    const lines: Inline[][] =
      milestones.length === 0
        ? [
            [
              text("Complete "),
              entity(step.ref, step.label),
              text("? It has no milestones on record."),
            ],
          ]
        : [
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
    case "COMPLETED": {
      const evidence = mission.plan.filter(
        (s) =>
          s.transition === "COMPLETED" &&
          s.status === "succeeded" &&
          !(s.ref.kind === target.kind && s.ref.id === target.id),
      )
      return [
        {
          ...block(
            "landing",
            "success",
            [
              [entity(target, targetLabel), text(" completed.")],
              [
                text(`All required updates were completed and verified. Final state verified at `),
                time(mission.landedAt ?? mission.updatedAt),
                text("."),
              ],
              [
                count(evidence.length),
                text(` ${plural(evidence.length, "update")} completed · `),
                count(mission.plan.filter((s) => s.status === "failed").length),
                text(" failed"),
              ],
            ],
            [{ kind: "view_activity", label: "View activity" }],
          ),
          activity: evidence.map((s) => ({
            icon: "check" as const,
            label: s.label,
            detail:
              s.retries > 0
                ? [text(`Verified after ${s.retries} ${plural(s.retries, "retry", "retries")}`)]
                : null,
          })),
        },
      ]
    }
    case "CANCELLED": {
      // A decline is its own record ("Not done. X stays open."); no second stop line.
      if (mission.plan.some((s) => s.note === "declined by user")) return []
      const written = mission.plan.filter(
        (s) => s.status === "succeeded" && s.transition === "COMPLETED",
      ).length
      const cancelledAt = ctx.events.findIndex((e) => e.type === "MISSION_CANCELLED")
      const reconciled = ctx.events.find(
        (e, i) => i > cancelledAt && cancelledAt >= 0 && e.type === "ACTION_RECONCILED",
      )
      const lines: Inline[][] = [
        [text("Got it. I've stopped the mission. Completed and verified work remains unchanged.")],
      ]
      if (reconciled?.refs[0]) {
        lines.push([
          text("The update to "),
          entity(reconciled.refs[0], labelOf(reconciled.refs[0], graph)),
          text(
            reconciled.detail["verified"] === true
              ? " was already in progress; it completed and was verified."
              : " was already in progress; it did not verify and is not marked complete.",
          ),
        ])
      }
      lines.push(
        written === 0
          ? [text("Nothing was written.")]
          : [
              count(written),
              text(
                ` ${plural(written, "update")} completed and verified before you stopped; nothing further was started.`,
              ),
            ],
      )
      return [block("cancelled", "paused", lines)]
    }
    case "FAILED": {
      const failed = mission.plan.find((s) => s.status === "failed")
      const why = failed
        ? [
            text(": the update to "),
            entity(failed.ref, failed.label),
            text(` failed (${(failed.failureClass ?? "failure").replace("_", " ")})`),
          ]
        : []
      return [
        block("result.mismatch", "error", [
          [
            entity(target, targetLabel),
            text(" could not be completed"),
            ...why,
            text(". State was reconciled; nothing further was written."),
          ],
        ]),
      ]
    }
    case "PERMISSION_DENIED": {
      const denied = mission.plan.find((s) => s.status === "permission_denied")
      const deniedTask = denied && denied.ref.kind === "task" ? graph.task(denied.ref.id) : null
      const project =
        target.kind === "project"
          ? graph.project(target.id)
          : deniedTask
            ? graph.project(deniedTask.projectId)
            : null
      const owner = project?.ownerName ?? "the project owner"
      const first: Inline[] =
        denied?.transition === "TIME_LOGGED"
          ? [
              text("Only the project owner or an assigned team member can log time on "),
              entity(denied.ref, denied.label),
              text(`. ${owner} owns the project.`),
            ]
          : denied && denied.ref.kind === "task" && target.kind !== "task"
            ? [
                text("Only the project owner can complete "),
                entity(denied.ref, denied.label),
                text(" in "),
                entity(target, targetLabel),
                text(`. ${owner} owns it.`),
              ]
            : [
                text("Only the project owner can complete "),
                entity(target, targetLabel),
                text(`. ${owner} owns it.`),
              ]
      const lines: Inline[][] = [first]
      if (project?.ownerName) {
        lines.push([
          text(
            `Ask ${project.ownerName} to complete it, or switch the acting user in the Test Lab.`,
          ),
        ])
      }
      return [block("permission_denied", "blocked", lines)]
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
  const { mission, graph, events } = ctx
  const blocks: Block[] = []
  const writes = mission.plan.filter((s) => s.transition === "COMPLETED")
  const projects = mission.targets.length
  const terminal = isTerminal(mission) || mission.state === "BLOCKED"

  if (mission.origin === "user") {
    blocks.push(
      block("acknowledgement", "neutral", [
        [text(`Got it. I'll work through ${projects} ${plural(projects, "project")}.`)],
        [text("I'll check each one's governance and report exactly what happened.")],
      ]),
    )
  }
  const phases = activityPhases(mission, graph, events)
  for (const phase of phases) {
    const current = !terminal && phase.index === phases[phases.length - 1]?.index
    blocks.push(activityBlock(phase.index, phase.items, phase.summary, !current))
  }

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
            text(` ${plural(projects, "project")}. One confirmation covers the set.`),
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
  const failedClasses = new Map<string, number>()
  for (const t of outcome.perTarget) {
    if (t.outcome !== "failed") continue
    const step = mission.plan.find((s) => s.status === "failed" && sameTarget(s.forTarget, t.ref))
    const cls = (step?.failureClass ?? "failure").replace("_", " ")
    failedClasses.set(cls, (failedClasses.get(cls) ?? 0) + 1)
  }
  for (const [cls, n] of failedClasses)
    bucket(n, `failed — ${cls}, state reconciled, not completed`)
  bucket(outcome.permissionDenied, "not permitted")
  bucket(outcome.cancelled, "cancelled")
  bucket(outcome.completedBeforeScopeChange, "completed before the scope change")
  const detail = outcome.perTarget.map((t) => [
    entity(t.ref, t.label),
    text(` — ${OUTCOME_LABEL[t.outcome]}`),
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
  if (terminal) blocks.push(evaluationBlock(mission, events, graph))
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
      if (intent.reason === "unsupported_scope") {
        return [
          block("boundary", "neutral", [
            [
              text(
                "I can't scope by assignee or date yet. Name a project or task and I'll take it from there.",
              ),
            ],
          ]),
        ]
      }
      if (intent.reason === "invalid_input") {
        const pending = mission?.pending
        const step =
          pending?.kind === "input" ? mission?.plan.find((s) => s.id === pending.stepId) : null
        if (pending?.kind === "input" && step) {
          return [
            block("boundary", "waiting", [
              [
                text(`I need a number of ${pending.input.field} for `),
                entity(step.ref, step.label),
                text(`, for example ${inputExample(pending.input)}. Nothing has been logged.`),
              ],
            ]),
          ]
        }
      }
      if (intent.reason === "none_owned") {
        return [
          block("boundary", "neutral", [
            [
              text(
                "You don't own a project in this workspace. Name one and I'll check what I'm allowed to do.",
              ),
            ],
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
            text(` ${plural(writes.length, "update")} done. ${MISSION_LABEL[mission.state]}.`),
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
    case "change_scope": {
      const label = labelOf(intent.exclude, graph)
      if (isComplete(intent.exclude, graph)) {
        return [
          block("scope_change", "paused", [
            [
              entity(intent.exclude, label),
              text(
                " was already verified complete before you asked. No policy lets me reopen it. Continuing with the remaining updates.",
              ),
            ],
          ]),
        ]
      }
      return [
        block("scope_change", "paused", [
          [
            text("Stopped. "),
            entity(intent.exclude, label),
            text(" stays open. Continuing with the remaining updates."),
          ],
        ]),
      ]
    }
    case "cancel":
    case "pause":
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

/**
 * Block ids are content-derived so React keys are stable across re-renders: the same state renders
 * the same id, and a block never remounts (or re-animates, or steals focus) because state changed elsewhere.
 */
function block(
  type: Block["type"],
  tone: Block["tone"],
  lines: readonly (readonly Inline[])[],
  actions: readonly BlockAction[] = [],
): Block {
  const id = `${type}-${fnv1a(JSON.stringify(lines))}`
  return {
    id,
    type,
    lines,
    actions,
    detail: null,
    path: null,
    tone,
    icon: ICON_BY_TYPE[type],
    activity: null,
    collapsed: false,
  }
}

/** Deterministic: the kind of work a block represents. Plain agent speech carries no icon. */
const ICON_BY_TYPE: Record<Block["type"], SemanticIcon | null> = {
  acknowledgement: null,
  activity: null,
  evaluation: "policy",
  "outcome.blocked": "blocker",
  "outcome.ready": "project",
  already_complete: "check",
  blocker: "dependency",
  resolution_path: "action",
  "action_request.input": "person",
  "action_request.confirm": "person",
  "action_request.batch_confirm": "person",
  "notification.blocked": "person",
  declined: "cancel",
  consequence: "task",
  "result.mismatch": "error",
  timeout_reconciled: "refresh",
  state_change: "change",
  course_correction: "course",
  pause_requested: "pause",
  paused: "pause",
  resumed: "refresh",
  stale_on_resume: "change",
  scope_change: "change",
  cancelled: "cancel",
  partial_summary: "landing",
  permission_denied: "blocker",
  clarification: "person",
  boundary: null,
  landing: "landing",
  status: "execution",
}

function joinEntities(items: ReadonlyArray<readonly [EntityRef, string]>): Inline[] {
  const out: Inline[] = []
  items.forEach(([ref, label], i) => {
    if (i > 0) out.push(text(i === items.length - 1 ? " and " : ", "))
    out.push(entity(ref, label))
  })
  return out
}

const OUTCOME_LABEL: Record<TargetOutcome, string> = {
  completed: "completed",
  blocked: "blocked by governance",
  already_complete: "already complete",
  failed: "failed",
  cancelled: "cancelled",
  permission_denied: "not permitted",
  pending: "not reached",
  completed_before_scope_change: "completed before the scope change",
}

function earlierUpdatesNote(mission: Mission): string {
  const n = mission.plan.filter(
    (s) => s.status === "succeeded" && s.transition === "COMPLETED",
  ).length
  return n === 0
    ? " Nothing was written."
    : ` The ${n} earlier ${plural(n, "update")} stand; nothing further was written.`
}

function sameTarget(a: EntityRef, b: EntityRef): boolean {
  return a.kind === b.kind && a.id === b.id
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

/** The reason a required input exists, from its policy evidence. One sentence per reason code. */
function inputReason(input: RequiredInput): string {
  switch (input.reasonCode) {
    case "NO_TIME_LOGGED":
      return "has no logged time."
    case "MILESTONES_INCOMPLETE":
    case "SUBTASKS_OPEN":
    case "PREDECESSORS_INCOMPLETE":
    case "DATA_FLAGGED":
    case "OK":
      return "needs input."
  }
}

function inputQuestion(input: RequiredInput, step: PlanStep): Inline[] {
  switch (input.field) {
    case "hours":
      return [text("How many hours should I log for "), entity(step.ref, step.label), text("?")]
  }
}

function inputExample(input: RequiredInput): string {
  switch (input.field) {
    case "hours":
      return "2 or 1.5"
  }
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

function actorName(graph: WorkspaceGraph, actorId: ActorId | null): string {
  return actorId ? (graph.actor(actorId)?.name ?? "someone") : "someone"
}

export { POLICY_LABEL }
