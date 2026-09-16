import type { Actor } from "@/core/domain/entities"
import { hoursTracked } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { ActorId, EntityRef } from "@/core/domain/ids"
import { isTaskComplete } from "@/core/domain/status"
import { DEFAULT_GOVERNANCE_CONFIG, evaluateGovernance } from "@/core/governance/engine"
import type { GovernanceConfig, Policy } from "@/core/governance/policy"
import type { PermissionEvaluator } from "@/core/governance/permissions"
import {
  type FlightPlan,
  type ProposedPlan,
  validateFlightPlan,
} from "@/core/execution/flight-plan"
import type { Mission, MissionOutcome, PlanStep, TargetOutcome } from "@/core/mission/mission"
import { isTerminal } from "@/core/mission/mission"
import type { MissionStore } from "@/core/mission/store"
import { traceCurrentBlockers } from "@/core/resolver/blockers"
import { labelOf } from "@/core/resolver/target"
import type { Clock } from "@/core/system/clock"
import {
  ConflictError,
  type StateChange,
  type SystemOfRecord,
  TimeoutError,
  type WriteCommand,
} from "@/core/system/system-of-record"
import type { EventLog } from "@/core/telemetry/events"

/**
 * The mission engine: the safe execution loop (spec §8, §35), revalidation (§10), interruption
 * (§11) and exact batch aggregation (§12). It is the only code that writes to the system of record.
 * Every mutation of a Mission goes through `commit`, which persists and notifies.
 */

export type EngineDeps = {
  readonly sor: SystemOfRecord
  readonly permissions: PermissionEvaluator
  readonly store: MissionStore
  readonly events: EventLog
  readonly clock: Clock
  readonly governance?: GovernanceConfig
  /** Policy set the executor enforces. Defaults to the four supplied policies. The Lab can weaken it to prove the evaluator catches it. */
  readonly policies?: readonly Policy[]
  readonly resolveActor: (id: ActorId) => Actor | null
}

export class MissionEngine {
  private readonly listeners = new Set<(mission: Mission) => void>()
  private readonly running = new Set<string>()
  private readonly inFlightChanges = new Set<Promise<void>>()
  private readonly governance: GovernanceConfig

  constructor(private readonly deps: EngineDeps) {
    this.governance = deps.governance ?? DEFAULT_GOVERNANCE_CONFIG
    deps.sor.subscribe((change) => {
      const handling = this.onStateChange(change).finally(() =>
        this.inFlightChanges.delete(handling),
      )
      this.inFlightChanges.add(handling)
    })
  }

  /** Resolves once every external state change has been processed (tests, scenario runner). */
  async idle(): Promise<void> {
    while (this.inFlightChanges.size > 0) await Promise.all([...this.inFlightChanges])
  }

