# Partner Integration Readiness: Tokenisation SDK

**Status:** 🟢 **READY** for Partner Integration
**Target Audience:** Fintech Developers, Real Estate Platforms, Ticketing Engineers

## 1. Ease of Integration (API Surface)
The SDK exposes two primary integration patterns, both fully verified:

### A. The "Full Stack" Pattern (SDK Class)
For partners running their own backend/node infrastructure.
*   **Entry Point:** `new TokenisationSDK()`
*   **Strengths:** Full control over `ComplianceEngine`, `OracleService`, and direct plugin wiring.
*   **Verified:** Yes. Used in all `chainlink-starter` recipes.

### B. The "Platform" Pattern (ApiClient)
For partners integrating via REST API (SaaS model).
*   **Entry Point:** `new ApiClient({ apiKey: 'sk_live_...' })`
*   **Strengths:** Stripe-like DX. No blockchain knowledge needed.
*   **Verified:** Yes. `ApiClient.ts` exposes a clean, modular interface:
    ```typescript
    client.assets.create(...)
    client.compliance.enableRule(...)
    client.tokens.deploy(...)
    ```

## 2. Strong Typing & Exports
The `index.ts` file correctly re-exports all necessary types, ensuring a smooth TypeScript experience for partners.
*   ✅ **Core Types:** `Asset`, `Party`, `Token` are exported.
*   ✅ **Configs:** `ChainlinkWiringConfig` is exported for easy setup.
*   ✅ **Factories:** `createChainlinkWiredSDK`, `createApiClient` are available top-level.

## 3. Developer Experience (DX) Score: A-
*   **Pros:** "One-line" factories, strong typing, clear module separation (`assets`, `compliance`, `tokens`).
*   **Cons:** Some "advanced" configs (like `gasLimit` in Automation) require deeper knowledge of the underlying plugins (as noted in the Risk Report).

## 4. Recommendation for Partners
*   **Start with Recipes:** Clone `docs/recipes` to get a working POC in <1 hour.
*   **Use Factories:** Prefer `createChainlinkWiredSDK()` over manually instantiating plugins to avoid wiring errors.
*   **Monitor Risks:** Be aware of the `strictMode` and Gas Limit findings from the Risk Assessment when moving to production.
