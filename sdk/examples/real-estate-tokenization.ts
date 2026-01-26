/**
 * Real Estate Tokenization Example
 *
 * Demonstrates the complete flow of tokenizing a real estate asset:
 * 1. Register investors with KYC
 * 2. Deploy security token
 * 3. Mint tokens to investors
 * 4. Set up compliance rules
 * 5. Distribute dividends (rental income)
 */

import { TokenisationSDK } from '../src';
import { ethers } from 'ethers';

// Configuration
const config = {
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  privateKey: process.env.PRIVATE_KEY!,
  chainId: 84532, // Base Sepolia
};

// Property details
const property = {
  name: 'Downtown Office Tower',
  symbol: 'DOT-001',
  totalValue: 50_000_000, // $50M property value
  tokensToIssue: 1_000_000, // 1M tokens = $50 per token
  annualRentalYield: 0.06, // 6% annual yield
};

// Sample investors
const investors = [
  {
    address: '0x1234567890123456789012345678901234567890',
    country: 840, // USA
    accredited: true,
    investment: 100_000, // $100K investment = 2,000 tokens
  },
  {
    address: '0x2345678901234567890123456789012345678901',
    country: 784, // UAE
    accredited: true,
    investment: 500_000, // $500K investment = 10,000 tokens
  },
  {
    address: '0x3456789012345678901234567890123456789012',
    country: 826, // UK
    accredited: false, // Retail investor
    investment: 50_000, // $50K investment = 1,000 tokens
  },
];

async function main() {
  console.log('='.repeat(60));
  console.log('Real Estate Tokenization Example');
  console.log(`Property: ${property.name}`);
  console.log(`Total Value: $${property.totalValue.toLocaleString()}`);
  console.log('='.repeat(60));

  // Initialize SDK
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, provider);

  const sdk = new TokenisationSDK({
    signer,
    chainId: config.chainId,
    options: {
      defaultGasLimit: 500000,
    },
  });

  // Step 1: Deploy Identity Registry
  console.log('\n[Step 1] Deploying Identity Registry...');
  const identityRegistry = await sdk.deployIdentityRegistry();
  console.log(`Identity Registry deployed: ${identityRegistry.address}`);

  // Step 2: Deploy Compliance Module
  console.log('\n[Step 2] Setting up Compliance...');
  const compliance = await sdk.deployCompliance({
    identityRegistry: identityRegistry.address,
    rules: {
      // Only accredited investors can hold more than 50,000 tokens
      maxNonAccreditedBalance: ethers.parseUnits('50000', 18),
      // Maximum 100 holders
      maxHolders: 100,
      // Restricted countries (sanctions list)
      restrictedCountries: [408, 364, 760], // North Korea, Iran, Syria
      // Minimum KYC level required
      minKycLevel: 1,
    },
  });
  console.log(`Compliance Module deployed: ${compliance.address}`);

  // Step 3: Register Investors
  console.log('\n[Step 3] Registering Investors...');
  for (const investor of investors) {
    await identityRegistry.registerIdentity(
      investor.address,
      investor.country,
      investor.accredited ? 2 : 1, // KYC Level 2 for accredited
      Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 // 1 year validity
    );
    console.log(`  Registered: ${investor.address.slice(0, 10)}... (Country: ${investor.country})`);
  }

  // Step 4: Deploy Security Token
  console.log('\n[Step 4] Deploying Security Token...');
  const token = await sdk.deploySecurityToken({
    name: property.name,
    symbol: property.symbol,
    decimals: 18,
    identityRegistry: identityRegistry.address,
    compliance: compliance.address,
    initialSupply: ethers.parseUnits(property.tokensToIssue.toString(), 18),
  });
  console.log(`Security Token deployed: ${token.address}`);
  console.log(`  Name: ${await token.name()}`);
  console.log(`  Symbol: ${await token.symbol()}`);
  console.log(`  Total Supply: ${ethers.formatUnits(await token.totalSupply(), 18)} tokens`);

  // Step 5: Distribute Tokens to Investors
  console.log('\n[Step 5] Distributing Tokens to Investors...');
  for (const investor of investors) {
    const tokenAmount = Math.floor(investor.investment / (property.totalValue / property.tokensToIssue));
    const tokens = ethers.parseUnits(tokenAmount.toString(), 18);

    const tx = await token.transfer(investor.address, tokens);
    await tx.wait();

    console.log(`  Transferred ${tokenAmount.toLocaleString()} tokens to ${investor.address.slice(0, 10)}...`);
  }

  // Step 6: Deploy Dividend Distributor
  console.log('\n[Step 6] Setting up Dividend Distribution...');

  // Deploy USDC mock for dividends (in production, use actual USDC)
  const usdc = await sdk.deployMockERC20('USD Coin', 'USDC', 6);
  console.log(`USDC Mock deployed: ${usdc.address}`);

  const dividendDistributor = await sdk.deployDividendDistributor({
    securityToken: token.address,
    paymentToken: usdc.address,
  });
  console.log(`Dividend Distributor deployed: ${dividendDistributor.address}`);

  // Step 7: Declare Quarterly Dividend
  console.log('\n[Step 7] Declaring Quarterly Dividend...');

  // Calculate quarterly dividend
  const annualDividend = property.totalValue * property.annualRentalYield;
  const quarterlyDividend = annualDividend / 4;
  const dividendPerToken = quarterlyDividend / property.tokensToIssue;

  console.log(`  Annual Rental Income: $${annualDividend.toLocaleString()}`);
  console.log(`  Quarterly Distribution: $${quarterlyDividend.toLocaleString()}`);
  console.log(`  Per Token: $${dividendPerToken.toFixed(4)}`);

  // Mint USDC for dividend distribution (simulate rental income)
  const dividendAmount = ethers.parseUnits(quarterlyDividend.toString(), 6);
  await usdc.mint(signer.address, dividendAmount);
  await usdc.approve(dividendDistributor.address, dividendAmount);

  // Declare dividend
  const recordDate = Math.floor(Date.now() / 1000);
  const paymentDate = recordDate + 7 * 24 * 60 * 60; // 7 days later

  const dividendTx = await dividendDistributor.declareDividend(
    dividendAmount,
    recordDate,
    paymentDate
  );
  const receipt = await dividendTx.wait();
  console.log(`  Dividend declared! TX: ${dividendTx.hash}`);

  // Step 8: Summary
  console.log('\n' + '='.repeat(60));
  console.log('Tokenization Complete!');
  console.log('='.repeat(60));
  console.log('\nDeployed Contracts:');
  console.log(`  Security Token:      ${token.address}`);
  console.log(`  Identity Registry:   ${identityRegistry.address}`);
  console.log(`  Compliance:          ${compliance.address}`);
  console.log(`  Dividend Distributor: ${dividendDistributor.address}`);
  console.log(`  Payment Token (USDC): ${usdc.address}`);

  console.log('\nInvestor Holdings:');
  for (const investor of investors) {
    const balance = await token.balanceOf(investor.address);
    const ownership = (Number(ethers.formatUnits(balance, 18)) / property.tokensToIssue) * 100;
    console.log(`  ${investor.address.slice(0, 10)}...: ${ethers.formatUnits(balance, 18)} tokens (${ownership.toFixed(2)}%)`);
  }

  console.log('\nNext Steps:');
  console.log('  1. Investors can claim dividends after payment date');
  console.log('  2. Secondary market transfers are compliance-checked');
  console.log('  3. KYC status is automatically verified on each transfer');
  console.log('  4. Quarterly dividends can be automated via Chainlink Keepers');
}

main().catch(console.error);
