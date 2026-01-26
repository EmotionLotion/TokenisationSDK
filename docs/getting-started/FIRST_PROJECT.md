# First Project: Tokenize a Real Estate Asset

This tutorial walks you through tokenizing your first asset using the TokenisationSDK.

## What You'll Build

A tokenized real estate investment that:
- Has verified identity for all participants
- Enforces compliance rules on transfers
- Tracks ownership through the full lifecycle

## Prerequisites

- Node.js 18+
- Basic TypeScript knowledge
- 15 minutes

## Step 1: Setup

Create a new project:

```bash
mkdir my-first-token
cd my-first-token
npm init -y
npm install @tokenisation/sdk typescript ts-node
```

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "strict": true
  }
}
```

## Step 2: Initialize the SDK

Create `index.ts`:

```typescript
import {
  TokenisationSDK,
  RightType,
  TransferMode,
  LifecycleState,
  PartyType,
  PartyRole,
} from '@tokenisation/sdk';

async function main() {
  // Initialize SDK with mock plugins (no blockchain needed)
  const sdk = new TokenisationSDK({ useMockPlugins: true });

  console.log('SDK initialized successfully!');
}

main().catch(console.error);
```

Run it:
```bash
npx ts-node index.ts
# Output: SDK initialized successfully!
```

## Step 3: Create Participants

Add the following to `main()`:

```typescript
// Create the property management company (issuer)
const issuer = sdk.parties_.create({
  name: 'Prime Properties LLC',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
  jurisdiction: 'US',
  metadata: {
    licenseNumber: 'RE-12345',
    website: 'https://primeproperties.example',
  },
});
sdk.parties_.setKyc(issuer.id, true);
console.log('Created issuer:', issuer.name);

// Create investors
const alice = sdk.parties_.create({
  name: 'Alice Johnson',
  type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR],
  jurisdiction: 'US',
});
sdk.parties_.setKyc(alice.id, true);
console.log('Created investor:', alice.name);

const bob = sdk.parties_.create({
  name: 'Bob Smith',
  type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR],
  jurisdiction: 'US',
});
sdk.parties_.setKyc(bob.id, true);
console.log('Created investor:', bob.name);
```

## Step 4: Create the Asset

Add asset creation:

```typescript
// Create the tokenized property
const property = await sdk.assets.create({
  name: 'Oceanview Apartments',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'US' },
  transferMode: TransferMode.COMPLIANCE_GATED,
  metadata: {
    address: '100 Ocean Drive, Miami, FL',
    units: 24,
    yearBuilt: 2020,
    totalValue: 5000000,  // $5M valuation
    tokenSupply: 10000,   // 10,000 tokens
    pricePerToken: 500,   // $500 per token
  },
});
console.log('Created asset:', property.name);
console.log('Initial state:', property.state); // 'DRAFT'
```

## Step 5: Lifecycle Transitions

Progress the asset through verification:

```typescript
// Submit for verification
await sdk.assets.transition(
  property.id,
  LifecycleState.PENDING_VERIFICATION,
  issuer.id
);
console.log('Submitted for verification');

// Verify the asset (normally done by external verifier)
await sdk.assets.verify(property.id, issuer.id);
console.log('Asset verified');

// Activate for trading
await sdk.assets.activate(property.id, issuer.id);
console.log('Asset activated!');

// Check final state
const updatedAsset = await sdk.assets.get(property.id);
console.log('Current state:', updatedAsset?.state); // 'ACTIVE'
```

## Step 6: Mint Tokens

Distribute ownership tokens:

```typescript
// Initial token distribution
// Alice gets 60% ($3M worth)
await sdk.tokens.mint(property.id, alice.id, '6000');
console.log('Minted 6,000 tokens to Alice');

// Bob gets 40% ($2M worth)
await sdk.tokens.mint(property.id, bob.id, '4000');
console.log('Minted 4,000 tokens to Bob');

// Check balances
const aliceBalance = await sdk.tokens.getBalance(property.id, alice.id);
const bobBalance = await sdk.tokens.getBalance(property.id, bob.id);
console.log(`Alice owns: ${aliceBalance} tokens (${Number(aliceBalance)/100}%)`);
console.log(`Bob owns: ${bobBalance} tokens (${Number(bobBalance)/100}%)`);
```

## Step 7: Transfer Tokens

Execute a compliant transfer:

```typescript
// Alice sells 1,000 tokens to Bob
const transfer = await sdk.tokens.transfer(
  property.id,
  alice.id,
  bob.id,
  '1000'
);

