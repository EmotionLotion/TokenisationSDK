# STATE.md — Live State

Human-readable mirror of `harness/loop_state.json` (machine authority) and
`harness/task_graph.json` (ordering authority). Keep all three in sync in the
same iteration. If they disagree, the JSON files win and this file is corrected.

- **Project:** TokenisationSDK
- **Harness:** institutional-grade-programmable-rights (`harness/`)
- **Phase:** reference-module-proof (Phase 3)
- **Critical path:** `T0 → (T1, T2) → (T4, T5, T6) → T9 → future modules`
- **Last updated:** 2026-06-25 (T15 — loyalty operator dashboard shipped; active → DX1)

---

## Active task

**→ DX1 — Developer quickstart around the certified loyalty reference module.**

- Status: `in_progress` (set in `task_graph.json`; deps T9e `done`).
- This pointer was set outside the T15 iteration; `loop_state.json` reconciled to it.

**T15 — Stabilize UI + tests — `in_progress` (loyalty-dashboard sub-goal DONE + verifier PASS).**

- ✅ **Loyalty operator dashboard shipped:** `ui/src/pages/LoyaltyConsole.tsx`
  (route `/loyalty` + Platform nav) — connect / setup / overview / earn /
  redeem / consume / revoke / RightAction receipt / ledger evidence / dev
  snippet, on the **real** `client.loyalty.*` via a lazy `@tokenisation/sdk`
  import; injectable client → unit-tested (`LoyaltyConsole.test.tsx` 1/1).
  Closes `T9e-FOLLOWUP-1`.
- ⏳ **Remaining T15 scope (open):** React 18/19 split; console vitest infra
  (`crypto-browserify` missing → `UI-INFRA-1`); pre-existing console type debt
  (`UI-INFRA-2`); F11/F12/F15/F17.

---

## Recently completed

- **T15 (loyalty-dashboard sub-goal) — COMPLETE (verifier PASS).** Native
  operator dashboard in the console (`ui/src/pages/LoyaltyConsole.tsx`) on the
  real `client.loyalty.*` surface; 8 panels incl. RightAction receipt + ledger
  evidence + dev snippet. Lazy SDK import (sidesteps the pre-existing
  `crypto-browserify` vitest gap). Evidence: `LoyaltyConsole.test.tsx` 1/1;
  new files type-clean; 16 full-suite failures proven **pre-existing** (stash-proof);
  scope = 4 `ui/` files, no new dep, no secret/stack leak. T15 itself stays
  `in_progress` (broader UI stabilization remains). Discovered `UI-INFRA-1/2`.
- **T9e — COMPLETE (verifier PASS). T9 CLOSED.** Loyalty certified as the
  **reference programmable-right module** (`harness/loyalty_reference_acceptance.md`).
  Added `examples/loyalty-minimal/{package.json,tsconfig.json}` (runnable);
  **fixed corruption** — stripped 5 leaked tool-call tags from 4 prior-session
  files (the example was failing `tsc`). Evidence: loyalty 12/12, full server
  311/311 (no regression), core 27/27, sdk 7/7, all typechecks exit 0, example
  typechecks against the real built SDK. 3 exceptions deferred honestly (T8
  metadata registry; UI integration → T9e-FOLLOWUP-1/T15; list+get →
  T9d-FOLLOWUP-1). Closing T9 **satisfies** the foundation gate.
- **T9d — COMPLETE.** Loyalty SDK surface `client.loyalty.*`
  (`packages/core/src/modules/loyalty.ts`): nested `programs`/`accounts`/`points`/`transactions`;
  redeem/consume/revoke require `idempotencyKey`; envelopes unwrapped; wired into
  `ApiClient`; types exported via the modules barrel. Tests
  `sdk/tests/LoyaltyModule.test.ts` 7/7; core typecheck+build PASS; core
  foundation 27/27; sdk typecheck+build PASS; no server changes. (Verified.)
