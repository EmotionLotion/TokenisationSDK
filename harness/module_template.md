# Module Spec: <module-id>

> Copy this file to `docs/modules/<module-id>.module.md` and fill every section.
> Authored per `programmable_right_module_contract.md`. A section may be "N/A — <reason>"
> only where the contract marks it optional. The module may not be implemented until this
> spec is complete AND passes `module_acceptance_checklist.md`.

## 1. Module identity
- id: `<kebab-case>`
- version: `0.1.0`
- name / description / tags:
- requires: `[]`
- chains: `[]`
- maturity tier target: `reference`

## 2. Asset model
| assetType | definition | core rightType | singular / fungible | default state | validityPeriod |
|-----------|-----------|----------------|---------------------|---------------|----------------|
| | | | | DRAFT | perpetual / time-bound |

## 3. Right model (fields only; taxonomy = T5)
- rightType: `<OWNERSHIP|ACCESS|BEHAVIOR|VERIFICATION | PROPOSED:<NAME> (pending-T5)>`
- transferable: · divisible: · expires (basis): · revocable: · delegable:
- pending-T5 right type? `yes/no` (if yes, justification + blocks acceptance until T5)

## 4. Metadata schema
- schemaVersion: `1`
- zod schema location: `packages/<id>/src/models/<Name>Metadata.ts`
- required fields: …
- validated on write (server)? exported type from SDK?

## 5. Policy model (declare into T7)
- off-chain (PolicyEvaluator / TransferabilityRules): …
- on-chain (ModularCompliance / IPolicyModule list): …
- enforcement: in-SDK / on-chain / both

## 6. Issuance / mint flow
- inputs: … · idempotency-key required: yes
- steps (sync/async) mapped to 03-issue-flow.svg: …
- standard/contract used: …

## 7. Transfer / access rules
- allowed transitions: … · who may transfer/access: …
- restrictions + enforcement (e.g. Soulbound): …

## 8. Redemption / consumption / revocation (declare into T6)
- redemption: applies? terms:
- consumption (metered): unit · decrement semantics · balance:
- revocation: who · effect · audit:
- expiry: basis:
- confirm: implementable on the single T6 primitive (server-persisted + audited)? yes/no

## 9. Audit events
- event types: `<id>.asset.created`, `<id>.token.issued`, `<id>.consumed`, `<id>.revoked`, …
- every state change emits hash-chained audit (+ DecisionReceipt where compliance-relevant)? yes

## 10. Permissions / RBAC
- resource name: `<resource>`
- required permissions per op: read:`<resource>` (reads), write:`<resource>` (writes), admin-only: …
- routes guarded via `requireScope(action, '<resource>')`; org-scoped: yes

## 11. SDK API surface
- public methods (typed): `client.<resource>.create/get/list/...`
- import path: `@tokenisation/core` (or subpath); returns bare domain objects; unified errors

## 12. Server / API surface
- routes under `/api/v1/<resource>`: …
- per route: zod validation · apiKeyMiddleware · tenantContext · requireScope · idempotency (mutations) · audit · OpenAPI JSDoc · no stack traces

## 13. Contract / on-chain surface (if chains non-empty)
- standard/contract: `<ComplianceToken | ERC1410 | ComplianceMultiToken | <NFT> | ReputationSBT>`
- compliance/policy modules bound at deploy: … · oracle(s): …

## 14. UI / dashboard
- operator views: list / detail / issue / (redeem|consume|revoke)
- holder views (if any): … · components location: …

## 15. Docs
- recipe: `docs/recipes/<MODULE>.md` · example: `examples/<id>-minimal/`

## 16. Tests
- conformance (T1 pattern): asset contract, metadata/right validation, policy, issuance, redemption/consume/revoke, audit, RBAC (allow/deny/tenant)
- integration: asset → token → transfer/access → redeem/consume/revoke → audit
- suite green + typecheck/build green

## 17. Conformance
- module_acceptance_checklist.md: all boxes checked
- core conformance suite passes against module primitives
- maturity tier == reference
