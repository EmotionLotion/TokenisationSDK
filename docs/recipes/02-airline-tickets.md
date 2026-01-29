# Recipe 2: Airline Tickets — Chainlink Automation

Tokenize airline tickets and register Chainlink Automation upkeeps for decentralized flight-event processing. Replace fragile cron servers with the Keeper network.

## When to Use

You are issuing tokenized tickets and need recurring on-chain tasks — compliance re-checks before boarding, flight-status updates, automatic refunds on cancellation — executed reliably without a centralized scheduler.

## Before & After

**Before — centralized cron job (fragile):**

```typescript
import cron from 'node-cron';

// Runs on YOUR server — single point of failure
cron.schedule('0 */6 * * *', async () => {
  try {
    await complianceContract.recheckAllTickets();
  } catch (err) {
    console.error('Compliance check failed:', err);
    // Hope someone reads the logs
  }
});
// No decentralization, no gas management, no monitoring
```

**After — Chainlink Automation (6 lines):**

```typescript
import { ChainlinkAutomationPlugin, TriggerType } from '@tokenisation/sdk';

const automation = new ChainlinkAutomationPlugin({ chainId: 84532, rpcUrl: RPC_URL });
await automation.registerUpkeep({
  name: 'Compliance Re-Check', contractAddress: '0xContract',
  triggerType: TriggerType.CONDITIONAL, gasLimit: 500_000,
  checkData: '0x', amount: '5000000000000000000',
});
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
  ChainlinkAutomationPlugin,
  AutomationTaskType,
  TriggerType,
  createChainlinkWiredSDK,
  CrossPackEventBus,
} from '@tokenisation/sdk';

// 1. Tokenize a flight ticket
const sdk = new TokenisationSDK({ useMockPlugins: true });

const airline = sdk.parties_.create({
  name: 'SkyToken Airlines', type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER, PartyRole.VERIFIER], jurisdiction: 'US',
  email: 'ops@skytoken.aero',
});
sdk.parties_.setKyc(airline.id, true);

const passenger = sdk.parties_.create({
  name: 'Jane Doe', type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR], jurisdiction: 'US', email: 'jane@example.com',
});
sdk.parties_.setKyc(passenger.id, true);

const ticket = await sdk.assets.create({
  name: 'SKT-1234 JFK→LHR Business',
  description: 'Non-stop JFK to London Heathrow',
  rightType: RightType.ACCESS,
  issuerId: airline.id,
  jurisdiction: { countryCode: 'US', regulatoryFramework: 'FAA', accreditedOnly: false, blockedJurisdictions: ['KP'] },
  validityPeriod: { isPerpetual: false, startTime: new Date().toISOString(), endTime: new Date(Date.now() + 30 * 86400000).toISOString() },
  transferabilityRules: { mode: TransferabilityMode.COMPLIANCE_GATED, lockupPeriodSeconds: 0, maxHolders: 1, requireKyc: true },
  metadata: { flightNumber: 'SKT-1234', route: 'JFK→LHR', class: 'BUSINESS' },
});

await sdk.assets.transition(ticket.id, LifecycleState.PENDING_VERIFICATION, airline.id);
await sdk.assets.verify(ticket.id, airline.id);
await sdk.assets.activate(ticket.id, airline.id);
await sdk.tokens.mint(ticket.id, passenger.id, '1');

// 2. Register Chainlink Automation upkeeps

const automation = new ChainlinkAutomationPlugin({
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  privateKey: process.env.PRIVATE_KEY,
});

// Time-based compliance re-check (every 6 hours)
const complianceUpkeep = await automation.registerUpkeep({
  name: `Compliance: ${ticket.name}`,
  contractAddress: '0xComplianceContract',
  triggerType: TriggerType.CONDITIONAL,
  gasLimit: 500_000,
  checkData: '0x',
  amount: '5000000000000000000', // 5 LINK
});

// Event-driven flight landing trigger
const landingUpkeep = await automation.registerUpkeep({
  name: `Landing: ${ticket.name}`,
  contractAddress: '0xFlightOracleContract',
  triggerType: TriggerType.LOG,
  gasLimit: 300_000,
  checkData: '0x',
  amount: '3000000000000000000', // 3 LINK
});

// 3. Auto-registration via event bus (optional)
const eventBus = new CrossPackEventBus();
const chainlink = createChainlinkWiredSDK({
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  automation: {
    autoRegisterTasks: [AutomationTaskType.COMPLIANCE_CHECK, AutomationTaskType.NAV_UPDATE],
    complianceContract: '0xComplianceContract',
    adminAddress: '0xAdmin',
    eventBus,
  },
});

await chainlink.start();
// Emitting events auto-creates upkeeps
eventBus.emit('ASSET_CREATED', { assetId: ticket.id });
chainlink.stop();
```

## Key APIs

| Method | Description |
|--------|-------------|
| `ChainlinkAutomationPlugin.registerUpkeep(reg)` | Register a new Chainlink Automation upkeep |
| `ChainlinkAutomationPlugin.getActiveUpkeepIDs()` | List all active upkeep IDs |
| `ChainlinkAutomationPlugin.getUpkeepInfo(id)` | Get details for a specific upkeep |
| `ChainlinkAutomationPlugin.fundUpkeep(id, amount)` | Add LINK funding to an upkeep |
| `ChainlinkAutomationPlugin.pauseUpkeep(id)` | Pause an active upkeep |
| `AutomationLifecycleManager.start()` / `stop()` | Auto-register upkeeps from event bus |
| `TriggerType.CONDITIONAL` | Time-based condition check (polled) |
| `TriggerType.LOG` | Event-driven trigger (fires on log emission) |
| `AutomationTaskType.COMPLIANCE_CHECK` | Recurring compliance re-verification |

## Gotchas

- **LINK funding**: Upkeeps need LINK tokens for gas. Monitor balances and top up before depletion. Use `fundUpkeep()` or `LinkManagerPlugin` for alerts.
- **Gas limits**: Set `gasLimit` high enough for the target function. If exceeded, the Keeper network pauses the upkeep.
- **Trigger types**: `CONDITIONAL` = polled periodically (like cron). `LOG` = fires on a specific contract event (like a webhook). Choose based on your use case.
- **Private key**: Registering upkeeps on-chain requires a signer. Pass `privateKey` in the config.
- **Event bus**: `AutomationLifecycleManager` listens for SDK events and auto-registers upkeeps. Without an event bus, register manually.
- **Testnet vs. mainnet**: Automation is available on Sepolia, Base Sepolia, and all major mainnets.
