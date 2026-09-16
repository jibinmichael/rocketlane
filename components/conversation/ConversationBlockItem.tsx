"use client"

import { useState } from "react"
import Image from "next/image"
import { AnimatePresence, motion } from "motion/react"

import { ConversationIcon } from "@/components/conversation/ConversationIcon"
import {
  ConversationInlineText,
  lineTypingMs,
} from "@/components/conversation/ConversationInlineText"
import { MissionPathList } from "@/components/mission/MissionPathList"
import { LinearIcon } from "@/components/shared/LinearIcon"
import { Button } from "@/components/ui/button"
import type { ActivityItem, Block, BlockAction } from "@/core/agent/conversation/blocks"
import { revealDelay, settle } from "@/lib/motion"
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
}) {
  const [open, setOpen] = useState<boolean | null>(null)
  const isActivity = block.type === "activity"
  const isEvaluation = block.type === "evaluation"
  const isLanding = block.type === "landing"
  const isBlocker = block.type === "blocker"
  // Everything stays open while the mission is live; it compacts only once the turn is frozen.
  const defaultOpen = isActivity ? !block.collapsed && !frozen : !frozen
  const expanded = open ?? defaultOpen
  const hasPath = Boolean(block.path && block.path.length > 0)
  const hasDetail = Boolean(block.detail && block.detail.length > 0)
  // Suggestions ("did you mean", "yes, complete it") stay clickable after the turn freezes as
  // long as nothing was chosen; decisions do not.
  const showActions =
    block.actions.length > 0 &&
    (!frozen || (actionTaken === null && block.actions.every((a) => a.kind === "resend")))
  const speech = block.icon === null && !isActivity

  if (isActivity) {
    const items = block.activity ?? []
    const live = !frozen && !block.collapsed
    const last = items[items.length - 1]
    const label =
      live && last
        ? last.label
        : `Finished in ${items.length} ${items.length === 1 ? "step" : "steps"}`
    return (
      <motion.li
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...settle, delay: frozen || !animate ? 0 : revealDelay(index) }}
        className="flex flex-col gap-1 py-1"
        data-block-type={block.type}
      >
        <Fold open={expanded} onToggle={() => setOpen(!expanded)} strong={live}>
          {label}
        </Fold>
        <Reveal open={expanded}>
          <StepSpine items={items} live={live && animate} />
        </Reveal>
      </motion.li>
    )
  }

  // A blocker reads as one sentence; the hop-by-hop chain and the path open on demand.
  const headLines = isBlocker && block.lines.length > 1 ? block.lines.slice(0, 1) : block.lines
  const restLines = isBlocker && block.lines.length > 1 ? block.lines.slice(1) : []
  const visibleLines = isEvaluation ? block.lines.slice(1, 2) : headLines

  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...settle, delay: frozen ? 0 : revealDelay(index) }}
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
                .reduce((ms, prev) => ms + lineTypingMs(prev) + 320, 0)}
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
            <Reveal open={expanded}>
              <ul className="flex flex-col gap-0.5">
                {restLines.map((line, i) => (
                  <li key={i}>
                    <ConversationInlineText line={line} className="text-[13px] leading-[20px]" />
                  </li>
                ))}
              </ul>
              {block.path && <MissionPathList path={block.path} />}
            </Reveal>
          </>
        )}

        {isLanding && block.activity && block.activity.length > 0 && (
          <>
            <Fold open={expanded} onToggle={() => setOpen(!expanded)}>
              {expanded
                ? "Hide the updates"
                : `Show the ${block.activity.length} ${block.activity.length === 1 ? "update" : "updates"}`}
            </Fold>
            <Reveal open={expanded}>
              <StepSpine items={block.activity} live={false} compact pill="Completed" />
            </Reveal>
          </>
        )}

        {isEvaluation && block.activity && block.activity.length > 0 && (
          <>
            <Fold open={expanded} onToggle={() => setOpen(!expanded)}>
              {expanded ? "Hide evidence" : "View evidence"}
            </Fold>
            <Reveal open={expanded}>
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
            </Reveal>
          </>
        )}

        {!isBlocker && !isEvaluation && (hasDetail || hasPath) && (
          <>
            <Fold open={expanded} onToggle={() => setOpen(!expanded)}>
              {expanded ? "Hide detail" : block.path ? "Show full path" : "Show detail"}
            </Fold>
            <Reveal open={expanded}>
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
            </Reveal>
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
            <span aria-hidden className="bg-state-completed/70 size-1.5 rounded-full" />
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
        "hover:bg-muted -ml-1.5 flex h-7 w-fit items-center gap-1 rounded-lg pr-2.5 pl-1.5 text-[13px] transition-colors duration-[var(--motion-fast)]",
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
 * left, one square per step, the current step's square solid. Rows enter as their events arrive.
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
        const done = item.icon === "check"
        return (
          <motion.li
            key={`${item.icon}-${item.label}-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...settle, delay: live ? i * 0.45 : 0 }}
            className={cn("relative flex items-center gap-2.5 pl-5", compact ? "py-[3px]" : "py-1")}
          >
            <span
              aria-hidden
              className="bg-card absolute top-1/2 left-[-3px] flex size-[13px] -translate-y-1/2 items-center justify-center"
            >
              <LinearIcon
                name={failed ? "close" : done ? "check" : current ? "status-1" : "circle"}
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
            </span>
            <span className={cn("text-[13px]", current ? "text-foreground" : "text-foreground/85")}>
              {item.label}
            </span>
            {pill && (
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
                  failed
                    ? "bg-status-error-soft text-state-error/90"
                    : "bg-status-success-soft text-state-completed/90",
                )}
              >
                {failed ? "Failed" : pill}
              </span>
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
  if (!evidence || evidence.length === 0) return <>{children}</>
  return (
    <span className="group/evidence relative inline-flex">
      <span
        tabIndex={0}
        className="decoration-muted-foreground/50 focus-visible:ring-ring/50 cursor-help rounded-sm underline decoration-dotted underline-offset-[3px] outline-none focus-visible:ring-2"
      >
        {children}
      </span>
      <span
        role="tooltip"
        className="bg-card text-card-foreground border-border pointer-events-none absolute top-full left-0 z-30 mt-1.5 hidden w-max max-w-[360px] flex-col gap-1 rounded-lg border px-3 py-2 text-[12px] shadow-[var(--shadow-lg)] group-focus-within/evidence:flex group-hover/evidence:flex"
      >
        {evidence.map((line, i) => (
          <span key={i} className="flex items-baseline gap-2">
            <span
              aria-hidden
              className="bg-muted-foreground/60 mt-[2px] size-1.5 shrink-0 rounded-[1px]"
            />
            <span className="text-foreground leading-[1.45]">{line}</span>
          </span>
        ))}
      </span>
    </span>
  )
}

/** Opens and closes with height and fade on the product's ease; nothing appears or vanishes cut. */
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  // Mounted open (no entry animation) counts as settled, so hover cards are never clipped.
  const [settled, setSettled] = useState(open)
  return (
    <AnimatePresence initial={false} onExitComplete={() => setSettled(false)}>
      {open && (
        <motion.div
          key="reveal"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          onAnimationStart={() => setSettled(false)}
          onAnimationComplete={() => setSettled(true)}
          transition={{
            height: { duration: 0.26, ease: [0.32, 0.72, 0, 1] },
            opacity: { duration: 0.2, ease: [0.32, 0.72, 0, 1] },
          }}
          className={cn("flex flex-col gap-1", settled ? "overflow-visible" : "overflow-hidden")}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
