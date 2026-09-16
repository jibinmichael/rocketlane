"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"

import { AgentDataDialog } from "@/components/agent/AgentDataDialog"
import { AgentPresence, AgentPresenceStreaming } from "@/components/agent/AgentPresence"
import { ArtifactStateChip } from "@/components/artifacts/ArtifactStateChip"
import { ConversationBlockItem } from "@/components/conversation/ConversationBlockItem"
import { ConversationComposer } from "@/components/conversation/ConversationComposer"
import { ConversationFeedbackRow } from "@/components/conversation/ConversationFeedbackRow"
import { MissionBand, SESSION_LABEL } from "@/components/mission/MissionBand"
import { Body } from "@/components/shared/Typography"
import { Button } from "@/components/ui/button"
import type { Block, BlockAction } from "@/core/agent/conversation/blocks"
import { isTerminal } from "@/core/mission/mission"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"
import type { AgentSessionState } from "@/lib/runtime"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const AGENT_NAME = "Governance Agent"

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
  const actor = snapshot.actors.find((a) => a.id === snapshot.actorId)
  const executing =
    session === "EXECUTING" ||
    session === "VERIFYING" ||
    session === "RECHECKING" ||
    session === "PAUSING"
  const working = WORKING.has(session)
  const paused =
    !working && (mission?.state === "PAUSED" || mission?.state === "STALE" || session === "PAUSED")
  const settled =
    !working && (mission === null || isTerminal(mission) || mission.state === "BLOCKED")

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

  const onSend = async (text: string) => {
    const id = await runtime.send(text, missionId)
    if (id && id !== missionId) router.push(`/m/${id}`)
  }

  const onAction = (action: BlockAction) => {
    if (action.kind === "view_activity") {
      router.push(`/activity?mission=${missionId}`)
      return
    }
    if (action.kind === "resend") {
      void onSend(action.text)
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

  // Follow-ups are real capabilities, never generated prose (final brief: the conversation never
  // ends in a dead end). Offered once the agent has settled.
  const firstProject = snapshot.graph?.projects[0]?.name ?? null
  const asked = thread
    .filter((e) => e.kind === "user")
    .map((e) => (e.kind === "user" ? e.text.trim().toLowerCase() : ""))
  const notAsked = (text: string) => !asked.includes(text.trim().toLowerCase())
  const followUps: { label: string; run: () => void }[] = settled
    ? [
        ...(mission
          ? [
              {
                label: "View the full activity log",
                run: () => onAction({ kind: "view_activity", label: "View activity" }),
              },
            ]
          : []),
        ...(firstProject &&
        !(mission?.goalText ?? "").includes(firstProject) &&
        notAsked(`What's blocking ${firstProject}?`)
          ? [
              {
                label: `What's blocking ${firstProject}?`,
                run: () => void onSend(`What's blocking ${firstProject}?`),
              },
            ]
          : []),
        ...(notAsked("Complete all my projects")
          ? [
              {
                label: "Complete all my projects",
                run: () => void onSend("Complete all my projects"),
              },
            ]
          : []),
      ]
    : []

  const lastAgent = [...thread].reverse().find((e) => e.kind === "agent")
  const feedbackText = settled
    ? live.length > 0
      ? plainText(live)
      : lastAgent?.kind === "agent"
        ? plainText(lastAgent.blocks)
        : null
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
        <header className="border-border/70 bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
          <div className="mx-auto flex h-10 w-full max-w-[680px] items-center justify-end gap-4 px-6">
            <ArtifactStateChip state="READY" />
          </div>
        </header>
      )}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-6 pt-6 pb-4">
          {thread.map((entry, i) =>
            entry.kind === "user" ? (
              <UserTurn
                key={`u-${i}`}
                name={actor?.name ?? "You"}
                text={entry.text}
                at={entry.at}
              />
            ) : (
              <AgentTurn key={`a-${i}`} at={entry.at} state={settled ? "idle" : "working"}>
                <ul className="flex flex-col">
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
                {i === thread.length - 1 && live.length === 0 && feedbackText && (
                  <ConversationFeedbackRow text={feedbackText} />
                )}
              </AgentTurn>
            ),
          )}

          {(live.length > 0 || working) && (
            <AgentTurn at={null} state={working ? "working" : "idle"} live>
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
              <AnimatePresence initial={false}>
                {working && (
                  <motion.div
                    key="working"
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center gap-2 py-1"
                    aria-live="polite"
                  >
                    <AgentPresenceStreaming />
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
              {settled && feedbackText && <ConversationFeedbackRow text={feedbackText} />}
            </AgentTurn>
          )}

          {followUps.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-10">
              {followUps.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={f.run}
                  className="border-border text-foreground hover:bg-muted h-8 rounded-full border px-3.5 text-[13px] transition-colors duration-[var(--motion-fast)]"
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 px-6 pt-2 pb-5">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-3">
          <ConversationComposer
            onSend={(t) => void onSend(t)}
            onPause={() => onAction({ kind: "pause", label: "Pause" })}
            onResume={() => onAction({ kind: "continue", label: "Resume" })}
            onAttach={() => setDataOpen(true)}
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
      <AgentDataDialog open={dataOpen} onClose={() => setDataOpen(false)} />
    </div>
  )
}

/** The user's turn (ClickUp Brain rows): initials, name, time, then the text under the name. */
function UserTurn({ name, text, at }: { name: string; text: string; at: number }) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className="bg-foreground text-background mt-px flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
      >
        {initials(name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-foreground text-[13px] font-semibold">{name}</span>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {timeFormat.format(new Date(at))}
          </span>
        </div>
        <p className="text-foreground text-[14px] leading-[1.55]">{text}</p>
      </div>
    </div>
  )
}

/** The agent's turn: presence as the avatar, name, time, then the blocks under the name. */
function AgentTurn({
  at,
  state,
  live = false,
  children,
}: {
  at: number | null
  state: "idle" | "working"
  live?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <AgentPresence state={state} size={28} className="mt-px" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-foreground text-[13px] font-semibold">{AGENT_NAME}</span>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {at === null ? (live ? "Now" : "") : timeFormat.format(new Date(at))}
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

/** A copyable plain-text rendering of an agent turn, for the feedback row's copy action. */
function plainText(blocks: readonly Block[]): string {
  return blocks
    .map((b) =>
      b.lines
        .map((line) =>
          line
            .map((p) =>
              p.kind === "text"
                ? p.text
                : p.kind === "entity" || p.kind === "policy"
                  ? p.label
                  : p.kind === "count"
                    ? String(p.value)
                    : timeFormat.format(new Date(p.at)),
            )
            .join(""),
        )
        .join("\n"),
    )
    .join("\n")
}
