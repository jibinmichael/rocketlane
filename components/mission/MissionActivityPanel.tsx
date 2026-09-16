"use client"

import { useEffect, useId, useState } from "react"

import { HeightReveal } from "@/components/shared/HeightReveal"

import { LinearIcon, type LinearIconName } from "@/components/shared/LinearIcon"
import type { Mission } from "@/core/mission/mission"
import type { AgentEvent, AgentEventType } from "@/core/telemetry/events"
import { useRuntimeSnapshot } from "@/hooks/use-runtime"
import { cn } from "@/lib/utils"

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
})

/** Human-readable label per event (spec §22, §25). Observable actions only; no reasoning is stored. */
const EVENT_LABEL: Record<AgentEventType, string> = {
  MISSION_STARTED: "Mission started",
  TARGET_RESOLVED: "Target found",
  PLAN_CREATED: "Flight plan created",
  PERMISSION_CHECKED: "Permission checked",
  INPUT_RECEIVED: "Input received",
  POLICY_CHECKED: "Policy checked",
  DEPENDENCY_FOUND: "Dependency traced",
  ACTION_REQUESTED: "Decision requested",
  ACTION_APPROVED: "Approved",
  ACTION_DECLINED: "Declined",
  ACTION_STARTED: "Update started",
  ACTION_COMPLETED: "Update verified",
  ACTION_FAILED: "Update failed",
  ACTION_SKIPPED: "Skipped",
  WRITE_TIMEOUT_RECONCILED: "Timeout reconciled",
  STATE_CHANGED: "Project changed externally",
  PAUSE_REQUESTED: "Pause requested",
  ACTION_RECONCILIATION_STARTED: "Finishing the update in progress",
  ACTION_RECONCILED: "Update in progress reconciled",
  MISSION_PAUSED: "Paused",
  MISSION_RESUMED: "Resumed",
  MISSION_REPLANNED: "Replanned",
  MISSION_WAITING: "Waiting for you",
  MISSION_BLOCKED: "Blocked",
  MISSION_COMPLETED: "Completed",
  MISSION_PARTIALLY_COMPLETED: "Completed with exceptions",
  MISSION_CANCELLED: "Stopped",
  MISSION_FAILED: "Failed",
  PERMISSION_DENIED: "Permission denied",
}

/** The Linear circle set, toned softly: done, failed, waiting, stopped, otherwise a quiet ring. */
const MARK: Partial<Record<AgentEventType, { icon: LinearIconName; tone: string }>> = {
  ACTION_COMPLETED: { icon: "check", tone: "text-state-completed/80" },
  MISSION_COMPLETED: { icon: "check", tone: "text-state-completed/80" },
  MISSION_PARTIALLY_COMPLETED: { icon: "check", tone: "text-state-completed/80" },
  ACTION_FAILED: { icon: "close", tone: "text-state-error/80" },
  MISSION_FAILED: { icon: "close", tone: "text-state-error/80" },
  PERMISSION_DENIED: { icon: "close", tone: "text-state-error/80" },
  MISSION_BLOCKED: { icon: "status-1", tone: "text-state-error/80" },
  ACTION_REQUESTED: { icon: "status-1", tone: "text-state-waiting/90" },
  MISSION_WAITING: { icon: "status-1", tone: "text-state-waiting/90" },
  INPUT_RECEIVED: { icon: "check", tone: "text-foreground/70" },
  STATE_CHANGED: { icon: "status-1", tone: "text-state-paused/90" },
  MISSION_PAUSED: { icon: "status-1", tone: "text-state-paused/90" },
  MISSION_CANCELLED: { icon: "close", tone: "text-state-paused/90" },
  WRITE_TIMEOUT_RECONCILED: { icon: "status-1", tone: "text-state-paused/90" },
}

/**
 * "View activity" as a second column beside the mission (activity audit, 2026-09-16): the
 * conversation is pushed, never covered. Level 3 is this mission's activity as a chronological
 * timeline from the audit log; level 4, one toggle away, is the audit evidence per event (actor,
 * refs, structured detail, ids). One event model, two representations.
 */
