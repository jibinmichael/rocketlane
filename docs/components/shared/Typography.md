# Typography

Canonical text components for the entire app. Every piece of user-facing text should flow through one of these — not raw `<p>`/`<h1>`/`<span>` with ad-hoc Tailwind classes.

**Domain:** shared
**File:** components/shared/Typography.tsx

---

## Purpose

Typography is the foundation of every screen. Rather than scattering `className="text-sm text-muted-foreground"` across hundreds of components, all text runs through typed React components tied to a single token scale in `app/globals.css`. Changing a token updates the whole app.

## When to use

- **Any user-facing text.** Body copy, headings, helper text, timestamps, labels — all of it.
- When composing a new domain component, reach for these before `<p>` or `<h2>`.

## When NOT to use

- **shadcn/ui primitives** (`components/ui/*`) — those already have their own typography baked in. Do not wrap their internal text in these components.
- **Single-word labels inside a button or badge** — if the shadcn primitive already owns the text styling, don't double-wrap.

## Components

| Component | Default tag | Usecase |
|---|---|---|
| `Display` | `h1` | Marketing hero, empty states, auth-screen headers |
| `H1` | `h1` | Page titles |
| `H2` | `h2` | Section titles |
| `H3` | `h3` | Card titles, form section headers |
| `Body` | `p` | Default paragraph, chat messages (`size="sm"` for dense UI) |
| `Caption` | `p` | Helper text below form fields, muted descriptions. Muted by default. |
| `Micro` | `span` | Timestamps, badges, metadata. Uses `tabular-nums` so digits don't jitter. Muted by default. |
| `Code` | `code` | Inline code |

## Props (all components except Code)

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `as` | `ElementType` | varies | Render as a different HTML tag (e.g. `<H1 as="h2">` renders visual H1 styling with `<h2>` semantics) |
| `muted` | `boolean` | `false` for headings/body, `true` for Caption/Micro | Render in muted foreground color |
| `className` | `string` | — | Escape hatch for one-off adjustments. Avoid using this to override size/weight — that's a signal the token scale needs a new token. |
| `children` | `ReactNode` | — | The text content |

All other HTML attributes of the rendered element are passed through (e.g. `id`, `aria-*`, `onClick`).

## Example usage

```tsx
import { Body, Caption, H1, Micro } from "@/components/shared/Typography"

export function PricingPlanCard() {
  return (
    <div>
      <H1>Pro</H1>
      <Body>Everything in Free, plus team collaboration and priority support.</Body>
      <Caption>Billed annually at $240. Cancel anytime.</Caption>
      <Micro>Last updated 12:04 · 2h ago</Micro>
    </div>
  )
}
```

## Gotchas

- **Do not override `font-size` or `font-weight` via `className`.** If you need a size that doesn't exist, add a token to `app/globals.css` and extend this component — don't ad-hoc it.
- **`as` changes semantics, not styling.** `<H1 as="h2">` still looks like H1 (24px). Use when a visual H1 needs to be `<h2>` for document outline reasons (e.g. inside a card that's nested under the page H1).
- **`Micro` uses `tabular-nums` by default.** If you have a design reason to disable it (rare), override via `className="[font-variant-numeric:normal]"`.
- **No italic variant.** Italic uses the browser's synthesized oblique style from the system font. If you need real italic, that's a custom-font conversation.

## Accessibility

- Semantic tags are preserved — `<H1>` renders `<h1>` by default so screen readers get the outline.
- Never use `Display` or `H1`/`H2`/`H3` purely for styling on non-heading text. Use `<Body>` with a `className` if you genuinely need large body text (rare, and a signal that the scale may need a new token).
- `Code` inherits its container's color; put it inside elements with sufficient contrast.

## Related

- Tokens defined in: `app/globals.css` under `@theme inline`
- Spec reference: Linear-calibrated scale, system font stack, sharp radii
- Future: a chat-specific wrapper (`ChatTypography.tsx`) will compose these for `Timestamp`, `ThinkingIndicator`, `StreamingCursor` — deferred until chat UI is built.
