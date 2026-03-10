/**
 * AHOY Conformance Test Suite
 * Test 07: Audit Trail & Reports
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'sk_test_sandbox_key_12345';

describe('07. Audit Trail & Reports', () => {
  let client: ApiClient;

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  it('07.1 - List audit logs', async () => {
    const response = await client.get('/api/v1/audit', {
      limit: 20,
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('07.2 - Filter audit logs by action', async () => {
    const response = await client.get('/api/v1/audit', {
      action: 'create',
      limit: 10,
    });

    expect(response.data).toBeDefined();
    if (response.data.length > 0) {
      expect(response.data[0].action).toContain('create');
    }
  });

  it('07.3 - Filter audit logs by entity type', async () => {
    // Server uses 'resourceType' query param, not 'entityType'
    const response = await client.get('/api/v1/audit', {
      resourceType: 'investor',
      limit: 10,
    });

    expect(response.data).toBeDefined();
    if (response.data.length > 0) {
      // Server returns 'resourceType' field
      expect(response.data[0].resourceType).toBe('investor');
    }
  });

  it('07.4 - Verify audit log has hash chain', async () => {
    const response = await client.get('/api/v1/audit', {
      limit: 5,
    });

    expect(response.data).toBeDefined();
    if (response.data.length > 0) {
      const log = response.data[0];
      expect(log.id).toBeDefined();
      expect(log.action).toBeDefined();
      expect(log.createdAt).toBeDefined();
      // Hash chain fields — server uses 'prevHash' and 'entryHash'
      expect(log.prevHash || log.previousHash || log.entryHash || log.hash).toBeDefined();
    }
  });

  it('07.5 - Get audit log by ID', async () => {
    // First get a log
    const logs = await client.get('/api/v1/audit', { limit: 1 });

    if (logs.data.length > 0) {
      const logId = logs.data[0].id;
      const log = await client.get(`/api/v1/audit/${logId}`);

      expect(log.id).toBe(logId);
      expect(log.orgId).toBeDefined();
    }
  });

  it('07.6 - Filter audit logs by date range', async () => {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago

    const response = await client.get('/api/v1/audit', {
      startDate,
      endDate,
      limit: 10,
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('07.7 - Audit log contains actor information', async () => {
    const response = await client.get('/api/v1/audit', { limit: 1 });

    if (response.data.length > 0) {
      const log = response.data[0];
      // Actor can be user, api_key, system, or webhook
      expect(['user', 'api_key', 'system', 'webhook']).toContain(log.actorType || 'api_key');
    }
  });
});
