# AHOY Tokenisation SDK

## Transforming Real-World Assets into Programmable Digital Securities

---

## Executive Summary

The AHOY Tokenisation SDK is an enterprise-grade infrastructure platform that enables businesses to convert real-world assets—real estate, carbon credits, commodities, invoices, and more—into compliant, programmable digital tokens on blockchain networks.

Unlike generic blockchain tools, AHOY provides the complete regulatory and operational layer required for **legally compliant asset tokenisation**, including investor verification (KYC/AML), jurisdiction-specific compliance rules, government registry integration (such as Dubai Land Department), and auditable transaction trails.

**In simple terms**: AHOY is the "Stripe for tokenised securities"—a developer-friendly API that handles the complexity of compliant asset tokenisation so businesses can focus on their core products.

---

## The Problem We Solve

### The $16 Trillion Opportunity

Real-world assets (RWAs) represent the largest store of value globally:
- **Real Estate**: $330 trillion globally
- **Private Credit**: $1.5 trillion
- **Commodities**: $120 trillion
- **Carbon Markets**: $2 trillion and growing

Yet these assets remain:
- **Illiquid**: Selling a property takes months; selling a fraction is nearly impossible
- **Inaccessible**: Minimum investments often exceed $100,000+
- **Opaque**: Ownership records fragmented across registries
- **Inefficient**: Settlement takes days/weeks with multiple intermediaries

### Why Current Solutions Fail

| Challenge | Traditional Finance | Generic Blockchain | AHOY SDK |
|-----------|--------------------|--------------------|----------|
| Fractional ownership | Nearly impossible | Possible but non-compliant | Compliant fractionalization |
| Regulatory compliance | Manual, expensive | Developer responsibility | Built-in policy engine |
| KYC/AML verification | Siloed per institution | Not included | Integrated multi-provider |
| Government registry sync | Manual reconciliation | Not supported | Native adapters (DLD, etc.) |
| Audit trail | Paper-based | Basic blockchain logs | Hash-chained evidence packs |
| Settlement time | T+2 to T+30 days | Instant but unregulated | Instant + compliant |
| Developer experience | Legacy APIs | Raw smart contracts | Stripe-like SDK |

### The Compliance Gap

Tokenising an asset isn't just a technical challenge—it's a regulatory one:

1. **Securities Laws**: Tokenised assets are often securities requiring registration
2. **KYC/AML**: Every investor must be verified before transactions
3. **Transfer Restrictions**: Not everyone can buy/sell; rules vary by jurisdiction
4. **Audit Requirements**: Regulators demand complete transaction histories
5. **Title Verification**: Physical assets need legal ownership confirmation

**Building this from scratch costs $2-5M and 18+ months.** AHOY delivers it out-of-the-box.

---

## What is the AHOY Tokenisation SDK?

The AHOY Tokenisation SDK is a complete infrastructure stack for launching and managing tokenised assets:

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR APPLICATION                          │
├─────────────────────────────────────────────────────────────────┤
│                      AHOY Tokenisation SDK                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │   Assets    │ │  Investors  │ │  Transfers  │ │ Compliance │ │
│  │   & Tokens  │ │  & KYC      │ │  & Settle   │ │ & Policies │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │    DLD      │ │   Ledger    │ │   Webhooks  │ │   Audit    │ │
│  │  Adapter    │ │  & CapTable │ │  & Events   │ │   Trail    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                     Smart Contracts (ERC-3643)                   │
├─────────────────────────────────────────────────────────────────┤
│                    Blockchain (Ethereum, Polygon, etc.)          │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. Asset & Token Management
Create and manage tokenised representations of real-world assets:
- Define asset properties, valuation, and jurisdiction
- Deploy compliant ERC-3643 security tokens
- Manage token supply, tranches, and metadata
- Track asset lifecycle (draft → verified → active → retired)

