/**
 * AHOY Conformance Test Suite
 * Test 02: Investor Onboarding & KYC
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiClient } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'ak_test_sandbox_key_12345';

describe('02. Investor Onboarding & KYC', () => {
  let client: ApiClient;
  let createdInvestorId: string;

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  it('02.1 - Create individual investor', async () => {
    const investor = await client.post('/api/v1/investors', {
      email: `test-${Date.now()}@example.com`,
      type: 'individual',
      countryCode: 'AE',
      profile: {
        firstName: 'Test',
        lastName: 'Investor',
      },
    });

    expect(investor.id).toBeDefined();
    expect(investor.email).toContain('@example.com');
    expect(investor.type).toBe('individual');
    expect(investor.status).toBe('pending');
    expect(investor.kycStatus).toBe('none');

    createdInvestorId = investor.id;
  });

  it('02.2 - Retrieve investor by ID', async () => {
    const investor = await client.get(`/api/v1/investors/${createdInvestorId}`);

    expect(investor.id).toBe(createdInvestorId);
    expect(investor.countryCode).toBe('AE');
  });

  it('02.3 - Update investor profile', async () => {
    const updated = await client.patch(`/api/v1/investors/${createdInvestorId}`, {
      profile: {
        firstName: 'Updated',
        lastName: 'Name',
        phone: '+971501234567',
      },
    });

    expect(updated.profile.firstName).toBe('Updated');
    expect(updated.profile.phone).toBe('+971501234567');
  });

  it('02.4 - Start KYC session (mock)', async () => {
    const session = await client.post(`/api/v1/investors/${createdInvestorId}/kyc`, {
      provider: 'sumsub',
      level: 'basic',
    });

    expect(session.id).toBeDefined();
    expect(session.status).toBe('pending');
    expect(session.provider).toBe('sumsub');
    // Mock KYC should provide verification URL
    expect(session.verificationUrl).toBeDefined();
  });

  it('02.5 - Add wallet to investor', async () => {
    const wallet = await client.post(`/api/v1/investors/${createdInvestorId}/wallets`, {
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      chainId: 31337,
      label: 'Primary Wallet',
    });

    expect(wallet.id).toBeDefined();
    expect(wallet.address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(wallet.status).toBe('pending');
  });

  it('02.6 - List investor wallets', async () => {
    const response = await client.get(`/api/v1/investors/${createdInvestorId}/wallets`);

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data.length).toBeGreaterThan(0);
  });

  it('02.7 - List investors with filters', async () => {
    const response = await client.get('/api/v1/investors', {
      type: 'individual',
      limit: 10,
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.count).toBeDefined();
  });

  it('02.8 - Create institutional investor', async () => {
    const investor = await client.post('/api/v1/investors', {
      email: `institution-${Date.now()}@example.com`,
      type: 'institutional',
      countryCode: 'AE',
      profile: {
        companyName: 'Test Holdings LLC',
        registrationNumber: 'REG-12345',
      },
    });

    expect(investor.type).toBe('institutional');
    expect(investor.profile.companyName).toBe('Test Holdings LLC');
  });
});
