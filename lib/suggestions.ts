import type { Project } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { ActorId } from "@/core/domain/ids"
import { DEFAULT_GOVERNANCE_CONFIG } from "@/core/governance/engine"
import type { Mission } from "@/core/mission/mission"
import { ALL_CLOSURE_RULES, resolveClosure, traceCurrentBlockers } from "@/core/resolver/blockers"

/**
 * Suggested next steps: every one is a real capability phrased as the person would type it, chosen
 * from the workspace and the moment (what just happened, what they own, what they already asked).
 * They rotate with use so the same three rows never sit there for a whole session.
 */
export type Suggestion = {
  readonly id: string
  readonly icon: "network" | "search" | "layers" | "branch" | "clock"
  readonly text: string
  /** A UI action instead of a typed turn (the landing's activity view). */
  readonly action?: "view_activity"
}

export type RankedProject = {
  readonly project: Project
  /** Updates the closure needs, hours the agent must ask for, and the deepest chain: the work. */
  readonly score: number
}

const ranked = new WeakMap<WorkspaceGraph, readonly RankedProject[]>()

/** Open projects, most cascading complexity first, from the same resolver the engine plans with. */
export function rankByComplexity(graph: WorkspaceGraph): readonly RankedProject[] {
  const cached = ranked.get(graph)
  if (cached) return cached
  const rows = graph.projects
    .filter((p) => p.status !== "COMPLETED")
    .map((project) => {
      const ref = { kind: "project" as const, id: project.id }
      const closure = resolveClosure(
        ref,
        graph,
        DEFAULT_GOVERNANCE_CONFIG,
        new Set(),
        ALL_CLOSURE_RULES,
      )
      const depth = Math.max(
        0,
        ...traceCurrentBlockers(ref, graph, DEFAULT_GOVERNANCE_CONFIG).map(
          (b) => b.dependencyPath.length,
        ),
      )
      return { project, score: closure.requiredTransitions.length + depth }
    })
    .sort((a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name))
  ranked.set(graph, rows)
  return rows
}

function openProjects(graph: WorkspaceGraph | null, actorId: ActorId | null) {
  const open = graph ? rankByComplexity(graph).map((r) => r.project) : []
  const owned = actorId ? open.filter((p) => p.ownerId === actorId) : []
  return { owned: owned.length > 0 ? owned : open, open }
}

const at = <T>(list: readonly T[], i: number): T | undefined =>
  list.length === 0 ? undefined : list[((i % list.length) + list.length) % list.length]

/** The home's ways in: an outcome, a question, and a third that rotates. */
export function iceBreakers(
  graph: WorkspaceGraph | null,
  actorId: ActorId | null,
  seed: number,
): Suggestion[] {
  const { owned, open } = openProjects(graph, actorId)
  // The deepest cascade the person owns leads; the question rotates over the next deepest anywhere.
  const first = owned[0]?.name ?? null
  const rest = open.filter((p) => p.name !== first).slice(0, 3)
  const second = at(rest, seed)?.name ?? first
  const out: Suggestion[] = [
    {
      id: "complete",
      icon: "network",
      text: first ? `Complete ${first}` : "Complete a project",
    },
    {
      id: "blocking",
      icon: "search",
      text: second ? `What's blocking ${second}?` : "What's blocking my projects?",
    },
  ]
  const third: Suggestion[] = [
    { id: "mine", icon: "layers", text: "Complete all my projects" },
    ...(first
      ? [{ id: "path", icon: "branch" as const, text: `Show the full path for ${first}` }]
      : []),
    ...(second
      ? [{ id: "routine", icon: "clock" as const, text: `Every morning check ${second}` }]
      : []),
  ]
  const pick = at(third, seed)
  if (pick) out.push(pick)
  return out
}

/** What makes sense right after this turn, never repeating something already asked. */
export function followUps(input: {
  graph: WorkspaceGraph | null
  actorId: ActorId | null
  mission: Mission | null
  asked: readonly string[]
  seed: number
}): Suggestion[] {
  const { graph, actorId, mission, asked, seed } = input
  const { owned, open } = openProjects(graph, actorId)
  const target = mission?.targetLabels[0] ?? null
  const others = owned.filter((p) => p.name !== target)
  const other = others[0]?.name ?? null
  const deepest = open.filter((p) => p.name !== target && p.name !== other).slice(0, 3)
  const mentioned =
    graph?.projects.find((p) => asked.some((a) => a.toLowerCase().includes(p.name.toLowerCase())))
      ?.name ?? null
  const out: Suggestion[] = []
  if (!mission) {
    if (mentioned) {
      out.push({ id: "complete", icon: "network", text: `Complete ${mentioned}` })
      out.push({ id: "path", icon: "branch", text: `Show the full path for ${mentioned}` })
    }
    const ask =
      at(
        deepest.filter((p) => p.name !== mentioned),
        seed,
      )?.name ?? null
    if (ask) out.push({ id: "blocking", icon: "search", text: `What's blocking ${ask}?` })
    if (out.length < 3) out.push({ id: "mine", icon: "layers", text: "Complete all my projects" })
  } else if (mission.state === "COMPLETED" || mission.state === "PARTIALLY_COMPLETED") {
    // The landing block already carries "View activity"; the chips point forward.
    if (other) out.push({ id: "complete", icon: "network", text: `Complete ${other}` })
    const another = at(deepest, seed)?.name ?? null
    if (another) out.push({ id: "blocking", icon: "search", text: `What's blocking ${another}?` })
    out.push({ id: "mine", icon: "layers", text: "Complete all my projects" })
  } else {
    if (target) out.push({ id: "path", icon: "branch", text: `Show the full path for ${target}` })
    const another = at(deepest, seed)?.name ?? other
    if (another) out.push({ id: "blocking", icon: "search", text: `What's blocking ${another}?` })
    out.push({ id: "mine", icon: "layers", text: "Complete all my projects" })
  }
  const lower = new Set(asked.map((a) => a.trim().toLowerCase()))
  const goal = mission?.goalText.trim().toLowerCase() ?? ""
  const seen = new Set<string>()
  return out
    .filter((s) => {
      const key = s.text.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return s.action !== undefined || (!lower.has(key) && key !== goal)
    })
    .slice(0, 3)
}
