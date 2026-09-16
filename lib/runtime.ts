import type { Block, BlockAction } from "@/core/agent/conversation/blocks"
import { renderIntentReply, renderMission } from "@/core/agent/conversation/renderer"
import { DeterministicInterpreter } from "@/core/agent/intent/deterministic"
import { ground } from "@/core/agent/intent/ground"
import type { Intent, IntentProposal, InterpretationContext } from "@/core/agent/intent/intent"
import { proposeFromIntent } from "@/core/agent/planner"
import type { Actor } from "@/core/domain/entities"
import { WorkspaceGraph } from "@/core/domain/graph"
import type { ActorId, EntityRef, ProjectId } from "@/core/domain/ids"
import { MissionEngine } from "@/core/execution/engine"
import { RoleBasedPermissions } from "@/core/governance/permissions"
import { ingestTwoFileExport } from "@/core/ingestion/export-two-file"
import type { IngestionReport } from "@/core/ingestion/report"
import { type Mission, type MissionSummary, summarize } from "@/core/mission/mission"
import { BrowserClock } from "@/core/system/clock"
import { InMemorySystemOfRecord } from "@/core/system/in-memory"
import {
  type BroadcastMessage,
  eventPersistence,
  LocalStorageMissionStore,
  TabChannel,
  type ThreadEntry,
  threadPersistence,
  workspacePersistence,
} from "@/core/system/persistence"
import type { StateChange, WriteCommand } from "@/core/system/system-of-record"
import type { Scenario } from "@/core/evaluation/scenario"
import { type AgentEvent, EventLog } from "@/core/telemetry/events"

/**
 * Client composition root. Wires core adapters together, persists across reloads and tabs, and
 * exposes one immutable snapshot to React through useSyncExternalStore. Owns no domain rules.
 */

export type AgentSessionState =
  | "READY"
  | "UNDERSTANDING"
  | "PLANNING"
  | "CHECKING"
  | "WAITING_FOR_USER"
  | "EXECUTING"
  | "VERIFYING"
  | "RECHECKING"
  | "COMPLETED"
  | "ERROR"
  | "CANCELLED"

export type InterpreterMode = "model" | "deterministic"

export type FrozenEntry =
  | { readonly kind: "user"; readonly text: string; readonly at: number }
  | {
      readonly kind: "agent"
      readonly blocks: readonly Block[]
      readonly at: number
      readonly actionTaken: string | null
    }

export type RuntimeSnapshot = {
  readonly status: "booting" | "ready" | "error"
  readonly error: string | null
  readonly datasetId: string
  readonly datasetLabel: string
  readonly graph: WorkspaceGraph | null
  readonly report: IngestionReport | null
  readonly missions: readonly MissionSummary[]
  readonly actorId: ActorId | null
  readonly actors: readonly Actor[]
  readonly interpreterMode: InterpreterMode
  readonly lastInterpretedBy: "model" | "deterministic" | "local-fallback" | null
  readonly busy: Readonly<Record<string, AgentSessionState>>
  readonly events: readonly AgentEvent[]
  readonly revision: number
}

export type RemoteInterpreter = (
  utterance: string,
  ctx: InterpretationContext,
) => Promise<IntentProposal | null>

export type RuntimeOptions = {
  readonly loadFixture: (
    id: string,
  ) => Promise<{ id: string; projectsCsv: string; tasksCsv: string }>
  readonly remoteInterpreter?: RemoteInterpreter
  readonly defaultFixture?: string
}

const DATASET_LABELS: Record<string, string> = {
  "cascading-conflicts": "Demo workspace",
  "rocketlane-export": "Rocketlane export",
}

