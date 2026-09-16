import { z } from "zod"

/**
 * The Test Lab's unit (spec §20, §39). A scenario is data: dataset, actor, turns, expectations.
 * `at` is a turn index, not wall-clock time; the engine runs on a virtual clock (D-22).
 */

export const ScenarioTurnSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), text: z.string().min(1) }),
  z.object({ kind: z.literal("hours"), hours: z.number().positive() }),
  z.object({ kind: z.literal("approve") }),
  z.object({ kind: z.literal("decline") }),
  z.object({
    kind: z.literal("world"),
    /** Task name within the target project (names are data; resolved at run time). */
    task: z.string().min(1),
    status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED", "BLOCKED", "NA"]),
    actorName: z.string().min(1),
  }),
  z.object({
    kind: z.literal("fault"),
    fault: z.enum(["timeout_once", "fail_once"]),
    task: z.string().min(1),
  }),
])
export type ScenarioTurn = z.infer<typeof ScenarioTurnSchema>

export const INVARIANTS = [
  "no_policy_violation",
  "no_unauthorized_write",
  "no_unverified_completion",
  "no_scope_expansion",
  "no_stale_plan_executed",
] as const
export type Invariant = (typeof INVARIANTS)[number]

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  datasetId: z.string().min(1),
  actorName: z.string().min(1),
  /** Project whose tasks world/fault turns refer to. */
  projectName: z.string().min(1).nullable(),
  turns: z.array(ScenarioTurnSchema).min(1),
  expect: z.object({
    outcome: z.enum([
      "COMPLETED",
      "BLOCKED",
      "CANCELLED",
      "WAITING",
      "STALE",
      "PARTIALLY_COMPLETED",
      "PERMISSION_DENIED",
      "FAILED",
      "NO_MISSION",
    ]),
    invariants: z.array(z.enum(INVARIANTS)),
    /** Task name → expected final status; project name → "COMPLETED" | "IN_PROGRESS". */
    finalStates: z.record(z.string(), z.string()),
    minEvents: z.number().int().nonnegative().optional(),
  }),
})
export type Scenario = z.infer<typeof ScenarioSchema>

export type AssertionResult = {
  readonly id: string
  readonly passed: boolean
  readonly detail: string
}

export type ScenarioResult = {
  readonly scenarioId: string
  readonly title: string
  readonly passed: boolean
  readonly score: { readonly passed: number; readonly total: number }
  readonly assertions: readonly AssertionResult[]
  readonly outcome: string
  readonly missionId: string | null
  readonly eventCount: number
  readonly writeCount: number
  readonly durationMs: number
  readonly versions: {
    readonly agent: string
    readonly policySet: string
    readonly dataset: string
    readonly evaluation: string
  }
  readonly weakenedPolicies: readonly string[]
}

export type RegressionRecord = {
  readonly id: string
  readonly createdAt: number
  readonly scenario: Scenario
  readonly result: ScenarioResult
  readonly diagnosis: string
}

export const AGENT_VERSION = "0.1.0"
export const EVALUATION_VERSION = "1.0.0"
