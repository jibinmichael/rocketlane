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
                className="bg-border absolute top-[22px] left-[5px] h-[calc(100%-14px)] w-px"
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 size-[11px] shrink-0 rounded-full border-[1.5px]",
                node.state === "complete" && "border-state-completed bg-state-completed",
                node.state === "actionable" && "border-state-waiting bg-status-warning-soft",
                node.state === "open" && "border-border bg-background",
                node.state === "target" && "border-foreground bg-background",
              )}
            />
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
            <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
              {node.state === "target"
                ? "goal"
                : node.state === "actionable"
                  ? "act here"
                  : node.state === "complete"
                    ? "complete"
                    : `depth ${i}`}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
