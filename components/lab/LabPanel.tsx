"use client"

import { useEffect, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { loadFixture } from "@/app/actions/fixtures"
import { LabDatasetTab } from "@/components/lab/LabDatasetTab"
import { LabScenariosTab } from "@/components/lab/LabScenariosTab"
import { LabWorldTab } from "@/components/lab/LabWorldTab"
import { Body, H1 } from "@/components/shared/Typography"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BUILT_IN_SCENARIOS } from "@/core/evaluation/scenarios"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

/**
 * Operator surface (spec §20, §27). Not an end-user workflow: it loads data, runs the same engine
 * headlessly against scenarios, injects faults, and lets the world change under a live mission.
 * `?run=<scenarioId>` plays a scenario through the live conversation and navigates to it.
 */
export function LabPanel() {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const router = useRouter()
  const params = useSearchParams()
  const runId = params.get("run")
  const played = useRef<string | null>(null)

  const scenarios = useMemo(() => BUILT_IN_SCENARIOS, [])

  useEffect(() => {
    if (!runId || snapshot.status !== "ready" || played.current === runId) return
    const scenario = scenarios.find((s) => s.id === runId)
    if (!scenario) return
    played.current = runId
    void (async () => {
      if (snapshot.datasetId !== scenario.datasetId)
        await runtime.loadFixtureById(scenario.datasetId)
      const missionId = await runtime.playScenario(scenario)
      if (missionId) router.push(`/m/${missionId}`)
    })()
  }, [runId, snapshot.status, snapshot.datasetId, runtime, router, scenarios])

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <H1 className="text-[20px] tracking-[-0.01em]">Test Lab</H1>
        <Body muted className="text-[13px]">
          Ground control. Load any dataset, run scenarios through the same engine the conversation
          uses, weaken a policy to prove the evaluator catches it, and change the world under a live
          mission.
        </Body>
      </div>
      <Tabs defaultValue="scenarios">
        <TabsList>
          <TabsTrigger value="dataset">Dataset</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="world">World</TabsTrigger>
        </TabsList>
        <TabsContent value="dataset">
          <LabDatasetTab loadFixture={loadFixture} />
        </TabsContent>
        <TabsContent value="scenarios">
          <LabScenariosTab scenarios={scenarios} loadFixture={loadFixture} />
        </TabsContent>
        <TabsContent value="world">
          <LabWorldTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
