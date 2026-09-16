import type { Inline } from "@/core/agent/conversation/blocks"
import { cn } from "@/lib/utils"

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

/**
 * Renders a template line. Entity slots become chips so project content is visibly data, never
 * agent prose (spec §17). No markdown parsing anywhere.
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
          case "entity":
            return (
              <span
                key={i}
                className="bg-muted/55 text-foreground inline rounded-[4px] px-1 py-px text-[13px] font-medium"
                title={part.label}
                data-entity={`${part.ref.kind}:${part.ref.id}`}
              >
                {part.label}
              </span>
            )
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
