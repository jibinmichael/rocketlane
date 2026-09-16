import Link from "next/link"

import { ArtifactStateChip } from "@/components/artifacts/ArtifactStateChip"
import type { MissionSummary } from "@/core/mission/mission"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

export function ArtifactMissionRow({ mission }: { mission: MissionSummary }) {
  const needsYou = mission.pending !== null
  return (
    <li>
      <Link
        href={`/m/${mission.id}`}
        className="hover:bg-muted/60 group flex h-9 items-center gap-3 rounded-md px-2 transition-colors duration-[var(--motion-fast)]"
      >
        <span className="text-foreground min-w-0 flex-1 truncate text-[13px]">
          {mission.goalText}
        </span>
        {needsYou && <span className="text-state-waiting text-[12px] font-medium">Needs you</span>}
        <span className="text-muted-foreground shrink-0 text-[12px] tabular-nums">
          {mission.progress.done}/{mission.progress.total}
        </span>
        <ArtifactStateChip state={mission.state} />
        <span className="text-muted-foreground w-14 shrink-0 text-right text-[11px] tabular-nums">
          {timeFormat.format(new Date(mission.updatedAt))}
        </span>
      </Link>
    </li>
  )
}
