---
name: loop-verify
description: Verification move — prove a harness change with real commands and gate it through the independent verifier agent before any task is marked done. Use after making a change and before updating status to done in TokenisationSDK.
---

# loop-verify — the Verification move

"Done" means proven, not claimed. This move is a hard gate: **no task reaches
`done` without an independent `verifier` sign-off backed by real command output.**

## Steps

1. **Self-verify first.** Run the task's proof per `harness/quality_bar.md`:
   - typecheck + build green on the touched SDK/server path;
   - the new/updated test passes;
   - the full relevant suite still passes (no regression);
   - the pass criterion in `quality_bar.md` is objectively met.
   Record the **exact commands and their real output**. Do not assert success
   without running.

2. **Spawn the `verifier` agent** (`.claude/agents/verifier.md`) with:
   - the task id and its pass criterion (quote the `quality_bar.md` row);
   - the list of changed files;
   - the commands you ran and their output.
   The verifier independently re-runs the proof, checks for regressions, scope
   creep, security loosening, and stack-trace/secret leakage, and returns a
   verdict: **PASS** (with evidence) or **FAIL/INSUFFICIENT** (with what's missing).

3. **Gate.**
   - Verifier PASS → the task may be marked `done` in the Persistence move.
   - Verifier FAIL/INSUFFICIENT → status stays `in_progress` (or `blocked`);
     address the gap and re-verify. Never override a failing verifier to ship.

## What the verifier must confirm (checklist)
- Build + typecheck green for the SDK/server path.
- Pass criterion met and demonstrated by a real command/test.
- No regression in the existing suite.
- Code change ships with a matching test or doc update.
- No stack traces, secrets, or internal paths in API responses.
- No scope creep beyond the active task; no loosened validation/security.
- For module work: relevant boxes of `harness/module_acceptance_checklist.md`.

## Evidence
Verification evidence (commands + output + verifier verdict) is captured by the
Persistence move into `reflection_log.md` and `last_run_summary`. Evidence that
isn't recorded didn't happen.
