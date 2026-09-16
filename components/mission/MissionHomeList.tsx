"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"

import { AgentDataDialog } from "@/components/agent/AgentDataDialog"
import { AgentPresence } from "@/components/agent/AgentPresence"
import {
  ConversationComposer,
  type ComposerPlaceholder,
} from "@/components/conversation/ConversationComposer"
import { MissionHistoryRow } from "@/components/mission/MissionHistoryRow"
import { MissionQuickActions, quickActionsFor } from "@/components/mission/MissionQuickActions"
import { Body } from "@/components/shared/Typography"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"
import { settle } from "@/lib/motion"

/**
 * The agent's front door (final brief §5, §26; docs/design/visual-direction.md). Quiet, in the
 * ClickUp Brain / Notion AI shape: presence, one greeting, the composer, suggested rows, recent
 * missions. On send the greeting lifts away and the composer settles to the bottom, where the
 * mission page keeps it. No module navigation anywhere.
 */
export function MissionHomeList() {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [fill, setFill] = useState<{ text: string; key: number } | null>(null)
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

  const firstProject = snapshot.graph?.projects[0]?.name ?? null
  const actions = quickActionsFor(firstProject)
  const placeholders: ComposerPlaceholder[] = [
    { text: "State an outcome.", suggestion: false },
    ...(firstProject
      ? [
          { text: `Complete ${firstProject}`, suggestion: true },
          { text: `What's blocking ${firstProject}?`, suggestion: true },
        ]
      : []),
  ]

  const missions = snapshot.missions
    .map((s) => runtime.mission(s.id))
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => {
      const aNeeds = a.pending ? 0 : 1
      const bNeeds = b.pending ? 0 : 1
      return aNeeds - bNeeds || b.updatedAt - a.updatedAt
    })
    .slice(0, 6)

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
            <ConversationComposer
              onSend={(t) => void onSend(t)}
              onAttach={() => setDataOpen(true)}
              disabled={snapshot.status !== "ready" || sending}
              autoFocus
              placeholders={placeholders}
              fill={fill}
            />
            <div className="min-h-4 px-1" aria-live="polite">
              {sending ? (
                <div className="flex items-center gap-2 pt-1">
                  <AgentPresence state="working" size={18} />
                  <Body muted className="text-[12px]">
                    Preparing mission
                  </Body>
                </div>
              ) : (
                <p className="text-muted-foreground text-center text-[11px]">
                  AI can make mistakes. Consequential changes are verified before they&apos;re
                  treated as complete.
                </p>
              )}
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
                <MissionQuickActions
                  actions={actions}
                  onPick={(a) => {
                    if (a.fill === null) setDataOpen(true)
                    else setFill({ text: a.fill, key: Date.now() })
                  }}
                />
                <section className="flex flex-col gap-1">
                  <h2 className="text-muted-foreground px-2.5 text-[11px] font-medium tracking-[0.04em] uppercase">
                    Recent
                  </h2>
                  {snapshot.status === "error" ? (
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
                      {missions.map((m) => (
                        <MissionHistoryRow key={m.id} mission={m} now={now} />
                      ))}
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
