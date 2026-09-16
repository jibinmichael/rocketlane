"use client"

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

  const onSend = async (text: string) => {
    const id = await runtime.send(text, null)
    if (id) router.push(`/m/${id}`)
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
          disabled={snapshot.status !== "ready"}
          autoFocus
          placeholder='e.g. "Mark Acme Implementation as completed"'
        />
        <Body muted className="text-[13px]">
          Name an outcome. I resolve the target, check the four governance policies, trace
          dependencies, and ask you only for what I cannot decide or invent.
        </Body>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-2">
          <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.005em] uppercase">
            Missions
          </h2>
          {snapshot.status === "ready" && (
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {missions.length}
            </span>
          )}
        </div>
        {snapshot.status !== "ready" ? (
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
