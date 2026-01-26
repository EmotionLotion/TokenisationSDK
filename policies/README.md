# Policy Presets

This folder contains JSON-based policy presets that can be loaded into the compliance engine. Policies are **data, not code** - the same engine evaluates different rulesets.

## Policy DSL Specification

### Structure

```json
{
  "name": "Human readable name",
  "version": 1,
  "jurisdiction": "AE",
  "assetType": "real_estate",
  "description": "What this policy does",
  "rules": [...],
  "actions": {
    "onDeny": ["log_decision", "notify_compliance"],
    "onAllow": ["log_decision"]
  }
}
```

### Rule Types

| Type | Description |
|------|-------------|
| `require` | Condition must be true for action to proceed |
| `block` | Condition triggers denial |
| `limit` | Numeric threshold check |
| `allow` | Explicit allow override |

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `"value": "approved"` |
| `neq` | Not equals | `"value": "blocked"` |
| `gt` | Greater than | `"value": 1000` |
| `gte` | Greater than or equal | `"value": 1000` |
| `lt` | Less than | `"value": 10000000` |
| `lte` | Less than or equal | `"value": 100` |
| `in` | Value in list | `"value": ["AE", "SG", "UK"]` |
| `not_in` | Value not in list | `"value": ["KP", "IR", "SY"]` |
| `contains` | String contains | `"value": "verified"` |
| `regex` | Regex match | `"value": "^0x[a-fA-F0-9]{40}$"` |
| `between` | Range check | `"value": [1, 100]` |

### Available Fields

#### Investor Fields
- `investor.kycStatus` - KYC verification status (none, pending, approved, rejected, expired)
- `investor.kycLevel` - KYC level granted
- `investor.type` - Investor type (individual, institutional, qualified, accredited)
- `investor.countryCode` - ISO 2-letter country code
- `investor.status` - Account status (pending, active, suspended, blocked)
- `investor.accredited` - Boolean accreditation status
- `investor.riskScore` - Numeric risk score (0-100)

#### Asset Fields
- `asset.type` - Asset type (real_estate, carbon, ticket, royalty, etc.)
- `asset.jurisdiction` - Asset jurisdiction
- `asset.status` - Asset lifecycle status
- `asset.dldStatus` - DLD verification status (for UAE real estate)

#### Token Fields
- `token.status` - Token status (draft, deployed, paused, frozen)
- `token.totalSupply` - Total token supply
- `token.circulatingSupply` - Circulating supply

#### Transfer Fields
- `transfer.amount` - Transfer amount (in smallest unit)
- `transfer.fromBalance` - Sender's current balance
- `transfer.toBalance` - Recipient's current balance
- `transfer.resultingBalance` - Recipient's balance after transfer

#### Time Fields
- `time.now` - Current timestamp
- `time.dayOfWeek` - Day of week (0-6)
- `time.hour` - Hour of day (0-23)

## Folder Structure

```
policies/
├── README.md                 # This file
├── jurisdiction/             # Jurisdiction-specific base policies
│   ├── uae_base.json
│   ├── eu_mca.json
│   └── us_reg_d.json
├── asset/                    # Asset-type specific policies
│   ├── real_estate.json
│   ├── carbon_credit.json
│   └── event_ticket.json
└── templates/                # Reusable rule templates
    ├── kyc_required.json
    ├── accredited_only.json
    ├── sanctioned_countries.json
    └── holding_limits.json
```

## Usage

### Loading a Policy Preset

```typescript
// Via SDK
import { loadPolicyPreset } from '@tokenisation/sdk';

const policy = await loadPolicyPreset('uae_real_estate');
await sdk.compliance.createPolicy(policy);

// Via API
POST /api/v1/compliance/policies/import
{
  "preset": "uae_real_estate",
  "overrides": {
    "rules": [
      { "id": "max_holding", "value": "5000000000000000000" }
    ]
  }
}
```

### Composing Policies

Policies can be composed by merging rule arrays:

```typescript
const policy = composePolicies([
  loadPreset('jurisdiction/uae_base'),
  loadPreset('asset/real_estate'),
  loadPreset('templates/kyc_required'),
]);
```

## Examples

See individual JSON files for complete examples.