#### 2. Investor Onboarding & KYC
Complete investor lifecycle management:
- Multi-provider KYC integration (SumSub, Onfido, Jumio)
- Investor classification (retail, accredited, institutional)
- Wallet binding and ownership verification
- Automatic eligibility determination

#### 3. Compliant Transfer Engine
Every transfer goes through an 8-step compliance saga:
```
Create → Precheck → Approve → Sign → Submit → Confirm → Reconcile → Settle
```
- Policy evaluation before execution
- Custodial and non-custodial signing modes
- Automatic settlement finality tracking
- Failed transfer recovery

#### 4. Policy Engine
Programmable compliance rules:
```json
{
  "rules": [
    {"type": "require", "field": "investor.kycStatus", "op": "eq", "value": "approved"},
    {"type": "block", "field": "investor.countryCode", "op": "in", "value": ["KP", "IR"]},
    {"type": "limit", "field": "transfer.amount", "op": "lte", "value": "1000000"}
  ]
}
```
- Jurisdiction-specific policy presets
- Version-controlled policy updates
- Decision logging with cryptographic signatures

#### 5. Jurisdiction Adapters
Native integration with government registries:
- **Dubai Land Department (DLD)**: Title verification, ownership sync, lien checks
- **Extensible**: Add adapters for new jurisdictions
- **Reconciliation**: Automatic sync between on-chain and off-chain records

#### 6. Audit & Compliance Evidence
Meet regulatory requirements:
- Hash-chained audit logs (tamper-evident)
- Decision evidence with signatures
- Cap table snapshots (point-in-time ownership)
- Exportable compliance packs (PDF/ZIP)

#### 7. Webhooks & Events
Real-time notifications:
- Subscribe to any event type
- Signed webhook payloads
- Automatic retries with backoff
- Event replay for recovery

---

## Key Features

### Developer Experience

| Feature | Description |
|---------|-------------|
| **RESTful API** | Clean, intuitive endpoints following REST conventions |
| **TypeScript SDK** | First-class TypeScript support with full type safety |
| **Python SDK** | For data science, reporting, and backend integrations |
| **OpenAPI Spec** | Auto-generated documentation with Swagger UI |
| **Idempotency** | Safe retries with idempotency keys |
| **Pagination** | Consistent pagination across all list endpoints |

### Compliance & Security

| Feature | Description |
|---------|-------------|
| **ERC-3643 Tokens** | Industry-standard compliant security tokens |
| **On-chain Compliance** | Transfer restrictions enforced at smart contract level |
| **Multi-sig Support** | Corporate actions require multiple approvals |
| **Role-based Access** | Granular permissions for different user types |
| **Audit Trail** | Complete, immutable record of all actions |
| **Decision Logging** | Why each transfer was approved/denied |

### Operational

| Feature | Description |
|---------|-------------|
| **Multi-chain** | Deploy on Ethereum, Polygon, or private chains |
| **Sandbox Mode** | Test with mock data before going live |
| **Webhooks** | Real-time event notifications |
| **Cap Table** | Real-time ownership reporting |
| **Analytics** | Transfer volume, holder distribution, and more |

---

## Who Uses AHOY?

### Primary Users

#### 1. Real Estate Developers & PropTech Companies
**Use Case**: Tokenise property developments for fractional investment

- Raise capital from global investors
- Offer liquidity to property investors
- Automate dividend distributions
- Maintain regulatory compliance

**Example**: A Dubai developer tokenises a $50M tower, allowing 500 investors to own fractions from $10,000 minimum.

#### 2. Investment Funds & Asset Managers
**Use Case**: Launch tokenised fund shares

- Reduce administration costs by 60%+
- Enable 24/7 secondary trading
- Automate NAV calculations
- Instant settlement vs T+2

**Example**: A private equity fund tokenises LP interests, allowing LPs to trade positions without fund involvement.

#### 3. Carbon Credit Registries & ESG Platforms
**Use Case**: Tokenise verified carbon credits

