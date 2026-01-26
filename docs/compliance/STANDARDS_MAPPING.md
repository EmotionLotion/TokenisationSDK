# Standards & Regulatory Mapping

This document maps the Tokenisation SDK's compliance features to established token standards and regulatory frameworks.

## Token Standards Compliance

### ERC-3643 (T-REX) Compliance

The SDK implements the ERC-3643 (Token for Regulated EXchanges) standard for compliant security tokens.

| ERC-3643 Component | SDK Implementation | Status |
|--------------------|-------------------|--------|
| **Identity Registry** | `IdentityRegistry.sol` | ✅ Implemented |
| **Claim Verification** | Claim topics + trusted issuers | ✅ Implemented |
| **Compliance Contract** | `ModularCompliance.sol` | ✅ Implemented |
| **Transfer Restrictions** | Per-token compliance rules | ✅ Implemented |
| **Agent Roles** | Owner, Agent, Compliance Officer | ✅ Implemented |
| **Recovery Mechanism** | `recoveryAddress()` function | ✅ Implemented |
| **Forced Transfers** | `forceTransfer()` with reason | ✅ Implemented |

### ERC-1400 (Security Token) Partial Support

| ERC-1400 Feature | SDK Implementation | Status |
|------------------|-------------------|--------|
| **Partitions** | `ERC1410Adapter` | ✅ Implemented |
| **Document Management** | Metadata URI | ⚠️ Partial |
| **Controller Operations** | Agent role | ✅ Implemented |
| **Issuance/Redemption** | Mint/Burn with compliance | ✅ Implemented |

### Additional Standards

| Standard | Purpose | Implementation |
|----------|---------|----------------|
| **ERC-20** | Fungible tokens | `ComplianceToken.sol` |
| **ERC-721** | NFTs | `ERC721Adapter` |
| **ERC-1155** | Multi-tokens | `ComplianceMultiToken.sol` |
| **ERC-4626** | Tokenized vaults | `ERC4626Adapter` |
| **ERC-5192** | Soulbound tokens | `SoulboundAdapter` |

---

## Compliance Features Specification

### KYC Verification

**What "KYC Verified" means in this SDK:**

```
KYC Verification = Identity Registration + Valid Claim(s)
```

1. **Identity Registration**: Address linked to an identity in `IdentityRegistry`
2. **Claim Verification**: At least one valid claim from a trusted issuer

**Claim Topics (IIdentityRegistry.sol):**

| Topic ID | Name | Description |
|----------|------|-------------|
| 1 | `KYC` | Know Your Customer verification |
| 2 | `AML` | Anti-Money Laundering check |
| 3 | `ACCREDITATION` | Accredited investor status |
| 4 | `COUNTRY_ALLOWED` | Country whitelist membership |
| 5 | `COUNTRY_BLOCKED` | Sanctions/blacklist check |
| 6 | `INSTITUTION` | Institutional investor |
| 7 | `QUALIFIED_PURCHASER` | Qualified purchaser status |

**Verification Flow:**

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  KYC Provider   │────▶│  Trusted Issuer  │────▶│ IdentityRegistry│
│  (Off-chain)    │     │  (On-chain)      │     │  (On-chain)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
       │                        │                        │
       │ Verify identity        │ Issue claim           │ Store claim
       │ documents              │ with signature        │ + verify
       ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  User can now transfer tokens (if other compliance rules pass)  │
