import { describe, expect, it } from "vitest"

import { renderMission } from "@/core/agent/conversation/renderer"
import type { Mission } from "@/core/mission/mission"
import { harness } from "../helpers/engine"
import { engineOn, mkGraph, mkTask, owner, pref, tref } from "./_helpers"

const step = (m: Mission, label: string, transition: "COMPLETED" | "TIME_LOGGED" = "COMPLETED") =>
  m.plan.find((s) => s.label === label && s.transition === transition)!

const ledgerSize = (h: ReturnType<typeof harness>) => h.sor.serialize().ledger.length
const changes = (h: ReturnType<typeof harness>) => h.sor.serialize().changeCount

/** Beacon Rollout: every task has time; the engine runs straight to the project confirmation. */
async function beaconAtConfirm(h = harness()) {
  const priya = h.actor("Priya Raman")
  const mission = await h.engine.start(
    h.propose(priya, "Complete Beacon Rollout", [h.project("Beacon Rollout")]),
    { datasetId: "x" },
  )
  expect(mission.pending?.kind).toBe("confirm_step")
  return { h, mission, priya }
}

/** Acme Implementation: QA Complete has no time; the engine waits for hours first. */
async function acmeAtHours(h = harness()) {
  const priya = h.actor("Priya Raman")
  const mission = await h.engine.start(
    h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
    { datasetId: "x" },
  )
  expect(mission.pending?.kind).toBe("input")
  return { h, mission, priya }
}

describe("engine — approve / decline safety", () => {
  it("approving the same step twice (sequentially) writes once", async () => {
    const { h, mission } = await beaconAtConfirm()
    const stepId = (mission.pending as { stepId: string }).stepId
    const after1 = await h.engine.approve(mission.id, stepId)
    expect(after1.state).toBe("COMPLETED")
    const ledger = ledgerSize(h)
    const count = changes(h)
    const after2 = await h.engine.approve(mission.id, stepId)
    expect(after2).toEqual(after1)
    expect(ledgerSize(h)).toBe(ledger)
    expect(changes(h)).toBe(count)
  })

  it("approving with a wrong stepId is a no-op: still waiting, nothing written", async () => {
    const { h, mission } = await beaconAtConfirm()
    const count = changes(h)
    const after = await h.engine.approve(mission.id, "step-bogus")
    expect(after.state).toBe("WAITING")
    expect(after.pending).toEqual(mission.pending)
    expect(changes(h)).toBe(count)
    expect(after.decisions).toHaveLength(0)
  })

  it("approving a confirm_step with stepId=null (plan-level approve) is a no-op", async () => {
    const { h, mission } = await beaconAtConfirm()
    const count = changes(h)
    const after = await h.engine.approve(mission.id, null)
    expect(after.state).toBe("WAITING")
    expect(changes(h)).toBe(count)
  })

  it("two concurrent approves (Promise.all) produce exactly one write", async () => {
    const { h, mission } = await beaconAtConfirm()
    const stepId = (mission.pending as { stepId: string }).stepId
    const ledgerBefore = ledgerSize(h)
    const countBefore = changes(h)
    const [a, b] = await Promise.all([
      h.engine.approve(mission.id, stepId),
      h.engine.approve(mission.id, stepId),
    ])
    expect(a.state).toBe("COMPLETED")
    expect(b.state === "COMPLETED" || b.state === "EXECUTING" || b.state === "ACTIVE").toBe(true)
    expect(ledgerSize(h)).toBe(ledgerBefore + 1)
    expect(changes(h)).toBe(countBefore + 1)
    expect(h.sor.current().project(h.project("Beacon Rollout").id as never)?.version).toBe(2)
    const approvals = h.events.forMission(mission.id).filter((e) => e.type === "ACTION_APPROVED")
    expect(approvals).toHaveLength(1)
  })

  it("decline with a wrong stepId is a no-op", async () => {
    const { h, mission } = await beaconAtConfirm()
    const after = await h.engine.decline(mission.id, "step-bogus")
    expect(after.state).toBe("WAITING")
    expect(after.pending).toEqual(mission.pending)
  })
})

