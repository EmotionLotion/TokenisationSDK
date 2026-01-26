# Tokenisation SDK: Technical Review & Production Roadmap

**Document Version:** 1.0
**Date:** January 2026
**Classification:** Internal Strategy Document

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Overview](#product-overview)
3. [SDK Feature Analysis](#sdk-feature-analysis)
4. [Implementation Status Audit](#implementation-status-audit)
5. [Institutional Landscape Comparison](#institutional-landscape-comparison)
6. [Gap Analysis](#gap-analysis)
7. [Strategic Positioning](#strategic-positioning)
8. [Production Roadmap](#production-roadmap)
9. [Resource Requirements](#resource-requirements)
10. [Risk Assessment](#risk-assessment)

---

## Executive Summary

### What We Have

The Tokenisation SDK is a **well-architected MVP** with a powerful plugin-based architecture. The core state machine (Lifecycle Engine) is production-grade, and the token adapters work with real blockchain networks. However, critical compliance and verification components **fail open by default**, making it unsuitable for production use without significant hardening.

### Key Findings

| Metric | Score | Assessment |
|--------|-------|------------|
| Architecture Quality | A | Excellent plugin system, clean interfaces |
| Core State Machine | A | Production-grade, fully functional |
| Token Operations | A- | Real ERC20/721 adapters, working |
| Compliance Engine | C+ | Logic works, but fails open |
| Oracle Integration | D | Mock by default, real Chainlink plugin exists |
| Persistence | D | In-memory only, data lost on restart |
| Production Readiness | 45-55% | MVP complete, production gaps remain |

### Bottom Line

The SDK is **not a competitor to institutional infrastructure** (Circle, BlackRock, Securitize). It is a **developer toolkit** that can be positioned as "Stripe for tokenization" - enabling builders to create compliant tokenized asset applications without building infrastructure from scratch.

---

## Product Overview

### Two Products, One Ecosystem

#### 1. Tokenisation SDK (Developer Tool)

A TypeScript/JavaScript SDK for building tokenized asset applications. Provides:

- **Plugin Architecture** - Swap compliance, jurisdiction, oracle, storage, and chain plugins
- **Lifecycle Management** - State machine for asset lifecycle (Draft → Active → Redeemed)
- **Compliance Engine** - KYC, accreditation, transfer restrictions, jurisdiction rules
- **Multi-Chain Support** - Base, Polygon, Ethereum (expandable)
- **Oracle Integration** - Chainlink price feeds and CCIP cross-chain messaging

#### 2. AHOY Unified Tokenisation Platform (Ecosystem)

A showcase application built on the SDK, connecting ecosystem services:

| Service | Right Type | Use Case |
|---------|------------|----------|
| COMET | BEHAVIOR | Driver safety scores, delivery performance |
| FlyPlus | ACCESS | Lounge access, flight miles, memberships |
| H2O | VERIFICATION | Water credits, carbon offsets |
| AMS | OWNERSHIP | Data sets, AI models, algorithm IP |
| Nexus | ACCESS | Agent capabilities, compute credits |
| Connect | BEHAVIOR | Reputation scores, referral rewards |

**AHOY Token** serves as the universal unit of value across all services.

---

## SDK Feature Analysis

### Supported Asset Types (RightType)

| Type | Description | Example Use Cases |
|------|-------------|-------------------|
| `OWNERSHIP` | Title to physical or digital property | Real estate, IP, collectibles, game items |
| `ACCESS` | Permission to use services/spaces | Event tickets, memberships, subscriptions |
| `BEHAVIOR` | Reputation and performance records | Loyalty points, credit scores, certifications |
| `VERIFICATION` | Proof of attributes or actions | Carbon credits, supply chain provenance |

### Transfer Modes

| Mode | Description |
|------|-------------|
| `UNRESTRICTED` | Freely transferable to any address |
| `WHITELIST_ONLY` | Only pre-approved addresses can receive |
| `NON_TRANSFERABLE` | Soulbound tokens, cannot be transferred |
| `COMPLIANCE_GATED` | Requires KYC and compliance checks |

### Lifecycle States

```
DRAFT → PENDING_VERIFICATION → VERIFIED → ACTIVE → REDEEMED
                                    ↓           ↓
                                 SUSPENDED   EXPIRED
                                    ↓           ↓
                                 ACTIVE      BURNED
```

### Plugin System

| Plugin Type | Interface | Purpose |
|-------------|-----------|---------|
| Jurisdiction | `IJurisdictionPlugin` | Legal wrapper, regulatory compliance |
| Compliance | `ICompliancePlugin` | KYC, accreditation, transfer rules |
| Oracle | `IOraclePlugin` | External data (prices, NAV, attestations) |
| Storage | `IStoragePlugin` | Off-chain data (IPFS, S3, databases) |
| Chain | `IChainPlugin` | Blockchain adapter (EVM chains) |
| Token | `ITokenAdapter` | Token standard adapter (ERC20, ERC721) |

---

## Implementation Status Audit

### Fully Implemented (Production-Ready)

#### Lifecycle Engine
- **File:** `sdk/src/core/LifecycleEngine.ts`
- **Status:** 100% Complete
- **Features:**
  - Complete state machine with valid transitions
  - Transition guards (plugin hooks)
  - Event sourcing for audit trail
  - State rebuilding from events
  - Consistency verification

#### Token Adapters
- **Files:** `sdk/src/contracts/adapters/ERC20Adapter.ts`, `ERC721Adapter.ts`
- **Status:** 100% Complete
- **Features:**
  - Real ethers.js contract interaction
  - Mint, transfer, burn operations
  - Freeze/unfreeze accounts
  - Balance queries
  - Approval mechanisms

#### EVM Chain Plugin
- **File:** `sdk/src/plugins/chain/EVMChainPlugin.ts`
- **Status:** 100% Complete
- **Features:**
  - Multi-chain support (Base, Polygon, Ethereum)
  - Transaction sending and confirmation
  - Event subscription
  - Gas estimation

#### Pre-built React Components (NEW)
- **Files:** `sdk/src/components/*.tsx`
- **Status:** 100% Complete
- **Features:**
  - `TokenizeButton` - One-click tokenization wizard
  - `AssetWizard` - Multi-step asset creation (Stripe Checkout style)
  - `AssetCard` - Asset display with actions
  - `TransferForm` - Token transfer form with validation
  - `BalanceDisplay` - Token balance with USD value
  - `LifecycleStatus` - Asset state indicator
  - `KYCBadge` - Verification status badge
  - `PartyBadge` - Party info display
  - Custom theming support
  - Zero-dependency inline styles

#### Chainlink Integration
- **File:** `sdk/src/plugins/chainlink/DataFeedPlugin.ts`
- **Status:** 100% Complete
- **Features:**
  - Real Chainlink oracle addresses
  - Price feed queries
  - Data caching with TTL
  - Signature verification

### Partially Implemented (Needs Work)

#### Compliance Service
- **File:** `sdk/src/services/ComplianceService.ts`
- **Status:** 70% Complete
- **Working:**
  - KYC verification checks
  - Whitelist management
  - Jurisdiction rules
  - Lockup period enforcement
  - Max holder limits
- **Missing:**
  - Real KYC provider integration
  - Persistent rule storage
  - Audit logging

#### Verification Service
- **File:** `sdk/src/services/VerificationService.ts`
- **Status:** 50% Complete
- **Working:**
  - RSA/ECDSA/HMAC signature verification
  - Content hash validation
  - Certificate expiry checks
- **Critical Issue:**
  ```typescript
  // Line 158-159 - DANGEROUS
  if (!keyEntry) {
    return ok(undefined); // Accepts unknown signers!
  }
  ```

### Mocked/Stub (Not Production-Ready)

#### Oracle Service (Default)
- **File:** `sdk/src/services/OracleService.ts`
- **Status:** 10% Complete (Mock)
- **Issue:** Returns hardcoded test data
  ```typescript
  const mockPrices: Record<string, string> = {
    'ETH/USD': '2000000000',
    'BTC/USD': '50000000000',
  };
  ```

#### API Storage Plugin
- **File:** `sdk/src/plugins/api/ApiStoragePlugin.ts`
- **Status:** 30% Complete
- **Issue:** Contains TODO markers, incomplete implementation

#### Policy Evaluator
- **File:** `sdk/src/core/PolicyEvaluator.ts`
- **Status:** 80% Complete
- **Critical Issue:**
  ```typescript
  // Line 72-74 - BYPASSES ALL CHECKS
  if (!this.registry) {
    return result; // Allow all transitions
  }
  ```

---

## Institutional Landscape Comparison

### Circle (USDC, Verite)

| Capability | Circle | Our SDK |
|------------|--------|---------|
| KYC/Identity | Verite protocol, DID integration | Mock only |
| Compliance | Licensed money transmitter | Rule engine, no licenses |
| Multi-chain | 7+ chains production | 3 chains (expandable) |
| Reserves | Monthly attestations, audited | No proof of reserves |
| Regulatory | SEC registered, state licenses | No regulatory status |
| Banking | Direct bank relationships | No fiat rails |

**Circle's Investment:** $500M+ in compliance infrastructure

### BlackRock (BUIDL Fund)

| Capability | BlackRock BUIDL | Our SDK |
|------------|-----------------|---------|
| Asset Types | Tokenized money market fund | Any asset type |
| Custody | BNY Mellon (regulated) | Self-custody only |
| NAV | Real-time, audited | Mock oracle |
| Investors | Accredited, $5M minimum | Configurable |
| Settlement | T+0 via Securitize | No settlement rails |
| AUM | $10+ trillion backing | $0 |

**BlackRock's Edge:** Existing investor relationships, regulated fund structure

### Securitize

| Capability | Securitize | Our SDK |
|------------|------------|---------|
| Regulatory | SEC-registered transfer agent | None |
| Cap Table | Full management, corporate actions | Balance tracking only |
| KYC/AML | Real provider integrations | Mock |
| Secondary Market | ATS license, trading venue | P2P only |
| Dividends/Voting | Full corporate actions | Not implemented |
| Setup Cost | $50k+ | Free |
| Time to Launch | Months | Days |

**Securitize's Edge:** Legal recognition as transfer agent

### Chainlink

| Capability | Chainlink | Our SDK |
|------------|-----------|---------|
| Cross-chain | Production CCIP | CCIP plugin (built on Chainlink) |
| Oracles | 1000+ feeds, battle-tested | Uses Chainlink |
| Proof of Reserve | Production attestations | Not integrated |
| Security | $75B+ secured | Unaudited |

**Our Position:** We build ON Chainlink, not competing with it

### Competitive Summary

```
┌────────────────────────────────────────────────────────────────┐
│                    MARKET POSITIONING                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   INFRASTRUCTURE LAYER (We don't compete here)                 │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│   │ Circle   │  │BlackRock │  │Securitize│  │ Chainlink│      │
│   │ (Fiat)   │  │ (Funds)  │  │(Transfer)│  │ (Oracles)│      │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│         │             │             │             │            │
│         └─────────────┴─────────────┴─────────────┘            │
│                           │                                    │
│                           ▼                                    │
│   ┌────────────────────────────────────────────────────┐      │
│   │           TOKENISATION SDK (Our Layer)             │      │
│   │     "Stripe for RWA" - Developer Tools             │      │
│   └────────────────────────────────────────────────────┘      │
│                           │                                    │
│                           ▼                                    │
│   ┌────────────────────────────────────────────────────┐      │
│   │           AHOY PLATFORM (Application)              │      │
│   │     Ecosystem Services (COMET, FlyPlus, etc.)      │      │
│   └────────────────────────────────────────────────────┘      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Gap Analysis

### Critical Security Gaps

#### 1. Fail-Open Compliance
**Risk Level:** CRITICAL

```typescript
// VerificationService.ts - Accepts unknown signers
if (!keyEntry) {
  return ok(undefined); // Should REJECT, not accept
}

// PolicyEvaluator.ts - Bypasses all checks
if (!this.registry) {
  return result; // Should FAIL CLOSED
}
```

**Impact:** Any transaction can pass compliance checks if plugins aren't configured.

#### 2. No Persistent Storage
**Risk Level:** HIGH

- EventStore is in-memory only
- State lost on application restart
- No audit trail durability

#### 3. Mock Oracle in Hot Path
**Risk Level:** HIGH

- Default OracleService returns hardcoded data
- Real Chainlink plugin exists but not default
- NAV calculations would be wrong

### Functional Gaps

| Gap | Impact | Effort to Fix |
|-----|--------|---------------|
| No real KYC provider | Cannot verify investor identity | 2-3 weeks |
| No custody solution | Users must self-custody | Partner needed |
| No fiat rails | No on/off ramp | Partner needed |
| No corporate actions | No dividends, voting | 4-6 weeks |
| No cap table export | Cannot provide to regulators | 1-2 weeks |
| No secondary market | P2P only, no liquidity | Partner needed |

### Regulatory Gaps

| Requirement | Status | Path Forward |
|-------------|--------|--------------|
| Smart contract audit | Not done | Hire auditor ($50-150k) |
| Legal opinion | Not done | Engage securities counsel |
| Transfer agent license | Not applicable | Partner with Securitize |
| Money transmitter | Not applicable | Partner with Circle |
| Data privacy (GDPR) | Not assessed | Legal review needed |

---

## Strategic Positioning

### What NOT to Claim

- "Enterprise-grade" (no audits)
- "Institutional-ready" (no regulatory status)
- "Better than Securitize" (they have licenses)
- "Compliant out of the box" (compliance fails open)

### Recommended Positioning

#### Primary: "Stripe for RWA Tokenization"
> Developer tools for building tokenized asset applications. Handle compliance, multi-chain, and oracles without building infrastructure.

#### Secondary: "Tokenization for the 99%"
> For projects that can't afford $50k Securitize setup fees or months of integration. Ship in days, not months.

#### Ecosystem: "AHOY Unified Platform"
> One token connecting logistics, aviation, utilities, AI, and social services. Earn anywhere, spend everywhere.

### Target Users

| Segment | Need | Our Value |
|---------|------|-----------|
| Startups | Fast time-to-market | Days vs months |
| Developers | Clean SDK | Best-in-class DX |
| Web3 Projects | Compliance foundation | Rule engine built-in |
| AHOY Ecosystem | Unified token | Cross-service utility |

### What We Should NOT Target (Yet)

| Segment | Why Not |
|---------|---------|
| Banks/FIs | Need audits, licenses |
| Large Asset Managers | Need custody solutions |
| Public Securities | Need transfer agent |
| Cross-border Payments | Need MTL |

---

## Production Roadmap

### Phase 1: Critical Security (Weeks 1-2)

**Objective:** Fix fail-open vulnerabilities

#### 1.1 Harden Verification Service
```typescript
// BEFORE (dangerous)
if (!keyEntry) {
  return ok(undefined);
}

// AFTER (secure)
if (!keyEntry) {
  return err('Unknown signer - signature rejected');
}
```

**Tasks:**
- [ ] Change VerificationService to fail closed
- [ ] Add strict mode configuration option
- [ ] Log all verification attempts
- [ ] Unit tests for rejection cases

**Effort:** 2-3 days

#### 1.2 Harden Policy Evaluator
```typescript
// BEFORE (dangerous)
if (!this.registry) {
  return result; // Allow all
}

// AFTER (secure)
if (!this.registry) {
  return {
    ...result,
    violations: [{
      ruleId: 'NO_PLUGINS',
      message: 'No compliance plugins configured',
      severity: 'ERROR'
    }]
  };
}
```

**Tasks:**
- [ ] Change PolicyEvaluator to fail closed
- [ ] Require explicit "bypass" flag for testing
- [ ] Add startup validation for required plugins
- [ ] Integration tests for compliance flow

**Effort:** 2-3 days

#### 1.3 Add Compliance Audit Logging
**Tasks:**
- [ ] Log all compliance check requests
- [ ] Log all compliance decisions (pass/fail)
- [ ] Include actor, asset, timestamp, reason
- [ ] Structured logging format (JSON)

**Effort:** 1-2 days

---

### Phase 2: Persistence Layer (Weeks 2-4)

**Objective:** Durable storage for production use

#### 2.1 PostgreSQL Event Store
**Tasks:**
- [ ] Implement `PostgresEventStore` class
- [ ] Migration scripts for events table
- [ ] Connection pooling
- [ ] Retry logic for failures
- [ ] Index optimization for queries

**Schema:**
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  asset_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  actor_id UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_events_asset (asset_id),
  INDEX idx_events_type (event_type),
  INDEX idx_events_time (created_at)
);
```

**Effort:** 1 week

#### 2.2 PostgreSQL State Store
**Tasks:**
- [ ] Implement `PostgresStoragePlugin`
- [ ] Tables for parties, assets, balances
- [ ] Transaction support for consistency
- [ ] Optimistic locking for concurrent updates

**Effort:** 1 week

#### 2.3 Redis Caching Layer
**Tasks:**
- [ ] Cache frequently accessed data
- [ ] Balance queries
- [ ] Compliance status
- [ ] TTL configuration

**Effort:** 3-4 days

---

### Phase 3: KYC Integration (Weeks 4-6)

**Objective:** Real identity verification

#### 3.1 KYC Provider Integration
**Options:**
| Provider | Cost | Features |
|----------|------|----------|
| Jumio | $2-5/verification | Document + selfie |
| Onfido | $1-3/verification | Document + liveness |
| Persona | $1-4/verification | Flexible workflows |
| Sumsub | $0.5-2/verification | Good international |

**Tasks:**
- [ ] Select provider based on cost/features
- [ ] Implement `KYCProviderPlugin` interface
- [ ] Webhook handler for async verification
- [ ] Status caching and refresh
- [ ] Manual review queue UI

**Effort:** 2 weeks

#### 3.2 Accredited Investor Verification
**Tasks:**
- [ ] Integration with accreditation service
- [ ] Document upload for manual verification
- [ ] Expiry tracking and renewal reminders
- [ ] Jurisdiction-specific requirements

**Effort:** 1 week

---

### Phase 4: Smart Contract Audit (Weeks 6-10)

**Objective:** Security validation for on-chain code

#### 4.1 Pre-Audit Preparation
**Tasks:**
- [ ] Code freeze for audit scope
- [ ] Internal security review
- [ ] Documentation of all functions
- [ ] Test coverage to 90%+
- [ ] Known issues list

**Effort:** 1 week

#### 4.2 Audit Engagement
**Recommended Auditors:**
| Firm | Cost | Timeline |
|------|------|----------|
| Trail of Bits | $100-150k | 4-6 weeks |
| OpenZeppelin | $80-120k | 3-5 weeks |
| Consensys Diligence | $60-100k | 3-4 weeks |
| Halborn | $40-80k | 2-4 weeks |

**Scope:**
- ComplianceToken.sol
- IdentityRegistry.sol
- All token adapters
- Access control logic

**Effort:** 4-6 weeks (external)

#### 4.3 Remediation
**Tasks:**
- [ ] Fix all critical/high findings
- [ ] Document accepted risks for medium/low
- [ ] Re-audit if significant changes
- [ ] Publish audit report

**Effort:** 1-2 weeks

---

### Phase 5: Oracle Hardening (Weeks 8-10)

**Objective:** Real price data in production

#### 5.1 Default to Chainlink
**Tasks:**
- [ ] Make DataFeedPlugin the default oracle
- [ ] Remove mock data from OracleService
- [ ] Fallback handling for oracle failures
- [ ] Staleness checks for price data

**Effort:** 3-4 days

#### 5.2 Proof of Reserve Integration
**Tasks:**
- [ ] Integrate Chainlink PoR feeds
- [ ] Attestation verification
- [ ] Dashboard display
- [ ] Alerting for reserve discrepancies

**Effort:** 1 week

#### 5.3 NAV Calculation Service
**Tasks:**
- [ ] Real-time NAV calculation
- [ ] Multi-asset portfolio support
- [ ] Historical NAV tracking
- [ ] Audit trail for NAV changes

**Effort:** 1 week

---

### Phase 6: Legal & Compliance (Weeks 10-14)

**Objective:** Regulatory clarity

#### 6.1 Legal Opinion
**Tasks:**
- [ ] Engage securities counsel
- [ ] Token classification analysis
- [ ] Jurisdiction-specific guidance
- [ ] Exemption analysis (Reg D, Reg S, etc.)

**Cost:** $20-50k
**Effort:** 2-4 weeks (external)

#### 6.2 Terms of Service
**Tasks:**
- [ ] Platform terms of service
- [ ] Token holder agreement
- [ ] Privacy policy (GDPR compliant)
- [ ] Risk disclosures

**Effort:** 1-2 weeks (with counsel)

#### 6.3 Compliance Documentation
**Tasks:**
- [ ] AML/KYC policy document
- [ ] Transaction monitoring procedures
- [ ] Suspicious activity reporting
- [ ] Record retention policy

**Effort:** 1 week

---

### Phase 7: Production Infrastructure (Weeks 12-16)

**Objective:** Production-ready deployment

#### 7.1 Infrastructure Setup
**Tasks:**
- [ ] Kubernetes cluster setup
- [ ] Database high availability
- [ ] Redis cluster
- [ ] CDN for static assets
- [ ] DDoS protection

**Effort:** 1-2 weeks

#### 7.2 Monitoring & Alerting
**Tasks:**
- [ ] Application metrics (Prometheus)
- [ ] Log aggregation (ELK/Datadog)
- [ ] Uptime monitoring
- [ ] On-chain event monitoring
- [ ] PagerDuty integration

**Effort:** 1 week

#### 7.3 Disaster Recovery
**Tasks:**
- [ ] Database backup strategy
- [ ] Point-in-time recovery testing
- [ ] Multi-region failover plan
- [ ] Incident response procedures

**Effort:** 1 week

#### 7.4 Security Hardening
**Tasks:**
- [ ] Penetration testing
- [ ] Dependency vulnerability scanning
- [ ] Secret management (Vault)
- [ ] Network segmentation

**Effort:** 1-2 weeks

---

## Timeline Summary

```
Week  1-2:   ████ Critical Security Fixes
Week  2-4:   ████████ Persistence Layer
Week  4-6:   ████████ KYC Integration
Week  6-10:  ████████████████ Smart Contract Audit
Week  8-10:  ████████ Oracle Hardening
Week 10-14:  ████████████████ Legal & Compliance
Week 12-16:  ████████████████ Production Infrastructure

Total: 16 weeks to production-ready
```

---

## Resource Requirements

### Development Team

| Role | FTE | Duration | Cost (Est.) |
|------|-----|----------|-------------|
| Senior Backend Engineer | 1 | 16 weeks | $50-80k |
| Smart Contract Developer | 0.5 | 10 weeks | $25-40k |
| DevOps Engineer | 0.5 | 8 weeks | $15-25k |
| Security Engineer | 0.25 | 6 weeks | $10-15k |

**Total Development:** $100-160k

### External Services

| Service | Cost |
|---------|------|
| Smart Contract Audit | $50-150k |
| Legal Opinion | $20-50k |
| KYC Provider (Year 1) | $10-20k |
| Infrastructure (Year 1) | $20-40k |
| Penetration Testing | $10-20k |

**Total External:** $110-280k

### Grand Total

| Scenario | Investment |
|----------|------------|
| Minimum Viable | $210k |
| Recommended | $320k |
| Comprehensive | $440k |

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Audit finds critical bugs | Medium | High | Pre-audit internal review |
| KYC provider downtime | Low | Medium | Multi-provider fallback |
| Oracle manipulation | Low | High | Multiple data sources |
| Database corruption | Low | High | Regular backups, HA setup |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Regulatory action | Medium | Critical | Legal opinion, compliance |
| Competitor launches | High | Medium | Speed to market, ecosystem |
| No product-market fit | Medium | High | Customer development |
| Key person dependency | Medium | Medium | Documentation, knowledge sharing |

### Mitigation Priorities

1. **Smart Contract Audit** - Highest ROI for risk reduction
2. **Legal Opinion** - Regulatory clarity essential
3. **Fail-Closed Security** - Must fix before any production use
4. **Multi-provider Redundancy** - For KYC, oracles, infrastructure

---

## Appendix A: Implementation Priority Matrix

```
                    IMPACT
                    High    │    Low
              ┌─────────────┼─────────────┐
         High │ DO FIRST    │ SCHEDULE    │
              │             │             │
    EFFORT    │ • Security  │ • Corp      │
              │   fixes     │   actions   │
              │ • Persist-  │ • Secondary │
              │   ence      │   market    │
              ├─────────────┼─────────────┤
         Low  │ QUICK WINS  │ DEPRIORITIZE│
              │             │             │
              │ • Audit     │ • Nice-to-  │
              │   logging   │   have UI   │
              │ • Default   │ • Extra     │
              │   Chainlink │   chains    │
              └─────────────┴─────────────┘
```

---

## Appendix B: Competitive Feature Matrix

| Feature | Our SDK | Circle | BlackRock | Securitize |
|---------|---------|--------|-----------|------------|
| Multi-asset types | ✅ | ❌ | ❌ | ✅ |
| Developer SDK | ✅ | ⚠️ | ❌ | ⚠️ |
| Multi-chain | ✅ | ✅ | ❌ | ✅ |
| Compliance engine | ✅ | ✅ | ✅ | ✅ |
| Real KYC | ❌ | ✅ | ✅ | ✅ |
| Custody solution | ❌ | ✅ | ✅ | ✅ |
| Regulatory status | ❌ | ✅ | ✅ | ✅ |
| Fiat rails | ❌ | ✅ | ✅ | ✅ |
| Open source | ✅ | ❌ | ❌ | ❌ |
| Self-hostable | ✅ | ❌ | ❌ | ❌ |
| Cost to start | Free | $$$ | $$$$ | $$$ |
| Time to launch | Days | Months | Months | Months |

---

## Appendix C: Code Fixes Reference

### Fix 1: VerificationService Fail-Closed

**File:** `sdk/src/services/VerificationService.ts`

```typescript
// Line ~158 - CHANGE FROM:
if (!keyEntry) {
  // For testing/MVP, accept signatures from unknown signers with a warning
  console.warn(`Unknown signer: ${signer}`);
  return ok(undefined);
}

// TO:
if (!keyEntry) {
  return err(`Signature rejected: unknown signer ${signer}`);
}
```

### Fix 2: PolicyEvaluator Fail-Closed

**File:** `sdk/src/core/PolicyEvaluator.ts`

```typescript
// Line ~72 - CHANGE FROM:
if (!this.registry) {
  return result;
}

// TO:
if (!this.registry) {
  result.violations.push({
    ruleId: 'SYSTEM_NO_PLUGINS',
    ruleName: 'Plugin Registry Required',
    severity: 'ERROR',
    message: 'No compliance plugins configured. Configure plugins or enable bypass mode.',
  });
  return result;
}
```

### Fix 3: Add Strict Mode Configuration

**File:** `sdk/src/SDK.ts`

```typescript
interface SDKConfig {
  // ... existing config
  strictMode?: boolean; // Default: true in production
  allowUnknownSigners?: boolean; // Default: false
  requireCompliancePlugins?: boolean; // Default: true
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2026 | Technical Review | Initial document |

---

*This document is confidential and intended for internal strategic planning purposes.*
