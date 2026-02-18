/**
 * Tokenisation SDK - Complete Feature Showcase
 *
 * This demo showcases all major SDK capabilities:
 * 1. Asset Issuance (no ERC knowledge needed)
 * 2. Compliance-First Architecture
 * 3. Lifecycle Management
 * 4. Custody & Recovery
 * 5. Indexing & Reporting
 * 6. Asset Packs with Lifecycle Rules
 * 7. Chainlink Integration (DECO, CCID, ACE, Amadeus, OracleAggregator)
 *
 * Run: npx ts-node demo.ts
 */

import {
  // SDK Core
  TokenisationSDK,
  LifecycleState,
  RightType,
  PartyRole,
  PartyType,

  // Asset Abstraction (institutional-friendly API)
  AssetIssuanceService,
  AssetType,
  InvestorClass,
  LiquidityProfile,
  FractionalizationType,

  // Custody & Recovery
  CustodyManager,
  CustodyType,
  RecoveryReason,
  OverrideType,

  // Indexing & Reporting
  IndexingEngine,
  IndexedEventType,

  // Asset Packs
  AssetPackRegistry,

  // Chainlink Plugins
  DecoPlugin,
  DecoProofType,
  CCIDPlugin,
  CCIDVertical,
  ChainlinkAcePlugin,
  AmadeusFlightPlugin,
  OracleAggregator,
  AggregationStrategy,
} from '@tokenisation/sdk';

// ============================================================================
// DEMO UTILITIES
// ============================================================================

function divider(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60) + '\n');
}

function log(message: string, data?: any) {
  console.log(`  ${message}`);
  if (data) {
    console.log('  ' + JSON.stringify(data, null, 2).split('\n').join('\n  '));
  }
}

// ============================================================================
// DEMO 1: ASSET ISSUANCE (No ERC Knowledge Needed)
// ============================================================================

async function demo1_AssetIssuance() {
  divider('DEMO 1: Asset Issuance - Institutional API');

  const service = new AssetIssuanceService({
    onResolution: (descriptor, config) => {
      log('SDK Auto-Resolution:', {
        tokenStandard: config.standard,
        rightType: config.rightType,
        transferMode: config.transferMode,
        rationale: config.rationale,
      });
    },
  });

  // Issue Real Estate Token
  log('Issuing Real Estate Token...');
  const realEstate = await service.issueAsset({
    name: 'Dubai Marina Tower Unit 4501',
    assetType: AssetType.REAL_ESTATE,
    jurisdiction: 'AE',
    investorClass: InvestorClass.ACCREDITED,
    liquidityProfile: LiquidityProfile.SEMI_LIQUID,
    totalSupply: '1000000',
    lockupDays: 365,
    maxInvestors: 99,
    additionalJurisdictions: ['US', 'GB', 'SG'],
  });

  if (realEstate.success) {
    log('Asset Issued:', {
      id: realEstate.data.id,
      name: realEstate.data.name,
      compliance: realEstate.data.compliance,
    });
  }

  // Issue Carbon Credits
  log('\nIssuing Carbon Credits...');
  const carbon = await service.issueAsset({
    name: 'Verified Carbon Units 2024',
    assetType: AssetType.CARBON_CREDIT,
    jurisdiction: 'CH',
    investorClass: InvestorClass.RETAIL,
    liquidityProfile: LiquidityProfile.LIQUID,
    totalSupply: '1000000',
  });

  if (carbon.success) {
    log('Carbon Credits Issued:', {
      id: carbon.data.id,
      kycRequired: carbon.data.compliance.kycRequired,
      blockedCountries: carbon.data.compliance.blockedCountries,
    });
  }

  // Preview Configuration (without issuing)
  log('\nPreview: What would a Private Equity Fund look like?');
  const preview = service.previewConfiguration({
    assetType: AssetType.PRIVATE_EQUITY,
    jurisdiction: 'US',
    investorClass: InvestorClass.QUALIFIED_PURCHASER,
    liquidityProfile: LiquidityProfile.ILLIQUID,
  });

  if (preview.success) {
    log('Preview Result:', preview.data);
  }

  return { service, realEstate, carbon };
}

