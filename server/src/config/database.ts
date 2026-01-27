import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import pg from 'pg';
import Database from 'better-sqlite3';
import * as schema from '../db/schema.js';
import { logger } from '../middleware/logger.js';

const { Pool } = pg;

// Determine database mode from environment
const DB_MODE = process.env.DB_MODE || 'postgresql';
const SQLITE_PATH = process.env.SQLITE_PATH || './data/ahoy.db';

// Database instances
let db: ReturnType<typeof drizzlePg> | ReturnType<typeof drizzleSqlite>;
let pool: pg.Pool | null = null;
let sqliteDb: Database.Database | null = null;

if (DB_MODE === 'sqlite') {
  // SQLite mode
  logger.info(`Using SQLite database at ${SQLITE_PATH}`);
  sqliteDb = new Database(SQLITE_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  db = drizzleSqlite(sqliteDb, { schema }) as any;
} else {
  // PostgreSQL mode
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://ahoy:ahoy_dev_password@localhost:5432/ahoy_tokenisation',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected PostgreSQL error on idle client', { error: err as Error });
  });

  db = drizzlePg(pool, { schema }) as any;
}

// Re-export all schema tables for convenience
export const {
  // IAM
  orgs, users, roles, userRoles, apiKeys, oauthClients, oauthTokens,
  // Billing & Usage
  billingPlans, orgBilling, usageRecords, usageQuotas,
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
  // Outbox & Workflows
  domainEventsOutbox, complianceApprovals,
  // Issuance
  offerings, allocations, buybackRequests,
  // Clawbacks
  clawbacks,
  // Distributions & Corporate Actions
  distributions, distributionPayments, corporateActions, corporateActionEntitlements,
  // Vesting
  vestingSchedules, vestingMilestones, vestingReleases,
  // State Transitions & Compliance
  stateTransitions, complianceReceipts, complianceAuditLog, policyRulesets,
} = schema;

// Export schema for query builder access
export { schema };

// Export database instance and pool
export { db, pool };

/**
 * Execute raw SQL query (works for both SQLite and PostgreSQL)
 */
export async function rawQuery<T = any>(query: string, params: any[] = []): Promise<T[]> {
  if (DB_MODE === 'sqlite' && sqliteDb) {
    const stmt = sqliteDb.prepare(query);
    return stmt.all(...params) as T[];
  } else if (pool) {
    const result = await pool.query(query, params);
    return result.rows as T[];
  }
  throw new Error('No database connection available');
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    if (DB_MODE === 'sqlite') {
      if (sqliteDb) {
        sqliteDb.prepare('SELECT 1').get();
        return true;
      }
      return false;
    } else {
      if (pool) {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        return true;
      }
      return false;
    }
  } catch (error) {
    logger.error('Database connection test failed:', { error: error as Error });
    return false;
  }
}

/**
 * Get database mode
 */
export function getDbMode(): string {
  return DB_MODE;
}

/**
 * Gracefully close the connection pool
 */
export async function closePool(): Promise<void> {
  if (DB_MODE === 'sqlite') {
    if (sqliteDb) {
      sqliteDb.close();
    }
  } else {
    if (pool) {
      await pool.end();
    }
  }
}

/**
 * Initialize SQLite schema (create tables if they don't exist)
 */
export function initializeSqliteSchema(): void {
  if (DB_MODE !== 'sqlite' || !sqliteDb) return;

  logger.info('Initializing SQLite schema...');

  // Create essential tables for the transitions endpoint
  sqliteDb.exec(`
    -- Organizations
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      settings TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- State Transitions (for the transitions endpoint)
    CREATE TABLE IF NOT EXISTS state_transitions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      subject_type TEXT NOT NULL DEFAULT 'asset',
      subject_id TEXT NOT NULL,
      previous_state TEXT NOT NULL,
      new_state TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      previous_transition_id TEXT,
      triggered_by_id TEXT NOT NULL,
      triggered_by_type TEXT NOT NULL,
      triggered_by_name TEXT,
      reason TEXT NOT NULL,
      justification TEXT,
      decision_receipt_id TEXT,
      compliance_result TEXT,
      transition_hash TEXT NOT NULL,
      previous_transition_hash TEXT,
      metadata TEXT DEFAULT '{}',
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (previous_transition_id) REFERENCES state_transitions(id)
    );

    -- Assets
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'draft',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    );

    -- Tokens
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      asset_id TEXT,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'draft',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    );

    -- Compliance Receipts
    CREATE TABLE IF NOT EXISTS compliance_receipts (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      receipt_hash TEXT NOT NULL,
      policy_hash TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      rules_evaluated INTEGER NOT NULL DEFAULT 0,
      violations TEXT DEFAULT '[]',
      conditions TEXT DEFAULT '[]',
      partner_explanation TEXT,
      signature TEXT NOT NULL,
      signed_at TEXT NOT NULL,
      signed_by TEXT NOT NULL,
      chain_previous_receipt_id TEXT,
      chain_sequence INTEGER NOT NULL DEFAULT 0,
      chain_hash TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_state_transitions_org_id ON state_transitions(org_id);
    CREATE INDEX IF NOT EXISTS idx_state_transitions_subject ON state_transitions(subject_type, subject_id);
    CREATE INDEX IF NOT EXISTS idx_state_transitions_triggered_by ON state_transitions(triggered_by_id);
    CREATE INDEX IF NOT EXISTS idx_assets_org_id ON assets(org_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_org_id ON tokens(org_id);

    -- Insert dev org if not exists
    INSERT OR IGNORE INTO orgs (id, name, slug) VALUES ('dev-org', 'Development Organization', 'dev-org');
  `);

  logger.info('SQLite schema initialized');
}

// Auto-initialize SQLite schema on load
if (DB_MODE === 'sqlite') {
  initializeSqliteSchema();
}