if (transfer.success) {
  console.log('Transfer successful!');
} else {
  console.log('Transfer failed:', transfer.error);
}

// Check updated balances
const newAliceBalance = await sdk.tokens.getBalance(property.id, alice.id);
const newBobBalance = await sdk.tokens.getBalance(property.id, bob.id);
console.log(`Alice now owns: ${newAliceBalance} tokens`); // 5,000
console.log(`Bob now owns: ${newBobBalance} tokens`);     // 5,000
```

## Step 8: View Audit Trail

Check all events:

```typescript
// Get all events for this asset
const events = sdk.events.getByAsset(property.id);
console.log('\nAudit Trail:');
events.forEach((event, i) => {
  console.log(`${i + 1}. ${event.type} at ${event.timestamp.toISOString()}`);
});
```

## Complete Code

Here's the full `index.ts`:

```typescript
import {
  TokenisationSDK,
  RightType,
  TransferMode,
  LifecycleState,
  PartyType,
  PartyRole,
} from '@tokenisation/sdk';

async function main() {
  const sdk = new TokenisationSDK({ useMockPlugins: true });
  console.log('=== TokenisationSDK Demo ===\n');

  // 1. Create parties
  const issuer = sdk.parties_.create({
    name: 'Prime Properties LLC',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
    jurisdiction: 'US',
  });
  sdk.parties_.setKyc(issuer.id, true);

  const alice = sdk.parties_.create({
    name: 'Alice Johnson',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'US',
  });
  sdk.parties_.setKyc(alice.id, true);

  const bob = sdk.parties_.create({
    name: 'Bob Smith',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'US',
  });
  sdk.parties_.setKyc(bob.id, true);

  console.log('Parties created:', sdk.parties_.list().length);

  // 2. Create asset
  const property = await sdk.assets.create({
    name: 'Oceanview Apartments',
    rightType: RightType.OWNERSHIP,
    issuerId: issuer.id,
    jurisdiction: { countryCode: 'US' },
    transferMode: TransferMode.COMPLIANCE_GATED,
    metadata: {
      address: '100 Ocean Drive, Miami, FL',
      totalValue: 5000000,
    },
  });
  console.log('Asset created:', property.name);

  // 3. Progress lifecycle
  await sdk.assets.transition(property.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
  await sdk.assets.verify(property.id, issuer.id);
  await sdk.assets.activate(property.id, issuer.id);
  console.log('Asset activated');

  // 4. Mint tokens
  await sdk.tokens.mint(property.id, alice.id, '6000');
  await sdk.tokens.mint(property.id, bob.id, '4000');
  console.log('Tokens minted');

  // 5. Transfer
  await sdk.tokens.transfer(property.id, alice.id, bob.id, '1000');
  console.log('Transfer complete');

  // 6. Final state
  console.log('\n=== Final State ===');
  console.log(`Alice: ${await sdk.tokens.getBalance(property.id, alice.id)} tokens`);
  console.log(`Bob: ${await sdk.tokens.getBalance(property.id, bob.id)} tokens`);
  console.log(`Events: ${sdk.events.getByAsset(property.id).length}`);
}

main().catch(console.error);
```

Run:
```bash
npx ts-node index.ts
```

Expected output:
```
=== TokenisationSDK Demo ===

Parties created: 3
Asset created: Oceanview Apartments
Asset activated
Tokens minted
Transfer complete

=== Final State ===
Alice: 5000 tokens
Bob: 5000 tokens
Events: 7
```

## Next Steps

- [SDK Usage Guide](../guides/SDK_USAGE.md) - Complete API reference
- [UI Kit Guide](../guides/UI_KIT.md) - Build a React interface
- [Server Setup](../guides/SERVER_SETUP.md) - Add persistence
- [Architecture](../architecture/OVERVIEW.md) - System design

## Challenge: Try These Extensions

1. **Add a third investor** - Create Charlie and transfer tokens from both Alice and Bob
2. **Test compliance** - Try transferring without KYC and see what happens
3. **Track events** - Print detailed event data for each operation
4. **Suspend trading** - Suspend the asset and verify transfers are blocked
