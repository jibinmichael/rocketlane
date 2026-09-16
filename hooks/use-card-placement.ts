"use client"

import { useCallback, useState } from "react"

export type CardPlacement = { readonly x: "left" | "right"; readonly y: "below" | "above" }

type HoverCardState = { readonly open: boolean; readonly placement: CardPlacement }

/**
 * A hover card opens where there is room and only once it knows where: the trigger is measured
 * when the pointer or focus arrives, and the card renders in the same update, already in place.
 * Showing first and moving a frame later is what reads as flicker.
 */
export function useHoverCard(width: number, height: number) {
  const [state, setState] = useState<HoverCardState>({
    open: false,
    placement: { x: "left", y: "below" },
  })
  const show = useCallback(
    (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      setState({
        open: true,
        placement: {
          x: r.left + width > window.innerWidth - 16 ? "right" : "left",
          y: r.bottom + height > window.innerHeight - 16 ? "above" : "below",
        },
      })
    },
    [width, height],
  )
  const hide = useCallback(() => setState((s) => (s.open ? { ...s, open: false } : s)), [])
  return {
    open: state.open,
    placement: state.placement,
    handlers: {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget),
      onMouseLeave: hide,
      onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget),
      onBlur: hide,
    },
  }
}

export function placementClass(p: CardPlacement): string {
  return `${p.x === "left" ? "left-0" : "right-0"} ${p.y === "below" ? "top-full mt-1.5" : "bottom-full mb-1.5"}`
}
