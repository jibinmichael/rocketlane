#!/usr/bin/env node
/**
 * Seeded, dependency-free generator for stress datasets in the two-file Rocketlane export shape
 * (docs/agent-context/07-data-contract.md, source shape A). Same arguments → byte-identical output.
 *
 *   node fixtures/stress/scale/generate.mjs --seed 7 --projects 200 --tasks 4000 --depth 12 --width 6 \
 *     --out fixtures/stress/scale-sample
 *
 * Options
 *   --seed <int>        PRNG seed (default 7)
 *   --projects <int>    number of projects (default 200)
 *   --tasks <int>       total number of tasks across all projects (default 4000)
 *   --depth <int>       longest predecessor chain per project (default 12)
 *   --width <int>       maximum predecessors per task (default 6)
 *   --empty-ratio <f>   fraction of projects with zero tasks (default 0.1)
 *   --out <dir>         output directory (default: fixtures/stress/scale-sample)
 *
 * Guarantees: predecessors only reference earlier tasks of the same project (acyclic), task names are
 * unique per project and never contain ", ", parents exist in the same project, no negative hours.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const PROJECT_HEADER =
  "ProjectId,ProjectName,ProjectStatus,StartDate,DueDate,ProjectOwner,ProjectOwnerId,ProjectOwnerEmail,CustomerName,CustomerId,Progress,Project Type,CompletedTasks,OverdueTasks,BlockedTasks,AtRiskTasks,ApprovalPending,BRD Sign-off,UAT Sign-off,% BM Billed,% BM Created,Billing Status,ProjectTrackedHours,PercentageBudgetConsumed,ActualStartDate,ActualCompletedDate,Kick-off Date,Final Go Live Date,First Go-Live Date,PlannedDuration,ProjectBudget,EstimateAtCompletion,EstimateToComplete,ProjectRevenue,ProjectCost,ProjectProfit,Invoiced Amount,TeamMembers,Region".split(
    ",",
  )

const TASK_HEADER =
  "ProjectId,TaskId,TaskName,Status,ProjectName,PhaseId,Phase,Assignee,Priority,StartDate,DueDate,HoursTracked,Is this a Billing Milestone?,Invoice Raised?,% of amount to be billed,Dependency,ParentTaskId,ParentTask,AtRisk,Progress,ActualStartDate,CompletedAt,RemainingHours,Effort(hrs),Billable,Category".split(
    ",",
  )

const FIRST_NAMES = [
  "Priya",
  "Daniel",
  "Mei",
  "Sofia",
  "Arjun",
  "Lena",
  "Tomas",
  "Amara",
  "Yusuf",
  "Hana",
  "Marco",
  "Ingrid",
  "Kwame",
  "Elena",
  "Noah",
  "Zara",
]
const LAST_NAMES = [
  "Raman",
  "Okafor",
  "Tanaka",
  "Alvarez",
  "Mehta",
  "Fischer",
  "Novak",
  "Diallo",
  "Kaya",
  "Sato",
  "Rossi",
  "Berg",
  "Mensah",
  "Petrova",
  "Lindqvist",
  "Haddad",
]
const CUSTOMERS = [
  "Northwind",
  "Contoso",
  "Globex",
  "Initech",
  "Umbrella",
  "Vandelay",
  "Wonka",
  "Stark",
  "Wayne",
  "Acme",
  "Hooli",
  "Soylent",
  "Tyrell",
  "Cyberdyne",
  "Aperture",
  "Massive Dynamic",
]
const PROJECT_KINDS = [
  "CLM Implementation",
  "Enterprise Rollout",
  "Phase 1 Implementation",
  "Phase 2 Rollout",
  "Migration",
  "Integration Program",
]
const PHASES = [
  "Getting Started",
  "Initiate",
  "Discover & Design",
  "Configure & Build",
  "Test",
  "Transfer",
  "Measure",
]
const VERBS = ["Configure", "Review", "Validate", "Migrate", "Document", "Train", "Deploy", "Audit"]
const NOUNS = [
  "workflow",
  "template",
  "integration",
  "report",
  "permission set",
  "data model",
  "environment",
  "playbook",
]
const CATEGORIES = [
  "Project Setup",
  "Discovery",
  "Build and Deployment",
  "Test Execution",
  "Transition",
  "Program Management",
  "",
]
const REGIONS = ["AMER", "APAC", "Europe", "MEA"]
const STATUS_WEIGHTS = [
  ["Completed", 45],
  ["To do", 30],
  ["In progress", 15],
  ["Blocked", 5],
  ["NA", 5],
]

function parseArgs(argv) {
  const options = {
    seed: 7,
    projects: 200,
    tasks: 4000,
    depth: 12,
    width: 6,
    emptyRatio: 0.1,
    out: "fixtures/stress/scale-sample",
  }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    const value = argv[i + 1]
    switch (key) {
      case "--seed":
        options.seed = Number.parseInt(value, 10)
        i += 1
        break
      case "--projects":
        options.projects = Number.parseInt(value, 10)
        i += 1
        break
      case "--tasks":
        options.tasks = Number.parseInt(value, 10)
        i += 1
        break
      case "--depth":
        options.depth = Number.parseInt(value, 10)
        i += 1
        break
      case "--width":
        options.width = Number.parseInt(value, 10)
        i += 1
        break
      case "--empty-ratio":
        options.emptyRatio = Number.parseFloat(value)
        i += 1
        break
      case "--out":
        options.out = value
        i += 1
        break
      default:
        throw new Error(`unknown argument ${key}`)
    }
  }
  for (const [name, n] of Object.entries(options)) {
    if (name !== "out" && !Number.isFinite(n)) throw new Error(`--${name} must be a number`)
  }
  return options
}

/** mulberry32: small, fast, deterministic. */
function createRng(seed) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
    weighted: (pairs) => {
      const total = pairs.reduce((sum, [, w]) => sum + w, 0)
      let roll = next() * total
      for (const [value, weight] of pairs) {
        roll -= weight
        if (roll < 0) return value
      }
      return pairs[pairs.length - 1][0]
    },
  }
}

