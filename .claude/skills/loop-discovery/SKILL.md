---
name: loop-discovery
description: Discovery move — identify the single active harness task, confirm its dependencies are done, load only its context, and state the gap (G#) it closes. Use at the start of any harness iteration or when you need to figure out what to work on next in TokenisationSDK.
---

# loop-discovery — the Discovery move

Find exactly what to work on, and nothing more. Scope discipline is the point.

## Steps

1. Read `STATE.md` (Active task) and `harness/loop_state.json` (`active_task`,
   `tasks`, `gates`). These should agree; if not, `loop_state.json` wins —
   flag the drift for the Persistence move to fix.
2. Open the task node in `harness/task_graph.json`. Confirm:
   - every entry in `deps` has status `done`;
   - the node's `gate` (if any) is satisfied;
   - it is on/respecting the critical path.
   If a dependency is not `done`, this is the wrong task — stop and report.
3. State, in one line: **the task id, its title, and the gap (G#) it closes**
   (cross-reference `harness/gap_analysis.md` / `harness/quality_bar.md`).
4. Load *only* the context this task needs:
   - the task's pass criterion row in `harness/quality_bar.md`;
   - the relevant sections of `harness/sdk_audit.md` / `architecture_target.md`;
   - for module work, `harness/programmable_right_module_contract.md` +
     `harness/module_acceptance_checklist.md` + the module spec.
   Do not read the whole repo. Do not start adjacent tasks.

## Output
A short discovery note: active task id, gap closed, deps verified `done`,
files/contexts loaded, and the one-sentence plan seed. Hand to the Plan step.

## Anti-patterns
- Picking a task because it's interesting rather than active.
- Loading broad context "just in case" — that invites scope creep.
- Starting a `deferred`/gated module (the `M_*` nodes).