export class Runtime {
  private snapshot: RuntimeSnapshot
  private readonly listeners = new Set<() => void>()
  private sor: InMemorySystemOfRecord | null = null
  private engine: MissionEngine | null = null
  private store: LocalStorageMissionStore | null = null
  private readonly events = new EventLog()
  private readonly clock = new BrowserClock()
  private readonly deterministic = new DeterministicInterpreter()
  private threads: Record<string, ThreadEntry[]> = {}
  private channel: TabChannel | null = null
  private missionCounter = 0
  private lastChange: StateChange | null = null

  constructor(private readonly options: RuntimeOptions) {
    this.snapshot = {
      status: "booting",
      error: null,
      datasetId: "",
      datasetLabel: "",
      graph: null,
      report: null,
      missions: [],
      actorId: null,
      actors: [],
      interpreterMode: options.remoteInterpreter ? "model" : "deterministic",
      lastInterpretedBy: null,
      busy: {},
      events: [],
      revision: 0,
    }
  }

  // ---------------------------------------------------------------- React binding

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): RuntimeSnapshot => this.snapshot

  private publish(patch: Partial<RuntimeSnapshot> = {}): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      missions: this.store?.list() ?? [],
      graph: this.sor?.current() ?? this.snapshot.graph,
      events: this.events.all(),
      revision: this.snapshot.revision + 1,
    }
    for (const listener of this.listeners) listener()
  }

  // ---------------------------------------------------------------- Boot / datasets

  async boot(): Promise<void> {
    if (this.snapshot.status === "ready") return
    try {
      const persisted = workspacePersistence.load()
      if (persisted) {
        const sor = InMemorySystemOfRecord.restore(persisted.system, this.clock)
        this.install(sor, persisted.datasetId, null)
      } else {
        await this.loadFixtureById(this.options.defaultFixture ?? "cascading-conflicts")
      }
    } catch (error) {
      this.publish({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async loadFixtureById(id: string): Promise<void> {
    const files = await this.options.loadFixture(id)
    this.loadCsv(files.id, files.projectsCsv, files.tasksCsv)
  }

  loadCsv(datasetId: string, projectsCsv: string, tasksCsv: string): IngestionReport {
    const { graph, report } = ingestTwoFileExport({ datasetId, projectsCsv, tasksCsv })
    const sor = new InMemorySystemOfRecord(graph, { clock: this.clock })
    this.store?.clear()
    this.threads = {}
    threadPersistence.save({})
    this.events.restore([])
    eventPersistence.save([])
    this.install(sor, datasetId, report)
    this.persistWorkspace()
    this.channel?.post({ type: "dataset_replaced", datasetId })
    return report
  }

  async resetDataset(): Promise<void> {
    workspacePersistence.clear()
    await this.loadFixtureById(this.snapshot.datasetId || "cascading-conflicts")
  }

  private install(
    sor: InMemorySystemOfRecord,
    datasetId: string,
    report: IngestionReport | null,
  ): void {
    this.sor = sor
    this.store = new LocalStorageMissionStore()
    this.events.restore(eventPersistence.load())
    this.threads = threadPersistence.load()
    const engine = new MissionEngine({
      sor,
      permissions: new RoleBasedPermissions(),
      store: this.store,
      events: this.events,
      clock: this.clock,
      resolveActor: (id) => sor.current().actor(id),
    })
    engine.subscribe(() => {
      this.publish()
      this.channel?.post({ type: "missions_changed" })
    })
    this.events.subscribe(() => eventPersistence.save(this.events.all()))
    sor.subscribe((change) => {
      this.lastChange = change
      this.persistWorkspace()
      this.channel?.post({ type: "system_changed", change })
      this.publish()
    })
    this.engine = engine
    this.channel?.close()
    this.channel = new TabChannel((message) => this.onBroadcast(message))

    const actors = sor.current().actors
    const preferredActor =
      this.snapshot.actorId && actors.some((a) => a.id === this.snapshot.actorId)
        ? this.snapshot.actorId
        : (actors.find((a) => a.role === "owner")?.id ?? actors[0]?.id ?? null)
    this.publish({
      status: "ready",
      error: null,
      datasetId,
      datasetLabel: DATASET_LABELS[datasetId] ?? datasetId,
      report,
      actorId: preferredActor,
      actors,
    })
  }

  private persistWorkspace(): void {
    if (!this.sor) return
    workspacePersistence.save({
      datasetId: this.snapshot.datasetId,
      system: this.sor.serialize(),
      savedAt: this.clock.now(),
    })
  }

  private onBroadcast(message: BroadcastMessage): void {
    if (!this.sor || !this.store) return
    if (message.type === "system_changed") {
      const persisted = workspacePersistence.load()
      if (persisted) this.sor.adopt(persisted.system, message.change)
      this.publish()
    } else if (message.type === "missions_changed") {
      this.store.reload()
      this.threads = threadPersistence.load()
      this.publish()
    } else if (message.type === "dataset_replaced") {
      const persisted = workspacePersistence.load()
      if (persisted) {
        const sor = InMemorySystemOfRecord.restore(persisted.system, this.clock)
        this.install(sor, persisted.datasetId, null)
      }
    }
  }

  // ---------------------------------------------------------------- Actor

  setActor(id: ActorId): void {
    this.publish({ actorId: id })
  }

  setInterpreterMode(mode: InterpreterMode): void {
    this.publish({ interpreterMode: mode })
  }

  private actor(): Actor | null {
    const id = this.snapshot.actorId
    return id ? (this.sor?.current().actor(id) ?? null) : null
  }

  // ---------------------------------------------------------------- Missions and threads

  mission(id: string): Mission | null {
    return this.store?.load(id) ?? null
  }

  thread(missionId: string): readonly FrozenEntry[] {
    return (this.threads[missionId] ?? []).map((e) =>
      e.kind === "user"
        ? e
        : {
            kind: "agent",
            blocks: JSON.parse(e.blocksJson) as Block[],
            at: e.at,
            actionTaken: (e as { actionTaken?: string | null }).actionTaken ?? null,
          },
    )
  }

  /** Blocks not yet frozen into the thread: the live picture of the mission. */
  liveBlocks(missionId: string): readonly Block[] {
    const mission = this.mission(missionId)
    const graph = this.sor?.current()
    if (!mission || !graph) return []
    const frozen = new Set<string>()
    for (const entry of this.thread(missionId)) {
      if (entry.kind === "agent") for (const b of entry.blocks) frozen.add(blockKey(b))
    }
    return renderMission(mission, graph, this.events.forMission(missionId)).filter(
      (b) => !frozen.has(blockKey(b)),
    )
  }

  missionEvents(missionId: string): readonly AgentEvent[] {
    return this.events.forMission(missionId)
  }

  session(missionId: string): AgentSessionState {
    const busy = this.snapshot.busy[missionId]
    if (busy) return busy
    const mission = this.mission(missionId)
    if (!mission) return "READY"
    switch (mission.state) {
      case "READY":
        return "READY"
      case "ACTIVE":
        return "CHECKING"
      case "WAITING":
        return "WAITING_FOR_USER"
      case "EXECUTING":
        return "EXECUTING"
      case "VERIFYING":
        return "VERIFYING"
      case "STALE":
        return "RECHECKING"
      case "COMPLETED":
      case "PARTIALLY_COMPLETED":
        return "COMPLETED"
      case "CANCELLED":
        return "CANCELLED"
      case "BLOCKED":
      case "PERMISSION_DENIED":
        return "WAITING_FOR_USER"
      case "FAILED":
        return "ERROR"
    }
  }

  private freeze(missionId: string, actionTaken: string | null): void {
    const live = this.liveBlocks(missionId)
    if (live.length === 0 && !actionTaken) return
    const entries = this.threads[missionId] ?? []
    entries.push({
      kind: "agent",
      blocksJson: JSON.stringify(live),
      at: this.clock.now(),
      ...(actionTaken ? { actionTaken } : {}),
    } as ThreadEntry)
    this.threads[missionId] = entries
    threadPersistence.save(this.threads)
  }

  private pushUser(missionId: string, text: string): void {
    const entries = this.threads[missionId] ?? []
    entries.push({ kind: "user", text, at: this.clock.now() })
    this.threads[missionId] = entries
    threadPersistence.save(this.threads)
  }

  private pushAgent(missionId: string, blocks: readonly Block[]): void {
    if (blocks.length === 0) return
    const entries = this.threads[missionId] ?? []
    entries.push({
      kind: "agent",
      blocksJson: JSON.stringify(blocks),
      at: this.clock.now(),
    } as ThreadEntry)
    this.threads[missionId] = entries
    threadPersistence.save(this.threads)
  }

  private setBusy(missionId: string, state: AgentSessionState | null): void {
    const busy = { ...this.snapshot.busy }
    if (state) busy[missionId] = state
    else delete busy[missionId]
    this.publish({ busy })
  }

  // ---------------------------------------------------------------- Language in

  private async interpret(utterance: string, ctx: InterpretationContext): Promise<IntentProposal> {
    if (this.snapshot.interpreterMode === "model" && this.options.remoteInterpreter) {
      try {
        const proposal = await Promise.race([
          this.options.remoteInterpreter(utterance, ctx),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
        ])
        if (proposal) {
          this.publish({ lastInterpretedBy: "model" })
          return proposal
        }
      } catch {
        // fall through to the deterministic interpreter, visibly
      }
      this.publish({ lastInterpretedBy: "local-fallback" })
      return this.deterministic.interpret(utterance, ctx)
    }
    this.publish({ lastInterpretedBy: "deterministic" })
    return this.deterministic.interpret(utterance, ctx)
  }

  /**
   * One user turn. Returns the mission id the reply belongs to (a new one for a new goal).
   * Read intents stay in the current thread; write intents start a new mission (post-landing rule).
   */
  async send(utterance: string, missionId: string | null): Promise<string | null> {
    const graph = this.sor?.current()
    const actor = this.actor()
    if (!graph || !this.engine || !actor) return missionId
    const current = missionId ? this.mission(missionId) : null
    const scopeProject =
      current?.targets[0]?.kind === "project" ? (current.targets[0].id as ProjectId) : undefined
    const ctx: InterpretationContext = {
      entityNames: scopeProject
        ? graph.tasksOf(scopeProject).map((t) => t.name)
        : graph.projects.map((p) => p.name),
      hasActiveMission: current !== null && !isTerminalState(current.state),
      pendingDecision: current?.pending?.kind ?? null,
    }
    if (missionId) {
      this.setBusy(missionId, "UNDERSTANDING")
      this.freeze(missionId, null)
      this.pushUser(missionId, utterance)
    }
    const proposal = await this.interpret(utterance, ctx)
    const intent = ground(
      proposal,
      utterance,
      graph,
      scopeProject ? { projectId: scopeProject } : {},
    )
    const interpretedBy = intent.source === "model" ? "model" : "deterministic"

    // Write intents that start a mission.
    if (intent.kind === "complete_target" || intent.kind === "complete_task") {
      if (
        current &&
        !isTerminalState(current.state) &&
        intent.kind === "complete_task" &&
        intent.targets.length === 1
      ) {
        // Completing a task inside an active mission is out of the closed set of actions; treat as a new goal.
      }
      const newId = this.newMissionId()
      if (missionId) this.setBusy(missionId, null)
      this.pushUser(newId, utterance)
      this.setBusy(newId, "PLANNING")
      try {
        await this.engine.start(proposeFromIntent(intent, actor, newId), {
          datasetId: this.snapshot.datasetId,
          interpretedBy,
        })
      } finally {
        this.setBusy(newId, null)
      }
      return newId
    }

    if (!missionId || !current) {
      // No mission context: reply in a scratch thread attached to a synthetic id so the UI can show it.
      const scratchId = missionId ?? this.newMissionId("reply")
      this.pushUser(scratchId, utterance)
      this.pushAgent(scratchId, renderIntentReply(intent, graph, null))
      this.publish()
      return scratchId
    }

    try {
      await this.applyIntent(missionId, current, intent, graph)
    } finally {
      this.setBusy(missionId, null)
    }
    return missionId
  }

  private async applyIntent(
    missionId: string,
    mission: Mission,
    intent: Intent,
    graph: WorkspaceGraph,
  ): Promise<void> {
    if (!this.engine) return
    switch (intent.kind) {
      case "log_time": {
        const pending = mission.pending
        if (pending?.kind === "input_hours") {
          const step = mission.plan.find((s) => s.id === pending.stepId)
          const matches = intent.target === null || (step && step.ref.id === intent.target.id)
          if (matches) {
            this.setBusy(missionId, "EXECUTING")
            await this.engine.provideHours(missionId, pending.stepId, intent.hours)
            return
          }
        }
        this.pushAgent(
          missionId,
          renderIntentReply(
            {
              kind: "unsupported",
              reason: "no_target",
              query: null,
              utterance: intent.utterance,
              source: intent.source,
            },
            graph,
            mission,
          ),
        )
        return
      }
      case "approve":
        this.setBusy(missionId, "EXECUTING")
        await this.engine.approve(
          missionId,
          mission.pending?.kind === "confirm_step" ? mission.pending.stepId : null,
        )
        return
      case "decline":
        await this.engine.decline(
          missionId,
          mission.pending?.kind === "confirm_step" ? mission.pending.stepId : null,
        )
        return
      case "cancel":
        this.engine.cancel(missionId)
        return
      case "continue":
        this.setBusy(missionId, "RECHECKING")
        await this.engine.resume(missionId)
        return
      case "change_scope":
        this.pushAgent(missionId, renderIntentReply(intent, graph, mission))
        this.setBusy(missionId, "RECHECKING")
        await this.engine.changeScope(missionId, intent.exclude)
        return
      default:
        this.pushAgent(missionId, renderIntentReply(intent, graph, mission))
        this.publish()
    }
  }

  /** Inline block actions (buttons). */
  async act(
    missionId: string,
    action: BlockAction,
    payload: { hours?: number } = {},
  ): Promise<void> {
    const mission = this.mission(missionId)
    if (!mission || !this.engine) return
    const label =
      action.kind === "log_time" && payload.hours ? `Logged ${payload.hours}h` : action.label
    this.freeze(missionId, label)
    try {
      switch (action.kind) {
        case "approve":
          this.setBusy(missionId, "EXECUTING")
          await this.engine.approve(missionId, action.stepId)
          break
        case "decline":
          await this.engine.decline(missionId, action.stepId)
          break
        case "log_time":
          if (payload.hours && payload.hours > 0) {
            this.setBusy(missionId, "EXECUTING")
            await this.engine.provideHours(missionId, action.stepId, payload.hours)
          }
          break
        case "continue":
          this.setBusy(missionId, "RECHECKING")
          await this.engine.resume(missionId)
          break
        case "cancel":
          this.engine.cancel(missionId)
          break
        case "pick_candidate": {
          const actor = this.actor()
          if (!actor) break
          await this.engine.start(
            { missionId, goalText: mission.goalText, targets: [action.ref], excluded: [], actor },
            { datasetId: this.snapshot.datasetId },
          )
          break
        }
        case "view_activity":
        case "ask_owner":
          break
      }
    } finally {
      this.setBusy(missionId, null)
    }
  }

  /** Fault injection for the live workspace (Lab). */
  injectFault(fault: Parameters<InMemorySystemOfRecord["injectFault"]>[0]): void {
    this.sor?.injectFault(fault)
  }

  /**
   * Play a scenario's turns through the LIVE conversation (not the isolated evaluator), so the
   * demo can be driven from the Lab or a deep link. Returns the mission id to navigate to.
   */
  async playScenario(scenario: Scenario): Promise<string | null> {
    const graph = this.sor?.current()
    if (!graph) return null
    const actor = graph.actors.find((a) => a.name === scenario.actorName)
    if (actor) this.setActor(actor.id)
    const project = scenario.projectName
      ? graph.projects.find((p) => p.name === scenario.projectName)
      : null
    let missionId: string | null = null
    for (const turn of scenario.turns) {
      const mission = missionId ? this.mission(missionId) : null
      switch (turn.kind) {
        case "user":
          missionId = await this.send(turn.text, missionId)
          break
        case "hours":
          if (mission?.pending?.kind === "input_hours")
            await this.act(
              missionId!,
              { kind: "log_time", stepId: mission.pending.stepId, label: "Log time" },
              { hours: turn.hours },
            )
          break
        case "approve":
          if (mission?.pending?.kind === "confirm_step")
            await this.act(missionId!, {
              kind: "approve",
              stepId: mission.pending.stepId,
              label: "Confirm",
              impact: "high",
            })
          else if (mission?.pending?.kind === "confirm_plan")
            await this.act(missionId!, {
              kind: "approve",
              stepId: null,
              label: "Run",
              impact: "high",
            })
          break
        case "decline":
          if (mission?.pending)
            await this.act(missionId!, {
              kind: "decline",
              stepId: mission.pending.kind === "confirm_step" ? mission.pending.stepId : null,
              label: "Not now",
            })
          break
        case "world": {
          const pool = project ? graph.tasksOf(project.id) : graph.tasks
          const task = this.sor
            ?.current()
            .tasks.find((t) => pool.some((p) => p.id === t.id) && t.name === turn.task)
          const who = graph.actors.find((a) => a.name === turn.actorName) ?? actor
          if (task && who)
            await this.worldWrite(
              { kind: "set_task_status", taskId: task.id, status: turn.status },
              who.id,
              `set to ${turn.status.toLowerCase().replace("_", " ")}`,
            )
          break
        }
        case "fault": {
          const pool = project ? graph.tasksOf(project.id) : graph.tasks
          const task = pool.find((t) => t.name === turn.task)
          if (task)
            this.injectFault({ kind: turn.fault, match: { ref: { kind: "task", id: task.id } } })
          break
        }
      }
    }
    return missionId
  }

  /** The world acts (Lab mutator / demo). Bypasses governance: this is not the agent. */
  async worldWrite(cmd: WriteCommand, actorId: ActorId, summary?: string): Promise<void> {
    if (!this.sor) return
    await this.sor.externalWrite(cmd, actorId, summary)
    await this.engine?.idle()
    this.publish()
  }

  entityLabel(ref: EntityRef): string {
    const graph = this.sor?.current()
    if (!graph) return ref.id
    if (ref.kind === "project") return graph.project(ref.id)?.name ?? ref.id
    if (ref.kind === "task") return graph.task(ref.id)?.name ?? ref.id
    return graph.phase(ref.id)?.name ?? ref.id
  }

  private newMissionId(prefix = "m"): string {
    this.missionCounter += 1
    return `${prefix}-${this.clock.now().toString(36)}-${this.missionCounter}`
  }

  lastStateChange(): StateChange | null {
    return this.lastChange
  }
}

function blockKey(block: Block): string {
  return `${block.type}|${JSON.stringify(block.lines)}|${JSON.stringify(block.actions.map((a) => a.kind + ("stepId" in a ? a.stepId : "")))}`
}

function isTerminalState(state: Mission["state"]): boolean {
  return (
    state === "COMPLETED" ||
    state === "FAILED" ||
    state === "CANCELLED" ||
    state === "PARTIALLY_COMPLETED" ||
    state === "PERMISSION_DENIED"
  )
}

export { summarize }
