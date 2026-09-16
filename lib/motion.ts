import type { Transition } from "motion/react"

/** Width spring when opening the canvas sidebar */
export const springEnter: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
}

/** Width tween when closing the canvas sidebar */
export const easeExit: Transition = {
  duration: 0.22,
  ease: [0.4, 0, 1, 1],
}
