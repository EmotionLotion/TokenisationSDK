/**
 * F21 regression: client.assets.create() / get() must return a bare Asset,
 * matching the Promise<Asset> type, even though the server wraps the body as
 * { asset: {...} }. Without the unwrap, `asset.id` is undefined (the README's
 * `assetId: asset.id` breaks).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApiClient } from '@tokenisation/core';

function mockFetchOnce(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (_: string) => null },
    json: async () => body,
  };
  // @ts-expect-error - assigning a test double to the global fetch
  global.fetch = vi.fn(async () => res);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssetsModule response contract (F21)', () => {
  const client = createApiClient({ apiKey: 'sk_test_unit', baseUrl: 'http://localhost:3001' });

  it('create() unwraps the { asset } envelope and exposes asset.id', async () => {
    mockFetchOnce(201, { asset: { id: 'asset-123', name: 'Unit 1', rightType: 'OWNERSHIP' } });
    const asset = await client.assets.create({
      name: 'Unit 1',
      rightType: 'OWNERSHIP',
      jurisdiction: { countryCode: 'AE' },
    });
    expect(asset.id).toBe('asset-123');
    expect((asset as unknown as { asset?: unknown }).asset).toBeUndefined();
  });

  it('get() unwraps the { asset } envelope', async () => {
    mockFetchOnce(200, { asset: { id: 'asset-456', name: 'Unit 2', rightType: 'OWNERSHIP' } });
    const asset = await client.assets.get('11111111-1111-1111-1111-111111111111');
    expect(asset.id).toBe('asset-456');
  });

  it('create() still works if the server ever returns a bare asset (defensive)', async () => {
    mockFetchOnce(201, { id: 'asset-789', name: 'Unit 3', rightType: 'OWNERSHIP' });
    const asset = await client.assets.create({
      name: 'Unit 3',
      rightType: 'OWNERSHIP',
      jurisdiction: { countryCode: 'AE' },
    });
    expect(asset.id).toBe('asset-789');
  });
});
