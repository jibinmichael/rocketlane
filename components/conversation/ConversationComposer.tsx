"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, Paperclip, Pause, Play } from "lucide-react"

import { springEnter } from "@/lib/motion"
import { cn } from "@/lib/utils"

const MAX_HEIGHT_PX = 180
const ROTATE_INTERVAL_MS = 4200

export type ComposerPlaceholder = { text: string; suggestion: boolean }

/**
 * The one input surface, on the home and on a mission (final brief §9: the conversation is the
 * control surface). Attach lives inside on the left and opens "Test with project data" in place;
 * the trailing control is Send, then Pause while the agent is in flight (Esc does the same), then
 * Resume while paused. Placeholders rotate only when more than one is supplied; Tab fills a
 * suggestion. Mechanics adapted from the Wati composer; chrome is this product's.
 */
export function ConversationComposer({
  onSend,
  onPause,
  onResume,
  onAttach,
  attachOpen = false,
  disabled = false,
  executing = false,
  paused = false,
  placeholder = "State an outcome.",
  placeholders,
  autoFocus = false,
  focusKey = null,
  fill = null,
  className,
}: {
  onSend: (text: string) => void
  onPause?: () => void
  onResume?: () => void
  onAttach?: () => void
  attachOpen?: boolean
  disabled?: boolean
  executing?: boolean
  paused?: boolean
  placeholder?: string
  /** Rotating placeholders (home). Suggestions can be filled with Tab. */
  placeholders?: readonly ComposerPlaceholder[]
  autoFocus?: boolean
  /** Changes when the mission starts waiting for typed input; focus moves here unless the user is elsewhere. */
  focusKey?: string | null
  /** Text pushed into the field from outside (a quick action). Changes replace the draft. */
  fill?: { text: string; key: number } | null
  className?: string
}) {
  const [value, setValue] = useState("")
  const [index, setIndex] = useState(0)
  const [appliedFill, setAppliedFill] = useState<number | null>(null)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  // A quick action replaces the draft: state adjusted during render, focus moved in an effect.
  if (fill && fill.key !== appliedFill) {
    setAppliedFill(fill.key)
    setValue(fill.text)
  }
  const hasText = value.trim().length > 0
  const rotating = placeholders && placeholders.length > 1 ? placeholders : null
  const current = rotating ? rotating[index % rotating.length] : null

  useEffect(() => {
    if (!focusKey) return
    const active = document.activeElement
    if (active && active !== document.body && active !== ref.current) return
    ref.current?.focus()
  }, [focusKey])

  useEffect(() => {
    if (appliedFill === null) return
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [appliedFill])

  useEffect(() => {
    if (!rotating || hasText) return
    const id = window.setInterval(() => setIndex((i) => i + 1), ROTATE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [rotating, hasText])

  const autogrow = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    const next = Math.min(el.scrollHeight, MAX_HEIGHT_PX)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden"
  }, [])

  useEffect(() => autogrow(), [value, autogrow])

  const submit = () => {
    if (disabled || !hasText) return
    onSend(value.trim())
    setValue("")
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
      return
    }
    // Esc pauses: it stops scheduling, never cancels (a stop is a typed or clicked decision).
    if (e.key === "Escape" && executing && onPause) {
      e.preventDefault()
      onPause()
      return
    }
    if (e.key === "Tab" && !hasText && current?.suggestion) {
      e.preventDefault()
      setValue(current.text)
      requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        el.setSelectionRange(current.text.length, current.text.length)
      })
    }
  }

  const trailing: "send" | "pause" | "resume" =
    executing && onPause ? "pause" : paused && onResume ? "resume" : "send"

  return (
    <div
      className={cn(
        "bg-card rounded-[20px] shadow-[var(--shadow-composer)] transition-shadow duration-[var(--motion-normal)] focus-within:shadow-[var(--shadow-composer-focus)]",
        disabled && !executing && !paused && "opacity-70",
        className,
      )}
    >
      <div className="relative px-4 pt-3.5">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={rotating ? "" : placeholder}
          autoFocus={autoFocus}
          aria-label="Message the governance agent"
          className="text-foreground placeholder:text-muted-foreground block w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.6] outline-none disabled:cursor-default"
        />
        {rotating && !hasText && current && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-3.5 overflow-hidden"
            style={{ height: "calc(15px * 1.6)" }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={index}
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-100%", opacity: 0 }}
                transition={{ y: springEnter, opacity: { duration: 0.18 } }}
                className="flex items-center gap-2"
              >
                <span className="text-muted-foreground truncate text-[15px] leading-[1.6]">
                  {current.text}
                </span>
                {current.suggestion && (
                  <kbd className="bg-muted text-muted-foreground inline-flex shrink-0 items-center rounded-[4px] px-1.5 py-0.5 font-sans text-[10.5px] leading-none font-semibold">
                    tab
                  </kbd>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-2.5 pt-2 pb-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {onAttach && (
            <button
              type="button"
              onClick={onAttach}
              aria-pressed={attachOpen}
              aria-label="Test with project data"
              title="Test with project data"
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)]",
                attachOpen
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Paperclip aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          )}
          {executing && (
            <span className="text-muted-foreground truncate pl-1 text-[12px]">Esc pauses</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {trailing === "pause" ? (
              <motion.button
                key="pause"
                type="button"
                onClick={onPause}
                aria-label="Pause the mission (Esc)"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={springEnter}
                className="border-border text-foreground hover:bg-muted flex h-8 items-center gap-1.5 rounded-full border pr-3 pl-2.5 text-[13px] font-medium transition-colors duration-[var(--motion-fast)]"
              >
                <Pause aria-hidden className="size-3.5" strokeWidth={2} />
                Pause
              </motion.button>
            ) : trailing === "resume" ? (
              <motion.button
                key="resume"
                type="button"
                onClick={onResume}
                aria-label="Resume the mission"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={springEnter}
                className="bg-foreground text-background flex h-8 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[13px] font-medium transition-opacity duration-[var(--motion-fast)] hover:opacity-90"
              >
                <Play aria-hidden className="size-3.5" strokeWidth={2} />
                Resume
              </motion.button>
            ) : (
              <motion.button
                key="send"
                type="button"
                onClick={submit}
                disabled={!hasText || disabled}
                aria-label="Send"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={springEnter}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)]",
                  hasText && !disabled
                    ? "bg-foreground text-background hover:opacity-90"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <ArrowUp aria-hidden className="size-4" strokeWidth={2} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
