import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:3001';
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Dev-Org-Id': 'test-org-1',
};

async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ success: boolean; data: T }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: HEADERS,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  expect(res.ok, `${method} ${path} returned ${res.status}: ${JSON.stringify(json)}`).toBe(true);
  expect(json.success).toBe(true);
  return json;
}

describe('GPU Compute E2E', () => {
  let nodeId: string;
  let revenueId: string;

  it('1. Register GPU Node', async () => {
    const { data } = await api('POST', '/api/v1/gpu-nodes', {
      gpuModel: 'A100',
      gpuCount: 8,
      vramPerGpuGB: 80,
      interconnect: 'NVLink',
      datacenterName: 'Test DC-1',
      datacenterLocation: 'Dubai, UAE',
      datacenterTier: 3,
      acquisitionCostUsd: '250000',
      acquisitionDate: '2025-06-15',
      estimatedUsefulLifeMonths: 48,
    });

    expect(data.id).toBeDefined();
    expect(data.status).toBe('registered');
    expect(data.totalVramGB).toBe(640);

    nodeId = data.id;
  });

  it('2. List GPU Nodes', async () => {
    const { data } = await api<any[]>('GET', '/api/v1/gpu-nodes');

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('3. Get Node Detail', async () => {
    const { data } = await api('GET', `/api/v1/gpu-nodes/${nodeId}`);

    expect(data.id).toBe(nodeId);
    expect(data.gpuModel).toBe('A100');
    expect(data.gpuCount).toBe(8);
  });

  it('4. Update Node', async () => {
    const { data } = await api('PATCH', `/api/v1/gpu-nodes/${nodeId}`, {
      benchmarkScore: 95000,
    });

    expect(data.benchmarkScore).toBe(95000);
  });

  it('5. Start Verification', async () => {
    const { success } = await api('POST', `/api/v1/gpu-nodes/${nodeId}/verify`, {});

    expect(success).toBe(true);
  });

  it('6. Complete Verification', async () => {
    const { data } = await api('POST', `/api/v1/gpu-nodes/${nodeId}/verify/complete`, {
      passed: true,
    });

    expect(data.verified).toBeTruthy();
  });

  it('7. Tokenize Node', async () => {
    const { data } = await api('POST', `/api/v1/gpu-nodes/${nodeId}/tokenize`, {
      tokenSymbol: 'TGPU',
      tokenName: 'Test GPU Cluster',
      totalSupply: '1000000',
      pricePerToken: '0.25',
    });

    expect(data.id).toBeDefined();
    expect(data.tokenSymbol).toBe('TGPU');
  });

  it('8. Get Node Token', async () => {
    const { data } = await api('GET', `/api/v1/gpu-nodes/${nodeId}/token`);

    expect(data.tokenSymbol).toBe('TGPU');
    expect(data.tokenName).toBe('Test GPU Cluster');
  });

  it('9. Record Revenue', async () => {
    const { data } = await api('POST', `/api/v1/gpu-nodes/${nodeId}/revenue`, {
      grossRevenueUsd: '12500',
      electricityCostUsd: '1800',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      hoursRented: '600',
      avgUtilizationPercent: '89',
    });

    expect(data.netRevenueUsd).toBeDefined();
    expect(Number(data.netRevenueUsd)).toBeGreaterThan(0);

    revenueId = data.id;
  });

  it('10. Get Revenue History', async () => {
    const { data } = await api<any[]>('GET', `/api/v1/gpu-nodes/${nodeId}/revenue`);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
  });

  it('11. Distribute Revenue', async () => {
    const { data } = await api('POST', `/api/v1/gpu-nodes/${nodeId}/distribute`, {
      revenuePeriodId: revenueId,
    });

    expect(data.status).toBe('completed');
    expect(Number(data.totalDistributed)).toBeGreaterThan(0);
  });

  it('12. Get Distributions', async () => {
    const { data } = await api<any[]>('GET', `/api/v1/gpu-nodes/${nodeId}/distributions`);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
  });

  it('13. Marketplace Listings', async () => {
    const { data } = await api<any[]>('GET', '/api/v1/compute-market');

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('14. Marketplace Analytics', async () => {
    const { data } = await api('GET', '/api/v1/compute-market/analytics');

    expect(data.totalNodes).toBeGreaterThanOrEqual(1);
    expect(data.totalGpus).toBeGreaterThanOrEqual(8);
  });
});
