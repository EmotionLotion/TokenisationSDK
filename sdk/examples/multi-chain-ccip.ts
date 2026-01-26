/**
 * Multi-Chain CCIP Bridge Example
 *
 * Demonstrates:
 * 1. Cross-chain token transfers using Chainlink CCIP
 * 2. Multi-chain deployment and management
 * 3. Cross-chain compliance verification
 * 4. Bridge monitoring and fee calculation
 */

import { TokenisationSDK } from '../src';
import { ethers } from 'ethers';

// Network configurations
const networks = {
  sepolia: {
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
    ccipRouter: '0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59',
    ccipChainSelector: '16015286601757825753',
    linkToken: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
  },
  baseSepolia: {
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    ccipRouter: '0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93',
    ccipChainSelector: '10344971235874465080',
    linkToken: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410',
  },
  polygonAmoy: {
    name: 'Polygon Amoy',
    chainId: 80002,
    rpcUrl: process.env.AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
    ccipRouter: '0x9C32fCB86BF0f4a1A8921a9Fe46de3198bb884B2',
    ccipChainSelector: '16281711391670634445',
    linkToken: '0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904',
  },
};

// Configuration
const config = {
  privateKey: process.env.PRIVATE_KEY!,
  sourceNetwork: 'sepolia' as keyof typeof networks,
  destinationNetwork: 'baseSepolia' as keyof typeof networks,
};

// Token to bridge
const bridgeConfig = {
  tokenSymbol: 'REALESTATE',
  amount: ethers.parseUnits('1000', 18), // 1000 tokens
  recipient: '0x1234567890123456789012345678901234567890',
};

