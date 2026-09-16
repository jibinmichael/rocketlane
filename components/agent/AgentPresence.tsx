import { cn } from "@/lib/utils"

export type PresenceState = "idle" | "working" | "waiting" | "paused" | "landed" | "blocked"

/**
 * The agent's face (docs/design/visual-direction.md). Two square eyes that blink, a neutral halo
 * that turns only while the agent is working. State, not mood: paused rests the eyes, landing
 * fades the halo, blocked holds still. Decorative to screen readers; the text beside it speaks.
 */
export function AgentPresence({
  state = "idle",
  size = 60,
  className,
}: {
  state?: PresenceState
  size?: number
  className?: string
}) {
  const eye = Math.max(3, Math.round(size / 12))
  const gap = Math.max(3, Math.round(size / 9))
  const working = state === "working"
  const halo = state !== "blocked" && state !== "landed" && size >= 32

  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      data-presence={state}
    >
      {halo && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(0,0,0,0.18), rgba(0,0,0,0.04), rgba(0,0,0,0.13), rgba(0,0,0,0.18))",
            filter: `blur(${Math.round(size / 6)}px)`,
            opacity: working ? 0.9 : state === "paused" ? 0.35 : 0.6,
            animation: working ? "presence-halo 6s linear infinite" : undefined,
            transition: "opacity var(--motion-slow) var(--ease-out)",
          }}
        />
      )}
      <span
        className="relative flex items-center"
        style={{
          gap,
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
      className="bg-foreground/75 inline-block origin-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(1, Math.round(size / 5)),
        transform: rested ? "scaleY(0.45)" : undefined,
        animation: rested ? undefined : "presence-blink 5s infinite",
        transition: "transform var(--motion-slow) var(--ease-out)",
      }}
    />
  )
}
