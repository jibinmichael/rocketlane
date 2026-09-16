import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * The agent's mark: the compliance logo, always round, never animated. It is the agent's avatar
 * in the thread, the face of the home, the streaming marker and the favicon (app/icon.svg).
 */
export function AgentMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/agent-mark.svg"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
      priority
    />
  )
}
