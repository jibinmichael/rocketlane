import { describe, expect, it } from "vitest"
import { z } from "zod"

describe("toolchain", () => {
  it("runs vitest with the @ alias root and zod available", () => {
    const schema = z.object({ step: z.literal(2) })
    expect(schema.parse({ step: 2 })).toEqual({ step: 2 })
  })
})
