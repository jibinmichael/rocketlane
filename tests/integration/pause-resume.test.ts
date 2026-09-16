import { describe, expect, it } from "vitest"

import { renderMission } from "@/core/agent/conversation/renderer"
import type { Actor } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef } from "@/core/domain/ids"
import { MissionEngine } from "@/core/execution/engine"
import {
  type PermissionAction,
  type PermissionCheck,
  type PermissionEvaluator,
  RoleBasedPermissions,
} from "@/core/governance/permissions"
import { SUPPLIED_POLICIES } from "@/core/governance/policies/supplied-policies"
import type { Policy } from "@/core/governance/policy"
import type { Mission } from "@/core/mission/mission"
import { MissionSchema } from "@/core/mission/schema"
import { MemoryMissionStore } from "@/core/mission/store"
import { VirtualClock } from "@/core/system/clock"
import { InMemorySystemOfRecord } from "@/core/system/in-memory"
import { EventLog } from "@/core/telemetry/events"
import { harness } from "../helpers/engine"
import { ingestFixture } from "../helpers/fixtures"

/**
 * Start → Pause → Resume → Cancel as a first-class lifecycle. Pause controls future execution;
 * reconciliation establishes what actually happened; resume always revalidates. Every case is
 * deterministic: in-flight windows come from the engine's own commit stream, never timers.
 */

const stepByLabel = (mission: Mission, label: string, transition = "COMPLETED") =>
  mission.plan.find((s) => s.label === label && s.transition === transition)!

const eventTypes = (h: ReturnType<typeof harness>, id: string) =>
  h.events.forMission(id).map((e) => e.type)

/**
 * Act the moment the engine commits the step as running (the write has been issued, not yet
 * applied). Deterministic: it rides the engine's own commit stream, never a timer.
 */
function whenInFlight(h: ReturnType<typeof harness>, act: (missionId: string) => void) {
  let done = false
  h.engine.subscribe((m) => {
    if (!done && m.state === "EXECUTING" && m.currentStepId) {
      done = true
      act(m.id)
    }
  })
}

/** Beacon Rollout has time logged everywhere: three task writes run straight through to the confirmation. */
function beacon(h: ReturnType<typeof harness>) {
  const priya = h.actor("Priya Raman")
  return h.propose(priya, "complete Beacon Rollout", [h.project("Beacon Rollout")])
}

