# Recipe 3: Car Rental — CCIP Cross-Chain Transfer

Tokenize car rental reservations and use Chainlink CCIP to bridge security deposits across chains. The renter pays on one chain, the rental agency receives on another — with DvP settlement.

## When to Use

You are building a multi-chain rental platform where users pay deposits on their preferred chain and agencies settle on a different chain. CCIP handles the cross-chain message passing and token transfer.

## Before & After

**Before — raw CCIP message encoding (40+ lines):**

```typescript
import { ethers } from 'ethers';

const routerABI = [
  'function ccipSend(uint64 destChainSelector, tuple(...) message) payable returns (bytes32)',
  'function getFee(uint64 destChainSelector, tuple(...) message) view returns (uint256)',
];
const router = new ethers.Contract('0xD3b06...', routerABI, signer);
const destSelector = 16015286601757825753n;
const message = {
  receiver: ethers.AbiCoder.defaultAbiCoder().encode(['address'], [receiverAddr]),
  data: '0x',
  tokenAmounts: [{ token: tokenAddr, amount: ethers.parseUnits('500', 18) }],
  feeToken: ethers.ZeroAddress,
  extraArgs: '0x',
};
const fee = await router.getFee(destSelector, message);
const tx = await router.ccipSend(destSelector, message, { value: fee });
// Parse messageId from logs... no DvP, no fee helpers, no chain registry
```

**After — SDK (6 lines):**

```typescript
import { createChainlinkWiredSDK } from '@tokenisation/sdk';

const chainlink = createChainlinkWiredSDK({ chainId: 84532, rpcUrl: RPC_URL, ccip: { enabled: true } });
const ccip = chainlink.plugins.ccip!;
const fee = await ccip.estimateFee({ destChainId: 11155111, receiver: '0x...', token: '0x...', amount: '500' });
const result = await ccip.bridgeTokens({ destChainId: 11155111, receiver: '0x...', token: '0x...', amount: '500' });
console.log(`Message ID: ${result.data.messageId}`);
```

## Full Example

```typescript
import {
  TokenisationSDK,
  RightType,
  LifecycleState,
  PartyType,
  PartyRole,
  TransferabilityMode,
  createChainlinkWiredSDK,
} from '@tokenisation/sdk';

// 1. Tokenize a car rental reservation
const sdk = new TokenisationSDK({ useMockPlugins: true });

const agency = sdk.parties_.create({
  name: 'DriveChain Rentals', type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER, PartyRole.VERIFIER], jurisdiction: 'US',
  email: 'fleet@drivechain.com',
});
sdk.parties_.setKyc(agency.id, true);

const renter = sdk.parties_.create({
  name: 'Bob Smith', type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR], jurisdiction: 'US', email: 'bob@example.com',
});
sdk.parties_.setKyc(renter.id, true);

const rental = await sdk.assets.create({
  name: 'Tesla Model Y — 7-Day Rental',
  description: 'Electric SUV, 7-day rental with insurance',
  rightType: RightType.ACCESS,
  issuerId: agency.id,
  jurisdiction: { countryCode: 'US', regulatoryFramework: 'DOT', accreditedOnly: false, blockedJurisdictions: ['KP'] },
  validityPeriod: { isPerpetual: false, startTime: new Date().toISOString(), endTime: new Date(Date.now() + 7 * 86400000).toISOString() },
  transferabilityRules: { mode: TransferabilityMode.COMPLIANCE_GATED, lockupPeriodSeconds: 0, maxHolders: 1, requireKyc: true },
  metadata: { vehicleType: 'Tesla Model Y', depositAmount: '500' },
});

await sdk.assets.transition(rental.id, LifecycleState.PENDING_VERIFICATION, agency.id);
await sdk.assets.verify(rental.id, agency.id);
await sdk.assets.activate(rental.id, agency.id);
await sdk.tokens.mint(rental.id, renter.id, '1');

// 2. Wire CCIP for cross-chain deposit
const chainlink = createChainlinkWiredSDK({
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  privateKey: process.env.PRIVATE_KEY,
  ccip: { enabled: true },
});

const ccip = chainlink.plugins.ccip!;

// 3. Estimate fee
const feeResult = await ccip.estimateFee({
  destChainId: 11155111,  // Sepolia
  receiver: '0xAgencyAddress',
  token: '0xUSDCAddress',
  amount: '500',
});
if (feeResult.success) {
  console.log(`Bridge fee: ${feeResult.data} wei`);
}

// 4. Bridge deposit cross-chain
const bridgeResult = await ccip.bridgeTokens({
  destChainId: 11155111,
  receiver: '0xAgencyAddress',
  token: '0xUSDCAddress',
  amount: '500',
});
if (bridgeResult.success) {
  console.log(`Message ID: ${bridgeResult.data.messageId}`);
  console.log(`Tx hash: ${bridgeResult.data.txHash}`);
  console.log(`Track: https://ccip.chain.link/msg/${bridgeResult.data.messageId}`);
}

// 5. DvP settlement (optional)
const settlement = chainlink.settlementProvider!;
const instruction = await settlement.createInstruction({
  assetId: rental.id,
  sellerId: agency.id,
  buyerId: renter.id,
  amount: '1',
  price: '500',
  paymentToken: '0xUSDC',
  destChainId: 11155111,
});

if (instruction.success) {
  const execution = await settlement.executeInstruction(instruction.data.id);
  if (execution.success) console.log('DvP settled:', execution.data.txHash);
}

chainlink.stop();
```

## Key APIs

| Method | Description |
|--------|-------------|
| `CCIPBridgePlugin.isChainSupported(chainId)` | Check if a chain is a valid CCIP destination |
| `CCIPBridgePlugin.estimateFee(params)` | Estimate CCIP message fee in native token |
| `CCIPBridgePlugin.bridgeTokens(params)` | Send tokens cross-chain via CCIP |
| `CCIPSettlementProvider.createInstruction(params)` | Create a DvP settlement instruction |
| `CCIPSettlementProvider.executeInstruction(id)` | Execute a pending settlement |
| `createChainlinkWiredSDK({ ccip: { enabled: true } })` | Auto-wire CCIP + settlement provider |

## Gotchas

- **Private key required**: Bridging tokens requires a signer. Pass `privateKey` in the wiring config.
- **Supported lanes**: Not all chain pairs have CCIP lanes. Use `isChainSupported()` first. Base Sepolia ↔ Sepolia is a common testnet lane.
- **Fee estimation**: Always call `estimateFee()` before `bridgeTokens()`. CCIP fees vary by message size, destination, and gas.
- **Finality**: CCIP messages take 5–20 minutes depending on source chain. Track at `https://ccip.chain.link/msg/{messageId}`.
- **Token approvals**: The sender must approve the CCIP router to spend the token before bridging — the SDK does not handle this automatically.
- **DvP settlement**: `CCIPSettlementProvider` coordinates payment and delivery across chains. Both sides need sufficient balances and approvals.
