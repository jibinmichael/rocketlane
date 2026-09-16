import Link from "next/link"

import { WorkspaceLabel } from "@/components/agent/WorkspaceLabel"
import { MissionHistoryMenu } from "@/components/mission/MissionHistoryMenu"

/**
 * The only chrome above the agent, full bleed: workspace mark left, the mission title as a
 * history dropdown beside it, the acting user and workspace controls right. No module navigation;
 * the agent is the product (final brief §3–4). "Acme" is prototype data; the mark is a fabricated glyph.
 */
export function AppHeader() {
  return (
    <header className="border-border/60 bg-background/90 sticky top-0 z-20 border-b backdrop-blur">
      <div className="flex h-12 w-full items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href="/"
            className="hover:bg-muted flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-semibold tracking-[-0.01em] transition-colors duration-[var(--motion-fast)]"
            aria-label="Acme workspace home"
          >
            <span
              aria-hidden
              className="bg-foreground text-background flex size-5 items-center justify-center rounded-full text-[11px] leading-none font-bold"
            >
              A
            </span>
            <span className="text-foreground">Acme</span>
          </Link>
          <span aria-hidden className="text-border px-0.5 text-[13px]">
            /
          </span>
          <MissionHistoryMenu />
        </div>
        <WorkspaceLabel />
      </div>
    </header>
  )
}
