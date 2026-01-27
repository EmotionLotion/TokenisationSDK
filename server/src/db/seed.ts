#!/usr/bin/env tsx
/**
 * Sandbox Seeding CLI
 *
 * Seeds the database with sample data for development and testing.
 * Partners can use this to quickly set up a sandbox environment.
 *
 * Usage:
 *   npm run db:seed                    # Full seed (all data)
 *   npm run db:seed -- --org-only      # Only create organization
 *   npm run db:seed -- --minimal       # Minimal seed (org + 1 of each entity)
 *   npm run db:seed -- --org-id <id>   # Seed into specific org
 *   npm run db:seed -- --clean         # Delete all data first
 *
 * @packageDocumentation
 */

import 'dotenv/config';
import { randomUUID } from 'crypto';
import argon2 from 'argon2';
import pg from 'pg';
import { logger } from '../middleware/logger.js';

const { Pool } = pg;

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

interface SeedOptions {
  orgOnly: boolean;
  minimal: boolean;
  orgId?: string;
  clean: boolean;
  verbose: boolean;
}

function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const options: SeedOptions = {
    orgOnly: false,
    minimal: false,
    orgId: undefined,
    clean: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--org-only':
        options.orgOnly = true;
        break;
      case '--minimal':
        options.minimal = true;
        break;
      case '--org-id':
        options.orgId = args[++i];
        break;
      case '--clean':
        options.clean = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        if (!args[i].startsWith('-')) {
          // Positional argument - treat as org-id
          options.orgId = args[i];
        }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Sandbox Seeding CLI - Seeds the database with sample data

Usage:
  npm run db:seed [options]

Options:
  --org-only       Only create organization and API key
  --minimal        Create minimal seed (1 of each entity type)
  --org-id <id>    Seed into a specific organization (creates if not exists)
  --clean          Delete all existing data before seeding
  --verbose, -v    Show detailed output
  --help, -h       Show this help message

Examples:
  npm run db:seed                           # Full seed with new org
  npm run db:seed -- --org-id my-sandbox    # Seed into 'my-sandbox' org
  npm run db:seed -- --minimal --clean      # Clean and minimal seed
  npm run db:seed -- --org-only             # Just create org and API key
`);
}

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgres://ahoy:ahoy_dev_password@localhost:5432/ahoy_tokenisation',
});

// ============================================================================
// SAMPLE DATA GENERATORS
// ============================================================================

function generateOrgData(customId?: string) {
  const id = customId || `org_${Date.now().toString(36)}`;
  return {
    id: randomUUID(),
    name: `Sandbox Organization - ${id}`,
    slug: id.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    status: 'active',
    settings: JSON.stringify({
      timezone: 'UTC',
      currency: 'USD',
      features: {
        oauth: true,
        webhooks: true,
        compliance: true,
      },
    }),
    riskProfile: JSON.stringify({
      level: 'standard',
      kycRequired: true,
      amlChecks: true,
    }),
    metadata: JSON.stringify({
      seeded: true,
      seedVersion: '1.0.0',
      createdBy: 'sandbox-seeder',
    }),
  };
}

async function generateApiKeyData(orgId: string) {
  const rawKey = `sk_test_${randomUUID().replace(/-/g, '')}`;
  const keyHash = await argon2.hash(rawKey);

  return {
    id: randomUUID(),
    orgId,
    name: 'Sandbox API Key',
    keyPrefix: 'sk_test_',
    keyHash,
    rawKey, // Return this for display, but don't store
    scopes: ['read', 'write'],
    environment: 'test',
    status: 'active',
  };
}

function generateUserData(orgId: string) {
  return {
    id: randomUUID(),
    orgId,
    email: 'admin@sandbox.local',
    name: 'Sandbox Admin',
    status: 'active',
    emailVerified: true,
  };
}

function generateProjectData(orgId: string) {
  return {
    id: randomUUID(),
    orgId,
    name: 'Sample Real Estate Project',
    description: 'A sample tokenized real estate project for testing',
    jurisdiction: 'DUBAI',
    assetType: 'REAL_ESTATE',
    status: 'active',
  };
}

function generatePartyData(orgId: string, type: 'INDIVIDUAL' | 'ORGANIZATION') {
  const names = {
    INDIVIDUAL: ['John Smith', 'Jane Doe', 'Alice Johnson', 'Bob Williams'],
    ORGANIZATION: ['Acme Corp', 'Global Investments Ltd', 'Tech Holdings Inc'],
  };
  const name = names[type][Math.floor(Math.random() * names[type].length)];

  return {
    id: randomUUID(),
    orgId,
    name,
    type,
    roles: type === 'ORGANIZATION' ? ['ISSUER'] : ['INVESTOR'],
    jurisdiction: 'AE',
    verificationLevel: 'STANDARD',
    kycVerified: true,
    accreditedInvestor: type === 'INDIVIDUAL',
    isFrozen: false,
  };
}

function generateInvestorData(orgId: string, partyId: string) {
  return {
    id: randomUUID(),
    orgId,
    partyId,
    investorType: 'individual',
    accreditationStatus: 'accredited',
    kycStatus: 'approved',
    amlStatus: 'cleared',
    taxCountry: 'AE',
    jurisdictions: ['AE', 'US'],
    metadata: JSON.stringify({
      notes: 'Sample investor for sandbox testing',
    }),
  };
}

function generateAssetData(orgId: string, issuerId: string, projectId?: string) {
  return {
    id: randomUUID(),
    orgId,
    projectId,
    name: 'Sample Property Token',
    description: 'A tokenized fraction of prime real estate',
    rightType: 'OWNERSHIP',
    state: 'ACTIVE',
    issuerId,
    jurisdiction: JSON.stringify({ primary: 'DUBAI', secondary: ['UAE'] }),
    validityPeriod: JSON.stringify({
      start: new Date().toISOString(),
      end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    }),
    transferabilityRules: JSON.stringify({
      minHoldingPeriod: 0,
      maxTransfersPerDay: 100,
      requiresApproval: false,
    }),
    metadata: JSON.stringify({
      propertyType: 'commercial',
      location: 'Dubai Marina',
      totalValue: 10000000,
    }),
  };
}

function generateTokenData(orgId: string, assetId: string) {
  return {
    id: randomUUID(),
    orgId,
    assetId,
    name: 'PROP1',
    symbol: 'PROP1',
    decimals: 18,
    totalSupply: '1000000000000000000000000', // 1M tokens
    state: 'ACTIVE',
    tokenStandard: 'ERC3643',
    complianceConfig: JSON.stringify({
      maxHolders: 500,
      minTransferAmount: '1000000000000000000',
      countriesBlacklist: [],
    }),
  };
}

function generateWebhookEndpoint(orgId: string) {
  return {
    id: randomUUID(),
    orgId,
    name: 'Sample Webhook',
    url: 'https://webhook.site/sandbox',
    events: ['transfer.created', 'transfer.completed', 'compliance.approved'],
    status: 'active',
    secret: `whsec_${randomUUID().replace(/-/g, '')}`,
  };
}

// ============================================================================
// SEEDING FUNCTIONS
// ============================================================================

async function cleanDatabase(client: pg.PoolClient): Promise<void> {
  logger.info('Cleaning database...');

  // Disable foreign key checks temporarily
  await client.query('SET session_replication_role = replica');

  // Truncate all tables in reverse dependency order
  const tables = [
    'state_transitions', 'compliance_audit_log', 'compliance_receipts', 'policy_rulesets',
    'corporate_action_entitlements', 'corporate_actions', 'distribution_payments', 'distributions',
    'vesting_releases', 'vesting_milestones', 'vesting_schedules',
    'event_bus_queue', 'domain_events_outbox', 'idempotency_keys',
    'token_balances', 'chain_deployments', 'sessions', 'events', 'audit_log',
    'webhook_deliveries', 'webhook_endpoints',
    'cap_table_snapshots', 'ledger_events', 'ledger_positions',
    'dld_sync_jobs', 'dld_events', 'dld_titles',
    'settlements', 'transfers',
    'buyback_requests', 'allocations', 'offerings',
    'compliance_approvals', 'clawbacks', 'redemptions', 'issuances',
    'token_tranches', 'tokens',
    'decisions', 'policy_versions', 'policies', 'assets',
    'kyc_sessions', 'investor_wallets', 'investors',
    'party_wallets', 'parties',
    'documents', 'projects',
    'usage_quotas', 'usage_records', 'org_billing',
    'oauth_tokens', 'oauth_clients', 'api_keys',
    'user_roles', 'roles', 'users',
    'orgs',
  ];

  for (const table of tables) {
    try {
      await client.query(`TRUNCATE TABLE ${table} CASCADE`);
    } catch (error) {
      // Table might not exist
    }
  }

  // Re-enable foreign key checks
  await client.query('SET session_replication_role = DEFAULT');

  logger.info('Database cleaned');
}

async function seedOrganization(client: pg.PoolClient, options: SeedOptions): Promise<{ orgId: string; apiKey: string }> {
  const orgData = generateOrgData(options.orgId);

  // Check if org already exists
  const existing = await client.query(
    'SELECT id FROM orgs WHERE slug = $1',
    [orgData.slug]
  );

  let orgId: string;
  if (existing.rows.length > 0) {
    orgId = existing.rows[0].id;
    logger.info(`Using existing organization: ${orgData.slug} (${orgId})`);
  } else {
    await client.query(
      `INSERT INTO orgs (id, name, slug, status, settings, risk_profile, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orgData.id, orgData.name, orgData.slug, orgData.status, orgData.settings, orgData.riskProfile, orgData.metadata]
    );
    orgId = orgData.id;
    logger.info(`Created organization: ${orgData.slug} (${orgId})`);
  }

  // Create API key
  const apiKeyData = await generateApiKeyData(orgId);
  await client.query(
    `INSERT INTO api_keys (id, org_id, name, key_prefix, key_hash, scopes, environment, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [apiKeyData.id, apiKeyData.orgId, apiKeyData.name, apiKeyData.keyPrefix, apiKeyData.keyHash, apiKeyData.scopes, apiKeyData.environment, apiKeyData.status]
  );

  return { orgId, apiKey: apiKeyData.rawKey };
}

async function seedMinimal(client: pg.PoolClient, orgId: string): Promise<void> {
  logger.info('Creating minimal seed data...');

  // Create user
  const userData = generateUserData(orgId);
  await client.query(
    `INSERT INTO users (id, org_id, email, name, status, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [userData.id, userData.orgId, userData.email, userData.name, userData.status, userData.emailVerified]
  );

  // Create project
  const projectData = generateProjectData(orgId);
  await client.query(
    `INSERT INTO projects (id, org_id, name, description, jurisdiction, asset_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [projectData.id, projectData.orgId, projectData.name, projectData.description, projectData.jurisdiction, projectData.assetType, projectData.status]
  );

  // Create issuer party
  const issuerData = generatePartyData(orgId, 'ORGANIZATION');
  await client.query(
    `INSERT INTO parties (id, org_id, name, type, roles, jurisdiction, verification_level, kyc_verified, is_frozen)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING`,
    [issuerData.id, issuerData.orgId, issuerData.name, issuerData.type, issuerData.roles, issuerData.jurisdiction, issuerData.verificationLevel, issuerData.kycVerified, issuerData.isFrozen]
  );

  // Create investor party
  const investorPartyData = generatePartyData(orgId, 'INDIVIDUAL');
  await client.query(
    `INSERT INTO parties (id, org_id, name, type, roles, jurisdiction, verification_level, kyc_verified, accredited_investor, is_frozen)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT DO NOTHING`,
    [investorPartyData.id, investorPartyData.orgId, investorPartyData.name, investorPartyData.type, investorPartyData.roles, investorPartyData.jurisdiction, investorPartyData.verificationLevel, investorPartyData.kycVerified, investorPartyData.accreditedInvestor, investorPartyData.isFrozen]
  );

  // Create investor
  const investorData = generateInvestorData(orgId, investorPartyData.id);
  await client.query(
    `INSERT INTO investors (id, org_id, party_id, investor_type, accreditation_status, kyc_status, aml_status, tax_country, jurisdictions, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT DO NOTHING`,
    [investorData.id, investorData.orgId, investorData.partyId, investorData.investorType, investorData.accreditationStatus, investorData.kycStatus, investorData.amlStatus, investorData.taxCountry, investorData.jurisdictions, investorData.metadata]
  );

  // Create asset
  const assetData = generateAssetData(orgId, issuerData.id, projectData.id);
  await client.query(
    `INSERT INTO assets (id, org_id, project_id, name, description, right_type, state, issuer_id, jurisdiction, validity_period, transferability_rules, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT DO NOTHING`,
    [assetData.id, assetData.orgId, assetData.projectId, assetData.name, assetData.description, assetData.rightType, assetData.state, assetData.issuerId, assetData.jurisdiction, assetData.validityPeriod, assetData.transferabilityRules, assetData.metadata]
  );

  // Create token
  const tokenData = generateTokenData(orgId, assetData.id);
  await client.query(
    `INSERT INTO tokens (id, org_id, asset_id, name, symbol, decimals, total_supply, state, token_standard, compliance_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT DO NOTHING`,
    [tokenData.id, tokenData.orgId, tokenData.assetId, tokenData.name, tokenData.symbol, tokenData.decimals, tokenData.totalSupply, tokenData.state, tokenData.tokenStandard, tokenData.complianceConfig]
  );

  // Create webhook
  const webhookData = generateWebhookEndpoint(orgId);
  await client.query(
    `INSERT INTO webhook_endpoints (id, org_id, name, url, events, status, secret)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [webhookData.id, webhookData.orgId, webhookData.name, webhookData.url, webhookData.events, webhookData.status, webhookData.secret]
  );

  logger.info('Minimal seed data created');
}

async function seedFull(client: pg.PoolClient, orgId: string): Promise<void> {
  logger.info('Creating full seed data...');

  // First do minimal seed
  await seedMinimal(client, orgId);

  // Add more parties
  for (let i = 0; i < 5; i++) {
    const partyData = generatePartyData(orgId, i % 2 === 0 ? 'INDIVIDUAL' : 'ORGANIZATION');
    try {
      await client.query(
        `INSERT INTO parties (id, org_id, name, type, roles, jurisdiction, verification_level, kyc_verified, accredited_investor, is_frozen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [partyData.id, partyData.orgId, partyData.name + ' ' + (i + 2), partyData.type, partyData.roles, partyData.jurisdiction, partyData.verificationLevel, partyData.kycVerified, partyData.accreditedInvestor || false, partyData.isFrozen]
      );
    } catch (error) {
      // Ignore duplicates
    }
  }

  // Add more projects
  for (let i = 0; i < 2; i++) {
    const projectData = generateProjectData(orgId);
    projectData.name = `Project ${i + 2}`;
    try {
      await client.query(
        `INSERT INTO projects (id, org_id, name, description, jurisdiction, asset_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [projectData.id, projectData.orgId, projectData.name, projectData.description, projectData.jurisdiction, projectData.assetType, projectData.status]
      );
    } catch (error) {
      // Ignore duplicates
    }
  }

  logger.info('Full seed data created');
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs();

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║           AHOY Tokenisation Platform - Sandbox Seeder          ║
╚════════════════════════════════════════════════════════════════╝
`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (options.clean) {
      await cleanDatabase(client);
    }

    // Seed organization and get API key
    const { orgId, apiKey } = await seedOrganization(client, options);

    // Seed additional data unless org-only mode
    if (!options.orgOnly) {
      if (options.minimal) {
        await seedMinimal(client, orgId);
      } else {
        await seedFull(client, orgId);
      }
    }

    await client.query('COMMIT');

    // Print summary
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    Sandbox Setup Complete!                     ║
╠════════════════════════════════════════════════════════════════╣
║  Organization ID: ${orgId.padEnd(36)}      ║
╠════════════════════════════════════════════════════════════════╣
║  API Key (save this - shown only once):                        ║
║  ${apiKey.padEnd(60)} ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Quick Start:                                                  ║
║  1. Set environment variable:                                  ║
║     export AHOY_API_KEY="${apiKey.substring(0, 20)}..."         ║
║                                                                ║
║  2. Test the API:                                              ║
║     curl -H "Authorization: Bearer $AHOY_API_KEY" \\            ║
║          http://localhost:3001/api/v1/iam/me                   ║
║                                                                ║
║  3. Import into SDK:                                           ║
║     const sdk = createTokenisationSDK({                        ║
║       baseUrl: 'http://localhost:3001',                        ║
║       apiKey: process.env.AHOY_API_KEY,                        ║
║     });                                                        ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Seeding failed', { error });
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
