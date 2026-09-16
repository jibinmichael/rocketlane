"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import type { FixtureLoader } from "@/components/shared/RuntimeProvider"
import { Body } from "@/components/shared/Typography"
import { Button } from "@/components/ui/button"
import { runScenario, toRegressionRecord } from "@/core/evaluation/runner"
import type { RegressionRecord, Scenario, ScenarioResult } from "@/core/evaluation/scenario"
import { SUPPLIED_POLICIES } from "@/core/governance/policies/supplied-policies"
import type { PolicyId } from "@/core/governance/policy"
import { ingestTwoFileExport } from "@/core/ingestion/export-two-file"
import { useRuntimeSnapshot } from "@/hooks/use-runtime"
import { cn } from "@/lib/utils"

const POLICY_SHORT: Record<PolicyId, string> = {
  P1_PROJECT_MILESTONES: "P1 milestones",
  P2_MILESTONE_SUBTASKS: "P2 subtasks",
  P3_TASK_PREDECESSORS: "P3 predecessors",
  P4_TASK_TIME: "P4 time",
}

export function LabScenariosTab({
  scenarios,
  loadFixture,
}: {
  scenarios: readonly Scenario[]
  loadFixture: FixtureLoader
}) {
  const snapshot = useRuntimeSnapshot()
  const router = useRouter()
  const [results, setResults] = useState<Record<string, ScenarioResult>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [weakened, setWeakened] = useState<Set<PolicyId>>(new Set())
  const [records, setRecords] = useState<RegressionRecord[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  const enginePolicies =
    weakened.size > 0 ? SUPPLIED_POLICIES.filter((p) => !weakened.has(p.id)) : undefined

  const run = async (scenario: Scenario) => {
    setRunning(scenario.id)
    try {
      const files = await loadFixture(scenario.datasetId)
      const { graph, report } = ingestTwoFileExport({
        datasetId: files.id,
        projectsCsv: files.projectsCsv,
        tasksCsv: files.tasksCsv,
      })
      const result = await runScenario(
        scenario,
        graph,
        report.datasetVersion,
        enginePolicies ? { enginePolicies } : {},
      )
      setResults((r) => ({ ...r, [scenario.id]: result }))
      if (!result.passed)
        setRecords((rs) => [toRegressionRecord(scenario, result, Date.now()), ...rs].slice(0, 20))
    } finally {
      setRunning(null)
    }
  }

  const runAll = async () => {
    for (const s of scenarios) await run(s)
  }

  const toggle = (id: PolicyId) =>
    setWeakened((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const passed = Object.values(results).filter((r) => r.passed).length
  const total = Object.values(results).length

  return (
    <div className="flex flex-col gap-6 pt-4">
      <section className="border-border flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void runAll()} disabled={running !== null}>
              Run all {scenarios.length}
            </Button>
            {total > 0 && (
              <span
                className={cn(
                  "text-[12px] font-medium tabular-nums",
                  passed === total ? "text-state-completed" : "text-state-blocked",
                )}
              >
                {passed}/{total} passed
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-[12px]">
              Introduce a failure — weaken the engine&apos;s policy set:
            </span>
            {SUPPLIED_POLICIES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={weakened.has(p.id)}
                className={cn(
                  "h-6 rounded-md border px-2 text-[12px] transition-colors duration-[var(--motion-fast)]",
                  weakened.has(p.id)
                    ? "border-state-blocked bg-status-error-soft text-state-blocked line-through"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {POLICY_SHORT[p.id]}
              </button>
            ))}
          </div>
        </div>
        <Body muted className="text-[12px]">
          Scenarios run on an isolated engine with a virtual clock and a fresh system of record. It
          is the same core as the conversation. The evaluator judges every write against the
          reference policies, so a weakened engine is caught, not trusted.
        </Body>
      </section>

      <ul className="border-border divide-border divide-y rounded-lg border">
        {scenarios.map((s) => {
          const r = results[s.id]
          const isOpen = expanded === s.id
          return (
            <li key={s.id} className="flex flex-col">
              <div className="grid grid-cols-[10px_1fr_150px_90px_auto] items-center gap-3 px-3 py-2">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    !r ? "bg-border" : r.passed ? "bg-state-completed" : "bg-state-blocked",
                  )}
                />
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  className="text-foreground truncate text-left text-[13px] underline-offset-2 hover:underline"
                >
                  {s.title}
                </button>
                <span className="text-muted-foreground truncate text-[12px]">{s.datasetId}</span>
                <span className="text-muted-foreground text-[12px] tabular-nums">
                  {r
                    ? `${r.score.passed}/${r.score.total} · ${r.durationMs}ms`
                    : running === s.id
                      ? "running"
                      : ""}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void run(s)}
                    disabled={running !== null}
                  >
                    Run
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={snapshot.status !== "ready"}
                    onClick={() => router.push(`/lab?run=${s.id}`)}
                    title="Play this scenario in the live conversation"
                  >
                    Play
                  </Button>
                </div>
              </div>
              {isOpen && (
                <div className="bg-muted/30 flex flex-col gap-2 px-3 py-3">
                  <div className="text-muted-foreground text-[12px]">
                    Actor {s.actorName} · turns:{" "}
                    {s.turns
                      .map((t) =>
                        t.kind === "user"
                          ? `"${t.text}"`
                          : t.kind === "hours"
                            ? `${t.hours}h`
                            : t.kind === "world"
                              ? `world: ${t.task} → ${t.status}`
                              : t.kind === "fault"
                                ? `fault: ${t.fault} on ${t.task}`
                                : t.kind,
                      )
                      .join(" → ")}{" "}
                    · expect {s.expect.outcome}
                  </div>
                  {r && (
                    <ul className="flex flex-col gap-1">
                      {r.assertions.map((a) => (
                        <li key={a.id} className="flex items-baseline gap-2 text-[12px]">
                          <span
                            className={cn(
                              "w-1.5 shrink-0 self-center rounded-full",
                              a.passed ? "bg-state-completed h-1.5" : "bg-state-blocked h-1.5",
                            )}
                          />
                          <span className="text-foreground w-44 shrink-0 font-medium">{a.id}</span>
                          <span className="text-muted-foreground">{a.detail}</span>
                        </li>
                      ))}
                      <li className="text-muted-foreground pt-1 text-[11px] tabular-nums">
                        {r.eventCount} events · {r.writeCount} writes · agent {r.versions.agent} ·
                        policies {r.versions.policySet} · dataset {r.versions.dataset} · eval{" "}
                        {r.versions.evaluation}
                        {r.weakenedPolicies.length > 0
                          ? ` · engine weakened: ${r.weakenedPolicies.join(", ")}`
                          : ""}
                      </li>
                    </ul>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {records.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground px-1 text-[11px] font-medium tracking-[0.005em] uppercase">
            Regression records (this session)
          </h2>
          <ul className="border-border divide-border divide-y rounded-lg border">
            {records.map((rec) => (
              <li key={rec.id} className="flex flex-col gap-1 px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-foreground text-[13px]">{rec.scenario.title}</span>
                  <span className="text-muted-foreground text-[11px] tabular-nums">{rec.id}</span>
                </div>
                <span className="text-state-blocked text-[12px]">{rec.diagnosis}</span>
                <details className="text-[12px]">
                  <summary className="text-muted-foreground cursor-pointer">
                    Record JSON (drop into tests/regression to replay)
                  </summary>
                  <pre className="text-muted-foreground mt-1 max-h-48 overflow-auto text-[11px]">
                    {JSON.stringify(
                      {
                        scenario: rec.scenario,
                        result: { ...rec.result, assertions: rec.result.assertions },
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
