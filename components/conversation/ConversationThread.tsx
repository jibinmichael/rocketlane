"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"

import { AgentDataPanel } from "@/components/agent/AgentDataPanel"
import { AgentPresence } from "@/components/agent/AgentPresence"
import { ArtifactStateChip } from "@/components/artifacts/ArtifactStateChip"
import { ConversationBlockItem } from "@/components/conversation/ConversationBlockItem"
import { ConversationComposer } from "@/components/conversation/ConversationComposer"
import { MissionBand, SESSION_LABEL } from "@/components/mission/MissionBand"
import { Body } from "@/components/shared/Typography"
import { Button } from "@/components/ui/button"
import type { BlockAction } from "@/core/agent/conversation/blocks"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"
import type { AgentSessionState } from "@/lib/runtime"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

const WORKING: ReadonlySet<AgentSessionState> = new Set([
  "UNDERSTANDING",
  "PLANNING",
  "CHECKING",
  "EXECUTING",
  "VERIFYING",
  "RECHECKING",
  "PAUSING",
])

export function ConversationThread({ missionId }: { missionId: string }) {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const router = useRouter()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [pinned, setPinned] = useState(true)
  const [dataOpen, setDataOpen] = useState(false)

  const mission = snapshot.status === "ready" ? runtime.mission(missionId) : null
  const thread = snapshot.status === "ready" ? runtime.thread(missionId) : []
  const live = snapshot.status === "ready" ? runtime.liveBlocks(missionId) : []
  const session = runtime.session(missionId)
  const executing =
    session === "EXECUTING" ||
    session === "VERIFYING" ||
    session === "RECHECKING" ||
    session === "PAUSING"
  const working = WORKING.has(session)
  const paused =
    !working && (mission?.state === "PAUSED" || mission?.state === "STALE" || session === "PAUSED")

  // Scroll rule: stick to bottom only when the user is already near it (spec §26 / UX contract).
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinned) return
    el.scrollTop = el.scrollHeight
  }, [snapshot.revision, pinned, dataOpen])

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

  // Esc pauses the mission from anywhere in the thread while it is executing (spec §11). Pause
  // controls future execution; it never cancels.
  useEffect(() => {
    if (!executing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAction({ kind: "pause", label: "Pause" })
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
        The workspace could not load: {snapshot.error}. Use the workspace menu to reset the project
        data.
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
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-3 px-6 py-10">
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

  const currentStep = mission?.currentStepId
    ? mission.plan.find((s) => s.id === mission.currentStepId)
    : null
  const workingLabel =
    session === "EXECUTING" && currentStep
      ? `Updating ${currentStep.label}`
      : SESSION_LABEL[session]

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
        <header className="border-border/70 bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
          <div className="mx-auto flex h-[52px] w-full max-w-[680px] items-center gap-4 px-6">
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
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5 px-6 pt-6 pb-4">
          {thread.map((entry, i) =>
            entry.kind === "user" ? (
              <UserRow key={`u-${i}`} text={entry.text} at={entry.at} />
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
          {/* The agent's working row: presence plus what it is doing right now, from session state. */}
          <AnimatePresence initial={false}>
            {working && (
              <motion.div
                key="working"
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2.5 py-1"
                aria-live="polite"
              >
                <span className="flex w-4 justify-center">
                  <AgentPresence state="working" size={16} />
                </span>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={workingLabel}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.22 }}
                    className="text-muted-foreground text-[13px]"
                  >
                    {workingLabel}
                  </motion.span>
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="shrink-0 px-6 pt-2 pb-5">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-3">
          {dataOpen && (
            <AgentDataPanel
              onLoaded={() => setDataOpen(false)}
              onClose={() => setDataOpen(false)}
            />
          )}
          <ConversationComposer
            onSend={(t) => void onSend(t)}
            onPause={() => onAction({ kind: "pause", label: "Pause" })}
            onResume={() => onAction({ kind: "continue", label: "Resume" })}
            onAttach={() => setDataOpen((v) => !v)}
            attachOpen={dataOpen}
            executing={executing}
            paused={paused}
            focusKey={mission?.pending?.kind === "input" ? mission.pending.stepId : null}
            placeholder={
              mission?.pending?.kind === "input"
                ? "Reply with the hours, e.g. 2 hours"
                : paused
                  ? "Resume, or state a new outcome"
                  : "Reply, or state a new outcome"
            }
          />
        </div>
      </div>
    </div>
  )
}

/** The user's turn: a quiet grey pill on the right, time beside it. */
function UserRow({ text, at }: { text: string; at: number }) {
  return (
    <div className="flex items-baseline justify-end gap-3">
      <span className="text-muted-foreground text-[11px] tabular-nums">
        {timeFormat.format(new Date(at))}
      </span>
      <p className="bg-muted text-foreground max-w-[75%] rounded-2xl px-3.5 py-2 text-[14px] leading-[1.55]">
        {text}
      </p>
    </div>
  )
}
