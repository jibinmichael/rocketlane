"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Upload } from "lucide-react"

import { AgentDataPanel } from "@/components/agent/AgentDataPanel"
import { ConversationComposer } from "@/components/conversation/ConversationComposer"
import { MissionHistoryRow } from "@/components/mission/MissionHistoryRow"
import { Body } from "@/components/shared/Typography"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

/**
 * The agent's front door (final brief §5, §26). State an outcome; the agent is the product. Below
 * the composer: a way to test with your own project data, and the missions that already exist,
 * each reopening its persisted context. No module navigation anywhere.
 */
export function MissionHomeList() {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
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

  const missions = snapshot.missions
    .map((s) => runtime.mission(s.id))
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => {
      const aNeeds = a.pending ? 0 : 1
      const bNeeds = b.pending ? 0 : 1
      return aNeeds - bNeeds || b.updatedAt - a.updatedAt
    })

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-10 px-6 pt-20 pb-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-foreground text-[26px] leading-[1.2] font-semibold tracking-[-0.02em]">
          Your projects are already moving.
          <br />
          I&apos;ll help keep them on course.
        </h1>
        <p className="text-muted-foreground text-[15px] leading-[1.55]">
          Check governance, trace blockers, make authorized changes, and verify the result.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <ConversationComposer
          onSend={(t) => void onSend(t)}
          disabled={snapshot.status !== "ready" || sending}
          autoFocus
          placeholder="Complete Acme Implementation. Or ask what's blocking it."
          className="px-4 py-3"
        />
        <div className="flex items-center justify-between gap-3 px-1">
          {sending ? (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5" aria-live="polite">
              <div className="relative h-px w-full overflow-hidden">
                <span
                  aria-hidden
                  className="bg-state-working absolute top-0 left-0 h-px w-1/3 animate-[flight-hairline_1.2s_var(--ease-in-out)_infinite]"
                />
              </div>
              <Body muted className="text-[12px]">
                Preparing mission
              </Body>
            </div>
          ) : (
            <p className="text-muted-foreground text-[12px]">
              AI can make mistakes. Consequential changes are verified before they&apos;re treated
              as complete.
            </p>
          )}
          <button
            type="button"
            onClick={() => setDataOpen((v) => !v)}
            aria-expanded={dataOpen}
            className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-[12px] font-medium transition-colors duration-[var(--motion-fast)]"
          >
            <Upload aria-hidden className="size-3.5" strokeWidth={1.75} />
            Test with project data
          </button>
        </div>
        {dataOpen && <AgentDataPanel />}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground px-2 text-[11px] font-medium tracking-[0.005em] uppercase">
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
