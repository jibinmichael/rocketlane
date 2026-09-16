"use client"

import { useEffect, useState } from "react"

/**
 * Meters how many of a growing list are shown, releasing one item every `stepMs`. The engine has
 * already produced the blocks; this only paces their appearance so a turn reads as being written,
 * with the streaming marker visible between items (the human's call, 2026-09-16: anticipation
 * over instant paint). Resets when the list shrinks (a new turn).
 */
export function usePacedReveal<T>(items: readonly T[], stepMs = 380): readonly T[] {
  const [shown, setShown] = useState(0)
  const target = items.length
  // A shorter list means a new turn: reset during render, not in an effect.
  if (shown > target) setShown(target)

  useEffect(() => {
    if (shown >= target) return
    const t = window.setTimeout(
      () => setShown((n) => Math.min(n + 1, target)),
      shown === 0 ? 520 : stepMs,
    )
    return () => window.clearTimeout(t)
  }, [shown, target, stepMs])

  return items.slice(0, Math.min(shown, target))
}
