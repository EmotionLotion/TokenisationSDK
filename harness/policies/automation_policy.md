# Automation Policy

Governs what may run **unattended** (via `/loop`, cron/scheduled agents, or
background tasks) versus what requires a human in the loop. The harness's purpose
— prevent random feature addition — must hold even when no human is watching.

This is the **Automation** part of the six-part substrate and the operational
arm of the **Scheduling** move (`loop-schedule`).

## Tiers

### Tier A — may run fully unattended
- Discovery / repo audit / read-only inspection (`loop-discovery`).
- Running tests, typecheck, build (non-mutating).
- Verification re-runs (the `verifier` agent).
- Persistence to harness state/docs: `loop_state.json`, `task_graph.json`,
  `STATE.md`, `decisions.md`, `rejected_assumptions.md`, `reflection_log.md`,
  reports, `fix_queue.json`.
- JSON validation.

### Tier B — may run unattended only with all guardrails green, else pause for a human
- Source-code edits under an **open task** (smallest safe change + matching
  test/doc). Must be followed by a verifier PASS in the same run.
- Creating/using a git worktree per `worktree_policy.md`.

The run must **pause and hand off** (not push forward) if: the verifier returns
FAIL/INSUFFICIENT, build/typecheck/tests go red, the budget is exhausted, or a
gate is unmet.

### Tier C — never unattended (human required)
- Marking any task `done` *without* a verifier PASS (forbidden outright).
- Mutating `server/data/*.db` / `*.db-shm` / `*.db-wal`.
- Dependency or lockfile changes (`pnpm-lock.yaml`, `package.json` deps).
- `git push`, publishing, releasing, changeset version bumps.
- Starting a previously **gated/deferred module** (`M_*`).
- Any **connector write** (see `connector_policy.md`).
- Loosening validation, auth, or security.

## Hard stops (abort the automated run)
1. Verifier verdict ≠ PASS.
2. Build / typecheck / test failure that the active task did not intend.
3. Budget exhausted (`budget_policy.md`).
4. A task's dependency is not `done`, or its `gate` is unmet.
5. Detected stack-trace/secret/internal-path leak in an API response.
6. State authorities disagree and cannot be reconciled
   (`task_graph.json` ⟂ `loop_state.json` ⟂ `STATE.md`).

## Recurring runs
- Use the built-in `/loop` skill driving `loop-iterate` for self-paced
  continuation; one task per tick.
- Every tick ends with a clean handoff (`loop-handoff`) so a human or the next
  tick can resume from `loop_state.json` + `STATE.md` alone.
- A scheduled run carries **all** gates of an interactive run; automation never
  relaxes the bar, it only removes the human's keystrokes for Tier A/B work.
