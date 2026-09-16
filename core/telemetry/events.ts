import type { ActorId, EntityRef } from "@/core/domain/ids"

/**
 * Observable system events (spec §36). The activity view and the test harness consume these.
 * Never chain-of-thought: every event is an action, decision, state or reason.
 */

export type AgentEventType =
  | "MISSION_STARTED"
  | "TARGET_RESOLVED"
  | "PLAN_CREATED"
  | "POLICY_CHECKED"
  | "DEPENDENCY_FOUND"
  | "ACTION_REQUESTED"
  | "ACTION_APPROVED"
  | "ACTION_DECLINED"
  | "ACTION_STARTED"
  | "ACTION_COMPLETED"
  | "ACTION_FAILED"
  | "ACTION_SKIPPED"
  | "WRITE_TIMEOUT_RECONCILED"
  | "STATE_CHANGED"
  | "MISSION_PAUSED"
  | "MISSION_REPLANNED"
  | "MISSION_WAITING"
  | "MISSION_BLOCKED"
  | "MISSION_COMPLETED"
  | "MISSION_PARTIALLY_COMPLETED"
  | "MISSION_CANCELLED"
  | "MISSION_FAILED"
  | "PERMISSION_DENIED"

export type AgentEvent = {
  readonly id: string
  readonly type: AgentEventType
  readonly missionId: string
  readonly at: number
  readonly actorId: ActorId | null
  readonly refs: readonly EntityRef[]
  /** Structured detail; the renderer turns it into copy. */
  readonly detail: Readonly<Record<string, string | number | boolean | null>>
}

export class EventLog {
  private readonly events: AgentEvent[] = []
  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private counter = 0

  append(event: Omit<AgentEvent, "id">): AgentEvent {
    this.counter += 1
    const full: AgentEvent = { ...event, id: `evt-${this.counter}` }
    this.events.push(full)
    for (const listener of this.listeners) listener(full)
    return full
  }

  all(): readonly AgentEvent[] {
    return this.events
  }

  forMission(missionId: string): readonly AgentEvent[] {
    return this.events.filter((e) => e.missionId === missionId)
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  restore(events: readonly AgentEvent[]): void {
    this.events.splice(0, this.events.length, ...events)
    this.counter = events.length
  }
}

/** Audit record per mission (spec §22): who, what, why, when, result, verify. */
export type AuditEntry = {
  readonly who: ActorId | null
  readonly what: AgentEventType
  readonly why: string | null
  readonly when: number
  readonly result: string | null
  readonly verified: boolean | null
  readonly refs: readonly EntityRef[]
}

export function auditFor(events: readonly AgentEvent[]): readonly AuditEntry[] {
  return events.map((e) => ({
    who: e.actorId,
    what: e.type,
    why: typeof e.detail["reason"] === "string" ? e.detail["reason"] : null,
    when: e.at,
    result: typeof e.detail["result"] === "string" ? e.detail["result"] : null,
    verified: typeof e.detail["verified"] === "boolean" ? e.detail["verified"] : null,
    refs: e.refs,
  }))
}
