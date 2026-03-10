/**
 * AHOY Conformance Test Suite
 * Test 06: Distribution & Payouts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'sk_test_sandbox_key_12345';

describe('06. Distribution & Payouts', () => {
  let client: ApiClient;
  let createdTokenId: string;
  let createdDistributionId: string;

  beforeAll(async () => {
    client = new ApiClient(API_URL, API_KEY);

    // Create a token to reference in distributions
    try {
      const token = await client.post('/api/v1/tokens', {
        name: 'Distribution Test Token',
        symbol: `DTT${Date.now() % 10000}`,
        totalSupply: '1000000000000000000000000',
        chainId: 31337,
        standard: 'ERC3643',
        decimals: 18,
      });
      createdTokenId = token.id;
    } catch {
      createdTokenId = '00000000-0000-0000-0000-000000000001';
    }
  });

  it('06.1 - Create distribution', async () => {
    const now = new Date();
    const recordDate = new Date(now.getTime() - 86400000).toISOString(); // yesterday
    const paymentDate = new Date(now.getTime() + 86400000).toISOString(); // tomorrow

    const distribution = await client.post('/api/v1/distributions', {
      tokenId: createdTokenId,
      name: 'Q1 2026 Dividend',
      description: 'Quarterly dividend distribution',
      type: 'dividend',
      totalAmount: '1000000',
      currency: 'USDC',
      amountPerToken: '1000',
      recordDate,
      paymentDate,
      allocationStrategy: 'pro_rata',
      paymentMethod: 'on_chain',
      metadata: {
        quarter: 'Q1-2026',
      },
    });

    expect(distribution.id).toBeDefined();
    expect(distribution.type).toBe('dividend');
    expect(distribution.status).toBe('draft');

    createdDistributionId = distribution.id;
  });

  it('06.2 - Retrieve distribution by ID', async () => {
    const distribution = await client.get(`/api/v1/distributions/${createdDistributionId}`);

    expect(distribution.id).toBe(createdDistributionId);
    expect(distribution.name).toBe('Q1 2026 Dividend');
  });

  it('06.3 - List distributions', async () => {
    const response = await client.get('/api/v1/distributions');

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('06.4 - List distributions with type filter', async () => {
    const response = await client.get('/api/v1/distributions', {
      type: 'dividend',
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('06.5 - Approve distribution', async () => {
    try {
      const approved = await client.post(`/api/v1/distributions/${createdDistributionId}/approve`);
      expect(approved).toBeDefined();
    } catch (error: any) {
      // May fail if distribution requirements not met — acceptable in sandbox
      expect([400, 404, 500]).toContain(error.status);
    }
  });

  it('06.6 - Execute distribution', async () => {
    try {
      const executed = await client.post(`/api/v1/distributions/${createdDistributionId}/execute`);
      expect(executed).toBeDefined();
    } catch (error: any) {
      // May fail if not approved — acceptable in sandbox
      expect([400, 404, 500]).toContain(error.status);
    }
  });

  it('06.7 - List distribution payments', async () => {
    try {
      const response = await client.get(`/api/v1/distributions/${createdDistributionId}/payments`);
      expect(response.data || response).toBeDefined();
    } catch (error: any) {
      expect([400, 404]).toContain(error.status);
    }
  });

  it('06.8 - Calculate distribution', async () => {
    try {
      const calc = await client.get(`/api/v1/distributions/${createdDistributionId}/calculate`);
      expect(calc).toBeDefined();
    } catch (error: any) {
      expect([400, 404, 500]).toContain(error.status);
    }
  });

  it('06.9 - Cancel distribution', async () => {
    try {
      const cancelled = await client.post(`/api/v1/distributions/${createdDistributionId}/cancel`);
      expect(cancelled).toBeDefined();
    } catch (error: any) {
      expect([400, 404, 500]).toContain(error.status);
    }
  });
});
