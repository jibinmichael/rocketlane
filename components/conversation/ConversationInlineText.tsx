"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"

import { LinearIcon, type LinearIconName } from "@/components/shared/LinearIcon"
import type { Inline } from "@/core/agent/conversation/blocks"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { ProjectId } from "@/core/domain/ids"
import { isTaskComplete } from "@/core/domain/status"
import { useRuntimeSnapshot } from "@/hooks/use-runtime"
import { avatarFor } from "@/lib/avatar"
import { cn } from "@/lib/utils"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const MS_PER_CHAR = 28

const KIND_ICON: Record<string, LinearIconName> = {
  project: "network",
  phase: "two-flags",
  task: "issues",
}

/** Characters a part occupies in the typing budget; chips count as one beat. */
function weight(part: Inline): number {
  return part.kind === "text" ? part.text.length : 3
}

/**
 * Types a line in at a steady beat once `startDelayMs` has passed. The copy is already final when
 * this runs; only its appearance is paced.
 */
function useTypewriter(total: number, active: boolean, startDelayMs: number) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const start = performance.now() + startDelayMs
    const tick = (now: number) => {
      const n = Math.max(0, Math.min(total, Math.floor((now - start) / MS_PER_CHAR)))
      setCount(n)
      if (n < total) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [total, active, startDelayMs])
  return active ? count : total
}

/**
 * Renders a template line. Entity slots become grey chips with a kind glyph (ClickUp Brain's
 * inline object token) so project content is visibly data, never agent prose (spec §17). No
 * markdown parsing anywhere. With `typing`, the line writes itself in.
 */
export function ConversationInlineText({
  line,
  className,
  typing = false,
  startDelayMs = 0,
}: {
  line: readonly Inline[]
  className?: string
  typing?: boolean
  startDelayMs?: number
}) {
  const total = line.reduce((n, p) => n + weight(p), 0)
  const shown = useTypewriter(total, typing, startDelayMs)
  const { actors, graph } = useRuntimeSnapshot()
  const offsets = line.reduce<number[]>((acc, part) => {
    acc.push((acc[acc.length - 1] ?? 0) + weight(part))
    return acc
  }, [])

  return (
    <span className={cn("text-foreground text-[15px] leading-[22px]", className)}>
      {line.map((part, i) => {
        const from = (offsets[i] ?? 0) - weight(part)
        if (typing && from >= shown) return null
        switch (part.kind) {
          case "text": {
            const text = typing ? part.text.slice(0, Math.max(0, shown - from)) : part.text
            return <PeopleText key={i} text={text} actors={actors} />
          }
          case "entity": {
            const icon = KIND_ICON[part.ref.kind] ?? "issues"
            const chip = (
              <span
                className="bg-muted text-foreground mx-px inline-block rounded-full px-2 align-baseline text-[13px] leading-[20px] font-medium whitespace-nowrap"
                data-entity={`${part.ref.kind}:${part.ref.id}`}
              >
                <LinearIcon
                  name={icon}
                  className="text-muted-foreground mr-1 inline size-3 align-[-1.5px]"
                />
                {part.label}
              </span>
            )
            return part.ref.kind === "project" ? (
              <ProjectHover key={i} id={part.ref.id} graph={graph}>
                {chip}
              </ProjectHover>
            ) : (
              <span key={i} title={part.label}>
                {chip}
              </span>
            )
          }
          case "policy":
            return (
              <span
                key={i}
                className="text-muted-foreground border-border ml-1 inline rounded-full border px-1.5 py-px text-[11px] font-medium"
                data-policy={part.policyId}
              >
                {part.label}
              </span>
            )
          case "count":
            return (
              <span key={i} className="font-medium tabular-nums">
                {part.value}
              </span>
            )
          case "time":
            return (
              <span key={i} className="tabular-nums">
                {timeFormat.format(new Date(part.at))}
              </span>
            )
        }
      })}
      {typing && shown > 0 && shown < total && (
        <span
          aria-hidden
          className="bg-foreground/70 ml-px inline-block h-[14px] w-px align-[-2px]"
        />
      )}
    </span>
  )
}

/** Total typing time of a line, so the next line can start after it. */
export function lineTypingMs(line: readonly Inline[]): number {
  return line.reduce((n, p) => n + weight(p), 0) * MS_PER_CHAR
}

/**
 * A person named in agent copy carries their portrait before the name, everywhere in the stream
 * (the same mapping the turn headers use). Names come from the workspace's people list.
 */
function PeopleText({
  text,
  actors,
}: {
  text: string
  actors: readonly { readonly id: string; readonly name: string }[]
}) {
  const pattern = useMemo(() => {
    const names = actors.map((a) => a.name).filter((n) => n.length > 2)
    if (names.length === 0) return null
    const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    return new RegExp(`(${escaped.join("|")})`)
  }, [actors])
  if (!pattern) return <>{text}</>
  const parts = text.split(pattern)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((chunk, i) => {
        const index = actors.findIndex((a) => a.name === chunk)
        if (index < 0) return <span key={i}>{chunk}</span>
        return (
          <span key={i} className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <Image
              src={avatarFor(index)}
              alt=""
              width={14}
              height={14}
              className="inline-block size-3.5 self-center rounded-full object-cover"
            />
            {chunk}
          </span>
        )
      })}
    </>
  )
}

/** The project's macro facts on hover: who owns it, where it stands, what is left. */
function ProjectHover({
  id,
  graph,
  children,
}: {
  id: ProjectId
  graph: WorkspaceGraph | null
  children: React.ReactNode
}) {
  const project = graph?.project(id) ?? null
  if (!project || !graph) return <>{children}</>
  const tasks = graph.tasksOf(project.id)
  const milestones = graph.milestonesOf(project.id)
  const openTasks = tasks.filter((t) => !isTaskComplete(t.status)).length
  const doneMilestones = milestones.filter((t) => isTaskComplete(t.status)).length
  const facts: [string, string][] = [
    ["Owner", project.ownerName ?? "Unassigned"],
    ["Status", project.rawStatus.toLowerCase()],
    ["Milestones", `${doneMilestones} of ${milestones.length} complete`],
    ["Tasks", `${openTasks} open of ${tasks.length}`],
  ]
  if (project.customerName) facts.unshift(["Customer", project.customerName])
  if (project.dueDate) facts.push(["Due", project.dueDate])
  return (
    <span className="group/project relative inline-block">
      <span tabIndex={0} className="cursor-help rounded-full outline-none">
        {children}
      </span>
      <span
        role="tooltip"
        className="bg-card text-card-foreground border-border pointer-events-none absolute top-full left-0 z-30 mt-1.5 hidden w-max max-w-[320px] flex-col gap-1 rounded-lg border px-3 py-2 text-[12px] shadow-[var(--shadow-lg)] group-focus-within/project:flex group-hover/project:flex"
      >
        <span className="text-foreground font-medium">{project.name}</span>
        {facts.map(([k, v]) => (
          <span key={k} className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-muted-foreground w-20 shrink-0">{k}</span>
            <span className="text-foreground">{v}</span>
          </span>
        ))}
      </span>
    </span>
  )
}
