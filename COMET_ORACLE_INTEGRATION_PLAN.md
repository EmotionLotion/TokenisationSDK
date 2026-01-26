# COMET Oracle Integration Plan

## Problem Statement

The current COMET tokenization demo has hardcoded values that should come from oracles:

| Component | Hardcoded Values | Should Be |
|-----------|-----------------|-----------|
| TelematicsOracle.ts:193-200 | Safety penalties (2,1,5,2,0.5,1) | Chainlink Functions |
| IoTOracle.ts:276-291 | Quality score calculation | Chainlink Functions |
| H2OUtilityCredit.ts:309-318 | Carbon offset factors (0.001-2.0) | External oracle feed |
| types.ts:283-308 | Loyalty points config | Governance/Oracle |
| OracleService.ts:167-170 | Mock price feeds | Already have DataFeedPlugin |

## Architecture: Real Oracle Integration

```
                    COMET App (Real Data Source)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              GPS/CAN    Delivery   Customer
              Sensors    System     Ratings
                    │         │         │
                    └────┬────┘─────────┘
                         ▼
            ┌─────────────────────────────┐
            │    COMET Data Aggregator    │
            │    (Off-chain component)    │
            └─────────────────────────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Chainlink│  │ Chainlink│  │ Chainlink│
    │ Functions│  │ DataFeeds│  │Automation│
    └──────────┘  └──────────┘  └──────────┘
           │             │             │
           └─────────────┼─────────────┘
                         ▼
            ┌─────────────────────────────┐
            │   Smart Contracts (On-chain)│
            │   - ReputationSBT           │
            │   - AhoyToken               │
            │   - UtilityCredit           │
            └─────────────────────────────┘
```

## Implementation Phases

### Phase 1: Chainlink Functions for Dynamic Scoring (Week 1)

#### 1.1 Create ChainlinkFunctionsPlugin

```typescript
// sdk/src/plugins/chainlink/FunctionsPlugin.ts

interface FunctionsConfig {
  routerAddress: string;
  donId: string;
  subscriptionId: bigint;
  gasLimit: number;
}

class ChainlinkFunctionsPlugin {
  // Execute JavaScript on Chainlink DON
  async executeFunction(source: string, args: string[]): Promise<string>;

  // Pre-built functions for COMET
  async calculateSafetyScore(events: TelematicsEvent[]): Promise<number>;
  async calculateCarbonOffset(utilityType: string, quantity: number): Promise<number>;
  async getEmissionFactor(region: string, utilityType: string): Promise<number>;
}
```

#### 1.2 JavaScript Sources for Chainlink Functions

**Safety Score Calculator:**
```javascript
// functions/safetyScore.js
const events = JSON.parse(args[0]);

// Fetch current penalty weights from API
const response = await Functions.makeHttpRequest({
  url: `https://api.comet.ahoy.dev/v1/scoring/penalties`,
  headers: { 'x-api-key': secrets.apiKey }
});

const penalties = response.data;
let score = 100;

for (const event of events) {
  score -= (penalties[event.type] || 0) * event.count;
}

return Functions.encodeUint256(Math.max(0, Math.round(score * 100)));
```

**Carbon Offset Calculator:**
```javascript
// functions/carbonOffset.js
const [utilityType, quantity, region] = args;

// Fetch real emission factors from climate API
const response = await Functions.makeHttpRequest({
  url: `https://api.climatiq.io/emission-factors/${region}/${utilityType}`,
  headers: { 'Authorization': `Bearer ${secrets.climatiqKey}` }
});

const factor = response.data.factor;
const offset = parseFloat(quantity) * factor;

return Functions.encodeUint256(Math.round(offset * 1e6)); // 6 decimals
```

#### 1.3 On-chain Consumer Contract

```solidity
// contracts/src/oracles/CometFunctionsConsumer.sol
pragma solidity ^0.8.20;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/libraries/FunctionsRequest.sol";

