"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { useRuntimeSnapshot } from "@/hooks/use-runtime"
import { cn } from "@/lib/utils"

const SURFACES = [
  { href: "/", label: "Governance Agent", match: (p: string) => p === "/" || p.startsWith("/m/") },
  { href: "/projects", label: "Projects", match: (p: string) => p.startsWith("/projects") },
  { href: "/policies", label: "Policies", match: (p: string) => p.startsWith("/policies") },
  { href: "/activity", label: "Activity", match: (p: string) => p.startsWith("/activity") },
  { href: "/lab", label: "Test Lab", match: (p: string) => p.startsWith("/lab") },
] as const

export function AppShellNav() {
  const pathname = usePathname()
  const snapshot = useRuntimeSnapshot()
  const actor = snapshot.actors.find((a) => a.id === snapshot.actorId)

  return (
    <nav
      aria-label="Product"
      className="border-border bg-sidebar flex w-[220px] shrink-0 flex-col border-r px-3 py-4"
    >
      <div className="text-foreground px-2 pb-4 text-[13px] font-semibold tracking-[-0.01em]">
        Rocketlane
      </div>
      <ul className="flex flex-col gap-0.5">
        {SURFACES.map((s) => {
          const active = s.match(pathname)
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-8 items-center rounded-md px-2 text-[13px] transition-colors",
                  "duration-[var(--motion-fast)]",
                  active
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="bg-accent-brand absolute top-2 bottom-2 left-0 w-0.5 rounded-full"
                  />
                )}
                {s.label}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="mt-auto flex flex-col gap-1 px-2 pt-4">
        <span className="text-muted-foreground text-[11px] font-medium tracking-[0.005em] uppercase">
          Acting as
        </span>
        <span className="text-foreground truncate text-[13px]">{actor?.name ?? "—"}</span>
        <span className="text-muted-foreground truncate text-[12px]">{snapshot.datasetLabel}</span>
      </div>
    </nav>
  )
}
