---
name: loop-schedule
description: Scheduling move — choose the next harness task per the critical path and gates, and decide whether the next iteration may run unattended (/loop, cron, background) under the automation policy. Use at the end of an iteration to set up the next one, or when configuring recurring/automated harness runs.
---

# loop-schedule — the Scheduling move

Decide what runs next, and whether it may run without a human watching.

## Choosing the next task
1. If the active task is verified-`done`, pick the next per
   `harness/task_graph.json`: respect the critical path
   `T0 → (T1,T2) → (T4,T5,T6) → T9 → future modules`, require all `deps` to be
   `done`, and respect node `gate`s.
2. Prefer the task that unblocks the most downstream work. Right now that is
   **T9e** (closing T9 lifts `blocked-until-foundation` on all `M_*` modules).
3. Never schedule a `deferred`/gated module. Never schedule a task whose deps
   are unmet.
4. Set `active_task` in both `loop_state.json` and `STATE.md` (Persistence move
   writes it; Scheduling decides it).

## Deciding automation level
Consult `harness/policies/automation_policy.md`. Summary:
- **May run unattended (`/loop`, background):** read-only discovery/audit,
  test runs, verification re-runs, doc/state persistence, JSON validation.
- **Requires a human in the loop:** source-code changes, anything that mutates
  `server/data/*.db`, dependency/lockfile changes, git push / publish / release,
  marking a task `done`, starting a new (previously gated) module, connector
  writes.
- **Hard stop conditions:** verifier FAIL, failing build/typecheck, budget
  exhausted (`budget_policy.md`), or an unmet gate.

## Recurring runs
- For self-paced continuation, use the built-in `/loop` skill with `loop-iterate`.
- A scheduled run inherits all gates: it still needs a verifier PASS before any
  `done`, and it still may not touch the unattended-forbidden surfaces above.
- Each tick must end with a clean Handoff (`loop-handoff`) so the next tick — or
  a human — can resume.
