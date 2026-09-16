declare const brand: unique symbol

export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type ProjectId = Brand<string, "ProjectId">
export type PhaseId = Brand<string, "PhaseId">
export type TaskId = Brand<string, "TaskId">
export type ActorId = Brand<string, "ActorId">
export type TimeEntryId = Brand<string, "TimeEntryId">

export const projectId = (raw: string): ProjectId => raw.trim() as ProjectId
export const phaseId = (raw: string): PhaseId => raw.trim() as PhaseId
export const taskId = (raw: string): TaskId => raw.trim() as TaskId
export const actorId = (raw: string): ActorId => raw.trim() as ActorId
export const timeEntryId = (raw: string): TimeEntryId => raw.trim() as TimeEntryId

export type EntityRef =
  | { readonly kind: "project"; readonly id: ProjectId }
  | { readonly kind: "phase"; readonly id: PhaseId }
  | { readonly kind: "task"; readonly id: TaskId }

export const refKey = (ref: EntityRef): string => `${ref.kind}:${ref.id}`
