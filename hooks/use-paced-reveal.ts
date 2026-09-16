"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Meters how many of a growing list are shown, releasing one item every `stepMs`. The engine has
 * already produced the blocks; this only paces their appearance so a turn reads as being written,
 * with the streaming marker visible between items (the human's call, 2026-09-16: anticipation
 * over instant paint). `skip` shows everything at once; the list resets when it shrinks (a new turn).
 */
export function usePacedReveal<T>(
  items: readonly T[],
  stepMs = 380,
): { shown: readonly T[]; revealing: boolean; skip: () => void } {
  const [count, setCount] = useState(0)
  const target = items.length
  // A shorter list means a new turn: reset during render, not in an effect.
  if (count > target) setCount(target)

  useEffect(() => {
    if (count >= target) return
    const t = window.setTimeout(
      () => setCount((n) => Math.min(n + 1, target)),
      count === 0 ? 520 : stepMs,
    )
    return () => window.clearTimeout(t)
  }, [count, target, stepMs])

  const skip = useCallback(() => setCount(target), [target])
  return { shown: items.slice(0, Math.min(count, target)), revealing: count < target, skip }
}
