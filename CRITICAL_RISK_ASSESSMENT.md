# Critical Risk Assessment: Tokenisation SDK & Chainlink

**Severity:** 🔴 **HIGH RISK** (in default configuration)
**Target**: Production Mainnet Deployment

## ~~1. Compliance Engine: The "Silent Failure" Risk~~ RESOLVED
**Finding:** Previously, the `ComplianceEngine` treated Proof of Reserve (PoR) failures as **WARNINGS**, not **VIOLATIONS**.
**Fix Applied:** Both PoR catch blocks (mint ~line 663 and transfer ~line 913) now check `this.strictMode || this.porConfig?.enabled`. When either flag is set, PoR errors push to `violations` (fail-closed) instead of `warnings` (fail-open). The warning fallback is preserved only for the case where neither strict mode nor PoR is explicitly enabled (defensively unreachable).
**Status:** RESOLVED. Production deployments with `strictMode: true` or `porConfig.enabled: true` will now correctly block operations when PoR checks fail.

## ~~2. CCIP Bridge: Hardcoded Execution Limits~~ RESOLVED
**Finding:** Previously, `CCIPBridgePlugin.ts` used `extraArgs: '0x'` for all messages.
**Fix Applied:** Added `gasLimit?: number` to `CCIPTransferParams`. A new `encodeExtraArgs()` helper encodes the EVMExtraArgsV1 tag (`0x97a657c9`) + ABI-encoded `uint256` gasLimit. Both `estimateFee` and `bridgeTokens` now call `encodeExtraArgs(params.gasLimit)`. Backwards compatible — omitting gasLimit preserves the previous `'0x'` default behavior.
**Status:** RESOLVED. Partners can now specify destination chain gas limits for complex receiver contracts.

## 3. Automation Plugin: Blind Gas Limits
**Finding:** `registerUpkeep` accepts a raw `gasLimit` number from the user without simulation.
**Evidence:** `AutomationPlugin.ts` passes `params.gasLimit` directly to the Registry.
**Risk:** If a user registers an upkeep with insufficient gas (e.g., 500k for a complex compliance check that needs 1M), the Automation Network will attempt to perform, fail, and **burn the user's LINK balance** repeatedly until drained.
**Mitigation:** Implement `simulateCheckUpkeep` during registration to auto-estimate gas.

## 4. Oracle Service: Aggressive Caching
**Finding:** `OracleService.sol` allows `USE_CACHED` mode.
**Risk:** In high-volatility markets (Crypto), using a price from 5 minutes ago (default `maxDataAgeMs`) allows arbitrage exploitation.
**Mitigation:** For "Atomic Settlement" use cases, `maxDataAgeMs` should be reduced to <30s.

## 5. Private Key Security
**Finding:** The SDK accepts `privateKey` as a plain string in config.
**Risk:** This encourages hardcoding keys in `.env` or code.
**Mitigation:** Production deployments should use a dedicated `Signer` instance (e.g., Fireblocks, Ledger, or AWS KMS) passed via `connectSigner()`, never raw keys.

---
## Final Verdict
The SDK is **Feature Complete** but **Security Loose**. It works "Happy Path" end-to-end, but in a "Worst Case" (Oracle Down, High Gas, Attack Attempt), it fails open or burns funds.

**DO NOT DEPLOY TO MAINNET WITHOUT:**
1.  ~~Enable `strictMode: true`~~ DONE — PoR catch blocks now fail-closed when `strictMode` or `porConfig.enabled` is set
2.  ~~Implement `extraArgs` for CCIP~~ DONE — `gasLimit` parameter added to `CCIPTransferParams`
3.  Simulate Gas for Automation
4.  Use External Signers
