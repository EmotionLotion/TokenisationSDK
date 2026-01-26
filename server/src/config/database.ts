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
// For PostgreSQL mode, export all tables from pgSchema
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
} = DB_MODE === 'postgresql' ? pgSchema : (pgSchema as any); // SQLite schema needs updating

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
