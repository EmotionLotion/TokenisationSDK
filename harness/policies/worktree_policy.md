# Worktree Policy

Governs when harness work runs in an isolated **git worktree** rather than the
primary working tree. This is the **Worktrees** part of the six-part substrate;
it protects the Handoff move from half-finished or conflicting changes.

## Default
Work in the **primary tree** on the current branch (`main`). One task per
iteration means contention is usually low, so a worktree is not the default.

## Use an isolated worktree when
- Two or more source-mutating tasks must proceed **in parallel** and would
  otherwise conflict (rare — the harness prefers one task per iteration).
- A change is **risky or exploratory** and you want the primary tree to stay
  releasable while you try it.
- An **automated/unattended** Tier-B run mutates source: isolate it so a failed
  run never leaves the primary tree dirty.
- A sub-agent needs to mutate files independently of the orchestrator.

## Do not use a worktree for
- Read-only Discovery, verification re-runs, or harness-state persistence
  (`loop_state.json`, `STATE.md`, docs) — these belong in the primary tree so
  state stays single-sourced.
- Trivial single-file doc edits.

## Rules
1. **One task per worktree.** Never bundle unrelated tasks into one isolated tree.
2. **Record the handoff.** When work lives in a worktree, write its path and
   branch into `loop_state.json.last_run_summary` so the next runner can find it
   (Handoff move invariant).
3. **State stays central.** `task_graph.json`, `loop_state.json`, and `STATE.md`
   are updated in the **primary tree**, not inside a throwaway worktree, so the
   ordering/state authorities are never forked.
4. **Verify inside the worktree, merge clean.** The `verifier` runs against the
   worktree's changes; only a PASS justifies merging back to `main`.
5. **Clean up.** Remove the worktree once merged or abandoned; an unchanged
   worktree should be auto-removed.
6. **No DB or lockfile mutation** in an automated worktree run (Tier C of
   `automation_policy.md` still applies).

## Mechanics
Prefer the harness's worktree tooling (`EnterWorktree`/`ExitWorktree`, or an
agent launched with `isolation: "worktree"`) over manual `git worktree` so setup
and cleanup are tracked.
