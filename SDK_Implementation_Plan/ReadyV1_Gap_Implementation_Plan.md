# Ready V1 Gap Implementation Plan

> Generated: 2026-01-19
> Status: Implementation Roadmap
> Target: Close all gaps to achieve "Ready" status per Ready.md specification

---

## Executive Summary

The TokenisationSDK has **~80% of Ready v1 functionality implemented**. All 8 core acceptance criteria are functionally complete in the API. This plan addresses the remaining gaps to achieve full "Ready" status.

### Current State
- Core API: Complete
- TypeScript SDK: Complete
- Transfer saga: Complete
- DLD integration: Complete (mock)
- KYC/Investor flow: Complete
- Policy engine: Complete
- Audit/Compliance: Complete

### Gaps to Close
1. OpenAPI specification
2. Python SDK
3. Policy preset JSON files
4. ERC-3643 smart contracts
5. Folder structure reorganization
6. Additional examples & templates

---

## Phase 1: API Documentation & Discoverability (Priority: CRITICAL)

### 1.1 Generate OpenAPI Specification

**Goal:** Create `openapi.yaml` from existing Express routes

**Tasks:**
```
[ ] Install swagger-jsdoc and swagger-ui-express
[ ] Add JSDoc annotations to all route handlers in server/src/routes/
[ ] Create openapi base configuration in server/src/config/openapi.ts
[ ] Generate openapi.yaml artifact
[ ] Add /docs endpoint serving Swagger UI
[ ] Validate spec with openapi-generator-cli
```

**Deliverables:**
- `/server/openapi.yaml` - Full OpenAPI 3.0 specification
- `/api/docs` endpoint - Interactive API documentation
- Error schema documentation
- Idempotency behavior documentation

**Files to modify:**
```
server/src/index.ts              - Add swagger middleware
server/src/config/openapi.ts     - New: OpenAPI base config
server/src/routes/*.routes.ts    - Add JSDoc annotations
server/openapi.yaml              - Generated output
```

---

### 1.2 Create Postman Collection

**Goal:** Export API as importable Postman collection

**Tasks:**
```
[ ] Convert OpenAPI spec to Postman collection (openapi-to-postman)
[ ] Add environment variables (sandbox, staging, production URLs)
[ ] Create example requests for each endpoint
[ ] Add pre-request scripts for authentication
[ ] Include test scripts for response validation
[ ] Document the full end-to-end flow as a Postman folder
```

**Deliverables:**
- `/docs/postman/TokenisationSDK.postman_collection.json`
- `/docs/postman/environments/sandbox.postman_environment.json`
- `/docs/postman/environments/production.postman_environment.json`

---

## Phase 2: Multi-Language SDK Support (Priority: HIGH)

### 2.1 Python SDK

**Goal:** Create Python SDK wrapping the REST API (Stripe-like)

**Structure:**
```
sdk/python/
├── trouve_tokenisation/
│   ├── __init__.py
│   ├── client.py              # Main TrouveClient class
│   ├── resources/
│   │   ├── __init__.py
│   │   ├── assets.py
│   │   ├── investors.py
│   │   ├── tokens.py
│   │   ├── transfers.py
│   │   ├── compliance.py
│   │   ├── dld.py
│   │   ├── webhooks.py
│   │   └── ledger.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── types.py           # Pydantic models
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── http.py            # HTTP client with retries
│   │   ├── pagination.py      # Pagination helpers
│   │   ├── idempotency.py     # Idempotency key handling
│   │   └── webhook.py         # Webhook signature verification
│   └── exceptions.py
├── tests/
├── setup.py
├── pyproject.toml
└── README.md
```

**Tasks:**
```
[ ] Set up Python package structure with pyproject.toml
[ ] Create base HTTP client with retry/backoff logic
[ ] Implement typed models using Pydantic (generate from OpenAPI)
[ ] Create resource classes for each API domain
[ ] Add pagination helpers (auto-fetch all pages)
[ ] Implement idempotency key auto-generation
[ ] Create webhook signature verification utility
[ ] Write unit tests with pytest
[ ] Add integration tests against sandbox
[ ] Publish to PyPI as `trouve-tokenisation`
```

