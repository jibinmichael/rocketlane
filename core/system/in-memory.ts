import type { Dataset, Project, Task, TimeEntry } from "@/core/domain/entities"
import { WorkspaceGraph } from "@/core/domain/graph"
import { parseProjectStatus } from "@/core/domain/status"
import { timeEntryId, type ActorId, type EntityRef } from "@/core/domain/ids"
import { type Clock, VirtualClock } from "@/core/system/clock"
import {
  ApiError,
  ConflictError,
  refOf,
  type StateChange,
  type SystemOfRecord,
  TimeoutError,
  type Unsubscribe,
  type WriteCommand,
  type WriteMeta,
  type WriteResult,
} from "@/core/system/system-of-record"

/**
 * Fault injection for the Test Lab and scenarios. `timeout_once` APPLIES the write and then
 * throws, modelling the genuinely ambiguous case; `fail_once` does not apply and throws ApiError.
 */
export type Fault =
  | { readonly kind: "timeout_once"; readonly match: FaultMatch }
  | { readonly kind: "fail_once"; readonly match: FaultMatch }
  | { readonly kind: "latency"; readonly ms: number }

export type FaultMatch = { readonly ref?: EntityRef; readonly commandKind?: WriteCommand["kind"] }

export type SerializedSystemState = {
  readonly dataset: Dataset
  readonly ledger: ReadonlyArray<readonly [string, WriteResult]>
  readonly changeCount: number
}

export class InMemorySystemOfRecord implements SystemOfRecord {
  private graph: WorkspaceGraph
  private readonly ledger: Map<string, WriteResult>
  private readonly listeners = new Set<(change: StateChange) => void>()
  private faults: Fault[] = []
  private changeCount: number
  readonly clock: Clock

  constructor(
    graph: WorkspaceGraph,
    options: {
      clock?: Clock
      ledger?: Iterable<readonly [string, WriteResult]>
      changeCount?: number
    } = {},
  ) {
    this.graph = graph
    this.clock = options.clock ?? new VirtualClock()
    this.ledger = new Map(options.ledger ?? [])
    this.changeCount = options.changeCount ?? 0
  }

  static restore(state: SerializedSystemState, clock?: Clock): InMemorySystemOfRecord {
    const sor = new InMemorySystemOfRecord(new WorkspaceGraph(state.dataset), {
      ledger: state.ledger,
      changeCount: state.changeCount,
      ...(clock ? { clock } : {}),
    })
    return sor
  }

  serialize(): SerializedSystemState {
    return {
      dataset: this.graph.dataset,
      ledger: [...this.ledger.entries()],
      changeCount: this.changeCount,
    }
  }

  /** Synchronous view for renderers; the engine uses the async port. */
  current(): WorkspaceGraph {
    return this.graph
  }

  /**
   * Adopt state persisted by another tab and surface the change that caused it as an ordinary
   * external StateChange (D-23). The other tab already applied and persisted the write.
   */
  adopt(state: SerializedSystemState, change: StateChange | null): void {
    this.graph = new WorkspaceGraph(state.dataset)
    this.ledger.clear()
    for (const [key, result] of state.ledger) this.ledger.set(key, result)
    this.changeCount = state.changeCount
    if (change)
      for (const listener of this.listeners)
        listener({ ...change, cause: "external", origin: "remote" })
  }

  injectFault(fault: Fault): void {
    this.faults.push(fault)
  }

  clearFaults(): void {
    this.faults = []
  }

  async snapshot(): Promise<WorkspaceGraph> {
    await this.latency()
    return this.graph
  }

  async read(ref: EntityRef): Promise<{ readonly version: number } | null> {
    await this.latency()
    return this.lookup(ref)
  }

  async write(cmd: WriteCommand, meta: WriteMeta): Promise<WriteResult> {
    await this.latency()
    const existing = this.ledger.get(meta.idempotencyKey)
    if (existing) return { ...existing, deduplicated: true }

    const ref = refOf(cmd)
    const before = this.lookup(ref)
    if (!before) throw new ApiError(`${ref.kind} ${ref.id} not found`)
    if (meta.expectedVersion !== null && before.version !== meta.expectedVersion) {
      throw new ConflictError(ref, meta.expectedVersion, before.version)
    }

    const failOnce = this.takeFault("fail_once", ref, cmd.kind)
    if (failOnce) throw new ApiError(`transient failure writing ${ref.kind}:${ref.id}`)

    const result = this.apply(cmd, meta.actorId, meta.correlationId, "agent", summaryOf(cmd))
    this.ledger.set(meta.idempotencyKey, result)

    const timeoutOnce = this.takeFault("timeout_once", ref, cmd.kind)
    if (timeoutOnce) throw new TimeoutError(meta.idempotencyKey)
    return result
  }

  async externalWrite(cmd: WriteCommand, actorId: ActorId, summary?: string): Promise<WriteResult> {
    const ref = refOf(cmd)
    if (!this.lookup(ref)) throw new ApiError(`${ref.kind} ${ref.id} not found`)
    return this.apply(
      cmd,
      actorId,
      `external:${this.changeCount + 1}`,
      "external",
      summary ?? summaryOf(cmd),
    )
  }

