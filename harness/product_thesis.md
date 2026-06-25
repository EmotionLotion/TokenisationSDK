# Product Thesis

## One line
**Enterprise programmable rights infrastructure for tokenized digital and real-world assets** — the rails for issuing, governing, enforcing, and auditing *rights* (not just tokens) across asset classes.

## The shift
Tokenization v1 = "wrap an asset in a token." The institutional need is **programmable rights**: explicit, typed answers to *who* may do *what*, with *which* asset, under *which* policy, evidenced by *which* audit — enforced both off-chain (API/policy engine) and on-chain (ERC-3643 compliance stack). Tokens are the carrier; **rights + policy + redemption + audit** are the product.

## Right taxonomy (current → target)
Current `RightType`: `OWNERSHIP`, `ACCESS`, `BEHAVIOR`, `VERIFICATION`. The thesis extends this (design in T5) to cover the future modules:
- **OWNERSHIP** → real estate, IP, physical assets (existing).
- **ACCESS / MEMBERSHIP** → passes, memberships, **AI-agent access (delegated)**.
- **BEHAVIOR** → loyalty points, reputation (existing).
- **VERIFICATION** → certifications, proofs.
- **USAGE / CONSUMPTION** (new) → **compute credits** (metered/consumable).
- **LICENSE** (new) → **dataset licenses, model / model-weight licenses** (terms-bound, revocable, auditable).

## Why this repo can win
- Asset-class-agnostic **generic core** (asset/right/token/policy/lifecycle) already exists.
- Comprehensive **ERC-3643** permissioned-token contract stack (identity, modular compliance, policy modules, factory, oracles, governance, ERC-1410, SBT).
- A real differentiator: **hash-chained audit + decision receipts**.
- A **mature reference module** (real estate: DLD/NAV/tiers/exit/legal) proving the depth, and a **lightweight module** (loyalty) proving breadth.

## Wedge & sequence
1. **Harden the foundation** (tested core, correct RBAC, unified errors/idempotency/audit).
2. **Codify the module contract** (right-type + metadata schema + unified policy + redemption/consumption + audit + tests/docs).
3. **Prove it on loyalty** (least-mature existing module) and **assert it on real estate** (mature module).
4. **Only then** add the future modules (compute/dataset/model/agent), each as a thin conformant module rather than bespoke effort.

## Non-goals (now)
- No new verticals until the module contract exists and is proven.
- No re-architecture of the generic core or the ERC-3643 stack (they are strengths).
- No marketing-grade claims of "production/compliance readiness" beyond what tests + audit prove (several subsystems are still mock/stub by default — see `loop/fix_queue.md` F6/F8).
