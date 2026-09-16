# Demo script

Twelve minutes. Every beat is a real engine event; nothing is staged. Have two browser tabs open on `http://localhost:3000`.

## Before you start

```bash
pnpm dev
```

Open **Test Lab → Dataset → Reset to original** so the demo workspace is clean. Acting user should read **Priya Raman** in the left nav. If `ANTHROPIC_API_KEY` is in `.env.local`, the band will say "Interpreted by model" after each turn; without it, the deterministic interpreter runs and nothing else changes.

## 1. The hero (Governance Agent)

Type: **Mark Acme Implementation as completed.**

What to say: the agent resolved the project, checked the four policies, and found it cannot complete yet. It traced the blocker three levels deep and shows only the shortest useful path. Point at the policy chips: every reason maps to one supplied policy. Click **Show full path** to prove the depth is available, not dumped.

It asks for one thing it cannot invent: hours on QA Complete. Type **2** in the field, **Log time**.

Watch six updates verify in dependency order. The band moves from 0 of 6 to 5 of 6. Then the high-impact confirmation, in the thread, with the consequence stated: one task remains open and does not block under current policies. **Complete project.**

Landed. **View activity** shows who, what, why, when, result, verified.

## 2. Course correction (two tabs)

Tab one: type **complete acme** on a fresh dataset (Test Lab → Reset first, or use Beacon Rollout instead). Stop when it asks for hours.

Tab two: **Test Lab → World**. Project Acme Implementation, task Train admins, status completed, acting as Mei Tanaka. **Apply.**

Tab one, hands off the keyboard: the mission pauses. "Acme Implementation changed while I was working. I paused before the next update." What changed, what it affects. **Continue.** Replanned: 5 of 6 updates still apply; the world already did one.

Single-screen fallback: **Test Lab → Scenarios → Play** on "Mid-flight change".

## 3. Interruption

Type **complete Beacon Rollout**. It runs straight to the project confirmation because Beacon has time logged everywhere. Type **actually leave Handover open**. The agent stops, records the scope change, and reports honestly that Handover had already been verified complete before you spoke. Nothing is reverted, because no policy grants reopen authority.

## 4. Verification is real

**Test Lab → World**: arm **timeout once** on Deploy API. Back in the agent: **complete acme**, **2**, and watch the reconciliation beat: "The write to Deploy API timed out. I re-read it: it had applied." Zero retries, one ledger entry.

## 5. Test Lab: the system, not the demo

**Dataset → Load Rocketlane export.** Read the ingestion report: 31 projects, 325 tasks, 76 completed tasks with no time logged, a duplicate task name, 28 projects without tasks. Nothing hidden.

**Scenarios → Run all 11.** All green in well under a second: hero, happy path, timeout, course correction, cancel, scope change, permission, already complete, ambiguity, boundary, and the real-export batch with its exact breakdown.

Now weaken the engine: click **P4 time**, then **Run** on the hero. The evaluator flags `no_policy_violation`: the engine completed QA Complete with no time logged, judged against the reference policies at write time. A regression record appears below with the diagnosis. Click **P4 time** again to restore.

## 6. Close

"The demo is one scenario. The system is the product." The same engine, the same policies, the same verification path ran the conversation and the Lab. The model, when present, only pointed at words in a sentence.

## If something goes wrong

- Blank workspace or stale state: **Test Lab → Dataset → Reset to original**.
- Colours missing after a code change: restart `pnpm dev` (Turbopack CSS chunk cache).
- Model interpreter slow: the band says "Interpreted locally" and the demo continues unchanged.
