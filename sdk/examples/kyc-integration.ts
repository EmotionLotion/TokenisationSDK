/**
 * KYC Integration Example
 *
 * Demonstrates:
 * 1. KYC provider setup (SumSub, Onfido)
 * 2. Verification session creation
 * 3. Webhook handling
 * 4. On-chain identity registration
 * 5. Re-verification workflow
 */

import { TokenisationSDK } from '../src';
import {
  KycPlugin,
  VerificationLevel,
  VerificationStatus,
  type KycWebhookEvent,
} from '../src/plugins/kyc/index.js';
import { ethers } from 'ethers';

// Configuration
const config = {
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  privateKey: process.env.PRIVATE_KEY!,
  chainId: 84532,

  // KYC Provider configuration
  kycProvider: 'mock' as const, // Use 'sumsub' or 'onfido' in production
  kycServerEndpoint: process.env.KYC_SERVER_ENDPOINT, // Optional: Your KYC backend

  // For production with SumSub:
  // sumsubApiKey: process.env.SUMSUB_APP_TOKEN,
  // sumsubSecretKey: process.env.SUMSUB_SECRET_KEY,
};

// Sample users to verify
const users = [
  {
    id: 'user-001',
    email: 'alice@example.com',
    walletAddress: '0x1111111111111111111111111111111111111111',
    country: 'US',
    investmentAmount: 50000, // $50K
  },
  {
    id: 'user-002',
    email: 'bob@example.com',
    walletAddress: '0x2222222222222222222222222222222222222222',
    country: 'GB',
    investmentAmount: 250000, // $250K (requires enhanced KYC)
  },
  {
    id: 'user-003',
    email: 'carol@example.com',
    walletAddress: '0x3333333333333333333333333333333333333333',
    country: 'DE',
    investmentAmount: 5000, // $5K (basic KYC)
  },
];

// KYC level based on investment
function determineKycLevel(investmentAmount: number): VerificationLevel {
  if (investmentAmount >= 100000) return VerificationLevel.ENHANCED;
  if (investmentAmount >= 10000) return VerificationLevel.STANDARD;
  return VerificationLevel.BASIC;
}