// ============================================================================
// DEMO 2: FULL SDK WORKFLOW
// ============================================================================

async function demo2_FullWorkflow() {
  divider('DEMO 2: Full SDK Workflow');

  const sdk = new TokenisationSDK({ useMockPlugins: true });

  // Create Parties
  log('Creating Issuer...');
  const issuer = sdk.parties_.create({
    name: 'Ahoy Properties LLC',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER],
    jurisdiction: 'AE',
  });
  sdk.parties_.setKyc(issuer.id, true);
  log('Issuer Created:', { id: issuer.id, name: issuer.name });

  log('\nCreating Investors...');
  const investor1 = sdk.parties_.create({
    name: 'Alice Smith',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'US',
  });
  sdk.parties_.setKyc(investor1.id, true);

  const investor2 = sdk.parties_.create({
    name: 'Bob Johnson',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'GB',
  });
  sdk.parties_.setKyc(investor2.id, true);
  log('Investors Created:', [investor1.name, investor2.name]);

  // Create Asset
  log('\nCreating Asset...');
  const asset = await sdk.assets.create({
    name: 'Premium Office Space - DIFC',
    rightType: RightType.OWNERSHIP,
    issuerId: issuer.id,
    jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
    metadata: {
      propertyType: 'COMMERCIAL',
      areaSqm: 500,
      annualRent: '250000',
    },
  });
  log('Asset Created:', { id: asset.id, state: asset.state });

  // Lifecycle Transitions
  log('\nTransitioning Asset through Lifecycle...');

  await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
  log('State: PENDING_VERIFICATION');

  await sdk.assets.verify(asset.id, issuer.id);
  log('State: VERIFIED');

  await sdk.assets.activate(asset.id, issuer.id);
  log('State: ACTIVE');

  // Mint Tokens
  log('\nMinting Tokens...');
  await sdk.tokens.mint(asset.id, investor1.id, '600000');
  await sdk.tokens.mint(asset.id, investor2.id, '400000');

  const balance1 = await sdk.tokens.getBalance(asset.id, investor1.id);
  const balance2 = await sdk.tokens.getBalance(asset.id, investor2.id);
  log('Balances:', { [investor1.name]: balance1, [investor2.name]: balance2 });

  // Transfer
  log('\nTransferring Tokens...');
  const transfer = await sdk.tokens.transfer(asset.id, investor1.id, investor2.id, '100000');
  log('Transfer Result:', { success: transfer.success });

  const newBalance1 = await sdk.tokens.getBalance(asset.id, investor1.id);
  const newBalance2 = await sdk.tokens.getBalance(asset.id, investor2.id);
  log('New Balances:', { [investor1.name]: newBalance1, [investor2.name]: newBalance2 });

  return { sdk, asset, issuer, investor1, investor2 };
}

// ============================================================================
// DEMO 3: CUSTODY & RECOVERY
// ============================================================================

