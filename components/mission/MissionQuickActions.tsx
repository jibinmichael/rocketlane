"use client"

import { LinearIcon, type LinearIconName } from "@/components/shared/LinearIcon"
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
export function quickActionsFor(projectName: string | null): QuickAction[] {
  const name = projectName ?? "a project"
  return [
    { id: "complete", icon: "network", title: `Complete ${name}`, fill: `Complete ${name}` },
    {
      id: "blocking",
      icon: "search",
      title: `What's blocking ${name}?`,
      fill: `What's blocking ${name}?`,
    },
    {
      id: "mine",
      icon: "layers",
      title: "Complete all my projects",
      fill: "Complete all my projects",
    },
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
              <LinearIcon name={action.icon} className="icon-vibe size-3.5" />
              <span className="text-vibe-hover truncate">{action.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