export function MissionActivityPanel({
  mission,
  onClose,
}: {
  mission: Mission
  onClose: () => void
}) {
  const snapshot = useRuntimeSnapshot()
  const [audit, setAudit] = useState(false)
  const titleId = useId()
  const graph = snapshot.graph
  const events = snapshot.events.filter((e) => e.missionId === mission.id)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const label = (ref: AgentEvent["refs"][number]) => {
    if (!graph) return ref.id
    if (ref.kind === "project") return graph.project(ref.id)?.name ?? ref.id
    if (ref.kind === "task") return graph.task(ref.id)?.name ?? ref.id
    return ref.id
  }
  const who = (e: AgentEvent) =>
    e.actorId && graph ? (graph.actor(e.actorId)?.name ?? e.actorId) : "system"

  return (
    <aside
      role="region"
      aria-labelledby={titleId}
      className="bg-card text-card-foreground border-border flex h-full w-[440px] flex-col border-l"
    >
      <header className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-muted-foreground text-[11px]">Mission activity</span>
          <h2 id={titleId} className="text-foreground truncate text-[13px] font-semibold">
            {mission.goalText}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close activity"
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)]"
        >
          <LinearIcon name="close" className="size-3.5" />
        </button>
      </header>

      <div className="flex items-center justify-between gap-3 px-5 py-2.5">
        <span className="text-muted-foreground text-[11px]">
          {events.length} {events.length === 1 ? "event" : "events"}, in the order they happened
        </span>
        <button
          type="button"
          onClick={() => setAudit((v) => !v)}
          aria-pressed={audit}
          className={cn(
            "h-7 rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-[var(--motion-fast)]",
            audit
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {audit ? "Hide audit detail" : "Show audit detail"}
        </button>
      </div>

      <ol className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <span aria-hidden className="bg-border absolute top-3 bottom-6 left-[26px] w-px" />
        {events.map((e) => {
          const why = typeof e.detail["reason"] === "string" ? e.detail["reason"] : null
          const verified = e.detail["verified"]
          const refs = e.refs.slice(0, 3).map(label).join(" → ")
          const mark = MARK[e.type] ?? { icon: "circle" as const, tone: "text-muted-foreground/50" }
          return (
            <li key={e.id} className="relative flex gap-3 py-2 pl-5">
              <span
                aria-hidden
                className="bg-card absolute top-[10px] left-[-6px] flex size-[13px] items-center justify-center"
              >
                <LinearIcon name={mark.icon} className={cn("size-[13px]", mark.tone)} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-foreground text-[13px]">{EVENT_LABEL[e.type]}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums">
                    {timeFormat.format(new Date(e.at))}
                  </span>
                </div>
                {(refs || why || verified !== undefined) && (
                  <span className="text-muted-foreground text-[12px]">
                    {refs}
                    {why ? `${refs ? " · " : ""}${why.replace(/_/g, " ").toLowerCase()}` : ""}
                    {verified === true
                      ? " · verified"
                      : verified === false
                        ? " · not verified"
                        : ""}
                  </span>
                )}
                <HeightReveal open={audit}>
                  <dl className="bg-muted/60 mt-1 grid grid-cols-[92px_1fr] gap-x-3 gap-y-0.5 rounded-lg px-2.5 py-2 text-[11px]">
                    <dt className="text-muted-foreground">event</dt>
                    <dd className="text-foreground truncate font-mono lowercase">{e.type}</dd>
                    <dt className="text-muted-foreground">actor</dt>
                    <dd className="text-foreground truncate">{who(e)}</dd>
                    {e.refs.length > 0 && (
                      <>
                        <dt className="text-muted-foreground">targets</dt>
                        <dd className="text-foreground font-mono break-all lowercase">
                          {e.refs.map((r) => `${r.kind}:${r.id}`).join(", ")}
                        </dd>
                      </>
                    )}
                    {Object.entries(e.detail).map(([k, v]) => (
                      <DetailRow key={k} k={k} v={v} />
                    ))}
                    <dt className="text-muted-foreground">id</dt>
                    <dd className="text-foreground truncate font-mono">{e.id}</dd>
                  </dl>
                </HeightReveal>
              </div>
            </li>
          )
        })}
        {events.length === 0 && (
          <li className="text-muted-foreground py-4 text-[13px]">No activity recorded yet.</li>
        )}
      </ol>
    </aside>
  )
}

function DetailRow({ k, v }: { k: string; v: string | number | boolean | null }) {
  return (
    <>
      <dt className="text-muted-foreground truncate">{k}</dt>
      <dd className="text-foreground font-mono break-all lowercase">
        {v === null ? "null" : String(v)}
      </dd>
    </>
  )
}
