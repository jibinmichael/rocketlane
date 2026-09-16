import type { Mission, MissionSummary } from "@/core/mission/mission"
import { summarize } from "@/core/mission/mission"

export interface MissionStore {
  load(id: string): Mission | null
  save(mission: Mission): void
  list(): readonly MissionSummary[]
  all(): readonly Mission[]
}

export class MemoryMissionStore implements MissionStore {
  private readonly missions = new Map<string, Mission>()

  load(id: string): Mission | null {
    return this.missions.get(id) ?? null
  }

  save(mission: Mission): void {
    this.missions.set(mission.id, mission)
  }

  list(): readonly MissionSummary[] {
    return [...this.missions.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(summarize)
  }

  all(): readonly Mission[] {
    return [...this.missions.values()]
  }
}
