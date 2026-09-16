# Visual direction (consolidated, 2026-09-16)

One direction for the last pass. Decided against the references the human holds, not invented.

## References and what was taken from each

| Reference | Take | Leave |
|---|---|---|
| **Wati "vibe" (jibinmichael/vibe, branch `updated-demo`, live at vibe-ashen-three.vercel.app)** | Composer mechanics: one rounded white surface, textarea on top, controls row below, attach on the left, trailing control on the right that swaps with a spring; rotating placeholder with Tab-to-fill; autogrow to a max height. Thinking copy that rotates in place (ours is driven by real session state, never a pool of jokes). 680px column, user messages as quiet grey pills on the right, assistant text with no bubble. Quick-action cards under the home composer. | Blue halo, mic, "Skills", star rating, WhatsApp vocabulary, Circular Std (Wati's brand font). |
| **ClickUp (and Brain)** | Tone: neutral grey chrome, white surfaces on an off-white canvas, 8–12px radii, one dark primary button, status as a small dot plus text. | Purple accent, gradients, dense sidebars. |
| **Linear** | Type discipline: 13/14px body, tight tracking on headings, hairline borders, hover-grey rows, chips as grey pills with a coloured dot. | Dark-first palette. |
| **Notion** | Calm density, generous vertical rhythm, text-first blocks, inline entity tokens that read as data. | Serif display, emoji icons. |
| **Zapier Agents, Linear agent demo, Rocketlane agentic PSA shots** | Needs-action first, attach and send inside the field, soft status chips in tables. | Template galleries, third-party app chips. |

## Vibrance (decided with the ClickUp Brain² reference, 2026-09-16)

Four stops: Iris `#7B68EE` → Pink `#FF6EC7` → Amber `#FFB955` → Sky `#49CCF9`. Where they appear: the composer focus ring (soft iris), the active Send (lifted toward white), the Stop ring, the gradient glyphs and hover text on the suggested rows and chips, and the upload drop zone while a file hovers. Everything else neutral. Type scale from the Linear file: greeting 20, message body 15/22, rows and chips 13, secondary 12, meta 11.

## Decisions

- **Accent: none.** Neutral grey only. Colour is reserved for state dots and state icons (success, waiting, blocked, paused, error) at the restrained chroma already in the tokens. The indigo `--accent-brand` token is neutralised, not used.
- **Font: system UI stack** (-apple-system, SF Pro Text, Segoe UI, Roboto). No font files in the repo. Weights 400/500/600.
- **Dark mode: skipped** for this pass. Tokens stay defined, nothing is reviewed.
- **No left borders, no bubbles for the agent, no emoji anywhere.** Icons are the Linear Design System set (exported from the Figma community file, inlined with `currentColor`), muted grey by default; state colour appears only on step, path and timeline markers at reduced strength and on chips. The single lucide glyph left is Pause in the composer; the Stop ring's glyph is foreground on purpose.
- **Mark:** `AgentMark`, the compliance logo as a round, static disc (purple, white bracket, dot): the agent's avatar in the thread (20px), the face of the home (56px), the streaming marker and the favicon (`app/icon.svg`). No animation, no mood; state lives in the chips and markers, never in the mark.
- **Home is a peer-agent landing, not a form.** Vertically centred: presence, "Your projects are already moving. I'll help keep them on course.", support line, composer, four suggested rows that map to real capabilities (complete the first project the acting user owns, what blocks it, complete my projects, test with project files), trust line, recent missions (three by default, collapsible). "New chat" opens the same home in chat mode.
- **Composer** is one component on the home and the mission page: "Test any project files" inside on the left (opens the upload modal), trailing control grows from Send into the Stop ring while a turn is streaming or the engine is in flight (Esc does the same), then Resume while paused. Fixed placeholder "State an outcome."
- **Surfaces:** canvas `--background` off-white, `--card` white for composer, panels, dialogs; hairline `--border`; shadows only on the composer and floating layers.

## Order of work

1. Tokens: font, canvas, neutral accent, presence keyframes.
2. `AgentMark`, composer, quick actions.
3. Home layout.
4. Mission page: band, working row, user pills, block typography, decision buttons, chips.
5. Workspace dialog and data panel surfaces.
6. Screenshots of every state; fix what reads wrong.

## Chips and markers

One chip grammar everywhere (`StateChip`, `ArtifactStateChip`): a round filled dot on a softly tinted field, ink text. One marker grammar: the Linear circle set (ring pending, half-filled current, check done, close failed) at reduced strength, in step lists, the dependency path and the activity timeline. Decision receipts use the check glyph. No squares, no hand-drawn dots.

## Motion and pacing

Tokens only: `settle`, `crossfade`, `expand`, `springEnter`, `easeOut` from `lib/motion.ts`; folds use `HeightReveal`. Streaming is paced on purpose (the human's call, 2026-09-16): a block starts only after the previous one has finished typing or landing its steps, plus a beat; live lines type at 28ms per character; live steps land on `STEP_CADENCE_MS`. A mission opened from history renders whole.

