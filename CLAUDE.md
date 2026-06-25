# CLAUDE.md — Operating Guide for Agents

This repo is driven by a **loop-engineering harness**. You are not a free-roaming
assistant here: every change flows through one ordered loop whose purpose is to
**evolve TokenisationSDK into institutional-grade programmable-rights
infrastructure without random feature addition**.

Read this file first, then `STATE.md`, then the active task node.

---

## 0. The prime directive

> **No source change without an open task in `harness/task_graph.json`,
> verified per `harness/verification_rules.md`.**

If a change you want has no task, add the task (and its dependency edges) first.
It does not jump the queue. One task per iteration. Never bundle unrelated work.

---

## 1. The five moves

Every iteration is the same five motions. Each has a skill (`.claude/skills/`)
and a system of record.

| Move | What it does | Skill | System of record |
|------|--------------|-------|------------------|
| **Discovery** | Find the active task, load only its context, state the gap (G#) it closes. | `loop-discovery` | `STATE.md`, `harness/task_graph.json`, `harness/loop_state.json` |
| **Handoff** | Make work resumable — pick up where the last iteration (or agent, or worktree) stopped; hand off cleanly when you stop. | `loop-handoff` | `STATE.md` "active task" + `loop_state.json.last_run_summary` |
| **Verification** | Prove the change with real commands. Independent gate before "done". | `loop-verify` + `verifier` agent | `harness/verification_rules.md`, `harness/quality_bar.md` |
| **Persistence** | Record what happened: state, decisions, disproved assumptions, reflection. | `loop-persist` | `loop_state.json`, `harness/decisions.md`, `harness/rejected_assumptions.md`, `harness/reflection_log.md` |
| **Scheduling** | Decide what runs next and whether it may run unattended. | `loop-schedule` | `harness/policies/automation_policy.md`, `task_graph.json` ordering + gates |

The full motion is orchestrated by the **`loop-iterate`** skill.
The legacy phase names (`context → plan → action → verification → memory` in
`verification_rules.md`) are the same loop seen from the task's side; the five
moves are the same loop seen from operations' side. Both must hold.

---

## 2. The six parts

The operational substrate that makes the five moves dependable.

| Part | Where | Purpose |
|------|-------|---------|
| **Automation** | `harness/policies/automation_policy.md` | What may run unattended (`/loop`, cron, background), and the hard stops. |
| **Skills** | `.claude/skills/loop-*` | Reusable, named loop motions. |
| **State** | `STATE.md` (human) + `harness/loop_state.json` (machine) + `harness/task_graph.json` (ordering authority) | Single live-state, single ordering authority. |
| **Verifier** | `.claude/agents/verifier.md` | Independent verification gate; required before any task → `done`. |
| **Worktrees** | `harness/policies/worktree_policy.md` | Isolation for parallel or risky source changes. |
| **Connectors** | `harness/policies/connector_policy.md` | Rules for external MCP/connector use. |

Budget governance lives alongside the policies in
`harness/policies/budget_policy.md`.

---

## 3. Authorities (do not contradict these)

- `harness/task_graph.json` — **single ordering authority** (deps, critical path, gates).
- `harness/loop_state.json` — **single machine live-state authority**.
- `STATE.md` — **human-readable mirror** of live state; keep it in sync with `loop_state.json`.
- `harness/verification_rules.md` + `harness/quality_bar.md` — **the gates**.
- `harness/architecture_target.md` + `harness/programmable_right_module_contract.md` — **the design pull**.
- `harness/sdk_audit.md` + `harness/gap_analysis.md` — **the evidence base**.

If two sources disagree, `task_graph.json` wins on ordering, `loop_state.json`
wins on status, and you must reconcile `STATE.md` to them in the same iteration.

---

## 4. Critical path & gates

```
T0 → (T1, T2) → (T4, T5, T6) → T9 → future modules
```

- **No new module** (compute credits, dataset licenses, model/model-weight
  licenses, AI-agent access) until **T4 AND T5 AND T6 are `done` AND T9 is
  `done`**. These nodes carry `gate: "blocked-until-foundation"`.
- A task whose dependencies are not `done` may not start.
- **The `verifier` agent must pass before any task is marked `done`** — this
  applies to all remaining tasks (see `STATE.md` and the verifier policy).

---

## 5. Two loops, do not confuse them

- `harness/` — the **product-hardening harness** (tasks T0–T16, modules M_*). This is the active loop.
- `loop/` — the earlier **build/consumer fix-loop** (fixes F1–F22) whose results the harness builds on. Historical; do not restart it.

---

## 6. Hard rules (from `verification_rules.md`)

- Smallest safe change. Do not rewrite the SDK or the ERC-3643 stack.
- Every code change ships with a matching test or doc update.
- Do not loosen validation or security to make something pass.
- **No stack traces, secrets, or internal paths in API responses.**
- Record exact commands and real output for every verification — never assert success without evidence.
- Do not overclaim legal, security, compliance, or production readiness beyond what tests prove.
- Validate any JSON you touch (`node -e "JSON.parse(require('fs').readFileSync('<f>','utf8'))"`).

---

## 7. Starting an iteration

1. Run the **`loop-iterate`** skill (or follow it manually).
2. It chains: `loop-discovery` → plan → action → `loop-verify` (spawns `verifier`) → `loop-persist` → `loop-schedule`.
3. Stop when the active task is `done`-and-verified, `blocked` (record why), or the budget/automation policy says stop.