  subscribe(listener: (mission: Mission) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get(missionId: string): Mission | null {
    return this.deps.store.load(missionId)
  }

  /** Create a mission from a proposed plan and start executing. */
  async start(
    proposed: ProposedPlan,
    options: { interpretedBy?: Mission["interpretedBy"]; datasetId: string },
  ): Promise<Mission> {
    const now = this.deps.clock.now()
    const graph = await this.deps.sor.snapshot()
    let mission: Mission = {
      id: proposed.missionId,
      correlationId: `mission:${proposed.missionId}`,
      datasetId: options.datasetId,
      actorId: proposed.actor.id,
      goalText: proposed.goalText,
      targets: proposed.targets,
      targetLabels: proposed.targets.map((t) => labelOf(t, graph)),
      excluded: proposed.excluded,
      state: "ACTIVE",
      plan: [],
      pending: null,
      planConfirmed: false,
      currentStepId: null,
      blockers: [],
      openButNotRequired: [],
      decisions: [],
      stateChanges: [],
      outcome: null,
      interpretedBy: options.interpretedBy ?? null,
      createdAt: now,
      updatedAt: now,
      landedAt: null,
    }
    this.emit(mission, "MISSION_STARTED", proposed.targets, { goal: proposed.goalText })
    mission = this.plan(mission, proposed, graph)
    this.commit(mission)
    return this.run(mission.id)
  }

  /** The user provides the missing input for a waiting step (hours for a time entry). */
  async provideHours(missionId: string, stepId: string, hours: number): Promise<Mission> {
    let mission = this.require(missionId)
    const step = mission.plan.find((s) => s.id === stepId)
    if (!step || step.status !== "waiting_input" || step.transition !== "TIME_LOGGED")
      return mission
    if (!(hours > 0)) return mission
    mission = this.decide(mission, "input", stepId, `${hours}h`)
    mission = {
      ...this.setStep(mission, stepId, { status: "running" }, "EXECUTING"),
      pending: null,
    }
    this.commit(mission)

    const cmd: WriteCommand =
      step.ref.kind === "task"
        ? { kind: "add_time_entry", taskId: step.ref.id, hours, actorId: mission.actorId }
        : { kind: "add_time_entry", taskId: step.ref.id as never, hours, actorId: mission.actorId }
    mission = await this.write(mission, step, cmd, (graph) => {
      const task = step.ref.kind === "task" ? graph.task(step.ref.id) : null
      return task !== null && hoursTracked(task) > this.governance.minimumHours
    })
    this.commit(mission)
    return this.run(missionId)
  }

  async approve(missionId: string, stepId: string | null): Promise<Mission> {
    let mission = this.require(missionId)
    if (mission.pending?.kind === "confirm_plan" && stepId === null) {
      mission = {
        ...this.decide(mission, "approve", null, "plan confirmed"),
        planConfirmed: true,
        pending: null,
      }
      this.emit(mission, "ACTION_APPROVED", mission.targets, { scope: "plan" })
    } else if (mission.pending?.kind === "confirm_step" && stepId === mission.pending.stepId) {
      mission = this.decide(mission, "approve", stepId, "confirmed")
      mission = this.setStep(mission, stepId, { status: "pending", note: "confirmed" }, "ACTIVE")
      mission = { ...mission, pending: null }
      const step = mission.plan.find((s) => s.id === stepId)!
      this.emit(mission, "ACTION_APPROVED", [step.ref], { step: step.label })
    } else {
      return mission
    }
    this.commit(mission)
    return this.run(missionId)
  }

  async decline(missionId: string, stepId: string | null): Promise<Mission> {
    let mission = this.require(missionId)
    if (mission.pending?.kind === "confirm_plan" && stepId === null) {
      mission = this.decide(mission, "decline", null, "plan declined")
      mission = this.finish({ ...mission, pending: null }, "CANCELLED")
    } else if (mission.pending?.kind === "confirm_step" && stepId === mission.pending.stepId) {
      mission = this.decide(mission, "decline", stepId, "declined")
      mission = this.setStep(
        mission,
        stepId,
        { status: "skipped", note: "declined by user" },
        "ACTIVE",
      )
      const step = mission.plan.find((s) => s.id === stepId)!
      this.emit(mission, "ACTION_DECLINED", [step.ref], { step: step.label })
      mission = { ...mission, pending: null }
      this.commit(mission)
      return this.run(missionId)
    }
    this.commit(mission)
    return mission
  }

  /** Interruption (spec §11): stop before the next action starts. In-flight writes are still verified. */
  cancel(missionId: string): Mission {
    let mission = this.require(missionId)
    if (isTerminal(mission)) return mission
    mission = this.decide(mission, "cancel", null, "cancelled by user")
    mission = {
      ...mission,
      pending: null,
      plan: mission.plan.map((s) =>
        s.status === "pending" || s.status === "waiting_input" || s.status === "waiting_confirm"
          ? { ...s, status: "cancelled" }
          : s,
      ),
    }
    mission = this.finish(mission, "CANCELLED")
    this.commit(mission)
    return mission
  }

  /** Scope reduction (spec §11): stop, replan with the exclusion, continue only with the new scope. */
  async changeScope(missionId: string, exclude: EntityRef): Promise<Mission> {
    let mission = this.require(missionId)
    if (isTerminal(mission)) return mission
    const graph = await this.deps.sor.snapshot()
    mission = this.decide(mission, "change_scope", null, `leave ${labelOf(exclude, graph)} open`)
    mission = { ...mission, excluded: [...mission.excluded, exclude], pending: null }
    mission = this.replan(mission, graph, "scope")
    this.commit(mission)
    return this.run(missionId)
  }

  /** Continue a paused (STALE) or waiting mission after revalidation. */
  async resume(missionId: string): Promise<Mission> {
    let mission = this.require(missionId)
    if (isTerminal(mission)) return mission
    mission = this.decide(mission, "continue", null, "continue")
    const graph = await this.deps.sor.snapshot()
    mission = this.replan(mission, graph, "resume")
    this.commit(mission)
    return this.run(missionId)
  }

  // ---------------------------------------------------------------------------------------------
  // Planning

  private plan(mission: Mission, proposed: ProposedPlan, graph: WorkspaceGraph): Mission {
    const validated = validateFlightPlan(proposed, {
      graph,
      permissions: this.deps.permissions,
      governance: this.governance,
      ...(this.deps.policies ? { policies: this.deps.policies } : {}),
    })
    if (!validated.ok) {
      this.emit(mission, "MISSION_FAILED", proposed.targets, { reason: validated.rejection.detail })
      return this.finish({ ...mission, plan: [] }, "FAILED")
    }
    return this.applyFlightPlan(mission, validated.plan, graph)
  }

  private applyFlightPlan(
    mission: Mission,
    plan: FlightPlan,
    graph: WorkspaceGraph,
    nextState: Mission["state"] = "ACTIVE",
  ): Mission {
    const blockers = mission.targets.flatMap((t) => traceCurrentBlockers(t, graph, this.governance))
    this.emit(mission, "PLAN_CREATED", mission.targets, {
      steps: plan.steps.length,
      requiresConfirmation: plan.requiresPlanConfirmation,
    })
    for (const b of blockers) {
      this.emit(mission, "DEPENDENCY_FOUND", b.dependencyPath, {
        policy: b.policyId,
        reason: b.reasonCode,
        actionable: labelOf(b.actionable, graph),
        depth: b.dependencyPath.length,
      })
    }
    for (const denial of plan.permissionDenials) {
      this.emit(mission, "PERMISSION_DENIED", [denial.target], { reason: denial.reason })
    }
    const next: Mission = {
      ...mission,
      plan: plan.steps,
      blockers,
      openButNotRequired: plan.openButNotRequired,
      pending:
        plan.requiresPlanConfirmation && !mission.planConfirmed ? { kind: "confirm_plan" } : null,
      state: plan.requiresPlanConfirmation && !mission.planConfirmed ? "WAITING" : nextState,
    }
    return next
  }

  private replan(
    mission: Mission,
    graph: WorkspaceGraph,
    cause: "state_change" | "scope" | "resume",
  ): Mission {
    const actor = this.deps.resolveActor(mission.actorId)
    if (!actor) return this.finish(mission, "FAILED")
    const proposed: ProposedPlan = {
      missionId: mission.id,
      goalText: mission.goalText,
      targets: mission.targets,
      excluded: mission.excluded,
      actor,
    }
    const validated = validateFlightPlan(proposed, {
      graph,
      permissions: this.deps.permissions,
      governance: this.governance,
      ...(this.deps.policies ? { policies: this.deps.policies } : {}),
    })
    if (!validated.ok) return this.finish(mission, "FAILED")

    // Keep the status of steps that already ran (stable ids), drop steps no longer required.
    const previous = new Map(mission.plan.map((s) => [s.id, s]))
    const merged: PlanStep[] = validated.plan.steps.map((step) => {
      const old = previous.get(step.id)
      if (!old) return step
      const keepStatus =
        old.status === "succeeded" ||
        old.status === "already_complete" ||
        old.status === "failed" ||
        old.status === "skipped"
      return keepStatus
        ? {
            ...step,
            status: old.status,
            verification: old.verification,
            retries: old.retries,
            note: old.note,
          }
        : step
    })
    // Steps that were completed but are now out of scope: preserved for honest reporting.
    const dropped = mission.plan.filter(
      (s) => !validated.plan.steps.some((n) => n.id === s.id) && s.status === "succeeded",
    )
    const kept = merged.length
    const steps = [
      ...merged,
      ...dropped.map((s) => ({ ...s, note: "completed before scope change" })),
    ]
    const withPlan = this.applyFlightPlan(
      { ...mission, plan: steps },
      { ...validated.plan, steps },
      graph,
      cause === "state_change" ? "STALE" : "ACTIVE",
    )
    this.emit(withPlan, "MISSION_REPLANNED", mission.targets, {
      cause,
      kept,
      planned: mission.plan.length,
      dropped: dropped.length,
    })
    return withPlan
  }

  // ---------------------------------------------------------------------------------------------
  // Execution loop

  private async run(missionId: string): Promise<Mission> {
    if (this.running.has(missionId)) return this.require(missionId)
    this.running.add(missionId)
    try {
      let mission = this.require(missionId)
      while (!isTerminal(mission) && mission.pending === null && mission.state !== "STALE") {
        const step = nextStep(mission)
        if (!step) {
          mission = this.finish(mission, null)
          break
        }
        const result = await this.execute(mission, step)
        // The world may have paused this mission while the step was in flight (spec §10).
        const latest = this.require(missionId)
        mission = latest.state === "STALE" ? mergeStepResults(latest, result) : result
        this.commit(mission)
        mission = this.require(missionId)
      }
      this.commit(mission)
      return mission
    } finally {
      this.running.delete(missionId)
    }
  }

  private async execute(mission: Mission, step: PlanStep): Promise<Mission> {
    const graph = await this.deps.sor.snapshot()
    mission = { ...mission, currentStepId: step.id }

    // Already satisfied? (world may have done it, or an earlier replan)
    if (isSatisfied(step, graph, this.governance)) {
      this.emit(mission, "ACTION_SKIPPED", [step.ref], {
        reason: "already complete",
        step: step.label,
      })
      return this.setStep(
        mission,
        step.id,
        { status: "already_complete", verification: "VERIFIED" },
        "ACTIVE",
      )
    }

    if (step.transition === "TIME_LOGGED") {
      if (mission.targets.length > 1) {
        // Batch mode never solicits input per task (§8C); the target is reported as blocked.
        const blockers = traceCurrentBlockers(step.forTarget, graph, this.governance)
        this.emit(mission, "MISSION_BLOCKED", [step.ref], {
          reason: "NO_TIME_LOGGED",
          step: step.label,
        })
        return this.markTargetBlocked(mission, step, blockers)
      }
      this.emit(mission, "ACTION_REQUESTED", [step.ref], { input: "hours", step: step.label })
      return {
        ...this.setStep(mission, step.id, { status: "waiting_input" }, "WAITING"),
        pending: { kind: "input_hours", stepId: step.id },
      }
    }

    // Permission (before policy, before write).
    const actor = this.deps.resolveActor(mission.actorId)
    if (!actor) return this.finish(mission, "FAILED")
    const permission = this.deps.permissions.check(
      actor,
      step.ref.kind === "project" ? "complete_project" : "complete_task",
      step.ref,
      graph,
    )
    if (!permission.allowed) {
      this.emit(mission, "PERMISSION_DENIED", [step.ref], { reason: permission.reason })
      const updated = this.setStep(
        mission,
        step.id,
        { status: "permission_denied", note: permission.reason },
        "ACTIVE",
      )
      return mission.targets.length > 1 ? updated : this.finish(updated, "PERMISSION_DENIED")
    }

    // Governance.
    const decision = evaluateGovernance(
      graph,
      { target: step.ref, to: "COMPLETED" },
      { config: this.governance, ...(this.deps.policies ? { policies: this.deps.policies } : {}) },
    )
    this.emit(mission, "POLICY_CHECKED", [step.ref], {
      allowed: decision.allowed,
      policies: decision.evaluations
        .filter((e) => e.triggerMatched)
        .map((e) => e.policyId)
        .join(","),
      reason: decision.evaluations.flatMap((e) => e.blockingReasons).join(",") || null,
    })
    if (!decision.allowed) {
      const blockers = traceCurrentBlockers(step.forTarget, graph, this.governance)
      this.emit(mission, "MISSION_BLOCKED", [step.ref], {
        reason: decision.evaluations.flatMap((e) => e.blockingReasons).join(",") || "DATA_FLAGGED",
        step: step.label,
      })
      return this.markTargetBlocked(mission, step, blockers)
    }

    // High impact → explicit confirmation (unless the batch plan was confirmed upfront).
    if (step.actionClass === "HIGH_IMPACT" && step.note !== "confirmed" && !mission.planConfirmed) {
      this.emit(mission, "ACTION_REQUESTED", [step.ref], { confirm: true, step: step.label })
      return {
        ...this.setStep(mission, step.id, { status: "waiting_confirm" }, "WAITING"),
        pending: { kind: "confirm_step", stepId: step.id },
      }
    }

    // Execute + verify.
    const cmd: WriteCommand =
      step.ref.kind === "project"
        ? { kind: "complete_project", projectId: step.ref.id }
        : { kind: "complete_task", taskId: step.ref.id as never }
    mission = this.setStep(mission, step.id, { status: "running" }, "EXECUTING")
    this.commit(mission)
    return this.write(mission, step, cmd, (g) => isCompleted(step.ref, g))
  }

  /**
   * Write → verify, with timeout reconciliation and a single same-key retry (spec §8E).
   * Success is only recorded after a fresh read confirms the intended state.
   */
  private async write(
    mission: Mission,
    step: PlanStep,
    cmd: WriteCommand,
    verify: (graph: WorkspaceGraph) => boolean,
  ): Promise<Mission> {
    this.emit(mission, "ACTION_STARTED", [step.ref], { step: step.label, command: cmd.kind })
    const meta = {
      idempotencyKey: step.id,
      expectedVersion: null,
      actorId: mission.actorId,
      correlationId: mission.correlationId,
    }
    let retries = step.retries
    let failureClass: PlanStep["failureClass"] = null

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.deps.sor.write(cmd, meta)
        break
      } catch (error) {
        if (error instanceof TimeoutError) {
          const graph = await this.deps.sor.snapshot()
          const applied = verify(graph)
          this.emit(mission, "WRITE_TIMEOUT_RECONCILED", [step.ref], {
            step: step.label,
            applied,
            retried: !applied && attempt === 0,
          })
          if (applied) break
          retries += 1
          failureClass = "timeout"
          continue
        }
        if (error instanceof ConflictError) {
          failureClass = "conflict"
          this.emit(mission, "ACTION_FAILED", [step.ref], { step: step.label, reason: "conflict" })
          const graph = await this.deps.sor.snapshot()
          return this.pause(
            this.setStep(mission, step.id, { status: "pending", failureClass, retries }, "STALE"),
            graph,
            {
              ref: step.ref,
              summary: "changed concurrently",
              actorId: "unknown" as ActorId,
            },
          )
        }
        failureClass = "api_failure"
        retries += 1
        if (attempt === 1) {
          this.emit(mission, "ACTION_FAILED", [step.ref], {
            step: step.label,
            reason: "api_failure",
          })
          return this.setStep(
            mission,
            step.id,
            { status: "failed", failureClass, retries },
            "ACTIVE",
          )
        }
      }
    }

