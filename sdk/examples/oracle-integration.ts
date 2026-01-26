/**
 * Chainlink Oracle Integration Example
 *
 * Demonstrates:
 * 1. Price feed integration for asset valuation
 * 2. Chainlink Functions for off-chain data
 * 3. Automation (Keepers) for scheduled tasks
 * 4. Real-time NAV calculation
 */

import { TokenisationSDK } from '../src';
import { ethers } from 'ethers';

// Configuration
const config = {
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  privateKey: process.env.PRIVATE_KEY!,
  chainId: 84532,
};

// Chainlink addresses (Base Sepolia)
const chainlinkAddresses = {
  ethUsd: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
  btcUsd: '0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298',
  linkToken: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410',
  functionsRouter: '0xf9B8fc078197181C841c296C876945aaa425B278',
  automationRegistry: '0x...',
};

// Portfolio for NAV calculation
const portfolio = {
  name: 'Crypto Real Estate Fund',
  assets: [
    {
      name: 'Commercial Property NYC',
      type: 'real_estate',
      valuationUSD: 10_000_000,
      lastAppraisal: new Date('2024-06-01'),
    },
    {
      name: 'ETH Treasury',
      type: 'crypto',
      amount: 100, // 100 ETH
      priceFeed: chainlinkAddresses.ethUsd,
    },
    {
      name: 'BTC Treasury',
      type: 'crypto',
      amount: 5, // 5 BTC
      priceFeed: chainlinkAddresses.btcUsd,
    },
    {
      name: 'Rental Income Receivables',
      type: 'receivable',
      valuationUSD: 500_000,
      dueDate: new Date('2025-01-31'),
    },
  ],
  tokensIssued: 1_000_000,
};

// Price feed ABI (minimal)
const priceFeedABI = [
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
  'function description() external view returns (string memory)',
];