contract CometFunctionsConsumer is FunctionsClient {
    using FunctionsRequest for FunctionsRequest.Request;

    // Store latest scores
    mapping(bytes32 => uint256) public safetyScores;      // driverId => score
    mapping(bytes32 => uint256) public carbonFactors;     // utilityType => factor
    mapping(bytes32 => uint256) public loyaltyMultipliers; // tier => multiplier

    // Request tracking
    mapping(bytes32 => RequestType) public pendingRequests;

    enum RequestType { SAFETY_SCORE, CARBON_FACTOR, LOYALTY_MULTIPLIER }

    event ScoreUpdated(bytes32 indexed driverId, uint256 score, uint256 timestamp);
    event CarbonFactorUpdated(bytes32 indexed utilityType, uint256 factor);

    function requestSafetyScore(
        bytes32 driverId,
        string calldata eventsJson
    ) external returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(SAFETY_SCORE_SOURCE);
        req.addArgs([eventsJson]);

        requestId = _sendRequest(req.encodeCBOR(), subscriptionId, gasLimit, donID);
        pendingRequests[requestId] = RequestType.SAFETY_SCORE;
    }

    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        if (err.length > 0) revert RequestFailed(err);

        uint256 score = abi.decode(response, (uint256));
        RequestType reqType = pendingRequests[requestId];

        if (reqType == RequestType.SAFETY_SCORE) {
            safetyScores[requestId] = score;
            emit ScoreUpdated(requestId, score, block.timestamp);
        }
    }
}
```

### Phase 2: Real Telematics Data Pipeline (Week 2)

#### 2.1 COMET Data Adapter

```typescript
// sdk/src/ahoy/adapters/CometDataAdapter.ts

interface CometConfig {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
}

class CometDataAdapter {
  constructor(config: CometConfig) {}

