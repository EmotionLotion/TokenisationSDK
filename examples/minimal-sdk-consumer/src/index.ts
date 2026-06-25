/**
 * Minimal external SDK consumer — creates an asset and a token against a local API server.
 *
 * Mirrors the README's primary SDK example, but documents the workarounds that are
 * currently REQUIRED for it to run in a clean app (see ../README.md and loop/reports/sdk_consumer_test.md).
 *
 * Prereqs:
 *   1. Server running on :3001 (see repo README; for local dev: `cd server && pnpm dev`).
 *   2. A real API key:  `cd server && pnpm db:seed --org-only`  → copy the printed `sk_test_...`.
 *      export AHOY_API_KEY="sk_test_..."
 *
 * Run:  npx tsx src/index.ts
 */
import { createApiClient } from '@tokenisation/core';

const apiKey = process.env.AHOY_API_KEY;
if (!apiKey) {
  throw new Error('Set AHOY_API_KEY to a seeded sk_test_ key (cd server && pnpm db:seed --org-only)');
}

const client = createApiClient({
  apiKey,
  baseUrl: 'http://localhost:3001',
});

async function main() {
  // Create an asset.
  // assets.create() returns a bare Asset, so asset.id is available directly (F21 fixed).
  const asset = await client.assets.create({
    name: 'Marina Heights Unit 2501',
    rightType: 'OWNERSHIP',
    jurisdiction: { countryCode: 'AE' },
  });
  const assetId = asset.id;
  console.log('Created asset:', assetId);

  // Create a token referencing the asset.
  // NOTE: tokens require an idempotency key (2nd arg) and a `totalSupply` field —
  // the root README omits both; docs/api/REST_API.md has the correct shape.
  const token = await client.tokens.create(
    {
      name: 'MHT',
      symbol: 'MHT',
      chainId: 8453,
      assetId,
      totalSupply: '1000000',
    } as any,
    'minimal-consumer-token-001'
  );
  console.log('Created token:', (token as any)?.id);

  console.log('Done.');
}

main().catch((err) => {
  console.error('Failed:', err?.code ?? '', err?.message ?? err);
  process.exit(1);
});
