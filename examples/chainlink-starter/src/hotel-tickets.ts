/**
 * Demo 4: Hotel Tickets — Compliance-Gated Mint
 *
 * Tokenizes hotel reservations with real-time compliance checks.
 * Uses Chainlink price feeds → OracleService → ComplianceEngine
 * to gate minting on KYC, jurisdiction, and oracle health.
 */

import {
  TokenisationSDK,
  RightType,
  LifecycleState,
  PartyType,
  PartyRole,
  TransferabilityMode,
  ComplianceAction,
  OracleService,
  OracleFailSafeMode,
  ComplianceEngine,
  createChainlinkWiredSDK,
  DecoPlugin,
  DecoProofType,
  ChainlinkAcePlugin,
} from '@tokenisation/sdk';

import {
  log, logStep, logSuccess, logInfo, logWarning,
  BASE_SEPOLIA_RPC_URL, BASE_SEPOLIA_CHAIN_ID,
} from './helpers.js';

export async function hotelTicketsDemo() {
  log('DEMO 4: HOTEL TICKETS', 'Compliance-Gated Mint with Oracle Price Checks');

  // --- SDK + Parties ---
  const sdk = new TokenisationSDK({ useMockPlugins: true });

  const hotel = sdk.parties_.create({
    name: 'Grand Token Hotel',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
    jurisdiction: 'AE',
    email: 'reservations@grandtoken.com',
    legalEntityId: 'LEI-AE-GTH-001',
    metadata: { starRating: '5', rooms: '350' },
  });
  sdk.parties_.setKyc(hotel.id, true);

  const guest = sdk.parties_.create({
    name: 'Maria Garcia',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'ES',
    email: 'maria@example.com',
  });
  sdk.parties_.setKyc(guest.id, true);

  logSuccess(`Hotel: ${hotel.name}`);
  logSuccess(`Guest: ${guest.name}`);

  // --- Reservation asset ---
  const reservation = await sdk.assets.create({
    name: 'Grand Suite — 3 Nights',
    description: 'Luxury suite with Burj Khalifa view, 3-night stay including breakfast',
    rightType: RightType.ACCESS,
    issuerId: hotel.id,
    jurisdiction: {
      countryCode: 'AE',
      regulatoryFramework: 'UAE_VARA',
      accreditedOnly: false,
      blockedJurisdictions: ['KP', 'IR', 'SY'],
    },
    validityPeriod: {
      isPerpetual: false,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    transferabilityRules: {
      mode: TransferabilityMode.COMPLIANCE_GATED,
      lockupPeriodSeconds: 0,
      maxHolders: 1,
      requireKyc: true,
    },
    metadata: {
      roomType: 'GRAND_SUITE',
      nights: 3,
      ratePerNight: '1200',
      currency: 'USD',
      breakfast: true,
      view: 'Burj Khalifa',
    },
  });

  logSuccess(`Reservation: ${reservation.name}`);

  // --- Lifecycle ---
  await sdk.assets.transition(reservation.id, LifecycleState.PENDING_VERIFICATION, hotel.id);
  await sdk.assets.verify(reservation.id, hotel.id);
  await sdk.assets.activate(reservation.id, hotel.id);
  logSuccess('Lifecycle: DRAFT → VERIFIED → ACTIVE');

  // --- Wire Chainlink for compliance ---
  logStep(1, 'Wire Chainlink → OracleService → ComplianceEngine');

  const oracleService = new OracleService({
    strictMode: false,
    failSafeMode: OracleFailSafeMode.USE_CACHED,
  });

  const complianceEngine = new ComplianceEngine({});

  const chainlink = createChainlinkWiredSDK({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    dataFeeds: {
      pairs: ['ETH/USD'],
      pollIntervalMs: 30_000,
    },
    oracleService,
    complianceEngine,
  });

  logSuccess('Chainlink wired — compliance pipeline ready');

  // --- Sync prices ---
  logStep(2, 'Sync prices for compliance context');

  try {
    if (chainlink.dataFeedBridge) {
      await chainlink.dataFeedBridge.syncOnce();
      logSuccess('Prices synced from Chainlink');
    }
  } catch {
    logWarning('RPC unreachable — using mock prices');
    oracleService.setPriceFeed('ETH/USD', '182345000000', 8);
  }

  // --- Compliance evaluation ---
  logStep(3, 'Evaluate compliance for reservation mint');

  const complianceResult = await complianceEngine.evaluate(
    ComplianceAction.TOKEN_MINT,
    {
      assetId: reservation.id,
      actorId: hotel.id,
      recipientId: guest.id,
      amount: '1',
      metadata: { roomType: 'GRAND_SUITE', totalPrice: '3600' },
    }
  );

  logSuccess(`Compliance decision: ${complianceResult.decision.result}`);
  logInfo('Receipt ID', complianceResult.receipt.id);
  logInfo('Policy version', complianceResult.decision.policyVersion);
  logInfo('Violations', String(complianceResult.decision.violations.length));
  logInfo('Warnings', String(complianceResult.decision.warnings.length));

  // --- Mint if allowed ---
  logStep(4, 'Mint reservation token (compliance-gated)');

  if (complianceResult.decision.result === 'ALLOW') {
    const mintResult = await sdk.tokens.mint(reservation.id, guest.id, '1');
    if (mintResult.success) {
      logSuccess(`Reservation issued to ${guest.name}`);
      logInfo('Compliance receipt', complianceResult.receipt.id.substring(0, 16) + '...');
    }
  } else {
    logWarning(`Mint denied: ${complianceResult.decision.violations.map((v: { message: string }) => v.message).join(', ')}`);
  }

  // --- Summary ---
  console.log(`
  📊 HOTEL RESERVATION SUMMARY
  ═══════════════════════════════════════════════════════════

  Hotel:       ${hotel.name}
  Guest:       ${guest.name}
  Room:        Grand Suite — 3 nights ($3,600)
  Status:      ACTIVE — reservation token issued

  Compliance Pipeline:
  • Chainlink price feeds → OracleService
  • ComplianceEngine.evaluate() → ${complianceResult.decision.result}
  • DecisionReceipt: ${complianceResult.receipt.id.substring(0, 16)}...
  • Oracle health: ${oracleService.getHealthStatus()}

  ═══════════════════════════════════════════════════════════
  `);

  // --- DECO: Privacy-preserving age/residency proof ---
  logStep(5, 'DECO proof — guest age and residency verification');

  const deco = new DecoPlugin({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    verifierAddress: '0x0000000000000000000000000000000000000001',
  });

  const residencyProof = await deco.createProof({
    proofType: DecoProofType.RESIDENCY_PROOF,
    dataSource: {
      url: 'https://identity.provider/api/v1/residency',
      method: 'GET',
      jsonPath: '$.countryOfResidence',
    },
    claim: {
      field: 'countryOfResidence',
      operator: 'in',
      threshold: ['ES', 'FR', 'DE', 'IT', 'GB', 'AE'],
    },
    metadata: {
      purpose: 'Hotel residency verification for rate eligibility',
      guestId: guest.id,
      reservationId: reservation.id,
    },
  });

  if (residencyProof.success) {
    logSuccess(`DECO proof created: ${residencyProof.data.proofId}`);
    logInfo('Proof type', 'RESIDENCY_PROOF');
    logInfo('Claim', 'Residence in approved country (address not revealed)');
  } else {
    logWarning(`DECO proof simulated: ${residencyProof.error}`);
    logInfo('Purpose', 'Prove guest residency for rate eligibility without revealing address');
  }

  // --- ACE: Automated compliance attestation ---
  logStep(6, 'ACE automated compliance attestation for reservation');

  const ace = new ChainlinkAcePlugin({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    routerAddress: '0x0000000000000000000000000000000000000001',
  });

  const attestation = await ace.createAttestation({
    assetId: reservation.id,
    actorId: hotel.id,
    action: 'RESERVATION_COMPLIANCE',
    context: {
      guestJurisdiction: 'ES',
      kycVerified: true,
      complianceDecision: complianceResult.decision.result,
      receiptId: complianceResult.receipt.id,
    },
  });

  if (attestation.success) {
    logSuccess(`ACE attestation: ${attestation.data.attestationId}`);
    logInfo('Status', attestation.data.status);
    logInfo('On-chain', 'Compliance attestation recorded');
  } else {
    logWarning(`ACE simulated: ${attestation.error}`);
    logInfo('Purpose', 'Immutable on-chain compliance attestation for audit trail');
  }

  deco.destroy();
  ace.destroy();
  chainlink.stop();
  logSuccess('Demo 4 complete — Hotel Tickets with Compliance + DECO + ACE\n');
}
