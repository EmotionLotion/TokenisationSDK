# Tokenisation SDK - Core Concepts

This document explains what asset tokenization is, why it matters, and how the SDK enables it.

---

## Table of Contents

1. [What is Asset Tokenization?](#what-is-asset-tokenization)
2. [Why Tokenize Assets?](#why-tokenize-assets)
3. [The Compliance Challenge](#the-compliance-challenge)
4. [How This SDK Solves It](#how-this-sdk-solves-it)
5. [Domain Model](#domain-model)
6. [End-to-End Flow](#end-to-end-flow)
7. [Key Concepts](#key-concepts)

---

## What is Asset Tokenization?

**Asset tokenization** is the process of converting rights to an asset into a digital token on a blockchain.

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  REAL WORLD     │         │   LEGAL         │         │   BLOCKCHAIN    │
│  ASSET          │   ───►  │   STRUCTURE     │   ───►  │   TOKEN         │
│                 │         │                 │         │                 │
│  Building       │         │  SPV/Trust      │         │  ERC-3643       │
│  $10M value     │         │  100 shares     │         │  100 tokens     │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

**Example:** A $10 million building is placed in a legal entity (SPV). That entity issues 100 tokens, each representing 1% ownership. Investors buy tokens instead of buying property directly.

### What Can Be Tokenized?

| Asset Type | Examples | Token Represents |
|------------|----------|------------------|
| **Real Estate** | Buildings, land, REITs | Ownership share, rental income |
| **Securities** | Stocks, bonds, funds | Equity, debt, fund units |
| **Commodities** | Gold, oil, carbon credits | Physical commodity rights |
| **Intellectual Property** | Patents, royalties, music | Revenue streams |
| **Collectibles** | Art, wine, cars | Fractional ownership |
| **Infrastructure** | Solar farms, data centers | Revenue participation |

---

## Why Tokenize Assets?

### For Asset Owners (Issuers)

| Benefit | Traditional | Tokenized |
|---------|-------------|-----------|
| **Liquidity** | Illiquid, hard to sell | 24/7 trading possible |
| **Investor Access** | Limited to wealthy/institutions | Global retail access |
| **Minimum Investment** | Often $100K+ | Can be $100 or less |
| **Settlement Time** | Days to weeks | Minutes to hours |
| **Administrative Cost** | High (lawyers, transfer agents) | Automated via smart contracts |

### For Investors

| Benefit | Description |
|---------|-------------|
| **Fractional Ownership** | Own 0.1% of a building instead of needing millions |
| **Diversification** | Spread investment across multiple assets easily |
| **Transparency** | On-chain records of ownership and transfers |
| **Programmable Rights** | Automatic dividend distribution, voting, etc. |

### The Market Opportunity

- **$16 trillion** in illiquid assets could be tokenized (Boston Consulting Group)
- Real estate alone: **$326 trillion** globally
- Current tokenized assets: **<$5 billion** — massive growth potential

---

## The Compliance Challenge

Tokenized securities are still **securities**. They must comply with regulations:

### Regulatory Requirements

| Requirement | What It Means |
|-------------|---------------|
| **KYC (Know Your Customer)** | Verify investor identity before they can invest |
| **AML (Anti-Money Laundering)** | Screen against sanctions lists, monitor suspicious activity |
| **Accreditation** | Some investments restricted to qualified/accredited investors |
| **Jurisdiction Rules** | Different countries have different rules (US ≠ EU ≠ UAE) |
| **Transfer Restrictions** | Cannot freely transfer to anyone — must verify recipient |
| **Reporting** | Regulators require audit trails, cap tables, transaction records |

### Why Traditional Tokens Fail

Standard ERC-20 tokens have no compliance:

```solidity
// Standard ERC-20 - ANYONE can receive tokens
function transfer(address to, uint256 amount) public {
    balances[msg.sender] -= amount;
    balances[to] += amount;  // No checks! Regulatory violation!
}
```

This is why **ERC-3643 (T-REX)** was created — tokens with built-in compliance.

---

## How This SDK Solves It

### The Problem We Solve

Building a compliant tokenization platform traditionally requires:

| Component | Traditional Cost | Traditional Time |
|-----------|------------------|------------------|
| Compliance infrastructure | $200K - $500K | 3-6 months |
| KYC/AML integration | $50K - $100K | 1-2 months |
| Smart contract development | $100K - $300K | 2-4 months |
| Legal structure | $50K - $200K | 1-3 months |
| **Total** | **$400K - $1.1M** | **6-12 months** |

### Our Solution

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         YOUR APPLICATION                                │
│                    (Built in days, not months)                          │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      TOKENISATION SDK                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │  Investor   │ │   Asset     │ │   Token     │ │  Compliance │       │
│  │  Onboarding │ │   Mgmt      │ │  Lifecycle  │ │   Engine    │       │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                                         │
│  • KYC/AML ready         • Multi-chain          • Audit trails         │
│  • Jurisdiction rules    • UUPS upgradeable     • Idempotency          │
│  • Transfer validation   • Multi-sig governance • Rate limiting        │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BLOCKCHAIN (Base, Polygon, Ethereum)                 │
│                         ERC-3643 Compliant Tokens                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Result:** Build a compliant tokenization platform in days with ~50 lines of code.

---

## Domain Model

Understanding how the pieces fit together is critical.

### Entity Relationships

```
┌─────────────┐
│   PROJECT   │  Container for a tokenization initiative
└──────┬──────┘
       │ has many
       ▼
┌─────────────┐       ┌─────────────┐
│    ASSET    │       │  INVESTOR   │  People who will hold tokens
└──────┬──────┘       └──────┬──────┘
       │ tokenized as        │ has
       ▼                     ▼
┌─────────────┐       ┌─────────────┐
│    TOKEN    │       │   WALLET    │  Blockchain address
└──────┬──────┘       └──────┬──────┘
       │                     │
       └──────────┬──────────┘
                  │ issued to / transferred between
                  ▼
           ┌─────────────┐
           │  TRANSFER   │  Movement of tokens between wallets
           └─────────────┘
```

### Entity Definitions

#### Project
A **Project** is a container that groups related tokenization work.

```typescript
{
  id: "proj_abc123",
  name: "Dubai Marina Real Estate Fund",
  description: "Tokenized luxury real estate portfolio",
  jurisdiction: "AE",
  status: "active"
}
```

**Use cases:**
- A real estate fund with multiple properties
- A company tokenizing multiple asset classes
- A platform operator managing client projects

#### Asset
An **Asset** represents the underlying real-world thing being tokenized.

```typescript
{
  id: "asset_xyz789",
  name: "Marina Heights Tower - Unit 1501",
  rightType: "OWNERSHIP",        // What right does the token represent?
  jurisdiction: {
    countryCode: "AE",
    regulatoryFramework: "DIFC"
  },
  state: "active",               // Lifecycle state
  projectId: "proj_abc123"
}
```

**Right Types:**

| Type | Description | Example |
|------|-------------|---------|
| `OWNERSHIP` | Title to property | Real estate deed, vehicle title |
| `EQUITY` | Shares in an entity | Company stock, fund units |
| `DEBT` | Loan or bond | Corporate bond, loan participation |
| `REVENUE` | Income stream | Royalties, profit share |
| `ACCESS` | Permission to use | Membership, license, ticket |
| `COMMODITY` | Physical goods | Gold bars, oil barrels |

#### Investor
An **Investor** is a person or entity that can hold tokens.

```typescript
{
  id: "inv_def456",
  email: "investor@example.com",
  name: "John Doe",
  type: "individual",           // or "entity"
  jurisdiction: "US",
  kycStatus: "approved",        // KYC verification status
  status: "active",
  accredited: true              // Accredited investor status
}
```

**Investor Lifecycle:**

```
created → kyc_pending → kyc_approved → active
                ↓
          kyc_rejected
```

An investor cannot receive tokens until:
1. KYC is approved
2. Status is "active"
3. They have a verified wallet

#### Wallet
A **Wallet** is a blockchain address linked to an investor.

```typescript
{
  id: "wallet_ghi012",
  investorId: "inv_def456",
  address: "0x1234...5678",
  chainId: 8453,                // Base mainnet
  walletType: "eoa",            // or "multisig", "smart_account"
  verified: true,
  isPrimary: true
}
```

**Why link wallets to investors?**
- Compliance requires knowing who owns each address
- Enables transfer validation (is recipient KYC'd?)
- Required for regulatory reporting

#### Token
A **Token** is the on-chain representation of an asset.

```typescript
{
  id: "tok_jkl345",
  name: "Marina Heights Token",
  symbol: "MHT",
  decimals: 18,
  contractAddress: "0xabcd...efgh",
  chainId: 8453,
  status: "deployed",
  assetId: "asset_xyz789",
  totalSupply: "1000000000000000000000000"  // 1M tokens
}
```

**Token Lifecycle:**

```
draft → deploying → deployed → paused → frozen
                        ↑          ↓
                        └──────────┘ (unpause)
```

#### Transfer
A **Transfer** is movement of tokens between wallets.

```typescript
{
  id: "txfr_mno678",
  tokenId: "tok_jkl345",
  fromWallet: "0x1111...1111",
  toWallet: "0x2222...2222",
  amount: "1000000000000000000",  // 1 token
  status: "confirmed",
  txHash: "0xabc...def"
}
```

**Transfer Lifecycle:**

```
created → prechecked → approved → signing → submitted → confirmed → settled
              ↓
          rejected (compliance failure)
```

---

## End-to-End Flow

Here's how a complete tokenization works:

### Phase 1: Setup

```
1. Create Project
   └── "Dubai Marina Real Estate Fund"

2. Create Asset
   └── "Marina Heights - Unit 1501"
   └── rightType: OWNERSHIP
   └── Activate asset
```

### Phase 2: Investor Onboarding

```
3. Create Investor
   └── John Doe, US jurisdiction

4. Complete KYC
   └── Verify identity
   └── Check accreditation

5. Add Wallet
   └── Link blockchain address
   └── Verify ownership (sign message)

6. Activate Investor
   └── Now eligible to receive tokens
```

### Phase 3: Token Creation

```
7. Create Token
   └── Name: "Marina Heights Token"
   └── Symbol: "MHT"
   └── Link to asset

8. Deploy Token
   └── UUPS proxy deployed to blockchain
   └── Identity registry configured
   └── Compliance rules set
```

### Phase 4: Issuance & Trading

```
9. Issue Tokens
   └── Mint to investor's wallet
   └── Requires idempotency key (prevents duplicates)

10. Transfer Tokens
    └── Compliance checks run automatically:
        - Is sender verified?
        - Is recipient verified?
        - Is recipient's jurisdiction allowed?
        - Does transfer exceed limits?
    └── If all pass → execute on-chain
```

### Phase 5: Ongoing Management

```
11. View Cap Table
    └── See all holders and percentages

12. Corporate Actions
    └── Dividends, votes, redemptions

13. Compliance Monitoring
    └── Audit trails, regulatory reports
```

---

## Key Concepts

### Idempotency

**Problem:** Network issues can cause duplicate requests. Issuing tokens twice = big problem.

**Solution:** Every critical operation requires an `idempotencyKey`:

```typescript
// First request
await client.tokens.issue(tokenId, {
  investorId: "inv_123",
  amount: "1000",
  idempotencyKey: "issue-inv123-batch1"  // Unique key
});

// Duplicate request (same key) - safely ignored
await client.tokens.issue(tokenId, {
  investorId: "inv_123",
  amount: "1000",
  idempotencyKey: "issue-inv123-batch1"  // Same key = no duplicate
});
```

**Required for:** Token issuance, redemption, transfers

### UUPS Upgradeable Proxy

**Problem:** Smart contracts are immutable. Bugs can't be fixed.

**Solution:** Deploy a proxy that points to upgradeable logic:

```
┌─────────────────┐     ┌─────────────────────────────┐
│   ERC1967Proxy  │────▶│  ComplianceTokenUpgradeable │
│  (User-facing)  │     │      (Logic - V1)           │
│  Fixed address  │     └─────────────────────────────┘
└─────────────────┘                  │
                                     │ upgrade
                                     ▼
                        ┌─────────────────────────────┐
                        │  ComplianceTokenUpgradeable │
                        │      (Logic - V2)           │
                        └─────────────────────────────┘
```

**Benefits:**
- Fix bugs without redeploying
- Add features without migrating tokens
- User-facing address never changes

### Multi-Sig Governance

**Problem:** Who can upgrade contracts? Single key = single point of failure.

**Solution:** `TokenGovernor` requires multiple approvals:

```
1. Signer A proposes upgrade
2. Signer B approves
3. Wait 2 days (timelock)
4. Anyone can execute
```

**Parameters:**
- `REQUIRED_SIGS = 2` — Need 2 of N signers
- `MIN_DELAY = 2 days` — Time to review before execution
- `GRACE_PERIOD = 7 days` — Window to execute after ready

### ERC-3643 (T-REX)

The token standard for compliant security tokens:

```
┌─────────────────────────────────────────────────────────────────┐
│                        ERC-3643 TOKEN                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Identity        │  │ Compliance      │  │ Trusted Issuers │ │
│  │ Registry        │  │ Module          │  │ Registry        │ │
│  │                 │  │                 │  │                 │ │
│  │ Maps wallets    │  │ Rules for       │  │ Who can issue   │ │
│  │ to identities   │  │ transfers       │  │ identity claims │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**How transfer validation works:**

```solidity
function transfer(address to, uint256 amount) public {
    // 1. Check sender is verified
    require(identityRegistry.isVerified(msg.sender));

    // 2. Check recipient is verified
    require(identityRegistry.isVerified(to));

    // 3. Check compliance rules pass
    require(compliance.canTransfer(msg.sender, to, amount));

    // 4. Execute transfer
    _transfer(msg.sender, to, amount);
}
```

---

## Next Steps

Now that you understand the concepts:

1. **[Quick Start Guide](getting-started/QUICKSTART.md)** — Build your first tokenized asset
2. **[API Reference](API_REFERENCE.md)** — Complete SDK documentation
3. **[Glossary](GLOSSARY.md)** — Terms and definitions
