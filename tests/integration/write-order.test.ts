import { describe, expect, it } from "vitest"

import type { Mission } from "@/core/mission/mission"
import type { AgentEvent } from "@/core/telemetry/events"
import { harness } from "../helpers/engine"

const stepByLabel = (mission: Mission, label: string, transition = "COMPLETED") =>
  mission.plan.find((s) => s.label === label && s.transition === transition)!

/**
 * Spec §8 and §35 as an invariant over the audit log, not over implementation details: for every
 * verified write, the permission check, the policy check, the start and the verified completion
 * appear in that order for that entity. A write with no preceding checks cannot exist.
 */

/** Events for the completion write of one entity; the time entry on the same task is a different write. */
function indexOf(events: readonly AgentEvent[], type: AgentEvent["type"], refId: string): number {
  return events.findIndex(
    (e) =>
      e.type === type &&
      e.refs.some((r) => r.id === refId) &&
      e.detail["command"] !== "add_time_entry" &&
      e.detail["result"] !== "add_time_entry",
  )
}

describe("every verified write is preceded by its checks, in order", () => {
  it("holds for the hero journey", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideHours(
      mission.id,
      stepByLabel(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    mission = await h.engine.approve(mission.id, stepByLabel(mission, "Acme Implementation").id)
    expect(mission.state).toBe("COMPLETED")

    const events = h.events.forMission(mission.id)
    const writes = mission.plan.filter(
      (s) => s.transition === "COMPLETED" && s.status === "succeeded",
    )
    expect(writes.length).toBeGreaterThanOrEqual(5)
    for (const step of writes) {
      const permission = indexOf(events, "PERMISSION_CHECKED", step.ref.id)
      const policy = indexOf(events, "POLICY_CHECKED", step.ref.id)
      const started = indexOf(events, "ACTION_STARTED", step.ref.id)
      const completed = events.findIndex(
        (e) =>
          e.type === "ACTION_COMPLETED" &&
          e.refs.some((r) => r.id === step.ref.id) &&
          e.detail["result"] !== "add_time_entry" &&
          e.detail["verified"] === true,
      )
      expect(permission, `${step.label}: permission checked`).toBeGreaterThanOrEqual(0)
      expect(policy, `${step.label}: policy after permission`).toBeGreaterThan(permission)
      expect(started, `${step.label}: start after policy`).toBeGreaterThan(policy)
      expect(completed, `${step.label}: verified completion after start`).toBeGreaterThan(started)
      expect(step.verification).toBe("VERIFIED")
    }
  })

  it("a denied actor produces a permission event and no write events", async () => {
    const h = harness()
    const mei = h.actor("Mei Tanaka")
    const mission = await h.engine.start(
      h.propose(mei, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    expect(mission.state).toBe("PERMISSION_DENIED")
    const events = h.events.forMission(mission.id)
    expect(events.some((e) => e.type === "PERMISSION_DENIED")).toBe(true)
    expect(events.some((e) => e.type === "ACTION_STARTED")).toBe(false)
  })
})
