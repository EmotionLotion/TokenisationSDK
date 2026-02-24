# Smart Contract Security Audit Checklist

Pre-deployment security review for all Tokenisation Platform smart contracts.

## 1. Token Minting / Burning Access Control

- [ ] Only authorized minter role(s) can call `mint()` — verify `onlyRole(MINTER_ROLE)` or equivalent
- [ ] Only authorized burner role(s) can call `burn()` / `burnFrom()`
- [ ] Role admin is set to a multisig or timelock, not an EOA
- [ ] No public or unprotected mint functions exist
- [ ] Minting can be paused via `pause()` and the pauser role is properly restricted
- [ ] Total supply cap (if any) is enforced on-chain, not just off-chain
- [ ] `mint()` emits an event that can be monitored
- [ ] Re-entrancy guard on mint/burn if they interact with external contracts

## 2. Compliance Gate Enforcement

- [ ] Transfer hook (`_beforeTokenTransfer` / `_update`) calls the compliance contract
- [ ] Compliance contract cannot be bypassed by direct ERC-20 `transfer()` or `transferFrom()`
- [ ] Compliance checks cover: KYC status, jurisdiction, investor accreditation, lockup period
- [ ] Whitelist/allowlist is enforced on both sender and recipient
- [ ] Frozen accounts cannot send or receive tokens
- [ ] Paused token blocks all transfers (not just minting)
- [ ] Compliance contract address can only be updated by admin with timelock
- [ ] Edge case: self-transfers are handled correctly
- [ ] Edge case: zero-amount transfers do not bypass compliance

## 3. Oracle Data Validation

- [ ] Oracle data freshness is checked on-chain (reject stale data beyond threshold)
- [ ] Oracle response is validated for expected format and bounds
- [ ] Chainlink Functions request uses authenticated API calls (API key in secrets)
- [ ] DON ID and subscription ID are correct for the target network
- [ ] Oracle failure does not leave the contract in an inconsistent state
- [ ] Fallback behavior on oracle failure is safe (deny by default, not allow)
- [ ] Price/NAV values have sanity bounds (e.g., reject if change > 50% in one update)
- [ ] Oracle update can only be triggered by authorized callers

## 4. CCIP Cross-Chain Transfer Safety

- [ ] Source chain locks/burns tokens before sending CCIP message
- [ ] Destination chain mints/unlocks only after validating CCIP message
- [ ] CCIP message includes sender, recipient, amount, and compliance attestation
- [ ] Receiver contract validates the source chain and sender contract address
- [ ] Failed CCIP messages can be retried without double-minting
- [ ] Rate limiting exists on cross-chain transfers (per-user and global)
- [ ] Cross-chain transfer respects compliance rules on both chains
- [ ] Gas limit for CCIP callback is sufficient and tested

## 5. Proof of Reserve (PoR) Verification

- [ ] PoR oracle feed is checked before minting new tokens
- [ ] Minting is blocked if total supply would exceed reserve value
- [ ] PoR data source is from a trusted Chainlink feed or equivalent
- [ ] PoR staleness threshold is configured (e.g., reject data > 24h old)
- [ ] PoR value uses correct decimals matching token decimals
- [ ] Manual override of PoR check requires multisig + timelock
- [ ] PoR check cannot be front-run to mint before reserve update

## 6. Allowlist / Blocklist Management

- [ ] Only admin role can add/remove addresses from allowlist
- [ ] Only admin role can add/remove addresses from blocklist
- [ ] Blocklist takes precedence over allowlist
- [ ] Batch operations (add/remove multiple addresses) are gas-efficient
- [ ] Adding to blocklist automatically freezes existing holdings
- [ ] Removing from allowlist does not allow existing holders to transfer
- [ ] Events are emitted for all allowlist/blocklist changes
- [ ] Allowlist/blocklist state is queryable on-chain for compliance verification

## 7. General Smart Contract Security

