# Demo script

Twelve minutes. Every beat is a real engine event; nothing is staged. Have two browser tabs open on `http://localhost:3000`.

## Before you start

```bash
pnpm dev
```

Open the workspace menu (top right, your name) and **Reset** so the demo workspace is clean. The header should read **Priya Raman · Demo workspace**. If `ANTHROPIC_API_KEY` is in `.env.local`, the band will say "Interpreted by model" after each turn; without it, the deterministic interpreter runs and nothing else changes.

## 1. The hero

The home says "Your projects are already moving. I'll help keep them on course." No navigation to learn.

Type: **Mark Acme Implementation as completed.** (Try **Mark all my projects as completed.** afterwards: it resolves to the projects you own, never the whole workspace.)

What to say: it acknowledges the goal, then you watch real work: checking project, milestones, governance (4 policies), tracing dependencies. Every row is an event in the audit log; nothing is simulated. It found it cannot complete yet, traced the blocker three levels deep and shows only the shortest useful path. Point at the policy chips: every reason maps to one supplied policy. Click **Show full path** to prove the depth is available, not dumped.

It asks for one thing it cannot invent, in the conversation: "QA Complete has no logged time. Policy 4 requires hours before completion. How many hours should I log for QA Complete?" and says whose task it is and whose time it will be. Try **two hours** first: it refuses to guess and re-states the ask. Then reply **2 hours**.

It acknowledges the answer ("Got it — 2 hours for QA Complete. I'll log that, verify it, and continue with the original goal."), then you watch it log time, verify it, recheck dependencies and verify five updates with no further questions. The band says what it is doing, never how many operations are left. Then the high-impact confirmation, in the thread, with the consequence stated: one task remains open and does not block under current policies. **Complete project.**

Landed: one outcome line, compact evidence, **View activity**. Finished phases fold to one sentence each. Then **View evaluation evidence**: governance, authorization, verification, scope and final state, judged from the log and a fresh read. Back on the home, the mission sits under **Previous missions** with its outcome; click it to reopen the whole record.

Pause: type **pause** (or press Esc while it runs). "Got it. I've paused the mission." with where it stopped and what did not happen. **Resume**: "Got it. I'll recheck the current state, then continue."

## 2. Course correction (two tabs)

Tab one: type **complete acme** on a fresh dataset (Reset first from the workspace menu, or use Beacon Rollout instead). Stop when it asks for hours. (Reply **2 hours** later, in the composer.)

Tab two: workspace menu → **Simulate the outside world**. Project Acme Implementation, task Train admins, status completed, acting as Mei Tanaka. **Apply.**

Tab one, hands off the keyboard: the mission pauses. "Acme Implementation changed while I was working. I paused before the next update." What changed, what it affects. **Continue.** Replanned: 5 of 6 updates still apply; the world already did one, and the band now counts 5.

Single-screen fallback: do the same from the workspace menu in the same tab; the mission pauses and asks you to continue.

## 3. Interruption

Type **complete Beacon Rollout**. It runs straight to the project confirmation because Beacon has time logged everywhere. Type **actually leave Handover open**. The agent replies that Handover was already verified complete before you asked and that no policy lets it reopen it. Nothing is reverted.

## 4. Verification is real

Workspace menu → **Simulate the outside world**: arm **timeout once** on Deploy API. Back in the agent: **complete acme**, **2 hours**, and watch the reconciliation beat: "The write to Deploy API timed out. I re-read it: it had applied." Zero retries, one ledger entry.

## 5. Your data, same agent

On the home, **Test with project data**: upload a two-file export (or load the Rocketlane export from the workspace menu). The panel says what loaded and what needs attention; nothing is dropped silently. Read the ingestion report: 31 projects, 325 tasks, 76 completed tasks with no time logged, a duplicate task name, 28 projects without tasks. Nothing hidden.

The same engine runs against it. State an outcome; the mission ends with its evaluation (governance, authorization, verification, scope, final state), and it appears under Previous missions with its exact buckets. (The twelve deterministic scenarios, including weakening a policy and watching the evaluator catch it, run in `pnpm test`.)

**The real data has the brief's 4-level conflict.** Acting as Robert Oconnell, type **complete Stone-Gonzalez**: project → milestone Project Plan Sign-off → predecessor BRD Sign-off → predecessors COE Review and Peer Review, all without time logged. Same engine, real export, nothing staged. Bowen-Chapman has the real BLOCKED task (Legacy Migration): the agent holds it, and that hold is the first committed regression record.


## 6. Close

"The demo is one scenario. The system is the product." The same engine, the same policies, the same verification path ran the conversation and the Lab. The model, when present, only pointed at words in a sentence.

## If something goes wrong

- Blank workspace or stale state: workspace menu → **Reset**.
- Colours missing after a code change: restart `pnpm dev` (Turbopack CSS chunk cache).
- Model interpreter slow: the band says "Interpreted locally" and the demo continues unchanged.
