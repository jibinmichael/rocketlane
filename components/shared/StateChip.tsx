import { cn } from "@/lib/utils"

export type ChipTone = "completed" | "waiting" | "blocked" | "paused" | "error" | "neutral"

const FIELD: Record<ChipTone, string> = {
  completed: "bg-status-success-soft",
  waiting: "bg-status-warning-soft",
  paused: "bg-status-warning-soft",
  blocked: "bg-status-error-soft",
  error: "bg-status-error-soft",
  neutral: "bg-muted",
}

const DOT: Record<ChipTone, string> = {
  completed: "bg-state-completed",
  waiting: "bg-state-waiting",
  paused: "bg-state-paused",
  blocked: "bg-state-blocked",
  error: "bg-state-error",
  neutral: "bg-state-ready",
}

/** The one chip grammar: a round filled dot on a softly tinted field, ink text. */
export function StateChip({
  tone,
  children,
  className,
}: {
  tone: ChipTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "text-foreground/80 inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium",
        FIELD[tone],
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", DOT[tone])} />
      {children}
    </span>
  )
}
