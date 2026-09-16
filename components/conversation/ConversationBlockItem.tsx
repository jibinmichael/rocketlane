"use client"

import { useState } from "react"
import { motion } from "motion/react"

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
 * observable work (icon · label · context) that stays open while current and folds to one sentence
 * afterwards. Icons come from the block contract, never from the component.
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
  // Only the current activity phase opens by itself; history folds, and every other block's detail
  // (full path, consequence list, evaluation evidence) opens on demand.
  const defaultOpen = isActivity && !block.collapsed && !frozen
  const expanded = open ?? defaultOpen
  const hasDetail =
    (block.detail && block.detail.length > 0) || (block.path && block.path.length > 0)
  const foldable = (isActivity || isEvaluation) && block.activity && block.activity.length > 0
  const showActions = block.actions.length > 0 && !frozen
  const speech = block.icon === null && !isActivity

  return (
    <motion.li
      initial={{ opacity: 0, y: isLanding ? 2 : -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...settle, delay: frozen ? 0 : revealDelay(index) }}
      className={cn("relative flex gap-3", speech ? "py-2" : "py-1.5")}
      data-block-type={block.type}
    >
      <span className="mt-[3px] flex w-4 shrink-0 justify-center">
        {block.icon && <ConversationIcon name={block.icon} tone={block.tone} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Activity: the sentence when folded, the items when open. */}
        {isActivity ? (
          expanded && block.activity ? (
            <ActivityList items={block.activity} frozen={frozen} />
          ) : (
            <div id={`${block.id}-text`} className="text-muted-foreground text-[13px]">
              {block.lines.map((line, i) => (
                <ConversationInlineText key={i} line={line} />
              ))}
            </div>
          )
        ) : (
          <div id={`${block.id}-text`} className="flex flex-col gap-1">
            {block.lines.map((line, i) => (
              <ConversationInlineText
                key={i}
                line={line}
                className={cn(
                  isLanding && i === 0 && "font-medium",
                  isEvaluation &&
                    i === 0 &&
                    "text-muted-foreground text-[11px] font-medium tracking-[0.005em] uppercase",
                )}
              />
            ))}
          </div>
        )}

        {/* Evidence lists (landing) render compact and open. */}
        {isLanding && block.activity && block.activity.length > 0 && (
          <ActivityList items={block.activity} frozen compact />
        )}

        {/* Fold control for activity phases and evaluation evidence. */}
        {foldable && (
          <button
            type="button"
            onClick={() => setOpen(!expanded)}
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground mt-0.5 w-fit text-[12px] font-medium transition-colors duration-[var(--motion-fast)]"
          >
            {expanded
              ? isEvaluation
                ? "Hide evidence"
                : "Hide activity"
              : isEvaluation
                ? "View evaluation evidence"
                : "Show activity"}
          </button>
        )}
        {isEvaluation && expanded && block.activity && (
          <ActivityList items={block.activity} frozen compact />
        )}

        {hasDetail && !isEvaluation && (
          <button
            type="button"
            onClick={() => setOpen(!expanded)}
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground mt-0.5 w-fit text-[12px] font-medium transition-colors duration-[var(--motion-fast)]"
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

/** Observable work as rows: icon · label · context. New rows enter as their events arrive. */
function ActivityList({
  items,
  frozen,
  compact = false,
}: {
  items: readonly ActivityItem[]
  frozen: boolean
  compact?: boolean
}) {
  return (
    <ul className={cn("flex flex-col", compact ? "gap-0.5" : "gap-1")}>
      {items.map((item, i) => (
        <motion.li
          key={`${item.icon}-${item.label}-${i}`}
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...settle, delay: frozen ? 0 : revealDelay(i) }}
          className="flex items-baseline gap-2 text-[13px]"
        >
          <span className="flex w-4 shrink-0 justify-center self-center">
            <ConversationIcon
              name={item.icon}
              tone={item.icon === "check" ? "success" : item.icon === "error" ? "error" : "neutral"}
            />
          </span>
          <span className="text-foreground">{item.label}</span>
          {item.detail && (
            <ConversationInlineText
              line={item.detail}
              className="text-muted-foreground text-[12px]"
            />
          )}
        </motion.li>
      ))}
    </ul>
  )
}