    mission = this.setStep(mission, step.id, { status: "running", retries }, "VERIFYING")
    const graph = await this.deps.sor.snapshot()
    const verified = verify(graph)
    if (!verified) {
      this.emit(mission, "ACTION_FAILED", [step.ref], {
        step: step.label,
        reason: "verification mismatch",
        verified: false,
      })
      return this.setStep(
        mission,
        step.id,
        {
          status: "failed",
          verification: "MISMATCH",
          failureClass: failureClass ?? "partial_execution",
          retries,
        },
        "ACTIVE",
      )
    }
    this.emit(mission, "ACTION_COMPLETED", [step.ref], {
      step: step.label,
      result: cmd.kind,
      verified: true,
      retries,
    })
    const updated = this.setStep(
      mission,
      step.id,
      {
        status: "succeeded",
        verification: "VERIFIED",
        failureClass: null,
        retries,
        observedVersion: versionOf(step.ref, graph),
      },
      "ACTIVE",
    )
    return {
      ...updated,
      blockers: mission.targets.flatMap((t) => traceCurrentBlockers(t, graph, this.governance)),
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Revalidation (spec §10)

  private async onStateChange(change: StateChange): Promise<void> {
    for (const mission of this.deps.store.all()) {
      if (isTerminal(mission)) continue
      if (change.correlationId === mission.correlationId) continue
      if (!this.inClosure(mission, change.ref)) continue
      const graph = await this.deps.sor.snapshot()
      this.emit(mission, "STATE_CHANGED", [change.ref], {
        summary: change.summary,
        by: change.actorId,
        cause: change.cause,
      })
      const paused = this.pause(mission, graph, {
        ref: change.ref,
        summary: change.summary,
        actorId: change.actorId,
      })
      this.commit(paused)
    }
  }

  private inClosure(mission: Mission, ref: EntityRef): boolean {
    for (const target of mission.targets) {
      if (target.kind === ref.kind && target.id === ref.id) return true
    }
    const projectIds = new Set<string>()
    for (const step of mission.plan) if (step.ref.kind === "project") projectIds.add(step.ref.id)
    for (const target of mission.targets) if (target.kind === "project") projectIds.add(target.id)
    const graph = (this.deps.sor as { current?: () => WorkspaceGraph }).current?.()
    if (ref.kind === "task" && graph) {
      const task = graph.task(ref.id)
      if (task && projectIds.has(task.projectId)) return true
    }
    return mission.plan.some((s) => s.ref.kind === ref.kind && s.ref.id === ref.id)
  }

  private pause(
    mission: Mission,
    graph: WorkspaceGraph,
    change: { ref: EntityRef; summary: string; actorId: ActorId },
  ): Mission {
    const affected = mission.plan
      .filter(
        (s) =>
          s.status === "pending" || s.status === "waiting_input" || s.status === "waiting_confirm",
      )
      .map((s) => s.id)
    const notice = {
      at: this.deps.clock.now(),
      ref: change.ref,
      summary: change.summary,
      actorId: change.actorId,
      affectedStepIds: affected,
      replan: null,
    }
    this.emit(mission, "MISSION_PAUSED", [change.ref], {
      reason: "STATE_CHANGED",
      summary: change.summary,
    })
    const planned = mission.plan.filter((s) => s.transition === "COMPLETED").length
    const paused: Mission = {
      ...mission,
      state: "STALE",
      pending: null,
      stateChanges: [...mission.stateChanges, notice],
    }
    const replanned = this.replan(paused, graph, "state_change")
    const kept = replanned.plan.filter(
      (s) =>
        s.transition === "COMPLETED" &&
        (s.status === "pending" || s.status === "succeeded" || s.status === "already_complete"),
    ).length
    const notices = replanned.stateChanges.map((n, i) =>
      i === replanned.stateChanges.length - 1 ? { ...n, replan: { kept, planned } } : n,
    )
    return { ...replanned, stateChanges: notices }
  }

  // ---------------------------------------------------------------------------------------------
  // Aggregation and finishing

  private markTargetBlocked(
    mission: Mission,
    step: PlanStep,
    blockers: readonly Blocker[],
  ): Mission {
    const updated = this.setStep(mission, step.id, { status: "blocked", blockers }, "ACTIVE")
    // Remaining steps for the same target cannot proceed; skip them so the batch moves on.
    const plan = updated.plan.map((s) =>
      s.status === "pending" && sameRef(s.forTarget, step.forTarget) && s.id !== step.id
        ? { ...s, status: "skipped" as const, note: "blocked upstream" }
        : s,
    )
    const withBlockers = {
      ...updated,
      plan,
      blockers: dedupeBlockers([...updated.blockers, ...blockers]),
    }
    return mission.targets.length > 1 ? withBlockers : this.finish(withBlockers, "BLOCKED")
  }

  private finish(mission: Mission, forced: Mission["state"] | null): Mission {
    const outcome = aggregate(mission)
    let state: Mission["state"]
    if (forced) state = forced
    else if (outcome.completed + outcome.alreadyComplete === mission.targets.length)
      state = "COMPLETED"
    else if (outcome.completed > 0 || outcome.alreadyComplete > 0) state = "PARTIALLY_COMPLETED"
    else if (outcome.permissionDenied === mission.targets.length) state = "PERMISSION_DENIED"
    else if (outcome.blocked > 0) state = "BLOCKED"
    else state = "FAILED"

    const landed = state === "COMPLETED" || state === "PARTIALLY_COMPLETED"
    const finished: Mission = {
      ...mission,
      state,
      pending: null,
      currentStepId: null,
      outcome,
      landedAt: landed ? this.deps.clock.now() : mission.landedAt,
    }
    const type =
      state === "COMPLETED"
        ? "MISSION_COMPLETED"
        : state === "PARTIALLY_COMPLETED"
          ? "MISSION_PARTIALLY_COMPLETED"
          : state === "CANCELLED"
            ? "MISSION_CANCELLED"
            : state === "BLOCKED"
              ? "MISSION_BLOCKED"
              : state === "PERMISSION_DENIED"
                ? "PERMISSION_DENIED"
                : state === "STALE"
                  ? "MISSION_PAUSED"
                  : "MISSION_FAILED"
    this.emit(finished, type, mission.targets, {
      completed: outcome.completed,
      blocked: outcome.blocked,
      alreadyComplete: outcome.alreadyComplete,
      failed: outcome.failed,
      cancelled: outcome.cancelled,
      permissionDenied: outcome.permissionDenied,
    })
    return finished
  }

  // ---------------------------------------------------------------------------------------------
  // Helpers

  private require(missionId: string): Mission {
    const mission = this.deps.store.load(missionId)
    if (!mission) throw new Error(`mission ${missionId} not found`)
    return mission
  }

  private setStep(
    mission: Mission,
    stepId: string,
    patch: Partial<PlanStep>,
    state: Mission["state"],
  ): Mission {
    return {
      ...mission,
      state,
      plan: mission.plan.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
      updatedAt: this.deps.clock.now(),
    }
  }

  private decide(
    mission: Mission,
    kind: Mission["decisions"][number]["kind"],
    stepId: string | null,
    detail: string,
  ): Mission {
    return {
      ...mission,
      decisions: [...mission.decisions, { at: this.deps.clock.now(), stepId, kind, detail }],
    }
  }

  private commit(mission: Mission): void {
    const stamped = { ...mission, updatedAt: this.deps.clock.now() }
    this.deps.store.save(stamped)
    for (const listener of this.listeners) listener(stamped)
  }

  private emit(
    mission: Mission,
    type: Parameters<EventLog["append"]>[0]["type"],
    refs: readonly EntityRef[],
    detail: Record<string, string | number | boolean | null>,
  ): void {
    this.deps.events.append({
      type,
      missionId: mission.id,
      at: this.deps.clock.now(),
      actorId: mission.actorId,
      refs,
      detail,
    })
  }
}

type Blocker = Mission["blockers"][number]

/** Keep the paused mission's plan/state but record what the in-flight step actually did. */
function mergeStepResults(latest: Mission, result: Mission): Mission {
  const byId = new Map(result.plan.map((s) => [s.id, s]))
  return {
    ...latest,
    plan: latest.plan.map((s) => {
      const r = byId.get(s.id)
      return r && r.status !== "pending" && r.status !== "running"
        ? { ...s, status: r.status, verification: r.verification, retries: r.retries }
        : s
    }),
  }
}

function nextStep(mission: Mission): PlanStep | null {
  return mission.plan.find((s) => s.status === "pending") ?? null
}

function isSatisfied(step: PlanStep, graph: WorkspaceGraph, governance: GovernanceConfig): boolean {
  if (step.transition === "TIME_LOGGED") {
    const task = step.ref.kind === "task" ? graph.task(step.ref.id) : null
    return task !== null && hoursTracked(task) > governance.minimumHours
  }
  return isCompleted(step.ref, graph)
}

function isCompleted(ref: EntityRef, graph: WorkspaceGraph): boolean {
  if (ref.kind === "project") return graph.project(ref.id)?.status === "COMPLETED"
  if (ref.kind === "task") {
    const task = graph.task(ref.id)
    return task !== null && isTaskComplete(task.status)
  }
  return false
}

function versionOf(ref: EntityRef, graph: WorkspaceGraph): number | null {
  if (ref.kind === "project") return graph.project(ref.id)?.version ?? null
  if (ref.kind === "task") return graph.task(ref.id)?.version ?? null
  return null
}

function sameRef(a: EntityRef, b: EntityRef): boolean {
  return a.kind === b.kind && a.id === b.id
}

function dedupeBlockers(blockers: readonly Blocker[]): readonly Blocker[] {
  const seen = new Set<string>()
  return blockers.filter((b) => {
    const key = `${b.actionable.kind}:${b.actionable.id}:${b.requiredChange.kind}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Exact per-target aggregation (spec §12). Never a single boolean. */
export function aggregate(mission: Mission): MissionOutcome {
  const perTarget = mission.targets.map((ref, index) => {
    const steps = mission.plan.filter((s) => sameRef(s.forTarget, ref))
    const targetStep = steps.find((s) => sameRef(s.ref, ref) && s.transition === "COMPLETED")
    let outcome: TargetOutcome = "pending"
    if (steps.length === 0) outcome = "already_complete"
    else if (targetStep?.status === "succeeded") outcome = "completed"
    else if (targetStep?.status === "already_complete") outcome = "already_complete"
    else if (steps.some((s) => s.status === "permission_denied")) outcome = "permission_denied"
    else if (steps.some((s) => s.status === "blocked")) outcome = "blocked"
    else if (steps.some((s) => s.status === "failed")) outcome = "failed"
    else if (steps.some((s) => s.status === "cancelled")) outcome = "cancelled"
    else if (steps.some((s) => s.status === "skipped")) outcome = "blocked"
    return { ref, label: mission.targetLabels[index] ?? ref.id, outcome }
  })
  const count = (o: TargetOutcome) => perTarget.filter((t) => t.outcome === o).length
  return {
    perTarget,
    completed: count("completed"),
    blocked: count("blocked"),
    alreadyComplete: count("already_complete"),
    failed: count("failed"),
    cancelled: count("cancelled"),
    permissionDenied: count("permission_denied"),
    completedBeforeScopeChange: mission.plan.filter(
      (s) => s.note === "completed before scope change",
    ).length,
  }
}
