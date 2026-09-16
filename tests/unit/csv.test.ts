import { describe, expect, it } from "vitest"

import { parseCsv } from "@/core/ingestion/csv"

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes, CRLF and a BOM", () => {
    const input = '﻿a,b,c\r\n1,"x, y","she said ""hi"""\r\n2,,\r\n'
    const result = parseCsv(input)
    expect(result.header).toEqual(["a", "b", "c"])
    expect(result.rows).toEqual([
      { a: "1", b: "x, y", c: 'she said "hi"' },
      { a: "2", b: "", c: "" },
    ])
    expect(result.lineNumbers).toEqual([2, 3])
    expect(result.malformed).toEqual([])
  })

  it("keeps embedded newlines inside quoted fields and tracks line numbers", () => {
    const result = parseCsv('id,note\n1,"line one\nline two"\n2,plain\n')
    expect(result.rows[0]?.note).toBe("line one\nline two")
    expect(result.lineNumbers).toEqual([2, 4])
  })

  it("reports rows with the wrong field count instead of dropping them silently", () => {
    const result = parseCsv("a,b\n1,2\n3\n4,5\n")
    expect(result.rows).toHaveLength(2)
    expect(result.malformed).toEqual([{ line: 3, reason: "expected 2 fields, found 1" }])
  })

  it("reports an unterminated quote", () => {
    const result = parseCsv('a,b\n1,"open\n')
    expect(result.malformed.some((m) => m.reason === "unterminated quoted field")).toBe(true)
  })
})