**Example usage:**
```python
from trouve_tokenisation import TrouveClient

client = TrouveClient(api_key="sk_test_...")

# Create investor
investor = client.investors.create(
    email="investor@example.com",
    type="individual",
    country_code="AE"
)

# Start KYC
kyc_session = client.investors.kyc.create(
    investor_id=investor.id,
    provider="sumsub",
    level_requested="standard"
)

# Compliant transfer
transfer = client.transfers.execute(
    token_id="tok_...",
    from_wallet="0x...",
    to_wallet="0x...",
    amount="1000000",
    auto_approve=True
)
```

---

### 2.2 C# SDK (Optional - Phase 2b)

**Goal:** Create C# SDK for enterprise/proptech integration

**Structure:**
```
sdk/csharp/
├── src/
│   └── Trouve.Tokenisation/
│       ├── TrouveClient.cs
│       ├── Resources/
│       ├── Models/
│       └── Utils/
├── tests/
├── Trouve.Tokenisation.csproj
└── README.md
```

**Tasks:**
```
[ ] Generate C# models from OpenAPI spec (NSwag)
[ ] Create TrouveClient with HttpClient
[ ] Implement async/await patterns
[ ] Add retry policies with Polly
[ ] Publish to NuGet as `Trouve.Tokenisation`
```

---

## Phase 3: Smart Contracts Enhancement (Priority: HIGH)

### 3.1 ERC-3643 Compliance Token Template

**Goal:** Add ERC-3643 (T-REX) compliant token template

**Structure:**
```
contracts/src/tokens/erc3643/
├── Token.sol                    # Main ERC-3643 token
├── IdentityRegistry.sol         # Identity registry (exists, enhance)
├── ClaimTopicsRegistry.sol      # Claim topics
├── TrustedIssuersRegistry.sol   # Trusted claim issuers
├── Compliance.sol               # Modular compliance
├── modules/
│   ├── CountryAllowModule.sol
│   ├── MaxBalanceModule.sol
│   ├── TimeTransferModule.sol
│   └── SupplyLimitModule.sol
└── interfaces/
    ├── IERC3643.sol
    ├── IIdentityRegistry.sol
    └── ICompliance.sol
```

**Tasks:**
```
[ ] Review ERC-3643 specification (https://eips.ethereum.org/EIPS/eip-3643)
[ ] Create base IERC3643 interface
[ ] Implement Token.sol with transfer restrictions
[ ] Implement modular compliance system
[ ] Create compliance modules (country, balance, time limits)
[ ] Update IdentityRegistry to ERC-3643 spec
[ ] Add claim topics and trusted issuers
[ ] Write comprehensive Foundry tests
[ ] Audit deployment scripts
[ ] Create factory contract for deterministic deployment
```

**Deliverables:**
- `/contracts/src/tokens/erc3643/` - Full ERC-3643 implementation
- `/contracts/script/DeployERC3643.s.sol` - Deployment script
- `@trouve/contracts` package with ABIs

---

### 3.2 Token Factory Pattern

**Goal:** Create deterministic factory for token deployment

**Structure:**
```
contracts/src/factory/
├── TokenFactory.sol             # Factory with CREATE2
├── TokenBeacon.sol              # Upgradeable beacon
└── interfaces/
    └── ITokenFactory.sol
```

**Tasks:**
```
[ ] Implement TokenFactory with CREATE2 for deterministic addresses
[ ] Add beacon proxy pattern for upgradeability
[ ] Create deployment registry
[ ] Integrate with SDK deployment methods
```

---

## Phase 4: Policy Presets & Adapters (Priority: MEDIUM)

### 4.1 Policy Preset JSON Files

**Goal:** Create jurisdiction/asset-specific policy presets

**Structure:**
```
policies/
├── README.md                           # Policy DSL documentation
├── jurisdiction/
│   ├── uae_real_estate_base.json
│   ├── uae_carbon_base.json
│   └── uae_general.json
├── asset/
│   ├── real_estate.json
│   ├── carbon_credit.json
│   └── ticketing.json
└── templates/
    ├── kyc_required.json
    ├── accredited_only.json
    └── holding_period.json
```

