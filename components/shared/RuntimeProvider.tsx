"use client"

import { useEffect, useState } from "react"
import { MotionConfig } from "motion/react"

import type { IntentProposal, InterpretationContext } from "@/core/agent/intent/intent"
import { RuntimeContext } from "@/hooks/use-runtime"
import { Runtime } from "@/lib/runtime"

export type FixtureLoader = (
  id: string,
) => Promise<{ id: string; projectsCsv: string; tasksCsv: string }>
type RemoteInterpret = (
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
    () =>
      new Runtime({
        loadFixture,
        // The brief's real export is the default workspace; the demo dataset stays a choice.
        defaultFixture: "rocketlane-export",
        ...(modelAvailable ? { remoteInterpreter: interpret } : {}),
      }),
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
