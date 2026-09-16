import { cn } from "@/lib/utils"

export type PresenceState = "idle" | "working" | "waiting" | "paused" | "landed" | "blocked"

/**
 * The agent's face (docs/design/visual-direction.md). Two square eyes that blink inside a soft
 * vibrant halo: the four-stop gradient, blurred, turning while the agent works. State, not mood:
 * paused rests the eyes, landing and blocked hold the halo still and dim. Decorative to screen
 * readers; the text beside it speaks.
 */
export function AgentPresence({
  state = "idle",
  size = 40,
  className,
}: {
  state?: PresenceState
  size?: number
  className?: string
}) {
  const eye = Math.max(3, Math.round(size / 10))
  const gap = Math.max(3, Math.round(size / 8))
  const working = state === "working"
  const dim = state === "blocked" || state === "landed" || state === "paused"

  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      data-presence={state}
    >
      <span
        className="absolute rounded-full"
        style={{
          inset: Math.round(size * 0.12),
          background: "var(--vibe-halo)",
          filter: `blur(${Math.max(3, Math.round(size / 5))}px) saturate(1.1)`,
          opacity: working ? 0.95 : dim ? 0.4 : 0.75,
          animation: working ? "presence-halo 5s linear infinite" : undefined,
          transition: "opacity var(--motion-slow) var(--ease-out)",
        }}
      />
      <span
        className="bg-card relative flex items-center justify-center rounded-full"
        style={{
          width: Math.round(size * 0.62),
          height: Math.round(size * 0.62),
          gap,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06), inset 0 0 0 0.5px rgba(0,0,0,0.04)",
          animation: working ? "presence-breathe 4s var(--ease-in-out) infinite" : undefined,
        }}
      >
        <Eye size={eye} rested={state === "paused"} />
        <Eye size={eye} rested={state === "paused"} />
      </span>
    </span>
  )
}

function Eye({ size, rested }: { size: number; rested: boolean }) {
  return (
    <span
      className="bg-foreground/80 inline-block origin-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(1, Math.round(size / 4)),
        transform: rested ? "scaleY(0.4)" : undefined,
        animation: rested ? undefined : "presence-blink 5s infinite",
        transition: "transform var(--motion-slow) var(--ease-out)",
      }}
    />
  )
}

/** The streaming variant: the face plus three breathing dots, sized for a thread row. */
export function AgentPresenceStreaming({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} aria-hidden>
      <AgentPresence state="working" size={22} />
      <span className="flex items-center gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="bg-foreground/45 size-1 rounded-full"
            style={{ animation: `presence-dot 1.2s var(--ease-in-out) ${i * 0.15}s infinite` }}
          />
        ))}
      </span>
    </span>
  )
}
