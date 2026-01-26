# Audit Readiness Pack

This document provides security auditors with a comprehensive overview of the Tokenisation SDK smart contracts.

## Contract Overview

### Core Contracts

| Contract | LOC | Purpose | Risk Level |
|----------|-----|---------|------------|
| `ComplianceToken.sol` | ~480 | ERC-20 with transfer restrictions | 🔴 High |
| `ComplianceMultiToken.sol` | ~650 | ERC-1155 with per-tokenId compliance | 🔴 High |
| `TokenFactory.sol` | ~350 | CREATE2 deterministic deployment | 🟡 Medium |
| `IdentityRegistry.sol` | ~300 | KYC claims management | 🔴 High |
| `ModularCompliance.sol` | ~250 | Pluggable compliance modules | 🟡 Medium |

### Supporting Contracts

| Contract | LOC | Purpose | Risk Level |
|----------|-----|---------|------------|
| `DividendDistributor.sol` | ~200 | Dividend distribution | 🟡 Medium |
| `OracleRegistry.sol` | ~180 | Chainlink price feed management | 🟡 Medium |
| `ChainlinkPriceFeed.sol` | ~150 | Price feed wrapper | 🟢 Low |
| Compliance Modules | ~100 each | Transfer rule modules | 🟢 Low |

---

## Threat Model

### 1. Privileged Role Abuse

**Threat**: Admin/Agent/Compliance roles could abuse their powers.

| Role | Capabilities | Risk |
|------|--------------|------|
| **Owner** | Pause token, add/remove agents, transfer ownership | 🔴 Critical |
| **Agent** | Mint tokens, force transfers, burn | 🔴 Critical |
| **Compliance** | Freeze accounts, modify rules | 🟡 High |
| **Factory Admin** | Deploy new tokens, deactivate tokens | 🟡 Medium |

**Mitigations:**
- Multi-sig recommended for owner role
- Time-locks on critical operations (not implemented - recommended)
- Events emitted for all privileged actions
- Force transfers require reason string

**Audit Focus:**
- [ ] Verify role separation is enforced
- [ ] Check for missing access modifiers
- [ ] Ensure events emitted for all admin actions

### 2. Transfer Restriction Bypass

**Threat**: Attacker bypasses KYC/compliance checks.

**Attack Vectors:**
1. Direct `_transfer()` call (protected: internal)
2. Approval manipulation
3. Flash loan + transfer in same block
4. Country code spoofing

**Mitigations:**
- `_transfer()` is internal, always calls `_isCompliantTransfer()`
- Approval doesn't bypass compliance (transferFrom still checks)
- Compliance checks are synchronous (no timing attacks)
- Country codes come from trusted `IdentityRegistry`

**Audit Focus:**
- [ ] All transfer paths go through compliance check
- [ ] No way to bypass `_isCompliantTransfer()`
- [ ] Allowance doesn't grant compliance bypass

### 3. Oracle Manipulation

**Threat**: Manipulated price feeds affect token operations.

**Attack Vectors:**
1. Flash loan oracle manipulation
2. Stale price data
3. Oracle downtime

**Mitigations:**
- Chainlink price feeds have built-in staleness checks
- `OracleRegistry` validates heartbeat
- Fallback mechanisms for oracle failure (not critical path)

**Audit Focus:**
- [ ] Price feed staleness checks
- [ ] Graceful degradation on oracle failure
- [ ] No critical operations depend solely on oracle

### 4. Reentrancy

**Threat**: Reentrant calls drain funds or corrupt state.

**Vulnerable Patterns:**
- External calls before state updates
- Callback-enabled functions

**Analysis:**

| Function | External Calls | Reentrancy Risk |
|----------|---------------|-----------------|
| `transfer()` | None | ✅ Safe |
| `mint()` | None | ✅ Safe |
| `burn()` | None | ✅ Safe |
| `forceTransfer()` | None | ✅ Safe |
| `safeTransferFrom()` (1155) | `onERC1155Received` | ⚠️ Check |

**Mitigations:**
- Checks-Effects-Interactions pattern followed
- No ETH transfers (no receive/fallback)
- State updated before any potential callbacks

**Audit Focus:**
- [ ] CEI pattern in all state-changing functions
- [ ] ERC-1155 receiver callbacks are safe
- [ ] No unexpected external calls

### 5. Signature Replay

**Threat**: Reuse of signatures for claims or permits.

**Attack Vectors:**
1. Cross-chain replay (same claim on different chains)
2. Replay after claim revocation
3. Nonce reuse

**Mitigations:**
- Claims have unique `claimId` (hash-based)
- Claims can be revoked by issuer
- Chain ID not in claim (⚠️ potential issue)

**Audit Focus:**
- [ ] Claim signatures include chain ID
- [ ] Nonces properly incremented
- [ ] Revoked claims cannot be re-added

### 6. Integer Overflow/Underflow

**Threat**: Arithmetic operations overflow/underflow.

**Mitigations:**
- Solidity 0.8.20 has built-in overflow checks
- `unchecked` blocks used only for gas optimization
- All `unchecked` uses are safe (post-validation)

**Audit Focus:**
- [ ] Review all `unchecked` blocks
- [ ] Verify pre-conditions before unchecked math
- [ ] No user-controlled values in unchecked blocks

### 7. CREATE2 Address Collision

**Threat**: Attacker pre-computes address and deploys malicious contract.

**Attack Vector:**
1. Predict CREATE2 address
2. Deploy malicious contract to same address on another chain
3. User interacts with wrong contract

