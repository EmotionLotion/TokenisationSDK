---
name: loop-iterate
description: Run one full harness iteration on the active task — chains the five moves (discovery → handoff → verification → persistence → scheduling) with a mandatory verifier gate. Use when starting or resuming work on a TokenisationSDK harness task (T-numbers), or when asked to "run the loop", "do the next task", or "continue the harness".
---

# loop-iterate — one harness iteration

Orchestrates a single, disciplined iteration. One task per iteration. No source
change without an open task in `harness/task_graph.json`. Stop when the active
task is verified-`done`, `blocked` (record why), or a policy says stop.

## Steps

1. **Discovery** — run `loop-discovery`. Determine the active task from
   `STATE.md` / `harness/loop_state.json` (`active_task`). State the task id and
   the gap (G#) it closes. Load *only* that task's context. If deps aren't
   `done`, stop — wrong task.

2. **Handoff (resume)** — read `loop_state.json.last_run_summary` and `STATE.md`
   "Active task" to pick up exactly where the last iteration stopped. Don't
   redo finished sub-steps. (See `loop-handoff`.)

3. **Plan** — write the smallest plan that meets the task's pass criterion in
   `harness/quality_bar.md`. Name the files to touch and the test/doc that will
   prove it. Do not expand scope. Confirm the change is allowed by
   `harness/verification_rules.md` (scope gate, code-change rules).

4. **Action** — make the smallest safe change. Run real commands. Every code
   change ships with a matching test or doc update.

5. **Verification** — run `loop-verify`, which **spawns the `verifier` agent**.
   A task may not be marked `done` until the verifier independently confirms the
   pass criterion with real command output. No verifier pass → status is at most
   `in_progress`.

6. **Persistence** — run `loop-persist`: update `loop_state.json` (status +
   `last_run_summary`), append to `harness/decisions.md` and
   `harness/rejected_assumptions.md`, add a `harness/reflection_log.md` entry,
   update the relevant report and `fix_queue.json`, and **reconcile `STATE.md`**.
   Validate any JSON you touched.

7. **Scheduling** — run `loop-schedule`: set `active_task` to the next task per
   the critical path + gates; decide whether the next iteration may run
   unattended per `harness/policies/automation_policy.md`.

## Guardrails
- Respect the critical path: `T0 → (T1,T2) → (T4,T5,T6) → T9 → future modules`.
- Future modules (`M_*`) stay `deferred` until T4+T5+T6+T9 are `done`.
- Never bundle unrelated changes. Never loosen security to pass.
- Budget per `harness/policies/budget_policy.md`; isolation per
  `harness/policies/worktree_policy.md`; external services per
  `harness/policies/connector_policy.md`.