function csvField(value) {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvRow(header, record) {
  return header.map((column) => csvField(record[column] ?? "")).join(",")
}

function isoDate(dayOffset) {
  const base = Date.UTC(2026, 0, 5)
  return new Date(base + dayOffset * 86_400_000).toISOString().slice(0, 10)
}

function person(rng, index, domain) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]
  const last =
    LAST_NAMES[Math.floor(index / FIRST_NAMES.length + rng.int(0, 3)) % LAST_NAMES.length]
  const name = `${first} ${last}`
  return { name, email: `${first}.${last}.${index}@${domain}`.toLowerCase() }
}

function allocateTaskCounts(rng, projectCount, taskTotal, emptyRatio) {
  const emptyCount = Math.min(projectCount, Math.round(projectCount * emptyRatio))
  const counts = new Array(projectCount).fill(0)
  const populated = []
  for (let p = 0; p < projectCount; p += 1) if (p >= emptyCount) populated.push(p)
  if (populated.length === 0) return counts
  for (let t = 0; t < taskTotal; t += 1) counts[rng.pick(populated)] += 1
  return counts
}

export function generate(options) {
  const rng = createRng(options.seed)
  const owners = Array.from({ length: 12 }, (_, i) => ({
    id: `ACT-${1000 + i}`,
    ...person(rng, i, "example.com"),
  }))
  const members = Array.from({ length: 40 }, (_, i) => person(rng, 100 + i, "example.org"))
  const counts = allocateTaskCounts(rng, options.projects, options.tasks, options.emptyRatio)

  const projectLines = [PROJECT_HEADER.join(",")]
  const taskLines = [TASK_HEADER.join(",")]
  let taskSerial = 0
  let phaseSerial = 0

  for (let p = 0; p < options.projects; p += 1) {
    const pid = `PRJ-${String(p + 1).padStart(4, "0")}`
    const customer = `${rng.pick(CUSTOMERS)} ${rng.pick(["Inc", "Ltd", "GmbH", "LLC", "Group"])}`
    const pname = `${customer} - ${rng.pick(PROJECT_KINDS)}`
    const owner = rng.pick(owners)
    const start = rng.int(0, 200)
    const taskCount = counts[p]
    const allDone = taskCount > 0 && rng.chance(0.15)
    const status = allDone ? "Completed" : rng.chance(0.9) ? "In progress" : "On hold"
    const teamSize = rng.int(1, 6)
    const team = []
    for (let m = 0; m < teamSize; m += 1) team.push(rng.pick(members))
    const teamMembers = team.map((m) => `${m.name}|${m.email}`).join(", ")

    projectLines.push(
      csvRow(PROJECT_HEADER, {
        ProjectId: pid,
        ProjectName: pname,
        ProjectStatus: status,
        StartDate: isoDate(start),
        DueDate: isoDate(start + rng.int(30, 400)),
        ProjectOwner: owner.name,
        ProjectOwnerId: owner.id,
        ProjectOwnerEmail: owner.email,
        CustomerName: customer,
        CustomerId: String(50000 + p),
        Progress: allDone ? "100.00" : String(rng.int(0, 99)),
        "Project Type": rng.pick(["CLM Platform", "Change Request ", "Migration"]),
        TeamMembers: teamMembers,
        Region: rng.pick(REGIONS),
      }),
    )

    if (taskCount === 0) continue

    const phaseCount = rng.int(2, Math.min(PHASES.length, 6))
    const phases = Array.from({ length: phaseCount }, (_, k) => {
      phaseSerial += 1
      return { id: `PHS-${String(phaseSerial).padStart(5, "0")}`, name: PHASES[k] }
    })

    const tasks = []
    const depthOf = []
    const milestoneFrom = Math.max(1, taskCount - Math.max(1, Math.floor(taskCount * 0.1)))
    for (let n = 0; n < taskCount; n += 1) {
      taskSerial += 1
      const id = `TSK-${String(taskSerial).padStart(6, "0")}`
      const name = `${rng.pick(VERBS)} ${rng.pick(NOUNS)} ${n + 1}`
      const isMilestone = n >= milestoneFrom
      const rawStatus = allDone ? "Completed" : rng.weighted(STATUS_WEIGHTS)

      // Spine: the first `depth` tasks form one chain, so max depth is exactly min(depth, taskCount).
      let predecessors = []
      if (n > 0 && n < options.depth) {
        predecessors = [n - 1]
      } else if (n > 0 && rng.chance(0.6)) {
        const want = rng.int(1, Math.max(1, options.width))
        const eligible = []
        for (let k = 0; k < n; k += 1) if (depthOf[k] < options.depth) eligible.push(k)
        const chosen = new Set()
        for (let w = 0; w < want && eligible.length > 0; w += 1) chosen.add(rng.pick(eligible))
        predecessors = [...chosen].sort((a, b) => a - b)
      }
      depthOf[n] =
        predecessors.length === 0 ? 1 : 1 + Math.max(...predecessors.map((k) => depthOf[k]))

      let parent = null
      if (!isMilestone && n > 0 && predecessors.length === 0 && rng.chance(0.15)) {
        const candidates = tasks.filter((t) => t.parent === null)
        if (candidates.length > 0) parent = rng.pick(candidates)
      }

      const completed = rawStatus === "Completed"
      const hasHours = completed ? rng.chance(0.8) : rng.chance(0.5)
      const hours = hasHours ? (rng.int(1, 4000) / 100).toFixed(2) : "0.00"
      const phase = rng.pick(phases)
      const taskStart = start + n
      const assignees = rng.chance(0.7) ? [rng.pick(team)?.name].filter(Boolean) : []

      tasks.push({
        id,
        name,
        isMilestone,
        parent,
        record: {
          ProjectId: pid,
          TaskId: id,
          TaskName: name,
          Status: rawStatus,
          ProjectName: pname,
          PhaseId: phase.id,
          Phase: phase.name,
          Assignee: assignees.join(", "),
          StartDate: isoDate(taskStart),
          DueDate: isoDate(taskStart + rng.int(1, 30)),
          HoursTracked: hours,
          "Is this a Billing Milestone?": isMilestone ? "true" : "",
          Dependency: predecessors.map((k) => tasks[k].name).join(", "),
          ParentTaskId: parent ? parent.id : "",
          ParentTask: parent ? parent.name : "",
          ActualStartDate: completed || rawStatus === "In progress" ? isoDate(taskStart) : "",
          CompletedAt: completed ? isoDate(taskStart + rng.int(1, 30)) : "",
          RemainingHours: "0.00",
          Billable: rng.chance(0.8) ? "true" : "false",
          Category: rng.pick(CATEGORIES),
        },
      })
    }
    for (const task of tasks) taskLines.push(csvRow(TASK_HEADER, task.record))
  }

  return {
    projectsCsv: `${projectLines.join("\n")}\n`,
    tasksCsv: `${taskLines.join("\n")}\n`,
    taskCount: taskSerial,
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname
if (isMain) {
  const options = parseArgs(process.argv.slice(2))
  const output = generate(options)
  mkdirSync(options.out, { recursive: true })
  writeFileSync(resolve(options.out, "projects.csv"), output.projectsCsv)
  writeFileSync(resolve(options.out, "tasks.csv"), output.tasksCsv)
  process.stdout.write(
    `wrote ${options.projects} projects and ${output.taskCount} tasks to ${options.out} (seed ${options.seed}, depth ${options.depth}, width ${options.width})\n`,
  )
}
