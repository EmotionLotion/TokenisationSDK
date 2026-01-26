# Security Audit Preparation

This document outlines the security considerations and preparation steps for auditing the AHOY Tokenisation SDK smart contracts.

## Contracts in Scope

### Core Contracts

| Contract | Path | Description |
|----------|------|-------------|
| `ComplianceToken` | `src/tokens/ComplianceToken.sol` | ERC-20 compliant security token with transfer restrictions |
| `IdentityRegistry` | `src/identity/IdentityRegistry.sol` | On-chain identity and KYC management |
| `TokenFactory` | `src/factory/TokenFactory.sol` | Deterministic token deployment factory |

### Oracle Contracts

| Contract | Path | Description |
|----------|------|-------------|
| `ChainlinkPriceFeed` | `src/oracles/ChainlinkPriceFeed.sol` | Chainlink Data Feeds consumer with staleness checks |
| `OracleRegistry` | `src/oracles/OracleRegistry.sol` | Central registry for oracle management |
| `FunctionsConsumer` | `src/oracles/FunctionsConsumer.sol` | Chainlink Functions for off-chain computations |

### Automation Contracts

| Contract | Path | Description |
|----------|------|-------------|
| `DistributionKeeper` | `src/automation/DistributionKeeper.sol` | Automated dividend distributions |
| `ComplianceKeeper` | `src/automation/ComplianceKeeper.sol` | Automated KYC re-verification |

---

## Known Security Considerations

### 1. Access Control

**ComplianceToken**
- `onlyOwner` modifier for administrative functions
- Transfer restrictions based on identity verification
- Consider implementing role-based access control (OpenZeppelin AccessControl)

**IdentityRegistry**
- Admin and operator roles
- Operators can register/update identities
- Consider adding time-locks for admin changes

**Recommendation**: Add 2-of-3 multisig requirement for critical operations.

### 2. Oracle Security

**ChainlinkPriceFeed**
- Implements staleness checks with configurable heartbeat
- Fallback prices for emergency situations
- L2 sequencer uptime checks (for Arbitrum, Optimism, Base)
- Grace period after sequencer recovery

**Potential Issues**:
- Flash loan attacks if prices are used for collateral
- Price manipulation during low liquidity periods

**Mitigations Implemented**:
- Maximum heartbeat limit (24 hours)
- Fallback price mechanism
- Sequencer uptime verification

### 3. Chainlink Functions

**FunctionsConsumer**
- Stores JavaScript source code for execution
- Results are stored on-chain after callback

**Potential Issues**:
- JavaScript source modification by owner
- Callback gas limit misconfiguration
- DON response verification

**Mitigations Implemented**:
- Owner-only source updates
- Configurable gas limits
- Request tracking with status

### 4. Automation (Keepers)

**DistributionKeeper**
- Handles token distributions to multiple recipients
- Uses SafeERC20 for transfers

**Potential Issues**:
- Gas limits on large recipient lists
- Reentrancy during ETH transfers
- Rounding errors in share calculations

**Mitigations Implemented**:
- `maxRecipientsPerExecution` limit
- Separate state updates before transfers
- Basis point calculations (10000 = 100%)

**ComplianceKeeper**
- Monitors KYC expiration
- Triggers re-verification requirements

**Potential Issues**:
- Race conditions in batch updates
- DoS if investor list grows too large

**Mitigations Implemented**:
- `maxInvestorsPerCheck` limit
- Status-based filtering

---

## Invariants to Test

### ComplianceToken
1. Total supply equals sum of all balances
2. Only verified identities can hold tokens (post-transfer)
3. Transfers fail for blacklisted addresses
4. Decimals is always 18

### IdentityRegistry
1. An identity can only be registered once per address
2. Only operators can register/update identities
3. Claims have valid expiration times

### ChainlinkPriceFeed
1. Price is never negative (validation check)
2. Stale data reverts or returns fallback
3. Sequencer down state blocks all price reads

### DistributionKeeper
1. Sum of recipient shares equals 10000 (100%)
2. Distribution only executes after `nextExecution` time
3. Paused distributions are skipped

### ComplianceKeeper
1. Expired KYC sets status to EXPIRED
2. Only authorized providers can update KYC
3. Sanctioned investors cannot be reinstated without explicit action

---

## Testing Checklist

### Unit Tests
- [ ] All functions have unit tests
- [ ] Edge cases covered (zero values, max values)
- [ ] Access control tests for all restricted functions
- [ ] Event emission verification

### Integration Tests
- [ ] Full workflow tests (registration → tokenization → transfer)
- [ ] Oracle integration tests with mock data
- [ ] Automation tests with time manipulation

### Fuzz Tests
- [ ] Input fuzzing for all public functions
- [ ] Property-based testing for invariants
- [ ] Stateful fuzzing for complex interactions

### Gas Optimization
- [ ] Gas benchmarks for common operations
- [ ] Optimization opportunities identified
- [ ] Storage access patterns reviewed

---

## Static Analysis

### Tools to Run

1. **Slither** - Static analyzer
   ```bash
   slither . --filter-paths "lib/|test/"
   ```

2. **Mythril** - Symbolic execution
   ```bash
   myth analyze src/tokens/ComplianceToken.sol
   ```

3. **Aderyn** - Rust-based analyzer
   ```bash
   aderyn .
   ```

### Common Issues to Check
- [ ] Reentrancy vulnerabilities
- [ ] Integer overflow/underflow (Solidity 0.8+ has built-in checks)
- [ ] Access control gaps
- [ ] Unchecked external calls
- [ ] Front-running vulnerabilities
- [ ] Oracle manipulation
- [ ] Denial of service vectors

---

## Dependencies

| Dependency | Version | Security Status |
|------------|---------|-----------------|
| OpenZeppelin Contracts | 5.x | Audited |
| Chainlink Contracts | 1.3.0 | Audited |
| Forge Std | Latest | Development only |

---

## Deployment Security

### Pre-Deployment
1. Run full test suite
2. Deploy to testnet first
3. Verify all contract source code
4. Test with real Chainlink oracles on testnet

### Deployment
1. Use hardware wallet for deployment
2. Deploy from clean environment
3. Verify constructor arguments
4. Document all deployed addresses

### Post-Deployment
1. Transfer ownership to multisig
2. Set up monitoring for critical events
3. Create incident response plan
4. Document upgrade procedures

---

## Audit Scope Recommendations

### High Priority
1. Token transfer logic and restrictions
2. Oracle data validation
3. Access control implementation
4. Fund handling in Keepers

### Medium Priority
1. Gas optimization
2. Event emission correctness
3. Error handling

### Low Priority
1. Code style and documentation
2. Test coverage gaps
3. Administrative functions

---

## Contact

For security inquiries or to report vulnerabilities:
- Email: security@ahoy.dev
- Bug Bounty: [To be announced]

---

*Last Updated: January 2026*
