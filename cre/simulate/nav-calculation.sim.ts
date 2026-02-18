/**
 * CRE Simulation: NAV Calculation Workflow
 *
 * Tests the NAV calculation pipeline against live/mock valuation APIs.
 * Run with: cre workflow simulate --config simulate/nav-calculation.sim.ts
 *
 * @module cre/simulate/nav-calculation
 */

import type { NAVWorkflowConfig } from '../src/workflows/nav-calculation.js';

/**
 * Simulation configuration with mock valuation endpoints
 */
export const simulationConfig: NAVWorkflowConfig = {
  cronSchedule: '0 * * * *',
  scheduleMode: 'hourly',
  assetId: 'sim-real-estate-001',
  valuationEndpoints: [
    {
      name: 'Mock Estated API',
      url: 'https://httpbin.org/anything?valuation=5000000&source=estated',
      method: 'GET',
      valuePath: 'args.valuation',
      weight: 0.6,
    },
    {
      name: 'Mock DLD Valuation',
      url: 'https://httpbin.org/anything?valuation=5100000&source=dld',
      method: 'GET',
      valuePath: 'args.valuation',
      weight: 0.4,
    },
  ],
  liabilities: '200000000000000000000000', // 200,000 in 18 decimals
  tokenContractAddress: '0x0000000000000000000000000000000000000001',
  chainId: 11155111,
  rpcUrl: 'https://rpc.sepolia.org',
  oracleRegistryAddress: '',
  callbackUrl: '',
  callbackApiKey: '',
  currency: 'USD',
  decimals: 18,
};

/**
 * Expected simulation outcomes
 */
export const expectations = {
  /** NAV should be computed successfully */
  shouldSucceed: true,
  /** At least one valuation source should return data */
  minValuationSources: 1,
  /** NAV per token should be positive */
  navPerTokenPositive: true,
  /** Total supply read should not fail (mock returns 0 for simulation) */
  tolerateZeroSupply: false,
};

export default simulationConfig;
