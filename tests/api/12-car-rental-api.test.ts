/**
 * AHOY API Test Suite
 * Test 12: Car Rental Lifecycle
 *
 * Tests car rental management via the shared ticket API.
 * Car rentals are issued as tickets with rental-specific metadata.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient, testId } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'sk_test_sandbox_key_12345';

describe('12. Car Rental Lifecycle API', () => {
  let client: ApiClient;
  let rentalId: string;
  const pickupTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const returnTime = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  // ── Create Rental ─────────────────────────────────────────────────────

  it('12.1 - Create car rental booking', async () => {
    const result = await client.post('/api/v1/tickets', {
      flightNumber: `CAR${testId('').slice(0, 6)}`,
      airline: 'RENTAL',
      departureTime: pickupTime,
      arrivalTime: returnTime,
      departureAirport: 'PUP',
      arrivalAirport: 'RET',
      passengerName: `Renter ${testId('renter')}`,
      bookingReference: testId('RNT').slice(0, 16),
      pricePaid: '320.00',
      currency: 'USD',
      transferable: true,
      maxTransfers: 1,
      metadata: {
        type: 'car_rental',
        vehicleMake: 'Toyota',
        vehicleModel: 'Camry',
        vehicleYear: 2024,
        vehiclePlate: 'DXB-A-12345',
        pickupLocation: 'Dubai Airport Terminal 3',
        returnLocation: 'Dubai Airport Terminal 3',
        insuranceType: 'comprehensive',
        fuelPolicy: 'full-to-full',
        mileageLimit: 'unlimited',
      },
    });

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    expect(result.data.status).toBe('ISSUED');

    rentalId = result.data.id;
  });

  // ── Retrieve ──────────────────────────────────────────────────────────

  it('12.2 - Retrieve rental by ID', async () => {
    const result = await client.get(`/api/v1/tickets/${rentalId}`);

    expect(result.data.id).toBe(rentalId);
    expect(result.data.status).toBe('ISSUED');
  });

  // ── Confirm (Check-in) ───────────────────────────────────────────────

  it('12.3 - Confirm rental / pickup check-in', async () => {
    const result = await client.post(`/api/v1/tickets/${rentalId}/check-in`, {
      actor: 'rental-desk',
    });

    expect(result.data.status).toBe('CHECKED_IN');
  });

  // ── Pickup (Board) ───────────────────────────────────────────────────

  it('12.4 - Pickup vehicle (board)', async () => {
    const result = await client.post(`/api/v1/tickets/${rentalId}/board`, {
      actor: 'rental-desk',
    });

    expect(result.data.status).toBe('BOARDED');
  });

  // ── Return + Inspect (Complete) ───────────────────────────────────────

  it('12.5 - Return vehicle and complete inspection', async () => {
    const result = await client.post(`/api/v1/tickets/${rentalId}/complete`, {
      actor: 'inspection-agent',
      burn: false,
    });

    expect(result.data).toBeDefined();
    expect(['USED', 'COMPLETED', 'BURNED']).toContain(result.data.status);
  });

  // ── Transfer ──────────────────────────────────────────────────────────

  it('12.6 - Transfer rental to another driver', async () => {
    const newRental = await client.post('/api/v1/tickets', {
      flightNumber: `CAR${testId('').slice(0, 6)}`,
      airline: 'RENTAL',
      departureTime: pickupTime,
      arrivalTime: returnTime,
      departureAirport: 'PUP',
      arrivalAirport: 'RET',
      passengerName: `TransferRenter ${testId('renter')}`,
      bookingReference: testId('XFR').slice(0, 16),
      transferable: true,
      metadata: { type: 'car_rental', vehicleMake: 'Nissan', vehicleModel: 'Patrol' },
    });

    const result = await client.post(`/api/v1/tickets/${newRental.data.id}/transfer`, {
      toWallet: '0xNewDriverWallet0000000000000000',
      idempotencyKey: testId('car-xfer'),
    });

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
  });

  // ── Cancel ────────────────────────────────────────────────────────────

  it('12.7 - Cancel rental booking', async () => {
    const newRental = await client.post('/api/v1/tickets', {
      flightNumber: `CAR${testId('').slice(0, 6)}`,
      airline: 'RENTAL',
      departureTime: pickupTime,
      arrivalTime: returnTime,
      departureAirport: 'PUP',
      arrivalAirport: 'RET',
      passengerName: `CancelRenter ${testId('renter')}`,
      bookingReference: testId('CNCL').slice(0, 16),
      metadata: { type: 'car_rental' },
    });

    const result = await client.post(`/api/v1/tickets/${newRental.data.id}/cancel`, {
      reason: 'Plans changed',
      actor: 'customer-service',
    });

    expect(result.data.status).toBe('CANCELLED');
  });

  // ── Freeze ────────────────────────────────────────────────────────────

  it('12.8 - Freeze rental for investigation', async () => {
    const newRental = await client.post('/api/v1/tickets', {
      flightNumber: `CAR${testId('').slice(0, 6)}`,
      airline: 'RENTAL',
      departureTime: pickupTime,
      arrivalTime: returnTime,
      departureAirport: 'PUP',
      arrivalAirport: 'RET',
      passengerName: `FreezeRenter ${testId('renter')}`,
      bookingReference: testId('FRZ').slice(0, 16),
      metadata: { type: 'car_rental' },
    });

    const result = await client.post(`/api/v1/tickets/${newRental.data.id}/freeze`, {
      reason: 'Accident report under review',
      actor: 'claims-dept',
    });

    expect(result.data.status).toBe('FROZEN');
  });

  // ── List ──────────────────────────────────────────────────────────────

  it('12.9 - List car rentals', async () => {
    const result = await client.get('/api/v1/tickets', {
      limit: 5,
    });

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  // ── Event History ─────────────────────────────────────────────────────

  it('12.10 - Get rental event history', async () => {
    const result = await client.get(`/api/v1/tickets/${rentalId}/events`);

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });
});
