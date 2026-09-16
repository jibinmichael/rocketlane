"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"

import { expand } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * Opens and closes with height and fade on the product's ease; nothing appears or vanishes cut.
 * Content mounted open counts as settled so hover cards inside are never clipped.
 */
export function HeightReveal({
  open,
  className,
  children,
}: {
  open: boolean
  className?: string
  children: React.ReactNode
}) {
  const [settled, setSettled] = useState(open)
  return (
    <AnimatePresence initial={false} onExitComplete={() => setSettled(false)}>
      {open && (
        <motion.div
          key="reveal"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          onAnimationStart={() => setSettled(false)}
          onAnimationComplete={() => setSettled(true)}
          transition={{ height: expand, opacity: expand }}
          className={cn(
            "flex flex-col gap-1",
            settled ? "overflow-visible" : "overflow-hidden",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
