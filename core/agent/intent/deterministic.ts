import type {
  IntentInterpreter,
  IntentProposal,
  InterpretationContext,
  Span,
} from "@/core/agent/intent/intent"

/**
 * Closed-grammar interpreter. The default, the fallback, and the oracle the Lab compares the model
 * against. It only ever points at spans of the utterance; it has no knowledge beyond the grammar.
 */

type Rule = {
  readonly pattern: RegExp
  readonly build: (
    match: RegExpMatchArray,
    utterance: string,
  ) => Omit<IntentProposal, "source" | "confidence">
}

const noTarget = (kind: IntentProposal["kind"]) => ({
  kind,
  targetSpans: [],
  hours: null,
  all: false,
  mine: false,
})

function spanOf(match: RegExpMatchArray, groupIndex: number, utterance: string): Span[] {
  const text = match[groupIndex]
  if (!text) return []
  const raw = text.trim()
  if (raw.length === 0) return []
  const start = utterance.toLowerCase().indexOf(raw.toLowerCase(), match.index ?? 0)
  if (start === -1) return []
  return [{ start, end: start + raw.length }]
}

const TRAILING_NOISE = /\s+(as\s+)?(completed?|done|closed|finished)\s*\.?$/i
const LEADING_ARTICLE = /^(the|this|that|project|task)\s+/i

function cleanTargetText(text: string): string {
  return text
    .replace(TRAILING_NOISE, "")
    .replace(LEADING_ARTICLE, "")
    .replace(/[.!?]+$/, "")
    .trim()
}

function targetSpan(match: RegExpMatchArray, groupIndex: number, utterance: string): Span[] {
  const spans = spanOf(match, groupIndex, utterance)
  const span = spans[0]
  if (!span) return []
  const text = utterance.slice(span.start, span.end)
  const cleaned = cleanTargetText(text)
  if (cleaned.length === 0) return []
  const offset = text.toLowerCase().indexOf(cleaned.toLowerCase())
  const start = span.start + Math.max(offset, 0)
  return [{ start, end: start + cleaned.length }]
}

const APPROVE_WORD =
  "(?:yes|yep|yeah|sure|approve|approved|confirm|confirmed|do\\s+it|go\\s+ahead|okay|ok|complete\\s+it|complete\\s+the\\s+project|run\\s+(?:it|them|the\\s+updates?))"
const COURTESY = "(?:please|thanks|thank\\s+you)"

