/**
 * AHOY API Test Suite
 * Test 12: Car Rental Lifecycle
 *
 * Tests car rental management via the dedicated /api/v1/car-rentals endpoint.
 * Status flow: CREATED -> CONFIRMED -> PICKED_UP -> RETURNED -> INSPECTED -> CLOSED
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient, testId } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'sk_test_sandbox_key_12345';

describe('12. Car Rental Lifecycle API', () => {
  let client: ApiClient;
  let rentalId: string;
  const pickupDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const returnDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  // ── Create Rental ─────────────────────────────────────────────────────

  it('12.1 - Create car rental booking', async () => {
    const result = await client.post('/api/v1/car-rentals', {
      rentalCompanyCode: `RNT${testId('').slice(0, 6)}`,
      rentalCompanyName: 'Dubai Auto Rentals',
      driverName: `Driver ${testId('driver')}`,
      vehicleCategory: 'Full-Size Sedan',
      pickupDate,
      returnDate,
      pickupLocation: 'Dubai Airport Terminal 3',
      returnLocation: 'Dubai Airport Terminal 3',
      dailyRate: '106.67',
      currency: 'USD',
      depositAmount: '500.00',
      confirmationCode: testId('CONF').slice(0, 16),
      bookingReference: testId('RNT').slice(0, 16),
      transferable: true,
      metadata: {
        vehicleMake: 'Toyota',
        vehicleModel: 'Camry',
        vehicleYear: 2024,
        insuranceType: 'comprehensive',
        fuelPolicy: 'full-to-full',
        mileageLimit: 'unlimited',
      },
    });

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    expect(result.data.status).toBe('CREATED');

    rentalId = result.data.id;
  });

  // ── Retrieve ──────────────────────────────────────────────────────────

  it('12.2 - Retrieve rental by ID', async () => {
    const result = await client.get(`/api/v1/car-rentals/${rentalId}`);

    expect(result.data.id).toBe(rentalId);
    expect(result.data.status).toBe('CREATED');
  });

  // ── List ──────────────────────────────────────────────────────────────

  it('12.3 - List car rentals', async () => {
    const result = await client.get('/api/v1/car-rentals', {
      limit: 5,
    });

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  // ── Confirm ───────────────────────────────────────────────────────────

  it('12.4 - Confirm rental booking', async () => {
    const result = await client.post(`/api/v1/car-rentals/${rentalId}/confirm`);

    expect(result.data.status).toBe('CONFIRMED');
  });

  // ── Pickup ────────────────────────────────────────────────────────────

  it('12.5 - Pickup vehicle', async () => {
    const result = await client.post(`/api/v1/car-rentals/${rentalId}/pickup`, {
      mileage: 12500,
      fuelLevel: 'full',
    });

    expect(result.data.status).toBe('PICKED_UP');
  });

  // ── Return ────────────────────────────────────────────────────────────

  it('12.6 - Return vehicle', async () => {
    const result = await client.post(`/api/v1/car-rentals/${rentalId}/return`, {
      mileage: 13200,
      fuelLevel: 'three-quarter',
      damageReport: 'No damage observed',
    });

    expect(result.data.status).toBe('RETURNED');
  });

  // ── Inspect ───────────────────────────────────────────────────────────

  it('12.7 - Inspect vehicle and resolve deposit', async () => {
    const result = await client.post(`/api/v1/car-rentals/${rentalId}/inspect`, {
      depositResolution: 'RELEASED',
    });

    expect(result.data.status).toBe('INSPECTED');
  });

  // ── Close ─────────────────────────────────────────────────────────────

  it('12.8 - Close rental', async () => {
    const result = await client.post(`/api/v1/car-rentals/${rentalId}/close`);

    expect(result.data.status).toBe('CLOSED');
  });

  // ── Transfer ──────────────────────────────────────────────────────────

  it('12.9 - Transfer rental to another driver', async () => {
    const newRental = await client.post('/api/v1/car-rentals', {
      rentalCompanyCode: `RNT${testId('').slice(0, 6)}`,
      rentalCompanyName: 'Emirates Rent-A-Car',
      driverName: `TransferDriver ${testId('driver')}`,
      vehicleCategory: 'SUV',
      pickupDate,
      returnDate,
      pickupLocation: 'Dubai Mall Valet',
      returnLocation: 'Dubai Mall Valet',
      dailyRate: '200.00',
      currency: 'USD',
      depositAmount: '750.00',
      confirmationCode: testId('CONF').slice(0, 16),
      bookingReference: testId('XFR').slice(0, 16),
      transferable: true,
      metadata: { vehicleMake: 'Nissan', vehicleModel: 'Patrol' },
    });

    const result = await client.post(`/api/v1/car-rentals/${newRental.data.id}/transfer`, {
      toWallet: '0xNewDriverWallet0000000000000000',
      idempotencyKey: testId('car-xfer'),
    });

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
  });

  // ── Cancel ────────────────────────────────────────────────────────────

  it('12.10 - Cancel rental booking', async () => {
    const newRental = await client.post('/api/v1/car-rentals', {
      rentalCompanyCode: `RNT${testId('').slice(0, 6)}`,
      rentalCompanyName: 'Hertz Dubai',
      driverName: `CancelDriver ${testId('driver')}`,
      vehicleCategory: 'Compact',
      pickupDate,
      returnDate,
      pickupLocation: 'JBR Walk',
      returnLocation: 'JBR Walk',
      dailyRate: '80.00',
      currency: 'USD',
      depositAmount: '300.00',
      confirmationCode: testId('CONF').slice(0, 16),
      bookingReference: testId('CNCL').slice(0, 16),
      transferable: false,
      metadata: {},
    });

    const result = await client.post(`/api/v1/car-rentals/${newRental.data.id}/cancel`, {
      reason: 'Plans changed',
    });

    expect(result.data.status).toBe('CANCELLED');
  });

  // ── Event History ─────────────────────────────────────────────────────

  it('12.11 - Get rental event history', async () => {
    const result = await client.get(`/api/v1/car-rentals/${rentalId}/events`);

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });
});