describe("pause: the boundary", () => {
  it("between two actions: nothing further starts, the last update stays verified", async () => {
    const h = harness()
    const plan = beacon(h)
    let paused = false
    h.engine.subscribe((m) => {
      if (!paused && m.plan.some((s) => s.status === "succeeded") && m.state === "ACTIVE") {
        paused = true
        h.engine.pause(m.id)
      }
    })
    const mission = await h.engine.start(plan, { datasetId: "x" })
    expect(mission.state).toBe("PAUSED")
    expect(mission.plan.filter((s) => s.status === "succeeded")).toHaveLength(1)
    expect(h.sor.serialize().changeCount).toBe(1)
    const types = eventTypes(h, mission.id)
    expect(types).toContain("PAUSE_REQUESTED")
    expect(types).toContain("MISSION_PAUSED")
    expect(types).not.toContain("ACTION_RECONCILIATION_STARTED")
    const events = h.events.forMission(mission.id)
    const paused_ = events.find((e) => e.type === "MISSION_PAUSED")!
    expect(paused_.detail["inFlight"]).toBe(false)
    expect(paused_.detail["lastVerified"]).toBe("Load test")
  })

  it("during an API write: the in-flight update is finished and verified, then the mission pauses", async () => {
    const h = harness()
    const plan = beacon(h)
    let requested: Mission | null = null
    whenInFlight(h, (id) => {
      requested = h.engine.pause(id)
    })
    const mission = await h.engine.start(plan, { datasetId: "x" })
    expect(requested!.pauseRequested).toBe(true)
    expect(requested!.state).toBe("EXECUTING")
    expect(mission.state).toBe("PAUSED")
    expect(mission.pauseRequested).toBe(false)
    const first = mission.plan.find((s) => s.status === "succeeded")!
    expect(first.verification).toBe("VERIFIED")
    expect(h.sor.serialize().changeCount).toBe(1)
    const types = eventTypes(h, mission.id)
    const order = [
      "PAUSE_REQUESTED",
      "ACTION_RECONCILIATION_STARTED",
      "ACTION_RECONCILED",
      "MISSION_PAUSED",
    ] as const
    const indices = order.map((t) => types.indexOf(t))
    expect(indices.every((i) => i >= 0)).toBe(true)
    expect([...indices].sort((a, b) => a - b)).toEqual(indices)
    const blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    const types_ = blocks.map((b) => b.type)
    expect(types_).toContain("pause_requested")
    expect(types_[types_.length - 1]).toBe("paused")
    const text = blocks[blocks.length - 1]!.lines.map((l) =>
      l.map((i) => ("text" in i ? i.text : "label" in i ? i.label : "")).join(""),
    ).join("\n")
    expect(text).toContain("completed before the pause took effect and was verified")
    expect(text).toContain("No further updates were started")
  })

  it("immediately before execution: paused with zero writes", async () => {
    const h = harness()
    const plan = beacon(h)
    let paused = false
    h.engine.subscribe((m) => {
      if (!paused && m.plan.length > 0 && m.state === "ACTIVE") {
        paused = true
        h.engine.pause(m.id)
      }
    })
    const mission = await h.engine.start(plan, { datasetId: "x" })
    expect(mission.state).toBe("PAUSED")
    expect(h.sor.serialize().changeCount).toBe(0)
    expect(mission.plan.every((s) => s.status === "pending")).toBe(true)
    const blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    const paused_ = blocks.find((b) => b.type === "paused")!
    const text = paused_.lines
      .map((l) => l.map((i) => ("text" in i ? i.text : "")).join(""))
      .join("\n")
    expect(text).toContain("I stopped before starting the next update.")
    expect(text).toContain("No updates had been made yet.")
    expect(paused_.actions.map((a) => a.label)).toEqual(["Resume", "Stop"])
  })

  it("after the write but before verification: verification still happens, then pause", async () => {
    const h = harness()
    const plan = beacon(h)
    let paused = false
    h.sor.subscribe(() => {
      if (!paused) {
        paused = true
        h.engine.pause(plan.missionId)
      }
    })
    const mission = await h.engine.start(plan, { datasetId: "x" })
    expect(mission.state).toBe("PAUSED")
    const first = mission.plan.find((s) => s.status === "succeeded")!
    expect(first.verification).toBe("VERIFIED")
    expect(h.sor.serialize().changeCount).toBe(1)
    expect(eventTypes(h, mission.id)).toContain("ACTION_RECONCILED")
  })

  it("while waiting for input: paused, the ask is withdrawn, and re-asked on resume", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "complete acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    expect(mission.pending?.kind).toBe("input")
    mission = h.engine.pause(mission.id)
    expect(mission.state).toBe("PAUSED")
    expect(mission.pending).toBeNull()
    mission = await h.engine.resume(mission.id)
    expect(mission.state).toBe("WAITING")
    expect(mission.pending?.kind).toBe("input")
    expect(h.sor.serialize().changeCount).toBe(0)
  })

  it("Esc semantics: pause is not cancel; paused missions are resumable, cancelled ones are not", async () => {
    const h = harness()
    let mission = await h.engine.start(beacon(h), { datasetId: "x" })
    expect(mission.pending?.kind).toBe("confirm_step")
    mission = h.engine.pause(mission.id)
    expect(mission.state).toBe("PAUSED")
    mission = await h.engine.resume(mission.id)
    expect(mission.state).toBe("WAITING")
    mission = h.engine.cancel(mission.id)
    expect(mission.state).toBe("CANCELLED")
    const after = await h.engine.resume(mission.id)
    expect(after.state).toBe("CANCELLED")
  })
})

