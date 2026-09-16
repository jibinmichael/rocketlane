import type { Mission } from "@/core/mission/mission"
import type { MissionStore } from "@/core/mission/store"
import { summarize, type MissionSummary } from "@/core/mission/mission"
import type { SerializedSystemState } from "@/core/system/in-memory"
import type { StateChange } from "@/core/system/system-of-record"
import type { AgentEvent } from "@/core/telemetry/events"

/**
 * Browser persistence (D-05, D-23). localStorage is the shared truth between tabs; a
 * BroadcastChannel tells other tabs that it changed so a second tab's write arrives as an
 * ordinary external StateChange. Every accessor is guarded: storage can be unavailable.
 */

const KEY_PREFIX = "rga:v1:"

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

function read<T>(key: string): T | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(KEY_PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
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
    return read<PersistedWorkspace>("workspace")
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
    const persisted = read<Mission[]>("missions") ?? []
    this.missions = new Map(persisted.map((m) => [m.id, m]))
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
    const persisted = read<Mission[]>("missions") ?? []
    this.missions = new Map(persisted.map((m) => [m.id, m]))
  }

  clear(): void {
    this.missions.clear()
    remove("missions")
  }
}

export const eventPersistence = {
  load(): readonly AgentEvent[] {
    return read<AgentEvent[]>("events") ?? []
  },
  save(events: readonly AgentEvent[]): void {
    write("events", events.slice(-2000))
  },
}

export const threadPersistence = {
  load(): Record<string, ThreadEntry[]> {
    return read<Record<string, ThreadEntry[]>>("threads") ?? {}
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
