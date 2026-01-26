import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import pg from 'pg';
import Database from 'better-sqlite3';
import * as pgSchema from '../db/schema.js';
import * as sqliteSchema from '../db/schema.sqlite.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database mode: 'postgresql' or 'sqlite'
const DB_MODE = process.env.DB_MODE || 'sqlite';

// PostgreSQL pool (lazy initialized)
let pgPool: pg.Pool | null = null;

// SQLite database (lazy initialized)
let sqliteDb: Database.Database | null = null;

// Unified database interface
let db: ReturnType<typeof drizzlePg<typeof pgSchema>> | ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>;

// Re-export schema tables (use SQLite or PostgreSQL based on mode)
// Cast to any for SQLite to avoid type conflicts at runtime
const activeSchema = DB_MODE === 'postgresql' ? pgSchema : (sqliteSchema as typeof pgSchema);

export const {
  // IAM
  orgs, users, roles, userRoles, apiKeys, oauthClients,
  // Projects & Documents
  projects, documents,
  // Parties
  parties, partyWallets,
  // Investors
  investors, investorWallets, kycSessions,
  // Assets
  assets,
  // Policies
  policies, policyVersions, decisions,
  // Tokens
  tokens, tokenTranches, issuances, redemptions,
  // Transfers
  transfers, settlements,
  // DLD
  dldTitles, dldEvents, dldSyncJobs,
  // Ledger
  ledgerPositions, ledgerEvents, capTableSnapshots,
  // Webhooks
  webhookEndpoints, webhookDeliveries,
  // Audit
  auditLog, events,
  // Sessions & Deployments
  sessions, chainDeployments, tokenBalances,
  // Idempotency & Event Bus
  idempotencyKeys, eventBusQueue,
} = activeSchema;

// Get schema based on mode
export const schema = DB_MODE === 'postgresql' ? pgSchema : sqliteSchema;

// Initialize database based on mode
function initDatabase() {
  if (DB_MODE === 'postgresql') {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://ahoy:ahoy_dev_password@localhost:5432/ahoy_tokenisation',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pgPool.on('error', (err) => {
      console.error('Unexpected PostgreSQL error on idle client', err);
    });

    db = drizzlePg(pgPool, { schema: pgSchema });
    console.log('Database mode: PostgreSQL');
  } else {
    // SQLite mode - create data directory if needed
    const dataDir = join(__dirname, '../../data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = process.env.SQLITE_PATH || join(dataDir, 'ahoy.db');
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');

    // Initialize schema
    initSqliteSchema(sqliteDb);

    db = drizzleSqlite(sqliteDb, { schema: sqliteSchema });
    console.log(`Database mode: SQLite (${dbPath})`);
  }

  return db;
}

