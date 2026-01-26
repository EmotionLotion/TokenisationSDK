/**
 * AHOY Conformance Test Suite
 * Test 05: Transfer Operations
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'ak_test_sandbox_key_12345';

describe('05. Transfer Operations', () => {
  let client: ApiClient;
  let createdTransferId: string;

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  it('05.1 - Initiate transfer', async () => {
    const transfer = await client.post('/api/v1/transfers', {
      tokenId: 'tok_sample', // Use sample token
      fromWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      toWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      amount: '1000000000000000000', // 1 token
      metadata: {
        reason: 'Test transfer',
      },
    });

    expect(transfer.id).toBeDefined();
    expect(transfer.status).toBe('pending');
    expect(transfer.amount).toBe('1000000000000000000');

    createdTransferId = transfer.id;
  });

  it('05.2 - Retrieve transfer by ID', async () => {
    const transfer = await client.get(`/api/v1/transfers/${createdTransferId}`);

    expect(transfer.id).toBe(createdTransferId);
    expect(transfer.fromWallet).toBeDefined();
    expect(transfer.toWallet).toBeDefined();
  });

  it('05.3 - Pre-check transfer compliance', async () => {
    const check = await client.post('/api/v1/transfers/check', {
      tokenId: 'tok_sample',
      fromWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      toWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      amount: '1000000000000000000',
    });

    expect(check.allowed).toBeDefined();
    expect(typeof check.allowed).toBe('boolean');
  });

  it('05.4 - List transfers with filters', async () => {
    const response = await client.get('/api/v1/transfers', {
      status: 'pending',
      limit: 10,
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('05.5 - Cancel pending transfer', async () => {
    const cancelled = await client.post(`/api/v1/transfers/${createdTransferId}/cancel`);

    expect(cancelled.status).toBe('cancelled');
  });

  it('05.6 - Idempotent transfer creation', async () => {
    const idempotencyKey = `test-transfer-${Date.now()}`;

    // First request
    const transfer1 = await client.post('/api/v1/transfers', {
      tokenId: 'tok_sample',
      fromWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      toWallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      amount: '500000000000000000',
    }, {
      'Idempotency-Key': idempotencyKey,
    });

    // Second request with same key should return same result
    const transfer2 = await client.post('/api/v1/transfers', {
      tokenId: 'tok_sample',
      fromWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      toWallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      amount: '500000000000000000',
    }, {
      'Idempotency-Key': idempotencyKey,
    });

    expect(transfer1.id).toBe(transfer2.id);
  });

  it('05.7 - Transfer validation - insufficient balance', async () => {
    try {
      await client.post('/api/v1/transfers', {
        tokenId: 'tok_sample',
        fromWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        toWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        amount: '99999999999999999999999999999', // Way more than available
      });
      expect.fail('Should have thrown validation error');
    } catch (error: any) {
      expect(error.status).toBe(400);
    }
  });
});
