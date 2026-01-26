# Mainnet Cost Estimation Guide

This document provides comprehensive cost estimates for operating the Tokenisation SDK on mainnet. Understanding these costs is critical for production planning and budgeting.

## Table of Contents

1. [Overview](#overview)
2. [Chainlink Service Costs](#chainlink-service-costs)
3. [Gas Costs by Operation](#gas-costs-by-operation)
4. [Cost Optimization Strategies](#cost-optimization-strategies)
5. [Budget Planning Calculator](#budget-planning-calculator)
6. [Monitoring and Alerts](#monitoring-and-alerts)

---

## Overview

Operating the Tokenisation SDK on mainnet involves two primary cost categories:

1. **LINK Token Costs** - For Chainlink services (Data Feeds, Functions, Automation)
2. **Gas Costs** - For on-chain transactions (in native tokens: ETH, MATIC, etc.)

### Network Comparison

| Network | Native Token | Avg Gas Price | Tx Cost (Simple) | LINK Available |
|---------|-------------|---------------|------------------|----------------|
| Ethereum Mainnet | ETH | 20-50 gwei | $2-10 | Yes |
| Polygon | MATIC | 30-100 gwei | $0.01-0.05 | Yes |
| Base | ETH | 0.01-0.1 gwei | $0.01-0.10 | Yes |
| Arbitrum | ETH | 0.1-0.5 gwei | $0.10-0.50 | Yes |

---

## Chainlink Service Costs

### 1. Data Feeds

Chainlink Data Feeds are **free to read** on mainnet. No LINK required.

| Operation | Cost | Notes |
|-----------|------|-------|
| Read price | Free | RPC call only |
| Subscribe (polling) | Gas only | SDK polls via RPC |

**Best Practice**: Cache prices for 30-60 seconds to reduce RPC calls.

### 2. Chainlink Functions

Functions require LINK for each request. Costs vary by:
- Callback gas used
- DON (Decentralized Oracle Network) premium
- Network congestion

| Component | Estimated Cost | Notes |
|-----------|---------------|-------|
| Base Premium | 0.2 LINK | Per request |
| Callback Gas | 0.01-0.1 LINK | Depends on gas limit |
| **Total per Request** | **0.2-0.3 LINK** | ~$3-5 at $15/LINK |

#### Functions Cost Calculator

```
Cost per Request = Premium + (Callback Gas Limit × Gas Price in LINK)

Example (300,000 gas limit, 20 gwei):
- Premium: 0.2 LINK
- Gas cost: 300,000 × 20 gwei × ETH/LINK rate ≈ 0.05 LINK
- Total: ~0.25 LINK per request
```

#### Monthly Budget Estimates

| Usage Level | Requests/Month | LINK Required | Est. Cost (USD) |
|-------------|----------------|---------------|-----------------|
| Light | 100 | 25 LINK | $375 |
| Medium | 1,000 | 250 LINK | $3,750 |
| Heavy | 10,000 | 2,500 LINK | $37,500 |

### 3. Chainlink Automation (Keepers)

Automation charges for:
- Check upkeep calls (even when not performed)
- Perform upkeep execution
- Premium on top of gas

| Component | Cost | Notes |
|-----------|------|-------|
| Check Gas | ~150,000 gas | Per check |
| Perform Gas | Variable | Based on your contract |
| Premium | 20-80% | On top of gas cost |
| Minimum Balance | ~0.1 LINK | Per upkeep |

#### Automation Cost Calculator

```
Monthly Cost = (Checks × Check Cost) + (Performs × Perform Cost) × (1 + Premium)

Example (1 check/hour, 1 perform/day):
- Checks: 720/month × 150k gas × 20 gwei = 2.16 ETH gas
- Performs: 30/month × 500k gas × 20 gwei = 0.3 ETH gas
- With 50% premium and LINK conversion: ~50-100 LINK/month
```

#### Monthly Budget Estimates

| Check Frequency | Perform Frequency | LINK Required | Est. Cost (USD) |
|-----------------|-------------------|---------------|-----------------|
| Every 5 min | 1/day | 100 LINK | $1,500 |
| Every 1 min | 10/day | 500 LINK | $7,500 |
| Every block | 100/day | 2,000 LINK | $30,000 |

### 4. VRF (If Used)

| Network | Cost per Request |
|---------|------------------|
| Ethereum | 0.25 LINK |
| Polygon | 0.0005 LINK |
| Arbitrum | 0.005 LINK |

---

## Gas Costs by Operation

### Token Operations

| Operation | Gas Used | Est. Cost (Ethereum) | Est. Cost (Polygon) |
|-----------|----------|---------------------|---------------------|
| Mint (ERC-20) | 50,000 | $2-5 | $0.01 |
| Transfer (ERC-20) | 65,000 | $2-6 | $0.01 |
| Mint (ERC-721) | 100,000 | $4-10 | $0.02 |
| Transfer (ERC-721) | 80,000 | $3-8 | $0.02 |
| Burn | 40,000 | $1-4 | $0.01 |

### Compliance Operations

| Operation | Gas Used | Est. Cost (Ethereum) | Est. Cost (Polygon) |
|-----------|----------|---------------------|---------------------|
| Add to Whitelist | 50,000 | $2-5 | $0.01 |
| Remove from Whitelist | 30,000 | $1-3 | $0.01 |
| Freeze Account | 45,000 | $2-4 | $0.01 |
| Update KYC Status | 55,000 | $2-5 | $0.01 |

### Distribution Operations

| Operation | Gas Used | Est. Cost (Ethereum) | Est. Cost (Polygon) |
|-----------|----------|---------------------|---------------------|
| Create Schedule | 120,000 | $5-12 | $0.02 |
| Execute (per recipient) | 50,000 | $2-5 | $0.01 |
| Claim Dividend | 60,000 | $2-6 | $0.01 |

### Factory Deployments

| Contract | Gas Used | Est. Cost (Ethereum) | Est. Cost (Polygon) |
|----------|----------|---------------------|---------------------|
| ComplianceToken | 2,500,000 | $100-250 | $0.50 |
| AccessPassNFT | 2,000,000 | $80-200 | $0.40 |
| TokenFactory | 3,000,000 | $120-300 | $0.60 |

---

## Cost Optimization Strategies

### 1. Choose the Right Network

For cost-sensitive applications:
- **Production**: Polygon or Base (10-100x cheaper than Ethereum)
- **High-value assets**: Ethereum mainnet (highest security)
- **Testing**: Sepolia, Base Sepolia, Mumbai

### 2. Batch Operations

```typescript
// Instead of individual transfers
for (const recipient of recipients) {
  await token.transfer(recipient, amount);
}

// Use batch transfer
await token.batchTransfer(recipients, amounts);
```

**Savings**: 30-50% gas reduction

### 3. Optimize Automation Frequency

| Use Case | Recommended Frequency |
|----------|----------------------|
| NAV Updates | Every 1-4 hours |
| Compliance Checks | Daily |
| Dividend Distribution | Per schedule |
| License Renewal | Weekly check |

### 4. Cache Oracle Data

```typescript
const dataFeed = new DataFeedPlugin({
  cacheTimeMs: 60000, // 1 minute cache
});
```

### 5. Use Functions Wisely

- Combine multiple data fetches into single request
- Use off-chain computation when possible
- Cache results that don't change frequently

### 6. Set Appropriate Gas Limits

```typescript
// Don't over-provision
const automation = new ChainlinkAutomationPlugin({
  gasLimit: 300000, // Actual needed, not maximum
});
```

---

## Budget Planning Calculator

### Monthly Operating Budget Template

```
┌─────────────────────────────────────────────────────────────┐
│ MONTHLY MAINNET BUDGET CALCULATOR                           │
├─────────────────────────────────────────────────────────────┤
│ Chainlink Services                                          │
│   Functions: _____ requests × 0.25 LINK = _____ LINK       │
│   Automation: _____ upkeeps × _____ LINK = _____ LINK      │
│   VRF (if used): _____ requests × _____ LINK = _____ LINK  │
│   ─────────────────────────────────────────────────         │
│   Subtotal LINK: _____ LINK × $15 = $_____ USD             │
│                                                             │
│ Gas Costs (Ethereum example at 30 gwei)                     │
│   Token Operations: _____ txs × $3 avg = $_____            │
│   Compliance Ops: _____ txs × $3 avg = $_____              │
│   Distributions: _____ recipients × $2 = $_____            │
│   ─────────────────────────────────────────────────         │
│   Subtotal Gas: $_____ USD                                  │
│                                                             │
│ TOTAL MONTHLY: $_____ USD                                   │
│ + 20% Buffer: $_____ USD                                    │
│ ════════════════════════════════════════════════            │
│ RECOMMENDED BUDGET: $_____ USD                              │
└─────────────────────────────────────────────────────────────┘
```

### Example Budgets by Scale

#### Startup (10 assets, 100 investors)

| Item | Monthly Cost |
|------|-------------|
| Functions (50 requests) | $200 |
| Automation (2 upkeeps) | $100 |
| Gas (Polygon) | $50 |
| **Total** | **$350/month** |

#### Growth (100 assets, 1,000 investors)

| Item | Monthly Cost |
|------|-------------|
| Functions (500 requests) | $1,900 |
| Automation (10 upkeeps) | $500 |
| Gas (Polygon) | $200 |
| **Total** | **$2,600/month** |

#### Enterprise (1,000 assets, 10,000 investors)

| Item | Monthly Cost |
|------|-------------|
| Functions (5,000 requests) | $19,000 |
| Automation (50 upkeeps) | $2,500 |
| Gas (Polygon) | $1,000 |
| **Total** | **$22,500/month** |

---

## Monitoring and Alerts

### Using LinkManagerPlugin

```typescript
import { createLinkManager } from '@ahoy/tokenisation-sdk';

const linkManager = createLinkManager({
  chainId: 1,
  rpcUrl: process.env.RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  alertThresholds: {
    functionsSubscription: ethers.parseEther('5').toString(), // 5 LINK
    automationUpkeep: ethers.parseEther('2').toString(),      // 2 LINK
  },
  alertCallback: (alert) => {
    // Send to Slack, PagerDuty, etc.
    sendAlert(alert);
  },
});

// Start monitoring
linkManager.startFunctionsMonitoring(subscriptionId, 300000); // Check every 5 min
linkManager.startAutomationMonitoring(upkeepId, 300000);
```

### Using OracleMonitorPlugin

```typescript
import { createOracleMonitor } from '@ahoy/tokenisation-sdk';

const monitor = createOracleMonitor({
  chainId: 1,
  rpcUrl: process.env.RPC_URL,
  webhookUrl: 'https://your-webhook.com/alerts',
  defaultStalenessThreshold: 3600, // 1 hour
});

// Register data feeds to monitor
monitor.registerDataFeed({
  id: 'eth-usd',
  name: 'ETH/USD Price Feed',
  address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  stalenessThreshold: 3600,
});

// Start monitoring
monitor.startMonitoring();
```

### Recommended Alert Thresholds

| Service | Warning | Critical |
|---------|---------|----------|
| Functions Subscription | 5 LINK | 1 LINK |
| Automation Upkeep | 2 LINK | 0.5 LINK |
| Data Feed Staleness | 2 hours | 6 hours |
| Wallet LINK Balance | 10 LINK | 2 LINK |

---

## Quick Reference Card

### LINK Token Addresses

| Network | LINK Address |
|---------|-------------|
| Ethereum | 0x514910771AF9Ca656af840dff83E8264EcF986CA |
| Polygon | 0xb0897686c545045aFc77CF20eC7A532E3120E0F1 |
| Base | 0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196 |
| Arbitrum | 0xf97f4df75117a78c1A5a0DBb814Af92458539FB4 |

### Where to Get LINK

1. **Exchanges**: Coinbase, Binance, Kraken
2. **DEX**: Uniswap, SushiSwap
3. **Bridge**: Chainlink CCIP for cross-chain

### Faucets (Testnet)

| Network | Faucet URL |
|---------|-----------|
| Sepolia | https://faucets.chain.link/sepolia |
| Mumbai | https://faucets.chain.link/mumbai |
| Base Sepolia | https://faucets.chain.link/base-sepolia |

---

## Summary

| Cost Category | Typical Range | Key Factors |
|---------------|--------------|-------------|
| Functions | $0.20-0.30/request | Gas limit, premium |
| Automation | $50-500/month/upkeep | Frequency, gas |
| Data Feeds | Free | RPC costs only |
| Gas (L2) | $0.01-0.10/tx | Network, congestion |
| Gas (L1) | $2-20/tx | ETH price, congestion |

**Recommendation**: Start on testnet, then deploy to Polygon/Base for cost efficiency. Use Ethereum mainnet only for high-value assets requiring maximum security.
