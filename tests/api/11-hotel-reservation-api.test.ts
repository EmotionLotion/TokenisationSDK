/**
 * AHOY API Test Suite
 * Test 11: Hotel Reservation Lifecycle
 *
 * Tests hotel reservation management via the dedicated /api/v1/hotels endpoint.
 * Status flow: CREATED -> CONFIRMED -> CHECKED_IN -> CHECKED_OUT -> CLOSED
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient, testId } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'sk_test_sandbox_key_12345';

describe('11. Hotel Reservation Lifecycle API', () => {
  let client: ApiClient;
  let reservationId: string;
  let transferReservationId: string;
  const checkInDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const checkOutDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const extendedCheckOutDate = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  // ── Create Reservation ────────────────────────────────────────────────

  it('11.1 - Create hotel reservation', async () => {
    const result = await client.post('/api/v1/hotels', {
      hotelCode: `HTL${testId('').slice(0, 6)}`,
      hotelName: 'Grand Hyatt Dubai',
      guestName: `Guest ${testId('guest')}`,
      checkInDate,
      checkOutDate,
      roomType: 'Deluxe King',
      rate: '450.00',
      currency: 'USD',
      confirmationCode: testId('CONF').slice(0, 16),
      bookingReference: testId('RES').slice(0, 16),
      transferable: true,
      metadata: {
        nights: 3,
        guestCount: 2,
        specialRequests: 'High floor, late checkout',
      },
    });

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    expect(result.data.status).toBe('CREATED');

    reservationId = result.data.id;
  });

  // ── Retrieve ──────────────────────────────────────────────────────────

  it('11.2 - Retrieve reservation by ID', async () => {
    const result = await client.get(`/api/v1/hotels/${reservationId}`);

    expect(result.data.id).toBe(reservationId);
    expect(result.data.status).toBe('CREATED');
  });

  // ── List ──────────────────────────────────────────────────────────────

  it('11.3 - List hotel reservations', async () => {
    const result = await client.get('/api/v1/hotels', {
      limit: 5,
    });

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  // ── Confirm ─────────────────────────────────────────────────────────

  it('11.4 - Confirm reservation', async () => {
    const result = await client.post(`/api/v1/hotels/${reservationId}/confirm`);

    expect(result.data.status).toBe('CONFIRMED');
  });

  // ── Check-in ──────────────────────────────────────────────────────────

  it('11.5 - Check in guest', async () => {
    const result = await client.post(`/api/v1/hotels/${reservationId}/check-in`, {
      roomNumber: '1205',
      actor: 'front-desk',
    });

    expect(result.data.status).toBe('CHECKED_IN');
  });

  // ── Extend Stay ─────────────────────────────────────────────────────

  it('11.6 - Extend stay', async () => {
    const result = await client.post(`/api/v1/hotels/${reservationId}/extend`, {
      newCheckOutDate: extendedCheckOutDate,
    });

    expect(result.data).toBeDefined();
  });

  // ── Check-out ─────────────────────────────────────────────────────────

  it('11.7 - Check out guest', async () => {
    const result = await client.post(`/api/v1/hotels/${reservationId}/check-out`);

    expect(result.data.status).toBe('CHECKED_OUT');
  });

  // ── Close ─────────────────────────────────────────────────────────────

  it('11.8 - Close reservation', async () => {
    const result = await client.post(`/api/v1/hotels/${reservationId}/close`);

    expect(result.data.status).toBe('CLOSED');
  });

  // ── Transfer ──────────────────────────────────────────────────────────

  it('11.9 - Transfer reservation to another guest', async () => {
    // Create a new reservation for transfer testing
    const newRes = await client.post('/api/v1/hotels', {
      hotelCode: `HTL${testId('').slice(0, 6)}`,
      hotelName: 'Marriott JBR',
      guestName: `TransferGuest ${testId('guest')}`,
      checkInDate,
      checkOutDate,
      roomType: 'Standard Queen',
      rate: '320.00',
      currency: 'USD',
      confirmationCode: testId('CONF').slice(0, 16),
      bookingReference: testId('XFR').slice(0, 16),
      transferable: true,
      metadata: {},
    });

    transferReservationId = newRes.data.id;

    const transferResult = await client.post(`/api/v1/hotels/${transferReservationId}/transfer`, {
      toWallet: '0xNewGuestWallet00000000000000000',
      idempotencyKey: testId('htl-xfer'),
    });

    expect(transferResult.data).toBeDefined();
    expect(transferResult.data.id).toBeDefined();
  });

  // ── Approve Transfer ──────────────────────────────────────────────────

  it('11.10 - Approve transfer', async () => {
    // Create and transfer a reservation, then approve it
    const res = await client.post('/api/v1/hotels', {
      hotelCode: `HTL${testId('').slice(0, 6)}`,
      hotelName: 'Hilton Creek',
      guestName: `ApproveGuest ${testId('guest')}`,
      checkInDate,
      checkOutDate,
      roomType: 'Suite',
      rate: '600.00',
      currency: 'USD',
      confirmationCode: testId('CONF').slice(0, 16),
      bookingReference: testId('APR').slice(0, 16),
      transferable: true,
      metadata: {},
    });

    const transfer = await client.post(`/api/v1/hotels/${res.data.id}/transfer`, {
      toWallet: '0xApproveWallet000000000000000000',
      idempotencyKey: testId('htl-apr'),
    });

    const approveResult = await client.post(`/api/v1/hotels/transfers/${transfer.data.id}/approve`);

    expect(approveResult.data).toBeDefined();
  });

  // ── Cancel ────────────────────────────────────────────────────────────

  it('11.11 - Cancel reservation', async () => {
    const newRes = await client.post('/api/v1/hotels', {
      hotelCode: `HTL${testId('').slice(0, 6)}`,
      hotelName: 'Radisson Blu',
      guestName: `CancelGuest ${testId('guest')}`,
      checkInDate,
      checkOutDate,
      roomType: 'Standard Twin',
      rate: '280.00',
      currency: 'USD',
      confirmationCode: testId('CONF').slice(0, 16),
      bookingReference: testId('CNCL').slice(0, 16),
      transferable: false,
      metadata: {},
    });

    const result = await client.post(`/api/v1/hotels/${newRes.data.id}/cancel`, {
      reason: 'Guest cancelled trip',
    });

    expect(result.data.status).toBe('CANCELLED');
  });

  // ── Event History ─────────────────────────────────────────────────────

  it('11.12 - Get reservation event history', async () => {
    const result = await client.get(`/api/v1/hotels/${reservationId}/events`);

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });
});
