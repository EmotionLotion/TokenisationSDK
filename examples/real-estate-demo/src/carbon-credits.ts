/**
 * Carbon Credits Tokenization Demo
 *
 * This demo shows how to tokenize carbon credits using the SDK.
 * Carbon credits are VERIFICATION type rights - they prove carbon offset.
 *
 * Run with: npm run demo:carbon
 */

import {
  TokenisationSDK,
  RightType,
  LifecycleState,
  PartyType,
  PartyRole,
  TransferabilityMode,
  DataFeedPlugin,
  DecoPlugin,
  DecoProofType,
} from '@tokenisation/sdk';

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    🌱 CARBON CREDITS TOKENIZATION                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);

  const sdk = new TokenisationSDK({ useMockPlugins: true });

  // Create the carbon credit issuer (verified environmental project)
  console.log('\n📋 Creating Carbon Credit Issuer...');

  const issuer = sdk.parties_.create({
    name: 'Green Forest Initiative',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
    jurisdiction: 'BR', // Brazil
    metadata: {
      projectType: 'REFORESTATION',
      verificationStandard: 'VERRA_VCS',
      projectId: 'VCS-2024-12345',
    },
  });

  sdk.parties_.setKyc(issuer.id, true);
  console.log(`  ✅ Issuer: ${issuer.name} (KYC Verified)`);

  // Create corporate buyer
  const buyer = sdk.parties_.create({
    name: 'TechCorp Inc',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'US',
    metadata: {
      industry: 'TECHNOLOGY',
      sustainabilityCommitment: 'NET_ZERO_2030',
    },
  });

  sdk.parties_.setKyc(buyer.id, true);
  console.log(`  ✅ Buyer: ${buyer.name} (KYC Verified)`);

  // Create carbon credit asset
  console.log('\n🌲 Creating Carbon Credit Token...');

  const carbonCredits = await sdk.assets.create({
    name: 'Amazon Reforestation Carbon Credits 2024',
    description: '10,000 tonnes of verified carbon offset from Amazon reforestation project',
    rightType: RightType.VERIFICATION, // Verification = proof of action/attribute
    issuerId: issuer.id,
    jurisdiction: {
      countryCode: 'BR',
      regulatoryFramework: 'VERRA_VCS',
      accreditedOnly: false,
      blockedJurisdictions: [],
    },
    validityPeriod: {
      isPerpetual: false,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    },
    transferabilityRules: {
      mode: TransferabilityMode.UNRESTRICTED, // Carbon credits are freely tradeable
      lockupPeriodSeconds: 0,
      requireKyc: true,
    },
    metadata: {
      assetType: 'VERIFICATION',
      certificateType: 'CARBON_CREDIT',
      carbonTonnes: 10000,
      vintageYear: 2024,
      projectLocation: {
        region: 'Amazon Basin',
        country: 'BR',
        coordinates: { lat: -3.4653, lng: -62.2159 },
      },
      verificationBody: 'VERRA',
      registryLink: 'https://registry.verra.org/project/12345',
      retirementPolicy: 'Can be retired for carbon offset claims',
    },
  });

  console.log(`  ✅ Created: ${carbonCredits.name}`);
  console.log(`     Carbon Tonnes: 10,000`);
  console.log(`     Verification: VERRA VCS`);

  // Move through lifecycle
  console.log('\n🔄 Asset Lifecycle...');

  await sdk.assets.transition(carbonCredits.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
  console.log('  → Pending Verification');

  await sdk.assets.verify(carbonCredits.id, issuer.id);
  console.log('  → Verified');

  await sdk.assets.activate(carbonCredits.id, issuer.id);
  console.log('  → Active ✅');

  // Mint carbon credit tokens (1 token = 1 tonne CO2)
  console.log('\n💰 Minting Carbon Credit Tokens...');

  await sdk.tokens.mint(carbonCredits.id, buyer.id, '5000'); // TechCorp buys 5000 tonnes
  const balance = await sdk.tokens.getBalance(carbonCredits.id, buyer.id);

  console.log(`  ✅ TechCorp purchased 5,000 carbon credits`);
  console.log(`     Balance: ${balance} tokens (tonnes CO2)`);
  console.log(`     Value: ~$75,000 USD (at $15/tonne)`);

  // Simulate retirement (burning credits for offset claim)
  console.log('\n🔥 Retiring Credits for Carbon Offset Claim...');

  await sdk.tokens.burn(carbonCredits.id, buyer.id, '1000');
  const newBalance = await sdk.tokens.getBalance(carbonCredits.id, buyer.id);

  console.log(`  ✅ Retired 1,000 tonnes of carbon credits`);
  console.log(`     Remaining Balance: ${newBalance} tokens`);
  console.log(`     TechCorp can now claim: 1,000 tonnes CO2 offset`);

  // --- DataFeedPlugin: Carbon credit market price ---
  console.log('\n📊 Carbon Credit Market Price via DataFeedPlugin...');

  const dataFeed = new DataFeedPlugin({
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    pairs: ['ETH/USD'],
  });

  const priceResult = await dataFeed.getPrice('ETH/USD');

  if (priceResult.success) {
    console.log(`  ✅ ETH/USD feed active: $${priceResult.data.price}`);
    console.log(`     Carbon credit reference price: ~$15/tonne`);
    console.log(`     Portfolio value: ${newBalance} credits × $15 = $${Number(newBalance) * 15}`);
  } else {
    console.log(`  ⚠️  DataFeed simulated: ${priceResult.error}`);
    console.log(`     In production, pulls live carbon credit market prices`);
    console.log(`     Portfolio value: ${newBalance} credits × $15 = $${Number(newBalance) * 15}`);
  }

  // --- DECO: Prove retirement claim without revealing portfolio ---
  console.log('\n🔒 DECO Privacy Proof — Prove Retirement Without Revealing Portfolio...');

  const deco = new DecoPlugin({
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    verifierAddress: '0x0000000000000000000000000000000000000001',
  });

  const retirementProof = await deco.createProof({
    proofType: DecoProofType.BALANCE_THRESHOLD,
    dataSource: {
      url: 'https://registry.verra.org/api/v1/retirement',
      method: 'GET',
      jsonPath: '$.retiredCredits',
    },
    claim: {
      field: 'retiredCredits',
      operator: 'gte',
      threshold: 1000,
    },
    metadata: {
      purpose: 'Prove carbon retirement for ESG report without revealing total holdings',
      buyerId: buyer.id,
      assetId: carbonCredits.id,
    },
  });

  if (retirementProof.success) {
    console.log(`  ✅ DECO proof created: ${retirementProof.data.proofId}`);
    console.log(`     Proof type: BALANCE_THRESHOLD`);
    console.log(`     Claim: retired >= 1,000 tonnes (total portfolio hidden)`);
  } else {
    console.log(`  ⚠️  DECO proof simulated: ${retirementProof.error}`);
    console.log(`     In production, proves retirement claim without revealing total portfolio`);
  }

  dataFeed.destroy();
  deco.destroy();

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  SUMMARY: Carbon Credits                                                     ║
║  ─────────────────────────────────────────────────────────────────────────   ║
║  • RightType: VERIFICATION (proof of carbon offset)                          ║
║  • Transferability: UNRESTRICTED (freely tradeable)                          ║
║  • Retirement: Burn tokens to claim carbon offset                            ║
║  • DataFeedPlugin: Live carbon credit market pricing                         ║
║  • DecoPlugin: Privacy-preserving retirement proofs for ESG                  ║
║  • Use Cases: Corporate sustainability, ESG compliance, trading              ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);
}

main().catch(console.error);