└─────────────────────────────────────────────────────────────────┘
```

### Transfer Restrictions

**Compliance Rules per Token:**

```solidity
struct ComplianceRules {
    bool requireKyc;           // Require KYC claim
    bool requireAccreditation; // Require accreditation claim
    uint256 maxInvestorCount;  // Max token holders (0 = unlimited)
    uint256 maxHoldingAmount;  // Max per-address holding (0 = unlimited)
    uint256 minTransferAmount; // Minimum transfer size
    uint256 lockupEndTime;     // Lockup period end timestamp
    uint16[] allowedCountries; // Whitelist (empty = all allowed)
    uint16[] blockedCountries; // Blacklist (sanctions)
}
```

**Transfer Validation Order:**

1. ✅ Token not paused
2. ✅ Sender not frozen
3. ✅ Recipient not frozen
4. ✅ Lockup period expired
5. ✅ Amount >= minTransferAmount
6. ✅ Recipient holding <= maxHoldingAmount
7. ✅ Investor count <= maxInvestorCount (for new holders)
8. ✅ Sender has valid KYC claim (if required)
9. ✅ Recipient has valid KYC claim (if required)
10. ✅ Sender accredited (if required)
11. ✅ Recipient accredited (if required)
12. ✅ Recipient country in allowedCountries (if set)
13. ✅ Recipient country NOT in blockedCountries

---

## Regulatory Framework Mapping

### Jurisdiction Support

| Jurisdiction | ISO Code | Supported Features |
|--------------|----------|-------------------|
| **UAE (VARA)** | AE (784) | Full compliance suite |
| **USA (SEC)** | US (840) | Accredited investor checks, Reg D/S |
| **UK (FCA)** | GB (826) | Qualified investor checks |
| **Singapore (MAS)** | SG (702) | Accredited investor |
| **EU (MiFID II)** | Various | Professional investor classification |

### Sanctions Compliance

**Blocked Countries (Default):**

| Country | ISO Code | Reason |
|---------|----------|--------|
| North Korea | KP (408) | OFAC sanctions |
| Iran | IR (364) | OFAC sanctions |
| Cuba | CU (192) | OFAC sanctions |
| Syria | SY (760) | OFAC sanctions |

**Implementation:**

```solidity
// In ComplianceToken._isCompliantTransfer():
for (uint256 i = 0; i < rules.blockedCountries.length; i++) {
    if (rules.blockedCountries[i] == toCountry) {
        return false; // Transfer blocked
    }
}
```

---

## Policy Engine Specification

### Policy Schema (YAML)

```yaml
# policies/transfer-policy.yaml
version: "1.0"
name: "Standard Transfer Policy"
description: "Default compliance policy for token transfers"

rules:
  - id: "kyc-required"
    type: "claim_check"
    claim_topic: 1  # KYC
    required: true

  - id: "max-holding"
    type: "balance_limit"
    max_amount: "1000000"
    per_address: true

  - id: "lockup"
    type: "time_restriction"
    unlock_after: "2025-01-01T00:00:00Z"

  - id: "country-whitelist"
    type: "jurisdiction"
    mode: "whitelist"
    countries: ["US", "AE", "SG", "GB"]

actions:
  on_violation:
    - revert_with_reason
    - emit_event
```

### Policy Determinism Rules

1. **Deterministic Evaluation**: Same inputs → same output
2. **No External Calls**: Policy evaluation is pure on-chain logic
3. **Ordered Rule Evaluation**: Rules evaluated in declaration order
4. **First Failure Stops**: Transfer reverts on first rule violation

### Policy Versioning

| Version | Changes | Migration |
|---------|---------|-----------|
| 1.0 | Initial release | N/A |
| 1.1 | Add lockup rules | Backward compatible |
| 2.0 | New rule schema | Requires migration |

---

## What We DON'T Support (Yet)

| Feature | Status | Notes |
|---------|--------|-------|
| **DID/Verifiable Credentials** | 🔜 Planned | Will add W3C VC support |
| **On-chain Revocation Registry** | 🔜 Planned | Currently off-chain |
| **Real-time Sanctions Screening** | ⚠️ Mocked | Enterprise: integrate provider |
| **Cross-chain Identity** | 🔜 Planned | CCIP-based identity bridge |
| **Automated Accreditation Renewal** | ❌ Not supported | Manual re-verification required |

---

## Integration with KYC Providers

The SDK supports pluggable KYC providers through adapters:

```typescript
// Example: Sumsub integration (enterprise)
const kycPlugin = new KYCCompliancePlugin({
  provider: 'sumsub',
  apiKey: process.env.SUMSUB_API_KEY,
  webhookSecret: process.env.SUMSUB_WEBHOOK_SECRET,
});

// On successful verification, issue on-chain claim
await kycPlugin.onVerificationComplete(async (result) => {
  if (result.status === 'approved') {
    await identityRegistry.addClaim(
      result.walletAddress,
      ClaimTopics.KYC,
      trustedIssuerAddress,
      result.signature,
      result.data,
      result.documentUri
    );
  }
});
```

**Supported Providers (via adapters):**

| Provider | Type | Status |
|----------|------|--------|
| Mock Provider | Testing | ✅ Included |
| Sumsub | Enterprise | 🔜 Adapter available |
| Onfido | Enterprise | 🔜 Adapter available |
| Sardine | Enterprise | 🔜 Planned |
| Persona | Enterprise | 🔜 Planned |

---

## References

- [ERC-3643 Specification](https://eips.ethereum.org/EIPS/eip-3643)
- [ERC-1400 Specification](https://eips.ethereum.org/EIPS/eip-1400)
- [T-REX Documentation](https://docs.tokeny.com/)
- [OFAC Sanctions List](https://sanctionssearch.ofac.treas.gov/)
