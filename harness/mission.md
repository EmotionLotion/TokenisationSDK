# Mission

## Purpose
Evolve TokenisationSDK into **institutional-grade programmable rights infrastructure** for tokenized digital and real-world assets — without random feature addition. Every change flows through this harness.

## What we are building
A foundation where a **right** (who may do what, with which asset, under which policy, evidenced by which audit) is a first-class, typed, enforced, and auditable primitive — composed into vertical **modules**.

- **Existing modules:** loyalty, real estate.
- **Future modules (deferred):** compute credits, dataset licenses, model / model-weight licenses, AI-agent access.

## Definition of done (institutional bar)
The SDK is "ready" when an enterprise developer can, against a documented and tested foundation:
1. Install and import the SDK cleanly (✅ already true after prior `loop/` fixes F22/F21/F20).
2. Author an asset + a typed **right** with a versioned metadata schema.
3. Attach a **policy** authored once and enforced both off-chain and on-chain.
4. Issue/transfer/**redeem (consume)** the right through a uniform, server-persisted, audited flow.
5. Rely on first-class **RBAC** (roles↔permissions correct), **idempotency**, **typed errors** (no stack leaks), and **complete audit**.
6. Add a **new module** only by satisfying a codified **Programmable Right Module contract** — not by bespoke effort.

See `quality_bar.md` for the measurable pass criteria and `architecture_target.md` for the module contract.

## Operating principle
- The harness exists to **prevent random feature addition**. No source change happens except in service of an **open task** in `task_graph.json`, and only after passing the loop in `verification_rules.md` (context → plan → action → verification → memory).
- Understand before changing. The current product is captured in `sdk_audit.md`; the deltas in `gap_analysis.md`; the ordered work in `recommended_tasks.md`.
- Foundation and module-contract first; **new modules are deferred** until T4/T5/T6 are done and proven on loyalty (T9).

## Source of truth
`sdk_audit.md` (current state) · `gap_analysis.md` (gaps G1–G14) · `recommended_tasks.md` (tasks T0–T16) · `task_graph.json` (order/deps) · prior `loop/` reports + `loop/fix_queue.md` (F-items already addressed/deferred).
