"use client"

import { useRouter } from "next/navigation"

import { Body, H1 } from "@/components/shared/Typography"
import { Button } from "@/components/ui/button"
import { isTaskComplete } from "@/core/domain/status"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

/**
 * Read-only projection of system state (spec §43, D-12). Not a CRUD table: the only action is
 * "Open in agent", which starts a mission with the project as target.
 */
export function ProjectsList() {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const router = useRouter()
  const graph = snapshot.graph

  const open = async (name: string) => {
    const id = await runtime.send(`Mark ${name} as completed`, null)
    if (id) router.push(`/m/${id}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <H1 className="text-[20px] tracking-[-0.01em]">Projects</H1>
        <Body muted className="text-[13px]">
          Current state from the loaded dataset. Governance work happens in the agent, not here.
        </Body>
      </div>
      {!graph ? (
        <Body muted className="text-[13px]">
          Loading workspace…
        </Body>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          <li className="text-muted-foreground grid h-8 grid-cols-[1fr_120px_100px_80px_130px] items-center gap-3 px-3 text-[11px] font-medium tracking-[0.005em] uppercase">
            <span>Project</span>
            <span>Owner</span>
            <span>Status</span>
            <span className="text-right">Milestones</span>
            <span />
          </li>
          {graph.projects.map((p) => {
            const milestones = graph.milestonesOf(p.id)
            const done = milestones.filter((m) => isTaskComplete(m.status)).length
            return (
              <li
                key={p.id}
                className="hover:bg-muted/40 grid h-10 grid-cols-[1fr_120px_100px_80px_130px] items-center gap-3 px-3 transition-colors duration-[var(--motion-fast)]"
              >
                <span className="text-foreground truncate text-[13px]">{p.name}</span>
                <span className="text-muted-foreground truncate text-[12px]">
                  {p.ownerName ?? "—"}
                </span>
                <span className="text-muted-foreground text-[12px]">{p.rawStatus}</span>
                <span className="text-muted-foreground text-right text-[12px] tabular-nums">
                  {milestones.length === 0 ? "none" : `${done}/${milestones.length}`}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-self-end"
                  onClick={() => void open(p.name)}
                  disabled={p.status === "COMPLETED"}
                >
                  {p.status === "COMPLETED" ? "Complete" : "Open in agent"}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