describe("pause: batch, faults and the world", () => {
  it("during a batch: scheduling stops, the buckets so far are exact, resume finishes the rest", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "complete Acme and Beacon", [
        h.project("Beacon Rollout"),
        h.project("Acme Implementation"),
      ]),
      { datasetId: "x" },
    )
    expect(mission.pending?.kind).toBe("confirm_plan")
    let paused = false
    h.sor.subscribe(() => {
      if (!paused) {
        paused = true
        h.engine.pause(mission.id)
      }
    })
    mission = await h.engine.approve(mission.id, null)
    expect(mission.state).toBe("PAUSED")
    const writes = h.sor.serialize().changeCount
    expect(writes).toBe(1)
    expect(mission.plan.filter((s) => s.status === "succeeded")).toHaveLength(1)
    expect(mission.plan.filter((s) => s.status === "pending").length).toBeGreaterThan(0)
    mission = await h.engine.resume(mission.id)
    // Beacon completes (plan already confirmed); Acme is blocked because a batch never asks for hours.
    expect(mission.state).toBe("PARTIALLY_COMPLETED")
    expect(mission.outcome).toMatchObject({ completed: 1, blocked: 1 })
  })

  it("pause plus timeout: reconciled by re-read, one ledger entry, then paused", async () => {
    const h = harness()
    const plan = beacon(h)
    h.sor.injectFault({
      kind: "timeout_once",
      match: { ref: h.task("Beacon Rollout", "Load test") },
    })
    whenInFlight(h, (id) => h.engine.pause(id))
    const mission = await h.engine.start(plan, { datasetId: "x" })
    expect(mission.state).toBe("PAUSED")
    const first = stepByLabel(mission, "Load test")
    expect(first.status).toBe("succeeded")
    expect(first.retries).toBe(0)
    expect(h.sor.serialize().changeCount).toBe(1)
    expect(eventTypes(h, mission.id)).toContain("WRITE_TIMEOUT_RECONCILED")
  })

  it("pause plus API failure: one same-key retry, no duplicate, then paused", async () => {
    const h = harness()
    const plan = beacon(h)
    h.sor.injectFault({ kind: "fail_once", match: { ref: h.task("Beacon Rollout", "Load test") } })
    whenInFlight(h, (id) => h.engine.pause(id))
    const mission = await h.engine.start(plan, { datasetId: "x" })
    expect(mission.state).toBe("PAUSED")
    const first = stepByLabel(mission, "Load test")
    expect(first.status).toBe("succeeded")
    expect(first.retries).toBe(1)
    expect(h.sor.serialize().changeCount).toBe(1)
  })

  it("pause plus external state change: the mission records the change; resume is a course correction", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const mei = h.actor("Mei Tanaka")
    let mission = await h.engine.start(
      h.propose(priya, "complete acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = h.engine.pause(mission.id)
    expect(mission.state).toBe("PAUSED")
    await h.sor.externalWrite(
      {
        kind: "set_task_status",
        taskId: h.task("Acme Implementation", "Train admins").id as never,
        status: "COMPLETED",
      },
      mei.id,
      "completed",
    )
    await h.engine.idle()
    mission = h.engine.get(mission.id)!
    expect(mission.state).toBe("STALE")
    expect(mission.stateChanges).toHaveLength(1)
    mission = await h.engine.resume(mission.id)
    const resumed = h.events.forMission(mission.id).find((e) => e.type === "MISSION_RESUMED")!
    expect(resumed.detail["changed"]).toBe(true)
    expect(mission.pending?.kind).toBe("input")
    // The world did that step: it is gone from the plan or satisfied, never re-done.
    const trainAdmins = mission.plan.find((s) => s.label === "Train admins")
    expect(trainAdmins === undefined || trainAdmins.status === "already_complete").toBe(true)
    expect(h.sor.serialize().changeCount).toBe(1)
  })

  it("resume with nothing changed says so and continues from the verified state", async () => {
    const h = harness()
    let mission = await h.engine.start(beacon(h), { datasetId: "x" })
    mission = h.engine.pause(mission.id)
    mission = await h.engine.resume(mission.id)
    const resumed = h.events.forMission(mission.id).find((e) => e.type === "MISSION_RESUMED")!
    expect(resumed.detail["changed"]).toBe(false)
    expect(mission.pending?.kind).toBe("confirm_step")
    const blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    const resumedBlock = blocks.find((b) => b.type === "resumed")!
    const text = resumedBlock.lines
      .map((l) => l.map((i) => ("text" in i ? i.text : "")).join(""))
      .join("\n")
    expect(text).toContain("Resuming from the current verified state.")
    expect(text).toContain("Got it. I'll recheck the current state before continuing.")
  })
})

