---
name: loop-persist
description: Persistence move — record an iteration's outcome across the harness systems of record (state, decisions, rejected assumptions, reflection log, reports, fix queue) and reconcile STATE.md. Use at the end of any harness iteration, after verification passes or a task is blocked.
---

# loop-persist — the Persistence move

State that isn't written down is lost on the next interruption. This move makes
the iteration durable and keeps every authority in sync.

## Steps

1. **Machine state — `harness/loop_state.json`** (single live-state authority):
   - set the task's `tasks.<id>` status (`done` only with a verifier PASS;
     else `in_progress`/`blocked`);
   - rewrite `last_run_summary` (prepend the new summary; keep the PRIOR chain);
   - update `active_task`, `also_unblocked`, `blockers` as needed;
   - append any design choice to the `decisions` array.

2. **Ordering authority — `harness/task_graph.json`**: update the node `status`
   and `active_task` if the loop advanced. Keep it consistent with
   `loop_state.json`.

3. **Decisions — `harness/decisions.md`**: append the design choice(s) made
   (D-numbered), with rationale.

4. **Rejected assumptions — `harness/rejected_assumptions.md`**: append any
   assumption this iteration disproved (RA-numbered).

5. **Reflection — `harness/reflection_log.md`**: append a dated entry —
   Context / Implemented / Bug-fixed-in-task / Tests / Verification (commands +
   output + verifier verdict) / Next.

6. **Reports & fix queue**: update the relevant report under
   `harness/` or `loop/reports/`; record follow-ups/notes in
   `harness/fix_queue.json`.

7. **Human mirror — `STATE.md`**: reconcile Active task, Recently completed,
   Task status snapshot, Gates, and Next recommended task so STATE.md matches
   the JSON exactly.

## Validation (mandatory)
After editing any `.json` file, validate it:

```
node -e "JSON.parse(require('fs').readFileSync('<file>','utf8')); console.log('VALID <file>')"
```

Do not end the iteration with invalid JSON.

## Invariant
`task_graph.json` (ordering) ⟂ `loop_state.json` (status) ⟂ `STATE.md` (human)
must agree at the end of every iteration.
