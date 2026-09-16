import { describe, expect, it } from "vitest"

import type { Task } from "@/core/domain/entities"
import { WorkspaceGraph } from "@/core/domain/graph"
import { projectId, taskId } from "@/core/domain/ids"

const project = projectId("P1")

function task(id: string, predecessors: string[] = [], parent: string | null = null): Task {
  return {
    id: taskId(id),
    projectId: project,
    phaseId: null,
    name: id,
    status: "TODO",
    assigneeNames: [],
    isMilestone: false,
    parentTaskId: parent ? taskId(parent) : null,
    predecessorIds: predecessors.map(taskId),
    timeEntries: [],
    flags: [],
    startDate: null,
    dueDate: null,
    completedAt: null,
    version: 1,
  }
}

function graphOf(tasks: Task[]): WorkspaceGraph {
  return new WorkspaceGraph({
    projects: [
      {
        id: project,
        name: "P1",
        status: "IN_PROGRESS",
        rawStatus: "In progress",
        ownerId: null,
        ownerName: null,
        customerName: null,
        startDate: null,
        dueDate: null,
        teamMemberIds: [],
        region: null,
        version: 1,
      },
    ],
    phases: [],
    tasks,
    actors: [],
  })
}

describe("WorkspaceGraph", () => {
  it("indexes predecessors, dependents and subtasks", () => {
    const g = graphOf([task("A"), task("B", ["A"]), task("C", ["B"]), task("D", [], "C")])
    expect(g.predecessorsOf(taskId("C")).map((t) => t.id)).toEqual(["B"])
    expect(g.dependentsOf(taskId("A")).map((t) => t.id)).toEqual(["B"])
    expect(g.subtasksOf(taskId("C")).map((t) => t.id)).toEqual(["D"])
    expect(g.tasksOf(project)).toHaveLength(4)
  })

  it("detects every task on a predecessor cycle and nothing else", () => {
    const g = graphOf([
      task("A", ["C"]),
      task("B", ["A"]),
      task("C", ["B"]),
      task("D", ["A"]),
      task("E"),
    ])
    const cycle = g.predecessorCycles()
    expect([...cycle].sort()).toEqual(["A", "B", "C"])
  })

  it("returns a new graph on write without mutating the old one", () => {
    const g = graphOf([task("A")])
    const updated = g.with({
      tasks: [{ ...g.task(taskId("A"))!, status: "COMPLETED", version: 2 }],
    })
    expect(g.task(taskId("A"))?.status).toBe("TODO")
    expect(updated.task(taskId("A"))?.status).toBe("COMPLETED")
    expect(updated.task(taskId("A"))?.version).toBe(2)
  })
})
