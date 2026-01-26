/**
 * AHOY Conformance Test Suite
 * Test 06: Distribution & Payouts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'ak_test_sandbox_key_12345';

describe('06. Distribution & Payouts', () => {
  let client: ApiClient;
  let createdScheduleId: string;
  let createdDistributionId: string;

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  it('06.1 - Create distribution schedule', async () => {
    const schedule = await client.post('/api/v1/distributions/schedules', {
      tokenId: 'tok_sample',
      type: 'DIVIDEND',
      frequency: 'QUARTERLY',
      allocationStrategy: 'PRO_RATA',
      paymentCurrency: 'USDC',
      startDate: '2026-04-01',
      rate: 0.05, // 5% annual
      metadata: {
        description: 'Quarterly dividend distribution',
      },
    });

    expect(schedule.id).toBeDefined();
    expect(schedule.type).toBe('DIVIDEND');
    expect(schedule.frequency).toBe('QUARTERLY');
    expect(schedule.isActive).toBe(true);

    createdScheduleId = schedule.id;
  });

  it('06.2 - Retrieve distribution schedule', async () => {
    const schedule = await client.get(`/api/v1/distributions/schedules/${createdScheduleId}`);

    expect(schedule.id).toBe(createdScheduleId);
    expect(schedule.allocationStrategy).toBe('PRO_RATA');
  });

  it('06.3 - Update distribution schedule', async () => {
    const updated = await client.patch(`/api/v1/distributions/schedules/${createdScheduleId}`, {
      rate: 0.06, // Increase to 6%
      metadata: {
        description: 'Quarterly dividend - increased rate',
      },
    });

    expect(updated.rate).toBe(0.06);
  });

  it('06.4 - List distribution schedules', async () => {
    const response = await client.get('/api/v1/distributions/schedules', {
      type: 'DIVIDEND',
      isActive: true,
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('06.5 - Execute distribution', async () => {
    const distribution = await client.post(
      `/api/v1/distributions/schedules/${createdScheduleId}/execute`,
      {
        snapshotDate: new Date().toISOString(),
      }
    );

    expect(distribution.id).toBeDefined();
    expect(distribution.status).toMatch(/SCHEDULED|PROCESSING|COMPLETED/);
    expect(distribution.scheduleId).toBe(createdScheduleId);

    createdDistributionId = distribution.id;
  });

  it('06.6 - Retrieve distribution event', async () => {
    const distribution = await client.get(`/api/v1/distributions/${createdDistributionId}`);

    expect(distribution.id).toBe(createdDistributionId);
    expect(distribution.type).toBe('DIVIDEND');
  });

  it('06.7 - List distribution payouts', async () => {
    const response = await client.get(`/api/v1/distributions/${createdDistributionId}/payouts`, {
      limit: 10,
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('06.8 - Get distribution analytics', async () => {
    const analytics = await client.get('/api/v1/tokens/tok_sample/distributions/analytics');

    expect(analytics).toBeDefined();
    // Analytics should have summary data
  });

  it('06.9 - Deactivate distribution schedule', async () => {
    const updated = await client.patch(`/api/v1/distributions/schedules/${createdScheduleId}`, {
      isActive: false,
    });

    expect(updated.isActive).toBe(false);
  });
});
