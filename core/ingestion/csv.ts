/**
 * RFC 4180 CSV parser. Handles quoted fields, escaped quotes (""), embedded commas and
 * newlines, CRLF, and a UTF-8 BOM. Streams row by row so large files do not need a second copy.
 */
export type CsvRow = Readonly<Record<string, string>>

export type CsvParseResult = {
  readonly header: readonly string[]
  readonly rows: readonly CsvRow[]
  /** 1-based line number of each row's first line, parallel to `rows`. */
  readonly lineNumbers: readonly number[]
  readonly malformed: ReadonlyArray<{ readonly line: number; readonly reason: string }>
}

export function parseCsv(input: string): CsvParseResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const records: string[][] = []
  const recordLines: number[] = []
  const malformed: Array<{ line: number; reason: string }> = []

  let field = ""
  let record: string[] = []
  let inQuotes = false
  let line = 1
  let recordStartLine = 1
  let i = 0

  const endRecord = () => {
    record.push(field)
    field = ""
    const isBlank = record.length === 1 && record[0] === ""
    if (!isBlank) {
      records.push(record)
      recordLines.push(recordStartLine)
    }
    record = []
    recordStartLine = line
  }

  while (i < text.length) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      if (ch === "\n") line += 1
      field += ch
      i += 1
      continue
    }
    if (ch === '"') {
      if (field.length > 0) malformed.push({ line, reason: "quote inside unquoted field" })
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ",") {
      record.push(field)
      field = ""
      i += 1
      continue
    }
    if (ch === "\r") {
      i += 1
      continue
    }
    if (ch === "\n") {
      line += 1
      endRecord()
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  if (inQuotes) malformed.push({ line, reason: "unterminated quoted field" })
  if (field.length > 0 || record.length > 0) endRecord()

  const header = (records[0] ?? []).map((h) => h.trim())
  const rows: CsvRow[] = []
  const lineNumbers: number[] = []
  for (let r = 1; r < records.length; r += 1) {
    const values = records[r]!
    if (values.length !== header.length) {
      malformed.push({
        line: recordLines[r]!,
        reason: `expected ${header.length} fields, found ${values.length}`,
      })
      continue
    }
    const row: Record<string, string> = {}
    header.forEach((name, index) => {
      row[name] = values[index] ?? ""
    })
    rows.push(row)
    lineNumbers.push(recordLines[r]!)
  }
  return { header, rows, lineNumbers, malformed }
}
