/**
 * Demo 2: Airline Tickets — Chainlink Automation
 *
 * Tokenizes airline tickets and wires Chainlink Automation (Keepers)
 * to auto-register upkeeps for compliance checks and flight-event
 * processing without a centralized cron server.
 */

import {
  TokenisationSDK,
  RightType,
  LifecycleState,
  PartyType,
  PartyRole,
  TransferabilityMode,
  ChainlinkAutomationPlugin,
  AutomationTaskType,
  TriggerType,
  AmadeusFlightPlugin,
  DecoPlugin,
  DecoProofType,
} from '@tokenisation/sdk';

import {
  log, logStep, logSuccess, logInfo, logWarning,
  BASE_SEPOLIA_RPC_URL, BASE_SEPOLIA_CHAIN_ID,
} from './helpers.js';

export async function airlineTicketsDemo() {
  log('DEMO 2: AIRLINE TICKETS', 'Chainlink Automation for flight-event upkeeps');

  // --- SDK + Parties ---
  const sdk = new TokenisationSDK({ useMockPlugins: true });

  const airline = sdk.parties_.create({
    name: 'SkyToken Airlines',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
    jurisdiction: 'US',
    email: 'ops@skytoken.aero',
    legalEntityId: 'LEI-US-SKY-001',
    metadata: { iataCode: 'SKT' },
  });
  sdk.parties_.setKyc(airline.id, true);

  const passenger = sdk.parties_.create({
    name: 'Jane Doe',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'US',
    email: 'jane@example.com',
  });
  sdk.parties_.setKyc(passenger.id, true);

  logSuccess(`Airline: ${airline.name}`);
  logSuccess(`Passenger: ${passenger.name}`);

  // --- Ticket asset ---
  const ticket = await sdk.assets.create({
    name: 'SKT-1234 JFK→LHR Business',
    description: 'Non-stop JFK to London Heathrow, Business Class',
    rightType: RightType.ACCESS,
    issuerId: airline.id,
    jurisdiction: {
      countryCode: 'US',
      regulatoryFramework: 'FAA',
      accreditedOnly: false,
      blockedJurisdictions: ['KP', 'IR', 'SY'],
    },
    validityPeriod: {
      isPerpetual: false,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    transferabilityRules: {
      mode: TransferabilityMode.COMPLIANCE_GATED,
      lockupPeriodSeconds: 0,
      maxHolders: 1,
      requireKyc: true,
    },
    metadata: {
      flightNumber: 'SKT-1234',
      route: 'JFK → LHR',
      class: 'BUSINESS',
      seatNumber: '2A',
      departureTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  logSuccess(`Ticket: ${ticket.name}`);

  // --- Lifecycle ---
  await sdk.assets.transition(ticket.id, LifecycleState.PENDING_VERIFICATION, airline.id);
  await sdk.assets.verify(ticket.id, airline.id);
  await sdk.assets.activate(ticket.id, airline.id);
  logSuccess('Lifecycle: DRAFT → VERIFIED → ACTIVE');

  // --- Issue ticket to passenger ---
  const mintResult = await sdk.tokens.mint(ticket.id, passenger.id, '1');
  if (mintResult.success) {
    logSuccess(`Ticket issued to ${passenger.name}`);
  }

  // --- Wire Chainlink Automation ---
  logStep(1, 'Configure Chainlink Automation plugin');

  const automation = new ChainlinkAutomationPlugin({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
  });

  logSuccess('AutomationPlugin instantiated');
  logInfo('Chain', `Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`);

  // --- Register upkeeps ---
  logStep(2, 'Register flight-event upkeeps');

  const complianceUpkeep = await automation.registerUpkeep({
    name: `Compliance Re-Check: ${ticket.name}`,
    contractAddress: '0x0000000000000000000000000000000000000001',
    triggerType: TriggerType.CONDITIONAL,
    gasLimit: 500_000,
    checkData: '0x',
    amount: '5000000000000000000',
  });

  if (complianceUpkeep.success) {
    logSuccess(`Upkeep registered: ${complianceUpkeep.data.name}`);
    logInfo('Upkeep ID', complianceUpkeep.data.id);
    logInfo('Trigger', 'CONDITIONAL (time-based)');
    logInfo('Task', AutomationTaskType.COMPLIANCE_CHECK);
  } else {
    logWarning(`Upkeep registration simulated (no signer): ${complianceUpkeep.error}`);
  }

  const flightEventUpkeep = await automation.registerUpkeep({
    name: `Flight Landing: ${ticket.name}`,
    contractAddress: '0x0000000000000000000000000000000000000002',
    triggerType: TriggerType.LOG,
    gasLimit: 300_000,
    checkData: '0x',
    amount: '3000000000000000000',
  });

  if (flightEventUpkeep.success) {
    logSuccess(`Upkeep registered: ${flightEventUpkeep.data.name}`);
    logInfo('Upkeep ID', flightEventUpkeep.data.id);
    logInfo('Trigger', 'LOG (event-driven)');
  } else {
    logWarning(`Upkeep registration simulated (no signer): ${flightEventUpkeep.error}`);
  }

  // --- Summary ---
  console.log(`
  📊 AIRLINE TICKET SUMMARY
  ═══════════════════════════════════════════════════════════

  Flight:     ${ticket.name}
  Passenger:  ${passenger.name}
  Status:     ACTIVE — ticket issued on-chain

  Chainlink Automation:
  • Compliance re-check upkeep (CONDITIONAL trigger)
  • Flight landing upkeep (LOG trigger)
  • Decentralized execution — no cron server needed

  ═══════════════════════════════════════════════════════════
  `);

  // --- Amadeus: Flight Status Check ---
  logStep(3, 'Check flight status via AmadeusFlightPlugin');

  const amadeus = new AmadeusFlightPlugin({
    apiKey: process.env.AMADEUS_API_KEY || 'test-key',
    apiSecret: process.env.AMADEUS_API_SECRET || 'test-secret',
    testMode: true,
  });

  const flightStatus = await amadeus.getFlightStatus({
    flightNumber: 'SKT-1234',
    departureDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  if (flightStatus.success) {
    logSuccess(`Flight status: ${flightStatus.data.status}`);
    logInfo('Departure', flightStatus.data.departure);
    logInfo('Arrival', flightStatus.data.arrival);
  } else {
    logWarning(`Flight status simulated (test mode): ${flightStatus.error}`);
    logInfo('Amadeus purpose', 'Real-time flight data for automated refund triggers');
  }

  // --- DECO: Privacy-Preserving Age Proof ---
  logStep(4, 'DECO proof — passenger is over 18 without revealing DOB');

  const deco = new DecoPlugin({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    verifierAddress: '0x0000000000000000000000000000000000000001',
  });

  const ageProof = await deco.createProof({
    proofType: DecoProofType.AGE_VERIFICATION,
    dataSource: {
      url: 'https://identity.provider/api/v1/verify',
      method: 'GET',
      jsonPath: '$.dateOfBirth',
    },
    claim: {
      field: 'age',
      operator: 'gte',
      threshold: 18,
    },
    metadata: {
      purpose: 'Airline age verification',
      passengerId: passenger.id,
      flightNumber: 'SKT-1234',
    },
  });

  if (ageProof.success) {
    logSuccess(`DECO proof created: ${ageProof.data.proofId}`);
    logInfo('Proof type', 'AGE_VERIFICATION');
    logInfo('Claim', 'age >= 18 (DOB not revealed)');
  } else {
    logWarning(`DECO proof simulated (no attestation node): ${ageProof.error}`);
    logInfo('DECO purpose', 'Prove passenger age without revealing date of birth');
  }

  amadeus.destroy();
  deco.destroy();
  automation.destroy();
  logSuccess('Demo 2 complete — Airline Tickets with Automation + Amadeus + DECO\n');
}
