"use client"

import { LabDatasetTab } from "@/components/lab/LabDatasetTab"
import { LabMissionEvaluations } from "@/components/lab/LabMissionEvaluations"
import { LabWorldTab } from "@/components/lab/LabWorldTab"
import type { FixtureLoader } from "@/components/shared/RuntimeProvider"
import { Body, H1 } from "@/components/shared/Typography"

/**
 * The evaluator's surface, kept small (final pass §17–§22): load project data, run the normal
 * agent against it, read the evidence. The dataset changes; the engine does not. Deterministic
 * scenarios live in the test suite, not here.
 */
export function LabPanel({ loadFixture }: { loadFixture: FixtureLoader }) {
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <H1 className="text-[20px] tracking-[-0.01em]">Test with your project data</H1>
        <Body muted className="text-[13px]">
          Upload a Rocketlane two-file export. The same target resolution, governance, dependency
          resolver, mission engine, permissions and verification run against it; nothing is
          special-cased for the demo. Then state an outcome in the Governance Agent and read the
          evaluation at the end of the mission.
        </Body>
      </div>
      <LabDatasetTab loadFixture={loadFixture} />
      <LabMissionEvaluations />
      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground px-1 text-[11px] font-medium tracking-[0.005em] uppercase">
          Simulate the outside world
        </h2>
        <Body muted className="px-1 text-[12px]">
          Change a task as another person while a mission runs, or arm a fault on the next write, to
          evaluate course correction, timeouts and failures in one browser. A second tab does the
          same thing for real.
        </Body>
        <LabWorldTab />
      </section>
    </div>
  )
}
