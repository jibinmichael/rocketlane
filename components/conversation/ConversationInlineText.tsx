import { LinearIcon, type LinearIconName } from "@/components/shared/LinearIcon"
import type { Inline } from "@/core/agent/conversation/blocks"
import { cn } from "@/lib/utils"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

const KIND_ICON: Record<string, LinearIconName> = {
  project: "layers",
  phase: "two-flags",
  task: "issues",
}

/**
 * Renders a template line. Entity slots become grey chips with a kind glyph (ClickUp Brain's
 * inline object token) so project content is visibly data, never agent prose (spec §17). No
 * markdown parsing anywhere.
 */
export function ConversationInlineText({
  line,
  className,
}: {
  line: readonly Inline[]
  className?: string
}) {
  return (
    <span className={cn("text-foreground text-[14px] leading-[1.6]", className)}>
      {line.map((part, i) => {
        switch (part.kind) {
          case "text":
            return <span key={i}>{part.text}</span>
          case "entity": {
            const icon = KIND_ICON[part.ref.kind] ?? "issues"
            return (
              <span
                key={i}
                className="bg-muted text-foreground mx-px inline-flex items-center gap-1 rounded-[5px] px-1.5 py-px align-baseline text-[13px] font-medium"
                title={part.label}
                data-entity={`${part.ref.kind}:${part.ref.id}`}
              >
                <LinearIcon name={icon} className="text-muted-foreground size-3" />
                {part.label}
              </span>
            )
          }
          case "policy":
            return (
              <span
                key={i}
                className="text-muted-foreground border-border ml-1 inline rounded-[4px] border px-1 py-px text-[11px] font-medium tracking-[0.005em]"
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
    </span>
  )
}