describe("engine — provideHours safety", () => {
  it.each([0, -1, -0.5, Number.NaN])(
    "hours=%p is rejected and the mission keeps waiting",
    async (hours) => {
      const { h, mission } = await acmeAtHours()
      const stepId = (mission.pending as { stepId: string }).stepId
      const count = changes(h)
      const after = await h.engine.provideHours(mission.id, stepId, hours)
      expect(after.state).toBe("WAITING")
      expect(after.pending).toEqual(mission.pending)
      expect(changes(h)).toBe(count)
      expect(after.decisions).toHaveLength(0)
    },
  )

  // FINDING: provideHours accepts Infinity (`Infinity > 0`) and writes a time entry of Infinity
  // hours; the verifier then passes because Infinity > minimumHours. Fix (core/execution/engine.ts
  // provideHours): `if (!Number.isFinite(hours) || hours <= 0) return mission`. The same guard
  // belongs in ground() for log_time (core/agent/intent/ground.ts) and in the zod schema
  // (`z.number().positive().finite()`).
  it("hours=Infinity is rejected", async () => {
    const { h, mission } = await acmeAtHours()
    const stepId = (mission.pending as { stepId: string }).stepId
    const count = changes(h)
    await h.engine.provideHours(mission.id, stepId, Number.POSITIVE_INFINITY)
    expect(changes(h)).toBe(count)
    const qa = h.sor.current().task(h.task("Acme Implementation", "QA Complete").id as never)!
    expect(qa.timeEntries.every((e) => Number.isFinite(e.hours))).toBe(true)
  })

  it("provideHours with a wrong stepId, or for a step not waiting for input, is a no-op", async () => {
    const { h, mission } = await acmeAtHours()
    const count = changes(h)
    expect((await h.engine.provideHours(mission.id, "step-bogus", 2)).state).toBe("WAITING")
    const deploy = step(mission, "Deploy API")
    expect((await h.engine.provideHours(mission.id, deploy.id, 2)).state).toBe("WAITING")
    expect(changes(h)).toBe(count)
  })

  it("provideHours when nothing is pending is a no-op", async () => {
    const { h, mission } = await beaconAtConfirm()
    const count = changes(h)
    const after = await h.engine.provideHours(mission.id, mission.plan[0]!.id, 3)
    expect(after.pending?.kind).toBe("confirm_step")
    expect(changes(h)).toBe(count)
  })

  it("two concurrent provideHours (Promise.all) log exactly one time entry", async () => {
    const { h, mission } = await acmeAtHours()
    const stepId = (mission.pending as { stepId: string }).stepId
    await Promise.all([
      h.engine.provideHours(mission.id, stepId, 2),
      h.engine.provideHours(mission.id, stepId, 2),
    ])
    const qa = h.sor.current().task(h.task("Acme Implementation", "QA Complete").id as never)!
    expect(qa.timeEntries).toHaveLength(1)
    expect(h.sor.serialize().ledger.filter(([k]) => k === stepId)).toHaveLength(1)
  })
})

