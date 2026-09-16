import type { Actor, Dataset, Phase, Project, Task } from "@/core/domain/entities"
import type { ActorId, PhaseId, ProjectId, TaskId } from "@/core/domain/ids"

/**
 * Immutable, indexed snapshot of the workspace. Built once per snapshot; every lookup is O(1)
 * and every traversal is O(V+E). The graph never mutates; the system of record produces a new one.
 */
export class WorkspaceGraph {
  private readonly projectsById: ReadonlyMap<ProjectId, Project>
  private readonly phasesById: ReadonlyMap<PhaseId, Phase>
  private readonly tasksById: ReadonlyMap<TaskId, Task>
  private readonly actorsById: ReadonlyMap<ActorId, Actor>
  private readonly tasksByProject: ReadonlyMap<ProjectId, readonly Task[]>
  private readonly phasesByProject: ReadonlyMap<ProjectId, readonly Phase[]>
  private readonly childrenByTask: ReadonlyMap<TaskId, readonly Task[]>
  private readonly dependentsByTask: ReadonlyMap<TaskId, readonly Task[]>

  constructor(readonly dataset: Dataset) {
    this.projectsById = new Map(dataset.projects.map((p) => [p.id, p]))
    this.phasesById = new Map(dataset.phases.map((p) => [p.id, p]))
    this.tasksById = new Map(dataset.tasks.map((t) => [t.id, t]))
    this.actorsById = new Map(dataset.actors.map((a) => [a.id, a]))

    const tasksByProject = new Map<ProjectId, Task[]>()
    const childrenByTask = new Map<TaskId, Task[]>()
    const dependentsByTask = new Map<TaskId, Task[]>()
    for (const task of dataset.tasks) {
      push(tasksByProject, task.projectId, task)
      if (task.parentTaskId) push(childrenByTask, task.parentTaskId, task)
      for (const predecessorId of task.predecessorIds) push(dependentsByTask, predecessorId, task)
    }
    const phasesByProject = new Map<ProjectId, Phase[]>()
    for (const phase of dataset.phases) push(phasesByProject, phase.projectId, phase)

    this.tasksByProject = tasksByProject
    this.phasesByProject = phasesByProject
    this.childrenByTask = childrenByTask
    this.dependentsByTask = dependentsByTask
  }

  get projects(): readonly Project[] {
    return this.dataset.projects
  }

  get tasks(): readonly Task[] {
    return this.dataset.tasks
  }

  get actors(): readonly Actor[] {
    return this.dataset.actors
  }

  project(id: ProjectId): Project | null {
    return this.projectsById.get(id) ?? null
  }

  phase(id: PhaseId): Phase | null {
    return this.phasesById.get(id) ?? null
  }

  task(id: TaskId): Task | null {
    return this.tasksById.get(id) ?? null
  }

  actor(id: ActorId): Actor | null {
    return this.actorsById.get(id) ?? null
  }

  tasksOf(projectId: ProjectId): readonly Task[] {
    return this.tasksByProject.get(projectId) ?? EMPTY_TASKS
  }

  phasesOf(projectId: ProjectId): readonly Phase[] {
    return this.phasesByProject.get(projectId) ?? EMPTY_PHASES
  }

  milestonesOf(projectId: ProjectId): readonly Task[] {
    return this.tasksOf(projectId).filter((t) => t.isMilestone)
  }

  /** Direct subtasks only (A-04). */
  subtasksOf(taskId: TaskId): readonly Task[] {
    return this.childrenByTask.get(taskId) ?? EMPTY_TASKS
  }

  predecessorsOf(taskId: TaskId): readonly Task[] {
    const task = this.tasksById.get(taskId)
    if (!task) return EMPTY_TASKS
    const result: Task[] = []
    for (const id of task.predecessorIds) {
      const predecessor = this.tasksById.get(id)
      if (predecessor) result.push(predecessor)
    }
    return result
  }

  /** Tasks that list the given task as a predecessor. */
  dependentsOf(taskId: TaskId): readonly Task[] {
    return this.dependentsByTask.get(taskId) ?? EMPTY_TASKS
  }

  /**
   * Every task id on at least one predecessor cycle. Iterative DFS with colouring; O(V+E).
   */
  predecessorCycles(): ReadonlySet<TaskId> {
    const WHITE = 0
    const GRAY = 1
    const BLACK = 2
    const colour = new Map<TaskId, number>()
    const onCycle = new Set<TaskId>()

    for (const root of this.dataset.tasks) {
      if ((colour.get(root.id) ?? WHITE) !== WHITE) continue
      const stack: Array<{ id: TaskId; next: number }> = [{ id: root.id, next: 0 }]
      const path: TaskId[] = [root.id]
      colour.set(root.id, GRAY)

      while (stack.length > 0) {
        const frame = stack[stack.length - 1]!
        const task = this.tasksById.get(frame.id)
        const predecessorIds = task?.predecessorIds ?? []
        if (frame.next < predecessorIds.length) {
          const nextId = predecessorIds[frame.next]!
          frame.next += 1
          const state = colour.get(nextId) ?? WHITE
          if (state === WHITE && this.tasksById.has(nextId)) {
            colour.set(nextId, GRAY)
            stack.push({ id: nextId, next: 0 })
            path.push(nextId)
          } else if (state === GRAY) {
            const start = path.indexOf(nextId)
            for (let i = start; i < path.length; i += 1) onCycle.add(path[i]!)
          }
        } else {
          colour.set(frame.id, BLACK)
          stack.pop()
          path.pop()
        }
      }
    }
    return onCycle
  }

  /** Returns a new graph with the given entities replaced. Unknown ids are appended. */
  with(patch: {
    readonly projects?: readonly Project[]
    readonly tasks?: readonly Task[]
  }): WorkspaceGraph {
    const projects = replaceById(this.dataset.projects, patch.projects ?? [])
    const tasks = replaceById(this.dataset.tasks, patch.tasks ?? [])
    return new WorkspaceGraph({ ...this.dataset, projects, tasks })
  }
}

const EMPTY_TASKS: readonly Task[] = []
const EMPTY_PHASES: readonly Phase[] = []

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key)
  if (existing) existing.push(value)
  else map.set(key, [value])
}

function replaceById<T extends { readonly id: string }>(
  current: readonly T[],
  replacements: readonly T[],
): readonly T[] {
  if (replacements.length === 0) return current
  const byId = new Map(replacements.map((r) => [r.id, r]))
  const result = current.map((item) => byId.get(item.id) ?? item)
  const seen = new Set(current.map((item) => item.id))
  for (const replacement of replacements) if (!seen.has(replacement.id)) result.push(replacement)
  return result
}