- Prove credit authenticity on-chain
- Enable fractional credit purchases
- Track retirement and prevent double-counting
- Connect to voluntary carbon markets

**Example**: A carbon registry tokenises 1M tonnes of verified credits, enabling micro-retirements for corporate ESG programs.

#### 4. Commodity Traders
**Use Case**: Tokenise warehouse receipts

- Trade commodity ownership 24/7
- Reduce settlement from weeks to minutes
- Enable fractional ownership
- Integrate with physical logistics

**Example**: A gold vault tokenises 10,000 oz of gold, enabling instant global trading.

#### 5. Invoice Factoring & Trade Finance
**Use Case**: Tokenise receivables for liquidity

- Convert invoices to tradeable tokens
- Enable instant factoring
- Create diversified receivables portfolios
- Automate payment waterfalls

**Example**: An SME tokenises $1M in receivables, selling to yield-seeking investors at 8% APY.

### Secondary Users

| User Type | Use Case |
|-----------|----------|
| **Banks & Custodians** | Offer tokenisation services to clients |
| **Exchanges** | List compliant security tokens |
| **Law Firms** | Structure compliant offerings |
| **Auditors** | Access immutable audit trails |
| **Regulators** | Monitor market activity |

---

## Why Choose AHOY?

### 1. Speed to Market

| Approach | Time to Launch |
|----------|---------------|
| Build from scratch | 18-24 months |
| Generic blockchain + custom compliance | 9-12 months |
| **AHOY SDK** | **4-8 weeks** |

### 2. Regulatory Confidence

AHOY is built for regulated markets:
- **UAE/DIFC**: Ready for Virtual Asset Regulatory Authority (VARA) requirements
- **EU**: MiCA-compatible architecture
- **Global**: Extensible for any jurisdiction

### 3. Total Cost of Ownership

| Cost Component | DIY | AHOY |
|---------------|-----|------|
| Smart contract development | $500K+ | Included |
| Compliance engine | $300K+ | Included |
| KYC integration | $150K+ | Included |
| Registry adapters | $200K+ | Included |
| Ongoing maintenance | $50K/month | Included |
| **Total Year 1** | **$2M+** | **$50-200K** |

### 4. Production-Ready Infrastructure

AHOY isn't a proof-of-concept:
- **99.9% uptime SLA**
- **SOC 2 Type II** compliant infrastructure
- **Multi-region** deployment
- **24/7 monitoring** and support
- **Disaster recovery** built-in

### 5. Ecosystem Integration

AHOY connects to the broader financial ecosystem:
- **Custody**: Fireblocks, BitGo, Anchorage
- **KYC Providers**: SumSub, Onfido, Jumio
- **Registries**: Dubai Land Department, more coming
- **Exchanges**: Structured for secondary market listing
- **Oracles**: Chainlink for off-chain data

---

## Technical Architecture

### API-First Design

Every operation is accessible via REST API:

```bash
# Create an investor
curl -X POST https://api.ahoy.fund/v1/investors \
  -H "X-API-Key: sk_live_..." \
  -d '{"email": "investor@example.com", "type": "individual", "countryCode": "AE"}'

# Execute a compliant transfer
curl -X POST https://api.ahoy.fund/v1/transfers/execute \
  -H "X-API-Key: sk_live_..." \
  -d '{
    "tokenId": "tok_...",
    "fromWallet": "0x...",
    "toWallet": "0x...",
    "amount": "1000000000000000000",
    "autoApprove": true
  }'
```

### SDK Usage

