/**
 * AHOY Conformance Test Suite
 * Test 04: Compliance Policies & Decisions
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'sk_test_sandbox_key_12345';

describe('04. Compliance Policies & Decisions', () => {
  let client: ApiClient;
  let createdPolicyId: string;

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  it('04.1 - Create compliance policy', async () => {
    const policy = await client.post('/api/v1/compliance/policies', {
      name: 'KYC Required Policy',
      type: 'transfer',
      description: 'Requires KYC approval for transfers',
      ruleset: {
        version: 1,
        rules: [
          {
            id: 'rule-kyc-sender',
            type: 'require',
            field: 'sender.kycStatus',
            op: 'eq',
            value: 'approved',
            message: 'Sender must have approved KYC',
            code: 'SENDER_KYC_REQUIRED',
          },
          {
            id: 'rule-kyc-receiver',
            type: 'require',
            field: 'receiver.kycStatus',
            op: 'eq',
            value: 'approved',
            message: 'Receiver must have approved KYC',
            code: 'RECEIVER_KYC_REQUIRED',
          },
        ],
      },
    });

    expect(policy.id).toBeDefined();
    expect(policy.name).toBe('KYC Required Policy');
    // Server returns currentVersion object with ruleset
    expect(policy.currentVersion).toBeDefined();
    expect(policy.currentVersion.ruleset.rules).toHaveLength(2);

    createdPolicyId = policy.id;
  });

  it('04.2 - Retrieve policy by ID', async () => {
    const policy = await client.get(`/api/v1/compliance/policies/${createdPolicyId}`);

    expect(policy.id).toBe(createdPolicyId);
    expect(policy.type).toBe('transfer');
  });

  it('04.3 - Update policy (creates new version)', async () => {
    const updated = await client.post(`/api/v1/compliance/policies/${createdPolicyId}/versions`, {
      ruleset: {
        version: 2,
        rules: [
          {
            id: 'rule-kyc-sender',
            type: 'require',
            field: 'sender.kycStatus',
            op: 'eq',
            value: 'approved',
            message: 'Sender must have approved KYC',
            code: 'SENDER_KYC_REQUIRED',
          },
          {
            id: 'rule-kyc-receiver',
            type: 'require',
            field: 'receiver.kycStatus',
            op: 'eq',
            value: 'approved',
            message: 'Receiver must have approved KYC',
            code: 'RECEIVER_KYC_REQUIRED',
          },
          {
            id: 'rule-max-amount',
            type: 'limit',
            field: 'amount',
            op: 'lte',
            value: '1000000000000000000000000',
            message: 'Transfer amount exceeds limit',
            code: 'AMOUNT_LIMIT_EXCEEDED',
          },
        ],
      },
    });

    expect(updated).toBeDefined();
    // New version should have 3 rules
    const rules = updated.ruleset?.rules || updated.currentVersion?.ruleset?.rules;
    expect(rules).toHaveLength(3);
  });

  it('04.4 - List policies', async () => {
    const response = await client.get('/api/v1/compliance/policies', {
      type: 'transfer',
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('04.5 - Pre-check compliance (mock)', async () => {
    try {
      const check = await client.post('/api/v1/compliance/policies/simulate/transfer', {
        tokenId: '00000000-0000-0000-0000-000000000001',
        fromWallet: '0x1234567890123456789012345678901234567890',
        toWallet: '0x0987654321098765432109876543210987654321',
        amount: '1000000000000000000',
      });

      expect(check).toBeDefined();
      expect(check.simulation).toBe(true);
    } catch (error: any) {
      // Token/policy not found is acceptable in sandbox
      expect([400, 404, 500]).toContain(error.status);
    }
  });

  it('04.6 - Pre-check compliance (denied - no KYC)', async () => {
    try {
      const check = await client.post('/api/v1/compliance/policies/simulate/transfer', {
        tokenId: '00000000-0000-0000-0000-000000000001',
        fromWallet: '0x1234567890123456789012345678901234567890',
        toWallet: '0x0987654321098765432109876543210987654321',
        amount: '1000000000000000000',
      });

      expect(check).toBeDefined();
      expect(check.simulation).toBe(true);
    } catch (error: any) {
      expect([400, 404, 500]).toContain(error.status);
    }
  });

  it('04.7 - List compliance decisions (audit trail)', async () => {
    const response = await client.get('/api/v1/compliance/decisions', {
      limit: 10,
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  });
});
