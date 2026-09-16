"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { ConversationIcon } from "@/components/conversation/ConversationIcon"
import { LinearIcon } from "@/components/shared/LinearIcon"
import type { Block, SemanticIcon } from "@/core/agent/conversation/blocks"
import type { Mission } from "@/core/mission/mission"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"
import { cn } from "@/lib/utils"

/**
 * Mission history behind the current title (ClickUp Brain pattern: the conversation name is a
 * dropdown of past conversations). On the home it reads "Missions"; on a mission it reads the
 * goal. Rows are grouped by day, needs-you first; "New mission" returns home.
 */
export function MissionHistoryMenu() {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [now] = useState(() => Date.now())

  const currentId = pathname?.startsWith("/m/") ? pathname.slice(3) : null
  const current = currentId && snapshot.status === "ready" ? runtime.mission(currentId) : null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onDown)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onDown)
    }
  }, [open])

  // Route changes close the menu: state adjusted during render, not in an effect.
  const [seenPath, setSeenPath] = useState(pathname)
  if (pathname !== seenPath) {
    setSeenPath(pathname)
    setOpen(false)
  }

  const missions =
    snapshot.status === "ready"
      ? snapshot.missions
          .map((s) => runtime.mission(s.id))
          .filter((m): m is Mission => m !== null)
          .sort((a, b) => (a.pending ? 0 : 1) - (b.pending ? 0 : 1) || b.updatedAt - a.updatedAt)
      : []
  const groups = groupByDay(missions, now)

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        className="text-foreground hover:bg-muted flex h-8 max-w-[420px] min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-[var(--motion-fast)]"
      >
        <span className="truncate">{current ? current.goalText : "Missions"}</span>
        <LinearIcon name="chevron-down" className="text-muted-foreground size-3 shrink-0" />
      </button>
      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label="Mission history"
          className="border-border bg-card text-card-foreground absolute top-full left-0 z-30 mt-1.5 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border p-1.5 shadow-[var(--shadow-lg)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              router.push("/")
            }}
            className="text-foreground hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-[var(--motion-fast)]"
          >
            <LinearIcon name="plus" className="text-muted-foreground size-3.5" />
            New mission
          </button>
          {groups.length === 0 ? (
            <p className="text-muted-foreground px-2.5 py-2 text-[12px]">
              Nothing yet. The first outcome you state starts one.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {groups.map((g) => (
                <div key={g.label} className="pt-1.5">
                  <span className="text-muted-foreground block px-2.5 pb-1 text-[12px] font-medium">
                    {g.label}
                  </span>
                  {g.items.map((m) => {
                    const { icon, tone } = presentation(m)
                    return (
                      <Link
                        key={m.id}
                        role="menuitem"
                        href={`/m/${m.id}`}
                        className={cn(
                          "hover:bg-muted flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors duration-[var(--motion-fast)]",
                          m.id === currentId && "bg-muted/70",
                        )}
                      >
                        <span className="flex w-4 shrink-0 justify-center">
                          <ConversationIcon name={icon} tone={tone} />
                        </span>
                        <span className="text-foreground min-w-0 flex-1 truncate">
                          {m.goalText}
                        </span>
                        {m.pending && (
                          <span className="text-state-waiting shrink-0 text-[11px] font-medium">
                            Needs you
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function presentation(mission: Mission): { icon: SemanticIcon; tone: Block["tone"] } {
  switch (mission.state) {
    case "COMPLETED":
      return { icon: "landing", tone: "success" }
    case "PARTIALLY_COMPLETED":
      return { icon: "landing", tone: "waiting" }
    case "WAITING":
      return { icon: "person", tone: "waiting" }
    case "PAUSED":
    case "STALE":
      return { icon: "pause", tone: "paused" }
    case "BLOCKED":
    case "PERMISSION_DENIED":
      return { icon: "blocker", tone: "blocked" }
    case "FAILED":
      return { icon: "error", tone: "error" }
    case "CANCELLED":
      return { icon: "cancel", tone: "paused" }
    default:
      return { icon: "execution", tone: "neutral" }
  }
}

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" })
const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })

function groupByDay(missions: readonly Mission[], now: number) {
  const today = new Date(now)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const day = 86_400_000
  const label = (at: number) => {
    if (at >= start) return "Today"
    if (at >= start - day) return "Yesterday"
    if (at >= start - 6 * day) return weekday.format(new Date(at))
    return date.format(new Date(at))
  }
  const out: { label: string; items: Mission[] }[] = []
  for (const m of missions) {
    const l = label(m.updatedAt)
    const g = out.find((x) => x.label === l)
    if (g) g.items.push(m)
    else out.push({ label: l, items: [m] })
  }
  return out
}
