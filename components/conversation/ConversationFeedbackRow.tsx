"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"

import { LinearIcon } from "@/components/shared/LinearIcon"
import { crossfade, pop, settle } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * Under a finished answer (ClickUp Brain, Fin): thumbs and copy, quiet until touched. A vote pops
 * the chosen thumb once (the YouTube beat: fill, lift, settle), then the row thanks briefly and
 * leaves the block clean. Feedback is local to the session; it never changes what the agent did.
 */
export function ConversationFeedbackRow({ text }: { text: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null)
  const [thanks, setThanks] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!vote) return
    const a = window.setTimeout(() => setThanks(true), 720)
    return () => window.clearTimeout(a)
  }, [vote])

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
    <AnimatePresence initial={false}>
      {
        <motion.div
          key="feedback"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={settle}
          className="flex h-7 items-center gap-0.5 overflow-hidden pt-1"
          role="group"
          aria-label="Rate this result"
        >
          {thanks ? (
            <motion.span
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={crossfade}
              className="text-muted-foreground inline-flex items-center gap-1.5 text-[12px]"
              aria-live="polite"
            >
              <LinearIcon name="check" className="size-3.5" />
              {vote === "up" ? "Thanks for the feedback" : "Noted. Tell me what was off."}
            </motion.span>
          ) : (
            <>
              <Thumb kind="up" pressed={vote === "up"} onClick={() => setVote("up")} />
              <Thumb kind="down" pressed={vote === "down"} onClick={() => setVote("down")} />
            </>
          )}
          <span aria-hidden className="bg-border mx-1 h-3.5 w-px" />
          {
            <>
              <button
                type="button"
                aria-label={copied ? "Copied" : "Copy"}
                title={copied ? "Copied" : "Copy"}
                onClick={() => void copy()}
                className="text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 flex size-7 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:outline-none"
              >
                <LinearIcon
                  name={copied ? "check" : "document"}
                  className={cn("size-3.5", copied && "text-state-completed/80")}
                />
              </button>
            </>
          }
        </motion.div>
      }
    </AnimatePresence>
  )
}

function Thumb({
  kind,
  pressed,
  onClick,
}: {
  kind: "up" | "down"
  pressed: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      aria-label={kind === "up" ? "Helpful" : "Not helpful"}
      title={kind === "up" ? "Helpful" : "Not helpful"}
      aria-pressed={pressed}
      onClick={onClick}
      animate={
        pressed
          ? { scale: [1, 1.35, 0.94, 1], rotate: kind === "up" ? [0, -14, 4, 0] : [0, 14, -4, 0] }
          : { scale: 1, rotate: 0 }
      }
      transition={{ ...pop, times: [0, 0.35, 0.7, 1] }}
      className={cn(
        "relative flex size-7 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)]",
        pressed
          ? "text-foreground"
          : "text-muted-foreground/60 hover:bg-muted hover:text-foreground",
      )}
    >
      {pressed && (
        <motion.span
          aria-hidden
          initial={{ scale: 0.4, opacity: 0.6 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={pop}
          className="border-foreground/40 absolute inset-1 rounded-full border"
        />
      )}
      <LinearIcon name={kind === "up" ? "thumbs-up" : "thumbs-down"} className="size-3.5" />
    </motion.button>
  )
}
