# Architecture Target

The north-star architecture. **Design intent only** — this file does not authorize implementation; implementation happens through tasks T4–T8 once their loop passes. It exists so the foundation work (T1/T2) and every future module are pulled toward one shape.

## Layering

```
┌──────────────────────────────────────────────────────────────┐
│  Modules (verticals)  — loyalty, real estate, [future: compute │
│  credits, dataset licenses, model/model-weight licenses,       │
│  AI-agent access]                                              │
│      each = a Programmable Right Module (see contract below)   │
├──────────────────────────────────────────────────────────────┤
│  Programmable Right Module contract (T4)                       │
│   right-type · metadata schema · unified policy · redemption/  │
│   consumption · audit · required tests + docs                  │
├──────────────────────────────────────────────────────────────┤
│  Generic core primitives (@tokenisation/core)                 │
│   asset · right · token · policy engine · lifecycle/state      │
│   machine · redemption · audit chain · errors · RBAC          │
├──────────────────────────────────────────────────────────────┤
│  Enforcement substrates                                        │
│   off-chain: API server + PolicyEvaluator                      │
│   on-chain: ERC-3643 stack (identity, modular compliance,      │
│   policy modules, factory, oracles, governance, ERC-1410, SBT) │
└──────────────────────────────────────────────────────────────┘
```

Principle: **author once, enforce everywhere.** A right + its policy + metadata are declared once and projected to both substrates.

## The Programmable Right Module contract (target of T4)

> **T4 done (2026-06-24):** the contract is now formalized in `programmable_right_module_contract.md` (17 required sections + example mappings + binding gates), with `module_template.md` (fill-in skeleton) and `module_acceptance_checklist.md` (the gate). The summary below is the orientation; that file is authoritative.

Every module — existing and future — must provide, and nothing more bespoke:

1. **Right type** — a value from the (consistent) `RightType` taxonomy (T5), or a documented extension.
2. **Versioned metadata schema** — a zod schema registered in the per-right-type metadata registry (T8); validated on write; versioned for migration.
3. **Unified policy** — transfer/usage rules authored in one model (T7) that compiles to off-chain `PolicyEvaluator` rules **and** on-chain `IPolicyModule`/compliance-module config.
4. **Redemption / consumption hooks** — implemented against the one server-persisted, audited **Right Action** primitive (T6, ratified — see `redemption_consumption_primitive.md`): 5 kinds `REDEEM | CONSUME | REVOKE | EXPIRE | VERIFY_ACCESS` over any RightProfile, gated by attributes (`consumable`/`revocable`/`expires`), reusing the audit + idempotency + RBAC substrates. Covers ownership exit/claim, access grant/expiry/verify, behavior accrual, **usage metering/consumption** (compute), **license verify/revoke/meter** (dataset/model), **delegated-access** verify/revoke (AI agents). Built by T6a/T6b/T6c; first consumed by T9.
5. **Audit hooks** — every state-changing operation emits a hash-chained audit entry + decision receipt (G4).
6. **Lifecycle** — declares its states via the core state-machine registry.
7. **Conformance tests + docs** — package-level tests asserting the above + a recipe/example.

A module is "conformant" iff it satisfies 1–7 and the core conformance suite (T1) passes against it.

## Right-type taxonomy (RATIFIED in T5 — see `right_type_taxonomy.md`)
Two levels: canonical **RightType** (Level 1) + module **RightProfile** (Level 2, attributes).
- `OWNERSHIP` — real estate, IP, physical assets. *(live)*
- `ACCESS` — passes/**memberships**; **AI-agent access** = delegated, scoped, revocable ACCESS profile. *(live)*
- `BEHAVIOR` — loyalty/reputation. *(live)*
- `VERIFICATION` — certifications/proofs. *(live)*
- `USAGE` — **compute credits** (consumable/metered, depletes on use). *(ratified; enum landing in **T5a**)*
- `LICENSE` — **dataset & model/model-weight licenses** (terms-bound, revocable, metered). *(ratified; enum landing in **T5a**)*

`MEMBERSHIP` is **resolved** as an `ACCESS` profile, not a canonical type (RA-3 closed; D-10). Loyalty manifest fixed (`BEHAVIOR`,`ACCESS`). Enum additions are additive/low-risk (no exhaustive switches) and deferred to T5a on first consumer; T6 keys off RightProfile attributes (`consumable`/`revocable`), not the new enum values.

## What must not change (strengths to preserve)
- The generic, asset-class-agnostic core abstraction.
- The ERC-3643 contract stack (institutional standard).
- The hash-chained audit + decision-receipt primitive.
- The plugin/pack registry + manifest extension mechanism (the module contract builds on it, not around it).

## Enforcement substrates today (from audit)
- Off-chain: `PolicyEvaluator`, `Policy`/`PolicyRule`, compliance engine; server middleware (auth, idempotency, audit).
- On-chain: `ModularCompliance` + modules (Whitelist/Country/MaxBalance/MaxHolders/HoldTime/Fees/ACE/Hardware), `IPolicyModule` (Allow/Time/Volume), `TokenFactory`, oracles, `TokenGovernor`, ERC-1410, `ReputationSBT`.
The unification work (T7) is the bridge between these two.