- T9c — COMPLETE. Loyalty HTTP routes `/api/v1/loyalty/*` (RBAC + idempotency + OpenAPI). Server suite 311 tests pass.
- T9b — COMPLETE. Loyalty redeem/consume/revoke through the RightAction primitive over the existing ledger (D-13).
- T9a — COMPLETE. Loyalty Module Spec (`docs/modules/loyalty.module.md`) + plan.
- Foundation: T0, T1, T2, T4, T5, T6, T6a — all `done`.

---

## Task status snapshot

| Task | Title | Status |
|------|-------|--------|
| T0–T2, T4, T5, T6, T6a | Scaffold / foundation / contract / taxonomy / primitive | **done** |
| T9 | Bring loyalty up to the module contract (umbrella) | **done** |
| T9a, T9b, T9c, T9d, T9e | Loyalty spec / persistence / routes / SDK / docs+acceptance | **done** |
| **DX1** | Developer quickstart around loyalty | **in_progress — ACTIVE** |
| T15 | Stabilize UI + tests (loyalty operator dashboard ✅; rest open) | **in_progress** |
| T2a, T2b, T3, T5a, T6b, T6c, T7, T8, T10, T11, T12, T13, T14, T16 | foundation/surface follow-ups | pending (also-unblocked set) |
| M_compute_credits, M_dataset_licenses, M_model_licenses, M_ai_agent_access | Future modules | **deferred — GATED** |

---

## Gates in force

1. **Future modules: foundation gate now SATISFIED, but still deferred.**
   `M_compute_credits`, `M_dataset_licenses`, `M_model_licenses`,
   `M_ai_agent_access` remain `deferred`. The `blocked-until-foundation` gate
   (T4 AND T5 AND T6 AND **T9** all `done`) is **now met** — but lifting the gate
   does **not** auto-start them. Each still needs a completed + accepted Module
   Spec (D-9), and USAGE/LICENSE modules additionally need T5a. Opening one is a
   deliberate, gated decision — not the default next step.
2. **Verifier required before `done`.** No task may be marked `done` until the
   `verifier` agent (`.claude/agents/verifier.md`) has independently confirmed
   the pass criterion with real command output. This applies to **all remaining
   tasks**, T9e first. A task without a verifier sign-off is at most
   `in_progress`. (See `harness/policies/automation_policy.md` and `verification_rules.md`.)
3. **Critical-path order enforced** by `task_graph.json`; deps must be `done`.
4. **One task per iteration; no source change without an open task.**

---

## Loop coverage (six parts)

| Part | Artifact | State |
|------|----------|-------|
| Automation | `harness/policies/automation_policy.md` | present |
| Skills | `.claude/skills/loop-{iterate,discovery,handoff,verify,persist,schedule}` | present |
| State | `STATE.md` + `harness/loop_state.json` + `harness/task_graph.json` | present |
| Verifier | `.claude/agents/verifier.md` | present |
| Worktrees | `harness/policies/worktree_policy.md` | present |
| Connectors | `harness/policies/connector_policy.md` | present |
| (Budget) | `harness/policies/budget_policy.md` | present |

---

## Next recommended task

**DX1 — Developer quickstart** is the active task (set in `task_graph.json`):
install/setup/API-key + verified runnable example around the certified loyalty
module. To **finish T15**, the next concrete step is `UI-INFRA-1` (install
`crypto-browserify` / fix the crypto-shim so the console vitest suite runs),
then `UI-INFRA-2` (console type-debt), the React 18/19 split, and F11/F12/F15/F17.
Other unblocked strategic options: **T10** (real-estate conformance + migrate
securities redemption onto the Right Action primitive), **T2a/T2b** (RBAC
provisioning), **T5a** (land USAGE/LICENSE — prerequisite for the first future
module). Run the chosen task through the full five-move loop with a `verifier`
sign-off before `done`.