  subscribe(listener: (change: StateChange) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private apply(
    cmd: WriteCommand,
    actorId: ActorId,
    correlationId: string,
    cause: StateChange["cause"],
    summary: string,
  ): WriteResult {
    const ref = refOf(cmd)
    const previousVersion = this.lookup(ref)?.version ?? 0
    switch (cmd.kind) {
      case "complete_project": {
        const project = this.graph.project(cmd.projectId)!
        const next: Project = {
          ...project,
          status: "COMPLETED",
          rawStatus: "Completed",
          version: project.version + 1,
        }
        this.graph = this.graph.with({ projects: [next] })
        break
      }
      case "complete_task": {
        const task = this.graph.task(cmd.taskId)!
        const next: Task = {
          ...task,
          status: "COMPLETED",
          completedAt: new Date(this.clock.now()).toISOString().slice(0, 10),
          version: task.version + 1,
        }
        this.graph = this.graph.with({ tasks: [next] })
        break
      }
      case "set_task_status": {
        const task = this.graph.task(cmd.taskId)!
        const next: Task = {
          ...task,
          status: cmd.status,
          completedAt:
            cmd.status === "COMPLETED"
              ? (task.completedAt ?? new Date(this.clock.now()).toISOString().slice(0, 10))
              : null,
          version: task.version + 1,
        }
        this.graph = this.graph.with({ tasks: [next] })
        break
      }
      case "revert_task_status": {
        const task = this.graph.task(cmd.taskId)!
        const next: Task = {
          ...task,
          status: cmd.status,
          completedAt: cmd.status === "COMPLETED" ? task.completedAt : null,
          version: task.version + 1,
        }
        this.graph = this.graph.with({ tasks: [next] })
        break
      }
      case "revert_project_status": {
        const project = this.graph.project(cmd.projectId)!
        const next: Project = {
          ...project,
          status: parseProjectStatus(cmd.rawStatus),
          rawStatus: cmd.rawStatus,
          version: project.version + 1,
        }
        this.graph = this.graph.with({ projects: [next] })
        break
      }
      case "remove_time_entry": {
        const task = this.graph.task(cmd.taskId)!
        const next: Task = {
          ...task,
          timeEntries: task.timeEntries.filter((e) => e.id !== cmd.entryId),
          version: task.version + 1,
        }
        this.graph = this.graph.with({ tasks: [next] })
        break
      }
      case "add_time_entry": {
        const task = this.graph.task(cmd.taskId)!
        const entry: TimeEntry = {
          id: timeEntryId(`${task.id}:${task.timeEntries.length + 1}:${correlationId}`),
          taskId: task.id,
          hours: cmd.hours,
          actorId: cmd.actorId,
          at: new Date(this.clock.now()).toISOString().slice(0, 10),
        }
        const next: Task = {
          ...task,
          timeEntries: [...task.timeEntries, entry],
          version: task.version + 1,
        }
        this.graph = this.graph.with({ tasks: [next] })
        break
      }
    }
    const version = this.lookup(ref)!.version
    this.changeCount += 1
    const change: StateChange = {
      ref,
      projectId:
        ref.kind === "project"
          ? ref.id
          : ref.kind === "task"
            ? (this.graph.task(ref.id)?.projectId ?? null)
            : null,
      origin: "local",
      previousVersion,
      version,
      correlationId,
      actorId,
      cause,
      at: this.clock.now(),
      summary,
    }
    for (const listener of this.listeners) listener(change)
    return { applied: true, deduplicated: false, ref, version }
  }

  private lookup(ref: EntityRef): { readonly version: number } | null {
    switch (ref.kind) {
      case "project":
        return this.graph.project(ref.id)
      case "task":
        return this.graph.task(ref.id)
      case "phase":
        return this.graph.phase(ref.id)
    }
  }

  private takeFault(
    kind: "timeout_once" | "fail_once",
    ref: EntityRef,
    commandKind: WriteCommand["kind"],
  ): boolean {
    const index = this.faults.findIndex(
      (f) =>
        f.kind === kind &&
        (f.match.ref === undefined ||
          (f.match.ref.kind === ref.kind && f.match.ref.id === ref.id)) &&
        (f.match.commandKind === undefined || f.match.commandKind === commandKind),
    )
    if (index === -1) return false
    this.faults.splice(index, 1)
    return true
  }

  private async latency(): Promise<void> {
    const latency = this.faults.find((f) => f.kind === "latency")
    if (latency && latency.kind === "latency") await this.clock.sleep(latency.ms)
  }
}

function summaryOf(cmd: WriteCommand): string {
  switch (cmd.kind) {
    case "complete_project":
      return "project completed"
    case "complete_task":
      return "task completed"
    case "add_time_entry":
      return `${cmd.hours}h logged`
    case "set_task_status":
      return `status set to ${cmd.status}`
    case "revert_task_status":
      return `status reverted to ${cmd.status}`
    case "revert_project_status":
      return `status reverted to ${cmd.rawStatus}`
    case "remove_time_entry":
      return "logged time removed"
  }
}
