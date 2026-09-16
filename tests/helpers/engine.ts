import type { Actor } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef } from "@/core/domain/ids"
import { MissionEngine } from "@/core/execution/engine"
import type { ProposedPlan } from "@/core/execution/flight-plan"
import { RoleBasedPermissions } from "@/core/governance/permissions"
import { MemoryMissionStore } from "@/core/mission/store"
import { VirtualClock } from "@/core/system/clock"
import { InMemorySystemOfRecord } from "@/core/system/in-memory"
import { EventLog } from "@/core/telemetry/events"
import { ingestFixture } from "./fixtures"

export type Harness = {
  graph: WorkspaceGraph
  sor: InMemorySystemOfRecord
  engine: MissionEngine
  events: EventLog
  store: MemoryMissionStore
  clock: VirtualClock
  actor: (name: string) => Actor
  project: (name: string) => EntityRef
  task: (project: string, name: string) => EntityRef
  propose: (
    actor: Actor,
    goalText: string,
    targets: EntityRef[],
    excluded?: EntityRef[],
  ) => ProposedPlan
}

let missionCounter = 0

export function harness(fixture = "cascading-conflicts"): Harness {
  const { graph } = ingestFixture(fixture)
  const clock = new VirtualClock()
  const sor = new InMemorySystemOfRecord(graph, { clock })
  const store = new MemoryMissionStore()
  const events = new EventLog()
  const engine = new MissionEngine({
    sor,
    permissions: new RoleBasedPermissions(),
    store,
    events,
    clock,
    resolveActor: (id) => sor.current().actor(id),
  })
  const project = (name: string): EntityRef => ({
    kind: "project",
    id: graph.projects.find((p) => p.name === name)!.id,
  })
  const task = (projectName: string, name: string): EntityRef => {
    const p = project(projectName)
    const projectRef = p.kind === "project" ? p.id : null
    return { kind: "task", id: graph.tasksOf(projectRef!).find((t) => t.name === name)!.id }
  }
  return {
    graph,
    sor,
    engine,
    events,
    store,
    clock,
    actor: (name) => graph.actors.find((a) => a.name === name)!,
    project,
    task,
    propose: (actor, goalText, targets, excluded = []) => {
      missionCounter += 1
      return { missionId: `m-${missionCounter}`, goalText, targets, excluded, actor }
    },
  }
}
