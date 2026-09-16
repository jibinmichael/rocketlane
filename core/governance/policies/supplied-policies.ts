import { hoursTracked } from "@/core/domain/entities"
import type { Task } from "@/core/domain/entities"
import type { EntityRef } from "@/core/domain/ids"
import { isTaskOpen } from "@/core/domain/status"
import type { Evidence, EvaluationContext, Policy } from "@/core/governance/policy"

/**
 * The four governance policies supplied by the brief (spec §1). Nothing else is a policy.
 * Version bumps whenever a validation's semantics change (spec §23).
 */

const taskRef = (task: Task): EntityRef => ({ kind: "task", id: task.id })

function targetTask(ctx: EvaluationContext): Task | null {
  const { target } = ctx.transition
  return target.kind === "task" ? ctx.graph.task(target.id) : null
}

export const P1_PROJECT_MILESTONES: Policy = {
  id: "P1_PROJECT_MILESTONES",
  name: "Project completion requires complete milestones",
  rule: "all milestones must be complete",
  version: "1.0.0",
  source: "brief",
  severity: "blocking",
  trigger: { targetKind: "project", to: "COMPLETED" },
  validations: [
    {
      id: "milestones-complete",
      reasonCode: "MILESTONES_INCOMPLETE",
      run: (ctx) => {
        const { target } = ctx.transition
        if (target.kind !== "project") return { passed: true, evidence: [] }
        const incomplete = ctx.graph
          .milestonesOf(target.id)
          .filter((m) => isTaskOpen(m.status, ctx.config.interpretation))
        const evidence: Evidence[] = incomplete.map((m) => ({
          ref: taskRef(m),
          label: m.name,
          detail: `milestone is ${m.status}`,
        }))
        return { passed: incomplete.length === 0, evidence }
      },
    },
  ],
}

export const P2_MILESTONE_SUBTASKS: Policy = {
  id: "P2_MILESTONE_SUBTASKS",
  name: "Milestone completion requires closed subtasks",
  rule: "no open subtasks",
  version: "1.0.0",
  source: "brief",
  severity: "blocking",
  trigger: {
    targetKind: "task",
    to: "COMPLETED",
    when: (ctx) => targetTask(ctx)?.isMilestone === true,
  },
  validations: [
    {
      id: "subtasks-closed",
      reasonCode: "SUBTASKS_OPEN",
      run: (ctx) => {
        const task = targetTask(ctx)
        if (!task) return { passed: true, evidence: [] }
        const open = ctx.graph
          .subtasksOf(task.id)
          .filter((s) => isTaskOpen(s.status, ctx.config.interpretation))
        const evidence: Evidence[] = open.map((s) => ({
          ref: taskRef(s),
          label: s.name,
          detail: `subtask is ${s.status}`,
        }))
        return { passed: open.length === 0, evidence }
      },
    },
  ],
}

export const P3_TASK_PREDECESSORS: Policy = {
  id: "P3_TASK_PREDECESSORS",
  name: "Task completion requires complete predecessors",
  rule: "every predecessor must be complete",
  version: "1.0.0",
  source: "brief",
  severity: "blocking",
  trigger: { targetKind: "task", to: "COMPLETED" },
  validations: [
    {
      id: "predecessors-complete",
      reasonCode: "PREDECESSORS_INCOMPLETE",
      run: (ctx) => {
        const task = targetTask(ctx)
        if (!task) return { passed: true, evidence: [] }
        const incomplete = ctx.graph
          .predecessorsOf(task.id)
          .filter((p) => isTaskOpen(p.status, ctx.config.interpretation))
        const evidence: Evidence[] = incomplete.map((p) => ({
          ref: taskRef(p),
          label: p.name,
          detail: `predecessor is ${p.status}`,
        }))
        return { passed: incomplete.length === 0, evidence }
      },
    },
  ],
}

export const P4_TASK_TIME: Policy = {
  id: "P4_TASK_TIME",
  name: "Task completion requires logged time",
  rule: "time must be logged",
  version: "1.0.0",
  source: "brief",
  severity: "blocking",
  trigger: { targetKind: "task", to: "COMPLETED" },
  validations: [
    {
      id: "time-logged",
      reasonCode: "NO_TIME_LOGGED",
      run: (ctx) => {
        const task = targetTask(ctx)
        if (!task) return { passed: true, evidence: [] }
        const hours = hoursTracked(task)
        const passed = hours > ctx.config.minimumHours
        const evidence: Evidence[] = passed
          ? []
          : [{ ref: taskRef(task), label: task.name, detail: `${hours} hours logged` }]
        return { passed, evidence }
      },
    },
  ],
}

export const SUPPLIED_POLICIES: readonly Policy[] = [
  P1_PROJECT_MILESTONES,
  P2_MILESTONE_SUBTASKS,
  P3_TASK_PREDECESSORS,
  P4_TASK_TIME,
]

export const POLICY_SET_VERSION = "brief-4@1.0.0"