- [ ] All contracts use OpenZeppelin or equivalent audited base contracts
- [ ] Solidity compiler version is fixed (not floating `^`)
- [ ] No use of `tx.origin` for authorization
- [ ] No unprotected `selfdestruct` or `delegatecall`
- [ ] Integer overflow/underflow protection (Solidity 0.8+ or SafeMath)
- [ ] Re-entrancy guards on all state-changing external calls
- [ ] Proper use of `nonReentrant` modifier on functions that transfer ETH/tokens
- [ ] No storage collision in upgradeable proxy patterns
- [ ] Initializer functions are protected with `initializer` modifier
- [ ] Upgrade mechanism requires multisig/timelock governance

## 8. Deployment & Operations

- [ ] All constructor/initializer parameters are validated
- [ ] Deployer key is not hardcoded — use environment variables
- [ ] Contract verification on block explorer (Etherscan/Basescan) after deployment
- [ ] Emergency pause functionality exists and is tested
- [ ] Contract addresses are documented and version-controlled
- [ ] ABI artifacts are committed and match deployed bytecode
- [ ] Gas costs for critical operations have been benchmarked
- [ ] Slither / Mythril / Aderyn static analysis passes with no high-severity findings

## Contracts Inventory

| Category | Contract | Description |
|----------|----------|-------------|
| **Tokens** | `ComplianceToken` | ERC-20 + ERC-3643 compliance |
| | `ComplianceTokenUpgradeable` | UUPS upgradeable variant |
| | `ComplianceMultiToken` | ERC-1155 with per-token compliance |
| | `RealToken` | Real estate token |
| | `AhoyToken` | Platform utility token |
| | `AccessPassNFT` | Access pass NFT |
| | `ReputationSBT` | Soulbound reputation token (ERC-5192) |
| **Vertical NFTs** | `AirlineTicketNFT` | Airline ticket with boarding data |
| | `HotelReservationNFT` | Hotel reservation with dates/room |
| | `CarRentalNFT` | Car rental with vehicle/dates |
| | `ConcertTicketNFT` | Concert ticket with seat/venue |
| **Identity** | `IdentityRegistry` | KYC/AML claim management (ERC-734/735) |
| | `ClaimTopicsRegistry` | Claim topic definitions |
| | `TrustedIssuersRegistry` | Trusted claim issuers |
| **Compliance** | `ModularCompliance` | Pluggable compliance modules |
| | Modules | Country restrict, max balance, max holders, transfer fees |
| | Policy | On-chain policy enforcement |
| **Factory** | `TokenFactory` | CREATE2 deterministic deployment |
| **Governance** | `TokenGovernor` | On-chain governance + timelock |
| **Distribution** | `DividendDistributor` | Dividend payments |
| **Oracles** | `OracleRegistry` | Chainlink feed aggregation |
| | `ProofOfReserve` | Reserve verification |
| **Automation** | Keeper contracts | Chainlink Automation integration |
| **Bridge** | `CCIPBridge` | Cross-chain token transfers |

## Audit Status

| Contract | Internal Review | External Audit | Date | Auditor |
|----------|:--------------:|:--------------:|------|---------|
| ComplianceToken | [ ] | [ ] | — | — |
| ComplianceTokenUpgradeable | [ ] | [ ] | — | — |
| ComplianceMultiToken | [ ] | [ ] | — | — |
| IdentityRegistry | [ ] | [ ] | — | — |
| ModularCompliance | [ ] | [ ] | — | — |
| TokenFactory | [ ] | [ ] | — | — |
| TokenGovernor | [ ] | [ ] | — | — |
| DividendDistributor | [ ] | [ ] | — | — |
| OracleRegistry | [ ] | [ ] | — | — |
| CCIPBridge | [ ] | [ ] | — | — |
| ProofOfReserve | [ ] | [ ] | — | — |
| AirlineTicketNFT | [ ] | [ ] | — | — |
| HotelReservationNFT | [ ] | [ ] | — | — |
| CarRentalNFT | [ ] | [ ] | — | — |
| ConcertTicketNFT | [ ] | [ ] | — | — |

## Test Coverage

- **5 test suites**, **108 tests** passing
- `ComplianceToken.t.sol` — Core token + compliance
- `AirlineTicketNFT.t.sol` — Airline vertical
- `HotelReservationNFT.t.sol` — Hotel vertical
- `CarRentalNFT.t.sol` — Car rental vertical
- `ConcertTicketNFT.t.sol` — Concert vertical
