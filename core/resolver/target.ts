import type { Project, Task } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef, ProjectId } from "@/core/domain/ids"

/**
 * Target resolution (spec §2A): natural-language reference → explicit entity ids.
 * Never silently broadens an ambiguous target.
 */

export type TargetResolution =
  | {
      readonly status: "resolved"
      readonly ref: EntityRef
      readonly label: string
      readonly score: number
    }
  | { readonly status: "ambiguous"; readonly candidates: readonly Candidate[] }
  | { readonly status: "not_found"; readonly query: string }

export type Candidate = { readonly ref: EntityRef; readonly label: string; readonly score: number }

/** Two candidates closer than this are treated as a tie → clarification (spec §2A). */
const AMBIGUITY_MARGIN = 0.15
const MIN_SCORE = 0.45

export function resolveProject(query: string, graph: WorkspaceGraph): TargetResolution {
  return pick(
    query,
    graph.projects.map((p) => ({
      ref: { kind: "project", id: p.id } as EntityRef,
      label: p.name,
      score: scoreProject(query, p),
    })),
  )
}

export function resolveTask(
  query: string,
  graph: WorkspaceGraph,
  scope: { projectId?: ProjectId } = {},
): TargetResolution {
  const tasks = scope.projectId ? graph.tasksOf(scope.projectId) : graph.tasks
  return pick(
    query,
    tasks.map((t) => ({
      ref: { kind: "task", id: t.id } as EntityRef,
      label: t.name,
      score: scoreName(query, t.name),
    })),
  )
}

/** Resolve either kind; projects win ties because they are the coarser scope. */
export function resolveAny(
  query: string,
  graph: WorkspaceGraph,
  scope: { projectId?: ProjectId } = {},
): TargetResolution {
  const project = resolveProject(query, graph)
  const task = resolveTask(query, graph, scope)
  if (project.status === "resolved" && task.status === "resolved") {
    return project.score >= task.score - AMBIGUITY_MARGIN ? project : task
  }
  if (project.status === "resolved") return project
  if (task.status === "resolved") return task
  if (project.status === "ambiguous") return project
  if (task.status === "ambiguous") return task
  return { status: "not_found", query }
}

function pick(query: string, candidates: readonly Candidate[]): TargetResolution {
  const ranked = candidates.filter((c) => c.score >= MIN_SCORE).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best) return { status: "not_found", query }
  const second = ranked[1]
  if (second && best.score - second.score < AMBIGUITY_MARGIN && best.label !== second.label) {
    return { status: "ambiguous", candidates: ranked.slice(0, 4) }
  }
  if (second && best.label === second.label && best.score === second.score) {
    return { status: "ambiguous", candidates: ranked.filter((c) => c.label === best.label) }
  }
  return { status: "resolved", ref: best.ref, label: best.label, score: best.score }
}

function scoreProject(query: string, project: Project): number {
  const byName = scoreName(query, project.name)
  const byCustomer = project.customerName ? scoreName(query, project.customerName) * 0.9 : 0
  return Math.max(byName, byCustomer)
}

/**
 * Token-based similarity: exact (1.0) > normalized-exact (0.98) > query is a token-prefix of the
 * name or vice versa (0.85–0.95) > Jaccard over word tokens.
 */
export function scoreName(query: string, name: string): number {
  if (query === name) return 1
  const q = normalize(query)
  const n = normalize(name)
  if (q === n) return 0.98
  if (q.length === 0 || n.length === 0) return 0
  if (n.startsWith(q)) return 0.9 + 0.05 * (q.length / n.length)
  if (q.startsWith(n)) return 0.85
  const qt = new Set(q.split(" "))
  const nt = new Set(n.split(" "))
  let intersection = 0
  for (const t of qt) if (nt.has(t)) intersection += 1
  const union = qt.size + nt.size - intersection
  const jaccard = union === 0 ? 0 : intersection / union
  const containment = intersection / qt.size
  return Math.max(jaccard, containment * 0.8)
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function labelOf(ref: EntityRef, graph: WorkspaceGraph): string {
  switch (ref.kind) {
    case "project":
      return graph.project(ref.id)?.name ?? ref.id
    case "task":
      return graph.task(ref.id)?.name ?? ref.id
    case "phase":
      return graph.phase(ref.id)?.name ?? ref.id
  }
}

export function taskOrNull(ref: EntityRef, graph: WorkspaceGraph): Task | null {
  return ref.kind === "task" ? graph.task(ref.id) : null
}