describe("engine — cancel / scope / resume on odd states", () => {
  it("cancel on a terminal mission changes nothing", async () => {
    const { h, mission } = await beaconAtConfirm()
    const done = await h.engine.approve(mission.id, (mission.pending as { stepId: string }).stepId)
    expect(done.state).toBe("COMPLETED")
    const again = h.engine.cancel(mission.id)
    expect(again).toEqual(done)
    expect(
      h.events.forMission(mission.id).filter((e) => e.type === "MISSION_CANCELLED"),
    ).toHaveLength(0)
  })

  it("changeScope on a terminal mission changes nothing", async () => {
    const { h, mission } = await beaconAtConfirm()
    const done = await h.engine.approve(mission.id, (mission.pending as { stepId: string }).stepId)
    const after = await h.engine.changeScope(mission.id, h.task("Beacon Rollout", "Handover"))
    expect(after).toEqual(done)
  })

  // Regression guard. Was a FINDING at the start of this QA run (excluding the project target was
  // ignored and the engine re-asked to complete it); fixed in the working tree mid-run by
  // validateFlightPlan skipping excluded targets and aggregate() reporting them as cancelled.
  it("changeScope excluding the target project itself does not keep planning to complete it", async () => {
    const { h, mission } = await beaconAtConfirm()
    const after = await h.engine.changeScope(mission.id, h.project("Beacon Rollout"))
    const projectStep = after.plan.find((s) => s.ref.kind === "project")
    expect(projectStep?.status === "pending" || projectStep?.status === "waiting_confirm").toBe(
      false,
    )
    expect(after.pending?.kind).not.toBe("confirm_step")
    expect(h.sor.current().project(h.project("Beacon Rollout").id as never)?.status).toBe(
      "IN_PROGRESS",
    )
  })

  // Regression guard. Was a FINDING (high) at the start of this QA run: an excluded task target
  // produced an empty closure, aggregate() called it already_complete and the renderer claimed
  // "[Documentation] is already complete." for a TODO task. Fixed mid-run (excluded ⇒ cancelled).
  // The underlying `steps.length === 0 ⇒ already_complete` inference is still live — see the phase
  // target and "world completes the target project" tests below.
  it("changeScope excluding the target task itself must not land COMPLETED / 'already complete'", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const doc = h.task("Acme Implementation", "Documentation")
    let mission = await h.engine.start(h.propose(priya, "Complete Documentation", [doc]), {
      datasetId: "x",
    })
    expect(mission.pending?.kind).toBe("input")
    mission = await h.engine.changeScope(mission.id, doc)
    expect(h.sor.current().task(doc.id as never)?.status).toBe("TODO")
    expect(mission.state).not.toBe("COMPLETED")
    expect(mission.outcome?.perTarget[0]?.outcome).not.toBe("already_complete")
    const text = JSON.stringify(
      renderMission(mission, h.sor.current(), h.events.forMission(mission.id)),
    )
    expect(text).not.toContain("already complete")
  })

  it("resume when not STALE (waiting for confirmation) does not write and keeps waiting", async () => {
    const { h, mission } = await beaconAtConfirm()
    const count = changes(h)
    const after = await h.engine.resume(mission.id)
    expect(after.state).toBe("WAITING")
    expect(after.pending?.kind).toBe("confirm_step")
    expect(changes(h)).toBe(count)
    expect(h.sor.current().project(h.project("Beacon Rollout").id as never)?.status).toBe(
      "IN_PROGRESS",
    )
  })

  it("resume when waiting for hours re-asks for hours and writes nothing", async () => {
    const { h, mission } = await acmeAtHours()
    const count = changes(h)
    const after = await h.engine.resume(mission.id)
    expect(after.pending?.kind).toBe("input")
    expect(changes(h)).toBe(count)
  })

  it("resume on a terminal mission changes nothing", async () => {
    const { h, mission } = await beaconAtConfirm()
    const cancelled = h.engine.cancel(mission.id)
    expect(await h.engine.resume(mission.id)).toEqual(cancelled)
  })

  it("cancel while waiting for hours, then hours arrive: nothing is written", async () => {
    const { h, mission } = await acmeAtHours()
    const stepId = (mission.pending as { stepId: string }).stepId
    const cancelled = h.engine.cancel(mission.id)
    expect(cancelled.state).toBe("CANCELLED")
    const count = changes(h)
    const after = await h.engine.provideHours(mission.id, stepId, 2)
    expect(after.state).toBe("CANCELLED")
    expect(changes(h)).toBe(count)
  })

  // FINDING (high): cancel() while a step is in flight is lost. The engine is suspended at
  // `await sor.snapshot()` (no write has started); cancel() commits CANCELLED; execute() then does
  // `setStep(running, "EXECUTING"); commit()` on its stale copy, overwriting CANCELLED, and writes.
  // run() now merges into a terminal `latest`, but `latest` is never terminal because execute() has
  // already clobbered it. Spec §11: "nothing new starts". Fix (core/execution/engine.ts execute()):
  // re-read `this.require(mission.id)` after every await and bail if terminal — at minimum right
  // before `setStep(..."running")` and before `sor.write`; and make commit() refuse to replace a
  // terminal mission with a non-terminal one.
  it("cancel issued right after approve (step in flight, no write started) prevents the write", async () => {
    const { h, mission } = await beaconAtConfirm()
    const stepId = (mission.pending as { stepId: string }).stepId
    const count = changes(h)
    const approving = h.engine.approve(mission.id, stepId)
    const cancelled = h.engine.cancel(mission.id)
    expect(cancelled.state).toBe("CANCELLED")
    const after = await approving
    expect(h.engine.get(mission.id)?.state).toBe("CANCELLED")
    expect(after.state).toBe("CANCELLED")
    expect(changes(h)).toBe(count)
    expect(h.sor.current().project(h.project("Beacon Rollout").id as never)?.status).toBe(
      "IN_PROGRESS",
    )
  })
})