**Mitigations:**
- Salt includes deployer address
- `deploymentNonce` prevents salt reuse
- Address computation is deterministic and verifiable

**Audit Focus:**
- [ ] Salt derivation includes deployer
- [ ] Cannot deploy to same address twice
- [ ] Cross-chain address collision considered

---

## Roles & Permissions Matrix

### ComplianceToken Permissions

| Function | Owner | Agent | Compliance | Anyone |
|----------|-------|-------|------------|--------|
| `transfer()` | ✅ | ✅ | ✅ | ✅ |
| `mint()` | ✅ | ✅ | ❌ | ❌ |
| `burn()` | ✅ | ✅ | ✅ | ✅ (own) |
| `forceTransfer()` | ✅ | ✅ | ❌ | ❌ |
| `freeze()` | ✅ | ❌ | ✅ | ❌ |
| `unfreeze()` | ✅ | ❌ | ✅ | ❌ |
| `setComplianceRules()` | ✅ | ❌ | ✅ | ❌ |
| `pause()` | ✅ | ❌ | ❌ | ❌ |
| `addAgent()` | ✅ | ❌ | ❌ | ❌ |
| `transferOwnership()` | ✅ | ❌ | ❌ | ❌ |

### IdentityRegistry Permissions

| Function | Owner | Verifier | Anyone |
|----------|-------|----------|--------|
| `registerIdentity()` | ✅ | ✅ | ❌ |
| `addClaim()` | ✅ | ✅ | ❌ |
| `removeClaim()` | ✅ | ✅ | ❌ |
| `addVerifier()` | ✅ | ❌ | ❌ |
| `removeVerifier()` | ✅ | ❌ | ❌ |
| `getIdentity()` | ✅ | ✅ | ✅ |
| `isVerified()` | ✅ | ✅ | ✅ |

---

## Attack Surface Summary

### External Entry Points

| Contract | Function | Access | Risk |
|----------|----------|--------|------|
| ComplianceToken | `transfer()` | Public | Medium |
| ComplianceToken | `transferFrom()` | Public | Medium |
| ComplianceToken | `approve()` | Public | Low |
| ComplianceToken | `mint()` | Agent | High |
| ComplianceToken | `forceTransfer()` | Agent | High |
| ComplianceMultiToken | `safeTransferFrom()` | Public | Medium |
| ComplianceMultiToken | `safeBatchTransferFrom()` | Public | Medium |
| TokenFactory | `deployComplianceToken()` | Public | Medium |
| TokenFactory | `deployMultiToken()` | Public | Medium |
| IdentityRegistry | `addClaim()` | Verifier | High |

### Trust Assumptions

1. **Owner is trusted** - Can pause, upgrade, change rules
2. **Agents are trusted** - Can mint, force transfer
3. **Compliance officers are trusted** - Can freeze accounts
4. **Identity verifiers are trusted** - Can issue KYC claims
5. **Chainlink oracles are trusted** - Price data assumed accurate

### Known Limitations

1. **No time-locks**: Admin actions are immediate
2. **No multi-sig enforcement**: Single owner key risk
3. **Centralized claim issuance**: Verifiers are trusted parties
4. **No on-chain governance**: Rule changes are admin-controlled
5. **No upgradeability**: Contracts are immutable once deployed

---

## Invariants for Testing

### Supply Invariants

```solidity
// Total supply equals sum of all balances
assert(totalSupply == sum(balanceOf[address]) for all addresses);

// Minting increases supply by exact amount
uint256 supplyBefore = token.totalSupply();
token.mint(to, amount);
assert(token.totalSupply() == supplyBefore + amount);

// Burning decreases supply by exact amount
uint256 supplyBefore = token.totalSupply();
token.burn(amount);
assert(token.totalSupply() == supplyBefore - amount);
```

### Transfer Invariants

```solidity
// Transfers preserve total supply
uint256 supplyBefore = token.totalSupply();
token.transfer(to, amount);
assert(token.totalSupply() == supplyBefore);

// Frozen accounts cannot send or receive
assert(token.isFrozen(from) => transfer reverts);
assert(token.isFrozen(to) => transfer reverts);

// Compliance check is always performed
assert(transfer succeeds => _isCompliantTransfer(from, to, amount) == true);
```

### Identity Invariants

```solidity
// Registered identity has valid address
assert(hasIdentity(user) => getIdentity(user) != address(0));

// Claim requires registered identity
assert(hasClaim(user, topic) => hasIdentity(user));

// Verified requires all specified claims
assert(isVerified(user, claims) => forall(c in claims, hasClaim(user, c)));
```

---

## Recommended Audit Scope

### Priority 1 (Critical)
- [ ] `ComplianceToken.sol` - All functions
- [ ] `ComplianceMultiToken.sol` - All functions
- [ ] `IdentityRegistry.sol` - Claim management
- [ ] Access control on all privileged functions

### Priority 2 (High)
- [ ] `TokenFactory.sol` - CREATE2 deployment
- [ ] `ModularCompliance.sol` - Module interactions
- [ ] Transfer restriction bypass attempts

### Priority 3 (Medium)
- [ ] `DividendDistributor.sol` - Distribution logic
- [ ] `OracleRegistry.sol` - Price feed handling
- [ ] Compliance modules

### Out of Scope
- Off-chain components (API, SDK)
- Test contracts
- Deployment scripts

---

## Contact

For audit coordination, contact the development team with:
- Specific contract versions (commit hash)
- Deployment parameters
- Expected threat model assumptions
