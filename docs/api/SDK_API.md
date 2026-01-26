# SDK API Reference

## Installation

```bash
npm install @tokenisation/sdk
```

## Initialization

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';

// Development (mock plugins)
const sdk = new TokenisationSDK({ useMockPlugins: true });

// Production (real plugins)
const sdk = new TokenisationSDK({ useMockPlugins: false });
sdk.plugins.register('storage', new ApiStoragePlugin(apiClient));
sdk.plugins.register('compliance', new CompliancePlugin());
```

---

## Assets Module (`sdk.assets`)

### `create(data)`

Create a new asset in DRAFT state.

```typescript
const asset = await sdk.assets.create({
  name: string;              // Asset name (1-256 chars)
  rightType: RightType;      // OWNERSHIP | ACCESS | BEHAVIOR | VERIFICATION
  issuerId: string;          // UUID of issuing party
  jurisdiction: {
    countryCode: string;     // ISO 3166-1 alpha-2 (e.g., "US")
  };
  transferMode?: TransferMode; // Default: COMPLIANCE_GATED
  metadata?: Record<string, unknown>;
});

// Returns: Asset
```

### `get(id)`

Retrieve an asset by ID.

```typescript
const asset = await sdk.assets.get(assetId: string);
// Returns: Asset | null
```

### `list()`

List all assets.

```typescript
const assets = await sdk.assets.list();
// Returns: Asset[]
```

### `transition(id, toState, actorId)`

Transition asset to a new lifecycle state.

```typescript
await sdk.assets.transition(
  assetId: string,
  toState: LifecycleState,
  actorId: string
);
// Returns: Asset
```

### `verify(id, verifierId)`

Mark asset as verified. Shortcut for transition to VERIFIED.

```typescript
await sdk.assets.verify(assetId: string, verifierId: string);
// Returns: Asset
```

### `activate(id, issuerId)`

Activate asset for token operations. Shortcut for transition to ACTIVE.

```typescript
await sdk.assets.activate(assetId: string, issuerId: string);
// Returns: Asset
```

### `suspend(id, operatorId)`

Suspend asset operations.

```typescript
await sdk.assets.suspend(assetId: string, operatorId: string);
// Returns: Asset
```

### `freeze(id, operatorId)`

Freeze asset (regulatory hold).

```typescript
await sdk.assets.freeze(assetId: string, operatorId: string);
// Returns: Asset
```

---

## Tokens Module (`sdk.tokens`)

### `mint(assetId, toPartyId, amount)`

Mint new tokens to a party.

```typescript
await sdk.tokens.mint(
  assetId: string,
  toPartyId: string,
  amount: string      // Use string for precision (e.g., "1000000")
);
// Returns: void
```

### `transfer(assetId, fromPartyId, toPartyId, amount)`

Transfer tokens between parties.

```typescript
const result = await sdk.tokens.transfer(
  assetId: string,
  fromPartyId: string,
  toPartyId: string,
  amount: string
);
// Returns: TransferResult
// { success: boolean, error?: string }
```

### `burn(assetId, fromPartyId, amount)`

Burn (destroy) tokens.

```typescript
await sdk.tokens.burn(
  assetId: string,
  fromPartyId: string,
  amount: string
);
// Returns: void
```

### `getBalance(assetId, partyId)`

Get token balance for a party.

```typescript
const balance = await sdk.tokens.getBalance(
  assetId: string,
  partyId: string
);
// Returns: string (e.g., "1000")
```

### `getAllBalances(assetId)`

Get all balances for an asset.

```typescript
const balances = await sdk.tokens.getAllBalances(assetId: string);
// Returns: Map<string, string> (partyId -> balance)
```

---

## Parties Module (`sdk.parties_`)

### `create(data)`

Create a new party.

```typescript
const party = sdk.parties_.create({
  name: string;
  type: PartyType;           // INDIVIDUAL | ORGANIZATION
  roles: PartyRole[];        // [ISSUER, INVESTOR, VERIFIER, ...]
  jurisdiction: string;      // ISO country code
  metadata?: Record<string, unknown>;
});
// Returns: Party
```

### `get(id)`

Get party by ID.

```typescript
const party = sdk.parties_.get(partyId: string);
// Returns: Party | undefined
```

### `list()`

List all parties.

```typescript
const parties = sdk.parties_.list();
// Returns: Party[]
```

### `setKyc(id, verified, expiry?)`

Set KYC verification status.

```typescript
sdk.parties_.setKyc(
  partyId: string,
  verified: boolean,
  expiry?: Date
);
// Returns: void
```

### `freeze(id)`

Freeze a party (block all operations).

```typescript
sdk.parties_.freeze(partyId: string);
// Returns: void
```

### `unfreeze(id)`

Unfreeze a party.

```typescript
sdk.parties_.unfreeze(partyId: string);
// Returns: void
```

---

## Events Module (`sdk.events`)

### `getAll()`

Get all events.

```typescript
const events = sdk.events.getAll();
// Returns: SDKEvent[]
```

### `getByAsset(assetId)`

Get events for a specific asset.

```typescript
const events = sdk.events.getByAsset(assetId: string);
// Returns: SDKEvent[]
```

### `getByType(type)`

Get events by type.

```typescript
const events = sdk.events.getByType(type: string);
// Returns: SDKEvent[]
```

---

## Plugins Module (`sdk.plugins`)

### `register(type, plugin)`

Register a plugin.

```typescript
sdk.plugins.register(
  type: 'compliance' | 'storage' | 'oracle' | 'chain',
  plugin: IPlugin
);
// Returns: void
```

### `get(type)`

Get registered plugin.

```typescript
const plugin = sdk.plugins.get('compliance');
// Returns: IPlugin | undefined
```

---

## Types

### Enums

```typescript
enum RightType {
  OWNERSHIP = 'OWNERSHIP',
  ACCESS = 'ACCESS',
  BEHAVIOR = 'BEHAVIOR',
  VERIFICATION = 'VERIFICATION'
}

