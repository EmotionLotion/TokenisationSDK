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
import Database from 'better-sqlite3';
import { logger } from '../middleware/logger.js';

const { Pool } = pg;

// Database mode detection
const DB_MODE = process.env.DB_MODE || 'postgresql';
const SQLITE_PATH = process.env.SQLITE_PATH || './data/ahoy.db';

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
// DATABASE CONNECTION ABSTRACTION
// ============================================================================

interface DbClient {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

let pool: pg.Pool | null = null;
let sqliteDb: Database.Database | null = null;

function getDbClient(): Promise<DbClient> {
  if (DB_MODE === 'sqlite') {
    // SQLite mode
    if (!sqliteDb) {
      logger.info(`Using SQLite database at ${SQLITE_PATH}`);
      sqliteDb = new Database(SQLITE_PATH);
      sqliteDb.pragma('journal_mode = WAL');
      sqliteDb.pragma('foreign_keys = ON');
      initializeSqliteSchema(sqliteDb);
    }

    return Promise.resolve({
      query: async (sql: string, params: any[] = []) => {
        // Convert PostgreSQL $1, $2 placeholders to SQLite ? placeholders
        let sqliteSql = sql;
        let paramIndex = 1;
        while (sqliteSql.includes(`$${paramIndex}`)) {
          sqliteSql = sqliteSql.replace(`$${paramIndex}`, '?');
          paramIndex++;
        }
        // Handle PostgreSQL-specific syntax
        sqliteSql = sqliteSql.replace(/::uuid/g, '');
        sqliteSql = sqliteSql.replace(/RETURNING \*/gi, '');
        // Convert "INSERT INTO table ... ON CONFLICT DO NOTHING" to "INSERT OR IGNORE INTO table ..."
        sqliteSql = sqliteSql.replace(/INSERT INTO/gi, 'INSERT OR IGNORE INTO');
        sqliteSql = sqliteSql.replace(/ON CONFLICT DO NOTHING/gi, '');

        // Convert array parameters to JSON strings and booleans to integers for SQLite
        const sqliteParams = params.map(p => {
          if (Array.isArray(p)) return JSON.stringify(p);
          if (typeof p === 'boolean') return p ? 1 : 0;
          return p;
        });

        try {
          if (sqliteSql.trim().toUpperCase().startsWith('SELECT')) {
            const rows = sqliteDb!.prepare(sqliteSql).all(...sqliteParams);
            return { rows };
          } else {
            sqliteDb!.prepare(sqliteSql).run(...sqliteParams);
            return { rows: [] };
          }
        } catch (error) {
          // Ignore some errors for SQLite compatibility
          if ((error as any).message?.includes('no such table')) {
            return { rows: [] };
          }
          throw error;
        }
      },
      begin: async () => { sqliteDb!.exec('BEGIN'); },
      commit: async () => { sqliteDb!.exec('COMMIT'); },
      rollback: async () => { sqliteDb!.exec('ROLLBACK'); },
      release: () => { /* no-op for SQLite */ },
    });
  } else {
    // PostgreSQL mode
    if (!pool) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL ||
          'postgres://ahoy:ahoy_dev_password@localhost:5432/ahoy_tokenisation',
      });
    }

    return pool.connect().then((client) => ({
      query: (sql: string, params?: any[]) => client.query(sql, params),
      begin: () => client.query('BEGIN').then(() => {}),
      commit: () => client.query('COMMIT').then(() => {}),
      rollback: () => client.query('ROLLBACK').then(() => {}),
      release: () => client.release(),
    }));
  }
}

function initializeSqliteSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      settings TEXT DEFAULT '{}',
      risk_profile TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      scopes TEXT DEFAULT '[]',
      environment TEXT DEFAULT 'test',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'active',
      email_verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      jurisdiction TEXT DEFAULT 'DUBAI',
      asset_type TEXT DEFAULT 'REAL_ESTATE',
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    );

    CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      roles TEXT DEFAULT '[]',
      jurisdiction TEXT,
      verification_level TEXT DEFAULT 'NONE',
      kyc_verified INTEGER DEFAULT 0,
      accredited_investor INTEGER DEFAULT 0,
      is_frozen INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    );

    CREATE TABLE IF NOT EXISTS investors (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      party_id TEXT,
      investor_type TEXT,
      accreditation_status TEXT,
      kyc_status TEXT,
      aml_status TEXT,
      tax_country TEXT,
      jurisdictions TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (party_id) REFERENCES parties(id)
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      project_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      right_type TEXT,
      state TEXT DEFAULT 'DRAFT',
      issuer_id TEXT,
      jurisdiction TEXT DEFAULT '{}',
      validity_period TEXT DEFAULT '{}',
      transferability_rules TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (issuer_id) REFERENCES parties(id)
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      asset_id TEXT,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decimals INTEGER DEFAULT 18,
      total_supply TEXT DEFAULT '0',
      state TEXT DEFAULT 'DRAFT',
      token_standard TEXT DEFAULT 'ERC20',
      compliance_config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT,
      url TEXT NOT NULL,
      events TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      secret TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    );

    -- Real Estate vertical tables
    CREATE TABLE IF NOT EXISTS dld_titles (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      asset_id TEXT,
      external_title_deed_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      snapshot TEXT DEFAULT '{}',
      flags TEXT DEFAULT '[]',
      owner_name TEXT,
      property_type TEXT,
      location TEXT DEFAULT '{}',
      area REAL,
      valuation_aed REAL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS dld_events (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      external_event_id TEXT,
      title_deed_external_id TEXT NOT NULL,
      dld_title_id TEXT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      processed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (dld_title_id) REFERENCES dld_titles(id)
    );

    CREATE TABLE IF NOT EXISTS property_units (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      property_asset_id TEXT NOT NULL,
      unit_number TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'apartment',
      area REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'vacant',
      monthly_rent TEXT,
      currency TEXT NOT NULL DEFAULT 'AED',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (property_asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS nav_history (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      nav_per_token TEXT NOT NULL,
      total_asset_value TEXT NOT NULL,
      liabilities TEXT NOT NULL DEFAULT '0',
      net_asset_value TEXT NOT NULL,
      total_supply TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'AED',
      source TEXT NOT NULL DEFAULT 'manual',
      computed_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS investor_plans (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      name TEXT NOT NULL,
      min_investment TEXT NOT NULL,
      max_investment TEXT NOT NULL,
      max_holding_percent TEXT NOT NULL,
      management_fee_percent TEXT NOT NULL DEFAULT '0',
      performance_fee_percent TEXT NOT NULL DEFAULT '0',
      lockup_days INTEGER NOT NULL,
      accreditation_required INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'AED',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS exit_window_schedules (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      frequency TEXT NOT NULL,
      window_duration_days INTEGER NOT NULL,
      max_redemption_percent TEXT NOT NULL DEFAULT '5',
      notice_period_days INTEGER NOT NULL,
      next_window_opens TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    );
  `);
}

async function closeDb(): Promise<void> {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
}

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
    jurisdictions: JSON.stringify(['AE', 'US']),
    metadata: JSON.stringify({ notes: 'Sample investor for sandbox testing' }),
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
    events: JSON.stringify(['transfer.created', 'transfer.completed', 'compliance.approved']),
    status: 'active',
    secret: `whsec_${randomUUID().replace(/-/g, '')}`,
  };
}

// ============================================================================
// SEEDING FUNCTIONS
// ============================================================================

async function cleanDatabase(client: DbClient): Promise<void> {
  logger.info('Cleaning database...');

  // Tables to clean (in reverse dependency order)
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

  if (DB_MODE === 'sqlite') {
    // SQLite mode - delete from tables
    for (const table of tables) {
      try {
        await client.query(`DELETE FROM ${table}`);
      } catch (error) {
        // Table might not exist
      }
    }
  } else {
    // PostgreSQL mode - use TRUNCATE with CASCADE
    try {
      await client.query('SET session_replication_role = replica');
    } catch (e) { /* ignore */ }

    for (const table of tables) {
      try {
        await client.query(`TRUNCATE TABLE ${table} CASCADE`);
      } catch (error) {
        // Table might not exist
      }
    }

    try {
      await client.query('SET session_replication_role = DEFAULT');
    } catch (e) { /* ignore */ }
  }

  logger.info('Database cleaned');
}

async function seedOrganization(client: DbClient, options: SeedOptions): Promise<{ orgId: string; apiKey: string }> {
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

async function seedMinimal(client: DbClient, orgId: string): Promise<void> {
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

async function seedRealEstateData(client: DbClient, orgId: string, assetId: string): Promise<void> {
  logger.info('Creating real estate vertical data...');

  // DLD Title
  const titleId = randomUUID();
  const deedNumber = 'DLD-2026-MH-12345';
  try {
    await client.query(
      `INSERT INTO dld_titles (id, org_id, asset_id, external_title_deed_id, status, snapshot, flags, owner_name, property_type, location, area, valuation_aed, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        titleId, orgId, assetId,
        deedNumber,
        'verified',
        JSON.stringify({
          deedNumber,
          propertyType: 'RESIDENTIAL',
          ownershipType: 'FREEHOLD',
          area: 1850,
          location: { emirate: 'Dubai', community: 'Dubai Marina', building: 'Marina Heights', unit: '2501' },
          registrationDate: '2025-06-15',
        }),
        JSON.stringify({ tokenizationApproved: true }),
        'Marina Heights Development LLC',
        'RESIDENTIAL',
        JSON.stringify({ emirate: 'Dubai', community: 'Dubai Marina', building: 'Marina Heights' }),
        1850,
        10200000,
        JSON.stringify({ source: 'seed' }),
      ]
    );
  } catch (error) { /* ignore */ }

  // DLD Events
  for (const evt of ['title_registered', 'tokenization_approved']) {
    try {
      await client.query(
        `INSERT INTO dld_events (id, org_id, external_event_id, title_deed_external_id, dld_title_id, type, payload, processed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), orgId, `EVT-${randomUUID().slice(0, 8)}`, deedNumber, titleId, evt, JSON.stringify({ source: 'seed' }), 1]
      );
    } catch (error) { /* ignore */ }
  }

  // Property Units
  const units = [
    { number: '2501', type: 'penthouse', area: 280, status: 'occupied', monthlyRent: '45000' },
    { number: '1801', type: 'apartment', area: 140, status: 'occupied', monthlyRent: '18000' },
    { number: '1205', type: 'apartment', area: 85, status: 'vacant', monthlyRent: '12000' },
    { number: 'G01', type: 'retail', area: 200, status: 'occupied', monthlyRent: '35000' },
  ];
  for (const unit of units) {
    try {
      await client.query(
        `INSERT INTO property_units (id, org_id, property_asset_id, unit_number, type, area, status, monthly_rent, currency, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [randomUUID(), orgId, assetId, unit.number, unit.type, unit.area, unit.status, unit.monthlyRent, 'AED', JSON.stringify({})]
      );
    } catch (error) { /* ignore */ }
  }

  // NAV History
  const navDates = [
    { daysAgo: 90, value: '9500000' },
    { daysAgo: 60, value: '9750000' },
    { daysAgo: 30, value: '10000000' },
    { daysAgo: 0, value: '10200000' },
  ];
  for (const nav of navDates) {
    const computedAt = new Date(Date.now() - nav.daysAgo * 86400000).toISOString();
    const netValue = String(Number(nav.value) - 500000);
    const navPerToken = String((Number(nav.value) - 500000) / 1000000);
    try {
      await client.query(
        `INSERT INTO nav_history (id, org_id, asset_id, total_asset_value, liabilities, net_asset_value, nav_per_token, total_supply, currency, source, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [randomUUID(), orgId, assetId, nav.value, '500000', netValue, navPerToken, '1000000', 'AED', 'manual', computedAt]
      );
    } catch (error) { /* ignore */ }
  }

  // Investor Tier Plans
  try {
    await client.query(
      `INSERT INTO investor_plans (id, asset_id, tier, name, min_investment, max_investment, max_holding_percent, management_fee_percent, performance_fee_percent, lockup_days, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [randomUUID(), assetId, 'retail', 'Retail Tier', '50000', '500000', '10', '2', '0', 180, 'AED']
    );
    await client.query(
      `INSERT INTO investor_plans (id, asset_id, tier, name, min_investment, max_investment, max_holding_percent, management_fee_percent, performance_fee_percent, lockup_days, accreditation_required, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [randomUUID(), assetId, 'professional', 'Professional Tier', '500000', '5000000', '25', '1.5', '10', 90, 1, 'AED']
    );
  } catch (error) { /* ignore */ }

  // Exit Window Schedule
  try {
    const nextWindow = new Date(Date.now() + 30 * 86400000).toISOString();
    await client.query(
      `INSERT INTO exit_window_schedules (id, asset_id, frequency, window_duration_days, max_redemption_percent, notice_period_days, next_window_opens)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), assetId, 'quarterly', 14, '5', 30, nextWindow]
    );
  } catch (error) { /* ignore */ }

  logger.info('Real estate seed data created (DLD title, 4 units, NAV history, tiers, exit windows)');
}

async function seedFull(client: DbClient, orgId: string): Promise<void> {
  logger.info('Creating full seed data...');

  // First do minimal seed
  await seedMinimal(client, orgId);

  // Get the asset ID we just created (for RE data)
  let assetId: string | null = null;
  try {
    const result = await client.query('SELECT id FROM assets WHERE org_id = $1 LIMIT 1', [orgId]);
    if (result.rows.length > 0) {
      assetId = result.rows[0].id;
    }
  } catch (error) { /* ignore */ }

  // Seed real estate vertical data
  if (assetId) {
    await seedRealEstateData(client, orgId, assetId);
  }

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
  console.log(`Database mode: ${DB_MODE}`);

  const client = await getDbClient();

  try {
    await client.begin();

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

    await client.commit();

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
    await client.rollback();
    logger.error('Seeding failed', { error });
    throw error;
  } finally {
    client.release();
    await closeDb();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
