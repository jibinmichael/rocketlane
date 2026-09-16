"use client"

import { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"

import { LinearIcon } from "@/components/shared/LinearIcon"
import type { Mission } from "@/core/mission/mission"
import type { AgentEvent, AgentEventType } from "@/core/telemetry/events"
import { useRuntimeSnapshot } from "@/hooks/use-runtime"
import { settle } from "@/lib/motion"
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
  MISSION_COMPLETED: "Landed",
  MISSION_PARTIALLY_COMPLETED: "Landed with exceptions",
  MISSION_CANCELLED: "Stopped",
  MISSION_FAILED: "Failed",
  PERMISSION_DENIED: "Permission denied",
}

const TONE: Partial<Record<AgentEventType, string>> = {
  ACTION_COMPLETED: "bg-state-completed border-state-completed",
  MISSION_COMPLETED: "bg-state-completed border-state-completed",
  MISSION_PARTIALLY_COMPLETED: "bg-state-completed border-state-completed",
  ACTION_FAILED: "bg-state-error border-state-error",
  MISSION_FAILED: "bg-state-error border-state-error",
  PERMISSION_DENIED: "bg-state-blocked border-state-blocked",
  MISSION_BLOCKED: "bg-state-blocked border-state-blocked",
  STATE_CHANGED: "bg-state-paused border-state-paused",
  MISSION_PAUSED: "bg-state-paused border-state-paused",
  WRITE_TIMEOUT_RECONCILED: "bg-state-paused border-state-paused",
  ACTION_REQUESTED: "bg-state-waiting border-state-waiting",
  MISSION_WAITING: "bg-state-waiting border-state-waiting",
  INPUT_RECEIVED: "bg-foreground border-foreground",
}

/**
 * "View activity" as contextual inspection (activity audit, 2026-09-16): a side panel over the
 * mission, never a page. Level 3 is the mission's activity as a chronological timeline from the
 * audit log; level 4, one toggle away, is the audit evidence per event (actor, refs, structured
 * detail, ids). One event model, two representations; the conversation stays where it was.
 */
export function MissionActivityPanel({
  mission,
  open,
  onClose,
}: {
  mission: Mission | null
  open: boolean
  onClose: () => void
}) {
  const snapshot = useRuntimeSnapshot()
  const [audit, setAudit] = useState(false)
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const graph = snapshot.graph
  const events = mission ? snapshot.events.filter((e) => e.missionId === mission.id) : []

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      window.removeEventListener("keydown", onKey)
      previous?.focus()
    }
  }, [open, onClose])

  const label = (ref: AgentEvent["refs"][number]) => {
    if (!graph) return ref.id
    if (ref.kind === "project") return graph.project(ref.id)?.name ?? ref.id
    if (ref.kind === "task") return graph.task(ref.id)?.name ?? ref.id
    return ref.id
  }
  const who = (e: AgentEvent) =>
    e.actorId && graph ? (graph.actor(e.actorId)?.name ?? e.actorId) : "system"

  return (
    <AnimatePresence>
      {open && mission && (
        <motion.div
          key="activity-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-40 bg-black/10"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 16, opacity: 0 }}
            transition={settle}
            className="bg-card text-card-foreground border-border absolute inset-y-0 right-0 flex w-[460px] max-w-[calc(100vw-1rem)] flex-col border-l shadow-[var(--shadow-lg)] outline-none"
          >
            <header className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-muted-foreground text-[12px]">Mission activity</span>
                <h2 id={titleId} className="text-foreground truncate text-[14px] font-semibold">
                  {mission.goalText}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)]"
              >
                <LinearIcon name="close" className="size-3.5" />
              </button>
            </header>

            <div className="flex items-center justify-between gap-3 px-5 py-2.5">
              <span className="text-muted-foreground text-[12px]">
                {events.length} {events.length === 1 ? "event" : "events"}, in the order they
                happened
              </span>
              <button
                type="button"
                onClick={() => setAudit((v) => !v)}
                aria-pressed={audit}
                className={cn(
                  "h-7 rounded-full border px-2.5 text-[12px] font-medium transition-colors duration-[var(--motion-fast)]",
                  audit
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {audit ? "Hide audit detail" : "Show audit detail"}
              </button>
            </div>

            <ol className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              <span aria-hidden className="bg-border absolute top-2 bottom-6 left-[27px] w-px" />
              {events.map((e) => {
                const why = typeof e.detail["reason"] === "string" ? e.detail["reason"] : null
                const verified = e.detail["verified"]
                const refs = e.refs.slice(0, 3).map(label).join(" → ")
                return (
                  <li key={e.id} className="relative flex gap-3 py-2 pl-5">
                    <span
                      aria-hidden
                      className={cn(
                        "bg-card absolute top-[13px] left-0 size-[7px] rounded-[1.5px] border",
                        TONE[e.type] ?? "border-muted-foreground/50",
                      )}
                    />
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
                      {audit && (
                        <dl className="bg-muted/60 mt-1 grid grid-cols-[92px_1fr] gap-x-3 gap-y-0.5 rounded-lg px-2.5 py-2 text-[11px]">
                          <dt className="text-muted-foreground">event</dt>
                          <dd className="text-foreground truncate font-mono lowercase">{e.type}</dd>
                          <dt className="text-muted-foreground">actor</dt>
                          <dd className="text-foreground truncate">{who(e)}</dd>
                          {e.refs.length > 0 && (
                            <>
                              <dt className="text-muted-foreground">targets</dt>
                              <dd className="text-foreground font-mono break-all">
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
                      )}
                    </div>
                  </li>
                )
              })}
              {events.length === 0 && (
                <li className="text-muted-foreground py-4 text-[13px]">
                  No activity recorded yet.
                </li>
              )}
            </ol>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
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
