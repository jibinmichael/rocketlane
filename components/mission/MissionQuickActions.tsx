"use client"

import { FolderKanban, Layers, Search, Upload, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type QuickAction = {
  id: string
  icon: LucideIcon
  title: string
  description: string
  /** Text placed in the composer, or null when the action opens the data panel instead. */
  fill: string | null
}

/**
 * Four ways in, each a real capability of the agent (never a template gallery). Three fill the
 * composer with an outcome the user can edit before sending; the fourth opens project-data upload.
 */
export function quickActionsFor(projectName: string | null): QuickAction[] {
  const name = projectName ?? "a project"
  return [
    {
      id: "complete",
      icon: FolderKanban,
      title: `Complete ${name}`,
      description: "Check governance, resolve blockers, verify",
      fill: `Complete ${name}`,
    },
    {
      id: "blocking",
      icon: Search,
      title: "What's blocking it?",
      description: "Trace the path to the first thing to act on",
      fill: `What's blocking ${name}?`,
    },
    {
      id: "mine",
      icon: Layers,
      title: "Complete my projects",
      description: "Every project you own, reported exactly",
      fill: "Complete all my projects",
    },
    {
      id: "data",
      icon: Upload,
      title: "Test with project data",
      description: "Load a Rocketlane export; same agent, same rules",
      fill: null,
    },
  ]
}

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
    <div className={cn("grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4", className)}>
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onPick(action)}
            className="border-border bg-card hover:bg-muted/60 focus-visible:ring-ring/50 flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:outline-none"
          >
            <Icon
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
              strokeWidth={1.75}
            />
            <span className="text-foreground text-[12.5px] leading-snug font-medium">
              {action.title}
            </span>
            <span className="text-muted-foreground text-[12px] leading-snug">
              {action.description}
            </span>
          </button>
        )
      })}
    </div>
  )
}