// Initialize SQLite schema
function initSqliteSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      roles TEXT DEFAULT '[]',
      jurisdiction TEXT NOT NULL,
      verification_level TEXT DEFAULT 'NONE',
      kyc_verified INTEGER DEFAULT 0,
      kyc_expiry_date TEXT,
      accredited_investor INTEGER DEFAULT 0,
      is_frozen INTEGER DEFAULT 0,
      freeze_reason TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS party_wallets (
      id TEXT PRIMARY KEY,
      party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      wallet_type TEXT DEFAULT 'EOA',
      is_primary INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      verified_at TEXT,
      created_at TEXT,
      UNIQUE(address, chain_id)
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      project_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      title_deed_external_id TEXT,
      right_type TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'DRAFT',
      issuer_id TEXT REFERENCES parties(id),
      jurisdiction TEXT NOT NULL,
      attributes TEXT DEFAULT '{}',
      verification_state TEXT DEFAULT '{}',
      validity_period TEXT,
      transferability_rules TEXT,
      metadata TEXT DEFAULT '{}',
      version INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      type TEXT NOT NULL,
      asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      event_version INTEGER DEFAULT 1,
      timestamp TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      siwe_nonce TEXT NOT NULL,
      siwe_issued_at TEXT,
      siwe_expiry_at TEXT,
      jwt_issued_at TEXT,
      jwt_expires_at TEXT,
      refresh_token_hash TEXT,
      refresh_expires_at TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chain_deployments (
      id TEXT PRIMARY KEY,
      asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
      chain_id INTEGER NOT NULL,
      chain_name TEXT NOT NULL,
      contract_type TEXT NOT NULL,
      contract_address TEXT NOT NULL,
      deploy_tx_hash TEXT,
      deployer_address TEXT,
      verified INTEGER DEFAULT 0,
      abi TEXT,
      created_at TEXT,
      UNIQUE(asset_id, chain_id, contract_type)
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      project_id TEXT,
      asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      standard TEXT NOT NULL DEFAULT 'erc3643',
      chain_id INTEGER NOT NULL,
      address TEXT,
      identity_registry_address TEXT,
      compliance_address TEXT,
      decimals INTEGER NOT NULL DEFAULT 18,
      total_supply TEXT DEFAULT '0',
      issued_supply TEXT DEFAULT '0',
      max_supply TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      policy_id TEXT,
      compliance_modules TEXT DEFAULT '[]',
      deploy_tx_hash TEXT,
      deployed_at TEXT,
      deployed_by TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS token_balances (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      holder_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      balance TEXT NOT NULL DEFAULT '0',
      last_updated_at TEXT,
      UNIQUE(asset_id, holder_id)
    );

    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      settings TEXT DEFAULT '{}',
      risk_profile TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      environment TEXT NOT NULL DEFAULT 'test',
      scopes TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      last_used_at TEXT,
      expires_at TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      settings TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT,
      hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      metadata TEXT DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      permissions TEXT DEFAULT '[]',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS oauth_clients (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      client_id TEXT NOT NULL UNIQUE,
      client_secret_hash TEXT NOT NULL,
      redirect_uris TEXT DEFAULT '[]',
      scopes TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS investors (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      external_id TEXT,
      type TEXT NOT NULL DEFAULT 'individual',
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      jurisdiction TEXT,
      kyc_status TEXT NOT NULL DEFAULT 'pending',
      kyc_verified_at TEXT,
      kyc_expires_at TEXT,
      accreditation_status TEXT DEFAULT 'none',
      accreditation_verified_at TEXT,
      risk_score INTEGER,
      tax_id TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS investor_wallets (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
      address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      is_primary INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      verified_at TEXT,
      label TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS kyc_sessions (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      external_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      metadata TEXT DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS policy_versions (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      rules TEXT NOT NULL,
      hash TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      activated_at TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      policy_version_id TEXT REFERENCES policy_versions(id),
      type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      result TEXT NOT NULL,
      reasons TEXT DEFAULT '[]',
      inputs_hash TEXT,
      decision_hash TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS token_tranches (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      supply TEXT NOT NULL DEFAULT '0',
      issued_supply TEXT DEFAULT '0',
      locked_until TEXT,
      restrictions TEXT DEFAULT '{}',
      vesting_schedule TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS issuances (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      tranche_id TEXT REFERENCES token_tranches(id),
      investor_id TEXT NOT NULL REFERENCES investors(id),
      wallet_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      tx_hash TEXT,
      block_number INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT,
      confirmed_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS redemptions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id),
      wallet_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      tx_hash TEXT,
      block_number INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT,
      confirmed_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      metadata TEXT DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      transfer_id TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      settled_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS dld_titles (
      id TEXT PRIMARY KEY,
      external_id TEXT NOT NULL,
      asset_id TEXT REFERENCES assets(id),
      status TEXT NOT NULL DEFAULT 'pending',
      data TEXT DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS dld_events (
      id TEXT PRIMARY KEY,
      title_id TEXT NOT NULL REFERENCES dld_titles(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS dld_sync_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ledger_positions (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id),
      wallet_address TEXT NOT NULL,
      balance TEXT NOT NULL DEFAULT '0',
      locked_balance TEXT DEFAULT '0',
      last_movement_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ledger_events (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      from_address TEXT,
      to_address TEXT,
      wallet_address TEXT,
      amount TEXT NOT NULL,
      tx_hash TEXT,
      block_number INTEGER,
      log_index INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS cap_table_snapshots (
      id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      snapshot_at TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      events TEXT DEFAULT '[]',
      secret TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      last_attempt_at TEXT,
      response TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES orgs(id) ON DELETE SET NULL,
      actor_id TEXT,
      actor_type TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      description TEXT,
      metadata TEXT DEFAULT '{}',
      prev_hash TEXT,
      entry_hash TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      org_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      response TEXT,
      status_code INTEGER,
      expires_at TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS event_bus_queue (
      id TEXT PRIMARY KEY,
      org_id TEXT,
      topic TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retries INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      process_after TEXT,
      processed_at TEXT,
      error TEXT,
      created_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
    CREATE INDEX IF NOT EXISTS idx_tokens_org ON tokens(org_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
    CREATE INDEX IF NOT EXISTS idx_tokens_chain ON tokens(chain_id);
    CREATE INDEX IF NOT EXISTS idx_parties_jurisdiction ON parties(jurisdiction);
    CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(type);
    CREATE INDEX IF NOT EXISTS idx_assets_state ON assets(state);
    CREATE INDEX IF NOT EXISTS idx_assets_issuer ON assets(issuer_id);
    CREATE INDEX IF NOT EXISTS idx_events_asset ON events(asset_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_investors_org ON investors(org_id);
    CREATE INDEX IF NOT EXISTS idx_investors_kyc ON investors(kyc_status);
    CREATE INDEX IF NOT EXISTS idx_issuances_token ON issuances(token_id);
    CREATE INDEX IF NOT EXISTS idx_redemptions_token ON redemptions(token_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_token ON transfers(token_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_positions_token ON ledger_positions(token_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_events_token ON ledger_events(token_id);

    -- Seed test data for dev mode
    INSERT OR IGNORE INTO orgs (id, name, slug, status, settings, risk_profile, metadata, created_at, updated_at)
    VALUES ('test-org', 'Test Organization', 'test-org', 'active', '{}', '{}', '{}', datetime('now'), datetime('now'));

    INSERT OR IGNORE INTO parties (id, name, type, roles, jurisdiction, verification_level, kyc_verified, metadata, created_at, updated_at)
    VALUES ('test-party', 'Test Party', 'INSTITUTION', '[]', 'US', 'BASIC', 1, '{}', datetime('now'), datetime('now'));
  `);
}

// Initialize on import
db = initDatabase();

export { db };
export { pgPool as pool };

export async function testConnection(): Promise<boolean> {
  try {
    if (DB_MODE === 'postgresql' && pgPool) {
      const client = await pgPool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } else if (sqliteDb) {
      sqliteDb.prepare('SELECT 1').get();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

export function getDbMode(): string {
  return DB_MODE;
}