  // Pull telematics from COMET API
  async fetchDriverTelematics(driverId: string): Promise<TelematicsReading[]> {
    const response = await fetch(`${this.apiUrl}/drivers/${driverId}/telematics`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    return response.json();
  }

  // Webhook handler for real-time events
  async handleWebhook(payload: CometWebhookPayload): Promise<void> {
    // Verify signature
    if (!this.verifySignature(payload)) throw new Error('Invalid signature');

    switch (payload.event) {
      case 'delivery.completed':
        await this.processDeliveryCompletion(payload.data);
        break;
      case 'telematics.event':
        await this.processTelematicsEvent(payload.data);
        break;
      case 'rating.received':
        await this.processRating(payload.data);
        break;
    }
  }

  // Push data to Chainlink Functions
  async triggerScoreUpdate(driverId: string): Promise<string> {
    const events = await this.fetchDriverTelematics(driverId);
    const functionsPlugin = this.getFunctionsPlugin();
    return functionsPlugin.calculateSafetyScore(events);
  }
}
```

#### 2.2 Express Webhook Server

```typescript
// server/src/webhooks/comet.ts

import express from 'express';
import { CometDataAdapter } from '@tokenisation/sdk';

const router = express.Router();
const adapter = new CometDataAdapter(config);

router.post('/webhook/comet', async (req, res) => {
  try {
    await adapter.handleWebhook(req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Scheduled job to batch-update scores
router.post('/cron/update-scores', async (req, res) => {
  const activeDrivers = await db.query.parties.findMany({
    where: eq(parties.type, 'DRIVER'),
  });

  for (const driver of activeDrivers) {
    await adapter.triggerScoreUpdate(driver.id);
  }
});
```

### Phase 3: Chainlink Automation for Periodic Updates (Week 3)

#### 3.1 Automation-Compatible Contract

```solidity
// contracts/src/oracles/CometAutomation.sol
pragma solidity ^0.8.20;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

contract CometAutomation is AutomationCompatibleInterface {
    uint256 public lastUpkeepTime;
    uint256 public upkeepInterval = 1 hours;

    address[] public activeDrivers;
    ICometFunctionsConsumer public functionsConsumer;

    function checkUpkeep(bytes calldata)
        external view override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        upkeepNeeded = (block.timestamp - lastUpkeepTime) > upkeepInterval;

        // Find drivers needing score updates
        address[] memory driversToUpdate = new address[](10);
        uint256 count = 0;

        for (uint i = 0; i < activeDrivers.length && count < 10; i++) {
            if (_needsUpdate(activeDrivers[i])) {
                driversToUpdate[count++] = activeDrivers[i];
            }
        }

        performData = abi.encode(driversToUpdate, count);
    }

    function performUpkeep(bytes calldata performData) external override {
        (address[] memory drivers, uint256 count) = abi.decode(
            performData, (address[], uint256)
        );

        for (uint i = 0; i < count; i++) {
            functionsConsumer.requestSafetyScore(
                bytes32(uint256(uint160(drivers[i]))),
                _getEventsJson(drivers[i])
            );
        }

        lastUpkeepTime = block.timestamp;
    }
}
```

### Phase 4: Carbon Credit Oracle Integration (Week 4)

#### 4.1 External API Integration for Emission Factors

```typescript
// sdk/src/plugins/carbon/CarbonOraclePlugin.ts

interface CarbonOracleConfig {
  climatiqApiKey: string;
  fallbackFactors: Record<string, number>;
}

class CarbonOraclePlugin {
  // Get real emission factor from Climatiq API
  async getEmissionFactor(
    region: string,
    utilityType: UtilityType
  ): Promise<number> {
    try {
      const response = await fetch(
        `https://api.climatiq.io/data/v1/estimate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.climatiqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            emission_factor: {
              activity_id: this.getActivityId(utilityType),
              source: 'GHG Protocol',
              region: region,
            },
            parameters: { energy: 1, energy_unit: 'kWh' },
          }),
        }
      );

      const data = await response.json();
      return data.co2e; // kg CO2 equivalent
    } catch (error) {
      // Fallback to cached values
      return this.config.fallbackFactors[utilityType] || 0.5;
    }
  }

  private getActivityId(type: UtilityType): string {
    const mapping = {
      [UtilityType.WATER]: 'water-supply_water',
      [UtilityType.ELECTRICITY]: 'electricity-energy_source_grid_mix',
      [UtilityType.GAS]: 'fuel_type_natural_gas',
      [UtilityType.COLD_CHAIN]: 'freight_vehicle_hgv_refrigerated',
    };
    return mapping[type];
  }
}
```

#### 4.2 On-chain Carbon Registry

```solidity
// contracts/src/oracles/CarbonFactorRegistry.sol
pragma solidity ^0.8.20;

contract CarbonFactorRegistry {
    // Region => UtilityType => Factor (6 decimals)
    mapping(bytes32 => mapping(uint8 => uint256)) public factors;

    // Update authority (Chainlink Functions or authorized updater)
    address public factorUpdater;

    event FactorUpdated(
        bytes32 indexed region,
        uint8 indexed utilityType,
        uint256 factor,
        uint256 timestamp
    );

    function updateFactor(
        bytes32 region,
        uint8 utilityType,
        uint256 factor
    ) external onlyUpdater {
        factors[region][utilityType] = factor;
        emit FactorUpdated(region, utilityType, factor, block.timestamp);
    }

    function calculateOffset(
        bytes32 region,
        uint8 utilityType,
        uint256 quantity // 18 decimals
    ) external view returns (uint256 offset) {
        uint256 factor = factors[region][utilityType];
        if (factor == 0) factor = DEFAULT_FACTORS[utilityType];

        // quantity * factor / 1e18 (adjust decimals)
        offset = (quantity * factor) / 1e18;
    }
}
```

### Phase 5: Loyalty Points Dynamic Pricing (Week 5)

#### 5.1 Governance-Controlled Parameters

```solidity
// contracts/src/governance/AhoyParameters.sol
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract AhoyParameters is AccessControl {
    bytes32 public constant PARAMETER_ADMIN = keccak256("PARAMETER_ADMIN");

    // Loyalty point values (can be updated via governance)
    struct PointsConfig {
        uint256 perfectDeliveryWeek;  // Default: 100
        uint256 offPeakBooking;       // Default: 50
        uint256 ecoFriendlyDropoff;   // Default: 20
        uint256 referralBonus;        // Default: 200
    }

    // Driver tier thresholds
    struct TierThresholds {
        uint256 silver;    // Default: 1000
        uint256 gold;      // Default: 5000
        uint256 platinum;  // Default: 15000
        uint256 diamond;   // Default: 50000
    }

    // Tier bonus multipliers (basis points, 10000 = 100%)
    struct TierBonuses {
        uint256 bronze;    // 0
        uint256 silver;    // 500 (5%)
        uint256 gold;      // 1000 (10%)
        uint256 platinum;  // 2000 (20%)
    }

    PointsConfig public pointsConfig;
    TierThresholds public tierThresholds;
    TierBonuses public tierBonuses;

    event PointsConfigUpdated(PointsConfig newConfig);
    event TierThresholdsUpdated(TierThresholds newThresholds);

    function updatePointsConfig(PointsConfig calldata config)
        external onlyRole(PARAMETER_ADMIN)
    {
        pointsConfig = config;
        emit PointsConfigUpdated(config);
    }
}
```

## File Changes Required

### New Files to Create:

1. `sdk/src/plugins/chainlink/FunctionsPlugin.ts` - Chainlink Functions integration
2. `sdk/src/plugins/chainlink/AutomationPlugin.ts` - Chainlink Automation
3. `sdk/src/plugins/carbon/CarbonOraclePlugin.ts` - Carbon credit oracle
4. `sdk/src/ahoy/adapters/CometDataAdapter.ts` - COMET API adapter
5. `contracts/src/oracles/CometFunctionsConsumer.sol` - On-chain consumer
6. `contracts/src/oracles/CarbonFactorRegistry.sol` - Carbon factors
7. `contracts/src/governance/AhoyParameters.sol` - Dynamic parameters
8. `server/src/webhooks/comet.ts` - Webhook handlers
9. `functions/safetyScore.js` - Chainlink Functions source
10. `functions/carbonOffset.js` - Carbon calculation source

### Files to Modify:

1. **TelematicsOracle.ts** - Replace hardcoded penalties with oracle calls
2. **IoTOracle.ts** - Add real device integration
3. **H2OUtilityCredit.ts** - Use CarbonOraclePlugin for offset calculation
4. **DriverReputation.ts** - Use FunctionsPlugin for scoring
5. **LoyaltyPlugin.ts** - Read from AhoyParameters contract
6. **types.ts** - Remove hardcoded POINTS_CONFIG, DRIVER_TIERS

## Demo Flow (After Implementation)

```
1. Driver completes delivery in COMET app
                    ▼
2. COMET sends webhook to TokenisationSDK server
                    ▼
3. CometDataAdapter validates & processes event
                    ▼
4. FunctionsPlugin calls Chainlink Functions with:
   - Telematics events from delivery
   - Fetches current penalty weights from COMET API
                    ▼
5. Chainlink DON executes JavaScript:
   - Calculates safety score
   - Returns result on-chain
                    ▼
6. CometFunctionsConsumer receives score
                    ▼
7. ReputationSBT updated with new score
                    ▼
8. If tier upgrade, AhoyToken rewards minted
                    ▼
9. User sees updated reputation in app
```

## Chainlink Network Details

| Network | Functions Router | Automation Registry | Data Feeds |
|---------|-----------------|---------------------|------------|
| Base Sepolia | 0xf9B8fc078197181C841c296C876945aaa425B278 | TBD | Available |
| Base Mainnet | 0xf9B8fc078197181C841c296C876945aaa425B278 | 0x... | Available |
| Polygon | 0xdc2AAF042Aeff2E68B3e8E33F19e4B9fA7C73F10 | 0x02777... | Available |

## Cost Estimates

| Operation | Cost (LINK) | Frequency |
|-----------|-------------|-----------|
| Functions request | 0.2-0.5 | Per delivery |
| Automation upkeep | 0.1 | Hourly batch |
| Data feed read | Free (view) | On-demand |

## Testing Strategy

1. **Unit Tests**: Mock Chainlink responses
2. **Integration Tests**: Use Base Sepolia testnet
3. **E2E Demo**:
   - Simulate COMET webhook
   - Verify on-chain score update
   - Check SBT metadata reflects new score

## Prerequisites

- LINK tokens for Chainlink Functions subscription
- Chainlink Functions subscription ID
- COMET API credentials (for real data)
- Climatiq API key (for carbon factors)
