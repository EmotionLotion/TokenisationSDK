/**
 * Dividend Distribution Example
 *
 * Demonstrates:
 * 1. Declaring dividends with record dates
 * 2. Balance snapshots for eligibility
 * 3. Push vs Pull distribution models
 * 4. Multi-currency dividend support
 * 5. Automated distribution with Chainlink Keepers
 */

import { TokenisationSDK } from '../src';
import { ethers } from 'ethers';

// Configuration
const config = {
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  privateKey: process.env.PRIVATE_KEY!,
  chainId: 84532,
};

// Token details
const tokenDetails = {
  name: 'Dividend Token Example',
  symbol: 'DIV',
  totalSupply: 1_000_000,
};

// Sample holders (would come from token contract in production)
const holders = [
  { address: '0x1111111111111111111111111111111111111111', balance: 250_000 }, // 25%
  { address: '0x2222222222222222222222222222222222222222', balance: 150_000 }, // 15%
  { address: '0x3333333333333333333333333333333333333333', balance: 100_000 }, // 10%
  { address: '0x4444444444444444444444444444444444444444', balance: 50_000 },  // 5%
  { address: '0x5555555555555555555555555555555555555555', balance: 450_000 }, // 45% (Treasury)
];

// Dividend configuration
const dividendConfig = {
  totalAmount: 100_000, // $100,000 total dividend
  currency: 'USDC',
  recordDate: new Date('2025-01-15'),
  paymentDate: new Date('2025-01-31'),
  excludeAddresses: [
    '0x5555555555555555555555555555555555555555', // Treasury excluded
  ],
};

