"use client"

import { useState } from "react"
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Under a finished answer (ClickUp Brain, Fin): thumbs and copy. Feedback is local to the session;
 * it never changes what the agent did. Adapted from the Wati "vibe" feedback artifact.
 */
export function ConversationFeedbackRow({ text }: { text: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex items-center gap-0.5 pt-1" role="group" aria-label="Rate this result">
      <IconButton
        label="Helpful"
        pressed={vote === "up"}
        onClick={() => setVote(vote === "up" ? null : "up")}
      >
        <ThumbsUp className="size-3.5" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label="Not helpful"
        pressed={vote === "down"}
        onClick={() => setVote(vote === "down" ? null : "down")}
      >
        <ThumbsDown className="size-3.5" strokeWidth={1.75} />
      </IconButton>
      <span aria-hidden className="bg-border mx-1 h-3.5 w-px" />
      <IconButton label={copied ? "Copied" : "Copy"} pressed={false} onClick={() => void copy()}>
        {copied ? (
          <Check className="text-state-completed size-3.5" strokeWidth={2} />
        ) : (
          <Copy className="size-3.5" strokeWidth={1.75} />
        )}
      </IconButton>
      <span className="text-muted-foreground pl-1 text-[12px]" aria-live="polite">
        {vote === "up"
          ? "Thanks for the feedback"
          : vote === "down"
            ? "Noted. Tell me what was off and I'll take it from there."
            : ""}
      </span>
    </div>
  )
}

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)]",
        pressed
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
