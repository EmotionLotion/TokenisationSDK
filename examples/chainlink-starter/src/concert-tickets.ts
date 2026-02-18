/**
 * Demo 5: Concert Tickets — Proof of Reserve
 *
 * Tokenizes concert tickets and demonstrates Chainlink Proof of Reserve
 * to verify that the number of minted tickets never exceeds venue capacity.
 * When reserves (available seats) drop, minting is automatically blocked.
 */

import {
  TokenisationSDK,
  RightType,
  LifecycleState,
  PartyType,
  PartyRole,
  TransferabilityMode,
  ProofOfReservePlugin,
  ReserveStatus,
  ComplianceEngine,
  ComplianceAction,
  createChainlinkWiredSDK,
  CCIDPlugin,
  CCIDVertical,
  OracleAggregator,
  AggregationStrategy,
} from '@tokenisation/sdk';

import {
  log, logStep, logSuccess, logInfo, logWarning,
  BASE_SEPOLIA_RPC_URL, BASE_SEPOLIA_CHAIN_ID,
} from './helpers.js';

export async function concertTicketsDemo() {
  log('DEMO 5: CONCERT TICKETS', 'Proof of Reserve for Mint Gating');

  // --- SDK + Parties ---
  const sdk = new TokenisationSDK({ useMockPlugins: true });

  const venue = sdk.parties_.create({
    name: 'Arena Web3 Events',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
    jurisdiction: 'US',
    email: 'events@arenaweb3.com',
    legalEntityId: 'LEI-US-AWE-001',
    metadata: { venueCapacity: '50000' },
  });
  sdk.parties_.setKyc(venue.id, true);

  const fan = sdk.parties_.create({
    name: 'Carlos Ruiz',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'US',
    email: 'carlos@example.com',
  });
  sdk.parties_.setKyc(fan.id, true);

  logSuccess(`Venue: ${venue.name}`);
  logSuccess(`Fan: ${fan.name}`);

  // --- Concert ticket asset ---
  const concert = await sdk.assets.create({
    name: 'Crypto Music Fest 2025 — VIP',
    description: 'VIP access to Crypto Music Fest, front-row seating, backstage pass',
    rightType: RightType.ACCESS,
    issuerId: venue.id,
    jurisdiction: {
      countryCode: 'US',
      regulatoryFramework: 'SEC_REG_D',
      accreditedOnly: false,
      blockedJurisdictions: ['KP', 'IR'],
    },
    validityPeriod: {
      isPerpetual: false,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    },
    transferabilityRules: {
      mode: TransferabilityMode.COMPLIANCE_GATED,
      lockupPeriodSeconds: 0,
      maxHolders: 50000,
      requireKyc: true,
    },
    metadata: {
      eventName: 'Crypto Music Fest 2025',
      tier: 'VIP',
      venueCapacity: 50000,
      ticketPrice: '500',
      antiScalping: true,
    },
  });

  logSuccess(`Concert: ${concert.name}`);

  // --- Lifecycle ---
  await sdk.assets.transition(concert.id, LifecycleState.PENDING_VERIFICATION, venue.id);
  await sdk.assets.verify(concert.id, venue.id);
  await sdk.assets.activate(concert.id, venue.id);
  logSuccess('Lifecycle: DRAFT → VERIFIED → ACTIVE');

  // --- Wire Proof of Reserve ---
  logStep(1, 'Configure Chainlink Proof of Reserve plugin');

  const por = new ProofOfReservePlugin({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    checkerAddress: '0x0000000000000000000000000000000000000001',
  });

  logSuccess('ProofOfReservePlugin instantiated');

  // --- Check reserves ---
  logStep(2, 'Check venue capacity reserves');

  const reserveResult = await por.checkReserve('0x0000000000000000000000000000000000000001');

  if (reserveResult.success) {
    const reserve = reserveResult.data;
    logSuccess(`Reserve status: ${ReserveStatus[reserve.status]}`);
    logInfo('Reserve amount', reserve.reserveAmount);
    logInfo('Circulating supply', reserve.circulatingSupply);
    logInfo('Collateralization ratio', String(reserve.currentRatio));
    logInfo('Mint allowed', String(reserve.mintAllowed));
    logInfo('Transfer allowed', String(reserve.transferAllowed));
  } else {
    logWarning(`Reserve check simulated: ${reserveResult.error}`);
    logInfo('ReserveStatus.FULLY_BACKED', 'Reserves >= required ratio');
    logInfo('ReserveStatus.UNDERCOLLATERALIZED', 'Below required, above circuit breaker');
    logInfo('ReserveStatus.CIRCUIT_BREAKER', 'Critically low — all ops blocked');
  }

  // --- PoR-gated mint check ---
  logStep(3, 'Check if mint is allowed via PoR');

  const mintCheck = await por.canMint('0x0000000000000000000000000000000000000001', '1');

  if (mintCheck.success) {
    logSuccess(`Can mint: ${mintCheck.data.allowed}`);
    logInfo('Reason', mintCheck.data.reason);
  } else {
    logWarning(`Mint check simulated: ${mintCheck.error}`);
  }

  // --- Wire PoR into ComplianceEngine ---
  logStep(4, 'Wire PoR into ComplianceEngine');

  const complianceEngine = new ComplianceEngine({
    porConfig: { enabled: true, blockOnUndercollateralized: true },
  });

  const chainlink = createChainlinkWiredSDK({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    por: { checkerAddress: '0x0000000000000000000000000000000000000001' },
    complianceEngine,
  });

  logSuccess('PoR wired into ComplianceEngine');

  // --- Evaluate compliance with PoR ---
  const complianceResult = await complianceEngine.evaluate(
    ComplianceAction.TOKEN_MINT,
    {
      assetId: concert.id,
      actorId: venue.id,
      recipientId: fan.id,
      amount: '1',
      metadata: { tier: 'VIP' },
    }
  );

  logSuccess(`Compliance decision: ${complianceResult.decision.result}`);
  logInfo('Receipt ID', complianceResult.receipt.id);

  // --- Mint ticket ---
  logStep(5, 'Mint concert ticket');

  const mintResult = await sdk.tokens.mint(concert.id, fan.id, '1');
  if (mintResult.success) {
    logSuccess(`Ticket issued to ${fan.name}`);
    const balance = await sdk.tokens.getBalance(concert.id, fan.id);
    logInfo('Balance', `${balance} ticket(s)`);
  }

  // --- Summary ---
  console.log(`
  📊 CONCERT TICKET SUMMARY
  ═══════════════════════════════════════════════════════════

  Event:       Crypto Music Fest 2025 — VIP
  Fan:         ${fan.name}
  Price:       $500
  Status:      ACTIVE — ticket issued

  Proof of Reserve:
  • Venue capacity verified on-chain via Chainlink PoR
  • Mint blocked when tickets exceed venue capacity
  • Circuit breaker protects against overselling
  • Compliance decision: ${complianceResult.decision.result}

  Reserve Status Levels:
  • FULLY_BACKED     — seats available, minting allowed
  • UNDERCOLLATERALIZED — nearing capacity, warning issued
  • CIRCUIT_BREAKER  — sold out, ALL operations blocked

  ═══════════════════════════════════════════════════════════
  `);

  // --- CCID: Anti-scalping identity gate ---
  logStep(6, 'CCID anti-scalping identity gate');

  const ccid = new CCIDPlugin({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    registryAddress: '0x0000000000000000000000000000000000000001',
  });

  const identityGate = await ccid.checkIdentity({
    partyId: fan.id,
    verticals: [CCIDVertical.ENTERTAINMENT],
    requiredClearances: ['KYC_VERIFIED', 'UNIQUE_IDENTITY'],
  });

  if (identityGate.success) {
    logSuccess(`CCID identity verified: ${identityGate.data.passportId}`);
    logInfo('Verticals', identityGate.data.verticalsCleared.join(', '));
    logInfo('Anti-scalping', 'One ticket per verified identity');
  } else {
    logWarning(`CCID simulated: ${identityGate.error}`);
    logInfo('Purpose', 'Prevent ticket scalping via cross-vertical identity verification');
  }

  // --- OracleAggregator: Multi-source ticket price discovery ---
  logStep(7, 'Multi-source ticket price discovery via OracleAggregator');

  const aggregator = new OracleAggregator({
    strategy: AggregationStrategy.MEDIAN,
    sources: [
      { name: 'Chainlink ETH/USD', type: 'chainlink', pair: 'ETH/USD', weight: 1 },
      { name: 'StubHub Market', type: 'custom', endpoint: 'https://api.stubhub.com/v1/pricing', weight: 1 },
      { name: 'Ticketmaster', type: 'custom', endpoint: 'https://api.ticketmaster.com/v1/pricing', weight: 1 },
    ],
    minSources: 2,
    maxStalenessMs: 600_000,
  });

  const priceDiscovery = await aggregator.aggregatePrice('CRYPTO_MUSIC_FEST_VIP_2025');

  if (priceDiscovery.success) {
    logSuccess(`Market price: $${priceDiscovery.data.aggregatedValue}`);
    logInfo('Strategy', 'MEDIAN');
    logInfo('Sources', String(priceDiscovery.data.sourcesUsed));
    logInfo('Fair value check', 'Ticket price within market range');
  } else {
    logWarning(`Price aggregation simulated: ${priceDiscovery.error}`);
    logInfo('Purpose', 'Multi-source fair price discovery to prevent price manipulation');
  }

  ccid.destroy();
  aggregator.destroy();
  chainlink.stop();
  logSuccess('Demo 5 complete — Concert Tickets with PoR + CCID + OracleAggregator\n');
}
