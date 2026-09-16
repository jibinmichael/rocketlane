import { cn } from "@/lib/utils"

export type PresenceState = "idle" | "working" | "waiting" | "paused" | "landed" | "blocked"

/**
 * The agent is one pixel rocket, drawn the way the old brick game drew its cells: a coloured ring
 * with a solid core, in the four vibrance colours. While working, the rows drop from above in
 * cell steps and land on the stack, bottom row first, hold, blink twice and clear (keyframes in
 * app/globals.css). Idle it stands assembled with the exhaust ticking; paused it dims; landed and
 * blocked it stands still with the exhaust off. State, never mood. Decorative to screen readers.
 */
const MAP = [
  "...TT...",
  "..TTTT..",
  "..BBBB..",
  ".BBWWBB.",
  ".BBWWBB.",
  ".BBBBBB.",
  "FBBBBBBF",
  "FFBBBBFF",
  "..XXXX..",
  "...XX...",
] as const
const ROWS = MAP.length
const COLS = MAP[0].length
const COLOR: Record<string, string> = {
  T: "var(--vibe-2)",
  B: "var(--vibe-1)",
  W: "#ffffff",
  F: "var(--vibe-4)",
  X: "var(--vibe-3)",
}

export function AgentPresence({
  state = "idle",
  size = 28,
  className,
}: {
  state?: PresenceState
  size?: number
  className?: string
}) {
  const cell = size / ROWS
  const width = COLS * cell
  const inset = cell * 0.22
  return (
    <svg
      aria-hidden
      data-presence={state}
      width={Math.round(width)}
      height={size}
      viewBox={`0 0 ${width} ${size}`}
      className={cn("shrink-0 overflow-hidden", className)}
      style={{ shapeRendering: "crispEdges", ["--cell" as string]: `${cell}px` }}
    >
      <g className="presence-ship">
        {MAP.map((row, y) => (
          <g
            key={y}
            className={cn("presence-row", row.includes("X") && "presence-x")}
            style={{ animationName: `presence-drop-${y}` }}
          >
            {[...row].map((ch, x) =>
              ch === "." ? null : (
                <g key={x}>
                  <rect
                    x={x * cell}
                    y={y * cell}
                    width={cell}
                    height={cell}
                    fill={COLOR[ch]}
                    fillOpacity={ch === "W" ? 1 : 0.55}
                  />
                  <rect
                    x={x * cell + inset}
                    y={y * cell + inset}
                    width={cell - inset * 2}
                    height={cell - inset * 2}
                    fill={COLOR[ch]}
                  />
                </g>
              ),
            )}
          </g>
        ))}
      </g>
    </svg>
  )
}

/** The streaming row marker: the rocket building itself, at thread size. */
export function AgentPresenceStreaming({ className }: { className?: string }) {
  return <AgentPresence state="working" size={22} {...(className ? { className } : {})} />
}
