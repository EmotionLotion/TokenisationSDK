/**
 * F20 regression: createToken must persist and return the supplied assetId,
 * linking the token to its asset. Previously the insert omitted assetId, so the
 * created token came back with assetId: null.
 */
import { describe, it, expect, vi } from 'vitest';
import { db, schema } from '../config/database.js';
import { createToken, getToken } from '../services/token.service.js';

vi.mock('../middleware/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { orgs, assets } = schema;

let counter = 0;
async function seedOrgAndAsset() {
  const n = ++counter;
  const [org] = await db
    .insert(orgs)
    .values({ name: `Org ${n}`, slug: `org-tok-${Date.now()}-${n}` })
    .returning();
  const [asset] = await db
    .insert(assets)
    .values({
      orgId: org.id,
      name: `Asset ${n}`,
      rightType: 'OWNERSHIP',
      jurisdiction: { countryCode: 'AE' },
    })
    .returning();
  return { orgId: org.id as string, assetId: asset.id as string };
}

describe('createToken assetId persistence (F20)', () => {
  it('persists and returns the supplied assetId', async () => {
    const { orgId, assetId } = await seedOrgAndAsset();

    const token = await createToken({
      orgId,
      assetId,
      name: 'Marina Heights Token',
      symbol: 'MHT',
      totalSupply: '1000000',
      chainId: 8453,
    });

    expect(token.id).toBeDefined();
    expect(token.assetId).toBe(assetId);

    // round-trip: the persisted row keeps the link
    const fetched = await getToken(token.id, orgId);
    expect(fetched.assetId).toBe(assetId);
  });

  it('leaves assetId null when not supplied', async () => {
    const { orgId } = await seedOrgAndAsset();
    const token = await createToken({
      orgId,
      name: 'No Asset Token',
      symbol: 'NAT',
      totalSupply: '1000',
      chainId: 8453,
    });
    expect(token.assetId).toBeNull();
  });
});
