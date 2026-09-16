"use client"

import { useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"

import { AgentDataDialog } from "@/components/agent/AgentDataDialog"
import { AgentPresence } from "@/components/agent/AgentPresence"
import { ConversationComposer } from "@/components/conversation/ConversationComposer"
import { MissionHistoryRow } from "@/components/mission/MissionHistoryRow"
import { MissionQuickActions, quickActionsFor } from "@/components/mission/MissionQuickActions"
import { LinearIcon } from "@/components/shared/LinearIcon"
import { Body } from "@/components/shared/Typography"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"
import { settle } from "@/lib/motion"

const AGENT_NAME = "Governance Agent"

/**
 * The agent's front door (final brief §5, §26; docs/design/visual-direction.md). Two entrances:
 * the landing (presence, one greeting, composer, suggested rows, recent missions) and, from
 * "New chat", chat mode: the greeting as the agent's first turn with suggestion chips and the
 * composer already at the bottom. On send the composer settles to where the mission page keeps it.
 */
export function MissionHomeList() {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const router = useRouter()
  const params = useSearchParams()
  const chat = params.get("chat") === "1"
  const [sending, setSending] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [fill, setFill] = useState<{ text: string; key: number } | null>(null)
  const [recentOpen, setRecentOpen] = useState(true)
  const [recentAll, setRecentAll] = useState(false)
  const fillKey = useRef(0)
  // Relative times are computed against the moment the page rendered; rows never re-tick.
  const [now] = useState(() => Date.now())

  const onSend = async (text: string) => {
    setSending(true)
    try {
      const id = await runtime.send(text, null)
      if (id) router.push(`/m/${id}`)
      else setSending(false)
    } catch {
      setSending(false)
    }
  }

  const graph = snapshot.graph
  const firstProject =
    graph?.projects.find((p) => p.ownerId === snapshot.actorId)?.name ??
    graph?.projects[0]?.name ??
    null
  const actions = quickActionsFor(firstProject)
  const pick = (a: (typeof actions)[number]) => {
    if (a.fill === null) setDataOpen(true)
    else {
      fillKey.current += 1
      setFill({ text: a.fill, key: fillKey.current })
    }
  }

  const missions = snapshot.missions
    .map((s) => runtime.mission(s.id))
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => {
      const aNeeds = a.pending ? 0 : 1
      const bNeeds = b.pending ? 0 : 1
      return aNeeds - bNeeds || b.updatedAt - a.updatedAt
    })
  const recent = recentAll ? missions : missions.slice(0, 3)

  const composer = (
    <ConversationComposer
      onSend={(t) => void onSend(t)}
      onAttach={() => setDataOpen(true)}
      disabled={snapshot.status !== "ready" || sending}
      autoFocus
      placeholder="State an outcome."
      fill={fill}
    />
  )
  const trust = sending ? (
    <div className="flex items-center gap-2 pt-1">
      <AgentPresence state="working" size={18} />
      <Body muted className="text-[12px]">
        Preparing mission
      </Body>
    </div>
  ) : (
    <p className="text-muted-foreground text-center text-[11px]">
      AI can make mistakes. Consequential changes are verified before they&apos;re treated as
      complete.
    </p>
  )

  if (chat) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-6 pt-8 pb-4">
            <div className="flex gap-3">
              <span className="flex w-5 shrink-0 justify-center pt-px">
                <AgentPresence state={sending ? "working" : "idle"} size={20} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-foreground text-[13px] font-semibold">{AGENT_NAME}</span>
                <p className="text-foreground text-[15px] leading-[22px]">
                  Your projects are already moving. I&apos;ll help keep them on course. State an
                  outcome and I&apos;ll check governance, trace blockers, make the authorized
                  changes and verify the result.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {actions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => pick(a)}
                      className="group border-border text-foreground hover:border-foreground/30 flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors duration-[var(--motion-fast)]"
                    >
                      <LinearIcon name={a.icon} className="icon-vibe size-3.5" />
                      <span className="text-vibe-hover">{a.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 px-6 pt-2 pb-5">
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-2">
            {composer}
            <div className="min-h-4 px-1" aria-live="polite">
              {trust}
            </div>
          </div>
        </div>
        <AgentDataDialog open={dataOpen} onClose={() => setDataOpen(false)} />
      </div>
    )
  }

  return (
    <LayoutGroup>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-6">
          <AnimatePresence initial={false}>
            {!sending && (
              <motion.div
                key="hero"
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12, transition: { duration: 0.18 } }}
                transition={settle}
                className="flex flex-1 flex-col items-center justify-end gap-5 pt-16 pb-6 text-center"
              >
                <AgentPresence state="idle" size={56} />
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-foreground text-[20px] leading-[1.3] font-semibold tracking-[-0.015em]">
                    Your projects are already moving. I&apos;ll help keep them on course.
                  </h1>
                  <p className="text-muted-foreground text-[13px] leading-[1.55]">
                    Check governance, trace blockers, make authorized changes, verify the result.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            layout
            transition={settle}
            className={sending ? "mt-auto pb-5" : "flex flex-col gap-2"}
          >
            {composer}
            <div className="min-h-4 px-1" aria-live="polite">
              {trust}
            </div>
          </motion.div>

          <AnimatePresence initial={false}>
            {!sending && (
              <motion.div
                key="below"
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.14 } }}
                transition={settle}
                className="flex flex-1 flex-col gap-6 pt-6 pb-12"
              >
                <MissionQuickActions actions={actions} onPick={pick} />
                <section className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setRecentOpen((v) => !v)}
                    aria-expanded={recentOpen}
                    className="text-muted-foreground hover:text-foreground flex h-7 w-fit items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium transition-colors duration-[var(--motion-fast)]"
                  >
                    Recent
                    <LinearIcon
                      name="chevron-down"
                      rotate={recentOpen ? 0 : -90}
                      className="size-3 transition-transform duration-[var(--motion-fast)]"
                    />
                  </button>
                  {!recentOpen ? null : snapshot.status === "error" ? (
                    <Body className="text-state-error px-2.5 text-[13px]">
                      The workspace could not load: {snapshot.error}. Use the workspace menu to
                      reset the project data.
                    </Body>
                  ) : snapshot.status !== "ready" ? (
                    <Body muted className="px-2.5 text-[13px]">
                      Loading workspace…
                    </Body>
                  ) : missions.length === 0 ? (
                    <Body muted className="px-2.5 text-[13px]">
                      Nothing yet. The first outcome you state starts one.
                    </Body>
                  ) : (
                    <ul className="flex flex-col">
                      {recent.map((m) => (
                        <MissionHistoryRow key={m.id} mission={m} now={now} />
                      ))}
                      {missions.length > 3 && (
                        <li>
                          <button
                            type="button"
                            onClick={() => setRecentAll((v) => !v)}
                            className="text-muted-foreground hover:text-foreground h-8 px-2.5 text-[12px] font-medium transition-colors duration-[var(--motion-fast)]"
                          >
                            {recentAll ? "Show fewer" : `Show all ${missions.length}`}
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <AgentDataDialog open={dataOpen} onClose={() => setDataOpen(false)} />
    </LayoutGroup>
  )
}
