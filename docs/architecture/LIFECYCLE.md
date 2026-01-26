# Lifecycle Engine

## Overview

The **Lifecycle Engine** is the heart of the SDK. It manages asset states through a deterministic state machine, ensuring all transitions are valid and auditable.

## State Machine

```
                    ┌───────────┐
                    │   DRAFT   │ ← Initial state
                    └─────┬─────┘
                          │ submit()
                          ▼
               ┌─────────────────────┐
               │ PENDING_VERIFICATION │
               └──────────┬──────────┘
                    ┌─────┴─────┐
                    │           │
            reject()│           │verify()
                    ▼           ▼
              ┌──────────┐  ┌──────────┐
              │ REJECTED │  │ VERIFIED │
              └──────────┘  └────┬─────┘
                                 │ activate()
                                 ▼
                           ┌──────────┐
              suspend()    │  ACTIVE  │◄─── Primary operational state
                    ┌──────┤          ├──────┐
                    │      └────┬─────┘      │
                    ▼           │            ▼
              ┌──────────┐      │      ┌──────────┐
              │SUSPENDED │      │      │  FROZEN  │ freeze()
              └────┬─────┘      │      └────┬─────┘
                   │            │           │
            resume()│            │      unfreeze()
                   └──────┬─────┴───────────┘
                          │
                    ┌─────┴─────┐
                    │           │
            redeem()│           │expire()
                    ▼           ▼
              ┌──────────┐  ┌──────────┐
              │ REDEEMED │  │ EXPIRED  │
              └────┬─────┘  └────┬─────┘
                   │             │
                   └──────┬──────┘
                          │ burn()
                          ▼
                    ┌──────────┐
                    │  BURNED  │ ← Terminal state
                    └──────────┘
```

## States

| State | Description | Token Operations |
|-------|-------------|------------------|
| `DRAFT` | Initial creation | None |
| `PENDING_VERIFICATION` | Awaiting review | None |
| `VERIFIED` | Review complete | None |
| `REJECTED` | Failed review | None |
| `ACTIVE` | Fully operational | Mint, Transfer, Burn |
| `SUSPENDED` | Temporarily paused | None |
| `FROZEN` | Regulatory hold | None |
| `REDEEMED` | Rights exercised | Burn only |
| `EXPIRED` | Validity ended | Burn only |
| `BURNED` | Permanently destroyed | None |

## Transition Rules

### Valid Transitions

```typescript
const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  DRAFT: ['PENDING_VERIFICATION'],
  PENDING_VERIFICATION: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['ACTIVE'],
  REJECTED: [],  // Terminal
  ACTIVE: ['SUSPENDED', 'FROZEN', 'REDEEMED', 'EXPIRED'],
  SUSPENDED: ['ACTIVE', 'BURNED'],
  FROZEN: ['ACTIVE', 'BURNED'],
  REDEEMED: ['BURNED'],
  EXPIRED: ['BURNED'],
  BURNED: [],  // Terminal
};
```

### Transition Guards

Each transition can have guards that must pass:

```typescript
interface TransitionGuard {
  canTransition(
    asset: Asset,
    fromState: LifecycleState,
    toState: LifecycleState,
    actor: Party
  ): Promise<GuardResult>;
}

interface GuardResult {
  allowed: boolean;
  reason?: string;
}
```

**Built-in Guards:**

| Guard | Description |
|-------|-------------|
| `HasPermission` | Actor has required role |
| `IsValidTransition` | State transition is allowed |
| `HasEvidence` | Required evidence exists |
| `NotFrozen` | Asset is not frozen |
| `KycValid` | Actor's KYC is current |

## Usage

### Basic Transition

```typescript
// Create asset in DRAFT state
const asset = await sdk.assets.create({
  name: 'Property Token',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,
});
// asset.state === 'DRAFT'

// Submit for verification
await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
// asset.state === 'PENDING_VERIFICATION'

// Verify the asset
await sdk.assets.verify(asset.id, verifier.id);
// asset.state === 'VERIFIED'

// Activate for operations
await sdk.assets.activate(asset.id, issuer.id);
// asset.state === 'ACTIVE'
```

### Convenience Methods

```typescript
// These are shortcuts for common transitions:
await sdk.assets.verify(assetId, verifierId);   // → VERIFIED
await sdk.assets.activate(assetId, issuerId);   // → ACTIVE
await sdk.assets.suspend(assetId, operatorId);  // → SUSPENDED
await sdk.assets.freeze(assetId, regulatorId);  // → FROZEN
await sdk.assets.redeem(assetId, holderId);     // → REDEEMED
await sdk.assets.burn(assetId, operatorId);     // → BURNED
```

## Events

Every transition emits an event:

```typescript
interface LifecycleEvent {
  id: string;
  type: 'LIFECYCLE_TRANSITION';
  assetId: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  actorId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
```

**Example Event:**
```json
{
  "id": "evt_123",
  "type": "LIFECYCLE_TRANSITION",
  "assetId": "ast_456",
  "fromState": "DRAFT",
  "toState": "PENDING_VERIFICATION",
  "actorId": "pty_789",
  "timestamp": "2024-01-15T10:30:00Z",
  "metadata": {
    "evidenceIds": ["evd_001", "evd_002"]
  }
}
```

## Error Handling

Invalid transitions throw descriptive errors:

```typescript
try {
  // Cannot go directly from DRAFT to ACTIVE
  await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, issuer.id);
} catch (error) {
  // Error: Invalid transition from DRAFT to ACTIVE
  // Valid transitions from DRAFT: PENDING_VERIFICATION
}
```

## State Queries

```typescript
// Check current state
const asset = await sdk.assets.get(assetId);
console.log(asset.state); // 'ACTIVE'

// Check if operation is allowed
const canMint = asset.state === LifecycleState.ACTIVE;
const canTransfer = asset.state === LifecycleState.ACTIVE;
```

## Event Sourcing

The lifecycle supports **event sourcing** for state reconstruction:

```typescript
// Get all events for an asset
const events = await sdk.events.getByAsset(assetId);

// Rebuild state from events
let state = LifecycleState.DRAFT;
for (const event of events) {
  if (event.type === 'LIFECYCLE_TRANSITION') {
    state = event.toState;
  }
}
```

## Related Documents

- [Architecture Overview](./OVERVIEW.md) - System design
- [Security Model](./SECURITY.md) - Security considerations