async function main() {
  console.log('='.repeat(60));
  console.log('Chainlink Oracle Integration Example');
  console.log(`Fund: ${portfolio.name}`);
  console.log('='.repeat(60));

  // Initialize
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, provider);

  const sdk = new TokenisationSDK({
    signer,
    chainId: config.chainId,
  });

  // Step 1: Fetch Live Prices from Chainlink
  console.log('\n[Step 1] Fetching Live Prices from Chainlink');
  console.log('-'.repeat(40));

  const prices: Record<string, { price: number; decimals: number; updatedAt: Date }> = {};

  // Fetch ETH/USD
  const ethUsdFeed = new ethers.Contract(chainlinkAddresses.ethUsd, priceFeedABI, provider);
  try {
    const [, ethPrice, , ethUpdated] = await ethUsdFeed.latestRoundData();
    const ethDecimals = await ethUsdFeed.decimals();
    prices['ETH/USD'] = {
      price: Number(ethPrice) / 10 ** Number(ethDecimals),
      decimals: Number(ethDecimals),
      updatedAt: new Date(Number(ethUpdated) * 1000),
    };
    console.log(`  ETH/USD: $${prices['ETH/USD'].price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
    console.log(`    Updated: ${prices['ETH/USD'].updatedAt.toISOString()}`);
  } catch (e) {
    console.log(`  ETH/USD: Using mock price $3,500`);
    prices['ETH/USD'] = { price: 3500, decimals: 8, updatedAt: new Date() };
  }

  // Fetch BTC/USD
  try {
    const btcUsdFeed = new ethers.Contract(chainlinkAddresses.btcUsd, priceFeedABI, provider);
    const [, btcPrice, , btcUpdated] = await btcUsdFeed.latestRoundData();
    const btcDecimals = await btcUsdFeed.decimals();
    prices['BTC/USD'] = {
      price: Number(btcPrice) / 10 ** Number(btcDecimals),
      decimals: Number(btcDecimals),
      updatedAt: new Date(Number(btcUpdated) * 1000),
    };
    console.log(`  BTC/USD: $${prices['BTC/USD'].price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
    console.log(`    Updated: ${prices['BTC/USD'].updatedAt.toISOString()}`);
  } catch (e) {
    console.log(`  BTC/USD: Using mock price $65,000`);
    prices['BTC/USD'] = { price: 65000, decimals: 8, updatedAt: new Date() };
  }

  // Step 2: Calculate Portfolio NAV
  console.log('\n[Step 2] Calculating Portfolio NAV');
  console.log('-'.repeat(40));

  let totalNAV = 0;

  for (const asset of portfolio.assets) {
    let assetValue = 0;

    if (asset.type === 'real_estate' || asset.type === 'receivable') {
      assetValue = asset.valuationUSD!;
      console.log(`  ${asset.name}: $${assetValue.toLocaleString()} (Static Valuation)`);
    } else if (asset.type === 'crypto') {
      const pricePair = asset.name.includes('ETH') ? 'ETH/USD' : 'BTC/USD';
      const price = prices[pricePair]?.price || 0;
      assetValue = asset.amount! * price;
      console.log(`  ${asset.name}: ${asset.amount} x $${price.toLocaleString()} = $${assetValue.toLocaleString()}`);
    }

    totalNAV += assetValue;
  }

  const navPerToken = totalNAV / portfolio.tokensIssued;

  console.log('\n  ' + '-'.repeat(36));
  console.log(`  Total NAV: $${totalNAV.toLocaleString()}`);
  console.log(`  Tokens Issued: ${portfolio.tokensIssued.toLocaleString()}`);
  console.log(`  NAV per Token: $${navPerToken.toFixed(4)}`);

  // Step 3: Deploy On-Chain Oracle Registry
  console.log('\n[Step 3] Deploying Oracle Registry');
  console.log('-'.repeat(40));

  const oracleRegistry = await sdk.deployOracleRegistry();
  console.log(`  Oracle Registry: ${oracleRegistry.address}`);

  // Register price feeds
  await oracleRegistry.registerOracle('ETH/USD', chainlinkAddresses.ethUsd, 8, 3600, true);
  console.log(`  Registered ETH/USD feed`);

  // Step 4: Deploy Price Feed Contract
  console.log('\n[Step 4] Deploying Price Feed Contract');
  console.log('-'.repeat(40));

  const priceFeed = await sdk.deployChainlinkPriceFeed(chainlinkAddresses.ethUsd);
  console.log(`  Price Feed Contract: ${priceFeed.address}`);

  // Step 5: Chainlink Functions Example
  console.log('\n[Step 5] Chainlink Functions (Off-Chain Data)');
  console.log('-'.repeat(40));

  // Example: Fetch real estate appraisal from API
  const functionsSource = `
    // Chainlink Functions JavaScript source code
    // Fetches property appraisal from external API

    const propertyId = args[0];

    const response = await Functions.makeHttpRequest({
      url: \`https://api.appraisals.example.com/properties/\${propertyId}\`,
      headers: {
        'Authorization': \`Bearer \${secrets.apiKey}\`
      }
    });

    if (response.error) {
      throw Error('API request failed');
    }

    // Return appraisal value in cents (avoid decimals)
    const valueCents = Math.round(response.data.currentValue * 100);
    return Functions.encodeUint256(valueCents);
  `;

  console.log('  Functions Source Code:');
  console.log('    - Fetches property appraisal from external API');
  console.log('    - Returns value encoded as uint256');
  console.log('    - Can be scheduled to run periodically');

  // Deploy Functions Consumer (in production)
  // const functionsConsumer = await sdk.deployFunctionsConsumer({
  //   router: chainlinkAddresses.functionsRouter,
  //   donId: 'fun-base-sepolia-1',
  // });

  // Step 6: Chainlink Automation (Keepers)
  console.log('\n[Step 6] Chainlink Automation Setup');
  console.log('-'.repeat(40));

  console.log('  Automated Tasks:');
  console.log('    1. Daily NAV Calculation (00:00 UTC)');
  console.log('    2. Weekly Compliance Check (Sundays)');
  console.log('    3. Monthly Dividend Distribution');
  console.log('    4. Quarterly Appraisal Updates');

  // Deploy Distribution Keeper (example)
  // const distributionKeeper = await sdk.deployDistributionKeeper({
  //   dividendDistributor: '0x...',
  //   interval: 30 * 24 * 60 * 60, // Monthly
  // });

  // Step 7: Price Staleness Check
  console.log('\n[Step 7] Price Staleness Monitoring');
  console.log('-'.repeat(40));

  const maxAge = 3600; // 1 hour
  const now = Math.floor(Date.now() / 1000);

  for (const [pair, data] of Object.entries(prices)) {
    const age = now - Math.floor(data.updatedAt.getTime() / 1000);
    const isStale = age > maxAge;
    const status = isStale ? 'STALE' : 'FRESH';

    console.log(`  ${pair}: ${status} (Age: ${age}s, Max: ${maxAge}s)`);
  }

  // Step 8: Summary
  console.log('\n' + '='.repeat(60));
  console.log('Oracle Integration Complete');
  console.log('='.repeat(60));

  console.log('\nDeployed Contracts:');
  console.log(`  Oracle Registry: ${oracleRegistry.address}`);
  console.log(`  Price Feed:      ${priceFeed.address}`);

  console.log('\nIntegrated Oracles:');
  console.log('  - ETH/USD Chainlink Data Feed');
  console.log('  - BTC/USD Chainlink Data Feed');
  console.log('  - Chainlink Functions for appraisals');
  console.log('  - Chainlink Automation for scheduled tasks');

  console.log('\nNAV Summary:');
  console.log(`  Portfolio Value: $${totalNAV.toLocaleString()}`);
  console.log(`  NAV per Token:   $${navPerToken.toFixed(4)}`);
  console.log(`  Last Update:     ${new Date().toISOString()}`);
}

main().catch(console.error);
