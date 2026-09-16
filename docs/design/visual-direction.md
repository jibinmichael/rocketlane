# Visual direction (consolidated, 2026-09-16)

One direction for the last pass. Decided against the references the human holds, not invented.

## References and what was taken from each

| Reference | Take | Leave |
|---|---|---|
| **Wati "vibe" (jibinmichael/vibe, branch `updated-demo`, live at vibe-ashen-three.vercel.app)** | Composer mechanics: one rounded white surface, textarea on top, controls row below, attach on the left, trailing control on the right that swaps with a spring; rotating placeholder with Tab-to-fill; autogrow to a max height. Presence: two square eyes that blink, a soft blurred halo, breathing scale. Thinking copy that rotates in place (ours is driven by real session state, never a pool of jokes). 680px column, user messages as quiet grey pills on the right, assistant text with no bubble. Quick-action cards under the home composer. | Blue halo, mic, "Skills", star rating, WhatsApp vocabulary, Circular Std (Wati's brand font). |
| **ClickUp (and Brain)** | Tone: neutral grey chrome, white surfaces on an off-white canvas, 8–12px radii, one dark primary button, status as a small dot plus text. | Purple accent, gradients, dense sidebars. |
| **Linear** | Type discipline: 13/14px body, tight tracking on headings, hairline borders, hover-grey rows, chips as grey pills with a coloured dot. | Dark-first palette. |
| **Notion** | Calm density, generous vertical rhythm, text-first blocks, inline entity tokens that read as data. | Serif display, emoji icons. |
| **Zapier Agents, Linear agent demo, Rocketlane agentic PSA shots** | Needs-action first, attach and send inside the field, soft status chips in tables. | Template galleries, third-party app chips. |

## Decisions

- **Accent: none.** Neutral grey only. Colour is reserved for state dots and state icons (success, waiting, blocked, paused, error) at the restrained chroma already in the tokens. The indigo `--accent-brand` token is neutralised, not used.
- **Font: Avenir Next** (installed on the recording machine, no font files in the repo, not Wati's identity). System stack as fallback. Weights 400/500/600.
- **Dark mode: skipped** for this pass. Tokens stay defined, nothing is reviewed.
- **No left borders, no bubbles for the agent, no emoji anywhere.** Warnings and state use lucide icons at 14px, tone-coloured, subordinate to text.
- **Mascot:** `AgentPresence`. Two 5px square eyes, blink every 5s, neutral grey halo. The halo rotates only while the agent is working; it fades on landing; eyes rest half-closed while paused. It is the agent's face on the home page (60px) and the agent's marker on the thread's working row (16px). It never emotes beyond state.
- **Home is a peer-agent landing, not a form.** Vertically centred: presence, "Your projects are already moving. I'll help keep them on course.", support line, composer, four quick actions that map to real capabilities (complete the first project, what blocks it, complete my projects, test with project data), trust line, previous missions below the fold.
- **Composer** is one component on the home and the mission page: attach inside (opens "Test with project data" in place), trailing control swaps Send → Pause (Esc) → Resume by state, rotating placeholder only on the home.
- **Surfaces:** canvas `--background` off-white, `--card` white for composer, panels, dialogs; hairline `--border`; shadows only on the composer and floating layers.

## Order of work

1. Tokens: font, canvas, neutral accent, presence keyframes.
2. `AgentPresence`, composer, quick actions.
3. Home layout.
4. Mission page: band, working row, user pills, block typography, decision buttons, chips.
5. Workspace dialog and data panel surfaces.
6. Screenshots of every state; fix what reads wrong.