describe("engine — concurrency between missions and the world", () => {
  /** Both missions start in the same tick; both snapshot the same world before either writes. */
  async function raceTwoMissions() {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const beacon = h.project("Beacon Rollout")
    const p1 = h.engine.start(h.propose(priya, "Complete Beacon", [beacon]), { datasetId: "x" })
    const p2 = h.engine.start(h.propose(priya, "Complete Beacon again", [beacon]), {
      datasetId: "x",
    })
    const [m1, m2] = await Promise.all([p1, p2])
    await h.engine.idle()
    return { h, priya, beacon, m1: h.engine.get(m1.id)!, m2: h.engine.get(m2.id)! }
  }

  it("two missions on the same project: each pauses when the other writes (correlation ids differ)", async () => {
    const { m1, m2 } = await raceTwoMissions()
    expect([m1.state, m2.state]).toContain("STALE")
    expect(m1.stateChanges.length + m2.stateChanges.length).toBeGreaterThan(0)
    for (const m of [m1, m2]) expect(m.state === "STALE" || m.state === "WAITING").toBe(true)
  })

  // Regression guard. Was a FINDING (medium-high) at the start of this QA run: every write carried
  // `expectedVersion: null`, so both racing missions completed "Load test" (version 3, two ledger
  // entries). Fixed mid-run: write() now passes the snapshot version and the loser gets a
  // ConflictError → pause.
  it("two missions on the same project never write the same task twice", async () => {
    const { h } = await raceTwoMissions()
    const loadTest = h.sor.current().task(h.task("Beacon Rollout", "Load test").id as never)!
    expect(loadTest.version).toBe(2)
    expect(h.sor.serialize().ledger.filter(([, r]) => r.ref.id === loadTest.id)).toHaveLength(1)
    expect(
      h.events.all().some((e) => e.type === "ACTION_FAILED" && e.detail["reason"] === "conflict"),
    ).toBe(true)
  })

  // Guard for a latent defect observed before optimistic concurrency landed mid-run: when a mission
  // is paused while a step is "running", replan() drops that step (not in the new closure, not yet
  // `succeeded`) and mergeStepResults() only patches steps still present, so the verified write
  // vanished from the mission record. The race no longer produces that interleaving, but
  // mergeStepResults still cannot re-attach a finished step that replan dropped
  // (core/execution/engine.ts) — append finished steps missing from `latest.plan`.
  it("a write verified while the mission was being paused stays on the mission record", async () => {
    const { h, m1, m2 } = await raceTwoMissions()
    const writers = [m1, m2].filter((m) =>
      h.events.forMission(m.id).some((e) => e.type === "ACTION_COMPLETED"),
    )
    expect(writers.length).toBeGreaterThan(0)
    for (const m of writers) {
      const s = m.plan.find((x) => x.label === "Load test" && x.transition === "COMPLETED")
      expect(s?.status, `${m.id} lost its verified Load test write`).toBe("succeeded")
    }
  })

  it("after both missions settle, the project is completed exactly once", async () => {
    const { h, m1, m2, beacon } = await raceTwoMissions()
    let a = m1
    let b = m2
    for (let i = 0; i < 6; i += 1) {
      a = h.engine.get(a.id)!
      b = h.engine.get(b.id)!
      if (a.state === "STALE") a = await h.engine.resume(a.id)
      else if (a.pending?.kind === "confirm_step")
        a = await h.engine.approve(a.id, a.pending.stepId)
      await h.engine.idle()
      b = h.engine.get(b.id)!
      if (b.state === "STALE") b = await h.engine.resume(b.id)
      else if (b.pending?.kind === "confirm_step")
        b = await h.engine.approve(b.id, b.pending.stepId)
      await h.engine.idle()
    }
    expect(h.sor.current().project(beacon.id as never)?.status).toBe("COMPLETED")
    expect(h.sor.current().project(beacon.id as never)?.version).toBe(2)
    expect(h.sor.serialize().ledger.filter(([, r]) => r.ref.kind === "project")).toHaveLength(1)
  })

  it("an external change to an entity outside the closure during EXECUTING is ignored", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let fired = false
    h.engine.subscribe((m) => {
      if (m.state === "EXECUTING" && !fired) {
        fired = true
        void h.sor.externalWrite(
          {
            kind: "set_task_status",
            taskId: h.task("Acme Implementation", "Documentation").id as never,
            status: "IN_PROGRESS",
          },
          h.actor("Daniel Okafor").id,
          "started Documentation",
        )
      }
    })
    const mission = await h.engine.start(
      h.propose(priya, "Complete Beacon", [h.project("Beacon Rollout")]),
      { datasetId: "x" },
    )
    await h.engine.idle()
    expect(fired).toBe(true)
    const now = h.engine.get(mission.id)!
    expect(now.state).toBe("WAITING")
    expect(now.stateChanges).toHaveLength(0)
    expect(
      now.plan.filter((s) => s.ref.kind === "task").every((s) => s.status === "succeeded"),
    ).toBe(true)
  })

  it("an external change inside the closure during EXECUTING pauses before the next write", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let fired = false
    h.engine.subscribe((m) => {
      if (m.state === "EXECUTING" && !fired) {
        fired = true
        void h.sor.externalWrite(
          {
            kind: "set_task_status",
            taskId: h.task("Beacon Rollout", "Handover").id as never,
            status: "IN_PROGRESS",
          },
          h.actor("Mei Tanaka").id,
          "started Handover",
        )
      }
    })
    const mission = await h.engine.start(
      h.propose(priya, "Complete Beacon", [h.project("Beacon Rollout")]),
      { datasetId: "x" },
    )
    await h.engine.idle()
    const now = h.engine.get(mission.id)!
    expect(now.state).toBe("STALE")
    // At most the in-flight write landed; nothing after it.
    expect(changes(h)).toBeLessThanOrEqual(2)
    expect(h.sor.current().project(h.project("Beacon Rollout").id as never)?.status).toBe(
      "IN_PROGRESS",
    )
  })

  it("timeout_once AND fail_once on the same task: one retry, one ledger entry, verified", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const loadTest = h.task("Beacon Rollout", "Load test")
    h.sor.injectFault({ kind: "fail_once", match: { ref: loadTest } })
    h.sor.injectFault({ kind: "timeout_once", match: { ref: loadTest } })
    const mission = await h.engine.start(
      h.propose(priya, "Complete Beacon", [h.project("Beacon Rollout")]),
      { datasetId: "x" },
    )
    const s = step(mission, "Load test")
    expect(s.status).toBe("succeeded")
    expect(s.verification).toBe("VERIFIED")
    expect(s.retries).toBe(1)
    expect(h.sor.serialize().ledger.filter(([k]) => k === s.id)).toHaveLength(1)
    expect(h.sor.current().task(loadTest.id as never)?.version).toBe(2)
  })

  it("two consecutive api failures fail the step honestly; a task target lands FAILED with no write", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const loadTest = h.task("Beacon Rollout", "Load test")
    h.sor.injectFault({ kind: "fail_once", match: { ref: loadTest } })
    h.sor.injectFault({ kind: "fail_once", match: { ref: loadTest } })
    const mission = await h.engine.start(h.propose(priya, "Complete Load test", [loadTest]), {
      datasetId: "x",
    })
    expect(mission.state).toBe("FAILED")
    expect(step(mission, "Load test").failureClass).toBe("api_failure")
    expect(changes(h)).toBe(0)
  })
})

