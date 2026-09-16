"use client"

import { useRuntimeSnapshot } from "@/hooks/use-runtime"

/** Who the agent acts as, and on which data. Read-only: the person is the person. */
export function WorkspaceLabel() {
  const snapshot = useRuntimeSnapshot()
  const actor = snapshot.actors.find((a) => a.id === snapshot.actorId)
  return (
    <div className="text-muted-foreground flex h-8 items-center gap-1.5 px-2.5 text-[13px]">
      <span className="text-foreground">{actor?.name ?? "Workspace"}</span>
      <span className="hidden text-[12px] sm:inline">· {snapshot.datasetLabel || "loading"}</span>
    </div>
  )
}
