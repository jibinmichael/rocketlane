"use client"

import { useEffect, useId, useState } from "react"

import { placementClass, useHoverCard } from "@/hooks/use-card-placement"
import Image from "next/image"
import { AnimatePresence, motion } from "motion/react"

import { ConversationIcon } from "@/components/conversation/ConversationIcon"
import {
  ConversationInlineText,
  lineTypingMs,
} from "@/components/conversation/ConversationInlineText"
import { MissionPathList } from "@/components/mission/MissionPathList"
import { HeightReveal } from "@/components/shared/HeightReveal"
import { LinearIcon } from "@/components/shared/LinearIcon"
import { StateChip } from "@/components/shared/StateChip"
import { Button } from "@/components/ui/button"
import type { ActivityItem, Block, BlockAction } from "@/core/agent/conversation/blocks"
import { LINE_GAP_MS, crossfade, revealDelay, settle, STEP_CADENCE_MS } from "@/lib/motion"
import { cn } from "@/lib/utils"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

/**
 * One block of the conversation, with complexity on demand (rule one): the first line reads as
 * the agent speaking; hop-by-hop reasons, step lists, evidence and versions sit one click away.
 * `activity` blocks read as the current step while live with the step list open, then fold to
 * "Finished in N steps". Icons come from the block contract, never from the component.
 */