describe("engine — odd targets", () => {
  // FINDING (medium): a `phase` target passes `exists()` but resolveClosure derives nothing for it,
  // so the plan has zero steps, aggregate() calls it already_complete, and the mission lands
  // COMPLETED claiming "[Initiate] is already complete". Fix (core/execution/flight-plan.ts
  // validateFlightPlan): reject phase targets with a new PlanRejection reason "UNSUPPORTED_TARGET_KIND".
  it("a phase target is rejected, not reported as already complete", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const phase = h.graph.phasesOf(h.project("Acme Implementation").id as never)[0]!
    const mission = await h.engine.start(
      h.propose(priya, "Complete Initiate", [{ kind: "phase", id: phase.id }]),
      { datasetId: "x" },
    )
    expect(mission.state).not.toBe("COMPLETED")
    expect(mission.outcome?.alreadyComplete ?? 0).toBe(0)
  })

  // FINDING (low): duplicate targets are not deduplicated. [Beacon, Beacon] is treated as a batch of 2,
  // asks for a batch confirmation, and reports "2 completed" for one project. Fix
  // (core/execution/flight-plan.ts validateFlightPlan or engine.start): dedupe `proposed.targets` by
  // refKey before planning.
  it("duplicate targets collapse to one target and one outcome", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const beacon = h.project("Beacon Rollout")
    let mission = await h.engine.start(
      h.propose(priya, "Complete Beacon twice", [beacon, beacon]),
      {
        datasetId: "x",
      },
    )
    if (mission.pending?.kind === "confirm_plan") mission = await h.engine.approve(mission.id, null)
    else if (mission.pending?.kind === "confirm_step")
      mission = await h.engine.approve(mission.id, mission.pending.stepId)
    expect(mission.outcome?.perTarget).toHaveLength(1)
    expect(mission.outcome?.completed).toBe(1)
  })

  it("a missing target fails the plan with no steps and no writes", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const mission = await h.engine.start(
      h.propose(priya, "Complete ghost", [{ kind: "project", id: "PRJ-GHOST" as never }]),
      { datasetId: "x" },
    )
    expect(mission.state).toBe("FAILED")
    expect(mission.plan).toHaveLength(0)
    expect(changes(h)).toBe(0)
  })

  it("a task with predecessors in a hand-built graph where the predecessor id does not exist is completable", async () => {
    const g = mkGraph({ tasks: [mkTask({ id: "T", predecessors: ["MISSING"], hours: 1 })] })
    const h = engineOn(g)
    const mission = await h.engine.start(h.propose(owner, [tref("T")]), { datasetId: "qa" })
    expect(mission.state).toBe("COMPLETED")
  })

  // FINDING (medium-high): when the world completes the mission's target project while the mission
  // waits, replan() yields zero required transitions, the previously verified task steps are re-labelled
  // "completed before scope change" (there was no scope change), and finish() computes FAILED because
  // no step targets the project. The user sees "0 updates required" and no landing block, for a goal
  // the world satisfied. Fix (core/execution/engine.ts replan): if a target is complete in `graph` and
  // the plan has no COMPLETED step for it, synthesise a step { status: "already_complete",
  // verification: "VERIFIED" } for that target; only use the "completed before scope change" note when
  // cause === "scope".
  it("the world completes the target project while waiting: mission lands as already complete, not FAILED", async () => {
    const { h, mission, priya } = await beaconAtConfirm()
    const beacon = h.project("Beacon Rollout")
    await h.sor.externalWrite(
      { kind: "complete_project", projectId: beacon.id as never },
      priya.id,
      "completed Beacon",
    )
    await h.engine.idle()
    expect(h.engine.get(mission.id)?.state).toBe("STALE")
    const after = await h.engine.resume(mission.id)
    expect(after.state).toBe("COMPLETED")
    expect(after.outcome?.completedBeforeScopeChange).toBe(0)
    expect(after.outcome?.perTarget[0]?.outcome).toBe("already_complete")
  })

  it("the world completes the target task while waiting for hours: mission lands honestly", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const doc = h.task("Acme Implementation", "Documentation")
    const mission = await h.engine.start(h.propose(priya, "Complete Documentation", [doc]), {
      datasetId: "x",
    })
    expect(mission.pending?.kind).toBe("input")
    await h.sor.externalWrite(
      { kind: "set_task_status", taskId: doc.id as never, status: "COMPLETED" },
      priya.id,
    )
    await h.engine.idle()
    const after = await h.engine.resume(mission.id)
    expect(after.state).toBe("COMPLETED")
    expect(changes(h)).toBe(1)
  })
})

describe("engine — start twice with the same mission id", () => {
  it("re-starting a completed mission id does not duplicate writes (ledger keys are stable)", async () => {
    const { h, mission, priya } = await beaconAtConfirm()
    await h.engine.approve(mission.id, (mission.pending as { stepId: string }).stepId)
    const count = changes(h)
    const again = await h.engine.start(
      {
        missionId: mission.id,
        goalText: "again",
        targets: [h.project("Beacon Rollout")],
        excluded: [],
        actor: priya,
      },
      { datasetId: "x" },
    )
    expect(again.state).toBe("COMPLETED")
    expect(changes(h)).toBe(count)
    expect(ledgerSize(h)).toBe(4)
  })

  it("hand-built: stranger completing a project is denied before any write", async () => {
    const g = mkGraph({ tasks: [mkTask({ id: "T", hours: 1, milestone: true })] })
    const h = engineOn(g)
    const { stranger } = await import("./_helpers")
    const mission = await h.engine.start(h.propose(stranger, [pref("P1")]), { datasetId: "qa" })
    expect(mission.state).toBe("PERMISSION_DENIED")
    expect(h.sor.serialize().changeCount).toBe(0)
  })
})
