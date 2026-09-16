# cascading-conflicts

The hero fixture, in the same two-file shape as the real export so one normalizer serves both.

**Acme Implementation** has two milestones. `Go-Live` depends on `Deploy API`, which depends on `QA Complete`, which has no time logged: a three-deep chain that surfaces one blocker at a time. `Training Complete` has an open subtask `Train admins`, so a second, different blocker appears once the first path clears. `Documentation` is a non-milestone task left open on purpose: it does not block completion under policy 1 and must be reported as a consequence.

**Beacon Rollout** is the interruption scenario ("actually leave Go-Live open"). **Northwind Migration** is already complete.

Nothing in `core/` knows any of these names.
