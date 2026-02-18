/**
 * CRE Simulation: Car Rental Telematics Workflow
 *
 * Tests the Smartcar / High Mobility telematics pipeline with mock data.
 * Run with: cre workflow simulate --config simulate/car-rental-telematics.sim.ts
 *
 * @module cre/simulate/car-rental-telematics
 */

import type { ActiveRental } from '../src/workflows/car-rental-telematics.js';

/**
 * Simulation active rentals — one within limits, one with overages
 */
export const simulationRentals: ActiveRental[] = [
  {
    rentalId: 'sim-rental-001',
    vehicleId: 'VH-SIM-001',
    smartcarVehicleId: 'sc-sim-001',
    renterAddress: '0x1111111111111111111111111111111111111111',
    tokenAddress: '0x2222222222222222222222222222222222222222',
    tokenId: '1',
    depositContractAddress: '0x3333333333333333333333333333333333333333',
    startOdometer: 50000,
    mileageLimit: 500,
    fuelLevelStart: 100,
    minFuelReturn: 75,
    perKmOverageRate: '100000000000000', // 0.0001 ETH per km
    fuelPenaltyRate: '50000000000000',   // 0.00005 ETH per 1%
  },
  {
    rentalId: 'sim-rental-002',
    vehicleId: 'VH-SIM-002',
    smartcarVehicleId: 'sc-sim-002',
    renterAddress: '0x4444444444444444444444444444444444444444',
    tokenAddress: '0x2222222222222222222222222222222222222222',
    tokenId: '2',
    depositContractAddress: '0x3333333333333333333333333333333333333333',
    startOdometer: 30000,
    mileageLimit: 300,
    fuelLevelStart: 100,
    minFuelReturn: 50,
    perKmOverageRate: '100000000000000',
    fuelPenaltyRate: '50000000000000',
    geofence: {
      centerLat: 25.2048,
      centerLng: 55.2708,
      radiusKm: 50,
    },
    geofencePenaltyRate: '500000000000000', // 0.0005 ETH per violation
  },
];

/**
 * Environment overrides for simulation
 */
export const envOverrides: Record<string, string> = {
  SMARTCAR_ACCESS_TOKEN: process.env.SMARTCAR_ACCESS_TOKEN || 'sim-token',
  HIGH_MOBILITY_TOKEN: process.env.HIGH_MOBILITY_TOKEN || 'sim-token',
  CRE_ACTIVE_RENTALS: JSON.stringify(simulationRentals),
  TELEMATICS_CALLBACK_URL: 'https://httpbin.org/post',
  CRE_CHAIN_ID: '11155111',
};

/**
 * Expected simulation outcomes
 */
export const expectations = {
  /** Both rentals should be processed */
  rentalsProcessed: 2,
  /** Usage reports should include odometer and fuel readings */
  reportsHaveReadings: true,
  /** Overage detection should function correctly */
  overageDetectionWorks: true,
};

export default { simulationRentals, envOverrides, expectations };
