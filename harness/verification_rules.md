# Verification Rules

These rules govern every iteration of this harness. Their purpose is to **prevent random feature addition** and to force each task through a disciplined loop. An agent may not modify source unless these rules are satisfied.

## The five-phase loop (mandatory for every task)
Every task MUST pass through, in order:

1. **Context** — Read `loop_state.json` (this harness), the task node in `task_graph.json`, and the relevant `sdk_audit.md` / `gap_analysis.md` sections. State which task you are executing and which gap (G#) it closes. No work outside the active task.
2. **Plan** — Write the smallest plan that satisfies the task's pass criterion (`quality_bar.md`). Identify files to touch and the test/doc that will prove it. Do not expand scope.
3. **Action** — Make the smallest change. Run real commands; do not guess outcomes that can be tested.
4. **Verification** — Prove it: build + typecheck green for the SDK/server path; the task's pass criterion met; new/updated test passes; no regressions. Record exact commands + outputs.
5. **Memory** — Update `loop_state.json` (task status, last_run_summary), append to `decisions.md` (choices made) and `rejected_assumptions.md` (assumptions disproved); update the relevant report.

A task that cannot complete a phase is set `blocked` with the reason recorded; the loop stops there.

## Scope gate (anti-random-feature)
- **No source change without an open task** in `task_graph.json`. If a desired change has no task, add a task (and its dependency edges) first — it does not jump the queue.
- **Respect the critical path.** The order is enforced by `task_graph.json`:
  `T0 → (T1, T2) → (T4, T5, T6) → T9 → future modules`.
  A task whose dependencies are not `done` may not start.
- **No new modules** (compute credits, dataset licenses, model/model-weight licenses, AI-agent access) until **T4 AND T5 AND T6 are `done`** and **T9 (loyalty proof) is `done`**. These nodes carry `gate: "blocked-until-foundation"` in the graph.
- **One task per iteration.** Do not bundle unrelated changes.

## Code-change rules
- Every code change ships with a **matching test or doc update** (no silent behavior change).
- Make the **smallest safe change**; do not rewrite the SDK or the ERC-3643 stack.
- Do not loosen validation or security to make something pass.
- **No stack traces, secrets, or internal paths in API responses.**
- Preserve the "already met" bar in `quality_bar.md` (SDK build/typecheck green; clean external consumption). Re-verify if at risk.

## Evidence rules
- Record exact commands and their real output for every verification.
- Do not overclaim legal, security, compliance, or production readiness beyond what tests + audit prove.
- If a command can be run, run it; do not assert success without evidence.

## Definition of "done" for a task
`done` = pass criterion in `quality_bar.md` met **and** verified by a real command/test **and** memory updated. Otherwise `in_progress`, `blocked`, or `pending`.

## Harness invariants
- `task_graph.json` is the single ordering authority; `loop_state.json` is the single live-state authority.
- This file + `quality_bar.md` are the gates; `architecture_target.md` is the design pull; `sdk_audit.md`/`gap_analysis.md` are the evidence base.
