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

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  SUMMARY: Carbon Credits                                                     ║
║  ─────────────────────────────────────────────────────────────────────────   ║
║  • RightType: VERIFICATION (proof of carbon offset)                          ║
║  • Transferability: UNRESTRICTED (freely tradeable)                          ║
║  • Retirement: Burn tokens to claim carbon offset                            ║
║  • Use Cases: Corporate sustainability, ESG compliance, trading              ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);
}

main().catch(console.error);
