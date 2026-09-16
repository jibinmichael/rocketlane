"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Meters how many of a growing list are shown. The engine has already produced the blocks; this
 * paces their appearance so a turn reads as being written, with the streaming marker visible
 * between items (the human's call, 2026-09-16: anticipation over instant paint). `delayFor` lets
 * the caller hold longer before heavier items. `skip` shows everything at once; the list resets
 * when it shrinks (a new turn).
 */
export function usePacedReveal<T>(
  items: readonly T[],
  delayFor: (next: T, index: number) => number = () => 480,
  instant = false,
): { shown: readonly T[]; revealing: boolean; skip: () => void } {
  // `instant` is read once, at mount: history renders whole, a fresh turn is paced.
  const [count, setCount] = useState(() => (instant ? items.length : 0))
  const target = items.length
  // A shorter list means a new turn: reset during render, not in an effect.
  if (count > target) setCount(target)

  useEffect(() => {
    if (count >= target) return
    const next = items[count]
    const delay = next === undefined ? 480 : delayFor(next, count)
    const t = window.setTimeout(() => setCount((n) => Math.min(n + 1, target)), delay)
    return () => window.clearTimeout(t)
  }, [count, target, items, delayFor])

  const skip = useCallback(() => setCount(target), [target])
  return { shown: items.slice(0, Math.min(count, target)), revealing: count < target, skip }
}
