"use client"

import { useEffect, useState } from "react"

import { LinearIcon, type LinearIconName } from "@/components/shared/LinearIcon"
import type { Inline } from "@/core/agent/conversation/blocks"
import { cn } from "@/lib/utils"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const MS_PER_CHAR = 18

const KIND_ICON: Record<string, LinearIconName> = {
  project: "layers",
  phase: "two-flags",
  task: "issues",
}

/** Characters a part occupies in the typing budget; chips count as one beat. */
function weight(part: Inline): number {
  return part.kind === "text" ? part.text.length : 3
}

/**
 * Types a line in at a steady beat once `startDelayMs` has passed. The copy is already final when
 * this runs; only its appearance is paced.
 */
function useTypewriter(total: number, active: boolean, startDelayMs: number) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const start = performance.now() + startDelayMs
    const tick = (now: number) => {
      const n = Math.max(0, Math.min(total, Math.floor((now - start) / MS_PER_CHAR)))
      setCount(n)
      if (n < total) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [total, active, startDelayMs])
  return active ? count : total
}

/**
 * Renders a template line. Entity slots become grey chips with a kind glyph (ClickUp Brain's
 * inline object token) so project content is visibly data, never agent prose (spec §17). No
 * markdown parsing anywhere. With `typing`, the line writes itself in.
 */
export function ConversationInlineText({
  line,
  className,
  typing = false,
  startDelayMs = 0,
}: {
  line: readonly Inline[]
  className?: string
  typing?: boolean
  startDelayMs?: number
}) {
  const total = line.reduce((n, p) => n + weight(p), 0)
  const shown = useTypewriter(total, typing, startDelayMs)
  const offsets = line.reduce<number[]>((acc, part) => {
    acc.push((acc[acc.length - 1] ?? 0) + weight(part))
    return acc
  }, [])

  return (
    <span className={cn("text-foreground text-[15px] leading-[22px]", className)}>
      {line.map((part, i) => {
        const from = (offsets[i] ?? 0) - weight(part)
        if (typing && from >= shown) return null
        switch (part.kind) {
          case "text": {
            const text = typing ? part.text.slice(0, Math.max(0, shown - from)) : part.text
            return <span key={i}>{text}</span>
          }
          case "entity": {
            const icon = KIND_ICON[part.ref.kind] ?? "issues"
            return (
              <span
                key={i}
                className="bg-muted text-foreground mx-px inline-flex h-[20px] items-center gap-1 rounded-[5px] px-1.5 align-[-5px] text-[13px] leading-none font-medium"
                title={part.label}
                data-entity={`${part.ref.kind}:${part.ref.id}`}
              >
                <LinearIcon name={icon} className="text-muted-foreground size-3" />
                {part.label}
              </span>
            )
          }
          case "policy":
            return (
              <span
                key={i}
                className="text-muted-foreground border-border ml-1 inline rounded-[4px] border px-1 py-px text-[11px] font-medium tracking-[0.005em]"
                data-policy={part.policyId}
              >
                {part.label}
              </span>
            )
          case "count":
            return (
              <span key={i} className="font-medium tabular-nums">
                {part.value}
              </span>
            )
          case "time":
            return (
              <span key={i} className="tabular-nums">
                {timeFormat.format(new Date(part.at))}
              </span>
            )
        }
      })}
      {typing && shown < total && (
        <span
          aria-hidden
          className="bg-foreground/70 ml-px inline-block h-[14px] w-px align-[-2px]"
        />
      )}
    </span>
  )
}

/** Total typing time of a line, so the next line can start after it. */
export function lineTypingMs(line: readonly Inline[]): number {
  return line.reduce((n, p) => n + weight(p), 0) * MS_PER_CHAR
}
