"use client"

import { useCallback, useState } from "react"

export type CardPlacement = { readonly x: "left" | "right"; readonly y: "below" | "above" }

/**
 * A hover card opens where there is room: measured from its trigger when the pointer or focus
 * arrives, it hangs left or right and drops below or lifts above so it never leaves the viewport.
 */
export function useCardPlacement(width: number, height: number) {
  const [placement, setPlacement] = useState<CardPlacement>({ x: "left", y: "below" })
  const place = useCallback(
    (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      setPlacement({
        x: r.left + width > window.innerWidth - 16 ? "right" : "left",
        y: r.bottom + height > window.innerHeight - 16 ? "above" : "below",
      })
    },
    [width, height],
  )
  return { placement, place }
}

export function placementClass(p: CardPlacement): string {
  return `${p.x === "left" ? "left-0" : "right-0"} ${p.y === "below" ? "top-full mt-1.5" : "bottom-full mb-1.5"}`
}
