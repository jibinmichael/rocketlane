import { LinearIcon } from "@/components/shared/LinearIcon"
import { StateChip } from "@/components/shared/StateChip"
import type { PathNode } from "@/core/agent/conversation/blocks"
import { cn } from "@/lib/utils"

/**
 * The dependency path from the goal down to the first actionable node (spec §6). Rows and a
 * hairline spine, no graph. Rendered in place when the user expands a blocker.
 */
export function MissionPathList({ path }: { path: readonly PathNode[] }) {
  return (
    <ol className="relative mt-2 flex flex-col">
      {path.map((node, i) => {
        const last = i === path.length - 1
        return (
          <li
            key={`${node.ref.kind}:${node.ref.id}`}
            className="relative flex items-center gap-3 py-1.5"
          >
            {!last && (
              <span
                aria-hidden
                className="bg-border absolute top-[22px] left-[6px] h-[calc(100%-14px)] w-px"
              />
            )}
            <span
              aria-hidden
              className="bg-background relative z-10 flex size-[13px] shrink-0 items-center justify-center"
            >
              <LinearIcon
                name={
                  node.state === "complete"
                    ? "check"
                    : node.state === "actionable"
                      ? "status-1"
                      : "circle"
                }
                className={cn(
                  "size-[13px]",
                  node.state === "complete" && "text-state-completed/80",
                  node.state === "actionable" && "text-state-waiting/80",
                  node.state === "open" && "text-muted-foreground/50",
                  node.state === "target" && "text-foreground/80",
                )}
              />
            </span>
            <span
              className={cn(
                "text-[13px]",
                node.state === "target" ? "text-foreground font-medium" : "text-foreground",
                node.state === "complete" &&
                  "text-muted-foreground line-through decoration-[0.5px]",
              )}
            >
              {node.label}
            </span>
            {node.state === "actionable" && (
              <StateChip tone="waiting" className="ml-auto">
                Start here
              </StateChip>
            )}
            {node.state === "complete" && (
              <span className="text-muted-foreground ml-auto text-[11px]">Completed</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