async function main() {
  console.log('='.repeat(60));
  console.log('Dividend Distribution Example');
  console.log(`Token: ${tokenDetails.name} (${tokenDetails.symbol})`);
  console.log('='.repeat(60));

  // Initialize
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, provider);

  const sdk = new TokenisationSDK({
    signer,
    chainId: config.chainId,
  });

  // Step 1: Calculate Eligible Supply
  console.log('\n[Step 1] Calculating Eligible Supply');
  console.log('-'.repeat(40));

  const excludedBalance = holders
    .filter((h) => dividendConfig.excludeAddresses.includes(h.address))
    .reduce((sum, h) => sum + h.balance, 0);

  const eligibleSupply = tokenDetails.totalSupply - excludedBalance;

  console.log(`  Total Supply: ${tokenDetails.totalSupply.toLocaleString()} ${tokenDetails.symbol}`);
  console.log(`  Excluded (Treasury): ${excludedBalance.toLocaleString()} ${tokenDetails.symbol}`);
  console.log(`  Eligible Supply: ${eligibleSupply.toLocaleString()} ${tokenDetails.symbol}`);

  // Step 2: Calculate Per-Token Dividend
  console.log('\n[Step 2] Per-Token Dividend Calculation');
  console.log('-'.repeat(40));

  const dividendPerToken = dividendConfig.totalAmount / eligibleSupply;

  console.log(`  Total Distribution: $${dividendConfig.totalAmount.toLocaleString()}`);
  console.log(`  Eligible Tokens: ${eligibleSupply.toLocaleString()}`);
  console.log(`  Dividend per Token: $${dividendPerToken.toFixed(6)}`);

  // Step 3: Calculate Individual Distributions
  console.log('\n[Step 3] Individual Distribution Amounts');
  console.log('-'.repeat(40));

  interface Distribution {
    address: string;
    balance: number;
    dividendAmount: number;
    percentage: number;
  }

  const distributions: Distribution[] = [];
  let totalDistributed = 0;

  for (const holder of holders) {
    if (dividendConfig.excludeAddresses.includes(holder.address)) {
      console.log(`  ${holder.address.slice(0, 10)}...: EXCLUDED (Treasury)`);
      continue;
    }

    const dividendAmount = holder.balance * dividendPerToken;
    const percentage = (holder.balance / eligibleSupply) * 100;

    distributions.push({
      address: holder.address,
      balance: holder.balance,
      dividendAmount,
      percentage,
    });

    totalDistributed += dividendAmount;

    console.log(
      `  ${holder.address.slice(0, 10)}...: ${holder.balance.toLocaleString()} tokens -> $${dividendAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${percentage.toFixed(2)}%)`
    );
  }

  console.log(`\n  Total to Distribute: $${totalDistributed.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);

  // Step 4: Deploy Dividend Contracts
  console.log('\n[Step 4] Deploying Dividend Contracts');
  console.log('-'.repeat(40));

  // Deploy mock USDC
  const usdc = await sdk.deployMockERC20('USD Coin', 'USDC', 6);
  console.log(`  USDC Token: ${usdc.address}`);

  // Deploy mock security token
  const securityToken = await sdk.deployMockERC20(
    tokenDetails.name,
    tokenDetails.symbol,
    18
  );
  console.log(`  Security Token: ${securityToken.address}`);

  // Deploy dividend distributor
  const dividendDistributor = await sdk.deployDividendDistributor({
    securityToken: securityToken.address,
    paymentToken: usdc.address,
  });
  console.log(`  Dividend Distributor: ${dividendDistributor.address}`);

  // Step 5: Fund Distribution Contract
  console.log('\n[Step 5] Funding Distribution Contract');
  console.log('-'.repeat(40));

  const distributionAmount = ethers.parseUnits(dividendConfig.totalAmount.toString(), 6);

  // Mint USDC to deployer
  await usdc.mint(signer.address, distributionAmount);
  console.log(`  Minted ${dividendConfig.totalAmount.toLocaleString()} USDC to deployer`);

  // Approve dividend distributor
  await usdc.approve(dividendDistributor.address, distributionAmount);
  console.log(`  Approved Dividend Distributor to spend USDC`);

  // Step 6: Declare Dividend
  console.log('\n[Step 6] Declaring Dividend');
  console.log('-'.repeat(40));

  const recordTimestamp = Math.floor(dividendConfig.recordDate.getTime() / 1000);
  const paymentTimestamp = Math.floor(dividendConfig.paymentDate.getTime() / 1000);

  const declareTx = await dividendDistributor.declareDividend(
    distributionAmount,
    recordTimestamp,
    paymentTimestamp
  );
  await declareTx.wait();

  console.log(`  Dividend Declared!`);
  console.log(`    Amount: ${dividendConfig.totalAmount.toLocaleString()} ${dividendConfig.currency}`);
  console.log(`    Record Date: ${dividendConfig.recordDate.toISOString()}`);
  console.log(`    Payment Date: ${dividendConfig.paymentDate.toISOString()}`);
  console.log(`    Transaction: ${declareTx.hash}`);

  // Step 7: Distribution Methods
  console.log('\n[Step 7] Distribution Methods');
  console.log('-'.repeat(40));

  console.log('\n  Option A: PULL Model (Holders Claim)');
  console.log('    - Each holder calls claimDividend()');
  console.log('    - Lower gas cost for issuer');
  console.log('    - Holders pay their own gas');
  console.log('    - Unclaimed dividends remain in contract');

  console.log('\n  Option B: PUSH Model (Issuer Distributes)');
  console.log('    - Issuer calls pushDividends() with holder list');
  console.log('    - Higher gas cost for issuer');
  console.log('    - Better UX for holders');
  console.log('    - Batch processing supported');

  // Simulate push distribution
  console.log('\n  Simulating PUSH Distribution (Batch):');

  const batchSize = 50;
  const eligibleHolders = distributions.map((d) => d.address);

  for (let i = 0; i < eligibleHolders.length; i += batchSize) {
    const batch = eligibleHolders.slice(i, i + batchSize);
    console.log(`    Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} holders`);

    // In production:
    // await dividendDistributor.pushDividends(dividendId, batch);
  }

  // Step 8: Chainlink Automation
  console.log('\n[Step 8] Automated Distribution with Chainlink');
  console.log('-'.repeat(40));

  console.log('  Automation Setup:');
  console.log('    1. Deploy DistributionKeeper contract');
  console.log('    2. Register upkeep with Chainlink Automation');
  console.log('    3. Fund upkeep with LINK');
  console.log('    4. Keeper checks payment date and distributes');

  const keeperConfig = {
    checkInterval: 86400, // Daily check
    minLinkBalance: 5, // Minimum LINK to maintain
    maxGasLimit: 500000, // Max gas per batch
    batchSize: 100, // Holders per batch
  };

  console.log('\n  Keeper Configuration:');
  console.log(`    Check Interval: ${keeperConfig.checkInterval / 3600} hours`);
  console.log(`    Min LINK Balance: ${keeperConfig.minLinkBalance} LINK`);
  console.log(`    Max Gas Limit: ${keeperConfig.maxGasLimit}`);
  console.log(`    Batch Size: ${keeperConfig.batchSize} holders`);

  // Step 9: Summary
  console.log('\n' + '='.repeat(60));
  console.log('Dividend Distribution Setup Complete');
  console.log('='.repeat(60));

  console.log('\nDeployed Contracts:');
  console.log(`  Security Token:       ${securityToken.address}`);
  console.log(`  Payment Token (USDC): ${usdc.address}`);
  console.log(`  Dividend Distributor: ${dividendDistributor.address}`);

  console.log('\nDividend Details:');
  console.log(`  Total Amount: $${dividendConfig.totalAmount.toLocaleString()}`);
  console.log(`  Per Token:    $${dividendPerToken.toFixed(6)}`);
  console.log(`  Record Date:  ${dividendConfig.recordDate.toLocaleDateString()}`);
  console.log(`  Payment Date: ${dividendConfig.paymentDate.toLocaleDateString()}`);

  console.log('\nEligible Distributions:');
  for (const dist of distributions) {
    console.log(`  ${dist.address.slice(0, 10)}...: $${dist.dividendAmount.toFixed(2)}`);
  }

  console.log('\nNext Steps:');
  console.log('  1. Wait for record date to snapshot balances');
  console.log('  2. After payment date, distribute via push or allow claims');
  console.log('  3. Monitor unclaimed dividends');
  console.log('  4. Handle expired/forfeited dividends per policy');
}

main().catch(console.error);
