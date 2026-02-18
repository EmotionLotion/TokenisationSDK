---
sidebar_position: 4
title: Core Concepts
---

# Core Concepts

This page explains the fundamental building blocks of the AHOY Tokenisation Platform: assets, tokens, investors, transfers, compliance policies, and the audit trail.

## Assets

An **asset** represents a real-world item or right being tokenised. Assets are the central domain object in the platform. Each asset has a `rightType` that determines its behavior:

| Right Type | Description | Examples |
|-----------|-------------|----------|
| `OWNERSHIP` | Fractional ownership of a physical or financial asset | Real estate, fund shares, commodities |
| `ACCESS` | Time-bound or event-bound access right | Airline tickets, hotel reservations, concert tickets |
| `BEHAVIOR` | Reputation or performance-based credential | Loyalty points, behavior scores |
| `VERIFICATION` | Attestation or proof of a claim | KYC credentials, accreditation certificates |

### Asset Lifecycle

Every asset follows a state machine with well-defined transitions:

```
DRAFT -> PENDING_VERIFICATION -> VERIFIED -> ACTIVE -> FROZEN -> CLOSED
                                                    \-> REDEEMED
                                                    \-> EXPIRED
                                                    \-> BURNED
```

| State | Description |
|-------|-------------|
| `DRAFT` | Initial state. Asset is being configured, documents uploaded. |
| `PENDING_VERIFICATION` | Submitted for compliance review. Documents and metadata under audit. |
| `VERIFIED` | Compliance team has approved the asset. Ready for token deployment. |
| `ACTIVE` | Token is deployed, investors can hold and transfer tokens. |
| `FROZEN` | Temporarily suspended. No transfers allowed. Used for regulatory holds or corporate actions. |
| `REDEEMED` | Asset has been redeemed (e.g., property sold, ticket used). Terminal state. |
| `EXPIRED` | Validity period has elapsed. Terminal state for time-bound assets. |
| `BURNED` | Permanently destroyed. Terminal state. |

Transitions are enforced server-side. Invalid transitions (e.g., `DRAFT -> ACTIVE`) are rejected.

## Tokens

A **token** is the on-chain representation of an asset. The platform supports multiple token standards:

| Standard | Use Case | Key Feature |
|----------|----------|-------------|
| **ERC-3643 (T-REX)** | Security tokens, regulated assets | On-chain identity registry and modular compliance |
| **ERC-20** | Fungible utility tokens | Standard fungible interface |
| **ERC-721** | Unique assets (NFTs) | Used for tickets, reservations, unique items |
| **ERC-1155** | Multi-token (fungible + non-fungible) | Batch operations, mixed asset types |
| **ERC-1410** | Partitioned security tokens | Tranches, partially fungible shares |

### ERC-3643 (T-REX) Architecture

ERC-3643 is the primary standard for regulated assets. It adds three on-chain components:

- **Identity Registry** -- Maps wallet addresses to verified identities. Only registered addresses can hold tokens.
- **Identity Registry Storage** -- Stores country codes and claim topics for each identity.
- **Modular Compliance** -- A pluggable set of compliance modules that validate every transfer. Modules include maximum holder limits, jurisdiction restrictions, lockup periods, and more.

## Investors

An **investor** (also called a "party") is any entity that can hold tokenised assets. Investors must pass compliance checks before receiving tokens.

Investor types:
- `INDIVIDUAL` -- Natural person
- `INSTITUTIONAL` -- Legal entity (fund, corporation, trust)
- `TREASURY` -- Platform-managed issuer wallet

### Investor Tiers

The platform supports tiered investor classification:

| Tier | Description |
|------|-------------|
| `RETAIL` | Standard retail investor |
| `ACCREDITED` | Meets accredited investor criteria |
| `QUALIFIED` | Qualified institutional buyer |
| `INSTITUTIONAL` | Institutional investor |

Tier determines which assets an investor can access and what transfer limits apply.

## Transfers

A **transfer** moves tokens between parties. Every transfer passes through a compliance saga that ensures regulatory requirements are met at each step.

### Transfer Saga

```
INITIATED
  -> COMPLIANCE_CHECK   (evaluate all compliance policies)
  -> APPROVED           (all checks passed)
  -> SIGNED             (transaction signed by sender)
  -> SUBMITTED          (broadcast to blockchain)
  -> CONFIRMED          (included in a block)
  -> SETTLED            (finality reached, balances updated)
  -> RECONCILED         (off-chain records match on-chain state)
```

If compliance checks fail, the transfer moves to `REJECTED` with a detailed reason. If the on-chain transaction fails, the transfer moves to `FAILED`.

### Transfer Types

| Type | Description |
|------|-------------|
| `ISSUANCE` | Mint new tokens from treasury to an investor |
| `TRANSFER` | Peer-to-peer transfer between investors |
| `REDEMPTION` | Burn tokens and return underlying value |
| `FORCE_TRANSFER` | Regulatory override (clawback, court order) |
| `DISTRIBUTION` | Dividend or yield payment |

## Compliance Policies

The **compliance engine** evaluates a set of policies before every transfer. Policies are composable and can be applied at the asset, project, or organisation level.

Common compliance modules:

| Module | Description |
|--------|-------------|
| `MaxHolderCount` | Limits the number of distinct token holders |
| `JurisdictionRestriction` | Blocks transfers to/from specific countries |
| `LockupPeriod` | Prevents transfers for a time window after issuance |
| `MinimumHolding` | Enforces a minimum token balance per investor |
| `AccreditedOnly` | Restricts to accredited investors |
| `KYCRequired` | Requires valid KYC before receiving tokens |
| `SanctionsScreen` | Checks against global sanctions lists |

Policies produce a `PolicyDecision` with `ALLOW`, `DENY`, or `REVIEW` outcomes. A single `DENY` blocks the entire transfer.

## Identity Registry

The **Identity Registry** is a smart contract (part of ERC-3643) that maintains a mapping between wallet addresses and verified identities. The platform automatically:

1. Registers investor wallets when KYC is approved
2. Stores jurisdiction (country code) and claim topics on-chain
3. Removes identities if KYC expires or is revoked
4. Supports multiple wallets per investor

## Audit Trail

Every API call, state transition, compliance decision, and on-chain transaction is logged in an immutable **audit trail**. Each audit entry includes:

- Timestamp (ISO 8601)
- Actor (user, API key, or system)
- Action performed
- Entity type and ID
- Before/after state
- IP address and request metadata

The audit trail supports:
- **Evidence packs** -- Exportable bundles of audit records for regulatory reporting
- **Tamper detection** -- Hash-chained entries to detect modifications
- **Retention policies** -- Configurable retention periods per jurisdiction

## Multi-Chain Support

The platform operates across multiple EVM-compatible chains:

| Chain | Chain ID | Use Case |
|-------|----------|----------|
| Ethereum Mainnet | 1 | High-value assets, institutional |
| Polygon | 137 | Low-cost transactions, retail |
| Base | 8453 | Consumer applications |
| Arbitrum One | 42161 | DeFi integrations |
| Hardhat / Anvil | 31337 | Local development and testing |

Chain selection is per-token. A single project can have tokens deployed on different chains.
