"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { ConversationBlockItem } from "@/components/conversation/ConversationBlockItem"
import { ConversationComposer } from "@/components/conversation/ConversationComposer"
import { MissionBand } from "@/components/mission/MissionBand"
import { ArtifactStateChip } from "@/components/artifacts/ArtifactStateChip"
import { Body } from "@/components/shared/Typography"
import { Button } from "@/components/ui/button"
import type { BlockAction } from "@/core/agent/conversation/blocks"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

export function ConversationThread({ missionId }: { missionId: string }) {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const router = useRouter()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [pinned, setPinned] = useState(true)

  const mission = snapshot.status === "ready" ? runtime.mission(missionId) : null
  const thread = snapshot.status === "ready" ? runtime.thread(missionId) : []
  const live = snapshot.status === "ready" ? runtime.liveBlocks(missionId) : []
  const session = runtime.session(missionId)
  const executing = session === "EXECUTING" || session === "VERIFYING" || session === "RECHECKING"

  // Scroll rule: stick to bottom only when the user is already near it (spec §26 / UX contract).
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinned) return
    el.scrollTop = el.scrollHeight
  }, [snapshot.revision, pinned])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }

  const onAction = (action: BlockAction) => {
    if (action.kind === "view_activity") {
      router.push(`/activity?mission=${missionId}`)
      return
    }
    void runtime.act(missionId, action).then((id) => {
      if (id !== missionId) router.push(`/m/${id}`)
    })
  }

  // Esc stops the mission from anywhere in the thread while it is executing (spec §11).
  useEffect(() => {
    if (!executing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAction({ kind: "cancel", label: "Stop" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executing, missionId])

  const onSend = async (text: string) => {
    const id = await runtime.send(text, missionId)
    if (id && id !== missionId) router.push(`/m/${id}`)
  }

  if (snapshot.status === "error") {
    return (
      <Body className="text-state-error p-6">
        The workspace could not load: {snapshot.error}. Open Test Lab, Dataset, Reset to original.
      </Body>
    )
  }
  if (snapshot.status !== "ready") {
    return (
      <Body muted className="p-6">
        Loading workspace…
      </Body>
    )
  }
  if (!mission && thread.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-6 py-10">
        <Body>No mission with this id.</Body>
        <Button size="sm" variant="outline" className="w-fit" onClick={() => router.push("/")}>
          Back to missions
        </Button>
      </div>
    )
  }

  const interpretedNote =
    snapshot.lastInterpretedBy === "local-fallback"
      ? "Interpreted locally"
      : snapshot.lastInterpretedBy === "model"
        ? "Interpreted by model"
        : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {mission ? (
        <MissionBand
          mission={mission}
          session={session}
          interpretedNote={interpretedNote}
          pinned={pinned}
          onJump={() => {
            setPinned(true)
            const el = scrollRef.current
            if (el) el.scrollTop = el.scrollHeight
          }}
        />
      ) : (
        <header className="border-border bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
          <div className="mx-auto flex h-[52px] w-full max-w-[720px] items-center gap-4 px-6">
            <h1 className="text-foreground min-w-0 flex-1 truncate text-[14px] font-medium">
              {thread.find((e) => e.kind === "user")?.kind === "user"
                ? (thread.find((e) => e.kind === "user") as { text: string }).text
                : "Reply"}
            </h1>
            <ArtifactStateChip state="READY" />
          </div>
        </header>
      )}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-6 py-6">
          {thread.map((entry, i) =>
            entry.kind === "user" ? (
              <div key={`u-${i}`} className="flex items-baseline justify-end gap-3">
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {timeFormat.format(new Date(entry.at))}
                </span>
                <p className="bg-muted text-foreground max-w-[80%] rounded-lg px-3 py-1.5 text-[14px] leading-[1.6]">
                  {entry.text}
                </p>
              </div>
            ) : (
              <ul key={`a-${i}`} className="flex flex-col">
                {entry.blocks.map((block, j) => (
                  <ConversationBlockItem
                    key={block.id}
                    block={block}
                    index={j}
                    frozen
                    actionTaken={entry.actionTaken}
                    isLast={j === entry.blocks.length - 1}
                    decidedAt={entry.at}
                    onAction={onAction}
                  />
                ))}
              </ul>
            ),
          )}
          {/* Live region: new agent blocks are announced; frozen history is not re-read. */}
          <ul className="flex flex-col" aria-live="polite" aria-relevant="additions">
            {live.map((block, j) => (
              <ConversationBlockItem
                key={block.id}
                block={block}
                index={j}
                frozen={false}
                actionTaken={null}
                onAction={onAction}
              />
            ))}
          </ul>
        </div>
      </div>
      <div className="shrink-0 px-6 pt-2 pb-5">
        <div className="mx-auto w-full max-w-[720px]">
          <ConversationComposer
            onSend={(t) => void onSend(t)}
            onStop={() => onAction({ kind: "cancel", label: "Stop" })}
            executing={executing}
            focusKey={mission?.pending?.kind === "input" ? mission.pending.stepId : null}
            placeholder={
              mission?.pending?.kind === "input"
                ? "Reply with the hours, e.g. 2 hours"
                : "Reply, or state a new outcome"
            }
          />
        </div>
      </div>
    </div>
  )
}