async function main() {
  console.log('='.repeat(60));
  console.log('KYC Integration Example');
  console.log('='.repeat(60));

  // Step 1: Initialize KYC Plugin
  console.log('\n[Step 1] Initializing KYC Plugin');
  console.log('-'.repeat(40));

  const kyc = new KycPlugin({
    provider: config.kycProvider,
    providerConfig: {
      // In production, provide API keys:
      // apiKey: config.sumsubApiKey,
      // secretKey: config.sumsubSecretKey,
    },
    serverEndpoint: config.kycServerEndpoint,
    defaultLevel: VerificationLevel.STANDARD,
    sessionTtlSeconds: 1800, // 30 minutes
  });

  console.log(`  Provider: ${config.kycProvider}`);
  console.log(`  Default Level: ${VerificationLevel.STANDARD}`);
  console.log(`  Session TTL: 30 minutes`);

  // Step 2: Set up event handlers
  console.log('\n[Step 2] Setting up Event Handlers');
  console.log('-'.repeat(40));

  // Handler for successful verifications
  const unsubscribeCompleted = kyc.on('verification.completed', (event: KycWebhookEvent) => {
    console.log(`\n  [EVENT] Verification completed for user: ${event.userId}`);
    console.log(`    Level: ${event.level}`);
    console.log(`    Country: ${event.country}`);
    // In production: Update database, register on-chain, send notification
  });

  // Handler for rejections
  const unsubscribeRejected = kyc.on('verification.rejected', (event: KycWebhookEvent) => {
    console.log(`\n  [EVENT] Verification rejected for user: ${event.userId}`);
    console.log(`    Reason: ${event.rejectionReason}`);
    // In production: Notify user, allow re-verification
  });

  // Handler for all events
  const unsubscribeAll = kyc.on('all', (event: KycWebhookEvent) => {
    console.log(`  [LOG] KYC Event: ${event.type} for ${event.userId}`);
  });

  console.log('  Registered handlers for:');
  console.log('    - verification.completed');
  console.log('    - verification.rejected');
  console.log('    - all events');

  // Step 3: Initialize SDK and deploy Identity Registry
  console.log('\n[Step 3] Deploying Identity Registry');
  console.log('-'.repeat(40));

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, provider);

  const sdk = new TokenisationSDK({
    signer,
    chainId: config.chainId,
  });

  const identityRegistry = await sdk.deployIdentityRegistry();
  console.log(`  Identity Registry: ${identityRegistry.address}`);

  // Step 4: Create verification sessions for users
  console.log('\n[Step 4] Creating Verification Sessions');
  console.log('-'.repeat(40));

  for (const user of users) {
    const level = determineKycLevel(user.investmentAmount);

    console.log(`\n  User: ${user.email}`);
    console.log(`    Investment: $${user.investmentAmount.toLocaleString()}`);
    console.log(`    Required Level: ${level}`);

    // Check if already verified
    const existingStatus = await kyc.getVerificationStatus(user.id);
    if (existingStatus.verified) {
      console.log(`    Status: Already verified (Level: ${existingStatus.level})`);
      continue;
    }

    // Create new verification session
    const session = await kyc.startVerification({
      userId: user.id,
      walletAddress: user.walletAddress,
      level,
      email: user.email,
      country: user.country,
      metadata: {
        investmentAmount: user.investmentAmount,
        source: 'sdk-example',
      },
      redirectUrl: 'https://yourapp.com/kyc/callback',
    });

    console.log(`    Session ID: ${session.sessionId}`);
    console.log(`    URL: ${session.url}`);
    console.log(`    Expires: ${session.expiresAt}`);
  }

  // Step 5: Simulate verification completion (mock provider only)
  console.log('\n[Step 5] Simulating Verification Completion');
  console.log('-'.repeat(40));

  if (config.kycProvider === 'mock') {
    console.log('  Using mock provider - simulating webhook events...\n');

    // Approve first user
    kyc.mockApprove(users[0].id, {
      level: VerificationLevel.STANDARD,
      country: 'US',
      expiresInDays: 365,
    });

    // Approve second user with enhanced verification
    kyc.mockApprove(users[1].id, {
      level: VerificationLevel.ENHANCED,
      country: 'GB',
      expiresInDays: 365,
    });

    // Reject third user
    kyc.mockReject(users[2].id, 'Document quality insufficient');
  } else {
    console.log('  Using production provider - waiting for real webhooks...');
    console.log('  Webhook endpoint: POST /api/kyc/webhook');
  }

  // Step 6: Check verification statuses
  console.log('\n[Step 6] Checking Verification Statuses');
  console.log('-'.repeat(40));

  for (const user of users) {
    const status = await kyc.getVerificationStatus(user.id);
    const isVerified = await kyc.isVerified(user.id);
    const needsReverification = await kyc.needsReverification(user.id, 30);

    console.log(`\n  ${user.email}:`);
    console.log(`    Status: ${status.status}`);
    console.log(`    Verified: ${isVerified}`);
    console.log(`    Level: ${status.level || 'N/A'}`);
    console.log(`    Country: ${status.country || 'N/A'}`);
    console.log(`    Needs Re-verification: ${needsReverification}`);

    if (status.rejectionReason) {
      console.log(`    Rejection Reason: ${status.rejectionReason}`);
    }
  }

  // Step 7: Register verified users on-chain
  console.log('\n[Step 7] Registering Verified Users On-Chain');
  console.log('-'.repeat(40));

  // Country code mapping
  const countryCodes: Record<string, number> = {
    US: 840,
    GB: 826,
    DE: 276,
    FR: 250,
    JP: 392,
  };

  for (const user of users) {
    const status = await kyc.getVerificationStatus(user.id);

    if (!status.verified) {
      console.log(`  ${user.email}: SKIPPED (not verified)`);
      continue;
    }

    const countryCode = countryCodes[status.country || user.country] || 0;
    const kycLevel = status.level === VerificationLevel.ENHANCED ? 3
      : status.level === VerificationLevel.STANDARD ? 2
      : 1;

    // Calculate expiry (1 year from now)
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

    // Register on-chain
    await identityRegistry.registerIdentity(
      user.walletAddress,
      countryCode,
      kycLevel,
      expiryTimestamp
    );

    console.log(`  ${user.email}: REGISTERED`);
    console.log(`    Address: ${user.walletAddress.slice(0, 10)}...`);
    console.log(`    Country: ${countryCode}`);
    console.log(`    KYC Level: ${kycLevel}`);
  }

  // Step 8: Webhook Handler Example
  console.log('\n[Step 8] Webhook Handler Example');
  console.log('-'.repeat(40));

  console.log(`
  // Express.js webhook endpoint example:

  app.post('/api/kyc/webhook', async (req, res) => {
    try {
      // Verify webhook signature (provider-specific)
      const signature = req.headers['x-webhook-signature'];
      // verifySignature(signature, req.body, webhookSecret);

      // Process the event
      const event: KycWebhookEvent = {
        type: req.body.type,
        userId: req.body.applicantId,
        providerReferenceId: req.body.externalUserId,
        status: mapProviderStatus(req.body.reviewResult),
        level: mapProviderLevel(req.body.levelName),
        rejectionReason: req.body.rejectLabels?.join(', '),
        country: req.body.country,
        timestamp: req.body.createdAt,
        rawData: req.body,
      };

      // Process in KYC plugin
      kyc.processWebhookEvent(event);

      // If approved, register on-chain
      if (event.status === VerificationStatus.APPROVED) {
        await registerOnChain(event.userId);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  });
`);

  // Step 9: Re-verification Workflow
  console.log('\n[Step 9] Re-verification Workflow');
  console.log('-'.repeat(40));

  console.log(`
  // Check users needing re-verification

  async function checkReverifications() {
    const users = await getUsersFromDatabase();

    for (const user of users) {
      const needsReverification = await kyc.needsReverification(
        user.id,
        30 // Days before expiry to trigger
      );

      if (needsReverification) {
        // Send notification
        await sendEmail(user.email, {
          subject: 'KYC Re-verification Required',
          template: 'kyc-reverification',
          data: {
            userName: user.name,
            expiryDate: user.kycExpiresAt,
          },
        });

        // Create new session
        const session = await kyc.startVerification({
          userId: user.id,
          walletAddress: user.walletAddress,
          level: user.currentKycLevel,
          email: user.email,
        });

        // Update database
        await updateUserKycSession(user.id, session);
      }
    }
  }
`);

  // Cleanup
  unsubscribeCompleted();
  unsubscribeRejected();
  unsubscribeAll();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('KYC Integration Complete');
  console.log('='.repeat(60));

  console.log('\nDeployed Contracts:');
  console.log(`  Identity Registry: ${identityRegistry.address}`);

  console.log('\nKYC Configuration:');
  console.log(`  Provider: ${config.kycProvider}`);
  console.log(`  Default Level: ${VerificationLevel.STANDARD}`);
  console.log(`  Session TTL: 30 minutes`);

  console.log('\nUser Verification Summary:');
  for (const user of users) {
    const status = await kyc.getVerificationStatus(user.id);
    const statusIcon = status.verified ? '✓' : status.status === VerificationStatus.REJECTED ? '✗' : '○';
    console.log(`  ${statusIcon} ${user.email}: ${status.status}`);
  }

  console.log('\nNext Steps:');
  console.log('  1. Configure webhook endpoint in KYC provider dashboard');
  console.log('  2. Set up re-verification cron job');
  console.log('  3. Implement retry logic for failed registrations');
  console.log('  4. Add monitoring for KYC completion rates');
  console.log('  5. Set up alerts for mass rejection events');
}

main().catch(console.error);
