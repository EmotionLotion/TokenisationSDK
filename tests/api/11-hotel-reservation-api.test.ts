/**
 * AHOY API Test Suite
 * Test 11: Hotel Reservation Lifecycle
 *
 * Tests hotel reservation management via the shared ticket API.
 * Hotel reservations are issued as tickets with hotel-specific metadata.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient, testId } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'sk_test_sandbox_key_12345';

describe('11. Hotel Reservation Lifecycle API', () => {
  let client: ApiClient;
  let reservationId: string;
  const checkInDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const checkOutDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  // ── Create Reservation ────────────────────────────────────────────────

  it('11.1 - Create hotel reservation', async () => {
    const result = await client.post('/api/v1/tickets', {
      flightNumber: `HTL${testId('').slice(0, 6)}`,
      airline: 'HOTEL',
      departureTime: checkInDate,
      arrivalTime: checkOutDate,
      departureAirport: 'CHK',
      arrivalAirport: 'OUT',
      passengerName: `Guest ${testId('guest')}`,
      bookingReference: testId('RES').slice(0, 16),
      pricePaid: '450.00',
      currency: 'USD',
      transferable: true,
      metadata: {
        type: 'hotel_reservation',
        hotelName: 'Grand Hyatt Dubai',
        roomType: 'Deluxe King',
        roomNumber: '1205',
        nights: 3,
        guestCount: 2,
        specialRequests: 'High floor, late checkout',
      },
    });

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    expect(result.data.status).toBe('ISSUED');

    reservationId = result.data.id;
  });

  // ── Retrieve ──────────────────────────────────────────────────────────

  it('11.2 - Retrieve reservation by ID', async () => {
    const result = await client.get(`/api/v1/tickets/${reservationId}`);

    expect(result.data.id).toBe(reservationId);
    expect(result.data.status).toBe('ISSUED');
  });

  // ── Check-in ──────────────────────────────────────────────────────────

  it('11.3 - Check in guest', async () => {
    const result = await client.post(`/api/v1/tickets/${reservationId}/check-in`, {
      actor: 'front-desk',
    });

    expect(result.data.status).toBe('CHECKED_IN');
  });

  // ── Check-out (complete) ──────────────────────────────────────────────

  it('11.4 - Check out guest (complete)', async () => {
    // Board represents check-out acknowledgement in hotel context
    const boardResult = await client.post(`/api/v1/tickets/${reservationId}/board`, {
      actor: 'front-desk',
    });
    expect(boardResult.data.status).toBe('BOARDED');

    const result = await client.post(`/api/v1/tickets/${reservationId}/complete`, {
      actor: 'system',
      burn: false,
    });

    expect(result.data).toBeDefined();
    expect(['USED', 'COMPLETED', 'BURNED']).toContain(result.data.status);
  });

  // ── Transfer ──────────────────────────────────────────────────────────

  it('11.5 - Transfer reservation to another guest', async () => {
    // Create a new reservation for transfer
    const newRes = await client.post('/api/v1/tickets', {
      flightNumber: `HTL${testId('').slice(0, 6)}`,
      airline: 'HOTEL',
      departureTime: checkInDate,
      arrivalTime: checkOutDate,
      departureAirport: 'CHK',
      arrivalAirport: 'OUT',
      passengerName: `TransferGuest ${testId('guest')}`,
      bookingReference: testId('XFR').slice(0, 16),
      transferable: true,
      metadata: { type: 'hotel_reservation', hotelName: 'Marriott JBR' },
    });

    const transferResult = await client.post(`/api/v1/tickets/${newRes.data.id}/transfer`, {
      toWallet: '0xNewGuestWallet00000000000000000',
      idempotencyKey: testId('htl-xfer'),
    });

    expect(transferResult.data).toBeDefined();
    expect(transferResult.data.id).toBeDefined();
  });

  // ── Cancel ────────────────────────────────────────────────────────────

  it('11.6 - Cancel reservation', async () => {
    const newRes = await client.post('/api/v1/tickets', {
      flightNumber: `HTL${testId('').slice(0, 6)}`,
      airline: 'HOTEL',
      departureTime: checkInDate,
      arrivalTime: checkOutDate,
      departureAirport: 'CHK',
      arrivalAirport: 'OUT',
      passengerName: `CancelGuest ${testId('guest')}`,
      bookingReference: testId('CNCL').slice(0, 16),
      metadata: { type: 'hotel_reservation' },
    });

    const result = await client.post(`/api/v1/tickets/${newRes.data.id}/cancel`, {
      reason: 'Guest cancelled trip',
      actor: 'reservations',
    });

    expect(result.data.status).toBe('CANCELLED');
  });

  // ── Freeze / Unfreeze ─────────────────────────────────────────────────

  it('11.7 - Freeze reservation', async () => {
    const newRes = await client.post('/api/v1/tickets', {
      flightNumber: `HTL${testId('').slice(0, 6)}`,
      airline: 'HOTEL',
      departureTime: checkInDate,
      arrivalTime: checkOutDate,
      departureAirport: 'CHK',
      arrivalAirport: 'OUT',
      passengerName: `FreezeGuest ${testId('guest')}`,
      bookingReference: testId('FRZ').slice(0, 16),
      metadata: { type: 'hotel_reservation' },
    });

    const freezeResult = await client.post(`/api/v1/tickets/${newRes.data.id}/freeze`, {
      reason: 'Payment dispute',
      actor: 'finance',
    });

    expect(freezeResult.data.status).toBe('FROZEN');

    const unfreezeResult = await client.post(`/api/v1/tickets/${newRes.data.id}/unfreeze`, {
      actor: 'finance',
    });

    expect(unfreezeResult.data).toBeDefined();
    expect(['ISSUED', 'ACTIVE', 'UNFROZEN']).toContain(unfreezeResult.data.status);
  });

  // ── List ──────────────────────────────────────────────────────────────

  it('11.8 - List hotel reservations', async () => {
    const result = await client.get('/api/v1/tickets', {
      limit: 5,
    });

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  // ── Event History ─────────────────────────────────────────────────────

  it('11.9 - Get reservation event history', async () => {
    const result = await client.get(`/api/v1/tickets/${reservationId}/events`);

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });
});
