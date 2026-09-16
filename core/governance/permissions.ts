import type { Actor } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef, ProjectId } from "@/core/domain/ids"

/**
 * Abstract permission boundary (spec §8D). This is OUR role model (D-15), not Rocketlane's.
 * Evaluated by the system before any policy check and before any write.
 */

export type PermissionAction = "complete_project" | "complete_task" | "log_time" | "read"

export type PermissionCheck = {
  readonly actorId: Actor["id"]
  readonly action: PermissionAction
  readonly target: EntityRef
  readonly permissionSource: "role-model@1"
  readonly allowed: boolean
  readonly reason: string
  readonly escalation: { readonly toActorId: Actor["id"]; readonly toName: string } | null
}

export interface PermissionEvaluator {
  check(
    actor: Actor,
    action: PermissionAction,
    target: EntityRef,
    graph: WorkspaceGraph,
  ): PermissionCheck
}

export class RoleBasedPermissions implements PermissionEvaluator {
  check(
    actor: Actor,
    action: PermissionAction,
    target: EntityRef,
    graph: WorkspaceGraph,
  ): PermissionCheck {
    const projectIdOfTarget = projectOf(target, graph)
    const project = projectIdOfTarget ? graph.project(projectIdOfTarget) : null
    const isOwner = project !== null && project.ownerId === actor.id
    const isMember =
      project !== null &&
      (actor.projectIds.includes(project.id) || project.teamMemberIds.includes(actor.id))
    const escalation =
      project?.ownerId && project.ownerId !== actor.id
        ? { toActorId: project.ownerId, toName: project.ownerName ?? project.ownerId }
        : null

    const base = { actorId: actor.id, action, target, permissionSource: "role-model@1" as const }

    if (action === "read")
      return { ...base, allowed: true, reason: "read access is open", escalation: null }
    if (!project)
      return { ...base, allowed: false, reason: "target project not found", escalation: null }

    switch (action) {
      case "complete_project":
        return isOwner
          ? { ...base, allowed: true, reason: "project owner", escalation: null }
          : {
              ...base,
              allowed: false,
              reason: "only the project owner can complete a project",
              escalation,
            }
      case "complete_task":
      case "log_time": {
        if (isOwner) return { ...base, allowed: true, reason: "project owner", escalation: null }
        if (isMember && target.kind === "task") {
          const task = graph.task(target.id)
          const assigned = task?.assigneeNames.some((n) => n === actor.name) ?? false
          return assigned
            ? { ...base, allowed: true, reason: "assigned team member", escalation: null }
            : {
                ...base,
                allowed: false,
                reason: "team members can only act on tasks assigned to them",
                escalation,
              }
        }
        return { ...base, allowed: false, reason: "not a member of this project", escalation }
      }
    }
  }
}

function projectOf(target: EntityRef, graph: WorkspaceGraph): ProjectId | null {
  switch (target.kind) {
    case "project":
      return target.id
    case "task":
      return graph.task(target.id)?.projectId ?? null
    case "phase":
      return graph.phase(target.id)?.projectId ?? null
  }
}
