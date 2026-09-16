"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

import type { FixtureLoader } from "@/components/shared/RuntimeProvider"
import { Button } from "@/components/ui/button"
import {
  actorId as toActorId,
  projectId as toProjectId,
  taskId as toTaskId,
} from "@/core/domain/ids"
import type { TaskStatus } from "@/core/domain/status"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

const select =
  "border-border bg-background text-foreground h-8 max-w-full rounded-md border px-2 text-[13px]"

/**
 * Workspace controls behind the acting user's name (final brief §4: minimal account/workspace
 * controls). Who the agent acts as, which project data is loaded, and, for evaluation, a way to
 * change the world as someone else or arm a fault on the next write. Operator affordances, not a
 * product destination: nothing here is navigation.
 */
export function WorkspaceMenu({ loadFixture }: { loadFixture: FixtureLoader }) {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const actor = snapshot.actors.find((a) => a.id === snapshot.actorId)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onDown)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        className="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors duration-[var(--motion-fast)]"
      >
        <span className="text-foreground">{actor?.name ?? "Workspace"}</span>
        <span className="text-muted-foreground hidden text-[12px] sm:inline">
          · {snapshot.datasetLabel || "loading"}
        </span>
        <ChevronDown aria-hidden className="size-3.5" strokeWidth={1.75} />
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Workspace"
          className="border-border bg-popover text-popover-foreground absolute top-full right-0 z-30 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border p-4 shadow-[var(--shadow-md)]"
        >
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-1.5">
              <label
                htmlFor={`${panelId}-actor`}
                className="text-muted-foreground text-[11px] font-medium tracking-[0.005em] uppercase"
              >
                Acting as
              </label>
              <select
                id={`${panelId}-actor`}
                className={select}
                value={snapshot.actorId ?? ""}
                onChange={(e) => runtime.setActor(toActorId(e.target.value))}
              >
                {snapshot.actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.role}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-[12px]">
                The agent only does what this person may do. Permissions are an abstract role
                boundary (owner, member, viewer).
              </p>
            </section>

            <section className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-[11px] font-medium tracking-[0.005em] uppercase">
                Project data · {snapshot.datasetLabel || "—"}
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void loadFixture("cascading-conflicts").then((f) =>
                      runtime.loadCsv(f.id, f.projectsCsv, f.tasksCsv),
                    )
                  }
                >
                  Demo workspace
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void loadFixture("rocketlane-export").then((f) =>
                      runtime.loadCsv(f.id, f.projectsCsv, f.tasksCsv),
                    )
                  }
                >
                  Rocketlane export
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void runtime.resetDataset()}>
                  Reset
                </Button>
              </div>
            </section>

            <OutsideWorld />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The world changes under a live mission. Not the agent: this bypasses governance on purpose so a
 * dependent mission pauses, explains the change and replans. A second browser tab does the same.
 */
function OutsideWorld() {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const graph = snapshot.graph
  const [projectId, setProjectId] = useState("")
  const [taskId, setTaskId] = useState("")
  const [actorId, setActorId] = useState("")
  const [status, setStatus] = useState<TaskStatus>("COMPLETED")
  const [fault, setFault] = useState<"timeout_once" | "fail_once">("timeout_once")
  const [last, setLast] = useState<string | null>(null)
  if (!graph) return null

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
    setLast(`${actor.name} set ${task.name} to ${status.toLowerCase().replace("_", " ")}`)
  }
  const arm = () => {
    if (!task) return
    runtime.injectFault({ kind: fault, match: { ref: { kind: "task", id: task.id } } })
    setLast(`${fault.replace("_", " ")} armed on the next write to ${task.name}`)
  }

  return (
    <section className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[11px] font-medium tracking-[0.005em] uppercase">
        Simulate the outside world
      </span>
      <div className="grid grid-cols-2 gap-2">
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
              {t.name}
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
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void apply()} disabled={!task || !actor}>
          Apply
        </Button>
        <select
          className={select}
          value={fault}
          onChange={(e) => setFault(e.target.value as typeof fault)}
          aria-label="Fault"
        >
          <option value="timeout_once">timeout once</option>
          <option value="fail_once">fail once</option>
        </select>
        <Button size="sm" variant="outline" onClick={arm} disabled={!task}>
          Arm on next write
        </Button>
      </div>
      <p className="text-muted-foreground text-[12px]">
        {last ?? "A live mission that depends on the task pauses, explains the change and replans."}
      </p>
    </section>
  )
}
