"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { AgentDataPanel } from "@/components/agent/AgentDataPanel"
import { AgentPresence } from "@/components/agent/AgentPresence"
import {
  ConversationComposer,
  type ComposerPlaceholder,
} from "@/components/conversation/ConversationComposer"
import { MissionHistoryRow } from "@/components/mission/MissionHistoryRow"
import { MissionQuickActions, quickActionsFor } from "@/components/mission/MissionQuickActions"
import { Body } from "@/components/shared/Typography"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

/**
 * The agent's front door (final brief §5, §26; docs/design/visual-direction.md). A peer-agent
 * landing: presence, one promise, the composer, four real ways in, the trust line, then the
 * missions that already exist. No module navigation anywhere.
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
    } finally {
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

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col px-6 pb-16">
      <section className="flex min-h-[calc(100dvh-48px-160px)] flex-col items-center justify-center gap-7 pt-10 pb-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <AgentPresence state={sending ? "working" : "idle"} size={60} />
          <div className="flex flex-col gap-2">
            <h1 className="text-foreground text-[24px] leading-[1.25] font-semibold tracking-[-0.02em]">
              Your projects are already moving.
              <br />
              I&apos;ll help keep them on course.
            </h1>
            <p className="text-muted-foreground text-[14px] leading-[1.55]">
              Check governance, trace blockers, make authorized changes, and verify the result.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3">
          <ConversationComposer
            onSend={(t) => void onSend(t)}
            onAttach={() => setDataOpen((v) => !v)}
            attachOpen={dataOpen}
            disabled={snapshot.status !== "ready" || sending}
            autoFocus
            placeholders={placeholders}
            fill={fill}
          />
          <div className="min-h-5 px-1" aria-live="polite">
            {sending ? (
              <div className="flex flex-col gap-1.5">
                <div className="relative h-px w-full overflow-hidden">
                  <span
                    aria-hidden
                    className="bg-foreground/40 absolute top-0 left-0 h-px w-1/3 animate-[flight-hairline_1.2s_var(--ease-in-out)_infinite]"
                  />
                </div>
                <Body muted className="text-[12px]">
                  Preparing mission
                </Body>
              </div>
            ) : (
              <p className="text-muted-foreground text-center text-[12px]">
                AI can make mistakes. Consequential changes are verified before they&apos;re treated
                as complete.
              </p>
            )}
          </div>
          {dataOpen && (
            <AgentDataPanel
              onLoaded={() => setDataOpen(false)}
              onClose={() => setDataOpen(false)}
            />
          )}
        </div>

        <MissionQuickActions
          actions={actions}
          onPick={(a) => {
            if (a.fill === null) setDataOpen(true)
            else setFill({ text: a.fill, key: Date.now() })
          }}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground px-2 text-[11px] font-medium tracking-[0.04em] uppercase">
          Previous missions
        </h2>
        {snapshot.status === "error" ? (
          <Body className="text-state-error px-2 text-[13px]">
            The workspace could not load: {snapshot.error}. Use the workspace menu to reset the
            project data.
          </Body>
        ) : snapshot.status !== "ready" ? (
          <Body muted className="px-2 text-[13px]">
            Loading workspace…
          </Body>
        ) : missions.length === 0 ? (
          <Body muted className="px-2 text-[13px]">
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
    </div>
  )
}
