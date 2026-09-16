"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Pause } from "lucide-react"

import { LinearIcon } from "@/components/shared/LinearIcon"
import { springEnter } from "@/lib/motion"
import { cn } from "@/lib/utils"

const MAX_HEIGHT_PX = 180
const ROTATE_INTERVAL_MS = 4200

export type ComposerPlaceholder = { text: string; suggestion: boolean }

/**
 * The one input surface, on the home and on a mission (final brief §9: the conversation is the
 * control surface). "Test any project files" lives inside on the left and opens the upload modal;
 * the trailing control is Send, which grows into the Stop ring while the agent is in flight (click
 * or Esc pauses; a stop is a typed decision), then Resume while paused. Placeholders rotate only
 * when more than one is supplied; Tab fills a suggestion. Mechanics adapted from the Wati
 * composer; the ring and the vibrant controls follow the ClickUp Brain reference.
 */
export function ConversationComposer({
  onSend,
  onPause,
  onResume,
  onAttach,
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
  disabled?: boolean
  executing?: boolean
  paused?: boolean
  placeholder?: string
  placeholders?: readonly ComposerPlaceholder[]
  autoFocus?: boolean
  /** Changes when the mission starts waiting for typed input; focus moves here unless the user is elsewhere. */
  focusKey?: string | null
  /** Text pushed into the field from outside (a suggested row). Changes replace the draft. */
  fill?: { text: string; key: number } | null
  className?: string
}) {
  const [value, setValue] = useState("")
  const [index, setIndex] = useState(0)
  const [appliedFill, setAppliedFill] = useState<number | null>(null)
  const ref = useRef<HTMLTextAreaElement | null>(null)
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

  const trailing: "send" | "stop" | "resume" =
    executing && onPause ? "stop" : paused && onResume ? "resume" : "send"

  return (
    <div
      className={cn(
        "bg-card rounded-[18px] shadow-[var(--shadow-composer)] transition-shadow duration-[var(--motion-normal)] focus-within:shadow-[var(--shadow-composer-focus)]",
        disabled && !executing && !paused && "opacity-70",
        className,
      )}
    >
      <div className="relative px-4 pt-3">
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
          className="text-foreground placeholder:text-muted-foreground block w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[1.6] outline-none disabled:cursor-default"
        />
        {rotating && !hasText && current && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-3 overflow-hidden"
            style={{ height: "calc(14px * 1.6)" }}
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
                <span className="text-muted-foreground truncate text-[14px] leading-[1.6]">
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
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors duration-[var(--motion-fast)]"
            >
              <LinearIcon name="bolt" className="text-vibe-1 size-3.5" />
              Test any project files
            </button>
          )}
          {executing && (
            <span className="text-muted-foreground truncate pl-1 text-[12px]">Esc pauses</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {trailing === "stop" ? (
              <motion.button
                key="stop"
                type="button"
                onClick={onPause}
                aria-label="Pause the mission (Esc)"
                title="Pause (Esc)"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={springEnter}
                className="relative flex size-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--vibe-gradient)" }}
              >
                <span
                  aria-hidden
                  className="bg-card absolute inset-[3px] flex items-center justify-center rounded-full"
                >
                  <Pause className="text-foreground size-3" strokeWidth={2.5} fill="currentColor" />
                </span>
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
                <LinearIcon name="triangle" rotate={90} className="size-3" />
                Resume
              </motion.button>
            ) : (
              <motion.button
                key="send"
                type="button"
                onClick={submit}
                disabled={!hasText || disabled}
                aria-label="Send"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={springEnter}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full transition-[background,color,transform] duration-[var(--motion-normal)]",
                  hasText && !disabled ? "text-foreground" : "bg-muted text-muted-foreground",
                )}
                {...(hasText && !disabled
                  ? { style: { background: "var(--vibe-gradient-soft)" } }
                  : {})}
              >
                <LinearIcon name="arrow-right" className="size-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
