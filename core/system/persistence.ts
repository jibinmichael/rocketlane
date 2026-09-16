import { z } from "zod"

import type { Mission } from "@/core/mission/mission"
import type { MissionStore } from "@/core/mission/store"
import { summarize, type MissionSummary } from "@/core/mission/mission"
import { MissionsSchema } from "@/core/mission/schema"
import type { SerializedSystemState } from "@/core/system/in-memory"
import type { StateChange } from "@/core/system/system-of-record"
import { AGENT_EVENT_TYPES, type AgentEvent } from "@/core/telemetry/events"

/**
 * Browser persistence (D-05, D-23). localStorage is the shared truth between tabs; a
 * BroadcastChannel tells other tabs that it changed so a second tab's write arrives as an
 * ordinary external StateChange. Every accessor is guarded: storage can be unavailable.
 */

const KEY_PREFIX = "rga:v2:"

export type ThreadEntry =
  | { readonly kind: "user"; readonly text: string; readonly at: number }
  | {
      readonly kind: "agent"
      readonly blocksJson: string
      readonly at: number
      readonly actionTaken: string | null
    }

export type PersistedWorkspace = {
  readonly datasetId: string
  readonly system: SerializedSystemState
  readonly savedAt: number
}

/**
 * Nothing read from storage is trusted (spec §4: the mission is recoverable, not assumed).
 * A shape that fails validation is treated as absent, so a stale or corrupted browser state
 * yields a clean boot instead of an engine fed with garbage.
 */
const ThreadEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), text: z.string(), at: z.number() }),
  z.object({
    kind: z.literal("agent"),
    blocksJson: z.string(),
    at: z.number(),
    actionTaken: z.string().nullable(),
  }),
])
const ThreadsSchema = z.record(z.string(), z.array(ThreadEntrySchema))

const EventsSchema = z.array(
  z.object({
    id: z.string(),
    type: z.enum(AGENT_EVENT_TYPES),
    missionId: z.string(),
    at: z.number(),
    actorId: z.custom<AgentEvent["actorId"]>((v) => v === null || typeof v === "string"),
    refs: z.array(
      z.custom<AgentEvent["refs"][number]>(
        (v) =>
          typeof v === "object" &&
          v !== null &&
          "kind" in v &&
          "id" in v &&
          typeof (v as { id: unknown }).id === "string",
      ),
    ),
    detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  }),
)

/** Envelope only: the dataset graph is rebuilt and checked by `InMemorySystemOfRecord.restore`. */
const WorkspaceEnvelopeSchema = z.object({
  datasetId: z.string(),
  savedAt: z.number(),
  system: z.custom<SerializedSystemState>(
    (v) =>
      typeof v === "object" &&
      v !== null &&
      "dataset" in v &&
      Array.isArray((v as { ledger?: unknown }).ledger) &&
      typeof (v as { changeCount?: unknown }).changeCount === "number",
  ),
})

export type BroadcastMessage =
  | { readonly type: "system_changed"; readonly change: StateChange; readonly tabId: string }
  | { readonly type: "dataset_replaced"; readonly datasetId: string; readonly tabId: string }
  | { readonly type: "missions_changed"; readonly tabId: string }

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null
    return window.localStorage
  } catch {
    return null
  }
}

function read<T>(key: string, schema: z.ZodType<T>): T | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(KEY_PREFIX + key)
    if (!raw) return null
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(KEY_PREFIX + key, JSON.stringify(value))
  } catch {
    // Quota or privacy mode: the in-memory state remains authoritative for this tab.
  }
}

function remove(key: string): void {
  const s = storage()
  if (!s) return
  try {
    s.removeItem(KEY_PREFIX + key)
  } catch {
    // ignore
  }
}

export const workspacePersistence = {
  load(): PersistedWorkspace | null {
    return read("workspace", WorkspaceEnvelopeSchema)
  },
  save(workspace: PersistedWorkspace): void {
    write("workspace", workspace)
  },
  clear(): void {
    remove("workspace")
    remove("missions")
    remove("events")
    remove("threads")
  },
}

export class LocalStorageMissionStore implements MissionStore {
  private missions: Map<string, Mission>

  constructor() {
    this.missions = new Map(readMissions().map((m) => [m.id, m]))
  }

  load(id: string): Mission | null {
    return this.missions.get(id) ?? null
  }

  save(mission: Mission): void {
    this.missions.set(mission.id, mission)
    write("missions", [...this.missions.values()])
  }

  list(): readonly MissionSummary[] {
    return [...this.missions.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(summarize)
  }

  all(): readonly Mission[] {
    return [...this.missions.values()]
  }

  reload(): void {
    this.missions = new Map(readMissions().map((m) => [m.id, m]))
  }

  clear(): void {
    this.missions.clear()
    remove("missions")
  }
}

function readMissions(): readonly Mission[] {
  return read("missions", MissionsSchema) ?? []
}

export const eventPersistence = {
  load(): readonly AgentEvent[] {
    return read("events", EventsSchema) ?? []
  },
  save(events: readonly AgentEvent[]): void {
    write("events", events.slice(-2000))
  },
}

export const threadPersistence = {
  load(): Record<string, ThreadEntry[]> {
    return read("threads", ThreadsSchema) ?? {}
  },
  save(threads: Record<string, ThreadEntry[]>): void {
    write("threads", threads)
  },
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

export class TabChannel {
  private readonly channel: BroadcastChannel | null
  readonly tabId = `tab-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`

  constructor(private readonly onMessage: (message: BroadcastMessage) => void) {
    this.channel =
      typeof window !== "undefined" && "BroadcastChannel" in window
        ? new BroadcastChannel("rga:v1")
        : null
    this.channel?.addEventListener("message", (event: MessageEvent<BroadcastMessage>) => {
      if (event.data.tabId !== this.tabId) this.onMessage(event.data)
    })
  }

  post(message: DistributiveOmit<BroadcastMessage, "tabId">): void {
    this.channel?.postMessage({ ...message, tabId: this.tabId } as BroadcastMessage)
  }

  close(): void {
    this.channel?.close()
  }
}
