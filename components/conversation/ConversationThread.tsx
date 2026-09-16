"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { ConversationBlockItem } from "@/components/conversation/ConversationBlockItem"
import { ConversationComposer } from "@/components/conversation/ConversationComposer"
import { MissionBand } from "@/components/mission/MissionBand"
import { Body } from "@/components/shared/Typography"
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

  const onAction = (action: BlockAction, payload?: { hours?: number }) => {
    if (action.kind === "view_activity") {
      router.push(`/activity?mission=${missionId}`)
      return
    }
    void runtime.act(missionId, action, payload)
  }

  const onSend = async (text: string) => {
    const id = await runtime.send(text, missionId)
    if (id && id !== missionId) router.push(`/m/${id}`)
  }

  if (snapshot.status !== "ready") {
    return (
      <Body muted className="p-6">
        Loading workspace…
      </Body>
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
      {mission && (
        <MissionBand mission={mission} session={session} interpretedNote={interpretedNote} />
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
                    onAction={onAction}
                  />
                ))}
              </ul>
            ),
          )}
          {live.length > 0 && (
            <ul className="flex flex-col" aria-live="polite">
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
          )}
          {!pinned && (
            <button
              type="button"
              onClick={() => {
                setPinned(true)
                const el = scrollRef.current
                if (el) el.scrollTop = el.scrollHeight
              }}
              className="border-border bg-background text-muted-foreground hover:text-foreground sticky bottom-2 mx-auto rounded-full border px-3 py-1 text-[12px] shadow-[var(--shadow-md)]"
            >
              Jump to latest ↓
            </button>
          )}
        </div>
      </div>
      <div className="shrink-0 px-6 pt-2 pb-5">
        <div className="mx-auto w-full max-w-[720px]">
          <ConversationComposer
            onSend={(t) => void onSend(t)}
            onStop={() => onAction({ kind: "cancel", label: "Stop" })}
            executing={executing}
            placeholder={
              mission?.pending?.kind === "input_hours"
                ? "Type the hours, e.g. 2h"
                : "Reply, or state a new outcome"
            }
          />
        </div>
      </div>
    </div>
  )
}
