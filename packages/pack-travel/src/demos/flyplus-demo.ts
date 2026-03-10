#!/usr/bin/env node
// @ts-nocheck — Kept on disk for future use; barrel export removed during RE+Compute pruning.
/**
 * Fly+ Pass Demo
 *
 * Demonstrates the full Fly+ Pass tokenization flow:
 * 1. Create tiered passes (BASIC, PREMIUM, VIP)
 * 2. Use services (check-in, luggage, fast-track)
 * 3. Transfer pass on secondary market
 * 4. Earn $AHOY points
 *
 * NOTE: Ahoy module lives in @tokenisation/core internal paths.
 * This demo will be updated once @tokenisation/pack-loyalty is available.
 */

import { TokenisationSDK } from '@tokenisation/core';
// TODO: migrate to @tokenisation/pack-loyalty once available
import {
  FlyPlusPassPack,
  createFlyPlusPass,
  AhoyTokenPack,
  DEFAULT_AHOY_TOKEN_CONFIG,
  FlyPlusTier,
  AhoyActionType,
} from '@tokenisation/core/ahoy/index.js';

async function runFlyPlusDemo() {
  console.log('\n' + '='.repeat(60));
  console.log('AHOY FLY+ PASS TOKENIZATION DEMO');
  console.log('='.repeat(60) + '\n');

  const sdk = new TokenisationSDK();

  // ============================================================================
  // STEP 1: Initialize $AHOY Token (for rewards)
  // ============================================================================
  console.log('Step 1: Initializing $AHOY Token Ecosystem...\n');

  const ahoyTokenPack = new AhoyTokenPack(sdk, DEFAULT_AHOY_TOKEN_CONFIG);
  const tokenResult = await ahoyTokenPack.initialize();

  console.log('   $AHOY Token Created');
  console.log(`   Asset ID: ${tokenResult.tokenAssetId.slice(0, 8)}...`);
  console.log(`   Total Supply: 1,000,000,000 AHOY`);
  console.log(`   Distribution:`);
  console.log(`     - Rewards Pool: 40%`);
  console.log(`     - Operations: 20%`);
  console.log(`     - Team (Vested): 15%`);
  console.log(`     - Treasury: 25%`);

  // ============================================================================
  // STEP 2: Create VIP Pass for a Traveler
  // ============================================================================
  console.log('\n' + '-'.repeat(60));
  console.log('Step 2: Creating VIP Pass for Premium Traveler...\n');

  const vipPack = new FlyPlusPassPack(sdk, {
    holderName: 'Sheikh Mohammed Al Rashid',
    holderEmail: 'mohammed.rashid@vip.ae',
    tier: FlyPlusTier.VIP,
    validityDays: 365,
    transferable: true,
    paymentRef: 'STRIPE_VIP_001',
  });

  const vipResult = await vipPack.execute();

  console.log('   VIP Pass Created');
  console.log(`   Pass ID: ${vipResult.passAssetId.slice(0, 8)}...`);
  console.log(`   Holder: ${vipResult.passData.tier} Member`);
  console.log(`   Valid Until: ${new Date(vipResult.passData.validUntil).toLocaleDateString()}`);
  console.log(`   Features:`);
  console.log(`     - Remote Check-in`);
  console.log(`     - Door-to-Door Luggage`);
  console.log(`     - Fast-Track Security`);
  console.log(`     - Lounge Access (ELITE only)`);
  console.log(`     - Priority Support`);

  // ============================================================================
  // STEP 3: Create PREMIUM Pass for Business Traveler
  // ============================================================================
  console.log('\n' + '-'.repeat(60));
  console.log('Step 3: Creating PREMIUM Pass for Business Traveler...\n');

  const premiumPack = new FlyPlusPassPack(sdk, {
    holderName: 'Sarah Chen',
    holderEmail: 'sarah.chen@business.com',
    tier: FlyPlusTier.PREMIUM,
    validityDays: 180,
    transferable: true,
    paymentRef: 'STRIPE_PREMIUM_002',
  });

  const premiumResult = await premiumPack.execute();

  console.log('   PREMIUM Pass Created');
  console.log(`   Pass ID: ${premiumResult.passAssetId.slice(0, 8)}...`);
  console.log(`   Holder: Sarah Chen`);
  console.log(`   Tier: ${premiumResult.passData.tier}`);
  console.log(`   Features:`);
  console.log(`     - Remote Check-in`);
  console.log(`     - Door-to-Door Luggage`);
  console.log(`     - Fast-Track Security`);
  console.log(`     - Lounge Access (VIP only)`);

  // ============================================================================
  // STEP 4: Create BASIC Pass for Casual Traveler
  // ============================================================================
  console.log('\n' + '-'.repeat(60));
  console.log('Step 4: Creating BASIC Pass for Casual Traveler...\n');

  const basicPack = new FlyPlusPassPack(sdk, {
    holderName: 'John Smith',
    holderEmail: 'john.smith@email.com',
    tier: FlyPlusTier.BASIC,
    validityDays: 30,
    transferable: false, // Basic passes are non-transferable
    maxUsage: 5,
  });

  const basicResult = await basicPack.execute();

  console.log('   BASIC Pass Created');
  console.log(`   Pass ID: ${basicResult.passAssetId.slice(0, 8)}...`);
  console.log(`   Holder: John Smith`);
  console.log(`   Tier: ${basicResult.passData.tier}`);
  console.log(`   Max Usage: 5 times`);
  console.log(`   Transferable: No`);
  console.log(`   Features:`);
  console.log(`     - Remote Check-in`);
  console.log(`     - Door-to-Door Luggage (not available)`);
  console.log(`     - Fast-Track Security (not available)`);

  // ============================================================================
  // STEP 5: Create ELITE Pass (highest tier with all features)
  // ============================================================================
  console.log('\n' + '-'.repeat(60));
  console.log('Step 5: Creating ELITE Pass for Ultra Premium Traveler...\n');

  const elitePack = new FlyPlusPassPack(sdk, {
    holderName: 'Crown Prince Hamdan',
    holderEmail: 'fazza@royals.ae',
    tier: FlyPlusTier.ELITE,
    validityDays: 365,
    transferable: true,
    paymentRef: 'STRIPE_ELITE_003',
  });

  const eliteResult = await elitePack.execute();

  console.log('   ELITE Pass Created');
  console.log(`   Pass ID: ${eliteResult.passAssetId.slice(0, 8)}...`);
  console.log(`   Holder: Crown Prince Hamdan`);
  console.log(`   Tier: ELITE (Highest)`);
  console.log(`   Features: ALL INCLUDED`);
  console.log(`     - Remote Check-in`);
  console.log(`     - Door-to-Door Luggage`);
  console.log(`     - Fast-Track Security`);
  console.log(`     - Lounge Access`);
  console.log(`     - Priority Support`);

  // ============================================================================
  // STEP 6: ELITE Member Uses ALL Services
  // ============================================================================
  console.log('\n' + '-'.repeat(60));
  console.log('Step 6: ELITE Member Uses All Services...\n');

  // Use Remote Check-in
  const checkinResult = await elitePack.usePass(eliteResult.passAssetId, 'CHECK_IN');
  console.log(`   Remote Check-in: ${checkinResult.success ? 'Success' : 'Failed'}`);
  if (checkinResult.success) {
    console.log(`      Points Earned: +${checkinResult.pointsEarned} AHOY`);
  }

  // Use Door-to-Door Luggage
  const luggageResult = await elitePack.usePass(eliteResult.passAssetId, 'LUGGAGE');
  console.log(`   Door-to-Door Luggage: ${luggageResult.success ? 'Success' : 'Failed'}`);
  if (luggageResult.success) {
    console.log(`      Points Earned: +${luggageResult.pointsEarned} AHOY`);
  }

  // Use Fast-Track Security
  const fastTrackResult = await elitePack.usePass(eliteResult.passAssetId, 'FAST_TRACK');
  console.log(`   Fast-Track Security: ${fastTrackResult.success ? 'Success' : 'Failed'}`);
  if (fastTrackResult.success) {
    console.log(`      Points Earned: +${fastTrackResult.pointsEarned} AHOY`);
  }

  // Use Lounge Access (ELITE only!)
  const loungeResult = await elitePack.usePass(eliteResult.passAssetId, 'LOUNGE');
  console.log(`   Lounge Access: ${loungeResult.success ? 'Success' : 'Failed'}`);
  if (loungeResult.success) {
    console.log(`      Points Earned: +${loungeResult.pointsEarned} AHOY`);
  }

  const totalPointsEarned = checkinResult.pointsEarned + luggageResult.pointsEarned +
                           fastTrackResult.pointsEarned + loungeResult.pointsEarned;
  console.log(`\n   Total Points Earned This Trip: ${totalPointsEarned} AHOY`);

  // ============================================================================
  // STEP 7: Basic User Tries ELITE Service (Should Fail)
  // ============================================================================
  console.log('\n' + '-'.repeat(60));
  console.log('Step 7: Basic Member Tries ELITE-Only Service...\n');

  const loungeAttempt = await basicPack.usePass(basicResult.passAssetId, 'LOUNGE');
  console.log(`   Lounge Access Attempt: ${loungeAttempt.success ? 'Success' : 'Denied'}`);
  console.log(`      Reason: ${loungeAttempt.message}`);

  // ============================================================================
  // STEP 8: Secondary Market Transfer
  // ============================================================================
  console.log('\n' + '-'.repeat(60));
  console.log('Step 8: Secondary Market - Transfer VIP Pass...\n');

  // Create a buyer
  const buyer = sdk.parties_.create({
    type: 'INDIVIDUAL' as any,
    roles: ['INVESTOR' as any],
    name: 'Elena Rodriguez',
    jurisdiction: 'AE',
  });
  sdk.parties_.setKyc(buyer.id, true);

  console.log('   Buyer: Elena Rodriguez');
  console.log('   KYC Status: Verified');
  console.log('   Secondary Sale Price: $2,500 (with 5% royalty to Ahoy)');

  const transferResult = await vipPack.transferPass(
    vipResult.passAssetId,
    vipResult.holderId,
    buyer.id
  );

  if (transferResult.success) {
    console.log('   Transfer Successful!');
    console.log(`      From: Sheikh Mohammed Al Rashid`);
    console.log(`      To: Elena Rodriguez`);
    console.log(`      Ahoy Royalty (5%): $125`);
  } else {
    console.log(`   Transfer Failed: ${transferResult.error}`);
  }

  // Try to transfer non-transferable BASIC pass
  console.log('\n   Attempting to transfer non-transferable BASIC pass...');
  const basicTransferResult = await basicPack.transferPass(
    basicResult.passAssetId,
    basicResult.holderId,
    buyer.id
  );
  console.log(`   Result: ${basicTransferResult.success ? 'Success' : 'Blocked'}`);
  if (!basicTransferResult.success) {
    console.log(`   Reason: ${basicTransferResult.error}`);
  }

  // ============================================================================
  // STEP 9: Award Bonus Points
  // ============================================================================
  console.log('\n' + '-'.repeat(60));
  console.log('Step 9: Awarding Bonus $AHOY Points...\n');

  // Award off-peak booking bonus
  await ahoyTokenPack.rewardUser({
    userId: premiumResult.holderId,
    action: AhoyActionType.OFF_PEAK_BOOKING,
    source: 'FLYPLUS',
    referenceId: 'BOOKING_12345',
  });
  console.log('   Sarah Chen earned 50 AHOY for off-peak booking');

  // Award eco-friendly drop-off bonus
  await ahoyTokenPack.rewardUser({
    userId: premiumResult.holderId,
    action: AhoyActionType.ECO_FRIENDLY_DROPOFF,
    source: 'FLYPLUS',
    referenceId: 'DROPOFF_67890',
  });
  console.log('   Sarah Chen earned 20 AHOY for eco-friendly drop-off');

  // Get balance
  const sarahBalance = await ahoyTokenPack.getBalance(premiumResult.holderId);
  console.log(`\n   Sarah's Total $AHOY Balance: ${sarahBalance}`);

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('DEMO SUMMARY');
  console.log('='.repeat(60) + '\n');

  const allAssets = sdk.assets.getAll();
  const flyPlusPasses = allAssets.filter(a =>
    (a.typedMetadata as any)?.assetType === 'FLYPLUS_PASS'
  );

  console.log('   Passes Created:');
  flyPlusPasses.forEach(pass => {
    const meta = pass.typedMetadata as any;
    console.log(`     - ${pass.name}`);
    console.log(`       Tier: ${meta.tier}, Transferable: ${meta.transferable}`);
  });

  console.log('\n   Token Statistics:');
  console.log(`     - $AHOY Token Active: Yes`);
  console.log(`     - Holders with Points: ${sdk.indexer.getHolderCount(tokenResult.tokenAssetId)}`);

  console.log('\n   Revenue Model:');
  console.log('     - Primary Sales: Stripe integration ready');
  console.log('     - Secondary Sales: 5% royalty on each resale');
  console.log('     - Zero-cost UAC via $AHOY rewards');

  console.log('\n' + '='.repeat(60));
  console.log('FLY+ PASS DEMO COMPLETE');
  console.log('='.repeat(60) + '\n');
}

// Run the demo
runFlyPlusDemo().catch(console.error);
