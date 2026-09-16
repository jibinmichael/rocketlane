import type { Block, SemanticIcon } from "@/core/agent/conversation/blocks"
import { LinearIcon, type LinearIconName } from "@/components/shared/LinearIcon"
import { cn } from "@/lib/utils"

/**
 * One icon per kind of work (spec §26). Deterministic mapping from the block contract's
 * `SemanticIcon` to the Linear icon set; the glyph answers "what is happening", never decorates.
 */
const ICON: Record<SemanticIcon, { name: LinearIconName; rotate?: number }> = {
  project: { name: "board" },
  milestone: { name: "two-flags" },
  task: { name: "issues" },
  time: { name: "clock" },
  dependency: { name: "branch" },
  policy: { name: "shield-star" },
  blocker: { name: "warning-circle" },
  person: { name: "user-circle" },
  action: { name: "arrow-right" },
  execution: { name: "timeline" },
  check: { name: "check" },
  refresh: { name: "loader" },
  change: { name: "steps" },
  course: { name: "compass" },
  pause: { name: "three-dots" },
  error: { name: "close" },
  cancel: { name: "close" },
  landing: { name: "rocket" },
}

const TONE_COLOR: Record<Block["tone"], string> = {
  neutral: "text-muted-foreground",
  blocked: "text-muted-foreground",
  waiting: "text-muted-foreground",
  success: "text-muted-foreground",
  paused: "text-muted-foreground",
  error: "text-muted-foreground",
}

export function ConversationIcon({
  name,
  tone = "neutral",
  className,
}: {
  name: SemanticIcon
  tone?: Block["tone"]
  className?: string
}) {
  const icon = ICON[name]
  return (
    <LinearIcon
      name={icon.name}
      rotate={icon.rotate ?? 0}
      className={cn("size-3.5", TONE_COLOR[tone], className)}
    />
  )
}
