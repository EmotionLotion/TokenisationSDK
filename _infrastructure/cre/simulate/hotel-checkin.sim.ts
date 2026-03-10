/**
 * CRE Simulation: Hotel Check-In Reconciliation Workflow
 *
 * Tests PMS webhook consumption and on-chain state transition pipeline.
 * Run with: cre workflow simulate --config simulate/hotel-checkin.sim.ts
 *
 * @module cre/simulate/hotel-checkin
 */

import type { PMSWebhookPayload } from '../src/workflows/hotel-checkin.js';

/**
 * Simulated PMS webhook events
 */
export const simulationEvents: PMSWebhookPayload[] = [
  {
    eventType: 'room_checked_in',
    pmsReservationId: 'RES-SIM-001',
    tokenId: '100',
    tokenAddress: '0x5555555555555555555555555555555555555555',
    guestAddress: '0x6666666666666666666666666666666666666666',
    roomNumber: '301',
    pmsTimestamp: new Date().toISOString(),
    pmsSource: 'oracle-ohip',
  },
  {
    eventType: 'room_checked_out',
    pmsReservationId: 'RES-SIM-002',
    tokenId: '101',
    tokenAddress: '0x5555555555555555555555555555555555555555',
    guestAddress: '0x7777777777777777777777777777777777777777',
    roomNumber: '405',
    pmsTimestamp: new Date().toISOString(),
    pmsSource: 'mews',
  },
  {
    eventType: 'no_show',
    pmsReservationId: 'RES-SIM-003',
    tokenId: '102',
    tokenAddress: '0x5555555555555555555555555555555555555555',
    guestAddress: '0x8888888888888888888888888888888888888888',
    pmsTimestamp: new Date().toISOString(),
    pmsSource: 'oracle-ohip',
  },
];

/**
 * Simulated Oracle OHIP raw webhook (for normalization testing)
 */
export const simulationOHIPWebhook = {
  eventId: 'EVT-OHIP-001',
  hotelId: 'HTLSIM001',
  type: 'CHECKIN',
  data: {
    confirmationNumber: 'RES-SIM-004',
    guestProfile: {
      profileId: 'GP-001',
      firstName: 'Jane',
      lastName: 'Doe',
    },
    roomNumber: '512',
    arrivalDate: '2025-01-15',
    departureDate: '2025-01-18',
    status: 'CheckedIn',
  },
  timestamp: new Date().toISOString(),
  signature: 'sim-hmac-signature',
};

/**
 * Simulated Mews raw webhook (for normalization testing)
 */
export const simulationMewsWebhook = {
  Type: 'ReservationStarted',
  Id: 'MEWS-EVT-001',
  ReservationId: 'RES-SIM-005',
  State: 'Started',
  RoomNumber: '208',
  CustomerId: 'CUST-001',
  StartUtc: new Date().toISOString(),
  EndUtc: new Date(Date.now() + 3 * 86400000).toISOString(),
};

/**
 * Environment overrides for simulation
 */
export const envOverrides: Record<string, string> = {
  RESERVATION_LOOKUP_URL: 'https://httpbin.org/post',
  HOTEL_CHECKIN_CALLBACK_URL: 'https://httpbin.org/post',
  CRE_CHAIN_ID: '11155111',
};

/**
 * Expected simulation outcomes
 */
export const expectations = {
  /** All events should produce a state transition result */
  allEventsProcessed: true,
  /** OHIP webhook should normalize to standard format */
  ohipNormalizationWorks: true,
  /** Mews webhook should normalize to standard format */
  mewsNormalizationWorks: true,
  /** Check-in should transition from state 1 (CONFIRMED) to state 2 (CHECKED_IN) */
  checkInTargetState: 2,
  /** Check-out should transition to state 3 (CHECKED_OUT) */
  checkOutTargetState: 3,
  /** No-show should transition to state 6 (NO_SHOW) */
  noShowTargetState: 6,
};

export default {
  simulationEvents,
  simulationOHIPWebhook,
  simulationMewsWebhook,
  envOverrides,
  expectations,
};
