"use client"

import { useEffect, useState } from "react"
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Under a finished answer (ClickUp Brain, Fin): thumbs and copy. Feedback is local to the session;
 * it never changes what the agent did. Adapted from the Wati "vibe" feedback artifact.
 */
export function ConversationFeedbackRow({ text }: { text: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null)
  const [copied, setCopied] = useState(false)
  const [gone, setGone] = useState(false)

  // Once rated, say thanks briefly, then leave the block clean (Wati feedback artifact).
  useEffect(() => {
    if (!vote) return
    const t = window.setTimeout(() => setGone(true), 2200)
    return () => window.clearTimeout(t)
  }, [vote])

  if (gone) return null

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
      {vote ? (
        <span
          className="text-muted-foreground inline-flex items-center gap-1.5 text-[12px]"
          aria-live="polite"
        >
          <Check className="size-3.5" strokeWidth={2} aria-hidden />
          {vote === "up" ? "Thanks for the feedback" : "Noted. Tell me what was off."}
        </span>
      ) : (
        <>
          <IconButton label="Helpful" pressed={false} onClick={() => setVote("up")}>
            <ThumbsUp className="size-3.5" strokeWidth={1.75} />
          </IconButton>
          <IconButton label="Not helpful" pressed={false} onClick={() => setVote("down")}>
            <ThumbsDown className="size-3.5" strokeWidth={1.75} />
          </IconButton>
          <span aria-hidden className="bg-border mx-1 h-3.5 w-px" />
          <IconButton
            label={copied ? "Copied" : "Copy"}
            pressed={false}
            onClick={() => void copy()}
          >
            {copied ? (
              <Check className="text-state-completed size-3.5" strokeWidth={2} />
            ) : (
              <Copy className="size-3.5" strokeWidth={1.75} />
            )}
          </IconButton>
        </>
      )}
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
