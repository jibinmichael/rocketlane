"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"

import { cn } from "@/lib/utils"

const MAX_HEIGHT_PX = 160

export function ConversationComposer({
  onSend,
  onStop,
  disabled = false,
  executing = false,
  placeholder = "What do you want done?",
  autoFocus = false,
  focusKey = null,
  className,
}: {
  onSend: (text: string) => void
  onStop?: () => void
  disabled?: boolean
  executing?: boolean
  placeholder?: string
  autoFocus?: boolean
  /** Changes when the mission starts waiting for typed input; focus moves here unless the user is elsewhere. */
  focusKey?: string | null
  className?: string
}) {
  const [value, setValue] = useState("")
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!focusKey) return
    const active = document.activeElement
    if (active && active !== document.body && active !== ref.current) return
    ref.current?.focus()
  }, [focusKey])
  const hasText = value.trim().length > 0

  const autogrow = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
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
    }
    if (e.key === "Escape" && executing && onStop) {
      e.preventDefault()
      onStop()
    }
  }

  return (
    <div
      className={cn(
        "border-border bg-background flex items-end gap-2 rounded-lg border px-3 py-2 shadow-[var(--shadow-sm)] transition-shadow duration-[var(--motion-fast)] focus-within:shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Message the governance agent"
        className="text-foreground placeholder:text-muted-foreground block w-full resize-none border-0 bg-transparent py-1 text-[14px] leading-[1.6] outline-none disabled:opacity-60"
      />
      {executing && onStop ? (
        <button
          type="button"
          onClick={onStop}
          className="text-muted-foreground hover:text-foreground border-border h-7 shrink-0 rounded-md border px-2 text-[12px] font-medium transition-colors duration-[var(--motion-fast)]"
          aria-label="Stop the mission (Esc)"
        >
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!hasText || disabled}
          aria-label="Send"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors duration-[var(--motion-fast)]",
            hasText && !disabled
              ? "bg-foreground text-background hover:opacity-90"
              : "bg-muted text-muted-foreground",
          )}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 13V3M8 3l-4 4M8 3l4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
