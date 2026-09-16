import type { WorkspaceGraph } from "@/core/domain/graph"
import type { ActorId } from "@/core/domain/ids"
import type { Mission } from "@/core/mission/mission"

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

function openProjects(graph: WorkspaceGraph | null, actorId: ActorId | null) {
  const open = (graph?.projects ?? []).filter((p) => p.status !== "COMPLETED")
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
  const { owned } = openProjects(graph, actorId)
  const first = at(owned, seed)?.name ?? null
  const second = at(owned, seed + 1)?.name ?? first
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
  const { owned } = openProjects(graph, actorId)
  const target = mission?.targetLabels[0] ?? null
  const others = owned.filter((p) => p.name !== target)
  const other = at(others, seed)?.name ?? null
  const mentioned =
    graph?.projects.find((p) => asked.some((a) => a.toLowerCase().includes(p.name.toLowerCase())))
      ?.name ?? null
  const out: Suggestion[] = []
  if (!mission) {
    if (mentioned) {
      out.push({ id: "complete", icon: "network", text: `Complete ${mentioned}` })
      out.push({ id: "path", icon: "branch", text: `Show the full path for ${mentioned}` })
    }
    if (other && other !== mentioned)
      out.push({ id: "blocking", icon: "search", text: `What's blocking ${other}?` })
    if (out.length < 3) out.push({ id: "mine", icon: "layers", text: "Complete all my projects" })
  } else if (mission.state === "COMPLETED" || mission.state === "PARTIALLY_COMPLETED") {
    // The landing block already carries "View activity"; the chips point forward.
    if (other) out.push({ id: "complete", icon: "network", text: `Complete ${other}` })
    const another = at(others, seed + 1)?.name ?? other
    if (another) out.push({ id: "blocking", icon: "search", text: `What's blocking ${another}?` })
    out.push({ id: "mine", icon: "layers", text: "Complete all my projects" })
  } else {
    if (target) out.push({ id: "path", icon: "branch", text: `Show the full path for ${target}` })
    if (other) out.push({ id: "blocking", icon: "search", text: `What's blocking ${other}?` })
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
