---
name: loop-handoff
description: Handoff move — make harness work resumable across iterations, agents, sessions, and worktrees. Use when resuming an interrupted task, picking up after a /loop tick, or stopping mid-task and needing to leave a clean handoff for the next runner.
---

# loop-handoff — the Handoff move

Work in this repo is long-running and gets interrupted. The harness survives
interruption only if every stop leaves a clean, resumable handoff and every
start reads it.

## Resuming (start of iteration)
1. Read `harness/loop_state.json.last_run_summary` — it is the authoritative
   "where we stopped" narrative (it carries PRIOR-chained history).
2. Read `STATE.md` "Active task" and "Recently completed".
3. Read the latest `harness/reflection_log.md` entry for the active task.
4. Identify the **next undone sub-step**, not the start. Do not redo finished,
   verified work. If a verification was interrupted, re-run only that
   verification before continuing.

## Stopping (end of iteration, or interruption)
Before you stop, leave the handoff the next runner needs:
1. Update `loop_state.json.last_run_summary` with: what completed, what is
   verified vs not, the exact next sub-step, and any in-flight command.
2. Set task status precisely: `done` only with a verifier pass; otherwise
   `in_progress` (with the next sub-step named) or `blocked` (with the reason).
3. Reconcile `STATE.md`.
4. If work lives in a git worktree, record the worktree path/branch in the
   summary per `harness/policies/worktree_policy.md`.

## Cross-agent handoff
When delegating to a sub-agent (e.g. the `verifier`), pass it the task id, the
pass criterion, and the files changed — not the whole repo. Capture its verdict
back into the loop before proceeding.

## Invariant
A reader with only `loop_state.json` + `STATE.md` must be able to resume without
asking a human. If that's not true, the handoff is incomplete.
