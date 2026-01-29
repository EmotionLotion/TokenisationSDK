/**
 * Demo 3: Car Rental — CCIP Cross-Chain Settlement
 *
 * Tokenizes a car rental reservation and demonstrates how Chainlink
 * CCIP enables cross-chain deposit settlement — the renter pays on
 * one chain, the rental agency receives on another.
 */

import {
  TokenisationSDK,
  RightType,
  LifecycleState,
  PartyType,
  PartyRole,
  TransferabilityMode,
  createChainlinkWiredSDK,
} from '@tokenisation/sdk';

import {
  log, logStep, logSuccess, logInfo, logWarning,
  BASE_SEPOLIA_RPC_URL, BASE_SEPOLIA_CHAIN_ID,
} from './helpers.js';

export async function carRentalDemo() {
  log('DEMO 3: CAR RENTAL', 'CCIP Cross-Chain Deposit Settlement');

  // --- SDK + Parties ---
  const sdk = new TokenisationSDK({ useMockPlugins: true });

  const agency = sdk.parties_.create({
    name: 'DriveChain Rentals',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
    jurisdiction: 'US',
    email: 'fleet@drivechain.com',
    legalEntityId: 'LEI-US-DRV-001',
    metadata: { fleetSize: '200' },
  });
  sdk.parties_.setKyc(agency.id, true);

  const renter = sdk.parties_.create({
    name: 'Bob Smith',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'US',
    email: 'bob@example.com',
  });
  sdk.parties_.setKyc(renter.id, true);

  logSuccess(`Agency: ${agency.name}`);
  logSuccess(`Renter: ${renter.name}`);

  // --- Rental reservation asset ---
  const rental = await sdk.assets.create({
    name: 'Tesla Model Y — 7-Day Rental',
    description: 'Full-size electric SUV, 7-day rental with insurance included',
    rightType: RightType.ACCESS,
    issuerId: agency.id,
    jurisdiction: {
      countryCode: 'US',
      regulatoryFramework: 'DOT',
      accreditedOnly: false,
      blockedJurisdictions: ['KP', 'IR'],
    },
    validityPeriod: {
      isPerpetual: false,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    transferabilityRules: {
      mode: TransferabilityMode.COMPLIANCE_GATED,
      lockupPeriodSeconds: 0,
      maxHolders: 1,
      requireKyc: true,
    },
    metadata: {
      vehicleType: 'Tesla Model Y',
      category: 'FULL_SIZE_SUV',
      dailyRate: '120',
      depositAmount: '500',
      insuranceIncluded: true,
    },
  });

  logSuccess(`Rental: ${rental.name}`);

  // --- Lifecycle ---
  await sdk.assets.transition(rental.id, LifecycleState.PENDING_VERIFICATION, agency.id);
  await sdk.assets.verify(rental.id, agency.id);
  await sdk.assets.activate(rental.id, agency.id);
  logSuccess('Lifecycle: DRAFT → VERIFIED → ACTIVE');

  // --- Issue rental token ---
  const mintResult = await sdk.tokens.mint(rental.id, renter.id, '1');
  if (mintResult.success) {
    logSuccess(`Rental token issued to ${renter.name}`);
  }

  // --- Wire CCIP for cross-chain deposit ---
  logStep(1, 'Configure CCIP cross-chain bridge');

  const chainlink = createChainlinkWiredSDK({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    ccip: { enabled: true },
  });

  const ccip = chainlink.plugins.ccip;

  if (ccip) {
    logSuccess('CCIPBridgePlugin wired');
    logInfo('Source chain', `Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`);
    logInfo('Dest chain', 'Sepolia (11155111)');

    // --- Estimate fee ---
    logStep(2, 'Estimate CCIP bridge fee for deposit');

    const feeResult = await ccip.estimateFee({
      destChainId: 11155111,
      receiver: '0x0000000000000000000000000000000000000001',
      token: '0x0000000000000000000000000000000000000002',
      amount: '500',
    });

    if (feeResult.success) {
      logSuccess(`Estimated fee: ${feeResult.data} wei`);
    } else {
      logWarning(`Fee estimation simulated: ${feeResult.error}`);
    }

    // --- Bridge deposit ---
    logStep(3, 'Bridge deposit cross-chain via CCIP');

    const bridgeResult = await ccip.bridgeTokens({
      destChainId: 11155111,
      receiver: '0x0000000000000000000000000000000000000001',
      token: '0x0000000000000000000000000000000000000002',
      amount: '500',
    });

    if (bridgeResult.success) {
      logSuccess(`CCIP message sent: ${bridgeResult.data.messageId}`);
      logInfo('Tx hash', bridgeResult.data.txHash);
      logInfo('Fee', `${bridgeResult.data.fee} wei`);
    } else {
      logWarning(`Bridge simulated (no signer): ${bridgeResult.error}`);
    }
  } else {
    logWarning('CCIP plugin not available — simulating');
  }

  // --- Settlement provider ---
  if (chainlink.settlementProvider) {
    logStep(4, 'DvP settlement via CCIPSettlementProvider');
    logSuccess('Settlement provider ready for delivery-versus-payment');
    logInfo('Deposit', '$500 USDC via CCIP');
    logInfo('Delivery', `Rental token: ${rental.name}`);
  }

  // --- Summary ---
  console.log(`
  📊 CAR RENTAL SUMMARY
  ═══════════════════════════════════════════════════════════

  Vehicle:    Tesla Model Y — 7-Day Rental
  Renter:     ${renter.name}
  Deposit:    $500 (cross-chain via CCIP)
  Status:     ACTIVE — rental token issued

  CCIP Cross-Chain:
  • Deposit bridged from Base Sepolia → Sepolia
  • CCIPSettlementProvider handles DvP
  • Track: https://ccip.chain.link/msg/{messageId}

  ═══════════════════════════════════════════════════════════
  `);

  chainlink.stop();
  logSuccess('Demo 3 complete — Car Rental with CCIP Cross-Chain Settlement\n');
}
