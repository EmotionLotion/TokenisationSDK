/**
 * CRE Simulation: Flight Status Oracle Workflow
 *
 * Tests the flight status fetching and consensus pipeline.
 * Run with: cre workflow simulate --config simulate/flight-status.sim.ts
 *
 * @module cre/simulate/flight-status
 */

import type { FlightStatusRequest } from '../src/workflows/flight-status.js';

/**
 * Simulation inputs — flights to check
 */
export const simulationInputs: FlightStatusRequest[] = [
  {
    flightNumber: 'EK001',
    departureDate: '2025-01-15',
    callbackUrl: 'https://httpbin.org/post',
    ticketId: 'sim-ticket-001',
  },
  {
    flightNumber: 'AA100',
    departureDate: '2025-01-15',
    callbackUrl: 'https://httpbin.org/post',
    ticketId: 'sim-ticket-002',
  },
];

/**
 * Environment overrides for simulation
 */
export const envOverrides: Record<string, string> = {
  AVIATIONSTACK_API_KEY: process.env.AVIATIONSTACK_API_KEY || 'sim-key',
  FLIGHTAWARE_API_KEY: process.env.FLIGHTAWARE_API_KEY || 'sim-key',
  FUNCTIONS_CONSUMER_ADDRESS: '0x0000000000000000000000000000000000000000',
  CRE_DON_ID: 'sim-don-01',
  CRE_CHAIN_ID: '11155111',
};

/**
 * Expected simulation outcomes
 */
export const expectations = {
  /** Each flight should return a status object */
  shouldReturnStatus: true,
  /** Status should be one of the valid values */
  validStatuses: ['scheduled', 'active', 'landed', 'cancelled', 'diverted', 'unknown'],
  /** Delay should be a non-negative integer */
  delayNonNegative: true,
  /** Callback POST should succeed (httpbin returns 200) */
  callbackShouldSucceed: true,
};

export default { simulationInputs, envOverrides, expectations };
