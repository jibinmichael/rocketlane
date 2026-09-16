import { type Block, type BlockAction, carriesDecision } from "@/core/agent/conversation/blocks"
import { renderIntentReply, renderMission } from "@/core/agent/conversation/renderer"
import { DeterministicInterpreter } from "@/core/agent/intent/deterministic"
import { ground } from "@/core/agent/intent/ground"
import { reconcile } from "@/core/agent/intent/reconcile"
import type { Intent, IntentProposal, InterpretationContext } from "@/core/agent/intent/intent"
import { conduct } from "@/core/agent/conductor"
import type { Actor } from "@/core/domain/entities"
import { WorkspaceGraph } from "@/core/domain/graph"
import type { ActorId, ProjectId } from "@/core/domain/ids"
import { MissionEngine } from "@/core/execution/engine"
import { RoleBasedPermissions } from "@/core/governance/permissions"
import { ingestTwoFileExport } from "@/core/ingestion/export-two-file"
import type { IngestionReport } from "@/core/ingestion/report"
import type { Mission, MissionSummary } from "@/core/mission/mission"
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
import type { WriteCommand } from "@/core/system/system-of-record"
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
  | "PAUSING"
  | "PAUSED"
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

/** Measured 0.7–3 s per call on Haiku 4.5; the deterministic interpreter takes over visibly after this. */
const REMOTE_INTERPRETER_TIMEOUT_MS = 6500

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
  private disposers: Array<() => void> = []
  private readonly pendingWork = new Map<string, () => void>()

  /** Run one write per microtask per key: persistence and broadcasts never sit in the hot path twice. */
  private coalesce(key: string, work: () => void): void {
    const first = this.pendingWork.size === 0
    this.pendingWork.set(key, work)
    if (!first) return
    queueMicrotask(() => {
      const jobs = [...this.pendingWork.values()]
      this.pendingWork.clear()
      for (const job of jobs) job()
    })
  }

  dispose(): void {
    for (const d of this.disposers) d()
    this.disposers = []
    this.channel?.close()
    this.channel = null
  }

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
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    const engine = new MissionEngine({
      sor,
      permissions: new RoleBasedPermissions(),
      store: this.store,
      events: this.events,
      clock: this.clock,
      resolveActor: (id) => sor.current().actor(id),
    })
    this.disposers.push(
      engine.subscribe(() => {
        this.publish()
        this.coalesce("missions", () => this.channel?.post({ type: "missions_changed" }))
      }),
      this.events.subscribe(() =>
        this.coalesce("events", () => eventPersistence.save(this.events.all())),
      ),
      sor.subscribe((change) => {
        // Changes adopted from another tab are already persisted there; re-posting would ping-pong forever.
        if (change.origin === "local") {
          this.coalesce("workspace", () => this.persistWorkspace())
          this.channel?.post({ type: "system_changed", change })
        }
        this.publish()
      }),
    )
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
    return (this.threads[missionId] ?? []).flatMap((e): FrozenEntry[] => {
      if (e.kind === "user") return [e]
      const blocks = parseBlocks(e.blocksJson)
      return blocks ? [{ kind: "agent", blocks, at: e.at, actionTaken: e.actionTaken }] : []
    })
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

  session(missionId: string): AgentSessionState {
    const busy = this.snapshot.busy[missionId]
    if (busy) return busy
    const mission = this.mission(missionId)
    if (!mission) return "READY"
    if (mission.pauseRequested) return "PAUSING"
    switch (mission.state) {
      case "PAUSED":
        return "PAUSED"
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
        return "WAITING_FOR_USER"
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
    // A typed turn freezes the narrative but never the open decision: its buttons stay live so a
    // question asked while waiting ("why?") cannot strand the mission.
    const live = this.liveBlocks(missionId).filter(
      (b) => actionTaken !== null || !carriesDecision(b),
    )
    if (live.length === 0 && !actionTaken) return
    const entries = this.threads[missionId] ?? []
    entries.push({
      kind: "agent",
      blocksJson: JSON.stringify(live),
      at: this.clock.now(),
      actionTaken,
    })
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
      actionTaken: null,
    })
    this.threads[missionId] = entries
    threadPersistence.save(this.threads)
  }

  /** The decision block was on screen before the answer was typed; the record keeps that order. */
  private insertBeforeLastUser(
    missionId: string,
    blocks: readonly Block[],
    actionTaken: string,
  ): void {
    if (blocks.length === 0) return
    const entries = this.threads[missionId] ?? []
    let index = entries.length
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i]?.kind === "user") {
        index = i
        break
      }
    }
    entries.splice(index, 0, {
      kind: "agent",
      blocksJson: JSON.stringify(blocks),
      at: this.clock.now(),
      actionTaken,
    })
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
        let timer: ReturnType<typeof setTimeout> | undefined
        const proposal = await Promise.race([
          this.options.remoteInterpreter(utterance, ctx),
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), REMOTE_INTERPRETER_TIMEOUT_MS)
          }),
        ]).finally(() => clearTimeout(timer))
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
    // Empty input is not a turn: a waiting mission keeps waiting, nothing is written or replied.
    if (utterance.trim() === "") return missionId
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
    const groundingScope = {
      ...(scopeProject ? { projectId: scopeProject } : {}),
      actorId: actor.id,
    }
    // The grammar always runs; the model's grounded result can be vetoed by it (reconcile).
    const local = ground(
      this.deterministic.interpret(utterance, ctx),
      utterance,
      graph,
      groundingScope,
    )
    const proposal = await this.interpret(utterance, ctx)
    const remote =
      proposal.source === "model" ? ground(proposal, utterance, graph, groundingScope) : null
    const intent = reconcile(remote, local)
    if (remote && intent !== remote) this.publish({ lastInterpretedBy: "local-fallback" })
    const interpretedBy = intent.source === "model" ? "model" : "deterministic"

    // One conductor maps the grounded intent to exactly one engine command (shared with the Lab).
    // If this turn answers the open decision, its block freezes with a receipt, like a button would.
    const decision = missionId ? this.liveBlocks(missionId).filter(carriesDecision) : []
    const pendingBefore = current?.pending ?? null
    let startedId: string | null = null
    let outcome: Awaited<ReturnType<typeof conduct>>
    try {
      outcome = await conduct(this.engine, {
        intent,
        current,
        actor,
        datasetId: this.snapshot.datasetId,
        interpretedBy,
        nextMissionId: () => {
          const id = this.newMissionId()
          startedId = id
          if (missionId) this.setBusy(missionId, null)
          this.pushUser(id, utterance)
          return id
        },
        onBeforeApply: (session, grounded) => {
          const id = startedId ?? missionId
          if (!id) return
          if (grounded.kind === "change_scope")
            this.pushAgent(id, renderIntentReply(grounded, graph, current))
          if (session) this.setBusy(id, session)
        },
      })
    } finally {
      if (startedId) this.setBusy(startedId, null)
      else if (missionId) this.setBusy(missionId, null)
    }

    switch (outcome.kind) {
      case "started":
        return outcome.missionId
      case "applied": {
        const after = missionId ? this.mission(missionId) : null
        const receipt = receiptFor(intent, actor.name)
        if (
          missionId &&
          pendingBefore &&
          receipt &&
          resolvedPending(pendingBefore, after?.pending ?? null)
        ) {
          this.insertBeforeLastUser(missionId, decision, receipt)
        }
        return missionId
      }
      case "reply": {
        // No command to run: reply in the mission's thread, or in a scratch thread with a synthetic id.
        const scratchId = missionId ?? this.newMissionId("reply")
        if (!missionId) this.pushUser(scratchId, utterance)
        this.pushAgent(scratchId, renderIntentReply(outcome.intent, graph, current))
        this.publish()
        return scratchId
      }
    }
  }

  /** Inline block actions (buttons). */
  async act(missionId: string, action: BlockAction): Promise<string> {
    if (!this.engine) return missionId
    // A clarification in a scratch thread has no mission yet: picking a candidate starts one.
    if (action.kind === "pick_candidate") {
      const actor = this.actor()
      if (!actor) return missionId
      const utterance = [...(this.threads[missionId] ?? [])]
        .reverse()
        .find((e) => e.kind === "user")
      const goalText = utterance?.kind === "user" ? utterance.text : action.label
      const newId = this.newMissionId()
      this.freeze(missionId, action.label)
      this.pushUser(newId, goalText)
      this.setBusy(newId, "PLANNING")
      try {
        await this.engine.start(
          { missionId: newId, goalText, targets: [action.ref], excluded: [], actor },
          {
            datasetId: this.snapshot.datasetId,
            interpretedBy: this.snapshot.lastInterpretedBy === "model" ? "model" : "deterministic",
          },
        )
      } finally {
        this.setBusy(newId, null)
      }
      return newId
    }
    const mission = this.mission(missionId)
    if (!mission) return missionId
    const who = this.actor()?.name ?? "you"
    const label =
      action.kind === "approve"
        ? `Confirmed by ${who}`
        : action.kind === "decline"
          ? `Declined by ${who}`
          : action.label
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
        case "continue":
          this.setBusy(missionId, "RECHECKING")
          await this.engine.resume(missionId)
          break
        case "cancel":
          this.engine.cancel(missionId)
          break
        case "pause":
          this.engine.pause(missionId)
          break
        case "view_activity":
          break
      }
    } finally {
      this.setBusy(missionId, null)
    }
    return missionId
  }

  /** Fault injection for the live workspace (Lab). */
  injectFault(fault: Parameters<InMemorySystemOfRecord["injectFault"]>[0]): void {
    this.sor?.injectFault(fault)
  }

  /**
   * Play a scenario's turns through the LIVE conversation (not the isolated evaluator), so the
   * demo can be driven from the Lab or a deep link. Returns the mission id to navigate to.
   */

  /** The world acts (Lab mutator / demo). Bypasses governance: this is not the agent. */
  async worldWrite(cmd: WriteCommand, actorId: ActorId, summary?: string): Promise<void> {
    if (!this.sor) return
    await this.sor.externalWrite(cmd, actorId, summary)
    await this.engine?.idle()
    this.publish()
  }

  private newMissionId(prefix = "m"): string {
    this.missionCounter += 1
    return `${prefix}-${this.clock.now().toString(36)}-${this.missionCounter}`
  }
}

function blockKey(block: Block): string {
  return `${block.type}|${JSON.stringify(block.lines)}`
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

/** Frozen thread entries are our own renderer output; an unparseable one is dropped, never rendered. */
function parseBlocks(json: string): Block[] | null {
  try {
    const value: unknown = JSON.parse(json)
    // Structural check only: blocks are produced by `renderMission` and persisted verbatim.
    return Array.isArray(value) ? (value as Block[]) : null
  } catch {
    return null
  }
}

function resolvedPending(before: Mission["pending"], after: Mission["pending"]): boolean {
  if (!before) return false
  if (!after) return true
  if (after.kind !== before.kind) return true
  return "stepId" in after && "stepId" in before && after.stepId !== before.stepId
}

/** Receipt for a decision answered in the conversation; null when the turn was not an answer. */
function receiptFor(intent: Intent, who: string): string | null {
  switch (intent.kind) {
    case "log_time":
      return `Logged ${intent.hours} ${intent.hours === 1 ? "hour" : "hours"} by ${who}`
    case "approve":
      return `Confirmed by ${who}`
    case "decline":
      return `Declined by ${who}`
    default:
      return null
  }
}
