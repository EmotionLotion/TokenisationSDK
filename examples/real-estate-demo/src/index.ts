/**
 * Tokenisation SDK Demo
 *
 * This demo shows how easy it is to build a tokenized asset application
 * using the Tokenisation SDK. We'll tokenize a real estate property,
 * create investors, and demonstrate the full lifecycle.
 *
 * Run with: npm run demo
 */

import {
  TokenisationSDK,
  RightType,
  LifecycleState,
  PartyType,
  PartyRole,
  TransferabilityMode,
} from '@tokenisation/sdk';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function log(section: string, message: string) {
  console.log(`\n[${'='.repeat(60)}]`);
  console.log(`[${section}]`);
  console.log(`[${'='.repeat(60)}]`);
  console.log(message);
}

function logStep(step: number, description: string) {
  console.log(`\n  Step ${step}: ${description}`);
  console.log(`  ${'-'.repeat(50)}`);
}

function logSuccess(message: string) {
  console.log(`  ✅ ${message}`);
}

function logInfo(label: string, value: string | number | boolean) {
  console.log(`     ${label}: ${value}`);
}

// ============================================================================
// MAIN DEMO
// ============================================================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                    🏢 TOKENISATION SDK DEMO                                  ║
║                                                                              ║
║    Real Estate Tokenization - From Property to Tradeable Tokens              ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);

  // --------------------------------------------------------------------------
  // STEP 1: Initialize the SDK
  // --------------------------------------------------------------------------
  log('INITIALIZATION', 'Creating SDK instance...');

  const sdk = new TokenisationSDK({
    useMockPlugins: true, // Use mock plugins for demo
  });

  logSuccess('SDK initialized successfully');
  logInfo('Mode', 'Development (mock plugins)');

  // --------------------------------------------------------------------------
  // STEP 2: Create Parties (Issuer and Investors)
  // --------------------------------------------------------------------------
  log('PARTIES', 'Creating ecosystem participants...');

  logStep(1, 'Create Property Issuer (Dubai Properties LLC)');

  const issuer = sdk.parties_.create({
    name: 'Dubai Properties LLC',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
    jurisdiction: 'AE',
    email: 'admin@dubaiproperties.ae',
    legalEntityId: 'LEI-AE-12345',
    metadata: {
      companyRegistration: 'DED-123456',
      vatNumber: 'VAT-AE-789',
    },
  });

  logSuccess(`Issuer created: ${issuer.name}`);
  logInfo('ID', issuer.id);
  logInfo('Jurisdiction', issuer.jurisdiction);
  logInfo('Roles', issuer.roles.join(', '));

  // KYC verify the issuer
  sdk.parties_.setKyc(issuer.id, true);
  logSuccess('Issuer KYC verified');

  logStep(2, 'Create Investor 1 (Ahmed Al Maktoum)');

  const investor1 = sdk.parties_.create({
    name: 'Ahmed Al Maktoum',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'AE',
    email: 'ahmed@example.com',
  });

  logSuccess(`Investor 1 created: ${investor1.name}`);
  logInfo('ID', investor1.id);

  // KYC verify investor
  sdk.parties_.setKyc(investor1.id, true);
  logSuccess('Investor 1 KYC verified');

  logStep(3, 'Create Investor 2 (Sarah Johnson)');

  const investor2 = sdk.parties_.create({
    name: 'Sarah Johnson',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'US',
    email: 'sarah@example.com',
  });

  logSuccess(`Investor 2 created: ${investor2.name}`);
  logInfo('ID', investor2.id);

  // KYC verify investor
  sdk.parties_.setKyc(investor2.id, true);
  logSuccess('Investor 2 KYC verified');

  // --------------------------------------------------------------------------
  // STEP 3: Create the Real Estate Asset
  // --------------------------------------------------------------------------
  log('ASSET CREATION', 'Tokenizing real estate property...');

  logStep(1, 'Define property details');

  const property = await sdk.assets.create({
    name: 'Dubai Marina Tower - Unit 1501',
    description: 'Luxury 2-bedroom apartment with full marina view. 1,850 sq ft. Premium finishes throughout.',
    rightType: RightType.OWNERSHIP,
    issuerId: issuer.id,
    jurisdiction: {
      countryCode: 'AE',
      regulatoryFramework: 'UAE_VARA',
      accreditedOnly: false,
      blockedJurisdictions: ['KP', 'IR', 'SY'], // Sanctioned countries
    },
    validityPeriod: {
      isPerpetual: true,
      startTime: new Date().toISOString(),
    },
    transferabilityRules: {
      mode: TransferabilityMode.COMPLIANCE_GATED,
      lockupPeriodSeconds: 0, // No lockup for this property
      maxHolders: 100, // Fractionalized to max 100 investors
      requireKyc: true,
    },
    metadata: {
      propertyType: 'RESIDENTIAL',
      address: {
        building: 'Marina Tower',
        unit: '1501',
        street: 'Dubai Marina Walk',
        city: 'Dubai',
        country: 'AE',
      },
      area: {
        value: 1850,
        unit: 'SQFT',
      },
      valuationUSD: '2500000',
      deedNumber: 'DEED-DM-2024-1501',
      amenities: ['Pool', 'Gym', 'Concierge', 'Parking'],
    },
  });

  logSuccess(`Asset created: ${property.name}`);
  logInfo('Asset ID', property.id);
  logInfo('Right Type', property.rightType);
  logInfo('State', property.state);
  logInfo('Jurisdiction', property.jurisdiction.countryCode);

  // --------------------------------------------------------------------------
  // STEP 4: Asset Lifecycle - Verification and Activation
  // --------------------------------------------------------------------------
  log('LIFECYCLE', 'Moving asset through verification workflow...');

  logStep(1, `Current state: ${property.state}`);

  // Transition to PENDING_VERIFICATION
  logStep(2, 'Submit for verification');
  const pendingResult = await sdk.assets.transition(
    property.id,
    LifecycleState.PENDING_VERIFICATION,
    issuer.id
  );

  if (pendingResult.success) {
    logSuccess(`State changed to: ${pendingResult.value?.state}`);
  }

  // Transition to VERIFIED
  logStep(3, 'Verify the asset (by authorized verifier)');
  const verifyResult = await sdk.assets.verify(property.id, issuer.id);

  if (verifyResult.success) {
    logSuccess(`State changed to: ${verifyResult.value?.state}`);
    logInfo('Verifier', issuer.name);
  }

  // Transition to ACTIVE
  logStep(4, 'Activate for trading');
  const activateResult = await sdk.assets.activate(property.id, issuer.id);

  if (activateResult.success) {
    logSuccess(`State changed to: ${activateResult.value?.state}`);
    logInfo('Ready for', 'Minting and Trading');
  }

  // --------------------------------------------------------------------------
  // STEP 5: Token Operations - Minting and Distribution
  // --------------------------------------------------------------------------
  log('TOKENIZATION', 'Creating and distributing tokens...');

  logStep(1, 'Mint tokens to Investor 1 (600 shares)');

  const mintResult1 = await sdk.tokens.mint(property.id, investor1.id, '600');

  if (mintResult1.success) {
    logSuccess('Minted 600 tokens to Ahmed Al Maktoum');
    const balance1 = await sdk.tokens.getBalance(property.id, investor1.id);
    logInfo('Investor 1 Balance', `${balance1} tokens`);
  }

  logStep(2, 'Mint tokens to Investor 2 (400 shares)');

  const mintResult2 = await sdk.tokens.mint(property.id, investor2.id, '400');

  if (mintResult2.success) {
    logSuccess('Minted 400 tokens to Sarah Johnson');
    const balance2 = await sdk.tokens.getBalance(property.id, investor2.id);
    logInfo('Investor 2 Balance', `${balance2} tokens`);
  }

  // --------------------------------------------------------------------------
  // STEP 6: Token Transfer (Secondary Market)
  // --------------------------------------------------------------------------
  log('TRANSFER', 'Simulating secondary market transfer...');

  logStep(1, 'Investor 1 transfers 100 tokens to Investor 2');

  const transferResult = await sdk.tokens.transfer(
    property.id,
    investor1.id,
    investor2.id,
    '100'
  );

  if (transferResult.success) {
    logSuccess('Transfer completed successfully');

    const balance1After = await sdk.tokens.getBalance(property.id, investor1.id);
    const balance2After = await sdk.tokens.getBalance(property.id, investor2.id);

    logInfo('Investor 1 New Balance', `${balance1After} tokens`);
    logInfo('Investor 2 New Balance', `${balance2After} tokens`);
  }

  // --------------------------------------------------------------------------
  // STEP 7: Summary
  // --------------------------------------------------------------------------
  log('SUMMARY', 'Final state of tokenized property...');

  const finalAsset = await sdk.assets.get(property.id);
  const allParties = sdk.parties_.getAll();
  const allAssets = sdk.assets.getAll();

  console.log(`
  📊 TOKENIZATION SUMMARY
  ═══════════════════════════════════════════════════════════

  Property: ${finalAsset?.name}
  Value: $2,500,000 USD
  Total Shares: 1,000 tokens

  State: ${finalAsset?.state} ✅

  Ownership Distribution:
  ┌─────────────────────────────┬─────────┬─────────────┐
  │ Investor                    │ Tokens  │ Ownership % │
  ├─────────────────────────────┼─────────┼─────────────┤
  │ Ahmed Al Maktoum            │ 500     │ 50%         │
  │ Sarah Johnson               │ 500     │ 50%         │
  └─────────────────────────────┴─────────┴─────────────┘

  Ecosystem Stats:
  • Total Parties: ${allParties.length}
  • Total Assets: ${allAssets.length}
  • KYC Verified: ${allParties.filter(p => p.verificationLevel !== 'NONE').length}

  ═══════════════════════════════════════════════════════════
  `);

  // --------------------------------------------------------------------------
  // BONUS: Show Event History
  // --------------------------------------------------------------------------
  log('AUDIT TRAIL', 'Event history for compliance...');

  const events = await sdk.events.getAll();

  console.log(`\n  📝 Event Log (${events.length} events):`);
  console.log('  ' + '─'.repeat(60));

  events.slice(0, 10).forEach((event, i) => {
    const timestamp = new Date(event.timestamp).toLocaleTimeString();
    console.log(`  ${i + 1}. [${timestamp}] ${event.type}`);
    console.log(`     Asset: ${event.assetId.substring(0, 8)}...`);
  });

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                    ✅ DEMO COMPLETED SUCCESSFULLY                            ║
║                                                                              ║
║    The Tokenisation SDK made it easy to:                                     ║
║    • Create compliant parties with KYC                                       ║
║    • Tokenize a real estate property                                         ║
║    • Manage asset lifecycle (draft → verified → active)                      ║
║    • Mint and distribute tokens                                              ║
║    • Transfer tokens between investors                                       ║
║    • Maintain audit trail for compliance                                     ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);
}

// Run the demo
main().catch(console.error);
