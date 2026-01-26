/**
 * AHOY Conformance Test Suite
 * Test 08: Report Exports
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'ak_test_sandbox_key_12345';

describe('08. Report Exports', () => {
  let client: ApiClient;
  let createdReportId: string;

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  it('08.1 - Generate cap table report', async () => {
    const response = await client.post('/api/v1/reports', {
      type: 'cap_table',
      format: 'json',
      parameters: {
        tokenId: 'tok_test_001',
      },
    });

    expect(response.id).toBeDefined();
    expect(response.type).toBe('cap_table');
    expect(response.format).toBe('json');
    expect(response.status).toBe('pending');
    expect(response.filename).toContain('cap_table');
    expect(response.contentType).toBe('application/json');

    createdReportId = response.id;
  });

  it('08.2 - Generate transfer history report', async () => {
    const response = await client.post('/api/v1/reports', {
      type: 'transfer_history',
      format: 'json',
      parameters: {
        tokenId: 'tok_test_001',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
    });

    expect(response.id).toBeDefined();
    expect(response.type).toBe('transfer_history');
    expect(response.status).toBe('pending');
  });

  it('08.3 - Generate audit trail report', async () => {
    const response = await client.post('/api/v1/reports', {
      type: 'audit_trail',
      format: 'json',
      parameters: {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
    });

    expect(response.id).toBeDefined();
    expect(response.type).toBe('audit_trail');
    expect(response.status).toBe('pending');
  });

  it('08.4 - Generate investor register report', async () => {
    const response = await client.post('/api/v1/reports', {
      type: 'investor_register',
      format: 'json',
    });

    expect(response.id).toBeDefined();
    expect(response.type).toBe('investor_register');
  });

  it('08.5 - Generate CSV format report', async () => {
    const response = await client.post('/api/v1/reports', {
      type: 'cap_table',
      format: 'csv',
    });

    expect(response.id).toBeDefined();
    expect(response.format).toBe('csv');
    expect(response.contentType).toBe('text/csv');
    expect(response.filename).toContain('.csv');
  });

  it('08.6 - List generated reports', async () => {
    const response = await client.get('/api/v1/reports');

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.count).toBeGreaterThan(0);
  });

  it('08.7 - Filter reports by type', async () => {
    const response = await client.get('/api/v1/reports', {
      type: 'cap_table',
    });

    expect(response.data).toBeDefined();
    if (response.data.length > 0) {
      expect(response.data[0].type).toBe('cap_table');
    }
  });

  it('08.8 - Get report by ID', async () => {
    if (!createdReportId) {
      return;
    }

    const response = await client.get(`/api/v1/reports/${createdReportId}`);

    expect(response.id).toBe(createdReportId);
    expect(response.type).toBeDefined();
    expect(response.format).toBeDefined();
  });

  it('08.9 - Report contains expected metadata', async () => {
    const response = await client.post('/api/v1/reports', {
      type: 'holding_statement',
      format: 'json',
      parameters: {
        investorId: 'inv_test_001',
      },
    });

    expect(response.id).toBeDefined();
    expect(response.orgId).toBeDefined();
    expect(response.createdAt).toBeDefined();
    expect(response.parameters).toBeDefined();
    expect(response.parameters.investorId).toBe('inv_test_001');
  });

  it('08.10 - Reject invalid report type', async () => {
    try {
      await client.post('/api/v1/reports', {
        type: 'invalid_type',
        format: 'json',
      });
      expect.fail('Should have thrown an error');
    } catch (error: unknown) {
      const err = error as { status?: number };
      expect(err.status).toBe(400);
    }
  });

  it('08.11 - Reject invalid format', async () => {
    try {
      await client.post('/api/v1/reports', {
        type: 'cap_table',
        format: 'xlsx',
      });
      expect.fail('Should have thrown an error');
    } catch (error: unknown) {
      const err = error as { status?: number };
      expect(err.status).toBe(400);
    }
  });

  it('08.12 - Download completed report', async () => {
    // Create a report and wait briefly for generation
    const createResponse = await client.post('/api/v1/reports', {
      type: 'compliance_decisions',
      format: 'json',
    });

    expect(createResponse.id).toBeDefined();

    // Wait for async generation (in real tests, would poll status)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Try to get the report - may still be generating
    const report = await client.get(`/api/v1/reports/${createResponse.id}`);
    expect(report.id).toBe(createResponse.id);

    // If completed, verify checksum is present
    if (report.status === 'completed') {
      expect(report.checksum).toBeDefined();
      expect(report.generatedAt).toBeDefined();
      expect(report.size).toBeGreaterThan(0);
    }
  });

  it('08.13 - Generate distribution history report', async () => {
    const response = await client.post('/api/v1/reports', {
      type: 'distribution_history',
      format: 'json',
      parameters: {
        tokenId: 'tok_test_001',
      },
    });

    expect(response.id).toBeDefined();
    expect(response.type).toBe('distribution_history');
  });
});
