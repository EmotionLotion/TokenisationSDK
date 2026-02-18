/**
 * CRE Simulation: Concert Royalty Enforcement Workflow
 *
 * Tests royalty calculation, DON consensus, and atomic settlement pipeline.
 * Run with: cre workflow simulate --config simulate/concert-royalty.sim.ts
 *
 * @module cre/simulate/concert-royalty
 */

import type { RoyaltyConfig } from '../src/workflows/concert-royalty.js';

/**
 * Simulated royalty configurations for different events
 */
export const simulationRoyaltyConfigs: RoyaltyConfig[] = [
  {
    tokenAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    eventId: 'EVT-SIM-001',
    eventName: 'Dubai Jazz Festival 2025',
    artistBps: 500,    // 5% artist royalty
    promoterBps: 300,  // 3% promoter royalty
    artistAddress: '0xART1111111111111111111111111111111111111',
    promoterAddress: '0xPRO2222222222222222222222222222222222222',
    minimumSalePrice: '10000000000000000', // 0.01 ETH
    royaltyCap: '1000000000000000000',     // 1 ETH max royalty
    primarySaleExempt: true,
    minterAddress: '0xMINT333333333333333333333333333333333333',
  },
  {
    tokenAddress: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    eventId: 'EVT-SIM-002',
    eventName: 'Coldplay World Tour — Abu Dhabi',
    artistBps: 1000,   // 10% artist royalty
    promoterBps: 500,  // 5% promoter royalty
    artistAddress: '0xART4444444444444444444444444444444444444',
    promoterAddress: '0xPRO5555555555555555555555555555555555555',
    minimumSalePrice: '50000000000000000', // 0.05 ETH
    royaltyCap: '0', // No cap
    primarySaleExempt: true,
    minterAddress: '0xMINT666666666666666666666666666666666666',
  },
];

/**
 * Simulated secondary market transfer events
 */
export const simulationTransfers = [
  {
    description: 'Standard secondary sale — royalties apply',
    tokenAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    from: '0x1111111111111111111111111111111111111111',
    to: '0x2222222222222222222222222222222222222222',
    tokenId: '42',
    salePrice: '500000000000000000', // 0.5 ETH
    expectedArtistRoyalty: '25000000000000000',  // 0.025 ETH (5%)
    expectedPromoterRoyalty: '15000000000000000', // 0.015 ETH (3%)
  },
  {
    description: 'Primary sale — exempt from royalties',
    tokenAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    from: '0xMINT333333333333333333333333333333333333',
    to: '0x3333333333333333333333333333333333333333',
    tokenId: '43',
    salePrice: '200000000000000000', // 0.2 ETH
    expectedArtistRoyalty: '0',
    expectedPromoterRoyalty: '0',
  },
  {
    description: 'Below minimum price — no royalties',
    tokenAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    from: '0x4444444444444444444444444444444444444444',
    to: '0x5555555555555555555555555555555555555555',
    tokenId: '44',
    salePrice: '5000000000000000', // 0.005 ETH (below 0.01 minimum)
    expectedArtistRoyalty: '0',
    expectedPromoterRoyalty: '0',
  },
  {
    description: 'High-value sale with royalty cap',
    tokenAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    from: '0x6666666666666666666666666666666666666666',
    to: '0x7777777777777777777777777777777777777777',
    tokenId: '45',
    salePrice: '50000000000000000000', // 50 ETH → 8% = 4 ETH but capped at 1 ETH
    expectedTotalRoyaltyCapped: '1000000000000000000', // 1 ETH cap
  },
];

/**
 * Environment overrides for simulation
 */
export const envOverrides: Record<string, string> = {
  CONCERT_TOKEN_ADDRESSES: simulationRoyaltyConfigs
    .map((c) => c.tokenAddress)
    .join(','),
  ROYALTY_REGISTRY_ADDRESS: '0x0000000000000000000000000000000000000000',
  ROYALTY_SETTLEMENT_ADDRESS: '0x0000000000000000000000000000000000000000',
  ROYALTY_CALLBACK_URL: 'https://httpbin.org/post',
  CRE_CHAIN_ID: '11155111',
};

/**
 * Expected simulation outcomes
 */
export const expectations = {
  /** Standard sale should have correct royalty split */
  standardSaleRoyaltiesCorrect: true,
  /** Primary sale should be exempt */
  primarySaleExempt: true,
  /** Below-minimum sale should skip royalties */
  belowMinimumSkipped: true,
  /** Cap should apply on high-value sales */
  royaltyCapApplied: true,
  /** DON consensus should agree on all royalty amounts */
  consensusAchieved: true,
};

export default {
  simulationRoyaltyConfigs,
  simulationTransfers,
  envOverrides,
  expectations,
};
