import { expectTypeOf, test } from "vitest"

import type { FlightPlan, ProposedPlan } from "@/core/execution/flight-plan"

/**
 * Gate 5 (D-18): a ProposedPlan is not a FlightPlan. Only core/execution can construct the branded
 * type, so nothing the agent (or a model) produces can reach the executor as an executable plan.
 */
test("a ProposedPlan cannot be passed where a FlightPlan is required", () => {
  expectTypeOf<ProposedPlan>().not.toMatchTypeOf<FlightPlan>()
  expectTypeOf<FlightPlan>().not.toMatchTypeOf<ProposedPlan>()
})