```typescript
import { TrouveClient } from '@ahoy/tokenisation-sdk';

const client = new TrouveClient({ apiKey: 'sk_live_...' });

// Create project and asset
const project = await client.projects.create({
  name: 'Marina Tower',
  jurisdiction: 'AE',
  assetType: 'real_estate'
});

// Verify with DLD
const title = await client.dld.titles.create({
  projectId: project.id,
  dldTitleNumber: 'DLD-12345',
  propertyType: 'building'
});

await client.dld.titles.verify(title.id);

// Onboard investor
const investor = await client.investors.create({
  email: 'investor@example.com',
  type: 'accredited',
  countryCode: 'AE'
});

// KYC verification
const kyc = await client.investors.kyc.create(investor.id, {
  provider: 'sumsub',
  levelRequested: 'full'
});

// Add and verify wallet
const wallet = await client.investors.wallets.add(investor.id, {
  address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE23',
  chainId: 137
});

// Execute compliant transfer
const transfer = await client.transfers.execute({
  tokenId: 'tok_...',
  fromWallet: '0x...',
  toWallet: wallet.address,
  amount: '1000000000000000000',
  autoApprove: true
});

console.log(transfer.status); // 'settled'
```

### Smart Contract Layer

AHOY deploys ERC-3643 compliant tokens:

```
┌────────────────────────────────────────────────────────────┐
│                      ERC-3643 Token                         │
├────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Identity   │  │  Compliance  │  │  Transfer        │  │
│  │   Registry   │  │  Modules     │  │  Manager         │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                 │                    │            │
│         ▼                 ▼                    ▼            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Claim Topics │  │ Country      │  │ Forced Transfer  │  │
│  │ Registry     │  │ Restrictions │  │ (Recovery)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Key Features**:
- On-chain transfer restrictions
- Identity-bound tokens (can't transfer to unverified wallets)
- Modular compliance (add/remove rules without redeploying)
- Recovery mechanisms for lost keys
- Forced transfers for legal compliance

---

## The End-to-End Flow

Here's how a complete tokenisation project works with AHOY:

### Phase 1: Setup (Day 1-7)

```
1. Create Organization
   └─> Generate API keys
   └─> Configure webhooks

2. Create Project
   └─> Define asset details
   └─> Set jurisdiction

3. Upload Documents
   └─> Title deeds
   └─> Valuation reports
   └─> Legal opinions
```

### Phase 2: Verification (Day 7-14)

```
4. Register with DLD
   └─> Submit title number
   └─> Receive verification status
   └─> Handle disputes if any

5. Deploy Token
   └─> Configure token parameters
   └─> Deploy smart contract
   └─> Verify on block explorer
```

### Phase 3: Distribution (Day 14-30)

```
6. Onboard Investors
   └─> Collect investor details
   └─> Run KYC verification
   └─> Bind wallets

7. Configure Policies
   └─> Set transfer restrictions
   └─> Define investor limits
   └─> Enable compliance rules

8. Issue Tokens
   └─> Mint to verified investors
   └─> Record on ledger
   └─> Trigger webhooks
```

### Phase 4: Operations (Ongoing)

```
9. Handle Transfers
   └─> Investors request transfers
   └─> Policy engine evaluates
   └─> Execute if compliant

10. Maintain Compliance
    └─> Monitor KYC expiries
    └─> Update policies as needed
    └─> Generate audit reports

11. Distribute Returns
    └─> Calculate distributions
    └─> Execute payments
    └─> Update cap table