**Example: `uae_real_estate_base.json`**
```json
{
  "name": "UAE Real Estate Base Policy",
  "version": 1,
  "jurisdiction": "AE",
  "assetType": "real_estate",
  "rules": [
    {
      "id": "kyc_required",
      "type": "require",
      "field": "investor.kycStatus",
      "op": "eq",
      "value": "approved",
      "message": "KYC verification required"
    },
    {
      "id": "dld_verified",
      "type": "require",
      "field": "asset.dldStatus",
      "op": "eq",
      "value": "verified",
      "message": "DLD title must be verified"
    },
    {
      "id": "min_investment",
      "type": "limit",
      "field": "transfer.amount",
      "op": "gte",
      "value": "1000000000000000000",
      "message": "Minimum investment is 1 token"
    },
    {
      "id": "blocked_countries",
      "type": "block",
      "field": "investor.countryCode",
      "op": "in",
      "value": ["KP", "IR", "SY", "CU"],
      "message": "Transfers blocked for sanctioned countries"
    }
  ],
  "actions": {
    "onDeny": ["log_decision", "notify_compliance"],
    "onAllow": ["log_decision"]
  }
}
```

**Tasks:**
```
[ ] Document policy DSL format in policies/README.md
[ ] Create UAE real estate base policy
[ ] Create carbon credit policy
[ ] Create ticketing policy
[ ] Add CLI command to load policy presets: `trouve policy load uae_real_estate_base`
[ ] Add API endpoint to import policy presets
```

---

### 4.2 Adapter Reorganization

**Goal:** Extract adapters into standalone modules

**Structure:**
```
adapters/
├── README.md
├── jurisdiction/
│   ├── dld/
│   │   ├── index.ts
│   │   ├── client.ts           # DLD API client
│   │   ├── types.ts            # DLD-specific types
│   │   ├── mock.ts             # Mock implementation
│   │   └── README.md
│   └── template/               # Template for new jurisdictions
├── asset/
│   ├── real_estate/
│   │   ├── index.ts
│   │   ├── schema.ts           # Normalized schema
│   │   └── verification.ts     # Verification workflow
│   └── carbon/
│       ├── index.ts
│       ├── schema.ts
│       └── verification.ts
└── kyc/
    ├── sumsub/
    ├── onfido/
    ├── jumio/
    └── manual/
```

**Tasks:**
```
[ ] Extract DLD logic from server routes to adapters/jurisdiction/dld/
[ ] Create adapter interface specification
[ ] Create real_estate asset adapter with normalized schema
[ ] Create carbon asset adapter
[ ] Add adapter certification test suite
[ ] Update SDK to use adapter modules
```

---

## Phase 5: Examples & Templates (Priority: MEDIUM)

### 5.1 Additional Example Projects

**Structure:**
```
examples/
├── real-estate-demo/            # Existing
├── investor-onboarding/         # New
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   └── README.md
├── transfer-with-webhooks/      # New
│   ├── src/
│   │   ├── index.ts
│   │   └── webhookHandler.ts
│   ├── package.json
│   └── README.md
└── end-to-end-flow/             # New
    ├── src/
    │   └── index.ts
    ├── package.json
    └── README.md
```

**Tasks:**
```
[ ] Create investor-onboarding example (complete KYC flow)
[ ] Create transfer-with-webhooks example (webhook handling)
[ ] Create end-to-end-flow example (all 8 Ready criteria in <200 lines)
[ ] Add step-by-step comments in each example
[ ] Test all examples against sandbox
```

---

### 5.2 Webhook Handler Templates

**Goal:** Provide ready-to-use webhook handlers

**Structure:**
```
templates/
├── webhooks/
│   ├── typescript/
│   │   └── webhookHandler.ts
│   ├── python/
│   │   └── webhook_handler.py
│   └── README.md
```

**Example: `webhookHandler.ts`**
```typescript
import crypto from 'crypto';
import express from 'express';

const WEBHOOK_SECRET = process.env.TROUVE_WEBHOOK_SECRET!;

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expected}`)
  );
}

export const webhookRouter = express.Router();

