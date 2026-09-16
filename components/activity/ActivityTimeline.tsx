"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { Body, H1 } from "@/components/shared/Typography"
import type { AgentEvent, AgentEventType } from "@/core/telemetry/events"
import { useRuntimeSnapshot } from "@/hooks/use-runtime"
import { cn } from "@/lib/utils"

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
})

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
  ACTION_STARTED: "Write started",
  ACTION_COMPLETED: "Write verified",
  ACTION_FAILED: "Write failed",
  ACTION_SKIPPED: "Skipped",
  WRITE_TIMEOUT_RECONCILED: "Timeout reconciled",
  STATE_CHANGED: "Project changed externally",
  MISSION_PAUSED: "Paused",
  MISSION_REPLANNED: "Replanned",
  MISSION_WAITING: "Waiting",
  MISSION_BLOCKED: "Blocked",
  MISSION_COMPLETED: "Landed",
  MISSION_PARTIALLY_COMPLETED: "Landed with exceptions",
  MISSION_CANCELLED: "Stopped",
  MISSION_FAILED: "Failed",
  PERMISSION_DENIED: "Permission denied",
}

const TONE: Partial<Record<AgentEventType, string>> = {
  ACTION_COMPLETED: "bg-state-completed",
  MISSION_COMPLETED: "bg-state-completed",
  ACTION_FAILED: "bg-state-error",
  MISSION_FAILED: "bg-state-error",
  PERMISSION_DENIED: "bg-state-blocked",
  MISSION_BLOCKED: "bg-state-blocked",
  STATE_CHANGED: "bg-state-paused",
  MISSION_PAUSED: "bg-state-paused",
  WRITE_TIMEOUT_RECONCILED: "bg-state-paused",
  ACTION_REQUESTED: "bg-state-waiting",
}

/** Black box (spec §22, §25): who · what · why · when · result · verified. Observable actions only. */
export function ActivityTimeline() {
  const snapshot = useRuntimeSnapshot()
  const params = useSearchParams()
  const missionFilter = params.get("mission")
  const events = [...snapshot.events]
    .filter((e) => !missionFilter || e.missionId === missionFilter)
    .reverse()
  const graph = snapshot.graph

  const label = (ref: AgentEvent["refs"][number]) => {
    if (!graph) return ref.id
    if (ref.kind === "project") return graph.project(ref.id)?.name ?? ref.id
    if (ref.kind === "task") return graph.task(ref.id)?.name ?? ref.id
    return ref.id
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <H1 className="text-[20px] tracking-[-0.01em]">Activity</H1>
        <Body muted className="text-[13px]">
          Every observable action, decision, state and reason, in order. No reasoning is shown
          because none is stored.
          {missionFilter && (
            <>
              {" "}
              Filtered to one mission ·{" "}
              <Link href="/activity" className="text-foreground underline underline-offset-2">
                show all
              </Link>
            </>
          )}
        </Body>
      </div>
      {events.length === 0 ? (
        <Body muted className="text-[13px]">
          No activity yet.
        </Body>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {events.slice(0, 400).map((e) => {
            const who = e.actorId && graph ? (graph.actor(e.actorId)?.name ?? e.actorId) : "system"
            const why = typeof e.detail["reason"] === "string" ? e.detail["reason"] : null
            const verified = e.detail["verified"]
            return (
              <li
                key={e.id}
                className="grid grid-cols-[76px_10px_180px_1fr_120px] items-center gap-3 px-3 py-2"
              >
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {timeFormat.format(new Date(e.at))}
                </span>
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", TONE[e.type] ?? "bg-border")}
                />
                <span className="text-foreground truncate text-[13px]">{EVENT_LABEL[e.type]}</span>
                <span className="text-muted-foreground truncate text-[12px]">
                  {e.refs.slice(0, 3).map(label).join(" → ")}
                  {why ? ` · ${why.replace(/_/g, " ").toLowerCase()}` : ""}
                  {verified === true ? " · verified" : verified === false ? " · not verified" : ""}
                </span>
                <span className="text-muted-foreground truncate text-right text-[12px]">
                  <Link href={`/m/${e.missionId}`} className="hover:text-foreground">
                    {who}
                  </Link>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
