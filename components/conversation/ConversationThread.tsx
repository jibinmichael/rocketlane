"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"

import { AgentDataDialog } from "@/components/agent/AgentDataDialog"
import { AgentMark } from "@/components/agent/AgentMark"
import { ArtifactStateChip } from "@/components/artifacts/ArtifactStateChip"
import { ConversationBlockItem } from "@/components/conversation/ConversationBlockItem"
import { ConversationComposer } from "@/components/conversation/ConversationComposer"
import { lineTypingMs } from "@/components/conversation/ConversationInlineText"
import { ConversationFeedbackRow } from "@/components/conversation/ConversationFeedbackRow"
import { MissionActivityPanel } from "@/components/mission/MissionActivityPanel"
import { Body } from "@/components/shared/Typography"
import { Button } from "@/components/ui/button"
import type { Block, BlockAction, Inline } from "@/core/agent/conversation/blocks"
import { isTerminal, type MissionState } from "@/core/mission/mission"
import { usePacedReveal } from "@/hooks/use-paced-reveal"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"
import { avatarFor } from "@/lib/avatar"
import type { AgentSessionState } from "@/lib/runtime"
import { crossfade, expand, LINE_GAP_MS, settle, STEP_CADENCE_MS } from "@/lib/motion"
import { SESSION_LABEL, WORKING_STATES } from "@/lib/session-label"
import { followUps as suggestNext } from "@/lib/suggestions"
import { cn } from "@/lib/utils"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const AGENT_NAME = "Governance Agent"

/** The lines a block actually types; the rest live inside its fold and cost no time. */
function typedLines(block: Block): readonly (readonly Inline[])[] {
  if (block.type === "blocker") return block.lines.slice(0, 1)
  if (block.type === "evaluation") return block.lines.slice(1, 2)
  return block.lines
}

/** How long a block takes to finish on screen: its typed lines, or its steps landing. */
function durationOf(block: Block): number {
  if (block.type === "activity") return STEP_CADENCE_MS * (block.activity?.length ?? 0) + 300
  return typedLines(block).reduce((ms, line) => ms + lineTypingMs(line) + LINE_GAP_MS, 0)
}

/**
 * When the next block may start: only after the previous one has finished, plus a beat in which
 * the agent is visibly working (longer before a phase of steps, and before the landing).
 */
function delayForBlock(block: Block, index: number, previous: Block | undefined): number {
  const settle = previous ? durationOf(previous) : 0
  if (index === 0) return 900
  if (block.type === "activity") return settle + 600
  if (block.type === "landing" || block.type === "evaluation") return settle + 800
  return settle + 500
}

/** Walks a list of labels on a fixed beat; null when the list is empty. */
function useCycle(labels: readonly string[], everyMs: number): string | null {
  const [i, setI] = useState(0)
  const key = labels.join("|")
  const [seen, setSeen] = useState(key)
  if (key !== seen) {
    setSeen(key)
    setI(0)
  }
  useEffect(() => {
    if (labels.length < 2) return
    const t = window.setInterval(() => setI((n) => Math.min(n + 1, labels.length - 1)), everyMs)
    return () => window.clearInterval(t)
  }, [key, labels.length, everyMs])
  return labels[Math.min(i, labels.length - 1)] ?? null
}

