"use client"

import { useState } from "react"
import { motion } from "motion/react"

import { ConversationInlineText } from "@/components/conversation/ConversationInlineText"
import { MissionPathList } from "@/components/mission/MissionPathList"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Block, BlockAction } from "@/core/agent/conversation/blocks"
import { revealDelay, settle } from "@/lib/motion"
import { cn } from "@/lib/utils"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

const TONE_RAIL: Record<Block["tone"], string> = {
  neutral: "bg-border",
  blocked: "bg-state-blocked",
  waiting: "bg-state-waiting",
  success: "bg-state-completed",
  paused: "bg-state-paused",
  error: "bg-state-error",
}

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
  onAction: (action: BlockAction, payload?: { hours?: number }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [hours, setHours] = useState("")
  const hasDetail =
    (block.detail && block.detail.length > 0) || (block.path && block.path.length > 0)
  const isLanding = block.type === "landing"
  const showActions = block.actions.length > 0 && !frozen

  return (
    <motion.li
      initial={{ opacity: 0, y: isLanding ? 2 : -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...settle, delay: frozen ? 0 : revealDelay(index) }}
      className="relative flex gap-3 py-1.5"
      data-block-type={block.type}
    >
      <span
        aria-hidden
        className={cn("mt-2 w-0.5 shrink-0 self-stretch rounded-full", TONE_RAIL[block.tone])}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {block.lines.map((line, i) => (
          <ConversationInlineText
            key={i}
            line={line}
            className={cn(block.type === "landing" && "font-medium")}
          />
        ))}

        {hasDetail && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
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
                <ConversationInlineText line={line} className="text-[13px]" />
              </li>
            ))}
          </ul>
        )}

        {showActions && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {block.actions.map((action) =>
              action.kind === "log_time" ? (
                <form
                  key={action.stepId}
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const value = Number.parseFloat(hours)
                    if (value > 0) onAction(action, { hours: value })
                  }}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.25}
                    step={0.25}
                    placeholder="Hours"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    aria-label="Hours to log"
                    className="h-8 w-24 text-[13px] tabular-nums"
                  />
                  <Button type="submit" size="sm" disabled={!(Number.parseFloat(hours) > 0)}>
                    {action.label}
                  </Button>
                </form>
              ) : (
                <Button
                  key={`${action.kind}-${"stepId" in action ? action.stepId : action.label}`}
                  type="button"
                  size="sm"
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
              ),
            )}
          </div>
        )}
        {frozen && actionTaken && isLast && (
          <span className="text-muted-foreground mt-1 inline-flex items-center gap-1.5 text-[12px]">
            <span aria-hidden className="bg-state-completed size-1.5 rounded-full" />
            {actionTaken}
            {decidedAt !== null && (
              <span className="tabular-nums">· {timeFormat.format(new Date(decidedAt))}</span>
            )}
          </span>
        )}
      </div>
    </motion.li>
  )
}