describe("pause: persistence and rapid sequences", () => {
  it("survives a refresh: a PAUSED mission rehydrated into a fresh engine resumes and lands", async () => {
    const h = harness()
    let mission = await h.engine.start(beacon(h), { datasetId: "x" })
    mission = h.engine.pause(mission.id)
    const restored = MissionSchema.parse(JSON.parse(JSON.stringify(mission)))
    expect(restored.state).toBe("PAUSED")
    expect(restored.pauseRequested).toBe(false)
    const store = new MemoryMissionStore()
    store.save(restored)
    const events = new EventLog()
    const fresh = new MissionEngine({
      sor: h.sor,
      permissions: new RoleBasedPermissions(),
      store,
      events,
      clock: h.clock,
      resolveActor: (id) => h.sor.current().actor(id),
    })
    let again = await fresh.resume(restored.id)
    expect(again.state).toBe("WAITING")
    again = await fresh.approve(again.id, stepByLabel(again, "Beacon Rollout").id)
    expect(again.state).toBe("COMPLETED")
    expect(h.sor.serialize().changeCount).toBe(4)
  })

  it("rapid pause then resume while a write is in flight: the pause is withdrawn, nothing pauses", async () => {
    const h = harness()
    const plan = beacon(h)
    whenInFlight(h, (id) => {
      h.engine.pause(id)
      void h.engine.resume(id)
    })
    const mission = await h.engine.start(plan, { datasetId: "x" })
    expect(mission.state).toBe("WAITING")
    expect(mission.pauseRequested).toBe(false)
    const types = eventTypes(h, mission.id)
    expect(types).not.toContain("MISSION_PAUSED")
    const resumed = h.events.forMission(mission.id).find((e) => e.type === "MISSION_RESUMED")!
    expect(resumed.detail["withdrawn"]).toBe(true)
    expect(h.sor.serialize().changeCount).toBe(3)
  })

  it("rapid pause then cancel while a write is in flight: cancel wins, the in-flight update is reconciled", async () => {
    const h = harness()
    const plan = beacon(h)
    whenInFlight(h, (id) => {
      h.engine.pause(id)
      h.engine.cancel(id)
    })
    const mission = await h.engine.start(plan, { datasetId: "x" })
    await h.engine.idle()
    const final = h.engine.get(plan.missionId)!
    expect(final.state).toBe("CANCELLED")
    expect(mission.state).toBe("CANCELLED")
    expect(h.sor.serialize().changeCount).toBe(1)
    expect(final.plan.filter((s) => s.status === "succeeded")).toHaveLength(1)
    expect(eventTypes(h, plan.missionId)).toContain("ACTION_RECONCILED")
    const blocks = renderMission(final, h.sor.current(), h.events.forMission(plan.missionId))
    const cancelled = blocks.find((b) => b.type === "cancelled")!
    const text = cancelled.lines
      .map((l) => l.map((i) => ("text" in i ? i.text : "label" in i ? i.label : "")).join(""))
      .join("\n")
    expect(text).toContain("Got it. I've stopped the mission.")
    expect(text).toContain("was already in progress; it completed and was verified.")
  })

  it("cancel during an in-flight write reconciles it and starts nothing else", async () => {
    const h = harness()
    const plan = beacon(h)
    let cancelled: Mission | null = null
    whenInFlight(h, (id) => {
      cancelled = h.engine.cancel(id)
    })
    await h.engine.start(plan, { datasetId: "x" })
    expect(cancelled!.state).toBe("CANCELLED")
    await h.engine.idle()
    expect(h.sor.serialize().changeCount).toBe(1)
    expect(h.engine.get(plan.missionId)!.state).toBe("CANCELLED")
  })
})

