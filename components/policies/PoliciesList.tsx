import { Body, H1 } from "@/components/shared/Typography"
import { POLICY_SET_VERSION, SUPPLIED_POLICIES } from "@/core/governance/policies/supplied-policies"
import type { PolicyId } from "@/core/governance/policy"

const LABEL: Record<PolicyId, string> = {
  P1_PROJECT_MILESTONES: "Policy 1",
  P2_MILESTONE_SUBTASKS: "Policy 2",
  P3_TASK_PREDECESSORS: "Policy 3",
  P4_TASK_TIME: "Policy 4",
}

const ASSUMPTIONS = [
  { id: "A-01", text: "A task in status NA counts as closed for policies 1–3.", value: "closed" },
  { id: "A-02", text: "Time logged means hours recorded on the task itself.", value: "task only" },
  { id: "A-04", text: "A milestone's open subtasks are its direct children.", value: "direct" },
  {
    id: "A-05",
    text: "Completing a project is high impact and asks for confirmation.",
    value: "confirm",
  },
] as const

/** Ground control (spec §25): the four supplied policies, their versions, and our interpretation switches. */
export function PoliciesList() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <H1 className="text-[20px] tracking-[-0.01em]">Policies</H1>
        <Body muted className="text-[13px]">
          The governance rules the agent enforces. These four come from the brief; the agent cannot
          add, skip or reinterpret them. Policy set {POLICY_SET_VERSION}.
        </Body>
      </div>
      <ul className="border-border divide-border divide-y rounded-lg border">
        {SUPPLIED_POLICIES.map((p) => (
          <li key={p.id} className="flex items-start gap-4 px-4 py-3">
            <span className="text-muted-foreground border-border mt-0.5 shrink-0 rounded-[4px] border px-1 text-[11px] font-medium">
              {LABEL[p.id]}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-foreground text-[13px] font-medium">{p.name}</span>
              <span className="text-muted-foreground text-[12px]">
                Trigger: {p.trigger.targetKind} → Completed
                {p.trigger.when ? " (milestones only)" : ""} · Validation: {p.rule} · Blocking
              </span>
            </div>
            <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
              v{p.version}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <h2 className="text-muted-foreground px-1 text-[11px] font-medium tracking-[0.005em] uppercase">
          Interpretation switches (ours, not Rocketlane&apos;s)
        </h2>
        <ul className="border-border divide-border divide-y rounded-lg border">
          {ASSUMPTIONS.map((a) => (
            <li key={a.id} className="flex items-center gap-4 px-4 py-2.5">
              <span className="text-muted-foreground w-10 shrink-0 text-[11px] tabular-nums">
                {a.id}
              </span>
              <span className="text-foreground flex-1 text-[13px]">{a.text}</span>
              <span className="bg-muted text-foreground rounded-[4px] px-1.5 py-px text-[12px]">
                {a.value}
              </span>
            </li>
          ))}
        </ul>
        <Body muted className="px-1 text-[12px]">
          Defaults documented in docs/agent-context/03-decisions-locked.md. Changing one changes the
          policy set version.
        </Body>
      </div>
    </div>
  )
}
