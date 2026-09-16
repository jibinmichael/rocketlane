import { describe, expect, it } from "vitest"

import { runScenario } from "@/core/evaluation/runner"
import { BUILT_IN_SCENARIOS } from "@/core/evaluation/scenarios"
import { SUPPLIED_POLICIES } from "@/core/governance/policies/supplied-policies"
import { nextActionable, traceCurrentBlockers } from "@/core/resolver/blockers"
import { ingestFixture } from "../helpers/fixtures"

const datasets = {
  "cascading-conflicts": ingestFixture("cascading-conflicts"),
  "rocketlane-export": ingestFixture("rocketlane-export"),
}

describe("built-in scenarios pass through the same engine the UI uses", () => {
  for (const scenario of BUILT_IN_SCENARIOS) {
    it(scenario.title, async () => {
      const data = datasets[scenario.datasetId as keyof typeof datasets]
      const result = await runScenario(scenario, data.graph, data.report.datasetVersion)
      const failed = result.assertions.filter((a) => !a.passed).map((a) => `${a.id}: ${a.detail}`)
      expect(failed, failed.join("\n")).toEqual([])
      expect(result.passed).toBe(true)
    })
  }
})

describe("the evaluator catches a weakened engine (spec §48 step 19-20)", () => {
  it("dropping policy 4 from the engine produces a policy violation the evaluator flags", async () => {
    const hero = BUILT_IN_SCENARIOS.find((s) => s.id === "hero-cascading-conflicts")!
    const data = datasets["cascading-conflicts"]
    // With policy 4 removed from the engine, its flight plan no longer derives a time requirement;
    // the "hours" turn finds nothing pending and QA Complete is completed with no time logged.
    // The evaluator judges every write against the reference policies and flags it.
    const weakened = SUPPLIED_POLICIES.filter((p) => p.id !== "P4_TASK_TIME")
    const result = await runScenario(hero, data.graph, data.report.datasetVersion, {
      enginePolicies: weakened,
    })
    expect(result.weakenedPolicies).toEqual(["P4_TASK_TIME"])
    const violation = result.assertions.find((a) => a.id === "no_policy_violation")!
    expect(violation.passed).toBe(false)
    expect(violation.detail).toMatch(/violated the reference policies/)
    expect(result.passed).toBe(false)
  })
})

describe("the real export carries a genuine cascade (brief: 4-level conflict)", () => {
  it("Stone-Gonzalez: project → milestone → predecessor → predecessor, nearest action four deep", () => {
    const { graph } = datasets["rocketlane-export"]
    const project = graph.projects.find((p) => p.name.startsWith("Stone-Gonzalez"))!
    const blockers = traceCurrentBlockers({ kind: "project", id: project.id }, graph)
    const deepest = nextActionable(blockers)!
    expect(deepest.dependencyPath.length).toBeGreaterThanOrEqual(4)
    expect(deepest.dependencyPath[0]).toEqual({ kind: "project", id: project.id })
  })
})