export function ConversationThread({ missionId }: { missionId: string }) {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const router = useRouter()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [pinned, setPinned] = useState(true)
  const [dataOpen, setDataOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  const mission = snapshot.status === "ready" ? runtime.mission(missionId) : null
  const thread = snapshot.status === "ready" ? runtime.thread(missionId) : []
  const live = snapshot.status === "ready" ? runtime.liveBlocks(missionId) : []
  // A turn is fresh when its user message was typed in this session (or the mission was just
  // started); history renders whole. Decided per user turn, so replies in an opened mission type.
  const [openedAt] = useState(() => Date.now())
  const lastUserAt =
    [...thread].reverse().find((e) => e.kind === "user")?.at ?? mission?.createdAt ?? null
  const fresh = lastUserAt !== null && lastUserAt > openedAt - 8000
  // Esc skips the current turn's animation only; the next turn animates again. Blocks already on
  // screen when a user turn arrives (a pending ask) are remembered so they never type twice.
  const [skipState, setSkipState] = useState<{
    at: number | null
    skipped: boolean
    seen: ReadonlySet<string>
  }>({ at: lastUserAt, skipped: false, seen: new Set() })
  if (skipState.at !== lastUserAt) {
    setSkipState({ at: lastUserAt, skipped: false, seen: new Set(live.map((b) => b.id)) })
  }
  const skipped = skipState.skipped
  const seen = skipState.seen
  const {
    shown: pacedLive,
    revealing,
    skip,
  } = usePacedReveal(live, (next, i) => delayForBlock(next, i, live[i - 1]), !fresh)
  // A reply to a question is history the moment it exists; when it answers this session's latest
  // turn it still writes itself in, block after block.
  const lastEntry = thread[thread.length - 1]
  const replay =
    live.length === 0 &&
    lastEntry?.kind === "agent" &&
    fresh &&
    lastUserAt !== null &&
    lastEntry.at >= lastUserAt
      ? lastEntry
      : null
  const replayOffsets = replay
    ? replay.blocks.reduce<number[]>((acc, b, i) => {
        acc.push(i === 0 ? 0 : acc[i - 1]! + durationOf(replay.blocks[i - 1]!))
        return acc
      }, [])
    : []
  // The last block keeps typing after it is revealed; states that mark "done" wait for it.
  const lastLive = live[live.length - 1]
  const tailKey = `${live.length}:${lastLive?.id ?? ""}:${replay?.at ?? ""}`
  const tailMs = lastLive
    ? fresh && !skipped && !seen.has(lastLive.id)
      ? durationOf(lastLive)
      : 0
    : replay && !skipped
      ? replay.blocks.reduce((ms, b) => ms + durationOf(b), 0)
      : 0
  const [tail, setTail] = useState({ key: tailKey, done: tailMs === 0 })
  if (tail.key !== tailKey) setTail({ key: tailKey, done: tailMs === 0 })
  useEffect(() => {
    if (revealing || tail.done) return
    const t = window.setTimeout(() => setTail((s) => ({ ...s, done: true })), tailMs)
    return () => window.clearTimeout(t)
  }, [revealing, tail.done, tail.key, tailMs])
  const animating = revealing || !tail.done
  const nextBlock = live[pacedLive.length]
  const nextSteps =
    nextBlock?.type === "activity" && nextBlock.activity
      ? nextBlock.activity.map((i) => i.label)
      : []
  const stepLabel = useCycle(nextSteps, 650)
  const session = runtime.session(missionId)
  const actorIndex = snapshot.actors.findIndex((a) => a.id === snapshot.actorId)
  const actor = actorIndex >= 0 ? snapshot.actors[actorIndex] : undefined
  const avatar = avatarFor(actorIndex)
  const executing =
    session === "EXECUTING" ||
    session === "VERIFYING" ||
    session === "RECHECKING" ||
    session === "PAUSING"
  const working = WORKING_STATES.has(session)
  const paused =
    !working && (mission?.state === "PAUSED" || mission?.state === "STALE" || session === "PAUSED")
  const settled =
    !working &&
    !animating &&
    (mission === null || isTerminal(mission) || mission.state === "BLOCKED")

  // Scroll rule: stick to bottom only when the user is already near it (spec §26 / UX contract).
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinned) return
    el.scrollTop = el.scrollHeight
  }, [snapshot.revision, pinned, pacedLive.length])
  // Typing grows the column without a snapshot change; while pinned, the view follows it.
  useEffect(() => {
    const el = scrollRef.current
    const inner = contentRef.current
    if (!el || !inner || !pinned) return
    const ro = new ResizeObserver(() => {
      el.scrollTop = el.scrollHeight
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [pinned, snapshot.status])

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
    if (action.kind === "pause" && animating && !executing) {
      skip()
      setSkipState((s) => ({ ...s, skipped: true }))
      return
    }
    if (action.kind === "view_activity") {
      setActivityOpen(true)
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
    if (!executing && !animating) return
    if (dataOpen || activityOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAction({ kind: "pause", label: "Pause" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executing, animating, missionId, dataOpen, activityOpen])

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

  const currentStep = mission?.currentStepId
    ? mission.plan.find((s) => s.id === mission.currentStepId)
    : null
  const workingLabel = animating
    ? (stepLabel ?? "Writing")
    : session === "EXECUTING" && currentStep
      ? `Updating ${currentStep.label}`
      : SESSION_LABEL[session]

  // Follow-ups are real capabilities chosen for this moment (final brief: the conversation never
  // ends in a dead end). Offered once the agent has settled; nothing already asked is repeated.
  const asked = thread
    .filter((e) => e.kind === "user")
    .map((e) => (e.kind === "user" ? e.text : ""))
  const followUps: { label: string; run: () => void }[] = settled
    ? suggestNext({
        graph: snapshot.graph,
        actorId: snapshot.actorId,
        mission,
        asked,
        seed: thread.length,
      }).map((s) => ({
        label: s.text,
        run: () =>
          s.action === "view_activity"
            ? onAction({ kind: "view_activity", label: "View activity" })
            : void onSend(s.text),
      }))
    : []

  const lastAgent = [...thread].reverse().find((e) => e.kind === "agent")
  const feedbackText = settled
    ? live.length > 0
      ? plainText(live)
      : lastAgent?.kind === "agent"
        ? plainText(lastAgent.blocks)
        : null
    : null

  // The mission state lives in the stream, on the latest agent turn, as a muted pill.
  const showLive = live.length > 0 || working
  const pill = mission ? { state: mission.state, session } : null

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div
            ref={contentRef}
            className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-6 pt-8 pb-4"
          >
            {thread.map((entry, i) =>
              entry.kind === "user" ? (
                <UserTurn
                  key={`u-${entry.at}-${entry.text.length}`}
                  name={actor?.name ?? "You"}
                  avatar={avatar}
                  text={entry.text}
                  at={entry.at}
                />
              ) : (
                <AgentTurn
                  key={`a-${entry.at}-${entry.blocks.length}-${entry.actionTaken ?? ""}`}
                  at={entry.at}
                  continued={thread[i - 1]?.kind === "agent"}
                  pill={!showLive && i === thread.length - 1 ? pill : null}
                >
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
                        personAvatar={avatar}
                        animate={replay === entry && !skipped}
                        offsetMs={replay === entry ? (replayOffsets[j] ?? 0) : 0}
                      />
                    ))}
                  </ul>
                  {i === thread.length - 1 && live.length === 0 && feedbackText && (
                    <ConversationFeedbackRow text={feedbackText} />
                  )}
                </AgentTurn>
              ),
            )}

            <AnimatePresence initial={false}>
              {showLive && (
                <motion.div
                  key="live-turn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={settle}
                >
                  <AgentTurn
                    at={null}
                    live
                    continued={thread[thread.length - 1]?.kind === "agent"}
                    pill={working || animating ? null : pill}
                  >
                    {/* Live region: new agent blocks are announced; frozen history is not re-read. */}
                    <ul className="flex flex-col" aria-live="polite" aria-relevant="additions">
                      {pacedLive.map((block) => (
                        <ConversationBlockItem
                          key={block.id}
                          block={block}
                          index={0}
                          frozen={false}
                          actionTaken={null}
                          onAction={onAction}
                          personAvatar={avatar}
                          animate={fresh && !skipped && !seen.has(block.id)}
                          working={working || animating}
                        />
                      ))}
                    </ul>
                    <AnimatePresence initial={false}>
                      {(working || animating) && (
                        <motion.div
                          key="working"
                          initial={{ opacity: 0, y: -2 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={crossfade}
                          className="relative flex items-center py-1"
                          aria-live="polite"
                        >
                          <span className="absolute top-1/2 -left-[29px] flex w-5 -translate-y-1/2 justify-center">
                            <AgentMark size={16} />
                          </span>
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                              key={workingLabel}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={crossfade}
                              className="text-shimmer text-[13px] leading-[22px]"
                            >
                              {workingLabel}
                            </motion.span>
                          </AnimatePresence>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {settled && feedbackText && <ConversationFeedbackRow text={feedbackText} />}
                  </AgentTurn>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {followUps.length > 0 && (
                <motion.div
                  key="follow-ups"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={settle}
                  className="flex flex-wrap gap-2 pl-10"
                >
                  {followUps.map((f) => (
                    <button
                      key={f.label}
                      type="button"
                      onClick={f.run}
                      className="border-border text-foreground hover:bg-muted focus-visible:ring-ring/50 h-8 rounded-full border px-3.5 text-[13px] transition-colors duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {f.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
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
              skipping={animating && !executing}
              paused={paused}
              focusKey={mission?.pending?.kind === "input" ? mission.pending.stepId : null}
              placeholder={
                mission?.pending?.kind === "input" && !animating
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
      <AnimatePresence initial={false}>
        {activityOpen && mission && (
          <motion.div
            key="activity-column"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 440, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{
              width: settle,
              opacity: expand,
            }}
            className="h-full shrink-0 overflow-hidden"
          >
            <MissionActivityPanel mission={mission} onClose={() => setActivityOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The user's turn (ClickUp Brain rows): photo, name, time, then the text under the name. */
function UserTurn({
  name,
  avatar,
  text,
  at,
}: {
  name: string
  avatar: string
  text: string
  at: number
}) {
  return (
    <div className="flex gap-3">
      <Image
        src={avatar}
        alt=""
        width={20}
        height={20}
        className="mt-px size-5 shrink-0 rounded-full object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-foreground text-[13px] font-semibold">{name}</span>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {timeFormat.format(new Date(at))}
          </span>
        </div>
        <p className="text-foreground text-[15px] leading-[22px]">{text}</p>
      </div>
    </div>
  )
}

/** The agent's turn: the rocket as the avatar, name, time, the state pill, then the blocks. */
function AgentTurn({
  at,
  live = false,
  continued = false,
  pill,
  children,
}: {
  at: number | null
  live?: boolean
  /** Follows another agent entry: one turn on screen, so no second header. */
  continued?: boolean
  pill: { state: MissionState; session: AgentSessionState } | null
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex gap-3", continued && "-mt-4")}>
      <span className="flex w-5 shrink-0 justify-center pt-px">
        {!continued && <AgentMark size={20} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={cn("flex items-center gap-2", continued && !pill && "hidden")}>
          {!continued && (
            <>
              <span className="text-foreground text-[13px] font-semibold">{AGENT_NAME}</span>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {at === null ? (live ? "Now" : "") : timeFormat.format(new Date(at))}
              </span>
            </>
          )}
          <AnimatePresence initial={false}>
            {pill && (
              <motion.span
                key="pill"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={crossfade}
              >
                <ArtifactStateChip state={pill.state} session={pill.session} className="h-5 px-2" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        {children}
      </div>
    </div>
  )
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
