"use client"

import { useEffect, useMemo } from "react"

import { loadFixture } from "@/app/actions/fixtures"
import { interpretUtterance } from "@/app/actions/interpret"
import { RuntimeContext } from "@/hooks/use-runtime"
import { Runtime } from "@/lib/runtime"

export function RuntimeProvider({
  children,
  modelAvailable,
}: {
  children: React.ReactNode
  modelAvailable: boolean
}) {
  const runtime = useMemo(
    () =>
      new Runtime({
        loadFixture,
        ...(modelAvailable ? { remoteInterpreter: interpretUtterance } : {}),
      }),
    [modelAvailable],
  )

  useEffect(() => {
    void runtime.boot()
  }, [runtime])

  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>
}
