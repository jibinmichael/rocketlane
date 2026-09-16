import { describe, expect, it } from "vitest"

import { taskId } from "@/core/domain/ids"
import { resolveDependencyNames } from "@/core/ingestion/export-two-file"

const names = new Map([
  ["BRD Sign-off", [taskId("T1")]],
  ["Peer Review - Project Plan", [taskId("T2")]],
  ["Test Strategy, plan and acceptance criteria", [taskId("T3")]],
  ["Project PS RAG Status", [taskId("T4"), taskId("T5")]],
])

describe("resolveDependencyNames", () => {
  it("splits a plain comma-joined list", () => {
    const result = resolveDependencyNames("BRD Sign-off, Peer Review - Project Plan", names)
    expect(result.resolved).toEqual([[taskId("T1")], [taskId("T2")]])
    expect(result.unresolved).toEqual([])
  })

  it("prefers the longest match when a task name itself contains a comma", () => {
    const result = resolveDependencyNames(
      "Test Strategy, plan and acceptance criteria, BRD Sign-off",
      names,
    )
    expect(result.resolved).toEqual([[taskId("T3")], [taskId("T1")]])
    expect(result.unresolved).toEqual([])
  })

  it("reports an unresolved fragment instead of dropping the edge", () => {
    const result = resolveDependencyNames("BRD Sign-off, Something Missing", names)
    expect(result.resolved).toEqual([[taskId("T1")]])
    expect(result.unresolved).toEqual(["Something Missing"])
  })

  it("surfaces ambiguity as a multi-id match", () => {
    const result = resolveDependencyNames("Project PS RAG Status", names)
    expect(result.resolved).toEqual([[taskId("T4"), taskId("T5")]])
  })
})