const RULES: readonly Rule[] = [
  { pattern: /^\s*(stop|cancel|abort|never\s?mind|halt)\b/i, build: () => noTarget("cancel") },
  { pattern: /^\s*(pause|hold\s+on|hold|wait)\b/i, build: () => noTarget("pause") },
  {
    pattern: /^\s*(continue|resume|go\s+on|proceed|carry\s+on|keep\s+going)\b/i,
    build: () => noTarget("continue"),
  },
  {
    // One or two distinct approve words ("yes, do it"), an optional courtesy. "yes yes yes" is not a
    // clean approval and stays unsupported.
    pattern: new RegExp(
      `^\\s*(${APPROVE_WORD})(?:\\s*,?\\s+(${APPROVE_WORD}))?(?:\\s*,?\\s+${COURTESY})?\\s*[.!]?\\s*$`,
      "i",
    ),
    build: (m) =>
      m[2] && m[1]?.toLowerCase() === m[2].toLowerCase()
        ? noTarget("unsupported")
        : noTarget("approve"),
  },
  {
    pattern: /^\s*(no|nope|not\s+now|decline|don'?t|do\s+not|leave\s+it)\s*[.!]?\s*$/i,
    build: () => noTarget("decline"),
  },
  {
    // "2 hours each" while the mission is asking: the same hours for every task that still needs
    // them, each still validated, permission-checked and verified on its own.
    pattern:
      /^\s*(?:log|add|record|book)?\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)?\s+(?:each|apiece|for\s+(?:all|each|every)\b.*|on\s+(?:all|each|every)\b.*|to\s+(?:all|each|every)\b.*|all\s+of\s+them|all)\s*[.!]?\s*$/i,
    build: (m) => ({
      kind: "log_time",
      targetSpans: [],
      hours: Number.parseFloat(m[1]!),
      all: true,
      mine: false,
    }),
  },
  {
    pattern:
      /(?:log|add|record|book)\s+(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s+(?:on|to|for|against)\s+(.+)$/i,
    build: (m, u) => ({
      kind: "log_time",
      targetSpans: targetSpan(m, 2, u),
      hours: Number.parseFloat(m[1]!),
      all: false,
      mine: false,
    }),
  },
  {
    pattern: /^\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s+(?:on|to|for)\s+(.+)$/i,
    build: (m, u) => ({
      kind: "log_time",
      targetSpans: targetSpan(m, 2, u),
      hours: Number.parseFloat(m[1]!),
      all: false,
      mine: false,
    }),
  },
  {
    // "log 2 hours" while the mission is asking: the target is the pending step.
    pattern:
      /^\s*(?:log|add|record|book)\s+(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)?\s*[.!]?\s*$/i,
    build: (m) => ({
      kind: "log_time",
      targetSpans: [],
      hours: Number.parseFloat(m[1]!),
      all: false,
      mine: false,
    }),
  },
  {
    pattern: /^\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)?\s*[.!]?\s*$/i,
    build: (m) => ({
      kind: "log_time",
      targetSpans: [],
      hours: Number.parseFloat(m[1]!),
      all: false,
      mine: false,
    }),
  },
  {
    pattern: /(?:actually\s+)?(?:leave|keep)\s+(.+?)\s+(?:open|as\s+is|alone|untouched)\b/i,
    build: (m, u) => ({
      kind: "change_scope",
      targetSpans: targetSpan(m, 1, u),
      hours: null,
      all: false,
      mine: false,
    }),
  },
  {
    pattern: /(?:skip|exclude|don'?t\s+(?:complete|touch|close))\s+(.+)$/i,
    build: (m, u) => ({
      kind: "change_scope",
      targetSpans: targetSpan(m, 1, u),
      hours: null,
      all: false,
      mine: false,
    }),
  },
  {
    pattern: /(?:every|each)\s+(?:morning|day|hour|evening)|daily|routine/i,
    build: (_m, u) => {
      const target = u.match(
        /(?:check|watch|monitor)\s+(?:on\s+)?(.+?)(?:\s+(?:every|each|daily)|$)/i,
      )
      return {
        kind: "create_routine",
        targetSpans: target ? targetSpan(target, 1, u) : [],
        hours: null,
        all: false,
        mine: false,
      }
    },
  },
  {
    pattern: /^\s*(?:why|what(?:'?s|\s+is)\s+blocking|what\s+blocks|explain)\b\s*(.*)$/i,
    build: (m, u) => ({
      kind: "explain_blocker",
      targetSpans: targetSpan(m, 1, u),
      hours: null,
      all: false,
      mine: false,
    }),
  },
  {
    pattern:
      /\b(?:show|full|whole|entire)\s+(?:the\s+)?(?:path|dependencies|dependency\s+chain|chain)\b/i,
    build: () => noTarget("show_path"),
  },
  {
    // A person asking what this is: answered in context, never with a capability disclaimer.
    pattern:
      /^\s*(?:hi|hello|hey|help|what\s+(?:all\s+)?can\s+you\s+(?:do|help)|what\s+can\s+you\s+help\s+(?:me\s+)?with|what\s+can\s+i\s+do(?:\s+here)?|what\s+do\s+you\s+do|how\s+do(?:es)?\s+(?:this|it|you)\s+work|who\s+are\s+you|what\s+is\s+this|what\s+are\s+you(?!\s+doing))\b/i,
    build: () => noTarget("help"),
  },
  {
    // "my projects" narrows to what the actor owns; it never widens to the workspace.
    pattern:
      /\b(?:mark|complete|close(?:\s+out)?|finish|wrap\s+up|set)\s+(?:all\s+(?:of\s+)?)?(?:my\s+projects|the\s+projects\s+I\s+own|projects\s+I\s+own|everything\s+I\s+own)\b/i,
    build: () => ({
      kind: "complete_target",
      targetSpans: [],
      hours: null,
      all: true,
      mine: true,
    }),
  },
  {
    pattern:
      /\b(?:mark|complete|close(?:\s+out)?|finish|wrap\s+up|set)\s+(?:all\s+(?:the\s+)?projects|every\s+project|all\s+of\s+them)\b/i,
    build: () => ({
      kind: "complete_target",
      targetSpans: [],
      hours: null,
      all: true,
      mine: false,
    }),
  },
  {
    // "get X over the line", "get X done", "bring X to completion": the same outcome, said loosely.
    pattern:
      /\b(?:get|bring|take|push)\s+(.+?)\s+(?:over\s+the\s+line|across\s+the\s+line|done|finished|to\s+(?:completed?|completion|done)|live)\s*[.!?]?\s*$/i,
    build: (m, u) => ({
      kind: "complete_target",
      targetSpans: targetSpan(m, 1, u),
      hours: null,
      all: false,
      mine: false,
    }),
  },
  {
    pattern:
      /\b(?:mark|complete|close(?:\s+out)?|finish|wrap\s+up|set)\s+(.+?)(?:\s+(?:as\s+)?(?:completed?|done|closed|finished))?\s*[.!]?\s*$/i,
    build: (m, u) => ({
      kind: "complete_target",
      targetSpans: targetSpan(m, 1, u),
      hours: null,
      all: false,
      mine: false,
    }),
  },
  {
    // Last, so a task or project whose name contains "status" is still a target, not a question.
    pattern:
      /\b(?:status|where\s+are\s+we|where\s+is\s+it|progress|what\s+remains|what'?s\s+left|what\s+are\s+you\s+doing|what'?s\s+happening|what\s+is\s+happening)\b/i,
    build: () => noTarget("show_status"),
  },
]

export class DeterministicInterpreter implements IntentInterpreter {
  interpret(utterance: string, ctx: InterpretationContext): IntentProposal {
    const text = utterance.trim()
    for (const rule of RULES) {
      const match = text.match(rule.pattern)
      if (!match) continue
      const built = rule.build(match, text)
      // A bare number only means hours when the mission is waiting for hours.
      if (
        built.kind === "log_time" &&
        built.targetSpans.length === 0 &&
        ctx.pendingDecision !== "input"
      )
        continue
      // Approve/decline only make sense while something is pending.
      if ((built.kind === "approve" || built.kind === "decline") && ctx.pendingDecision === null) {
        if (built.kind === "approve" && /complete/i.test(text)) continue
        return { ...noTarget("unsupported"), source: "deterministic", confidence: 0.6 }
      }
      return { ...built, source: "deterministic", confidence: 0.9 }
    }
    return { ...noTarget("unsupported"), source: "deterministic", confidence: 0.5 }
  }
}
