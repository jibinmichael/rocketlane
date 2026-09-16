"use client"

import { useEffect, useId, useRef } from "react"
import { AnimatePresence, motion } from "motion/react"

import { AgentDataPanel } from "@/components/agent/AgentDataPanel"
import { LinearIcon } from "@/components/shared/LinearIcon"
import { crossfade, settle } from "@/lib/motion"

/**
 * "Test any project files" as a modal (Delphi / Perplexity upload pattern): one surface, a drop
 * zone, the two file rows, one primary action. Esc and the backdrop close it; focus starts inside.
 */
export function AgentDataDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      window.removeEventListener("keydown", onKey)
      previous?.focus()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={crossfade}
          className="bg-foreground/20 fixed inset-0 z-40 flex items-start justify-center px-4 pt-[12vh] backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={settle}
            className="bg-card text-card-foreground w-full max-w-[520px] rounded-2xl shadow-[var(--shadow-lg)] outline-none"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <h2
                id={titleId}
                className="text-foreground text-[15px] font-semibold tracking-[-0.01em]"
              >
                Test with your project files
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-7 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)]"
              >
                <LinearIcon name="close" className="size-3.5" />
              </button>
            </div>
            <AgentDataPanel onLoaded={onClose} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