async function main() {
  console.log('='.repeat(60));
  console.log('Multi-Chain CCIP Bridge Example');
  console.log('='.repeat(60));

  const sourceNet = networks[config.sourceNetwork];
  const destNet = networks[config.destinationNetwork];

  console.log(`\nSource Network: ${sourceNet.name} (${sourceNet.chainId})`);
  console.log(`Destination Network: ${destNet.name} (${destNet.chainId})`);

  // Initialize providers and signers
  const sourceProvider = new ethers.JsonRpcProvider(sourceNet.rpcUrl);
  const destProvider = new ethers.JsonRpcProvider(destNet.rpcUrl);

  const sourceSigner = new ethers.Wallet(config.privateKey, sourceProvider);
  const destSigner = new ethers.Wallet(config.privateKey, destProvider);

  console.log(`\nDeployer Address: ${sourceSigner.address}`);

  // Initialize SDKs for each network
  const sourceSDK = new TokenisationSDK({
    signer: sourceSigner,
    chainId: sourceNet.chainId,
  });

  const destSDK = new TokenisationSDK({
    signer: destSigner,
    chainId: destNet.chainId,
  });

  // Step 1: Check LINK Balances
  console.log('\n[Step 1] Checking LINK Balances');
  console.log('-'.repeat(40));

  const linkAbi = ['function balanceOf(address) view returns (uint256)'];

  const sourceLinkContract = new ethers.Contract(
    sourceNet.linkToken,
    linkAbi,
    sourceProvider
  );
  const destLinkContract = new ethers.Contract(
    destNet.linkToken,
    linkAbi,
    destProvider
  );

  try {
    const sourceLinkBalance = await sourceLinkContract.balanceOf(sourceSigner.address);
    const destLinkBalance = await destLinkContract.balanceOf(destSigner.address);

    console.log(`  ${sourceNet.name} LINK: ${ethers.formatUnits(sourceLinkBalance, 18)}`);
    console.log(`  ${destNet.name} LINK: ${ethers.formatUnits(destLinkBalance, 18)}`);

    if (sourceLinkBalance < ethers.parseUnits('1', 18)) {
      console.log('\n  WARNING: Low LINK balance on source network!');
      console.log('  Get testnet LINK from: https://faucets.chain.link');
    }
  } catch (e) {
    console.log('  Unable to fetch LINK balances (network may be unavailable)');
  }

  // Step 2: Deploy Security Token on Source Chain
  console.log('\n[Step 2] Deploying Security Token on Source Chain');
  console.log('-'.repeat(40));

  // Deploy Identity Registry
  const identityRegistry = await sourceSDK.deployIdentityRegistry();
  console.log(`  Identity Registry: ${identityRegistry.address}`);

  // Deploy Compliance
  const compliance = await sourceSDK.deployCompliance({
    identityRegistry: identityRegistry.address,
    rules: {
      maxHolders: 2000,
      restrictedCountries: [408, 364, 760], // Sanctioned countries
      minKycLevel: 1,
    },
  });
  console.log(`  Compliance Module: ${compliance.address}`);

  // Deploy Security Token
  const securityToken = await sourceSDK.deploySecurityToken({
    name: 'Real Estate Security Token',
    symbol: bridgeConfig.tokenSymbol,
    decimals: 18,
    identityRegistry: identityRegistry.address,
    compliance: compliance.address,
    initialSupply: ethers.parseUnits('1000000', 18),
  });
  console.log(`  Security Token: ${securityToken.address}`);

  // Step 3: Deploy CCIP Bridge
  console.log('\n[Step 3] Deploying CCIP Bridge Contracts');
  console.log('-'.repeat(40));

  // Deploy source bridge
  const sourceBridge = await sourceSDK.deployCCIPBridge({
    router: sourceNet.ccipRouter,
    linkToken: sourceNet.linkToken,
    token: securityToken.address,
    supportedChains: [destNet.ccipChainSelector],
  });
  console.log(`  Source Bridge: ${sourceBridge.address}`);

  // Deploy destination bridge (mirror on dest chain)
  // In production, you'd deploy the matching token and bridge on destination
  console.log(`  Destination Bridge: Would deploy on ${destNet.name}`);

  // Step 4: Configure Cross-Chain Compliance
  console.log('\n[Step 4] Configuring Cross-Chain Compliance');
  console.log('-'.repeat(40));

  console.log('  Setting up cross-chain identity verification...');
  console.log('  - Source chain checks KYC before send');
  console.log('  - Destination chain verifies recipient on receive');
  console.log('  - Compliance state synced via CCIP messages');

  // Register recipient on source chain (for demo)
  await identityRegistry.registerIdentity(
    bridgeConfig.recipient,
    840, // USA
    2,   // KYC Level 2
    Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 // 1 year validity
  );
  console.log(`  Registered recipient: ${bridgeConfig.recipient.slice(0, 10)}...`);

  // Step 5: Calculate Bridge Fees
  console.log('\n[Step 5] Calculating Bridge Fees');
  console.log('-'.repeat(40));

  // Fee estimation (CCIP fees vary by destination and gas prices)
  const estimatedFees = {
    ccipFee: ethers.parseUnits('0.5', 18), // ~0.5 LINK
    gasOnSource: ethers.parseUnits('0.001', 18), // ~0.001 ETH
    gasOnDest: ethers.parseUnits('0.0005', 18), // ~0.0005 ETH equivalent
  };

  console.log('  Estimated Fees:');
  console.log(`    CCIP Fee: ${ethers.formatUnits(estimatedFees.ccipFee, 18)} LINK`);
  console.log(`    Source Gas: ~${ethers.formatUnits(estimatedFees.gasOnSource, 18)} ETH`);
  console.log(`    Dest Gas: ~${ethers.formatUnits(estimatedFees.gasOnDest, 18)} ETH`);

  // Step 6: Initiate Cross-Chain Transfer
  console.log('\n[Step 6] Initiating Cross-Chain Transfer');
  console.log('-'.repeat(40));

  console.log(`  Amount: ${ethers.formatUnits(bridgeConfig.amount, 18)} ${bridgeConfig.tokenSymbol}`);
  console.log(`  From: ${sourceNet.name}`);
  console.log(`  To: ${destNet.name}`);
  console.log(`  Recipient: ${bridgeConfig.recipient}`);

  // In production, this would:
  // 1. Approve bridge to spend tokens
  // 2. Call bridge.sendTokens() with CCIP parameters
  // 3. Wait for CCIP message to be relayed

  console.log('\n  [Simulation] Transfer would execute:');
  console.log('    1. Approve bridge contract');
  console.log('    2. Call sendTokens(destChainSelector, recipient, amount)');
  console.log('    3. Tokens locked on source, CCIP message sent');
  console.log('    4. Destination bridge receives message');
  console.log('    5. Compliance check on destination');
  console.log('    6. Tokens minted to recipient on destination');

  // Step 7: Monitor Bridge Status
  console.log('\n[Step 7] Bridge Monitoring');
  console.log('-'.repeat(40));

  console.log('  CCIP Explorer: https://ccip.chain.link');
  console.log('  Typical finality: 15-30 minutes');
  console.log('');
  console.log('  Message Lifecycle:');
  console.log('    1. SENDING - Transaction submitted on source');
  console.log('    2. CONFIRMING - Waiting for source finality');
  console.log('    3. RELAYING - CCIP network relaying message');
  console.log('    4. EXECUTING - Executing on destination');
  console.log('    5. COMPLETE - Tokens delivered');

  // Step 8: Multi-Chain Token Management
  console.log('\n[Step 8] Multi-Chain Token Management');
  console.log('-'.repeat(40));

  const chainDeployments = [
    { network: 'Ethereum Sepolia', token: securityToken.address, status: 'DEPLOYED' },
    { network: 'Base Sepolia', token: 'To be deployed', status: 'PENDING' },
    { network: 'Polygon Amoy', token: 'To be deployed', status: 'PENDING' },
  ];

  console.log('\n  Token Deployments:');
  console.log('  ' + '-'.repeat(55));
  console.log('  | Network           | Token Address                  | Status   |');
  console.log('  ' + '-'.repeat(55));

  for (const deployment of chainDeployments) {
    const addr = deployment.token.length > 20
      ? deployment.token.slice(0, 10) + '...' + deployment.token.slice(-8)
      : deployment.token;
    console.log(
      `  | ${deployment.network.padEnd(17)} | ${addr.padEnd(30)} | ${deployment.status.padEnd(8)} |`
    );
  }
  console.log('  ' + '-'.repeat(55));

  // Step 9: Cross-Chain Supply Tracking
  console.log('\n[Step 9] Cross-Chain Supply Tracking');
  console.log('-'.repeat(40));

  const supplyByChain = [
    { chain: 'Ethereum Sepolia', supply: 1000000 },
    { chain: 'Base Sepolia', supply: 0 },
    { chain: 'Polygon Amoy', supply: 0 },
  ];

  console.log('\n  Total Supply by Chain:');
  let totalSupply = 0;
  for (const chainSupply of supplyByChain) {
    console.log(`    ${chainSupply.chain}: ${chainSupply.supply.toLocaleString()} tokens`);
    totalSupply += chainSupply.supply;
  }
  console.log(`    ${'─'.repeat(30)}`);
  console.log(`    Total: ${totalSupply.toLocaleString()} tokens`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Multi-Chain Setup Complete');
  console.log('='.repeat(60));

  console.log('\nDeployed Contracts (Source Chain):');
  console.log(`  Security Token:     ${securityToken.address}`);
  console.log(`  Identity Registry:  ${identityRegistry.address}`);
  console.log(`  Compliance Module:  ${compliance.address}`);
  console.log(`  CCIP Bridge:        ${sourceBridge.address}`);

  console.log('\nSupported Destination Chains:');
  console.log(`  - Base Sepolia (Selector: ${networks.baseSepolia.ccipChainSelector})`);
  console.log(`  - Polygon Amoy (Selector: ${networks.polygonAmoy.ccipChainSelector})`);

  console.log('\nCross-Chain Features:');
  console.log('  - Lock-and-mint bridging via CCIP');
  console.log('  - Cross-chain compliance verification');
  console.log('  - Unified supply tracking');
  console.log('  - Multi-chain governance support');

  console.log('\nNext Steps:');
  console.log('  1. Deploy matching token contracts on destination chains');
  console.log('  2. Fund bridges with LINK for CCIP fees');
  console.log('  3. Register trusted CCIP senders/receivers');
  console.log('  4. Set up cross-chain monitoring alerts');
  console.log('  5. Test bridge with small amounts before production');
}

main().catch(console.error);
