import { z } from "zod"

import type { ActorId, PhaseId, ProjectId, TaskId } from "@/core/domain/ids"
import type { Mission } from "@/core/mission/mission"

/**
 * Persisted missions are validated before they reach the engine (spec §4: the mission must be
 * independently recoverable, so a corrupted or older shape is rejected, never trusted).
 */

// Ids are branded strings at compile time; at runtime they are strings. `z.custom` keeps the brand.
const isString = (v: unknown): boolean => typeof v === "string"
const ProjectIdSchema = z.custom<ProjectId>(isString)
const TaskIdSchema = z.custom<TaskId>(isString)
const PhaseIdSchema = z.custom<PhaseId>(isString)
const ActorIdSchema = z.custom<ActorId>(isString)

const EntityRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), id: ProjectIdSchema }),
  z.object({ kind: z.literal("task"), id: TaskIdSchema }),
  z.object({ kind: z.literal("phase"), id: PhaseIdSchema }),
])

const RequiredChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("complete_task"), taskId: TaskIdSchema }),
  z.object({ kind: z.literal("log_time"), taskId: TaskIdSchema }),
  z.object({ kind: z.literal("unblock_task"), taskId: TaskIdSchema }),
  z.object({ kind: z.literal("fix_data"), taskId: TaskIdSchema, flag: z.string() }),
])

const BlockerSchema = z.object({
  target: EntityRefSchema,
  policyId: z.enum([
    "P1_PROJECT_MILESTONES",
    "P2_MILESTONE_SUBTASKS",
    "P3_TASK_PREDECESSORS",
    "P4_TASK_TIME",
    "DATA",
  ]),
  reasonCode: z.enum([
    "MILESTONES_INCOMPLETE",
    "SUBTASKS_OPEN",
    "PREDECESSORS_INCOMPLETE",
    "NO_TIME_LOGGED",
    "DATA_FLAGGED",
    "OK",
  ]),
  actionable: EntityRefSchema,
  dependencyPath: z.array(EntityRefSchema),
  requiredChange: RequiredChangeSchema,
  systemCanAct: z.boolean(),
})

const PlanStepSchema = z.object({
  id: z.string(),
  ref: EntityRefSchema,
  label: z.string(),
  transition: z.enum(["COMPLETED", "TIME_LOGGED"]),
  forTarget: EntityRefSchema,
  actionClass: z.enum(["READ", "SAFE_WRITE", "DECISION_REQUIRED", "BLOCKED", "HIGH_IMPACT"]),
  status: z.enum([
    "pending",
    "waiting_input",
    "waiting_confirm",
    "running",
    "succeeded",
    "failed",
    "blocked",
    "skipped",
    "cancelled",
    "already_complete",
    "permission_denied",
  ]),
  verification: z.enum(["UNVERIFIED", "VERIFIED", "MISMATCH"]),
  failureClass: z
    .enum(["timeout", "api_failure", "conflict", "duplicate", "partial_execution"])
    .nullable(),
  retries: z.number().int().nonnegative(),
  observedVersion: z.number().nullable(),
  blockers: z.array(BlockerSchema),
  note: z
    .enum([
      "confirmed",
      "declined by user",
      "completed before scope change",
      "blocked upstream",
      "failed upstream",
    ])
    .nullable(),
})

const TargetOutcomeSchema = z.enum([
  "completed",
  "blocked",
  "already_complete",
  "failed",
  "cancelled",
  "permission_denied",
  "pending",
  "completed_before_scope_change",
])

export const MissionSchema = z.object({
  id: z.string(),
  correlationId: z.string(),
  datasetId: z.string(),
  actorId: ActorIdSchema,
  goalText: z.string(),
  targets: z.array(EntityRefSchema),
  targetLabels: z.array(z.string()),
  excluded: z.array(EntityRefSchema),
  state: z.enum([
    "READY",
    "ACTIVE",
    "WAITING",
    "EXECUTING",
    "VERIFYING",
    "PAUSED",
    "COMPLETED",
    "BLOCKED",
    "FAILED",
    "STALE",
    "PERMISSION_DENIED",
    "CANCELLED",
    "PARTIALLY_COMPLETED",
  ]),
  plan: z.array(PlanStepSchema),
  pending: z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("input"),
        stepId: z.string(),
        input: z.object({
          field: z.literal("hours"),
          policyId: z.enum([
            "P1_PROJECT_MILESTONES",
            "P2_MILESTONE_SUBTASKS",
            "P3_TASK_PREDECESSORS",
            "P4_TASK_TIME",
          ]),
          reasonCode: z.enum([
            "MILESTONES_INCOMPLETE",
            "SUBTASKS_OPEN",
            "PREDECESSORS_INCOMPLETE",
            "NO_TIME_LOGGED",
            "DATA_FLAGGED",
            "OK",
          ]),
          permission: z.enum(["complete_project", "complete_task", "log_time", "read"]),
          schema: z.object({
            type: z.literal("number"),
            exclusiveMinimum: z.number(),
            maximum: z.number(),
          }),
        }),
      }),
      z.object({ kind: z.literal("confirm_step"), stepId: z.string() }),
      z.object({ kind: z.literal("confirm_plan") }),
    ])
    .nullable(),
  pauseRequested: z.boolean(),
  planConfirmed: z.boolean(),
  currentStepId: z.string().nullable(),
  blockers: z.array(BlockerSchema),
  openButNotRequired: z.array(z.object({ ref: EntityRefSchema, label: z.string() })),
  decisions: z.array(
    z.object({
      at: z.number(),
      stepId: z.string().nullable(),
      kind: z.enum(["approve", "decline", "input", "cancel", "pause", "change_scope", "continue"]),
      detail: z.string(),
    }),
  ),
  stateChanges: z.array(
    z.object({
      at: z.number(),
      ref: EntityRefSchema,
      summary: z.string(),
      actorId: ActorIdSchema.nullable(),
      affectedStepIds: z.array(z.string()),
      replan: z.object({ kept: z.number(), planned: z.number() }).nullable(),
    }),
  ),
  outcome: z
    .object({
      perTarget: z.array(
        z.object({ ref: EntityRefSchema, label: z.string(), outcome: TargetOutcomeSchema }),
      ),
      completed: z.number(),
      blocked: z.number(),
      alreadyComplete: z.number(),
      failed: z.number(),
      cancelled: z.number(),
      permissionDenied: z.number(),
      completedBeforeScopeChange: z.number(),
    })
    .nullable(),
  interpretedBy: z.enum(["deterministic", "model"]).nullable(),
  origin: z.enum(["user", "routine"]),
  createdAt: z.number(),
  updatedAt: z.number(),
  landedAt: z.number().nullable(),
})

export const MissionsSchema = z.array(MissionSchema)

/** Compile-time proof that the schema produces the domain type; a drift in either fails typecheck. */
export const missionFromPersisted = (value: z.infer<typeof MissionSchema>): Mission => value