```

---

## Compliance & Regulatory Framework

### Supported Jurisdictions

| Jurisdiction | Status | Registry Integration |
|-------------|--------|---------------------|
| **UAE (Dubai)** | Production | Dubai Land Department |
| **UAE (ADGM)** | Roadmap | ADGM Registry |
| **Saudi Arabia** | Roadmap | RERA |
| **EU (MiCA)** | Architecture Ready | - |
| **UK** | Architecture Ready | Land Registry |
| **Singapore** | Roadmap | SLA |

### Regulatory Alignment

AHOY is designed to support:

- **Securities Regulations**: Token structures that qualify for exemptions
- **AML/CFT**: Full KYC/AML workflow with ongoing monitoring
- **Data Protection**: GDPR-compliant data handling
- **Financial Reporting**: Audit-ready transaction records
- **Consumer Protection**: Investor eligibility verification

---

## Pricing Model

### Platform Fees

| Tier | Monthly Fee | API Calls | Assets | Support |
|------|-------------|-----------|--------|---------|
| **Startup** | $2,500 | 100K | 5 | Email |
| **Growth** | $7,500 | 500K | 25 | Priority |
| **Enterprise** | Custom | Unlimited | Unlimited | Dedicated |

### Transaction Fees

| Operation | Fee |
|-----------|-----|
| Token Deployment | $500 flat |
| Transfer | 0.1% (min $1, max $100) |
| KYC Verification | Pass-through + 10% |
| Cap Table Snapshot | $50 |

### What's Included

- Unlimited team members
- All SDK features
- Sandbox environment
- API documentation
- Community support
- Regular updates

---

## Roadmap

### Q1 2026 - Foundation
- [x] Core API complete
- [x] TypeScript SDK
- [x] DLD integration
- [x] Policy engine v1
- [x] Audit logging

### Q2 2026 - Expansion
- [ ] Python SDK
- [ ] OpenAPI 3.0 spec
- [ ] ERC-3643 templates
- [ ] Policy presets library
- [ ] Sandbox environment

### Q3 2026 - Scale
- [ ] C# SDK
- [ ] Additional KYC providers
- [ ] ADGM registry adapter
- [ ] Multi-chain deployment
- [ ] White-label UI components

### Q4 2026 - Enterprise
- [ ] Private deployment option
- [ ] Custom compliance modules
- [ ] Advanced analytics
- [ ] Institutional custody integration
- [ ] Secondary market connectors

---

## Getting Started

### 1. Sign Up
Create an account at [ahoy.fund](https://ahoy.fund) and get your API keys.

### 2. Explore the Sandbox
Use our sandbox environment to test without real assets:
```bash
# Sandbox base URL
https://sandbox.api.ahoy.fund/v1
```

### 3. Read the Docs
Comprehensive documentation available at:
- API Reference: `/api/docs`
- Quickstart Guide: `/docs/guides/QUICKSTART.md`
- SDK Usage: `/docs/guides/SDK_USAGE.md`

### 4. Build Your Integration
```bash
npm install @ahoy/tokenisation-sdk
```

### 5. Go Live
When ready, switch to production API keys and deploy.

---

## Contact

**For Business Inquiries**:
- Email: business@ahoy.fund
- Website: [ahoy.fund](https://ahoy.fund)

**For Technical Support**:
- Documentation: [docs.ahoy.fund](https://docs.ahoy.fund)
- GitHub: [github.com/ahoy-fund](https://github.com/ahoy-fund)
- Email: engineering@ahoy.fund

**For Partnerships**:
- Email: partners@ahoy.fund

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| **Tokenisation** | Converting rights to an asset into digital tokens on a blockchain |
| **Security Token** | A token that represents ownership in a regulated security |
| **ERC-3643** | Ethereum standard for compliant security tokens |
| **KYC** | Know Your Customer - identity verification process |
| **AML** | Anti-Money Laundering - regulatory requirements |
| **DLD** | Dubai Land Department - UAE property registry |
| **Cap Table** | Record of all token holders and their balances |
| **Custody** | Secure storage of private keys |
| **Settlement** | Final transfer of ownership |

### Compliance Checklist

For a compliant tokenisation project:

- [ ] Legal opinion on token structure
- [ ] Regulatory registration (if required)
- [ ] KYC/AML procedures documented
- [ ] Privacy policy updated
- [ ] Terms of service for token holders
- [ ] Asset valuation from qualified valuator
- [ ] Title verification completed
- [ ] Insurance coverage confirmed
- [ ] Audit procedures established
- [ ] Investor suitability criteria defined

---

*AHOY Tokenisation SDK - Building the infrastructure for the tokenised economy.*
