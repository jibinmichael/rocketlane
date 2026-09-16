"use client"

import Link from "next/link"

import { ArtifactStateChip } from "@/components/artifacts/ArtifactStateChip"
import { ConversationIcon } from "@/components/conversation/ConversationIcon"
import { Body } from "@/components/shared/Typography"
import { evaluateMission, type MissionEvaluation } from "@/core/evaluation/mission-evaluation"
import { isTerminal } from "@/core/mission/mission"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

const CHECK_TITLE: Record<MissionEvaluation["checks"][number]["id"], string> = {
  policy_violation: "Governance",
  unauthorized_write: "Authorization",
  unverified_completion: "Verification",
  scope_expansion: "Scope",
  expected_final_state: "Final state",
}

/**
 * Every finished mission on the loaded data, with the five invariants judged from its audit log and
 * a fresh read of the system (spec §20, §39). No score. Click through for the full evidence.
 */
export function LabMissionEvaluations() {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const graph = snapshot.graph
  if (!graph) return null
  const finished = snapshot.missions
    .map((summary) => runtime.mission(summary.id))
    .filter((m): m is NonNullable<typeof m> => m !== null && isTerminal(m))
    .map((mission) => ({
      mission,
      evaluation: evaluateMission(
        mission,
        snapshot.events.filter((e) => e.missionId === mission.id),
        graph,
      ),
    }))

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-muted-foreground px-1 text-[11px] font-medium tracking-[0.005em] uppercase">
        Missions on this data
      </h2>
      {finished.length === 0 ? (
        <Body muted className="px-1 text-[13px]">
          None yet. State an outcome in the Governance Agent; the evaluation appears here and at the
          end of the mission.
        </Body>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {finished.map(({ mission, evaluation }) => (
            <li key={mission.id}>
              <Link
                href={`/m/${mission.id}`}
                className="hover:bg-muted/60 flex h-10 items-center gap-3 px-3 transition-colors duration-[var(--motion-fast)]"
              >
                <span className="text-foreground min-w-0 flex-1 truncate text-[13px]">
                  {mission.goalText}
                </span>
                <span className="flex items-center gap-1.5" aria-label="Evaluation checks">
                  {evaluation.checks.map((c) => (
                    <span key={c.id} title={`${CHECK_TITLE[c.id]}: ${c.detail}`}>
                      <ConversationIcon
                        name={c.passed ? "check" : "error"}
                        tone={c.passed ? "success" : "error"}
                      />
                    </span>
                  ))}
                </span>
                <span className="text-muted-foreground w-24 shrink-0 text-right text-[12px] tabular-nums">
                  {evaluation.writes} {evaluation.writes === 1 ? "write" : "writes"}
                </span>
                <ArtifactStateChip state={mission.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
