/**
 * Demo 1: Real Estate — Chainlink Price Feeds
 *
 * Tokenizes a Dubai Marina property, wires Chainlink price feeds to
 * OracleService for live NAV calculation, then mints equity tokens.
 */

import {
  TokenisationSDK,
  RightType,
  LifecycleState,
  PartyType,
  PartyRole,
  TransferabilityMode,
  OracleService,
  OracleFailSafeMode,
  createChainlinkWiredSDK,
} from '@tokenisation/sdk';

import {
  log, logStep, logSuccess, logInfo, logWarning,
  BASE_SEPOLIA_RPC_URL, BASE_SEPOLIA_CHAIN_ID,
} from './helpers.js';

export async function realEstateDemo() {
  log('DEMO 1: REAL ESTATE', 'Chainlink Price Feeds → Property NAV');

  // --- SDK + Parties ---
  const sdk = new TokenisationSDK({ useMockPlugins: true });

  const issuer = sdk.parties_.create({
    name: 'Dubai Properties LLC',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
    jurisdiction: 'AE',
    email: 'admin@dubaiproperties.ae',
    legalEntityId: 'LEI-AE-12345',
    metadata: { companyRegistration: 'DED-123456' },
  });
  sdk.parties_.setKyc(issuer.id, true);

  const investor = sdk.parties_.create({
    name: 'Ahmed Al Maktoum',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'AE',
    email: 'ahmed@example.com',
  });
  sdk.parties_.setKyc(investor.id, true);

  logSuccess(`Issuer: ${issuer.name}`);
  logSuccess(`Investor: ${investor.name}`);

  // --- Asset ---
  const property = await sdk.assets.create({
    name: 'Dubai Marina Tower - Unit 1501',
    description: 'Luxury 2-bedroom apartment with full marina view. 1,850 sq ft.',
    rightType: RightType.OWNERSHIP,
    issuerId: issuer.id,
    jurisdiction: {
      countryCode: 'AE',
      regulatoryFramework: 'UAE_VARA',
      accreditedOnly: false,
      blockedJurisdictions: ['KP', 'IR', 'SY'],
    },
    validityPeriod: { isPerpetual: true, startTime: new Date().toISOString() },
    transferabilityRules: {
      mode: TransferabilityMode.COMPLIANCE_GATED,
      lockupPeriodSeconds: 0,
      maxHolders: 100,
      requireKyc: true,
    },
    metadata: {
      propertyType: 'RESIDENTIAL',
      valuationUSD: '2500000',
      deedNumber: 'DEED-DM-2024-1501',
    },
  });

  logSuccess(`Asset: ${property.name}`);

  // --- Lifecycle ---
  await sdk.assets.transition(property.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
  await sdk.assets.verify(property.id, issuer.id);
  await sdk.assets.activate(property.id, issuer.id);
  logSuccess('Lifecycle: DRAFT → VERIFIED → ACTIVE');

  // --- Wire Chainlink price feeds ---
  logStep(1, 'Wire Chainlink DataFeedPlugin → OracleService');

  const oracleService = new OracleService({
    strictMode: false,
    failSafeMode: OracleFailSafeMode.ALLOW_WITH_WARNING,
  });

  const chainlink = createChainlinkWiredSDK({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    dataFeeds: {
      pairs: ['ETH/USD', 'BTC/USD'],
      pollIntervalMs: 60_000,
      navMappings: {
        [property.id]: { pair: 'ETH/USD', currency: 'USD' },
      },
    },
    oracleService,
  });

  logSuccess('Chainlink wired — DataFeedBridge ready');
  logInfo('Chain', `Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`);

  // --- Sync prices ---
  logStep(2, 'Sync live Chainlink prices');

  try {
    if (chainlink.dataFeedBridge) {
      await chainlink.dataFeedBridge.syncOnce();
      logSuccess('Synced prices from Base Sepolia');
    }
  } catch {
    logWarning('RPC unreachable — seeding mock prices');
    oracleService.setPriceFeed('ETH/USD', '182345000000', 8);
    oracleService.setPriceFeed('BTC/USD', '4321067000000', 8);
  }

  // --- Show prices ---
  const ethPrice = await oracleService.getPrice('ETH/USD');
  const btcPrice = await oracleService.getPrice('BTC/USD');

  const formatPrice = (data: { value: unknown }) => {
    const v = data.value as { price?: string; decimals?: number } | string;
    if (typeof v === 'string') return `$${Number(v).toLocaleString()}`;
    if (v && v.price) return `$${Number(v.price).toLocaleString()}`;
    return String(data.value);
  };

  if (ethPrice.success) logSuccess(`ETH/USD: ${formatPrice(ethPrice.data)}`);
  else logInfo('ETH/USD', `unavailable (${ethPrice.error})`);

  if (btcPrice.success) logSuccess(`BTC/USD: ${formatPrice(btcPrice.data)}`);
  else logInfo('BTC/USD', `unavailable (${btcPrice.error})`);

  logInfo('Oracle health', oracleService.getHealthStatus());

  // --- Mint ---
  logStep(3, 'Mint property tokens to investor');

  const mintResult = await sdk.tokens.mint(property.id, investor.id, '600');
  if (mintResult.success) {
    const balance = await sdk.tokens.getBalance(property.id, investor.id);
    logSuccess(`Minted 600 tokens to ${investor.name} — balance: ${balance}`);
  }

  chainlink.stop();
  logSuccess('Demo 1 complete — Real Estate with Chainlink Price Feeds\n');
}
