"use client"

import { useEffect, useState } from "react"
import { MotionConfig } from "motion/react"

import type { IntentProposal, InterpretationContext } from "@/core/agent/intent/intent"
import { RuntimeContext } from "@/hooks/use-runtime"
import { Runtime } from "@/lib/runtime"

export type FixtureLoader = (
  id: string,
) => Promise<{ id: string; projectsCsv: string; tasksCsv: string }>
export type RemoteInterpret = (
  utterance: string,
  ctx: InterpretationContext,
) => Promise<IntentProposal | null>

export function RuntimeProvider({
  children,
  loadFixture,
  interpret,
  modelAvailable,
}: {
  children: React.ReactNode
  loadFixture: FixtureLoader
  interpret: RemoteInterpret
  modelAvailable: boolean
}) {
  const [runtime] = useState(
    () => new Runtime({ loadFixture, ...(modelAvailable ? { remoteInterpreter: interpret } : {}) }),
  )

  useEffect(() => {
    void runtime.boot()
    return () => runtime.dispose()
  }, [runtime])

  return (
    <RuntimeContext.Provider value={runtime}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </RuntimeContext.Provider>
  )
}