export function ConversationBlockItem({
  block,
  index,
  frozen,
  actionTaken,
  isLast = false,
  decidedAt = null,
  onAction,
  personAvatar = null,
  animate = true,
  working = true,
}: {
  block: Block
  index: number
  frozen: boolean
  actionTaken: string | null
  isLast?: boolean
  decidedAt?: number | null
  onAction: (action: BlockAction) => void
  /** The acting user's photo, shown in place of the person glyph. */
  personAvatar?: string | null
  /** False when the turn is already history: no typing, no stagger. */
  animate?: boolean
  /** False while the agent waits on the user: the last step is done, not in progress. */
  working?: boolean
}) {
  const [open, setOpen] = useState<boolean | null>(null)
  const isActivity = block.type === "activity"
  const isEvaluation = block.type === "evaluation"
  const isLanding = block.type === "landing"
  const isBlocker = block.type === "blocker"
  // Live work stays open; it compacts once the turn is frozen. The landing and its evaluation are
  // completion itself: their evidence starts folded, one click away.
  const defaultOpen = isActivity
    ? !block.collapsed && !frozen
    : isLanding || isEvaluation
      ? false
      : !frozen
  // A fold's detail waits for its sentence to finish typing before it opens.
  const typedLines = isEvaluation
    ? block.lines.slice(1, 2)
    : isBlocker
      ? block.lines.slice(0, 1)
      : block.lines
  const typingMs = typedLines.reduce((ms, line) => ms + lineTypingMs(line) + LINE_GAP_MS, 0)
  const [typed, setTyped] = useState(!(animate && !frozen) || isActivity)
  // A skip ends the animation: the text is whole, so the fold and the buttons follow at once.
  const [animatedFor, setAnimatedFor] = useState(animate)
  if (animatedFor !== animate) {
    setAnimatedFor(animate)
    if (!animate) setTyped(true)
  }
  useEffect(() => {
    if (typed) return
    const t = window.setTimeout(() => setTyped(true), typingMs)
    return () => window.clearTimeout(t)
  }, [typed, typingMs])
  const expanded = open ?? (defaultOpen && typed)
  const hasPath = Boolean(block.path && block.path.length > 0)
  const hasDetail = Boolean(block.detail && block.detail.length > 0)
  // Suggestions ("did you mean", "yes, complete it") stay clickable after the turn freezes as
  // long as nothing was chosen; decisions do not.
  const showActions =
    block.actions.length > 0 &&
    (frozen || typed) &&
    (!frozen || (actionTaken === null && block.actions.every((a) => a.kind === "resend")))
  const speech = block.icon === null && !isActivity

  if (isActivity) {
    const items = block.activity ?? []
    const live = !frozen && !block.collapsed && working
    const last = items[items.length - 1]
    const label =
      live && last
        ? last.label
        : `Finished in ${items.length} ${items.length === 1 ? "step" : "steps"}`
    return (
      <motion.li
        initial={frozen || !animate ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...settle, delay: frozen || !animate ? 0 : revealDelay(index) }}
        className="flex flex-col gap-1 py-1"
        data-block-type={block.type}
      >
        <Fold open={expanded} onToggle={() => setOpen(!expanded)} strong={live}>
          {label}
        </Fold>
        <HeightReveal open={expanded}>
          <StepSpine items={items} live={live && animate} />
        </HeightReveal>
      </motion.li>
    )
  }

  // A blocker reads as one sentence; the hop-by-hop chain and the path open on demand.
  const headLines = isBlocker && block.lines.length > 1 ? block.lines.slice(0, 1) : block.lines
  const restLines = isBlocker && block.lines.length > 1 ? block.lines.slice(1) : []
  const visibleLines = isEvaluation ? block.lines.slice(1, 2) : headLines

  return (
    <motion.li
      initial={frozen || !animate ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...settle, delay: frozen || !animate ? 0 : revealDelay(index) }}
      className={cn("relative flex", speech ? "py-1.5" : "py-1")}
      data-block-type={block.type}
    >
      {block.icon && (
        <span className="absolute top-[8px] -left-[26px] flex w-4 justify-center">
          {block.icon === "person" && personAvatar ? (
            <Image
              src={personAvatar}
              alt=""
              width={14}
              height={14}
              className="size-3.5 rounded-full object-cover"
            />
          ) : (
            <ConversationIcon name={block.icon} tone={block.tone} />
          )}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div id={`${block.id}-text`} className="flex flex-col gap-0.5">
          {visibleLines.map((line, i) => (
            <ConversationInlineText
              key={i}
              line={line}
              typing={!frozen && animate}
              startDelayMs={visibleLines
                .slice(0, i)
                .reduce((ms, prev) => ms + lineTypingMs(prev) + LINE_GAP_MS, 0)}
              className={cn(
                isLanding && i === 0 && "font-medium",
                isEvaluation && "text-muted-foreground text-[13px] leading-[20px]",
              )}
            />
          ))}
        </div>

        {isBlocker && (restLines.length > 0 || hasPath) && (
          <>
            <Fold open={expanded} onToggle={() => setOpen(!expanded)}>
              {expanded ? "Hide why" : "Show why"}
            </Fold>
            <HeightReveal open={expanded}>
              <ul className="flex flex-col gap-0.5">
                {restLines.map((line, i) => (
                  <li key={i}>
                    <ConversationInlineText line={line} className="text-[13px] leading-[20px]" />
                  </li>
                ))}
              </ul>
              {block.path && <MissionPathList path={block.path} />}
            </HeightReveal>
          </>
        )}

        {isLanding && block.activity && block.activity.length > 0 && (
          <>
            <Fold open={expanded} onToggle={() => setOpen(!expanded)}>
              {expanded
                ? "Hide the updates"
                : `Show the ${block.activity.length} ${block.activity.length === 1 ? "update" : "updates"}`}
            </Fold>
            <HeightReveal open={expanded}>
              <StepSpine items={block.activity} live={false} compact pill="Completed" />
            </HeightReveal>
          </>
        )}

        {isEvaluation && block.activity && block.activity.length > 0 && (
          <>
            <Fold open={expanded} onToggle={() => setOpen(!expanded)}>
              {expanded ? "Hide evidence" : "View evidence"}
            </Fold>
            <HeightReveal open={expanded}>
              <StepSpine items={block.activity} live={false} compact />
              {block.detail && (
                <ul className="flex flex-col gap-0.5">
                  {block.detail.map((line, i) => (
                    <li key={i}>
                      <ConversationInlineText
                        line={line}
                        className="text-muted-foreground text-[12px]"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </HeightReveal>
          </>
        )}

        {!isBlocker && !isEvaluation && (hasDetail || hasPath) && (
          <>
            <Fold open={expanded} onToggle={() => setOpen(!expanded)}>
              {expanded ? "Hide detail" : block.path ? "Show full path" : "Show detail"}
            </Fold>
            <HeightReveal open={expanded}>
              {block.path && <MissionPathList path={block.path} />}
              {block.detail && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {block.detail.map((line, i) => (
                    <li key={i}>
                      <ConversationInlineText
                        line={line}
                        className="text-muted-foreground text-[12px]"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </HeightReveal>
          </>
        )}

        {showActions && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {block.actions.map((action) => (
              <Button
                key={`${action.kind}-${"stepId" in action ? action.stepId : action.label}`}
                type="button"
                size="sm"
                className="rounded-full px-3"
                variant={
                  action.kind === "approve" && action.impact === "high"
                    ? "default"
                    : action.kind === "decline" || action.kind === "cancel"
                      ? "ghost"
                      : "outline"
                }
                onClick={() => onAction(action)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
        {frozen && actionTaken && isLast && (
          <span className="text-muted-foreground mt-1 inline-flex items-center gap-1.5 text-[12px]">
            <LinearIcon name="check" className="text-state-completed/80 size-3" />
            {actionTaken}
            {decidedAt !== null && (
              <span className="tabular-nums"> · {timeFormat.format(new Date(decidedAt))}</span>
            )}
          </span>
        )}
      </div>
    </motion.li>
  )
}

/** The disclosure control: a chevron and a short label, the same everywhere. */
function Fold({
  open,
  onToggle,
  strong = false,
  children,
}: {
  open: boolean
  onToggle: () => void
  strong?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring/50 -ml-1.5 flex h-7 w-fit items-center gap-1 rounded-lg pr-2.5 pl-1.5 text-[13px] transition-colors duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:outline-none",
        strong ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <LinearIcon
        name="chevron-down"
        rotate={open ? 0 : -90}
        className="size-3 shrink-0 transition-transform duration-[var(--motion-fast)]"
      />
      <span>{children}</span>
    </button>
  )
}

/**
 * Observable work as a brick spine (ClickUp Brain, in our pixel grammar): a hairline down the
 * left, one circle per step, the current step half-filled, done steps checked. Rows enter as their events arrive.
 * `pill` labels every row with a muted state pill (the landing list).
 */
function StepSpine({
  items,
  live,
  compact = false,
  pill,
}: {
  items: readonly ActivityItem[]
  live: boolean
  compact?: boolean
  pill?: string
}) {
  return (
    <ul className={cn("relative ml-[7px] flex flex-col", compact ? "mt-0.5" : "mt-1")}>
      <span aria-hidden className="bg-border absolute top-2 bottom-2 left-[3.5px] w-px" />
      {items.map((item, i) => {
        const current = live && i === items.length - 1
        const failed = item.icon === "error"
        // A step is done once the next one has started, and every step is done once the phase is over.
        const done = item.icon === "check" || !live || i < items.length - 1
        const marker = failed ? "close" : done ? "check" : current ? "status-1" : "circle"
        return (
          <motion.li
            key={`${item.label}-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...settle, delay: live ? (i * STEP_CADENCE_MS) / 1000 : 0 }}
            className={cn("relative flex items-center gap-2.5 pl-5", compact ? "py-[3px]" : "py-1")}
          >
            <span
              aria-hidden
              className="bg-card absolute top-1/2 left-[-3px] flex size-[13px] -translate-y-1/2 items-center justify-center"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={marker}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={crossfade}
                  className="flex"
                >
                  <LinearIcon
                    name={marker}
                    className={cn(
                      "size-[13px]",
                      failed
                        ? "text-state-error/80"
                        : done
                          ? "text-state-completed/80"
                          : current
                            ? "text-foreground/80"
                            : "text-muted-foreground/60",
                    )}
                  />
                </motion.span>
              </AnimatePresence>
            </span>
            <span className={cn("text-[13px]", current ? "text-foreground" : "text-foreground/85")}>
              {item.label}
            </span>
            {pill && (
              <StateChip tone={failed ? "error" : "completed"}>
                {failed ? "Failed" : pill}
              </StateChip>
            )}
            {item.detail && (
              <EvidenceHover evidence={item.evidence}>
                <ConversationInlineText
                  line={item.detail}
                  className="text-muted-foreground text-[12px]"
                />
              </EvidenceHover>
            )}
          </motion.li>
        )
      })}
    </ul>
  )
}

/**
 * A detail with something behind it ("4 policies checked") reads as a quiet dotted link; hovering
 * or focusing shows the evidence in a small card, in place, without leaving the thread.
 */
function EvidenceHover({
  evidence,
  children,
}: {
  evidence: readonly string[] | undefined
  children: React.ReactNode
}) {
  const tipId = useId()
  const { open: cardOpen, placement, handlers } = useHoverCard(360, 220)
  if (!evidence || evidence.length === 0) return <>{children}</>
  return (
    <span className="relative inline-flex" {...handlers}>
      <span
        tabIndex={0}
        aria-describedby={tipId}
        className="decoration-muted-foreground/50 focus-visible:ring-ring/50 cursor-help rounded-full underline decoration-dotted underline-offset-[3px] outline-none focus-visible:ring-2"
      >
        {children}
      </span>
      <span
        id={tipId}
        role="tooltip"
        className={cn(
          "bg-card text-card-foreground border-border pointer-events-none absolute z-30 w-max max-w-[360px] flex-col gap-1 rounded-lg border px-3 py-2 text-[12px] shadow-[var(--shadow-lg)]",
          cardOpen ? "flex" : "hidden",
          placementClass(placement),
        )}
      >
        {evidence.map((line, i) => (
          <span key={i} className="flex items-baseline gap-2">
            <LinearIcon
              name="circle"
              className="text-muted-foreground/50 mt-[3px] size-2.5 shrink-0"
            />
            <span className="text-foreground leading-[1.45]">{line}</span>
          </span>
        ))}
      </span>
    </span>
  )
}
