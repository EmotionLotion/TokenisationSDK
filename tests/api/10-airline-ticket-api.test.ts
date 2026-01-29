/**
 * AHOY API Test Suite
 * Test 10: Airline Ticket Lifecycle
 *
 * Tests the airline ticket NFT lifecycle via REST API including
 * issuance, check-in, boarding, transfer, metadata, bulk ops, and reconciliation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient, testId } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'sk_test_sandbox_key_12345';

describe('10. Airline Ticket Lifecycle API', () => {
  let client: ApiClient;
  let ticketId: string;
  let transferId: string;
  const flightNumber = `EK${Date.now().toString().slice(-4)}`;
  const departureTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const arrivalTime = new Date(Date.now() + 56 * 60 * 60 * 1000).toISOString();

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  // ── Issue ──────────────────────────────────────────────────────────────

  it('10.1 - Issue a new airline ticket', async () => {
    const result = await client.post('/api/v1/tickets', {
      flightNumber,
      airline: 'EK',
      departureTime,
      arrivalTime,
      departureAirport: 'DXB',
      arrivalAirport: 'LHR',
      gate: 'B22',
      seat: '14A',
      ticketClass: 'BUSINESS',
      passengerName: `Passenger ${testId('pax')}`,
      bookingReference: testId('PNR').slice(0, 16),
      transferable: true,
      maxTransfers: 3,
      pricePaid: '2500.00',
      currency: 'USD',
      metadata: {
        meal: 'vegetarian',
        loyaltyNumber: 'EK123456',
      },
    });

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    expect(result.data.status).toBe('ISSUED');
    expect(result.data.flightNumber).toBe(flightNumber);

    ticketId = result.data.id;
  });

  // ── Retrieve ──────────────────────────────────────────────────────────

  it('10.2 - Retrieve ticket by ID', async () => {
    const result = await client.get(`/api/v1/tickets/${ticketId}`);

    expect(result.data.id).toBe(ticketId);
    expect(result.data.status).toBe('ISSUED');
    expect(result.data.departureAirport).toBe('DXB');
    expect(result.data.arrivalAirport).toBe('LHR');
  });

  // ── Check-in ──────────────────────────────────────────────────────────

  it('10.3 - Check in ticket', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/check-in`, {
      actor: 'test-agent',
    });

    expect(result.data.status).toBe('CHECKED_IN');
  });

  // ── Board ─────────────────────────────────────────────────────────────

  it('10.4 - Board ticket', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/board`, {
      actor: 'gate-agent',
    });

    expect(result.data.status).toBe('BOARDED');
  });

  // ── Complete ──────────────────────────────────────────────────────────

  it('10.5 - Complete ticket (with burn)', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/complete`, {
      actor: 'system',
      burn: true,
    });

    expect(result.data).toBeDefined();
    // Status should be USED or BURNED depending on implementation
    expect(['USED', 'BURNED', 'COMPLETED']).toContain(result.data.status);
  });

  // ── Cancel + Refund flow ──────────────────────────────────────────────

  it('10.6 - Issue ticket for cancel/refund flow', async () => {
    const result = await client.post('/api/v1/tickets', {
      flightNumber,
      airline: 'EK',
      departureTime,
      arrivalTime,
      departureAirport: 'DXB',
      arrivalAirport: 'LHR',
      passengerName: `CancelPax ${testId('pax')}`,
      bookingReference: testId('CNL').slice(0, 16),
      pricePaid: '500.00',
      currency: 'USD',
    });

    expect(result.data.id).toBeDefined();
    ticketId = result.data.id;
  });

  it('10.7 - Cancel ticket', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/cancel`, {
      reason: 'Passenger requested cancellation',
      actor: 'test-agent',
    });

    expect(result.data.status).toBe('CANCELLED');
  });

  it('10.8 - Refund cancelled ticket', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/refund`, {
      actor: 'finance-agent',
    });

    expect(result.data).toBeDefined();
    expect(['REFUNDED', 'VOID']).toContain(result.data.status);
  });

  // ── Freeze / Unfreeze ─────────────────────────────────────────────────

  it('10.9 - Issue ticket for freeze flow', async () => {
    const result = await client.post('/api/v1/tickets', {
      flightNumber,
      airline: 'EK',
      departureTime,
      arrivalTime,
      departureAirport: 'DXB',
      arrivalAirport: 'LHR',
      passengerName: `FreezePax ${testId('pax')}`,
      bookingReference: testId('FRZ').slice(0, 16),
    });

    ticketId = result.data.id;
  });

  it('10.10 - Freeze ticket', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/freeze`, {
      reason: 'Fraud investigation',
      actor: 'compliance-agent',
    });

    expect(result.data.status).toBe('FROZEN');
  });

  it('10.11 - Unfreeze ticket', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/unfreeze`, {
      actor: 'compliance-agent',
    });

    expect(result.data).toBeDefined();
    // Should return to previous state (ISSUED)
    expect(['ISSUED', 'ACTIVE', 'UNFROZEN']).toContain(result.data.status);
  });

  // ── Transfer ──────────────────────────────────────────────────────────

  it('10.12 - Request ticket transfer', async () => {
    const result = await client.post(`/api/v1/tickets/${ticketId}/transfer`, {
      toWallet: '0x70997970C51812dc3A010C7d01b50e0',
      idempotencyKey: testId('xfer'),
      metadata: { reason: 'Name change' },
    });

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    expect(result.data.status).toBeDefined();

    transferId = result.data.id;
  });

  it('10.13 - Approve transfer', async () => {
    const result = await client.post(`/api/v1/tickets/transfers/${transferId}/approve`, {
      approvedBy: 'admin-agent',
    });

    expect(result.data).toBeDefined();
    expect(['APPROVED', 'COMPLETED']).toContain(result.data.status);
  });

  // ── Metadata Update ───────────────────────────────────────────────────

  it('10.14 - Update ticket metadata (gate change)', async () => {
    // Issue a fresh ticket for metadata operations
    const issueResult = await client.post('/api/v1/tickets', {
      flightNumber,
      airline: 'EK',
      departureTime,
      arrivalTime,
      departureAirport: 'DXB',
      arrivalAirport: 'LHR',
      gate: 'A10',
      seat: '22B',
      passengerName: `MetaPax ${testId('pax')}`,
      bookingReference: testId('META').slice(0, 16),
    });

    ticketId = issueResult.data.id;

    const result = await client.patch(`/api/v1/tickets/${ticketId}/metadata`, {
      field: 'gate',
      newValue: 'B15',
      changeReason: 'Gate reassignment',
      changedBy: 'ops-agent',
    });

    expect(result.data).toBeDefined();
  });

  // ── Metadata History ──────────────────────────────────────────────────

  it('10.15 - Get metadata history', async () => {
    const result = await client.get(`/api/v1/tickets/${ticketId}/metadata-history`);

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  // ── Event History ─────────────────────────────────────────────────────

  it('10.16 - Get ticket event history', async () => {
    const result = await client.get(`/api/v1/tickets/${ticketId}/events`);

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  // ── Bulk Status Update ────────────────────────────────────────────────

  it('10.17 - Bulk status update', async () => {
    // Issue two tickets for bulk operation
    const t1 = await client.post('/api/v1/tickets', {
      flightNumber,
      airline: 'EK',
      departureTime,
      arrivalTime,
      departureAirport: 'DXB',
      arrivalAirport: 'LHR',
      passengerName: `Bulk1 ${testId('pax')}`,
      bookingReference: testId('BLK1').slice(0, 16),
    });
    const t2 = await client.post('/api/v1/tickets', {
      flightNumber,
      airline: 'EK',
      departureTime,
      arrivalTime,
      departureAirport: 'DXB',
      arrivalAirport: 'LHR',
      passengerName: `Bulk2 ${testId('pax')}`,
      bookingReference: testId('BLK2').slice(0, 16),
    });

    const result = await client.post('/api/v1/tickets/bulk/update-status', {
      ticketIds: [t1.data.id, t2.data.id],
      newStatus: 'CANCELLED',
      reason: 'Bulk test cancellation',
      actor: 'bulk-agent',
    });

    expect(result.data).toBeDefined();
  });

  // ── Flight Cancellation ───────────────────────────────────────────────

  it('10.18 - Cancel entire flight', async () => {
    const result = await client.post(`/api/v1/tickets/flights/${flightNumber}/cancel`, {
      reason: 'Weather disruption',
      actor: 'ops-agent',
    });

    expect(result.data).toBeDefined();
  });

  // ── Reconciliation Report ─────────────────────────────────────────────

  it('10.19 - Get flight reconciliation report', async () => {
    const result = await client.get(`/api/v1/tickets/flights/${flightNumber}/reconciliation`);

    expect(result.data).toBeDefined();
  });

  // ── List with Filters ─────────────────────────────────────────────────

  it('10.20 - List tickets with flight filter', async () => {
    const result = await client.get('/api/v1/tickets', {
      flightNumber,
      limit: 10,
    });

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('10.21 - List tickets with status filter', async () => {
    const result = await client.get('/api/v1/tickets', {
      status: 'CANCELLED',
      limit: 5,
    });

    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });
});
