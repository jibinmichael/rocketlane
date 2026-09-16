"use client"

import { useEffect, useState } from "react"

import { LinearIcon } from "@/components/shared/LinearIcon"
import { cn } from "@/lib/utils"

/**
 * Under a finished answer (ClickUp Brain, Fin): thumbs and copy. Feedback is local to the session;
 * it never changes what the agent did. Once rated, it thanks briefly and leaves the block clean
 * (adapted from the Wati "vibe" feedback artifact).
 */
export function ConversationFeedbackRow({ text }: { text: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null)
  const [copied, setCopied] = useState(false)
  const [gone, setGone] = useState(false)

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
          <LinearIcon name="check" className="size-3.5" />
          {vote === "up" ? "Thanks for the feedback" : "Noted. Tell me what was off."}
        </span>
      ) : (
        <>
          <IconButton label="Helpful" onClick={() => setVote("up")}>
            <LinearIcon name="thumbs-up" className="size-3.5" />
          </IconButton>
          <IconButton label="Not helpful" onClick={() => setVote("down")}>
            <LinearIcon name="thumbs-down" className="size-3.5" />
          </IconButton>
          <span aria-hidden className="bg-border mx-1 h-3.5 w-px" />
          <IconButton label={copied ? "Copied" : "Copy"} onClick={() => void copy()}>
            <LinearIcon
              name={copied ? "check" : "clipboard"}
              className={cn("size-3.5", copied && "text-state-completed")}
            />
          </IconButton>
        </>
      )}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)]"
    >
      {children}
    </button>
  )
}
