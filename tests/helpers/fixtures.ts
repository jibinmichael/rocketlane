import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { ingestTwoFileExport, type IngestionResult } from "@/core/ingestion/export-two-file"

const fixturesRoot = fileURLToPath(new URL("../../fixtures/", import.meta.url))

export function readFixture(name: string, file: string): string {
  return readFileSync(`${fixturesRoot}${name}/${file}`, "utf8")
}

export function ingestFixture(name: string): IngestionResult {
  return ingestTwoFileExport({
    datasetId: name,
    projectsCsv: readFixture(name, "projects.csv"),
    tasksCsv: readFixture(name, "tasks.csv"),
  })
}
