#!/usr/bin/env node
/**
 * seed-sandbox.ts - Pre-populate the sandbox environment with demo data.
 *
 * Run by the `seeder` service in docker-compose.sandbox.yml after the API
 * is healthy.  Creates a default organisation, provisions the sandbox API key,
 * and seeds demo real-estate assets, investors, and tokens.
 *
 * Environment variables (set by docker-compose):
 *   DATABASE_URL   - PostgreSQL connection string
 *   SANDBOX_API_KEY - Pre-provisioned API key value (e.g. ak_sandbox_demo_key_12345)
 */

import { randomUUID } from 'crypto';
import pg from 'pg';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://ahoy_sandbox:password@localhost:5432/ahoy_sandbox';

const SANDBOX_API_KEY =
  process.env.SANDBOX_API_KEY || 'ak_sandbox_demo_key_12345';

const ORG_NAME = 'AHOY Sandbox';
const ORG_SLUG = 'ahoy-sandbox-org';

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: DATABASE_URL });

async function query(sql: string, params: unknown[] = []) {
  return pool.query(sql, params);
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

async function ensureOrg(): Promise<string> {
  const existing = await query('SELECT id FROM orgs WHERE slug = $1', [ORG_SLUG]);
  if (existing.rows.length > 0) {
    console.log(`  Organisation already exists: ${ORG_SLUG}`);
    return existing.rows[0].id;
  }

  const id = randomUUID();
  await query(
    `INSERT INTO orgs (id, name, slug, status, settings, risk_profile, metadata)
     VALUES ($1, $2, $3, 'active', $4, $5, $6)`,
    [
      id,
      ORG_NAME,
      ORG_SLUG,
      JSON.stringify({ timezone: 'UTC', currency: 'USD', features: { oauth: true, webhooks: true, compliance: true } }),
      JSON.stringify({ level: 'standard', kycRequired: true, amlChecks: true }),
      JSON.stringify({ seeded: true, seedVersion: '1.0.0', createdBy: 'seed-sandbox' }),
    ],
  );
  console.log(`  Created organisation: ${ORG_SLUG} (${id})`);
  return id;
}

async function ensureApiKey(orgId: string): Promise<void> {
  const existing = await query(
    'SELECT id FROM api_keys WHERE org_id = $1 AND key_prefix = $2',
    [orgId, 'ak_sandbox_'],
  );
  if (existing.rows.length > 0) {
    console.log('  Sandbox API key already provisioned');
    return;
  }

  await query(
    `INSERT INTO api_keys (id, org_id, name, key_prefix, key_hash, scopes, environment, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      orgId,
      'Sandbox Demo Key',
      'ak_sandbox_',
      SANDBOX_API_KEY, // In sandbox mode the API accepts the raw key directly
      JSON.stringify(['read', 'write']),
      'sandbox',
      'active',
    ],
  );
  console.log(`  Provisioned sandbox API key: ${SANDBOX_API_KEY.slice(0, 20)}...`);
}

async function seedDemoData(orgId: string): Promise<void> {
  // --- Project ---
  const projectId = randomUUID();
  await query(
    `INSERT INTO projects (id, org_id, name, description, jurisdiction, asset_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [projectId, orgId, 'Marina Heights Tower', 'Premium waterfront residential tower in Dubai Marina with 120 tokenized units', 'DUBAI', 'REAL_ESTATE', 'active'],
  );

  // --- Issuer party ---
  const issuerId = randomUUID();
  await query(
    `INSERT INTO parties (id, org_id, name, type, roles, jurisdiction, verification_level, kyc_verified, is_frozen)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING`,
    [issuerId, orgId, 'AHOY Real Estate Holdings', 'ORGANIZATION', JSON.stringify(['ISSUER']), 'AE', 'STANDARD', true, false],
  );

  // --- Investor parties ---
  const investors = [
    { name: 'Sarah Chen', type: 'INDIVIDUAL' as const, country: 'SG' },
    { name: 'Mohammed Al-Rashid', type: 'INDIVIDUAL' as const, country: 'AE' },
    { name: 'Global Property Fund LP', type: 'ORGANIZATION' as const, country: 'US' },
  ];

  const investorIds: string[] = [];
  for (const inv of investors) {
    const partyId = randomUUID();
    investorIds.push(partyId);
    await query(
      `INSERT INTO parties (id, org_id, name, type, roles, jurisdiction, verification_level, kyc_verified, accredited_investor, is_frozen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING`,
      [partyId, orgId, inv.name, inv.type, JSON.stringify(['INVESTOR']), inv.country, 'STANDARD', true, true, false],
    );

    const investorId = randomUUID();
    await query(
      `INSERT INTO investors (id, org_id, party_id, investor_type, accreditation_status, kyc_status, aml_status, tax_country, jurisdictions, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING`,
      [
        investorId, orgId, partyId,
        inv.type === 'INDIVIDUAL' ? 'individual' : 'institutional',
        'accredited', 'approved', 'cleared', inv.country,
        JSON.stringify([inv.country]),
        JSON.stringify({ notes: `Demo ${inv.type.toLowerCase()} investor` }),
      ],
    );
  }

  // --- Assets ---
  const assets = [
    { name: 'Marina Heights - Unit A', desc: 'Two-bedroom luxury apartment, 15th floor, sea view', value: 2_500_000 },
    { name: 'Marina Heights - Penthouse', desc: 'Full-floor penthouse with private pool and terrace', value: 12_000_000 },
    { name: 'Marina Heights - Retail Podium', desc: 'Ground floor retail space, 500 sqm', value: 8_000_000 },
  ];

  const assetIds: string[] = [];
  for (const a of assets) {
    const assetId = randomUUID();
    assetIds.push(assetId);
    await query(
      `INSERT INTO assets (id, org_id, project_id, name, description, right_type, state, issuer_id, jurisdiction, validity_period, transferability_rules, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT DO NOTHING`,
      [
        assetId, orgId, projectId, a.name, a.desc, 'OWNERSHIP', 'ACTIVE', issuerId,
        JSON.stringify({ primary: 'DUBAI', secondary: ['UAE'] }),
        JSON.stringify({ start: new Date().toISOString(), end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() }),
        JSON.stringify({ minHoldingPeriod: 0, maxTransfersPerDay: 100, requiresApproval: false }),
        JSON.stringify({ propertyType: 'residential', location: 'Dubai Marina', totalValue: a.value }),
      ],
    );
  }

  // --- Tokens ---
  const tokenDefs = [
    { symbol: 'MHT-A', name: 'Marina Heights Unit A Token', assetIdx: 0, supply: '2500000' },
    { symbol: 'MHT-PH', name: 'Marina Heights Penthouse Token', assetIdx: 1, supply: '12000000' },
    { symbol: 'MHT-RP', name: 'Marina Heights Retail Token', assetIdx: 2, supply: '8000000' },
  ];

  for (const t of tokenDefs) {
    await query(
      `INSERT INTO tokens (id, org_id, asset_id, name, symbol, decimals, total_supply, state, token_standard, compliance_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING`,
      [
        randomUUID(), orgId, assetIds[t.assetIdx], t.name, t.symbol, 18,
        (BigInt(t.supply) * BigInt(10 ** 18)).toString(),
        'ACTIVE', 'ERC3643',
        JSON.stringify({ maxHolders: 500, minTransferAmount: '1000000000000000000', countriesBlacklist: [] }),
      ],
    );
  }

  // --- Webhook endpoint ---
  await query(
    `INSERT INTO webhook_endpoints (id, org_id, name, url, events, status, secret)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [
      randomUUID(), orgId, 'Demo Webhook',
      'https://webhook.site/sandbox-demo',
      JSON.stringify(['transfer.created', 'transfer.completed', 'compliance.approved', 'token.minted']),
      'active',
      `whsec_${randomUUID().replace(/-/g, '')}`,
    ],
  );

  console.log('  Seeded: 1 project, 1 issuer, 3 investors, 3 assets, 3 tokens, 1 webhook');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('');
  console.log('=== AHOY Sandbox Seeder ===');
  console.log('');

  try {
    const orgId = await ensureOrg();
    await ensureApiKey(orgId);
    await seedDemoData(orgId);

    console.log('');
    console.log('Sandbox seeding complete!');
    console.log(`  API Key: ${SANDBOX_API_KEY}`);
    console.log(`  Org:     ${ORG_SLUG}`);
    console.log('');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Sandbox seeding failed:', err);
  process.exit(1);
});
