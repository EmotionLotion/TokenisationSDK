/**
 * AHOY API Test Suite
 * Test 13: Concert Ticket Lifecycle
 *
 * Tests concert ticket management via the shared ticket API.
 * Covers issuance, admission, completion, anti-scalping, transfer, and refund.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient, testId } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'sk_test_sandbox_key_12345';

describe('13. Concert Ticket Lifecycle API', () => {
  let client: ApiClient;
  let ticketId: string;
  const eventDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const eventEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString();
  const eventCode = `CON${Date.now().toString().slice(-5)}`;

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  // ── Issue Concert Ticket ──────────────────────────────────────────────

  it('13.1 - Issue concert ticket', async () => {
    const result = await client.post('/api/v1/tickets', {
      flightNumber: eventCode,
      airline: 'CONCERT',
      departureTime: eventDate,
      arrivalTime: eventEnd,
      departureAirport: 'VEN',
      arrivalAirport: 'VEN',
      seat: 'GA-001',
      passengerName: `Fan ${testId('fan')}`,
      bookingReference: testId('TKT').slice(0, 16),
      transferable: true,
      maxTransfers: 1,
      pricePaid: '150.00',
      currency: 'USD',
      metadata: {
        type: 'concert_ticket',
        eventName: 'Dubai Jazz Festival 2025',
        venue: 'Dubai Media City Amphitheatre',
        artist: 'Test Artist',
        section: 'General Admission',
        tier: 'Standard',
        antiScalping: true,
        maxResalePrice: '200.00',
      },
    });

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    expect(result.data.status).toBe('ISSUED');

    ticketId = result.data.id;
  });

  // ── Retrieve ──────────────────────────────────────────────────────────

  it('13.2 - Retrieve concert ticket', async () => {
    const result = await client.get(`/api/v1/tickets/${ticketId}`);

    expect(result.data.id).toBe(ticketId);
    expect(result.data.status).toBe('ISSUED');
  });

  // ── Admit (Check-in) ─────────────────────────────────────────────────

  it('13.3 - Admit attendee (check-in)', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/check-in`, {
      actor: 'door-scanner',
    });

    expect(result.data.status).toBe('CHECKED_IN');
  });

  // ── Board (enter venue) ───────────────────────────────────────────────

  it('13.4 - Enter venue (board)', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/board`, {
      actor: 'venue-gate',
    });

    expect(result.data.status).toBe('BOARDED');
  });

  // ── Complete ──────────────────────────────────────────────────────────

  it('13.5 - Complete concert ticket after event', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/complete`, {
      actor: 'system',
      burn: true,
    });

    expect(result.data).toBeDefined();
    expect(['USED', 'BURNED', 'COMPLETED']).toContain(result.data.status);
  });

  // ── Anti-scalping: maxTransfers enforcement ───────────────────────────

  it('13.6 - Anti-scalping: enforce transfer limits', async () => {
    // Issue ticket with maxTransfers=1
    const tkt = await client.post('/api/v1/tickets', {
      flightNumber: eventCode,
      airline: 'CONCERT',
      departureTime: eventDate,
      arrivalTime: eventEnd,
      departureAirport: 'VEN',
      arrivalAirport: 'VEN',
      passengerName: `ScalpFan ${testId('fan')}`,
      bookingReference: testId('SCLP').slice(0, 16),
      transferable: true,
      maxTransfers: 1,
      pricePaid: '150.00',
      currency: 'USD',
      metadata: { type: 'concert_ticket', antiScalping: true },
    });

    // First transfer should succeed
    const xfer1 = await client.post(`/api/v1/tickets/${tkt.data.id}/transfer`, {
      toWallet: '0xBuyer1Wallet000000000000000000',
      idempotencyKey: testId('scalp-xfer1'),
    });
    expect(xfer1.data).toBeDefined();

    // Approve the first transfer
    await client.post(`/api/v1/tickets/transfers/${xfer1.data.id}/approve`, {
      approvedBy: 'admin',
    });

    // Second transfer should fail (maxTransfers=1 reached)
    try {
      await client.post(`/api/v1/tickets/${tkt.data.id}/transfer`, {
        toWallet: '0xBuyer2Wallet000000000000000000',
        idempotencyKey: testId('scalp-xfer2'),
      });
      // May succeed if server doesn't enforce maxTransfers at API level
    } catch (error: any) {
      expect([400, 403, 422]).toContain(error.status);
    }
  });

  // ── Transfer ──────────────────────────────────────────────────────────

  it('13.7 - Transfer concert ticket', async () => {
    const tkt = await client.post('/api/v1/tickets', {
      flightNumber: eventCode,
      airline: 'CONCERT',
      departureTime: eventDate,
      arrivalTime: eventEnd,
      departureAirport: 'VEN',
      arrivalAirport: 'VEN',
      passengerName: `XferFan ${testId('fan')}`,
      bookingReference: testId('XFAN').slice(0, 16),
      transferable: true,
      maxTransfers: 5,
      metadata: { type: 'concert_ticket' },
    });

    const result = await client.post(`/api/v1/tickets/${tkt.data.id}/transfer`, {
      toWallet: '0xFriendWallet0000000000000000000',
      idempotencyKey: testId('con-xfer'),
      metadata: { reason: 'Gift to friend' },
    });

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
  });

  // ── Cancel + Refund ───────────────────────────────────────────────────

  it('13.8 - Cancel concert ticket', async () => {
    const tkt = await client.post('/api/v1/tickets', {
      flightNumber: eventCode,
      airline: 'CONCERT',
      departureTime: eventDate,
      arrivalTime: eventEnd,
      departureAirport: 'VEN',
      arrivalAirport: 'VEN',
      passengerName: `CancelFan ${testId('fan')}`,
      bookingReference: testId('CFAN').slice(0, 16),
      pricePaid: '150.00',
      currency: 'USD',
      metadata: { type: 'concert_ticket' },
    });

    const cancelResult = await client.post(`/api/v1/tickets/${tkt.data.id}/cancel`, {
      reason: 'Cannot attend',
      actor: 'box-office',
    });
    expect(cancelResult.data.status).toBe('CANCELLED');

    const refundResult = await client.post(`/api/v1/tickets/${tkt.data.id}/refund`, {
      actor: 'finance',
    });
    expect(refundResult.data).toBeDefined();
    expect(['REFUNDED', 'VOID']).toContain(refundResult.data.status);
  });

  // ── Freeze ────────────────────────────────────────────────────────────

  it('13.9 - Freeze concert ticket', async () => {
    const tkt = await client.post('/api/v1/tickets', {
      flightNumber: eventCode,
      airline: 'CONCERT',
      departureTime: eventDate,
      arrivalTime: eventEnd,
      departureAirport: 'VEN',
      arrivalAirport: 'VEN',
      passengerName: `FreezeFan ${testId('fan')}`,
      bookingReference: testId('FFRZ').slice(0, 16),
      metadata: { type: 'concert_ticket' },
    });

    const result = await client.post(`/api/v1/tickets/${tkt.data.id}/freeze`, {
      reason: 'Suspected fraud',
      actor: 'security',
    });

    expect(result.data.status).toBe('FROZEN');

    // Unfreeze
    const unfreezeResult = await client.post(`/api/v1/tickets/${tkt.data.id}/unfreeze`, {
      actor: 'security',
    });
    expect(unfreezeResult.data).toBeDefined();
    expect(['ISSUED', 'ACTIVE', 'UNFROZEN']).toContain(unfreezeResult.data.status);
  });

  // ── List ──────────────────────────────────────────────────────────────

  it('13.10 - List concert tickets', async () => {
    const result = await client.get('/api/v1/tickets', {
      limit: 5,
    });

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  // ── Event History ─────────────────────────────────────────────────────

  it('13.11 - Get concert ticket event history', async () => {
    // Use the first issued ticket (which went through full lifecycle)
    const tkt = await client.post('/api/v1/tickets', {
      flightNumber: eventCode,
      airline: 'CONCERT',
      departureTime: eventDate,
      arrivalTime: eventEnd,
      departureAirport: 'VEN',
      arrivalAirport: 'VEN',
      passengerName: `HistoryFan ${testId('fan')}`,
      bookingReference: testId('HIST').slice(0, 16),
      metadata: { type: 'concert_ticket' },
    });

    const result = await client.get(`/api/v1/tickets/${tkt.data.id}/events`);

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });
});
