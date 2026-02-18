---
sidebar_position: 5
title: Glossary
---

# Glossary

A reference of key terms and concepts used throughout the AHOY Tokenisation Platform.

---

### Accredited Investor

An individual or entity that meets specific financial thresholds (net worth, income, or professional certification) as defined by a regulatory authority, granting access to securities offerings not available to the general public.

### Cap Table

A record of all token holders and their respective balances for a given asset. The platform maintains both an on-chain cap table (derived from token balances) and an off-chain cap table (synced via the indexer) for reporting and compliance.

### Clawback

A forced transfer of tokens from an investor's wallet back to the issuer or a designated address. Clawbacks are used in regulatory enforcement, court orders, or contractual obligation scenarios. Requires `FORCE_TRANSFER` privileges and produces a detailed audit entry.

### Compliance Module

A pluggable smart contract (in ERC-3643) or server-side rule that evaluates whether a token transfer is permitted. Modules include jurisdiction restrictions, holder count limits, lockup periods, and KYC requirements. Multiple modules are composed together -- a single rejection blocks the transfer.

### Corporate Action

An event initiated by the token issuer that affects all holders, such as a stock split, dividend distribution, forced freeze, or token burn. Corporate actions are executed as batch operations and recorded in the audit trail.

### Distribution

A payment of dividends, rental income, yield, or other cash flows to token holders. Distributions are calculated pro-rata based on a cap table snapshot at a specific date and time.

### DLD (Dubai Land Department)

The government authority responsible for real estate registration in Dubai, UAE. The platform includes a DLD integration module for property tokenisation workflows that require title deed verification and registration.

### ERC-3643

An Ethereum token standard (also known as T-REX) designed for security tokens. ERC-3643 adds an on-chain Identity Registry, Identity Registry Storage, and Modular Compliance layer on top of the ERC-20 interface. Every `transfer` call passes through compliance checks before execution.

### ERC-20

The standard interface for fungible tokens on Ethereum. Defines `transfer`, `approve`, `transferFrom`, `balanceOf`, and `allowance` functions.

### ERC-721

The standard interface for non-fungible tokens (NFTs) on Ethereum. Each token has a unique ID. Used in the platform for airline tickets, concert tickets, hotel reservations, and car rentals.

### ERC-1155

A multi-token standard that supports both fungible and non-fungible tokens in a single contract. Enables batch transfers and is used for GPU compute allocations and mixed asset portfolios.

### Finality

The point at which a blockchain transaction is considered irreversible. Finality varies by chain: Ethereum achieves finality after approximately 2 epochs (~13 minutes), Polygon after 256 blocks, and local Hardhat/Anvil chains achieve instant finality.

### Force Transfer

A transfer initiated by a privileged actor (issuer, regulator, or court-appointed agent) that bypasses normal compliance checks. Force transfers are logged with elevated audit detail and require explicit justification. See also: **Clawback**.

### Identity Registry

An on-chain smart contract (part of ERC-3643) that maps Ethereum addresses to verified identities. Only addresses registered in the Identity Registry can send or receive security tokens. The platform automatically registers addresses when KYC verification is approved.

### Investor Tier

A classification level assigned to an investor based on their accreditation status, jurisdiction, and verification level. Tiers (RETAIL, ACCREDITED, QUALIFIED, INSTITUTIONAL) determine which assets an investor may access and what transfer limits apply.

### KYC (Know Your Customer)

The process of verifying an investor's identity, jurisdiction, and suitability. The platform integrates with external KYC providers and supports mock KYC for sandbox environments. Successful KYC triggers on-chain identity registration.

### Lockup Period

A time window after token issuance during which the holder cannot transfer their tokens. Lockup periods are enforced both on-chain (via the compliance module) and off-chain (via the transfer saga). Common in real estate and fund tokenisation.

### Modular Compliance

The compliance architecture of ERC-3643 tokens, where individual compliance rules are implemented as separate, composable smart contracts. The platform ships with modules for jurisdiction restrictions, holder limits, lockup periods, and more. Custom modules can be deployed.

### NAV (Net Asset Value)

The calculated value of an asset, typically expressed per-token. NAV is updated periodically via valuation oracles or manual admin entry. Used for redemption pricing, reporting, and investor dashboards.

### Right Type

The category of real-world right that an asset represents. The platform defines four right types: `OWNERSHIP` (fractional ownership), `ACCESS` (time-bound access), `BEHAVIOR` (reputation credentials), and `VERIFICATION` (attestations).

### Security Token

A digital token that represents ownership in a real-world asset and is subject to securities regulation. Unlike utility tokens, security tokens must comply with investor protection laws including KYC/AML, transfer restrictions, and reporting requirements.

### Settlement

The final step in a transfer where on-chain balances are confirmed and off-chain records are updated. Settlement occurs after transaction confirmation and finality. The platform reconciles on-chain and off-chain state automatically.

### T-REX (Token for Regulated EXchanges)

The protocol name for ERC-3643. Developed by Tokeny, T-REX provides the smart contract framework for compliant security tokens including identity management and transfer validation.

### VARA (Virtual Assets Regulatory Authority)

The regulatory body in Dubai, UAE, responsible for overseeing virtual asset service providers and token offerings. The platform includes VARA-specific compliance modules and condition evaluators for UAE-based tokenisation.

### Vesting

A schedule that gradually releases tokens to a holder over time. Vesting is used for team allocations, advisor shares, and milestone-based releases. The platform supports cliff vesting, linear vesting, and custom schedules.
