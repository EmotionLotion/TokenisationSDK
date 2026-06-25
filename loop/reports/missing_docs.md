# Missing / Insufficient Docs

Inventory of documentation gaps found during `repo_audit`. "Exists ✓" means the file is present and at least nominally covers the topic; depth is verified later in `docs_gap_analysis`.

## Docs that exist (referenced by README — all present)

- `docs/architecture/OVERVIEW.md` ✓
- `docs/getting-started/INSTALLATION.md` ✓
- `docs/getting-started/QUICKSTART.md` ✓
- `docs/api/SDK_REFERENCE.md` ✓
- `docs/guides/BUILDING_REAL_ESTATE_APP.md` ✓
- `docs/guides/COMPLIANCE.md` ✓

Also present: `docs/api/AUTHENTICATION.md`, `docs/api/REST_API.md`, `docs/getting-started/FIRST_PROJECT.md`, `docs/CONCEPTS.md`, `docs/GLOSSARY.md`, `docs/FAQ.md`, `docs/security/SECURITY_MODEL.md`, `docs/security/SECURITY_AUDIT_CHECKLIST.md`, `docs/deployment/{DOCKER,KUBERNETES}.md`, `docs/guides/{REACT_INTEGRATION,WEBHOOKS,REAL_ESTATE}.md`, `docs/recipes/{AIRLINE_TICKETS,CAR_RENTALS,CONCERT_TICKETS,HOTEL_RESERVATIONS}.md`.

## Gaps (missing or not surfaced in the main flow)

| # | Gap | Impact | Where it should live |
|---|-----|--------|----------------------|
| D1 | **How to get your first API key** is not in the README/QUICKSTART main path. The working command (`pnpm db:seed`) and the `AUTH_DEV_MODE=true` alternative are not surfaced where a new dev starts. | Critical — new dev hits 401 immediately | README Quick Start + `docs/getting-started/QUICKSTART.md`; cross-link `docs/api/AUTHENTICATION.md` |
| D2 | **No loyalty guide or recipe**, despite `@tokenisation/pack-loyalty` shipping and loyalty being the mission's target product. Recipes exist for airline/car/concert/hotel only. | High — target product has no reference | `docs/recipes/LOYALTY_POINTS.md` + `examples/loyalty-minimal/` |
| D3 | **README does not state that dev curl requires `AUTH_DEV_MODE=true`.** `server/README.md:155` has it right; the root README does not. | Critical — broken copy-paste | README Quick Start |
| D4 | **Stubbed features not flagged to users.** Jurisdiction (US/SG), core DB transactions, KYC direct provider, Circle refunds, Azure storage are stubs but no user-facing "limitations / what's mock" doc exists. | Medium — false expectations | `docs/LIMITATIONS.md` or a "Status" section per guide |
| D5 | **No SDK consumer doc for use outside the monorepo** (install/link, ESM/CJS, exports). The `@tokenisation/sdk` exports map is rich but there's no "use this in your own app" walkthrough. | Medium — blocks external adoption | `docs/getting-started/` + verified in `sdk_consumer_test` |
| D6 | **`docs/api/AUTHENTICATION.md` depth unverified** — needs to confirm it documents the seed flow and the three accepted auth headers. | Medium | verify in `docs_gap_analysis` |

## Notes / to verify later

- `docs/getting-started/QUICKSTART.md` currently uses placeholder `apiKey: 'sk_test_xxxxx'` (lines ~24/179) with no pointer to obtaining a real key — same root cause as D1.
- Whether `docs/api/REST_API.md` matches the actual routes is deferred to `api_server_test` (endpoint matrix).
