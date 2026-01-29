# Smart Contract Security Audit Guide

This document provides a comprehensive guide for conducting security audits on TokenisationSDK smart contracts. It is designed for both internal security reviews and to facilitate third-party audits.

## Table of Contents

1. [Overview](#overview)
2. [Contract Inventory](#contract-inventory)
3. [Pre-Audit Checklist](#pre-audit-checklist)
4. [Security Audit Checklist](#security-audit-checklist)
5. [ERC-3643 Compliance Verification](#erc-3643-compliance-verification)
6. [Common Vulnerability Patterns](#common-vulnerability-patterns)
7. [Gas Optimization Review](#gas-optimization-review)
8. [Audit Methodology](#audit-methodology)
9. [Recommended Audit Firms](#recommended-audit-firms)
10. [Post-Audit Process](#post-audit-process)

---

## Overview

The TokenisationSDK smart contracts implement the ERC-3643 (T-REX) standard for security tokens. These contracts handle:

- **Compliant token transfers** with identity verification
- **Modular compliance rules** (investor caps, jurisdiction restrictions, lockup periods)
- **Token lifecycle management** (minting, burning, freezing, recovery)
- **Role-based access control** for agents and administrators

### Critical Security Considerations

1. **Regulatory Compliance**: Contracts must enforce transfer restrictions
2. **Identity Management**: Integration with identity registries
3. **Asset Protection**: Freeze and recovery mechanisms for lost wallets
4. **Access Control**: Agent roles must be properly secured

---

## Contract Inventory

| Contract | Purpose | Risk Level | Dependencies |
|----------|---------|------------|--------------|
| `RealToken.sol` | ERC-3643 compliant security token | **CRITICAL** | OpenZeppelin ERC20, IIdentityRegistry, ICompliance |
| `ModularCompliance.sol` | Pluggable compliance module system | **HIGH** | ICompliance, Ownable |
| `TokenFactory.sol` | Token deployment factory | **HIGH** | RealToken, Create2 |
| `IdentityRegistry.sol` | Investor identity management | **HIGH** | IIdentityRegistry, ITrustedIssuersRegistry |
| `ClaimTopicsRegistry.sol` | Required claim topics | **MEDIUM** | IClaimTopicsRegistry |
| `TrustedIssuersRegistry.sol` | Trusted KYC issuers | **MEDIUM** | ITrustedIssuersRegistry |

### Contract Addresses (By Network)

| Network | RealToken | ModularCompliance | TokenFactory |
|---------|-----------|-------------------|--------------|
| Mainnet | TBD | TBD | TBD |
| Sepolia | TBD | TBD | TBD |
| Anvil (Local) | Deployed per test | Deployed per test | Deployed per test |

---

## Pre-Audit Checklist

Before engaging auditors, ensure the following are complete:

### Documentation
- [ ] All contracts have comprehensive NatSpec documentation
- [ ] Architecture diagrams are up to date
- [ ] State machine diagrams for complex flows
- [ ] Access control matrix documented
- [ ] Known issues/limitations documented

### Code Quality
- [ ] All tests passing (unit, integration, fuzz)
- [ ] Code coverage > 90%
- [ ] Static analysis run (Slither, Mythril)
- [ ] Code formatted consistently (forge fmt)
- [ ] No compiler warnings

### Deployment
- [ ] Deployment scripts tested on testnet
- [ ] Upgrade path documented (if applicable)
- [ ] Initial state configuration documented
- [ ] Emergency procedures documented

### Access
- [ ] Audit firm has repo access
- [ ] Test environment available
- [ ] Communication channel established
- [ ] Timeline agreed upon

---

## Security Audit Checklist

### 1. Access Control

- [ ] **Role Separation**: Admin vs Agent vs User roles properly separated
- [ ] **Owner Functions**: Only owner can change critical configurations
- [ ] **Agent Functions**: Agents have appropriate limited capabilities
- [ ] **Renounce/Transfer Ownership**: Proper safeguards exist
- [ ] **Multi-sig Requirements**: Critical functions require multi-sig (if applicable)

```solidity
// Example: Check these patterns
onlyOwner
onlyAgent
hasRole(bytes32 role, address account)
```

### 2. Reentrancy

- [ ] **External Calls**: All external calls follow checks-effects-interactions
- [ ] **State Updates**: State updated before external calls
- [ ] **Reentrancy Guards**: `nonReentrant` modifier on sensitive functions
- [ ] **Cross-function Reentrancy**: Check for reentrancy across multiple functions

```solidity
// Functions to check:
transfer()
transferFrom()
mint()
burn()
forcedTransfer()
recoveryAddress()
```

### 3. Integer Overflow/Underflow

- [ ] **Solidity 0.8+**: Built-in overflow protection enabled
- [ ] **Unchecked Blocks**: Review any `unchecked {}` usage
- [ ] **Type Casting**: Safe downcasting of integers
- [ ] **Multiplication Before Division**: Prevent precision loss

### 4. Token Standard Compliance

- [ ] **ERC-20 Compliance**: Standard functions return correct values
- [ ] **Transfer Events**: Events emitted for all transfers
- [ ] **Zero Address**: Cannot mint/transfer to address(0)
- [ ] **Self Transfer**: Self-transfers handled correctly

### 5. Compliance Module Security

- [ ] **Module Binding**: Modules can only be bound to one token
- [ ] **Module Updates**: Compliance can be updated safely
- [ ] **Transfer Validation**: `canTransfer` cannot be bypassed
- [ ] **Batch Operations**: Batch functions validate all recipients

### 6. Freeze/Recovery Mechanisms

- [ ] **Freeze Validation**: Only authorized agents can freeze
- [ ] **Partial Freeze**: Correctly tracks frozen amounts
- [ ] **Recovery Process**: Recovery validates new wallet identity
- [ ] **Recovery Events**: Proper events emitted for recovery

### 7. Input Validation

- [ ] **Zero Address Checks**: All address parameters validated
- [ ] **Array Length Matching**: Batch operations check array lengths
- [ ] **Amount Validation**: Non-zero amounts where required
- [ ] **Boundary Conditions**: Min/max values enforced

### 8. Storage and State

- [ ] **Storage Collisions**: No storage slot collisions (upgradeable patterns)
- [ ] **State Consistency**: State remains consistent after failures
- [ ] **Initialization**: Cannot be initialized twice
- [ ] **Gap Arrays**: Proper `__gap` arrays for upgradeability

### 9. External Dependencies

- [ ] **OpenZeppelin Version**: Using latest stable version
- [ ] **Import Verification**: All imports from verified sources
- [ ] **Interface Compliance**: External contract calls match interfaces
- [ ] **Callback Safety**: Callbacks from external contracts handled safely

### 10. Denial of Service

- [ ] **Unbounded Loops**: No loops over unbounded arrays
- [ ] **Gas Limits**: Batch operations have reasonable limits
- [ ] **Fail Open/Closed**: Functions fail closed (secure default)
- [ ] **Emergency Stop**: Pause mechanism exists and works

---

## ERC-3643 Compliance Verification

The ERC-3643 standard (T-REX) requires specific functionality. Verify each requirement:

### Identity Registry Integration

- [ ] `identityRegistry()` returns valid registry address
- [ ] `setIdentityRegistry()` only callable by owner
- [ ] Token transfers verify receiver identity via registry
- [ ] Identity must have required claims to receive tokens

### Compliance Contract Integration

- [ ] `compliance()` returns valid compliance address
- [ ] `setCompliance()` only callable by owner
- [ ] Transfers call `compliance.canTransfer()` before execution
- [ ] `compliance.created()` called on mint
- [ ] `compliance.destroyed()` called on burn
- [ ] `compliance.transferred()` called on transfer

### Token Operations

- [ ] `mint(address, uint256)` - Mints to verified addresses only
- [ ] `burn(address, uint256)` - Burns from any holder
- [ ] `forcedTransfer(from, to, amount)` - Agent-only forced transfer
- [ ] `pause()` / `unpause()` - Halts all transfers
- [ ] `setAddressFrozen(address, bool)` - Freezes entire address
- [ ] `freezePartialTokens(address, amount)` - Partial freeze
- [ ] `unfreezePartialTokens(address, amount)` - Partial unfreeze
- [ ] `recoveryAddress(lost, new, identity)` - Wallet recovery

### Batch Operations

- [ ] `batchTransfer(addresses[], amounts[])` - Multiple transfers
- [ ] `batchMint(addresses[], amounts[])` - Multiple mints
- [ ] `batchBurn(addresses[], amounts[])` - Multiple burns
- [ ] `batchSetAddressFrozen(addresses[], states[])` - Multiple freezes
- [ ] `batchForcedTransfer(froms[], tos[], amounts[])` - Multiple forced

### Events

Verify all required events are emitted:

- [ ] `TokensMinted(address indexed to, uint256 amount)`
- [ ] `TokensBurned(address indexed from, uint256 amount)`
- [ ] `TokensFrozen(address indexed user, uint256 amount)`
- [ ] `TokensUnfrozen(address indexed user, uint256 amount)`
- [ ] `AddressFrozen(address indexed user, bool isFrozen, address indexed agent)`
- [ ] `IdentityRegistrySet(address indexed identityRegistry)`
- [ ] `ComplianceSet(address indexed compliance)`
- [ ] `RecoverySuccess(address indexed lost, address indexed new, address indexed identity)`
- [ ] `Paused(address account)` (inherited from OpenZeppelin)
- [ ] `Unpaused(address account)` (inherited from OpenZeppelin)

---

## Common Vulnerability Patterns

### High Severity

1. **Privilege Escalation**
   - Agent promotes themselves to owner
   - Compliance bypass through malicious module

2. **Fund Loss**
   - Tokens stuck in contract
   - Recovery to wrong address
   - Burn without authorization

3. **Compliance Bypass**
   - Transfer without identity check
   - Transfer while paused
   - Transfer from frozen account

### Medium Severity

1. **Front-running**
   - Compliance rules changed mid-transaction
   - Agent role changes during operation

2. **Event Manipulation**
   - Missing events for state changes
   - Incorrect event parameters

3. **Initialization Issues**
   - Unprotected initialization
   - Incomplete initialization

### Low Severity

1. **Gas Inefficiency**
   - Redundant storage reads
   - Inefficient loops
   - Unnecessary state changes

2. **Code Quality**
   - Missing error messages
   - Inconsistent naming
   - Dead code

---

## Gas Optimization Review

### Storage Patterns

```solidity
// Pack related variables
struct TokenHolder {
    uint128 frozenTokens;    // Slot 1 (128 bits)
    uint64 lockupEnd;        // Slot 1 (192 bits)
    bool isFrozen;           // Slot 1 (200 bits)
    // 56 bits remaining in slot 1
}
```

### Optimization Checklist

- [ ] **Storage Packing**: Related small variables packed into single slots
- [ ] **Caching**: Storage variables cached in memory for loops
- [ ] **Short-circuiting**: Cheap checks before expensive ones
- [ ] **Batch Operations**: Amortize fixed costs across multiple operations
- [ ] **Events vs Storage**: Use events for data that doesn't need on-chain access
- [ ] **Immutable/Constant**: Use `immutable` and `constant` where possible

### Gas Benchmarks

| Operation | Expected Gas | Actual Gas | Status |
|-----------|--------------|------------|--------|
| transfer() | ~65,000 | TBD | |
| mint() | ~100,000 | TBD | |
| batchTransfer(10) | ~400,000 | TBD | |
| freeze() | ~45,000 | TBD | |

---

## Audit Methodology

### Phase 1: Automated Analysis

1. **Static Analysis**
   ```bash
   # Run Slither
   slither . --config-file slither.config.json

   # Run Mythril
   myth analyze contracts/tokens/RealToken.sol --solc-json mythril.config.json
   ```

2. **Test Coverage**
   ```bash
   forge coverage --report lcov
   ```

3. **Formal Verification** (if applicable)
   ```bash
   # Certora
   certoraRun contracts/tokens/RealToken.sol --verify RealToken:specs/RealToken.spec
   ```

### Phase 2: Manual Review

1. **Architecture Review**
   - Trust boundaries
   - Data flow
   - Access control model

2. **Line-by-Line Review**
   - Security patterns
   - Edge cases
   - Business logic

3. **Integration Points**
   - External contract calls
   - Oracle dependencies
   - Upgrade mechanisms

### Phase 3: Dynamic Testing

1. **Fuzz Testing**
   ```bash
   forge test --match-contract FuzzTest -vvv
   ```

2. **Invariant Testing**
   ```bash
   forge test --match-contract InvariantTest -vvv
   ```

3. **Mainnet Fork Testing**
   ```bash
   forge test --fork-url $MAINNET_RPC -vvv
   ```

---

## Recommended Audit Firms

### Tier 1 (Security Token Experience)

| Firm | Specialty | Contact |
|------|-----------|---------|
| OpenZeppelin | General smart contracts, ERC standards | audit@openzeppelin.com |
| Trail of Bits | Complex systems, formal methods | audit@trailofbits.com |
| Consensys Diligence | DeFi, security tokens | diligence@consensys.net |

### Tier 2 (Blockchain Security)

| Firm | Specialty | Contact |
|------|-----------|---------|
| Certik | Automated + manual analysis | business@certik.com |
| Halborn | Smart contracts, penetration testing | contact@halborn.com |
| Quantstamp | DeFi, automated verification | request@quantstamp.com |

### Budget Estimates

| Scope | Duration | Cost Range |
|-------|----------|------------|
| Single contract review | 1-2 weeks | $20,000 - $50,000 |
| Full protocol audit | 4-6 weeks | $100,000 - $300,000 |
| Ongoing security retainer | Monthly | $10,000 - $30,000 |

---

## Post-Audit Process

### Findings Classification

| Severity | Definition | Response Time |
|----------|------------|---------------|
| **Critical** | Direct fund loss or compliance bypass | Immediate fix, no deployment |
| **High** | Potential fund loss or major functionality issue | Fix before deployment |
| **Medium** | Indirect impact or limited scope issues | Fix or document mitigation |
| **Low** | Best practices, gas optimization | Optional fix |
| **Informational** | Suggestions, code quality | Optional |

### Remediation Workflow

1. **Acknowledge** - Confirm each finding with auditor
2. **Triage** - Classify severity and assign priority
3. **Fix** - Implement remediation
4. **Review** - Auditor reviews fixes
5. **Retest** - Verify fixes don't introduce new issues
6. **Document** - Update documentation with changes

### Public Disclosure

- [ ] Publish audit report (redacted if needed)
- [ ] Document any known limitations
- [ ] Maintain security contact for reports
- [ ] Bug bounty program consideration

### Continuous Security

- [ ] Set up monitoring for contract events
- [ ] Implement incident response plan
- [ ] Schedule regular security reviews
- [ ] Maintain relationship with auditor

---

## Appendix A: Slither Configuration

```json
{
  "detectors_to_exclude": [
    "naming-convention",
    "solc-version"
  ],
  "exclude_informational": false,
  "exclude_low": false,
  "exclude_medium": false,
  "exclude_high": false,
  "filter_paths": [
    "node_modules",
    "lib"
  ]
}
```

## Appendix B: Security Contact

For security vulnerabilities, please report to:

- **Email**: security@tokenisation.io
- **PGP Key**: Available at https://tokenisation.io/.well-known/security.txt
- **Bug Bounty**: https://tokenisation.io/security/bug-bounty

Do NOT disclose security vulnerabilities publicly until they have been addressed.

---

*Last Updated: January 2026*
*Version: 1.0.0*
