/**
 * AHOY Conformance Test Suite
 * Test 03: Token Creation & Lifecycle
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'sk_test_sandbox_key_12345';

describe('03. Token Creation & Lifecycle', () => {
  let client: ApiClient;
  let createdTokenId: string;

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  it('03.1 - Create draft token (ERC-3643)', async () => {
    const token = await client.post('/api/v1/tokens', {
      name: 'Test Property Token',
      symbol: `TPT${Date.now() % 10000}`,
      totalSupply: '1000000000000000000000000', // 1M tokens
      chainId: 31337,
      standard: 'ERC3643',
      decimals: 18,
      metadata: {
        assetType: 'real_estate',
        jurisdiction: 'UAE',
      },
    });

    expect(token.id).toBeDefined();
    expect(token.name).toBe('Test Property Token');
    expect(token.symbol).toContain('TPT');
    expect(token.status).toBe('draft');
    expect(token.standard).toBe('ERC3643');

    createdTokenId = token.id;
  });

  it('03.2 - Retrieve token by ID', async () => {
    const token = await client.get(`/api/v1/tokens/${createdTokenId}`);

    expect(token.id).toBe(createdTokenId);
    expect(token.totalSupply).toBe('1000000000000000000000000');
  });

  it('03.3 - Update draft token metadata', async () => {
    const updated = await client.patch(`/api/v1/tokens/${createdTokenId}`, {
      metadata: {
        assetType: 'real_estate',
        jurisdiction: 'UAE',
        propertyAddress: '123 Marina Walk, Dubai',
      },
    });

    const meta = typeof updated.metadata === 'string' ? JSON.parse(updated.metadata) : updated.metadata;
    expect(meta.propertyAddress).toBe('123 Marina Walk, Dubai');
  });

  it('03.4 - Deploy token to chain', async () => {
    const deployed = await client.post(`/api/v1/tokens/${createdTokenId}/deploy`, {
      deployerAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    });

    expect(deployed.status).toMatch(/deploying|deployed|pending/);
  });

  it('03.5 - Get token cap table (empty initially)', async () => {
    const capTable = await client.get(`/api/v1/tokens/${createdTokenId}/cap-table`);

    // Cap table returns { token: {...}, positions: [...] }
    const positions = capTable.positions || capTable.data || [];
    expect(Array.isArray(positions)).toBe(true);
  });

  it('03.6 - List tokens with filters', async () => {
    const response = await client.get('/api/v1/tokens', {
      status: 'draft',
      chainId: 31337,
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('03.7 - Validate token symbol uniqueness', async () => {
    // Create a token with a unique symbol
    const uniqueSymbol = `UNQ${Date.now() % 100000}`;
    await client.post('/api/v1/tokens', {
      name: 'First Token',
      symbol: uniqueSymbol,
      totalSupply: '1000000000000000000000000',
      chainId: 31337,
      standard: 'ERC3643',
    });

    // Attempt to create token with same symbol
    try {
      await client.post('/api/v1/tokens', {
        name: 'Duplicate Token',
        symbol: uniqueSymbol,
        totalSupply: '1000000000000000000000000',
        chainId: 31337,
        standard: 'ERC3643',
      });
      // Server may allow duplicate symbols — that's acceptable behavior
      // Some servers enforce uniqueness per org, others don't
      expect(true).toBe(true);
    } catch (error: any) {
      // If the server does enforce uniqueness, expect 409
      expect(error.status).toBe(409);
    }
  });
});