async function demo3_CustodyRecovery() {
  divider('DEMO 3: Custody & Recovery');

  const custody = new CustodyManager();

  // Create Multi-Sig Custody
  log('Setting up 2-of-3 Multi-Sig Custody...');
  const arrangement = custody.createCustodyArrangement({
    assetId: 'asset-123',
    type: CustodyType.MULTI_SIG,
    threshold: 2,
    custodians: ['custodian-1', 'custodian-2', 'custodian-3'],
    metadata: { purpose: 'Institutional custody' },
  });
  log('Custody Arrangement:', {
    id: arrangement.id,
    type: arrangement.type,
    threshold: arrangement.threshold,
    custodians: arrangement.custodians,
  });

  // Initiate Recovery (Lost Key Scenario)
  log('\nInitiating Recovery for Lost Key...');
  const recovery = custody.initiateRecovery({
    assetId: 'asset-123',
    requestedBy: 'user-456',
    reason: RecoveryReason.LOST_KEY,
    newOwner: '0xNewAddress123',
    documents: ['notarized-affidavit.pdf', 'identity-verification.pdf'],
  });
  log('Recovery Request:', {
    id: recovery.id,
    status: recovery.status,
    requiredApprovals: recovery.requiredApprovals,
    timeLockSeconds: recovery.timeLockSeconds,
  });

  // Approve Recovery
  log('\nApproving Recovery (Custodian 1)...');
  const afterFirst = custody.approveRecovery({
    requestId: recovery.id,
    approverId: 'custodian-1',
    approverRole: 'CUSTODIAN',
    approved: true,
  });
  log('After 1st approval:', {
    status: afterFirst.status,
    approvals: afterFirst.approvals.length,
  });

  // Only attempt second approval if still pending
  if (afterFirst.status === 'PENDING') {
    log('Approving Recovery (Custodian 2)...');
    const approved = custody.approveRecovery({
      requestId: recovery.id,
      approverId: 'custodian-2',
      approverRole: 'CUSTODIAN',
      approved: true,
    });
    log('Recovery Status:', {
      status: approved.status,
      approvals: approved.approvals.length,
      executableAfter: approved.executableAfter,
    });
  } else {
    log('Recovery already approved after first custodian');
  }

  // Regulatory Override
  log('\nRequesting Regulatory Freeze...');
  const override = custody.requestOverride({
    type: OverrideType.REGULATORY_FREEZE,
    assetId: 'asset-123',
    targetAddress: '0xSuspiciousAddress',
    requestedBy: 'compliance-officer',
    authority: 'VARA',
    referenceNumber: 'VARA-2024-001',
    action: 'FREEZE',
    documents: ['regulatory-order.pdf'],
  });
  log('Override Request:', {
    id: override.id,
    type: override.type,
    action: override.action,
  });

  // Delegation
  log('\nCreating Delegation (Vote Rights)...');
  const delegation = custody.createDelegation({
    assetId: 'asset-123',
    delegator: 'holder-1',
    delegate: 'fund-manager',
    permissions: ['VOTE', 'CLAIM_DIVIDENDS'],
    constraints: [{ type: 'TIME_WINDOW', value: { start: '2024-01-01', end: '2024-12-31' } }],
    expiresAt: '2024-12-31T23:59:59Z',
  });
  log('Delegation Created:', {
    id: delegation.id,
    permissions: delegation.permissions,
  });

  return { custody, arrangement, recovery, override, delegation };
}

// ============================================================================
// DEMO 4: INDEXING & REPORTING
// ============================================================================

async function demo4_IndexingReporting() {
  divider('DEMO 4: Indexing & Reporting');

  const indexer = new IndexingEngine();

  // Index Events
  log('Indexing Events...');

  indexer.indexEvent({
    type: IndexedEventType.MINT,
    assetId: 'asset-123',
    actor: 'issuer-1',
    data: { to: 'investor-1', amount: '500000' },
  });

  indexer.indexEvent({
    type: IndexedEventType.MINT,
    assetId: 'asset-123',
    actor: 'issuer-1',
    data: { to: 'investor-2', amount: '300000' },
  });

  indexer.indexEvent({
    type: IndexedEventType.TRANSFER,
    assetId: 'asset-123',
    actor: 'investor-1',
    data: { from: 'investor-1', to: 'investor-3', amount: '100000' },
  });

  indexer.indexEvent({
    type: IndexedEventType.KYC_VERIFIED,
    assetId: 'asset-123',
    actor: 'compliance-1',
    data: { investor: 'investor-3', level: 'ACCREDITED' },
  });

  log('Events Indexed: 4');

  // Query Balances
  log('\nQuerying Balances...');
  const balances = indexer.getAssetBalances('asset-123');
  log('Balances:', balances.map((b: { holder: string; balance: string }) => ({ holder: b.holder, balance: b.balance })));

  // Query Transfers
  log('\nQuerying Transfers...');
  const transfers = indexer.queryTransfers({ assetId: 'asset-123' });
  log('Transfers:', transfers.map((t: { type: string; from: string; to: string; amount: string }) => ({
    type: t.type,
    from: t.from.substring(0, 10) + '...',
    to: t.to.substring(0, 10) + '...',
    amount: t.amount,
  })));

  // Asset Statistics
  log('\nAsset Statistics...');
  const stats = indexer.getAssetStats('asset-123');
  log('Stats:', stats);

  // Compliance Report
  log('\nGenerating Compliance Report...');
  const report = indexer.generateComplianceReport('asset-123');
  log('Compliance Report Summary:', report.summary);

  // Export Audit Log
  log('\nExporting Audit Log (CSV preview)...');
  const csv = indexer.exportAuditLog('asset-123', 'csv');
  log('CSV Lines:', csv.split('\n').length);

  return { indexer, stats, report };
}

