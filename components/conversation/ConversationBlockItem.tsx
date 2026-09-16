"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { ChevronRight } from "lucide-react"

import { ConversationIcon } from "@/components/conversation/ConversationIcon"
import { ConversationInlineText } from "@/components/conversation/ConversationInlineText"
import { MissionPathList } from "@/components/mission/MissionPathList"
import { Button } from "@/components/ui/button"
import type { ActivityItem, Block, BlockAction } from "@/core/agent/conversation/blocks"
import { revealDelay, settle } from "@/lib/motion"
import { cn } from "@/lib/utils"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

/**
 * One block of the conversation. Durable blocks read as the agent speaking; `activity` blocks are
 * observable work: while live they read as the current step with the step list open, once done
 * they fold to "Finished in N steps" with the list a click away (ClickUp Brain pattern). Icons
 * come from the block contract, never from the component.
 */
export function ConversationBlockItem({
  block,
  index,
  frozen,
  actionTaken,
  isLast = false,
  decidedAt = null,
  onAction,
}: {
  block: Block
  index: number
  frozen: boolean
  actionTaken: string | null
  isLast?: boolean
  decidedAt?: number | null
  onAction: (action: BlockAction) => void
}) {
  const [open, setOpen] = useState<boolean | null>(null)
  const isActivity = block.type === "activity"
  const isEvaluation = block.type === "evaluation"
  const isLanding = block.type === "landing"
  const defaultOpen = isActivity && !block.collapsed && !frozen
  const expanded = open ?? defaultOpen
  const hasDetail =
    (block.detail && block.detail.length > 0) || (block.path && block.path.length > 0)
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
        initial={{ opacity: 0, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...settle, delay: frozen ? 0 : revealDelay(index) }}
        className="flex flex-col gap-1 py-1"
        data-block-type={block.type}
      >
        <button
          type="button"
          onClick={() => setOpen(!expanded)}
          aria-expanded={expanded}
          className={cn(
            "hover:bg-muted -ml-1.5 flex h-7 w-fit items-center gap-1 rounded-lg pr-2.5 pl-1.5 text-[13px] transition-colors duration-[var(--motion-fast)]",
            live ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-[var(--motion-fast)]",
              expanded && "rotate-90",
            )}
            strokeWidth={2}
          />
          <span className={cn(live && "font-medium")}>{label}</span>
        </button>
        {expanded && <StepSpine items={items} live={live} />}
      </motion.li>
    )
  }

  return (
    <motion.li
      initial={{ opacity: 0, y: isLanding ? 2 : -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...settle, delay: frozen ? 0 : revealDelay(index) }}
      className={cn("relative flex gap-2.5", speech ? "py-1.5" : "py-1")}
      data-block-type={block.type}
    >
      <span className="mt-[4px] flex w-4 shrink-0 justify-center">
        {block.icon && <ConversationIcon name={block.icon} tone={block.tone} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div id={`${block.id}-text`} className="flex flex-col gap-0.5">
          {block.lines.map((line, i) => (
            <ConversationInlineText
              key={i}
              line={line}
              className={cn(
                isLanding && i === 0 && "font-medium",
                isEvaluation &&
                  i === 0 &&
                  "text-muted-foreground text-[11px] font-medium tracking-[0.04em] uppercase",
              )}
            />
          ))}
        </div>

        {isLanding && block.activity && block.activity.length > 0 && (
          <StepSpine items={block.activity} live={false} compact />
        )}

        {isEvaluation && block.activity && block.activity.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setOpen(!expanded)}
              aria-expanded={expanded}
              className="text-muted-foreground hover:text-foreground w-fit text-[12px] font-medium transition-colors duration-[var(--motion-fast)]"
            >
              {expanded ? "Hide evidence" : "View evaluation evidence"}
            </button>
            {expanded && <StepSpine items={block.activity} live={false} compact />}
          </>
        )}

        {hasDetail && !isEvaluation && (
          <button
            type="button"
            onClick={() => setOpen(!expanded)}
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground w-fit text-[12px] font-medium transition-colors duration-[var(--motion-fast)]"
          >
            {expanded ? "Hide detail" : block.path ? "Show full path" : "Show detail"}
          </button>
        )}
        {expanded && block.path && <MissionPathList path={block.path} />}
        {expanded && block.detail && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {block.detail.map((line, i) => (
              <li key={i}>
                <ConversationInlineText line={line} className="text-muted-foreground text-[12px]" />
              </li>
            ))}
          </ul>
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
            <span aria-hidden className="bg-state-completed h-1.5 w-1.5 rounded-full" />
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

/**
 * Observable work as a dot spine (ClickUp Brain): a hairline down the left, one dot per step, the
 * current step's dot solid. Rows enter as their events arrive.
 */
function StepSpine({
  items,
  live,
  compact = false,
}: {
  items: readonly ActivityItem[]
  live: boolean
  compact?: boolean
}) {
  return (
    <ul className={cn("relative ml-[7px] flex flex-col", compact ? "mt-0.5" : "mt-1")}>
      <span aria-hidden className="bg-border absolute top-2 bottom-2 left-[3px] w-px" />
      {items.map((item, i) => {
        const current = live && i === items.length - 1
        const failed = item.icon === "error"
        const done = item.icon === "check"
        return (
          <motion.li
            key={`${item.icon}-${item.label}-${i}`}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...settle, delay: live ? revealDelay(i) : 0 }}
            className={cn("relative flex items-baseline gap-3 pl-5", compact ? "py-[3px]" : "py-1")}
          >
            <span
              aria-hidden
              className={cn(
                "absolute top-1/2 left-0 size-[7px] -translate-y-1/2 rounded-full border",
                failed
                  ? "border-state-error bg-state-error"
                  : done
                    ? "border-state-completed bg-state-completed"
                    : current
                      ? "border-foreground bg-foreground"
                      : "border-muted-foreground/50 bg-card",
              )}
            />
            <span className={cn("text-[13px]", current ? "text-foreground" : "text-foreground/85")}>
              {item.label}
            </span>
            {item.detail && (
              <ConversationInlineText
                line={item.detail}
                className="text-muted-foreground text-[12px]"
              />
            )}
          </motion.li>
        )
      })}
    </ul>
  )
}
