"use client"

import { useEffect, useId, useRef, useState } from "react"

import { LinearIcon } from "@/components/shared/LinearIcon"
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
  "border-border bg-card text-foreground hover:bg-muted h-8 max-w-full rounded-lg border px-2 text-[13px] transition-colors duration-[var(--motion-fast)]"

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
        className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors duration-[var(--motion-fast)]"
      >
        <span className="text-foreground">{actor?.name ?? "Workspace"}</span>
        <span className="text-muted-foreground hidden text-[12px] sm:inline">
          · {snapshot.datasetLabel || "loading"}
        </span>
        <LinearIcon name="chevron-down" className="size-3" />
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Workspace"
          className="border-border bg-card text-card-foreground absolute top-full right-0 z-30 mt-2 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border p-4 shadow-[var(--shadow-lg)]"
        >
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-1.5">
              <label
                htmlFor={`${panelId}-actor`}
                className="text-muted-foreground text-[12px] font-medium"
              >
                Acting as
                <Help text="The agent only does what this person may do. Roles are owner, member and viewer." />
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
            </section>

            <section className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-[12px] font-medium">
                Project data · {snapshot.datasetLabel || "—"}
                <Help text="Which export the agent works against. The brief's Rocketlane export is the default; the demo workspace holds the deliberate four-level cascade." />
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
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
                  className="rounded-full"
                  onClick={() =>
                    void loadFixture("rocketlane-export").then((f) =>
                      runtime.loadCsv(f.id, f.projectsCsv, f.tasksCsv),
                    )
                  }
                >
                  Rocketlane export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => void runtime.resetDataset()}
                >
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
      <span className="text-muted-foreground text-[12px] font-medium">
        Simulate the outside world
        <Help text="Change a task as someone else, or arm a fault on the next write. A live mission that depends on it pauses, explains the change and replans." />
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
        <Button
          size="sm"
          className="rounded-full"
          onClick={() => void apply()}
          disabled={!task || !actor}
        >
          Apply
        </Button>
        <select
          className={select}
          value={fault}
          onChange={(e) => setFault(e.target.value as typeof fault)}
          aria-label="Fault"
        >
          <option value="timeout_once">Timeout once</option>
          <option value="fail_once">Fail once</option>
        </select>
        <Button size="sm" variant="outline" className="rounded-full" onClick={arm} disabled={!task}>
          Arm on next write
        </Button>
      </div>
      {last && <p className="text-muted-foreground text-[12px]">{last}</p>}
    </section>
  )
}

/** A quiet question mark with the explanation on hover or focus. */
function Help({ text }: { text: string }) {
  return (
    <span className="group/help relative ml-1 inline-flex align-middle">
      <span
        tabIndex={0}
        aria-label={text}
        className="text-muted-foreground/70 hover:text-foreground focus-visible:ring-ring/50 inline-flex size-4 items-center justify-center rounded-full outline-none focus-visible:ring-2"
      >
        <LinearIcon name="information" className="size-3.5" />
      </span>
      <span
        role="tooltip"
        className="bg-card text-foreground border-border pointer-events-none absolute top-full left-0 z-40 mt-1.5 hidden w-[260px] rounded-lg border px-3 py-2 text-[12px] leading-[1.45] font-normal shadow-[var(--shadow-lg)] group-focus-within/help:block group-hover/help:block"
      >
        {text}
      </span>
    </span>
  )
}
