"use client"

import { useState } from "react"

import { Body } from "@/components/shared/Typography"
import { Button } from "@/components/ui/button"
import {
  actorId as toActorId,
  projectId as toProjectId,
  taskId as toTaskId,
} from "@/core/domain/ids"
import type { TaskStatus } from "@/core/domain/status"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

/**
 * The world changes under a live mission. This is the single-screen fallback for the course-
 * correction demo; a second browser tab does the same through BroadcastChannel (D-23).
 */
export function LabWorldTab() {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const graph = snapshot.graph
  const [projectId, setProjectId] = useState<string>("")
  const [taskId, setTaskId] = useState<string>("")
  const [actorId, setActorId] = useState<string>("")
  const [status, setStatus] = useState<TaskStatus>("COMPLETED")
  const [fault, setFault] = useState<"timeout_once" | "fail_once">("timeout_once")
  const [last, setLast] = useState<string | null>(null)

  if (!graph)
    return (
      <Body muted className="pt-4 text-[13px]">
        Loading workspace…
      </Body>
    )

  const project = graph.project(toProjectId(projectId || graph.projects[0]?.id || ""))
  const tasks = project ? graph.tasksOf(project.id) : []
  const task = graph.task(toTaskId(taskId || tasks[0]?.id || ""))
  const actor = graph.actor(
    toActorId(
      actorId ||
        graph.actors.find((a) => a.id !== snapshot.actorId)?.id ||
        graph.actors[0]?.id ||
        "",
    ),
  )

  const apply = async () => {
    if (!task || !actor) return
    await runtime.worldWrite(
      { kind: "set_task_status", taskId: task.id, status },
      actor.id,
      `set to ${status.toLowerCase().replace("_", " ")}`,
    )
    setLast(`${actor.name} set ${task.name} to ${status}`)
  }

  const inject = () => {
    if (!task) return
    runtime.injectFault({ kind: fault, match: { ref: { kind: "task", id: task.id } } })
    setLast(`${fault} armed on the next write to ${task.name}`)
  }

  const select =
    "border-border bg-background text-foreground h-8 rounded-md border px-2 text-[13px]"

  return (
    <div className="flex flex-col gap-6 pt-4">
      <section className="border-border flex flex-col gap-3 rounded-lg border p-4">
        <span className="text-foreground text-[13px] font-medium">
          Change the world as someone else
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={select}
            value={project?.id ?? ""}
            onChange={(e) => {
              setProjectId(e.target.value)
              setTaskId("")
            }}
            aria-label="Project"
          >
            {graph.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className={select}
            value={task?.id ?? ""}
            onChange={(e) => setTaskId(e.target.value)}
            aria-label="Task"
          >
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.status.toLowerCase().replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            className={select}
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            aria-label="New status"
          >
            {(["COMPLETED", "IN_PROGRESS", "TODO", "BLOCKED", "NA"] as const).map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase().replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            className={select}
            value={actor?.id ?? ""}
            onChange={(e) => setActorId(e.target.value)}
            aria-label="Acting as"
          >
            {graph.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => void apply()} disabled={!task || !actor}>
            Apply
          </Button>
        </div>
        <Body muted className="text-[12px]">
          Bypasses governance on purpose: this is not the agent, it is the world. Any live mission
          that depends on this task pauses, explains the change, and replans. Open the mission in
          another tab to watch it happen.
        </Body>
      </section>

      <section className="border-border flex flex-col gap-3 rounded-lg border p-4">
        <span className="text-foreground text-[13px] font-medium">
          Arm a fault on the next agent write
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={select}
            value={fault}
            onChange={(e) => setFault(e.target.value as typeof fault)}
            aria-label="Fault"
          >
            <option value="timeout_once">timeout once (write applies, response lost)</option>
            <option value="fail_once">fail once (write rejected)</option>
          </select>
          <span className="text-muted-foreground text-[12px]">on {task?.name ?? "—"}</span>
          <Button size="sm" variant="outline" onClick={inject} disabled={!task}>
            Arm
          </Button>
        </div>
        <Body muted className="text-[12px]">
          A timeout is genuinely ambiguous. The agent re-reads before retrying and never duplicates
          a write; the thread shows the reconciliation.
        </Body>
      </section>

      {last && (
        <Body muted className="text-[12px]">
          Last: {last}
        </Body>
      )}
    </div>
  )
}
