"use client"

import { LinearIcon, type LinearIconName } from "@/components/shared/LinearIcon"
import type { Suggestion } from "@/lib/suggestions"
import { cn } from "@/lib/utils"

type QuickAction = {
  id: string
  icon: LinearIconName
  title: string
  /** Text placed in the composer, or null when the action opens project-data upload instead. */
  fill: string | null
}

/**
 * Ways in, each a real capability of the agent (never a template gallery). Three fill the composer
 * with an outcome the user can edit before sending; the fourth opens project-data upload.
 */
export function quickActionsFor(suggestions: readonly Suggestion[]): QuickAction[] {
  return [
    ...suggestions.map((s) => ({ id: s.id, icon: s.icon, title: s.text, fill: s.text })),
    { id: "data", icon: "upload", title: "Test any project files", fill: null },
  ]
}

/** Quiet rows under the composer (ClickUp Brain, Notion AI): icon · one line. No cards, no sublines. */
export function MissionQuickActions({
  actions,
  onPick,
  className,
}: {
  actions: readonly QuickAction[]
  onPick: (action: QuickAction) => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-muted-foreground px-2.5 text-[12px] font-medium">Suggested</span>
      <ul className="flex flex-col">
        {actions.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              onClick={() => onPick(action)}
              className="group text-foreground focus-visible:ring-ring/50 flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:outline-none"
            >
              <LinearIcon
                name={action.icon}
                className="icon-vibe-hover text-muted-foreground size-3.5"
              />
              <span className="text-vibe-hover truncate">{action.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