// ============================================================================
// DEMO 5: ASSET PACKS
// ============================================================================

async function demo5_AssetPacks() {
  divider('DEMO 5: Asset Packs with Lifecycle Rules');

  // List Available Packs
  log('Available Asset Packs:');
  const packs = AssetPackRegistry.list();
  packs.forEach(pack => {
    log(`  - ${pack.id}: ${pack.description}`);
  });

  // Get Private Equity Pack
  log('\nPrivate Equity Fund Pack Details:');
  const pePack = AssetPackRegistry.get('PRIVATE_EQUITY_FUND');
  if (pePack) {
    log('Defaults:', pePack.defaults);
    log('Lifecycle Rules:', pePack.lifecycleRules.length + ' rules');
    log('Compliance Rules:', pePack.complianceRules.map(r => r.name));
    log('Required Verifications:', pePack.requiredVerifications.map(v => v.type));
    if (pePack.distributionSchedule) {
      log('Distribution:', pePack.distributionSchedule);
    }
    if (pePack.governance) {
      log('Governance:', pePack.governance);
    }
  }

  // Validate Metadata
  log('\nValidating PE Fund Metadata...');
  const validMetadata = {
    fundName: 'Ahoy Growth Fund I',
    vintageYear: 2024,
    targetSize: '100000000',
    managementFee: 2,
    carriedInterest: 20,
    investmentPeriodYears: 5,
  };
  const validation = AssetPackRegistry.validateMetadata('PRIVATE_EQUITY_FUND', validMetadata);
  log('Validation Result:', validation);

  // Search by Tags
  log('\nSearching Packs by Tag "retail"...');
  const retailPacks = AssetPackRegistry.searchByTags(['retail']);
  log('Found:', retailPacks.map(p => p.id));

  return { pePack, validation };
}

// ============================================================================
// DEMO 6: CHAINLINK INTEGRATION SHOWCASE
// ============================================================================

