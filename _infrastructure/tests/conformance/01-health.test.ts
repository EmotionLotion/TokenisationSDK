/**
 * AHOY Conformance Test Suite
 * Test 01: Health & Connectivity
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';

describe('01. Health & Connectivity', () => {
  let client: ApiClient;

  beforeAll(() => {
    client = new ApiClient(API_URL);
  });

  it('01.1 - API health endpoint returns OK', async () => {
    const response = await client.get('/health');

    expect(response.status).toBe('ok');
    expect(response.db).toBeDefined();
    expect(response.version).toBeDefined();
  });

  it('01.2 - API docs endpoint is accessible', async () => {
    const response = await fetch(`${API_URL}/api/docs`);

    expect(response.status).toBe(200);
  });

  it('01.3 - OpenAPI spec is available', async () => {
    const response = await fetch(`${API_URL}/api/openapi.json`);
    const spec = await response.json();

    expect(response.status).toBe(200);
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toContain('AHOY');
  });

  it('01.4 - Unauthenticated request returns 401', async () => {
    const response = await fetch(`${API_URL}/api/v1/tokens`);

    expect(response.status).toBe(401);
  });

  it('01.5 - Invalid API key returns 401', async () => {
    const response = await fetch(`${API_URL}/api/v1/tokens`, {
      headers: { 'X-API-Key': 'invalid_key' },
    });

    expect(response.status).toBe(401);
  });
});