enum LifecycleState {
  DRAFT = 'DRAFT',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  FROZEN = 'FROZEN',
  REDEEMED = 'REDEEMED',
  EXPIRED = 'EXPIRED',
  BURNED = 'BURNED'
}

enum TransferMode {
  UNRESTRICTED = 'UNRESTRICTED',
  WHITELIST_ONLY = 'WHITELIST_ONLY',
  NON_TRANSFERABLE = 'NON_TRANSFERABLE',
  COMPLIANCE_GATED = 'COMPLIANCE_GATED'
}

enum PartyType {
  INDIVIDUAL = 'INDIVIDUAL',
  ORGANIZATION = 'ORGANIZATION'
}

enum PartyRole {
  ISSUER = 'ISSUER',
  INVESTOR = 'INVESTOR',
  VERIFIER = 'VERIFIER',
  CUSTODIAN = 'CUSTODIAN',
  OPERATOR = 'OPERATOR'
}
```

### Interfaces

```typescript
interface Asset {
  id: string;
  name: string;
  rightType: RightType;
  state: LifecycleState;
  issuerId: string;
  jurisdiction: { countryCode: string };
  transferMode: TransferMode;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface Party {
  id: string;
  name: string;
  type: PartyType;
  roles: PartyRole[];
  jurisdiction: string;
  kycVerified: boolean;
  kycExpiry?: Date;
  isFrozen: boolean;
  metadata: Record<string, unknown>;
}

interface SDKEvent {
  id: string;
  type: string;
  assetId?: string;
  actorId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}
```

---

## Error Handling

```typescript
try {
  await sdk.assets.transition(assetId, LifecycleState.ACTIVE, issuerId);
} catch (error) {
  if (error.code === 'INVALID_TRANSITION') {
    console.error('Cannot transition:', error.message);
  }
}
```

Common error codes:
- `INVALID_TRANSITION` - State transition not allowed
- `ASSET_NOT_FOUND` - Asset does not exist
- `PARTY_NOT_FOUND` - Party does not exist
- `INSUFFICIENT_BALANCE` - Not enough tokens
- `TRANSFER_DENIED` - Compliance check failed
- `UNAUTHORIZED` - Permission denied