async function demo6_ChainlinkShowcase() {
  divider('DEMO 6: Chainlink Integration Showcase');

  const BASE_SEPOLIA_CHAIN_ID = 84532;
  const BASE_SEPOLIA_RPC_URL = 'https://sepolia.base.org';

  // --- DECO: Privacy-preserving proof ---
  log('--- DECO: Privacy-Preserving Proof ---');

  const deco = new DecoPlugin({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    verifierAddress: '0x0000000000000000000000000000000000000001',
  });

  const balanceProof = await deco.createProof({
    proofType: DecoProofType.BALANCE_THRESHOLD,
    dataSource: {
      url: 'https://api.bank.com/v1/balance',
      method: 'GET',
      jsonPath: '$.balance',
    },
    claim: {
      field: 'balance',
      operator: 'gte',
      threshold: 100000,
    },
    metadata: { purpose: 'Accredited investor verification' },
  });

  if (balanceProof.success) {
    log('DECO Proof Created:', {
      proofId: balanceProof.data.proofId,
      type: 'BALANCE_THRESHOLD',
      claim: 'balance >= $100,000 (exact amount hidden)',
    });
  } else {
    log('DECO Proof (simulated):', {
      purpose: 'Prove balance >= $100K without revealing exact amount',
      proofType: 'BALANCE_THRESHOLD',
      status: 'Would create verifiable proof via attestation node',
    });
  }

  const accreditedProof = await deco.createProof({
    proofType: DecoProofType.ACCREDITED_INVESTOR,
    dataSource: {
      url: 'https://api.broker.com/v1/accreditation',
      method: 'GET',
      jsonPath: '$.status',
    },
    claim: {
      field: 'status',
      operator: 'eq',
      threshold: 'ACCREDITED',
    },
    metadata: { purpose: 'SEC accredited investor proof' },
  });

  if (accreditedProof.success) {
    log('DECO Accredited Proof:', { proofId: accreditedProof.data.proofId });
  } else {
    log('DECO Accredited Proof (simulated):', {
      purpose: 'Prove accreditation status without revealing income/net worth',
    });
  }

  // --- CCID: Cross-vertical identity passport ---
  log('\n--- CCID: Cross-Vertical Identity Passport ---');

  const ccid = new CCIDPlugin({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    registryAddress: '0x0000000000000000000000000000000000000001',
  });

  const identityCheck = await ccid.checkIdentity({
    partyId: 'investor-showcase-001',
    verticals: [
      CCIDVertical.REAL_ESTATE,
      CCIDVertical.FINANCE,
      CCIDVertical.AIRLINE,
      CCIDVertical.HOTEL,
    ],
    requiredClearances: ['KYC_VERIFIED', 'ACCREDITED', 'JURISDICTION_APPROVED'],
  });

  if (identityCheck.success) {
    log('CCID Identity Verified:', {
      passportId: identityCheck.data.passportId,
      verticalsCleared: identityCheck.data.verticalsCleared,
      clearances: identityCheck.data.clearances,
    });
  } else {
    log('CCID Identity (simulated):', {
      purpose: 'Portable identity across real estate, finance, airline, hotel verticals',
      benefit: 'KYC once, use everywhere — no repeated verification',
    });
  }

  // --- ACE: Automated compliance attestation ---
  log('\n--- ACE: Automated Compliance Attestation ---');

  const ace = new ChainlinkAcePlugin({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    routerAddress: '0x0000000000000000000000000000000000000001',
  });

  const eligibility = await ace.checkEligibility({
    investorId: 'investor-showcase-001',
    assetId: 'asset-showcase-001',
    jurisdiction: 'US',
    investorType: 'INDIVIDUAL',
    kycVerified: true,
    accredited: true,
  });

  if (eligibility.success) {
    log('ACE Eligibility:', {
      eligible: eligibility.data.eligible,
      policiesEvaluated: eligibility.data.policiesEvaluated,
      reason: eligibility.data.reason,
    });
  } else {
    log('ACE Eligibility (simulated):', {
      purpose: 'On-chain automated compliance check before any token operation',
      checks: ['KYC status', 'Jurisdiction rules', 'Accreditation level', 'Sanctions screening'],
    });
  }

  const attestation = await ace.createAttestation({
    assetId: 'asset-showcase-001',
    actorId: 'issuer-showcase-001',
    action: 'MINT_APPROVAL',
    context: {
      investorId: 'investor-showcase-001',
      amount: '50000',
      complianceResult: 'ALLOW',
    },
  });

  if (attestation.success) {
    log('ACE Attestation:', {
      attestationId: attestation.data.attestationId,
      status: attestation.data.status,
    });
  } else {
    log('ACE Attestation (simulated):', {
      purpose: 'Immutable on-chain record of compliance decision',
      auditTrail: 'Regulators can verify compliance at any time',
    });
  }

  // --- Amadeus: Flight status check ---
  log('\n--- Amadeus: Flight Status Check ---');

  const amadeus = new AmadeusFlightPlugin({
    apiKey: process.env.AMADEUS_API_KEY || 'test-key',
    apiSecret: process.env.AMADEUS_API_SECRET || 'test-secret',
    testMode: true,
  });

  const flightStatus = await amadeus.getFlightStatus({
    flightNumber: 'EK-201',
    departureDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  if (flightStatus.success) {
    log('Flight Status:', {
      flight: 'EK-201',
      status: flightStatus.data.status,
      departure: flightStatus.data.departure,
      arrival: flightStatus.data.arrival,
    });
  } else {
    log('Flight Status (simulated):', {
      purpose: 'Real-time flight data for tokenized ticket automation',
      triggers: ['Auto-refund on cancellation', 'Loyalty points on landing', 'Insurance claim on delay'],
    });
  }

  const searchResult = await amadeus.searchFlights({
    origin: 'DXB',
    destination: 'LHR',
    departureDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    adults: 1,
  });

  if (searchResult.success) {
    log('Flight Search:', {
      route: 'DXB → LHR',
      offers: searchResult.data.length,
    });
  } else {
    log('Flight Search (simulated):', {
      purpose: 'Tokenize flight offers directly from Amadeus GDS',
    });
  }

  // --- OracleAggregator: Multi-source price aggregation ---
  log('\n--- OracleAggregator: Multi-Source Price Aggregation ---');

  const aggregator = new OracleAggregator({
    strategy: AggregationStrategy.MEDIAN,
    sources: [
      { name: 'Chainlink ETH/USD', type: 'chainlink', pair: 'ETH/USD', weight: 1 },
      { name: 'Chainlink BTC/USD', type: 'chainlink', pair: 'BTC/USD', weight: 1 },
      { name: 'CoinGecko', type: 'custom', endpoint: 'https://api.coingecko.com/v3/price', weight: 1 },
      { name: 'CoinMarketCap', type: 'custom', endpoint: 'https://api.cmc.com/v1/price', weight: 1 },
    ],
    minSources: 2,
    maxStalenessMs: 300_000,
  });

  const ethAgg = await aggregator.aggregatePrice('ETH/USD');

  if (ethAgg.success) {
    log('ETH/USD Aggregated:', {
      value: ethAgg.data.aggregatedValue,
      strategy: 'MEDIAN',
      sourcesUsed: ethAgg.data.sourcesUsed,
      confidence: ethAgg.data.confidence,
    });
  } else {
    log('ETH/USD Aggregation (simulated):', {
      purpose: 'Combine multiple oracle sources for tamper-resistant pricing',
      strategies: ['MEDIAN — resistant to single-source manipulation', 'MEAN — weighted average', 'PRIMARY_FALLBACK — cascading trust'],
    });
  }

  // Cleanup
  deco.destroy();
  ccid.destroy();
  ace.destroy();
  amadeus.destroy();
  aggregator.destroy();

  log('\nChainlink Integration Summary:');
  log('  • DECO — Privacy-preserving proofs (balance, accreditation, age)');
  log('  • CCID — Cross-vertical identity portability');
  log('  • ACE — Automated compliance attestation on-chain');
  log('  • Amadeus — Real-time flight data for ticket tokenization');
  log('  • OracleAggregator — Multi-source tamper-resistant pricing');
}

// ============================================================================
// RUN ALL DEMOS
// ============================================================================

async function runAllDemos() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        TOKENISATION SDK - FEATURE SHOWCASE               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    await demo1_AssetIssuance();
    await demo2_FullWorkflow();
    await demo3_CustodyRecovery();
    await demo4_IndexingReporting();
    await demo5_AssetPacks();
    await demo6_ChainlinkShowcase();

    divider('SHOWCASE COMPLETE');
    log('All demos completed successfully!');
    log('');
    log('Key Takeaways:');
    log('  1. Issue assets without knowing ERC standards');
    log('  2. Compliance checks on every operation');
    log('  3. Full custody & recovery workflows');
    log('  4. Real-time indexing & regulatory reports');
    log('  5. Pre-built asset packs for common use cases');
    log('  6. Chainlink plugins: DECO, CCID, ACE, Amadeus, OracleAggregator');
    log('');
  } catch (error) {
    console.error('Demo failed:', error);
  }
}

// Run if executed directly
runAllDemos();
