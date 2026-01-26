/**
 * Loyalty Points Tokenization Demo (AHOY-style)
 *
 * This demo shows how to create a cross-ecosystem loyalty token
 * similar to the AHOY Platform - where multiple services share
 * a unified rewards currency.
 *
 * Run with: npm run demo:loyalty
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
║                    🎯 UNIFIED LOYALTY POINTS (AHOY-STYLE)                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);

  const sdk = new TokenisationSDK({ useMockPlugins: true });

  // --------------------------------------------------------------------------
  // STEP 1: Create the Ecosystem Parties
  // --------------------------------------------------------------------------
  console.log('\n📋 Creating Ecosystem Participants...\n');

  // Platform Operator (issues the loyalty token)
  const platform = sdk.parties_.create({
    name: 'AHOY Platform',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.OPERATOR],
    jurisdiction: 'AE',
    metadata: { platformType: 'UNIFIED_LOYALTY' },
  });
  sdk.parties_.setKyc(platform.id, true);
  console.log(`  ✅ Platform: ${platform.name}`);

  // Ecosystem Services (earn/burn partners)
  const comet = sdk.parties_.create({
    name: 'COMET Logistics',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.OPERATOR],
    jurisdiction: 'AE',
    metadata: { service: 'DELIVERY_LOGISTICS' },
  });
  sdk.parties_.setKyc(comet.id, true);
  console.log(`  ✅ Service: ${comet.name} (Logistics)`);

  const flyplus = sdk.parties_.create({
    name: 'FlyPlus Aviation',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.OPERATOR],
    jurisdiction: 'AE',
    metadata: { service: 'AVIATION_REWARDS' },
  });
  sdk.parties_.setKyc(flyplus.id, true);
  console.log(`  ✅ Service: ${flyplus.name} (Aviation)`);

  // End User
  const user = sdk.parties_.create({
    name: 'Ali Hassan',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'AE',
    email: 'ali@example.com',
    metadata: {
      loyaltyTier: 'SILVER',
      joinDate: '2024-01-15',
    },
  });
  sdk.parties_.setKyc(user.id, true);
  console.log(`  ✅ User: ${user.name}`);

  // --------------------------------------------------------------------------
  // STEP 2: Create the Unified Loyalty Token
  // --------------------------------------------------------------------------
  console.log('\n🪙 Creating AHOY Loyalty Token...\n');

  const ahoyToken = await sdk.assets.create({
    name: 'AHOY Points',
    description: 'Unified loyalty points across the AHOY ecosystem. Earn from any service, spend anywhere.',
    rightType: RightType.BEHAVIOR, // Behavior = loyalty/reputation/scores
    issuerId: platform.id,
    jurisdiction: {
      countryCode: 'AE',
      regulatoryFramework: 'UAE_LOYALTY',
      accreditedOnly: false,
      blockedJurisdictions: [],
    },
    validityPeriod: {
      isPerpetual: true,
      startTime: new Date().toISOString(),
    },
    transferabilityRules: {
      mode: TransferabilityMode.WHITELIST_ONLY, // Only transfer to approved addresses
      lockupPeriodSeconds: 0,
      requireKyc: true,
    },
    metadata: {
      assetType: 'BEHAVIOR',
      scoreType: 'LOYALTY_POINTS',
      tokenSymbol: 'AHOY',
      conversionRate: {
        AED: 0.01, // 100 AHOY = 1 AED value
        USD: 0.0027,
      },
      tierThresholds: {
        BRONZE: 0,
        SILVER: 5000,
        GOLD: 15000,
        PLATINUM: 50000,
        DIAMOND: 100000,
      },
      earnRates: {
        DELIVERY: 10, // 10 points per delivery
        FLIGHT_BOOKING: 50,
        LOUNGE_CHECKIN: 25,
        REFERRAL: 200,
      },
      burnRates: {
        FLIGHT_DISCOUNT: 500, // 500 points = discount
        PRIORITY_QUEUE: 200,
        LOUNGE_ACCESS: 1000,
      },
    },
  });

  console.log(`  ✅ Token Created: ${ahoyToken.name}`);
  console.log(`     Type: ${ahoyToken.rightType}`);
  console.log(`     Transferability: Whitelist Only`);

  // Activate the token
  await sdk.assets.transition(ahoyToken.id, LifecycleState.PENDING_VERIFICATION, platform.id);
  await sdk.assets.verify(ahoyToken.id, platform.id);
  await sdk.assets.activate(ahoyToken.id, platform.id);
  console.log(`     Status: ACTIVE ✅`);

  // --------------------------------------------------------------------------
  // STEP 3: Simulate Earning Points
  // --------------------------------------------------------------------------
  console.log('\n📈 Simulating Points Earning...\n');

  console.log('  🚚 COMET: Ali completes 10 deliveries');
  await sdk.tokens.mint(ahoyToken.id, user.id, '100'); // 10 deliveries × 10 points
  let balance = await sdk.tokens.getBalance(ahoyToken.id, user.id);
  console.log(`     +100 AHOY | Balance: ${balance}`);

  console.log('\n  ✈️  FlyPlus: Ali books a flight');
  await sdk.tokens.mint(ahoyToken.id, user.id, '50');
  balance = await sdk.tokens.getBalance(ahoyToken.id, user.id);
  console.log(`     +50 AHOY | Balance: ${balance}`);

  console.log('\n  🎫 FlyPlus: Ali uses lounge');
  await sdk.tokens.mint(ahoyToken.id, user.id, '25');
  balance = await sdk.tokens.getBalance(ahoyToken.id, user.id);
  console.log(`     +25 AHOY | Balance: ${balance}`);

  console.log('\n  👥 Platform: Ali refers a friend');
  await sdk.tokens.mint(ahoyToken.id, user.id, '200');
  balance = await sdk.tokens.getBalance(ahoyToken.id, user.id);
  console.log(`     +200 AHOY | Balance: ${balance}`);

  // --------------------------------------------------------------------------
  // STEP 4: Simulate Burning Points (Redemptions)
  // --------------------------------------------------------------------------
  console.log('\n📉 Simulating Points Redemption...\n');

  console.log('  ⏩ Priority Queue: Ali uses points for priority');
  await sdk.tokens.burn(ahoyToken.id, user.id, '200');
  balance = await sdk.tokens.getBalance(ahoyToken.id, user.id);
  console.log(`     -200 AHOY | Balance: ${balance}`);

  // --------------------------------------------------------------------------
  // STEP 5: Summary Dashboard
  // --------------------------------------------------------------------------

  const finalBalance = await sdk.tokens.getBalance(ahoyToken.id, user.id);

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                         ALI'S AHOY DASHBOARD                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║    💰 AHOY Balance: ${finalBalance.padStart(6)} points                                    ║
║    🏆 Tier: SILVER                                                           ║
║    📊 Next Tier (GOLD): 15,000 points                                        ║
║                                                                              ║
║    ─────────────────────────────────────────────────────────────────────     ║
║                                                                              ║
║    RECENT ACTIVITY:                                                          ║
║    ├─ 🚚 Deliveries (COMET)      +100 AHOY                                   ║
║    ├─ ✈️  Flight Booking (FlyPlus) +50 AHOY                                   ║
║    ├─ 🎫 Lounge Check-in         +25 AHOY                                    ║
║    ├─ 👥 Friend Referral         +200 AHOY                                   ║
║    └─ ⏩ Priority Queue          -200 AHOY                                   ║
║                                                                              ║
║    ─────────────────────────────────────────────────────────────────────     ║
║                                                                              ║
║    ECOSYSTEM SERVICES:                                                       ║
║    ┌────────────┬────────────────────────────────────────────────┐          ║
║    │ COMET      │ Earn points on deliveries, logistics           │          ║
║    │ FlyPlus    │ Earn on flights, redeem for upgrades           │          ║
║    │ H2O        │ Earn on water savings, carbon offsets          │          ║
║    │ AMS        │ Earn on data contributions                     │          ║
║    │ Nexus      │ Earn on AI agent tasks                         │          ║
║    │ Connect    │ Earn on referrals, social engagement           │          ║
║    └────────────┴────────────────────────────────────────────────┘          ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

  KEY CONCEPTS DEMONSTRATED:
  ═══════════════════════════════════════════════════════════

  • RightType: BEHAVIOR (loyalty/reputation tokens)
  • Multi-service ecosystem with unified token
  • Points are MINTED when earned (from services)
  • Points are BURNED when redeemed (for benefits)
  • Whitelist transferability (prevents black market)
  • Tier system based on balance thresholds

  This is exactly how the AHOY Platform works!

  `);
}

main().catch(console.error);
