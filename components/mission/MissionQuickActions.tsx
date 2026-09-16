"use client"

import { FolderKanban, Layers, Search, Sparkles, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type QuickAction = {
  id: string
  icon: LucideIcon
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
    { id: "complete", icon: FolderKanban, title: `Complete ${name}`, fill: `Complete ${name}` },
    {
      id: "blocking",
      icon: Search,
      title: `What's blocking ${name}?`,
      fill: `What's blocking ${name}?`,
    },
    {
      id: "mine",
      icon: Layers,
      title: "Complete all my projects",
      fill: "Complete all my projects",
    },
    { id: "data", icon: Sparkles, title: "Test with your own project files", fill: null },
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
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <li key={action.id}>
              <button
                type="button"
                onClick={() => onPick(action)}
                className="text-foreground hover:bg-muted focus-visible:ring-ring/50 flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:outline-none"
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0",
                    action.fill === null ? "text-vibe-1" : "text-muted-foreground",
                  )}
                  strokeWidth={1.75}
                />
                <span className="truncate">{action.title}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
