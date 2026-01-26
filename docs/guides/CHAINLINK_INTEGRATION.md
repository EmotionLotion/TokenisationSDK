# Chainlink Integration Guide

This guide covers the complete Chainlink integration in the Tokenisation SDK, including Data Feeds, Functions, Automation, and advanced features like multi-oracle aggregation and monitoring.

## Table of Contents

1. [Overview](#overview)
2. [DataFeedPlugin](#datafeedplugin)
3. [FunctionsPlugin](#functionsplugin)
4. [AutomationPlugin](#automationplugin)
5. [LinkManagerPlugin](#linkmanagerplugin)
6. [OracleMonitorPlugin](#oraclemonitorplugin)
7. [OracleAggregator](#oracleaggregator)
8. [CCIPBridgePlugin](#ccipbridgeplugin)
9. [Cost Optimization](#cost-optimization)
10. [Production Checklist](#production-checklist)

---

## Overview

The SDK provides comprehensive Chainlink integration through modular plugins:

| Plugin | Purpose | LINK Required |
|--------|---------|---------------|
| DataFeedPlugin | Price feeds (ETH/USD, etc.) | No (free to read) |
| FunctionsPlugin | Off-chain computations | Yes (~0.25 LINK/request) |
| AutomationPlugin | Scheduled task execution | Yes (varies by frequency) |
| LinkManagerPlugin | LINK balance management | N/A |
| OracleMonitorPlugin | Health monitoring & alerts | No |
| OracleAggregator | Multi-oracle fallback | Depends on sources |
| CCIPBridgePlugin | Cross-chain transfers | Yes |

### Quick Start

```typescript
import {
  createDataFeed,
  createFunctionsPlugin,
  createAutomationPlugin,
  createLinkManager,
  createOracleMonitor,
  createOracleAggregator,
} from '@tokenisation/sdk';

// Initialize with your configuration
const dataFeed = createDataFeed({
  chainId: 1, // Ethereum mainnet
  rpcUrl: process.env.RPC_URL,
});
```

---

## DataFeedPlugin

Read real-time price data from Chainlink's decentralized oracle network.

### Configuration

```typescript
import { createDataFeed } from '@tokenisation/sdk';

const dataFeed = createDataFeed({
  chainId: 1,
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
  cacheTimeMs: 60000, // Cache prices for 1 minute
});
```

### Reading Price Feeds

```typescript
// Get ETH/USD price
const ethPrice = await dataFeed.getPrice('ETH', 'USD');
if (ethPrice.success) {
  console.log(`ETH/USD: $${ethPrice.data.price}`);
  console.log(`Updated: ${ethPrice.data.updatedAt}`);
  console.log(`Round: ${ethPrice.data.roundId}`);
}

// Get multiple prices
const prices = await dataFeed.getPrices(['ETH/USD', 'BTC/USD', 'MATIC/USD']);
```

### Available Price Feeds

The plugin includes pre-configured feed addresses for major pairs:

**Ethereum Mainnet:**
- ETH/USD, BTC/USD, USDC/USD, USDT/USD
- LINK/USD, MATIC/USD, AAVE/USD, UNI/USD

**Polygon:**
- MATIC/USD, ETH/USD, BTC/USD, USDC/USD

**Base:**
- ETH/USD, USDC/USD, cbETH/USD

### Custom Feed Addresses

```typescript
// Add custom price feed
dataFeed.addFeed({
  pair: 'CUSTOM/USD',
  address: '0x1234567890abcdef...',
  heartbeat: 3600, // Expected update frequency
});
```

### Staleness Detection

```typescript
// Check if price is stale
const priceData = await dataFeed.getPrice('ETH', 'USD');
if (priceData.success) {
  const isStale = dataFeed.isPriceStale(priceData.data, 3600); // 1 hour threshold
  if (isStale) {
    console.warn('Price data is stale!');
  }
}
```

---

## FunctionsPlugin

Execute custom JavaScript code in Chainlink's Decentralized Oracle Network (DON).

### Configuration

```typescript
import { createFunctionsPlugin } from '@tokenisation/sdk';

const functions = createFunctionsPlugin({
  chainId: 11155111, // Sepolia
  rpcUrl: process.env.RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  donId: 'fun-ethereum-sepolia-1',
  subscriptionId: BigInt(1234), // Your subscription ID
  gasLimit: 300000,
});
```

### Creating a Functions Request

```typescript
// KYC verification source
const kycSource = `
  const address = args[0];
  const response = await Functions.makeHttpRequest({
    url: 'https://api.kycprovider.com/verify',
    headers: { 'Authorization': 'Bearer ' + secrets.apiKey },
    params: { address }
  });
  return Functions.encodeString(JSON.stringify({
    verified: response.data.verified,
    level: response.data.level
  }));
`;

// Send request
const result = await functions.sendRequest({
  source: kycSource,
  args: ['0x1234...'],
  secrets: { apiKey: process.env.KYC_API_KEY },
  bytesArgs: [],
});

if (result.success) {
  console.log(`Request ID: ${result.data.requestId}`);
}
```

### Pre-built Sources

The SDK includes pre-built Functions sources:

```typescript
// KYC Verification
const kycResult = await functions.verifyKyc('0x1234...');

// Property Valuation
const valuation = await functions.getPropertyValuation({
  propertyId: 'prop-123',
  source: 'zillow', // or 'redfin', 'custom'
});

// Sanctions Check
const sanctions = await functions.checkSanctions('0x1234...');
```

### Subscription Management

```typescript
// Get subscription balance
const balance = await functions.getSubscriptionBalance();
console.log(`LINK Balance: ${balance}`);

// Fund subscription
await functions.fundSubscription(BigInt('5000000000000000000')); // 5 LINK

// Add consumer contract
await functions.addConsumer('0xConsumerContract...');
```

### Request Tracking

```typescript
// Track request status
const status = await functions.getRequestStatus(requestId);
console.log(`Status: ${status.state}`); // PENDING, FULFILLED, FAILED

// Wait for fulfillment
const response = await functions.waitForResponse(requestId, {
  timeout: 120000, // 2 minutes
  pollInterval: 5000, // Check every 5 seconds
});
```

---

## AutomationPlugin

Schedule and automate on-chain tasks using Chainlink Automation (formerly Keepers).

### Configuration

```typescript
import { createAutomationPlugin } from '@tokenisation/sdk';

const automation = createAutomationPlugin({
  chainId: 1,
  rpcUrl: process.env.RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  registryAddress: '0x...',
  registrarAddress: '0x...',
});
```

### Registering an Upkeep

```typescript
// Register a new upkeep
const upkeep = await automation.registerUpkeep({
  name: 'Monthly Dividend Distribution',
  contract: '0xDividendDistributor...',
  gasLimit: 500000,
  adminAddress: '0xAdmin...',
  checkData: '0x', // Data passed to checkUpkeep
  triggerType: 'TIME_BASED', // or 'CONDITION_BASED'
  offchainConfig: '0x',
});

if (upkeep.success) {
  console.log(`Upkeep ID: ${upkeep.data.upkeepId}`);
}
```

### Pre-built Automation Tasks

```typescript
// Distribution automation
const distTask = await automation.createDistributionTask({
  distributorContract: '0x...',
  frequency: 'MONTHLY',
  paymentToken: 'USDC',
  gasLimit: 300000,
});

// Compliance check automation
const complianceTask = await automation.createComplianceCheckTask({
  complianceContract: '0x...',
  checkType: 'KYC_EXPIRY',
  frequency: 'DAILY',
});

// NAV update automation
const navTask = await automation.createNAVUpdateTask({
  oracleContract: '0x...',
  assetIds: ['asset-1', 'asset-2'],
  frequency: 'HOURLY',
});
```

### Managing Upkeeps

```typescript
// Check upkeep status
const status = await automation.getUpkeepStatus(upkeepId);
console.log(`Active: ${status.active}`);
console.log(`Balance: ${status.balance}`);
console.log(`Last performed: ${status.lastPerformed}`);

// Fund upkeep
await automation.fundUpkeep(upkeepId, '2000000000000000000'); // 2 LINK

// Pause/Resume
await automation.pauseUpkeep(upkeepId);
await automation.resumeUpkeep(upkeepId);

// Cancel upkeep (withdraws remaining LINK)
await automation.cancelUpkeep(upkeepId);
```

---

## LinkManagerPlugin

Manage LINK token balances across Chainlink services.

### Configuration

```typescript
import { createLinkManager } from '@tokenisation/sdk';

const linkManager = createLinkManager({
  chainId: 1,
  rpcUrl: process.env.RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  alertThresholds: {
    functionsSubscription: '5000000000000000000', // 5 LINK
    automationUpkeep: '2000000000000000000', // 2 LINK
    wallet: '10000000000000000000', // 10 LINK
  },
  alertCallback: (alert) => {
    console.log(`ALERT: ${alert.type} - ${alert.message}`);
    // Send to Slack, PagerDuty, etc.
  },
});
```

### Checking Balances

```typescript
// Get wallet LINK balance
const walletBalance = await linkManager.getWalletBalance();
console.log(`Wallet: ${walletBalance} LINK`);

// Get Functions subscription balance
const subsBalance = await linkManager.getFunctionsSubscriptionBalance(
  BigInt(subscriptionId)
);
console.log(`Subscription: ${subsBalance.data.balance} LINK`);

// Get Automation upkeep balance
const upkeepBalance = await linkManager.getAutomationUpkeepBalance(upkeepId);
console.log(`Upkeep: ${upkeepBalance} LINK`);
```

### Funding Services

```typescript
// Fund Functions subscription
await linkManager.fundFunctionsSubscription(
  BigInt(subscriptionId),
  '5000000000000000000' // 5 LINK
);

// Fund Automation upkeep
await linkManager.fundAutomationUpkeep(
  upkeepId,
  '2000000000000000000' // 2 LINK
);
```

### Monitoring

```typescript
// Start continuous monitoring
linkManager.startFunctionsMonitoring(subscriptionId, 300000); // Check every 5 min
linkManager.startAutomationMonitoring(upkeepId, 300000);

// Stop monitoring
linkManager.stopMonitoring();

// Get monitoring status
const status = linkManager.getMonitoringStatus();
```

---

## OracleMonitorPlugin

Monitor oracle health and receive alerts for issues.

### Configuration

```typescript
import { createOracleMonitor } from '@tokenisation/sdk';

const monitor = createOracleMonitor({
  chainId: 1,
  rpcUrl: process.env.RPC_URL,
  webhookUrl: 'https://your-webhook.com/alerts',
  defaultStalenessThreshold: 3600, // 1 hour
});
```

### Registering Oracles

```typescript
// Register a data feed to monitor
monitor.registerDataFeed({
  id: 'eth-usd',
  name: 'ETH/USD Price Feed',
  address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  stalenessThreshold: 3600, // 1 hour
  deviationThreshold: 1, // 1% max deviation
});

// Register Functions request tracking
monitor.registerFunctionsRequest({
  id: 'kyc-check-123',
  requestId: '0x...',
  expectedFulfillmentTime: 120, // 2 minutes
});
```

### Health Checks

```typescript
// Check single oracle health
const health = await monitor.checkOracleHealth('eth-usd');
console.log(`Status: ${health.data.status}`); // HEALTHY, STALE, DEGRADED, ERROR
console.log(`Last update: ${health.data.lastUpdate}`);
console.log(`Latency: ${health.data.latencyMs}ms`);

// Check all registered oracles
const allHealth = await monitor.checkAllOracles();
for (const [id, status] of Object.entries(allHealth)) {
  console.log(`${id}: ${status.status}`);
}
```

### Alert Handling

```typescript
// Subscribe to alerts
const unsubscribe = monitor.onAlert((alert) => {
  console.log(`[${alert.severity}] ${alert.oracleId}: ${alert.message}`);

  switch (alert.severity) {
    case 'CRITICAL':
      // Page on-call
      break;
    case 'WARNING':
      // Send to Slack
      break;
    case 'INFO':
      // Log only
      break;
  }
});

// Start monitoring
monitor.startMonitoring(60000); // Check every minute

// Stop when done
monitor.stopMonitoring();
unsubscribe();
```

---

## OracleAggregator

Combine multiple oracle sources with fallback strategies.

### Configuration

```typescript
import { createOracleAggregator, AggregationStrategy } from '@tokenisation/sdk';

const aggregator = createOracleAggregator({
  chainId: 1,
  rpcUrl: process.env.RPC_URL,
  strategy: AggregationStrategy.PRIMARY_FALLBACK,
  maxStalenessSeconds: 3600,
});
```

### Adding Oracle Sources

```typescript
// Add Chainlink as primary source
aggregator.addChainlinkSource({
  pair: 'ETH/USD',
  address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  priority: 1, // Primary
  weight: 1,
});

// Add backup source
aggregator.addChainlinkSource({
  pair: 'ETH/USD',
  address: '0xBackupFeed...',
  priority: 2, // Fallback
  weight: 1,
});

// Add custom HTTP source
aggregator.addHttpSource({
  pair: 'ETH/USD',
  url: 'https://api.coingecko.com/api/v3/simple/price',
  params: { ids: 'ethereum', vs_currencies: 'usd' },
  parser: (data) => ({
    price: data.ethereum.usd.toString(),
    decimals: 8,
  }),
  priority: 3,
});
```

### Aggregation Strategies

```typescript
// PRIMARY_FALLBACK: Use first available source by priority
const price1 = await aggregator.getAggregatedPrice('ETH/USD');

// MEDIAN: Take median of all available sources
aggregator.setStrategy(AggregationStrategy.MEDIAN);
const price2 = await aggregator.getAggregatedPrice('ETH/USD');

// AVERAGE: Weighted average of all sources
aggregator.setStrategy(AggregationStrategy.AVERAGE);
const price3 = await aggregator.getAggregatedPrice('ETH/USD');

// CONSENSUS: Require minimum agreement between sources
aggregator.setStrategy(AggregationStrategy.CONSENSUS);
aggregator.setConsensusThreshold(0.66); // 66% must agree
const price4 = await aggregator.getAggregatedPrice('ETH/USD');
```

### Aggregated Results

```typescript
const result = await aggregator.getAggregatedPrice('ETH/USD');

if (result.success) {
  console.log(`Price: ${result.data.price}`);
  console.log(`Strategy: ${result.data.strategy}`);
  console.log(`Sources used: ${result.data.sourcesUsed}`);
  console.log(`Confidence: ${result.data.confidence}`);

  // Individual source results
  for (const source of result.data.sourceResults) {
    console.log(`  ${source.sourceId}: ${source.price} (${source.latencyMs}ms)`);
  }
}
```

---

## CCIPBridgePlugin

Cross-chain token transfers using Chainlink CCIP.

### Configuration

```typescript
import { createCCIPBridge } from '@tokenisation/sdk';

const bridge = createCCIPBridge({
  chainId: 1, // Source chain
  rpcUrl: process.env.RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  routerAddress: '0xCCIPRouter...',
});
```

### Bridging Tokens

```typescript
// Estimate bridge fee
const fee = await bridge.estimateFee({
  destinationChain: 137, // Polygon
  token: '0xTokenAddress...',
  amount: '1000000000000000000', // 1 token
  receiver: '0xRecipient...',
});
console.log(`Fee: ${fee.feeInLink} LINK`);

// Execute bridge
const result = await bridge.bridgeTokens({
  destinationChain: 137,
  token: '0xTokenAddress...',
  amount: '1000000000000000000',
  receiver: '0xRecipient...',
  gasLimit: 200000,
});

if (result.success) {
  console.log(`Message ID: ${result.data.messageId}`);
}
```

### Tracking Bridge Status

```typescript
// Track message status
const status = await bridge.getMessageStatus(messageId);
console.log(`Status: ${status}`); // PENDING, SUCCESS, FAILED

// Wait for completion
const completed = await bridge.waitForCompletion(messageId, {
  timeout: 600000, // 10 minutes
});
```

---

## Cost Optimization

### Caching Strategies

```typescript
// Enable aggressive caching for price feeds
const dataFeed = createDataFeed({
  chainId: 1,
  rpcUrl: process.env.RPC_URL,
  cacheTimeMs: 60000, // 1 minute cache
});

// Batch price requests
const prices = await dataFeed.getPrices(['ETH/USD', 'BTC/USD', 'LINK/USD']);
```

### Functions Optimization

```typescript
// Combine multiple API calls in one Functions request
const combinedSource = `
  const [kyc, sanctions, valuation] = await Promise.all([
    Functions.makeHttpRequest({ url: kycUrl }),
    Functions.makeHttpRequest({ url: sanctionsUrl }),
    Functions.makeHttpRequest({ url: valuationUrl }),
  ]);
  return Functions.encodeString(JSON.stringify({
    kyc: kyc.data,
    sanctions: sanctions.data,
    valuation: valuation.data,
  }));
`;
```

### Automation Optimization

```typescript
// Use appropriate check frequencies
const distTask = await automation.createDistributionTask({
  frequency: 'MONTHLY', // Not daily unless needed
  gasLimit: 300000, // Don't over-provision
});

// Batch operations in performUpkeep
// Instead of updating each holder, batch updates
```

### Gas Estimation

```typescript
// Get gas estimates before transactions
const gasEstimate = await functions.estimateRequestGas(source, args);
console.log(`Estimated gas: ${gasEstimate}`);
console.log(`Estimated cost: ${gasEstimate * gasPrice} wei`);
```

---

## Production Checklist

### Before Mainnet Deployment

- [ ] **LINK Funding**
  - [ ] Sufficient LINK in wallet for initial operations
  - [ ] Functions subscription funded (minimum 5 LINK)
  - [ ] Automation upkeeps funded (minimum 2 LINK each)

- [ ] **Monitoring**
  - [ ] OracleMonitorPlugin configured with webhook alerts
  - [ ] LinkManagerPlugin monitoring active with alert thresholds
  - [ ] Grafana dashboards for oracle metrics

- [ ] **Fallback Configuration**
  - [ ] OracleAggregator configured with backup sources
  - [ ] Error handling for oracle failures
  - [ ] Circuit breakers for degraded oracle states

- [ ] **Security**
  - [ ] Private keys secured (use hardware wallets or KMS)
  - [ ] API keys for Functions stored securely
  - [ ] Access control on admin functions

- [ ] **Testing**
  - [ ] Tested on testnet (Sepolia) for at least 2 weeks
  - [ ] Load tested with expected production volume
  - [ ] Failure scenarios tested (oracle down, stale data)

### Mainnet Configuration

```typescript
// Production configuration example
const prodConfig = {
  chainId: 1, // Ethereum mainnet
  rpcUrl: process.env.ETH_MAINNET_RPC,
  privateKey: process.env.DEPLOYER_KEY, // Use secure key management

  // Chainlink contract addresses (mainnet)
  functionsRouter: '0xC22a79eBA640940ABB6dF0f7982cc119578E11De',
  automationRegistry: '0x6593c7De001fC8542bB1703532EE1E5aA0D458fD',
  linkToken: '0x514910771AF9Ca656af840dff83E8264EcF986CA',

  // Alert thresholds (higher for production)
  alertThresholds: {
    functionsSubscription: ethers.parseEther('10'), // 10 LINK
    automationUpkeep: ethers.parseEther('5'), // 5 LINK
    wallet: ethers.parseEther('20'), // 20 LINK
  },
};
```

---

## Troubleshooting

### Common Issues

**1. Price feed returns stale data**
```typescript
// Increase staleness threshold or check feed heartbeat
const health = await monitor.checkOracleHealth('eth-usd');
if (health.data.status === 'STALE') {
  // Use fallback or alert operations
}
```

**2. Functions request timeout**
```typescript
// Increase timeout or simplify source code
const result = await functions.waitForResponse(requestId, {
  timeout: 300000, // 5 minutes
});
```

**3. Automation upkeep not performing**
```typescript
// Check upkeep balance and conditions
const status = await automation.getUpkeepStatus(upkeepId);
if (status.balance < minimumBalance) {
  await linkManager.fundAutomationUpkeep(upkeepId, fundAmount);
}
```

**4. Insufficient LINK balance**
```typescript
// Monitor and auto-fund
linkManager.onAlert((alert) => {
  if (alert.type === 'LOW_BALANCE') {
    // Trigger auto-funding or alert ops team
  }
});
```

---

## Additional Resources

- [Chainlink Documentation](https://docs.chain.link/)
- [Chainlink Functions Playground](https://functions.chain.link/)
- [LINK Token Faucets](https://faucets.chain.link/)
- [SDK Mainnet Costs Guide](../api/MAINNET_COSTS.md)
