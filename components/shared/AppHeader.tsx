import Link from "next/link"

import { WorkspaceMenu } from "@/components/agent/WorkspaceMenu"
import type { FixtureLoader } from "@/components/shared/RuntimeProvider"

/**
 * The only chrome above the agent: a workspace identity on the left, the acting user and
 * workspace controls on the right. No module navigation; the agent is the product (final brief §3–4).
 * "Acme" is prototype data; the mark is a fabricated glyph, not a real logo.
 */
export function AppHeader({ loadFixture }: { loadFixture: FixtureLoader }) {
  return (
    <header className="border-border/70 bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-[880px] items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md text-[13px] font-semibold tracking-[-0.01em]"
          aria-label="Acme workspace home"
        >
          <span
            aria-hidden
            className="bg-foreground text-background flex size-5 items-center justify-center rounded-[5px] text-[11px] leading-none font-bold"
          >
            A
          </span>
          <span className="text-foreground">Acme</span>
        </Link>
        <WorkspaceMenu loadFixture={loadFixture} />
      </div>
    </header>
  )
}
