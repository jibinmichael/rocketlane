"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { ArtifactMissionRow } from "@/components/artifacts/ArtifactMissionRow"
import { ConversationComposer } from "@/components/conversation/ConversationComposer"
import { Body, H1 } from "@/components/shared/Typography"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

/** Agent home: composer on top, missions below, needs-input first. The home is the inbox. */
export function MissionHomeList() {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const router = useRouter()
  const [sending, setSending] = useState(false)

  const onSend = async (text: string) => {
    setSending(true)
    try {
      const id = await runtime.send(text, null)
      if (id) router.push(`/m/${id}`)
    } finally {
      setSending(false)
    }
  }

  const missions = [...snapshot.missions].sort((a, b) => {
    const aNeeds = a.pending ? 0 : 1
    const bNeeds = b.pending ? 0 : 1
    return aNeeds - bNeeds || b.updatedAt - a.updatedAt
  })

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-4">
        <H1 as="h1" className="text-[20px] tracking-[-0.01em]">
          What do you want done?
        </H1>
        <ConversationComposer
          onSend={(t) => void onSend(t)}
          disabled={snapshot.status !== "ready" || sending}
          autoFocus
          placeholder='e.g. "Mark Acme Implementation as completed"'
        />
        {sending ? (
          <div className="flex flex-col gap-1.5" aria-live="polite">
            <div className="relative h-px w-full overflow-hidden">
              <span
                aria-hidden
                className="bg-state-working absolute top-0 left-0 h-px w-1/3 animate-[flight-hairline_1.2s_var(--ease-in-out)_infinite]"
              />
            </div>
            <Body muted className="text-[13px]">
              Finding the target
              {snapshot.interpreterMode === "model" ? " · interpreting with the model" : ""}
            </Body>
          </div>
        ) : (
          <Body muted className="text-[13px]">
            Name an outcome. I find the target, check the four policies, trace dependencies, and ask
            only for what I cannot decide.
          </Body>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-2">
          <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.005em] uppercase">
            Missions
          </h2>
          {snapshot.status === "ready" && missions.length > 0 && (
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {missions.length}
            </span>
          )}
        </div>
        {snapshot.status === "error" ? (
          <Body className="text-state-error px-2 text-[13px]">
            The workspace could not load: {snapshot.error}. Open Test Lab, Dataset, Reset to
            original.
          </Body>
        ) : snapshot.status !== "ready" ? (
          <Body muted className="px-2 text-[13px]">
            Loading workspace…
          </Body>
        ) : missions.length === 0 ? (
          <Body muted className="px-2 text-[13px]">
            No missions yet. State an outcome above.
          </Body>
        ) : (
          <ul className="flex flex-col">
            {missions.map((m) => (
              <ArtifactMissionRow key={m.id} mission={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