describe("resume revalidates against a changed world, permission and governance", () => {
  function engineWith(
    graph: WorkspaceGraph,
    permissions: PermissionEvaluator,
    policies?: Policy[],
  ) {
    const clock = new VirtualClock()
    const sor = new InMemorySystemOfRecord(graph, { clock })
    const store = new MemoryMissionStore()
    const events = new EventLog()
    const engine = new MissionEngine({
      sor,
      permissions,
      store,
      events,
      clock,
      resolveActor: (id) => sor.current().actor(id),
      ...(policies ? { policies } : {}),
    })
    return { sor, engine, events, graph }
  }

  it("permission revoked while paused: resume stops with PERMISSION_DENIED before any write", async () => {
    const { graph } = ingestFixture("cascading-conflicts")
    let revoked = false
    const base = new RoleBasedPermissions()
    const flipping: PermissionEvaluator = {
      check: (
        actor: Actor,
        action: PermissionAction,
        target: EntityRef,
        g: WorkspaceGraph,
      ): PermissionCheck => {
        const result = base.check(actor, action, target, g)
        return revoked && action !== "read"
          ? { ...result, allowed: false, reason: "access revoked while paused" }
          : result
      },
    }
    const t = engineWith(graph, flipping)
    const priya = graph.actors.find((a) => a.name === "Priya Raman")!
    const beaconRef: EntityRef = {
      kind: "project",
      id: graph.projects.find((p) => p.name === "Beacon Rollout")!.id,
    }
    let mission = await t.engine.start(
      {
        missionId: "m-perm",
        goalText: "complete Beacon",
        targets: [beaconRef],
        excluded: [],
        actor: priya,
      },
      { datasetId: "x" },
    )
    expect(mission.pending?.kind).toBe("confirm_step")
    mission = t.engine.pause(mission.id)
    revoked = true
    const writesBefore = t.sor.serialize().changeCount
    mission = await t.engine.resume(mission.id)
    expect(mission.state).toBe("PERMISSION_DENIED")
    expect(t.sor.serialize().changeCount).toBe(writesBefore)
  })

  it("governance changed while paused: the replan drops what the new policy set no longer requires", async () => {
    const { graph } = ingestFixture("cascading-conflicts")
    const policies: Policy[] = [...SUPPLIED_POLICIES]
    const t = engineWith(graph, new RoleBasedPermissions(), policies)
    const priya = graph.actors.find((a) => a.name === "Priya Raman")!
    const acme: EntityRef = {
      kind: "project",
      id: graph.projects.find((p) => p.name === "Acme Implementation")!.id,
    }
    let mission = await t.engine.start(
      {
        missionId: "m-gov",
        goalText: "complete acme",
        targets: [acme],
        excluded: [],
        actor: priya,
      },
      { datasetId: "x" },
    )
    expect(mission.pending?.kind).toBe("input")
    mission = t.engine.pause(mission.id)
    // Policy 4 withdrawn by the operator while paused.
    const p4 = policies.findIndex((p) => p.id === "P4_TASK_TIME")
    policies.splice(p4, 1)
    mission = await t.engine.resume(mission.id)
    expect(mission.plan.some((s) => s.transition === "TIME_LOGGED")).toBe(false)
    expect(mission.pending?.kind).toBe("confirm_step")
  })
})
