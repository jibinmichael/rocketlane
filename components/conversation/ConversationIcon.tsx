import {
  Activity,
  Ban,
  Check,
  CircleCheckBig,
  CircleX,
  Clock,
  Flag,
  FolderKanban,
  GitBranch,
  ListChecks,
  type LucideIcon,
  Pause,
  Play,
  RefreshCw,
  Route,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Waypoints,
} from "lucide-react"

import type { Block, SemanticIcon } from "@/core/agent/conversation/blocks"
import { cn } from "@/lib/utils"

/**
 * One icon per kind of work (spec §26). Deterministic mapping from the block contract's
 * `SemanticIcon`; the glyph answers "what is happening", never decorates.
 */
const ICON: Record<SemanticIcon, LucideIcon> = {
  project: FolderKanban,
  milestone: Flag,
  task: ListChecks,
  time: Clock,
  dependency: GitBranch,
  policy: ShieldCheck,
  blocker: TriangleAlert,
  person: UserRound,
  action: Play,
  execution: Activity,
  check: Check,
  refresh: RefreshCw,
  change: Waypoints,
  course: Route,
  pause: Pause,
  error: CircleX,
  cancel: Ban,
  landing: CircleCheckBig,
}

const TONE_COLOR: Record<Block["tone"], string> = {
  neutral: "text-muted-foreground",
  blocked: "text-state-blocked",
  waiting: "text-state-waiting",
  success: "text-state-completed",
  paused: "text-state-paused",
  error: "text-state-error",
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
  const Icon = ICON[name]
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className={cn("h-3.5 w-3.5 shrink-0", TONE_COLOR[tone], className)}
    />
  )
}
