import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { runScenario } from "@/core/evaluation/runner"
import { CommittedRegressionSchema } from "@/core/evaluation/scenario"
import { ingestFixture } from "../helpers/fixtures"

/**
 * Every JSON file here is a failure that really happened, was diagnosed, fixed, and must never
 * return (spec §21). A record replays green only because the fix holds; `originalOutcome` proves
 * it once went red.
 */

const dir = join(__dirname)
const files = readdirSync(dir).filter((f) => f.endsWith(".json"))

describe("committed regression records replay green", () => {
  it("has at least one record", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    it(file, async () => {
      const raw: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"))
      const record = CommittedRegressionSchema.parse(raw)
      const scenario = "scenario" in record ? record.scenario : null
      expect(scenario).not.toBeNull()
      const originalOutcome =
        "originalOutcome" in record ? record.originalOutcome : record.result.outcome
      expect(originalOutcome, "a regression record must have failed once").not.toBe(
        scenario!.expect.outcome,
      )
      const data = ingestFixture(scenario!.datasetId)
      const result = await runScenario(scenario!, data.graph, data.report.datasetVersion)
      const failed = result.assertions.filter((a) => !a.passed).map((a) => `${a.id}: ${a.detail}`)
      expect(failed, failed.join("\n")).toEqual([])
    })
  }
})
