# Budget Policy

Governs the **effort budget** of a harness iteration — how much work, token
spend, and tool churn one iteration may consume before it must stop and hand off.
A bounded iteration is what keeps the loop resumable and keeps automated runs
from running away.

## Unit of budget: one task, one iteration
- The budget is scoped to the **single active task** (one task per iteration).
- An iteration that grows beyond its task is over budget by definition, even if
  tokens remain — that is scope creep, and the Discovery/Verify moves must catch
  it.

## Default ceilings (per unattended iteration)
- **Scope:** one task; the smallest safe change; the files named in the plan.
- **Verification:** re-run only the proof the task needs plus the relevant
  regression suite — not the entire monorepo's every package.
- **Spend:** if the run was given a token target (e.g. a `+N` directive), treat
  it as a **hard ceiling**: stop launching new sub-agents / commands once it is
  reached and hand off.
- **Sub-agents:** spawn the `verifier` (always) plus only the agents the task
  genuinely needs. Prefer one well-scoped verifier over many redundant ones.

## When the budget is exhausted
1. **Stop** — do not push to finish "just one more thing".
2. **Persist** — write `last_run_summary` with the next sub-step and current
   status (`in_progress`, never a `done` without a verifier PASS).
3. **Hand off** — leave the tree resumable (`loop-handoff`).
4. Budget exhaustion is a **hard stop** for unattended runs
   (`automation_policy.md`).

## Scaling effort to the task
- **Trivial/mechanical** (doc edit, state reconcile): minimal effort, no
  worktree, single self-verify + verifier.
- **Material** (a real source change closing a gap): full five-move loop,
  worktree if it mutates source under automation, full regression run.
- **Audit/comprehensive** (explicitly requested deep review): larger fan-out is
  justified, but still one task and still gated by a verifier PASS.

## Anti-patterns
- Spending budget re-deriving facts already in `STATE.md` / `loop_state.json`.
- Re-reading the whole repo when the task needs three files.
- Burning the budget on breadth, then having none left to **verify** — the
  verifier gate is not optional, so reserve budget for it.
