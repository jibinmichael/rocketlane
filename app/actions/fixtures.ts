"use server"

import { readFile } from "node:fs/promises"
import path from "node:path"

export type FixtureFiles = {
  readonly id: string
  readonly projectsCsv: string
  readonly tasksCsv: string
}

const FIXTURE_IDS = ["cascading-conflicts", "rocketlane-export"] as const
export type FixtureId = (typeof FIXTURE_IDS)[number]

/** Fixtures are data on disk; the browser receives them as CSV text and ingests them client-side. */
export async function loadFixture(id: string): Promise<FixtureFiles> {
  if (!FIXTURE_IDS.includes(id as FixtureId)) throw new Error(`unknown fixture: ${id}`)
  const dir = path.join(process.cwd(), "fixtures", id)
  const [projectsCsv, tasksCsv] = await Promise.all([
    readFile(path.join(dir, "projects.csv"), "utf8"),
    readFile(path.join(dir, "tasks.csv"), "utf8"),
  ])
  return { id, projectsCsv, tasksCsv }
}

export async function listFixtures(): Promise<readonly FixtureId[]> {
  return FIXTURE_IDS
}