webhookRouter.post('/trouve/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-trouve-signature'] as string;
  const payload = req.body.toString();

  if (!verifyWebhookSignature(payload, signature, WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(payload);

  switch (event.type) {
    case 'transfer.created':
      console.log('Transfer created:', event.data.id);
      break;
    case 'transfer.settled':
      console.log('Transfer settled:', event.data.id);
      break;
    case 'investor.kyc.approved':
      console.log('KYC approved:', event.data.investorId);
      break;
    case 'dld.title.verified':
      console.log('DLD title verified:', event.data.titleId);
      break;
    default:
      console.log('Unhandled event:', event.type);
  }

  res.json({ received: true });
});
```

---

### 5.3 Sandbox Consolidation

**Goal:** Create unified sandbox environment

**Structure:**
```
sandbox/
├── README.md
├── docker-compose.yml           # Full sandbox environment
├── fixtures/
│   ├── investors.json
│   ├── assets.json
│   ├── tokens.json
│   └── dld_titles.json
├── mocks/
│   ├── kyc/                     # Mock KYC provider
│   ├── dld/                     # Mock DLD responses
│   └── chain/                   # Local testnet config
└── scripts/
    ├── seed.ts                  # Seed deterministic test data
    └── reset.ts                 # Reset sandbox state
```

**Tasks:**
```
[ ] Create docker-compose.yml for full sandbox
[ ] Create deterministic test fixtures
[ ] Add sandbox seed script
[ ] Document "Try in Sandbox" guided flow
[ ] Create sandbox account provisioning
```

---

## Phase 6: Documentation Enhancement (Priority: MEDIUM)

### 6.1 Cookbook Recipes

**Add to `/docs/cookbook/`:**
```
docs/cookbook/
├── README.md
├── real-estate-tokenization.md
├── investor-onboarding.md
├── compliant-transfers.md
├── webhook-integration.md
├── cap-table-export.md
├── policy-configuration.md
└── troubleshooting.md
```

**Tasks:**
```
[ ] Create cookbook index in docs/cookbook/README.md
[ ] Write real-estate tokenization recipe
[ ] Write investor onboarding recipe
[ ] Write compliant transfers recipe
[ ] Write webhook integration recipe
[ ] Add troubleshooting guide
```

---

## Implementation Timeline

```
Phase 1: API Documentation (Week 1-2)
├── 1.1 OpenAPI Specification
└── 1.2 Postman Collection

Phase 2: Multi-Language SDKs (Week 3-5)
├── 2.1 Python SDK
└── 2.2 C# SDK (optional)

Phase 3: Smart Contracts (Week 4-6)
├── 3.1 ERC-3643 Template
└── 3.2 Token Factory

Phase 4: Policy & Adapters (Week 5-7)
├── 4.1 Policy Presets
└── 4.2 Adapter Reorganization

Phase 5: Examples & Templates (Week 6-8)
├── 5.1 Example Projects
├── 5.2 Webhook Templates
└── 5.3 Sandbox Consolidation

Phase 6: Documentation (Week 7-8)
└── 6.1 Cookbook Recipes
```

---

## Priority Matrix

| Task | Impact | Effort | Priority |
|------|--------|--------|----------|
| OpenAPI Specification | HIGH | LOW | P0 |
| Python SDK | HIGH | MEDIUM | P0 |
| ERC-3643 Contracts | HIGH | HIGH | P1 |
| Policy Preset JSONs | MEDIUM | LOW | P1 |
| Postman Collection | MEDIUM | LOW | P1 |
| Webhook Templates | MEDIUM | LOW | P2 |
| Example Projects | MEDIUM | MEDIUM | P2 |
| Adapter Reorganization | MEDIUM | MEDIUM | P2 |
| Sandbox Consolidation | MEDIUM | MEDIUM | P2 |
| C# SDK | LOW | HIGH | P3 |
| Cookbook Recipes | LOW | MEDIUM | P3 |

---

## Definition of Done

The SDK is "Ready v1" when:

1. [ ] All 8 acceptance criteria pass in automated tests
2. [ ] OpenAPI spec published and validated
3. [ ] Python SDK published to PyPI
4. [ ] ERC-3643 contracts audited and deployed to testnet
5. [ ] Policy presets available for UAE real estate
6. [ ] Webhook handler templates in TypeScript and Python
7. [ ] End-to-end example runs in <200 lines
8. [ ] Sandbox environment fully documented
9. [ ] All documentation reviewed and published

---

## Next Steps

1. **Immediate**: Generate OpenAPI spec from existing routes
2. **This week**: Start Python SDK scaffolding
3. **Review**: ERC-3643 specification for contract requirements
4. **Plan**: Coordinate policy presets with compliance team
