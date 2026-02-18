import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as schema from '../db/schema.js';
import { logger } from '../middleware/logger.js';

const { Pool } = pg;

// Determine database mode from environment
const DB_MODE = process.env.DB_MODE || 'postgresql';
const SQLITE_PATH = process.env.SQLITE_PATH || './data/ahoy.db';

// Database instances — typed as PostgreSQL with schema for relational query access
let db: NodePgDatabase<typeof schema>;
let pool: pg.Pool | null = null;
let sqliteDb: Database.Database | null = null;

if (DB_MODE === 'sqlite') {
  // SQLite mode
  logger.info(`Using SQLite database at ${SQLITE_PATH}`);
  sqliteDb = new Database(SQLITE_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  // Register PostgreSQL-compatible functions for Drizzle ORM compatibility
  sqliteDb.function('gen_random_uuid', () => randomUUID());
  sqliteDb.function('now', () => new Date().toISOString());

  const sqliteOrmDb = drizzleSqlite(sqliteDb, { schema });

  // Patch transaction() to support async callbacks.
  // better-sqlite3 is synchronous and rejects Promise-returning transaction callbacks.
  // In SQLite WAL mode with a single connection, sequential async execution is safe.
  const originalTransaction = sqliteOrmDb.transaction.bind(sqliteOrmDb);
  (sqliteOrmDb as any).transaction = async (fn: (tx: any) => any, _config?: any) => {
    try {
      // Try native synchronous transaction first
      return originalTransaction(fn as any);
    } catch (e: any) {
      if (e?.message?.includes('cannot return a promise') || e?.message?.includes('Promise')) {
        // Async callback — run manually with BEGIN/COMMIT/ROLLBACK
        sqliteDb!.exec('BEGIN');
        try {
          const result = await fn(sqliteOrmDb);
          sqliteDb!.exec('COMMIT');
          return result;
        } catch (innerError) {
          try { sqliteDb!.exec('ROLLBACK'); } catch { /* already rolled back */ }
          throw innerError;
        }
      }
      throw e;
    }
  };

  db = sqliteOrmDb as any;
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
  // Real Estate: Investor Tiers, Exit Windows, Secondary Market
  investorPlans, investorTierAssignments, exitWindowSchedules, exitWindows, exitRedemptions, secondaryListings,
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
    // Convert PostgreSQL-style placeholders ($1, $2) to SQLite-style (?)
    const sqliteQuery = query.replace(/\$\d+/g, '?');
    const stmt = sqliteDb.prepare(sqliteQuery);
    return stmt.all(...params) as T[];
  } else if (pool) {
    const result = await pool.query(query, params);
    return result.rows as T[];
  }
  throw new Error('No database connection available');
}

/**
 * Execute raw SQL statement that doesn't return data (DDL, INSERT, UPDATE, DELETE)
 * For CREATE TABLE, CREATE INDEX, INSERT, UPDATE, DELETE operations
 */
export async function execStatement(query: string, params: any[] = []): Promise<void> {
  if (DB_MODE === 'sqlite' && sqliteDb) {
    if (params.length === 0) {
      // For DDL statements without parameters, use exec
      sqliteDb.exec(query);
    } else {
      // Convert PostgreSQL-style placeholders ($1, $2) to SQLite-style (?)
      const sqliteQuery = query.replace(/\$\d+/g, '?');
      const stmt = sqliteDb.prepare(sqliteQuery);
      stmt.run(...params);
    }
    return;
  } else if (pool) {
    await pool.query(query, params);
    return;
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
 * Creates all tables matching the Drizzle PG schema for full API compatibility.
 */
export function initializeSqliteSchema(): void {
  if (DB_MODE !== 'sqlite' || !sqliteDb) return;

  logger.info('Initializing SQLite schema...');

  // ========================================================================
  // SECTION 1: IAM (Identity & Access Management)
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      settings TEXT DEFAULT '{}',
      risk_profile TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      name TEXT,
      password_hash TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      email_verified INTEGER DEFAULT 0,
      last_login_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_org_email ON users(org_id, email);

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      permissions TEXT DEFAULT '[]',
      is_system INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_org_name ON roles(org_id, name);

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      granted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      granted_by TEXT,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      scopes TEXT DEFAULT '[]',
      environment TEXT NOT NULL DEFAULT 'test',
      status TEXT NOT NULL DEFAULT 'active',
      last_used_at TEXT,
      expires_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS oauth_clients (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL UNIQUE,
      client_secret_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      redirect_uris TEXT DEFAULT '[]',
      scopes TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
      token_type TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      scopes TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 1b: Billing & Usage Tracking
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS billing_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      quotas TEXT NOT NULL,
      features TEXT NOT NULL,
      price_monthly INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS org_billing (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL UNIQUE REFERENCES orgs(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES billing_plans(id),
      status TEXT NOT NULL DEFAULT 'active',
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      stripe_customer_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      call_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      total_response_time_ms INTEGER NOT NULL DEFAULT 0,
      total_request_bytes INTEGER NOT NULL DEFAULT 0,
      total_response_bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_unique ON usage_records(org_id, date, endpoint, method);

    CREATE TABLE IF NOT EXISTS usage_quotas (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      resource TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      limit_value INTEGER NOT NULL,
      used_value INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quota_unique ON usage_quotas(org_id, resource);
  `);

  // ========================================================================
  // SECTION 2: Projects & Documents
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      jurisdiction TEXT NOT NULL DEFAULT 'DUBAI',
      asset_type TEXT NOT NULL DEFAULT 'REAL_ESTATE',
      status TEXT NOT NULL DEFAULT 'draft',
      settings TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id),
      asset_id TEXT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 's3',
      uri TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      signed_by TEXT,
      signed_at TEXT,
      status TEXT NOT NULL DEFAULT 'uploaded',
      expires_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 3: Parties
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS party_wallets (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
      party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      wallet_type TEXT DEFAULT 'EOA',
      custody_type TEXT DEFAULT 'non_custodial',
      is_primary INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      verified_at TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_party_wallets_address_chain ON party_wallets(address, chain_id);
  `);

  // ========================================================================
  // SECTION 4: Investors & KYC
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS investors (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      party_id TEXT REFERENCES parties(id),
      external_id TEXT,
      type TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      jurisdiction TEXT NOT NULL DEFAULT 'AE',
      country_code TEXT,
      tax_residency TEXT,
      classification TEXT NOT NULL DEFAULT 'retail',
      risk_tier TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      kyc_status TEXT NOT NULL DEFAULT 'none',
      kyc_level TEXT DEFAULT 'basic',
      kyc_provider TEXT,
      pii_ref TEXT,
      accredited_status TEXT DEFAULT 'unknown',
      accredited_verified_at TEXT,
      accredited_expires_at TEXT,
      sanctions_status TEXT DEFAULT 'not_screened',
      sanctions_screened_at TEXT,
      profile TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investor_wallets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
      chain_id INTEGER NOT NULL,
      address TEXT NOT NULL,
      label TEXT,
      custody_type TEXT NOT NULL DEFAULT 'non_custodial',
      status TEXT NOT NULL DEFAULT 'pending',
      verified_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_investor_wallets_unique ON investor_wallets(org_id, investor_id, chain_id, address);

    CREATE TABLE IF NOT EXISTS kyc_sessions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_ref TEXT,
      external_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      level TEXT NOT NULL DEFAULT 'basic',
      level_requested TEXT NOT NULL DEFAULT 'basic',
      redirect_url TEXT,
      checks TEXT DEFAULT '{}',
      provider_data TEXT DEFAULT '{}',
      evidence_hashes TEXT DEFAULT '[]',
      failure_reasons TEXT DEFAULT '[]',
      expires_at TEXT,
      completed_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 5: Assets
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id),
      name TEXT NOT NULL,
      description TEXT,
      title_deed_external_id TEXT,
      right_type TEXT NOT NULL DEFAULT 'OWNERSHIP',
      state TEXT NOT NULL DEFAULT 'DRAFT',
      issuer_id TEXT REFERENCES parties(id),
      jurisdiction TEXT NOT NULL DEFAULT '{}',
      attributes TEXT DEFAULT '{}',
      verification_state TEXT DEFAULT '{}',
      validity_period TEXT,
      transferability_rules TEXT,
      metadata TEXT DEFAULT '{}',
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 6: Policies & Compliance Decisions
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'transfer',
      status TEXT NOT NULL DEFAULT 'active',
      current_version_id TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS policy_versions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      ruleset TEXT NOT NULL,
      created_by TEXT,
      published_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_versions_unique ON policy_versions(policy_id, version);

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      policy_version_id TEXT REFERENCES policy_versions(id),
      subject_ref TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      inputs_hash TEXT NOT NULL,
      inputs TEXT NOT NULL,
      result TEXT NOT NULL,
      reasons TEXT DEFAULT '[]',
      required_actions TEXT DEFAULT '[]',
      signature TEXT,
      signed_by TEXT,
      signed_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 7: Tokens & On-chain Objects
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id),
      asset_id TEXT REFERENCES assets(id),
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      standard TEXT NOT NULL DEFAULT 'ERC3643',
      chain_id INTEGER NOT NULL DEFAULT 31337,
      address TEXT,
      identity_registry_address TEXT,
      compliance_address TEXT,
      decimals INTEGER NOT NULL DEFAULT 18,
      total_supply TEXT DEFAULT '0',
      issued_supply TEXT DEFAULT '0',
      max_supply TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      policy_id TEXT REFERENCES policies(id),
      compliance_modules TEXT DEFAULT '["identity","country","investor_type"]',
      deploy_tx_hash TEXT,
      deployed_at TEXT,
      deployed_by TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS token_tranches (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      supply TEXT NOT NULL DEFAULT '0',
      issued_supply TEXT NOT NULL DEFAULT '0',
      vesting_schedule TEXT DEFAULT '{}',
      rights TEXT NOT NULL DEFAULT '{}',
      restrictions TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS issuances (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      investor_id TEXT REFERENCES investors(id),
      to_wallet TEXT NOT NULL,
      to_investor_id TEXT REFERENCES investors(id),
      tranche_id TEXT REFERENCES token_tranches(id),
      amount TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      decision_id TEXT REFERENCES decisions(id),
      tx_hash TEXT,
      tx_block INTEGER,
      confirmed_at TEXT,
      idempotency_key TEXT,
      error TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redemptions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      investor_id TEXT REFERENCES investors(id),
      from_wallet TEXT NOT NULL,
      from_investor_id TEXT REFERENCES investors(id),
      amount TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      decision_id TEXT REFERENCES decisions(id),
      tx_hash TEXT,
      tx_block INTEGER,
      confirmed_at TEXT,
      idempotency_key TEXT,
      error TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clawbacks (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      from_investor_id TEXT REFERENCES investors(id),
      to_investor_id TEXT REFERENCES investors(id),
      amount TEXT NOT NULL,
      reason TEXT NOT NULL,
      reason_code TEXT,
      legal_reference TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      compliance_approval_id TEXT,
      decision_id TEXT REFERENCES decisions(id),
      requested_by TEXT,
      requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
      approved_by TEXT,
      approved_at TEXT,
      rejected_by TEXT,
      rejected_at TEXT,
      rejection_reason TEXT,
      executed_by TEXT,
      executed_at TEXT,
      tx_hash TEXT,
      tx_block INTEGER,
      confirmed_at TEXT,
      evidence_pack_id TEXT,
      idempotency_key TEXT,
      error TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 8: Compliance Approvals & Offerings
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS compliance_approvals (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      operation_type TEXT NOT NULL,
      operation_ref TEXT NOT NULL,
      operation_ref_type TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reason TEXT NOT NULL,
      supporting_docs TEXT DEFAULT '[]',
      required_approvers INTEGER NOT NULL DEFAULT 1,
      required_roles TEXT DEFAULT '[]',
      expires_at TEXT,
      approvals TEXT DEFAULT '[]',
      rejections TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      policy_version_id TEXT REFERENCES policy_versions(id),
      decision_id TEXT REFERENCES decisions(id),
      finalized_by TEXT,
      finalized_at TEXT,
      final_decision TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS offerings (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      offering_type TEXT NOT NULL DEFAULT 'primary',
      price_per_token TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USDC',
      decimals INTEGER NOT NULL DEFAULT 6,
      hard_cap TEXT NOT NULL,
      soft_cap TEXT,
      min_investment TEXT,
      max_investment TEXT,
      start_date TEXT,
      end_date TEXT,
      total_raised TEXT NOT NULL DEFAULT '0',
      total_allocations INTEGER NOT NULL DEFAULT 0,
      minted_amount TEXT NOT NULL DEFAULT '0',
      status TEXT NOT NULL DEFAULT 'draft',
      policy_id TEXT REFERENCES policies(id),
      jurisdiction_restrictions TEXT DEFAULT '[]',
      investor_restrictions TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS allocations (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      offering_id TEXT NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id),
      wallet_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      investment_amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_kyc',
      rejection_reason TEXT,
      payment_ref TEXT,
      payment_method TEXT,
      payment_received_at TEXT,
      tx_hash TEXT,
      tx_block INTEGER,
      issuance_id TEXT REFERENCES issuances(id),
      decision_id TEXT REFERENCES decisions(id),
      approved_at TEXT,
      confirmed_at TEXT,
      rejected_at TEXT,
      idempotency_key TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS buyback_requests (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id),
      wallet_address TEXT NOT NULL,
      token_amount TEXT NOT NULL,
      price_per_token TEXT NOT NULL,
      total_payment TEXT NOT NULL,
      payment_currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      compliance_approval_id TEXT,
      approved_by TEXT,
      approved_at TEXT,
      tokens_locked_at TEXT,
      burn_tx_hash TEXT,
      burned_at TEXT,
      payment_ref TEXT,
      payment_method TEXT,
      payment_sent_at TEXT,
      payment_confirmed_at TEXT,
      settlement_proof_uri TEXT,
      settlement_proof_hash TEXT,
      idempotency_key TEXT,
      error TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 8b: Transfers & Settlement
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      from_investor_id TEXT REFERENCES investors(id),
      to_investor_id TEXT REFERENCES investors(id),
      amount TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      decision_id TEXT REFERENCES decisions(id),
      tx_hash TEXT,
      tx_block INTEGER,
      tx_payload TEXT,
      signed_at TEXT,
      submitted_at TEXT,
      confirmed_at TEXT,
      settled_at TEXT,
      idempotency_key TEXT,
      expires_at TEXT,
      error TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      transfer_id TEXT REFERENCES transfers(id) ON DELETE CASCADE,
      issuance_id TEXT REFERENCES issuances(id) ON DELETE CASCADE,
      redemption_id TEXT REFERENCES redemptions(id) ON DELETE CASCADE,
      tx_hash TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      finality_status TEXT NOT NULL DEFAULT 'pending',
      confirmed_block INTEGER,
      finalized_block INTEGER,
      confirmations INTEGER DEFAULT 0,
      required_confirmations INTEGER NOT NULL DEFAULT 12,
      indexed_at TEXT,
      finalized_at TEXT,
      reorged_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 9: DLD (Dubai Land Department) Integration
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS dld_titles (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      asset_id TEXT REFERENCES assets(id),
      external_title_deed_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      snapshot TEXT DEFAULT '{}',
      flags TEXT DEFAULT '[]',
      owner_name TEXT,
      property_type TEXT,
      location TEXT DEFAULT '{}',
      area REAL,
      area_unit TEXT DEFAULT 'sqm',
      valuation_aed REAL,
      last_synced_at TEXT,
      verified_at TEXT,
      verified_by TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dld_titles_external_id ON dld_titles(org_id, external_title_deed_id);

    CREATE TABLE IF NOT EXISTS dld_events (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      external_event_id TEXT,
      title_deed_external_id TEXT NOT NULL,
      dld_title_id TEXT REFERENCES dld_titles(id),
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      processed INTEGER DEFAULT 0,
      processed_at TEXT,
      error TEXT,
      received_at TEXT DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dld_sync_jobs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      asset_id TEXT REFERENCES assets(id),
      dld_title_id TEXT REFERENCES dld_titles(id),
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT DEFAULT '{}',
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 10: Ledger & Reporting
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS ledger_positions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      investor_id TEXT REFERENCES investors(id),
      wallet_address TEXT NOT NULL,
      balance TEXT NOT NULL DEFAULT '0',
      frozen_balance TEXT NOT NULL DEFAULT '0',
      last_event_ref TEXT,
      last_event_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_positions_token_wallet ON ledger_positions(token_id, wallet_address);

    CREATE TABLE IF NOT EXISTS ledger_events (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      investor_id TEXT REFERENCES investors(id),
      event_type TEXT NOT NULL,
      from_wallet TEXT,
      to_wallet TEXT,
      delta TEXT NOT NULL,
      ref TEXT,
      ref_type TEXT,
      tx_hash TEXT,
      tx_block INTEGER,
      balance_before TEXT,
      balance_after TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cap_table_snapshots (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      as_of TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      total_holders INTEGER NOT NULL DEFAULT 0,
      total_supply TEXT NOT NULL,
      merkle_root TEXT,
      generated_by TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 11: Webhooks
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      description TEXT,
      events TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      version TEXT NOT NULL DEFAULT 'v1',
      last_delivery_at TEXT,
      last_delivery_status TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      last_attempt_at TEXT,
      next_attempt_at TEXT,
      response_status INTEGER,
      response_body TEXT,
      last_error TEXT,
      delivered_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 12: Audit Log
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      actor_id TEXT,
      actor_type TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      description TEXT,
      metadata TEXT DEFAULT '{}',
      prev_hash TEXT NOT NULL,
      entry_hash TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      event_version INTEGER DEFAULT 1,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 14: Sessions & Chain Deployments
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      party_id TEXT REFERENCES parties(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      siwe_nonce TEXT NOT NULL,
      siwe_issued_at TEXT,
      siwe_expiry_at TEXT,
      jwt_issued_at TEXT,
      jwt_expires_at TEXT,
      refresh_token_hash TEXT,
      refresh_expires_at TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chain_deployments (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
      asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
      token_id TEXT REFERENCES tokens(id) ON DELETE CASCADE,
      chain_id INTEGER NOT NULL,
      chain_name TEXT NOT NULL,
      contract_type TEXT NOT NULL,
      contract_address TEXT NOT NULL,
      deploy_tx_hash TEXT,
      deployer_address TEXT,
      verified INTEGER DEFAULT 0,
      abi TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS token_balances (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      holder_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      balance TEXT NOT NULL DEFAULT '0',
      last_updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_balances_asset_holder ON token_balances(asset_id, holder_id);
  `);

  // ========================================================================
  // SECTION 16: Idempotency & Event Bus
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      response_body TEXT,
      status_code INTEGER,
      error TEXT,
      expires_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_org_key ON idempotency_keys(org_id, key);

    CREATE TABLE IF NOT EXISTS domain_events_outbox (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      sequence INTEGER NOT NULL,
      global_sequence INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      published_at TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      request_id TEXT,
      actor_id TEXT,
      actor_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_bus_queue (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      event_id TEXT UNIQUE,
      deduplication_key TEXT UNIQUE,
      payload TEXT NOT NULL,
      trace TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      processed_by TEXT,
      processed_at TEXT,
      process_after TEXT DEFAULT CURRENT_TIMESTAMP,
      last_attempt_at TEXT,
      last_error TEXT,
      error TEXT,
      scheduled_for TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 18: Vesting Schedules
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS vesting_schedules (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id),
      wallet_address TEXT NOT NULL,
      total_amount TEXT NOT NULL,
      vesting_type TEXT NOT NULL,
      grant_date TEXT NOT NULL,
      start_date TEXT NOT NULL,
      cliff_date TEXT,
      end_date TEXT NOT NULL,
      cliff_months INTEGER DEFAULT 0,
      vesting_months INTEGER NOT NULL,
      cliff_amount TEXT,
      graded_schedule TEXT,
      vested_amount TEXT NOT NULL DEFAULT '0',
      released_amount TEXT NOT NULL DEFAULT '0',
      claimed_amount TEXT NOT NULL DEFAULT '0',
      status TEXT NOT NULL DEFAULT 'active',
      termination_date TEXT,
      termination_type TEXT,
      acceleration_triggers TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vesting_milestones (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      schedule_id TEXT NOT NULL REFERENCES vesting_schedules(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      vesting_percent REAL NOT NULL,
      target_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_at TEXT,
      completed_by TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vesting_releases (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      schedule_id TEXT NOT NULL REFERENCES vesting_schedules(id) ON DELETE CASCADE,
      amount TEXT NOT NULL,
      release_type TEXT NOT NULL,
      milestone_id TEXT REFERENCES vesting_milestones(id),
      tx_hash TEXT,
      tx_block INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      released_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 19: Distributions & Corporate Actions
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS distributions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      total_amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount_per_token TEXT NOT NULL,
      allocation_strategy TEXT NOT NULL DEFAULT 'pro_rata',
      record_date TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      ex_dividend_date TEXT,
      payment_method TEXT NOT NULL DEFAULT 'on_chain',
      status TEXT NOT NULL DEFAULT 'draft',
      snapshot_data TEXT,
      total_recipients INTEGER,
      paid_recipients INTEGER DEFAULT 0,
      total_paid TEXT DEFAULT '0',
      approved_by TEXT,
      approved_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS distribution_payments (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      distribution_id TEXT NOT NULL REFERENCES distributions(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id),
      wallet_address TEXT,
      token_balance TEXT NOT NULL,
      payment_amount TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      tx_hash TEXT,
      tx_block INTEGER,
      bank_reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS corporate_actions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      parameters TEXT NOT NULL,
      announcement_date TEXT NOT NULL,
      record_date TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'announced',
      new_token_id TEXT REFERENCES tokens(id),
      total_entitlements INTEGER,
      processed_entitlements INTEGER DEFAULT 0,
      approved_by TEXT,
      approved_at TEXT,
      executed_by TEXT,
      executed_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS corporate_action_entitlements (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      corporate_action_id TEXT NOT NULL REFERENCES corporate_actions(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id),
      wallet_address TEXT NOT NULL,
      original_balance TEXT NOT NULL,
      original_token_id TEXT NOT NULL,
      new_balance TEXT,
      new_token_id TEXT,
      fractional_amount TEXT,
      cash_in_lieu TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      processed_at TEXT,
      tx_hash TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 21: Declarative Policy Layer & Compliance
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS policy_rulesets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      policy_version_id TEXT NOT NULL REFERENCES policy_versions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      ruleset_json TEXT NOT NULL,
      ruleset_hash TEXT NOT NULL,
      compiled_rules TEXT,
      jurisdiction TEXT NOT NULL,
      jurisdiction_overlays TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 0,
      activated_at TEXT,
      activated_by TEXT,
      deactivated_at TEXT,
      deactivated_by TEXT,
      effective_from TEXT,
      effective_until TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS compliance_receipts (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      decision_id TEXT REFERENCES decisions(id),
      trace_id TEXT NOT NULL,
      receipt_hash TEXT NOT NULL UNIQUE,
      policy_hash TEXT NOT NULL,
      inputs_hash TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      signature TEXT NOT NULL,
      signature_algorithm TEXT NOT NULL DEFAULT 'ES256',
      signed_by TEXT NOT NULL,
      signed_at TEXT NOT NULL,
      evaluation_duration_ms INTEGER,
      rules_evaluated INTEGER NOT NULL,
      rules_passed INTEGER NOT NULL,
      rules_failed INTEGER NOT NULL,
      anchored_tx_hash TEXT,
      anchored_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS compliance_audit_log (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      trace_id TEXT NOT NULL,
      request_id TEXT,
      action TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      result TEXT NOT NULL,
      rules_evaluated INTEGER NOT NULL,
      violations TEXT DEFAULT '[]',
      partner_explanation TEXT,
      suggested_actions TEXT DEFAULT '[]',
      actor_id TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      entry_hash TEXT NOT NULL,
      previous_entry_hash TEXT,
      evaluation_duration_ms INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================================================
  // SECTION 22: State Transitions
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS state_transitions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
      token_id TEXT REFERENCES tokens(id) ON DELETE CASCADE,
      subject_type TEXT NOT NULL DEFAULT 'asset',
      subject_id TEXT NOT NULL,
      previous_state TEXT NOT NULL,
      new_state TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      previous_transition_id TEXT,
      triggered_by_id TEXT NOT NULL,
      triggered_by_type TEXT NOT NULL,
      triggered_by_name TEXT,
      triggered_by_ip TEXT,
      reason TEXT NOT NULL,
      justification TEXT,
      decision_receipt_id TEXT REFERENCES compliance_receipts(id),
      compliance_result TEXT,
      transition_hash TEXT NOT NULL,
      previous_transition_hash TEXT,
      request_id TEXT,
      trace_id TEXT,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_state_transitions_org_id ON state_transitions(org_id);
    CREATE INDEX IF NOT EXISTS idx_state_transitions_subject ON state_transitions(subject_type, subject_id);
  `);

  // ========================================================================
  // Airline Tickets & Related Tables
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS airline_tickets (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      token_id TEXT,
      chain_token_id TEXT,
      contract_address TEXT,
      chain_id INTEGER,
      flight_number TEXT NOT NULL,
      airline TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      departure_airport TEXT NOT NULL,
      arrival_airport TEXT NOT NULL,
      gate TEXT,
      seat TEXT,
      ticket_class TEXT NOT NULL DEFAULT 'ECONOMY',
      passenger_id TEXT,
      passenger_wallet TEXT,
      passenger_name TEXT,
      e_ticket_number TEXT,
      booking_reference TEXT,
      status TEXT NOT NULL DEFAULT 'ISSUED',
      issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
      checked_in_at TEXT,
      boarded_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      burned_at TEXT,
      transferable INTEGER DEFAULT 1,
      max_transfers INTEGER DEFAULT 3,
      transfer_count INTEGER DEFAULT 0,
      price_paid TEXT,
      currency TEXT DEFAULT 'ETH',
      metadata_version INTEGER DEFAULT 1,
      metadata_uri TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_airline_tickets_org ON airline_tickets(org_id);
    CREATE INDEX IF NOT EXISTS idx_airline_tickets_flight ON airline_tickets(flight_number, departure_time);
    CREATE INDEX IF NOT EXISTS idx_airline_tickets_status ON airline_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_airline_tickets_passenger ON airline_tickets(passenger_id);
    CREATE INDEX IF NOT EXISTS idx_airline_tickets_wallet ON airline_tickets(passenger_wallet);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_airline_tickets_eticket ON airline_tickets(org_id, e_ticket_number);
    CREATE INDEX IF NOT EXISTS idx_airline_tickets_booking ON airline_tickets(booking_reference);
    CREATE INDEX IF NOT EXISTS idx_airline_tickets_departure ON airline_tickets(departure_time);
    CREATE INDEX IF NOT EXISTS idx_airline_tickets_chain_token ON airline_tickets(contract_address, chain_token_id);

    CREATE TABLE IF NOT EXISTS ticket_transfers (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES airline_tickets(id) ON DELETE CASCADE,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      from_passenger_id TEXT,
      to_passenger_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      approved_by TEXT,
      approved_at TEXT,
      rejection_reason TEXT,
      kyc_required INTEGER DEFAULT 0,
      kyc_completed INTEGER DEFAULT 0,
      kyc_completed_at TEXT,
      resale_fee TEXT,
      resale_fee_currency TEXT,
      resale_fee_paid INTEGER DEFAULT 0,
      idempotency_key TEXT,
      tx_hash TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_transfers_org ON ticket_transfers(org_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket ON ticket_transfers(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_transfers_status ON ticket_transfers(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_transfers_idempotency ON ticket_transfers(org_id, idempotency_key);

    CREATE TABLE IF NOT EXISTS ticket_events (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES airline_tickets(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT,
      actor_role TEXT,
      previous_state TEXT,
      new_state TEXT,
      details TEXT DEFAULT '{}',
      correlation_id TEXT,
      tx_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_events_org ON ticket_events(org_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_events_type ON ticket_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_ticket_events_correlation ON ticket_events(correlation_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_events_created ON ticket_events(created_at);

    CREATE TABLE IF NOT EXISTS ticket_metadata_versions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES airline_tickets(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT,
      change_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_metadata_versions_ticket ON ticket_metadata_versions(ticket_id, version);
    CREATE INDEX IF NOT EXISTS idx_ticket_metadata_versions_field ON ticket_metadata_versions(ticket_id, field);

    CREATE TABLE IF NOT EXISTS resale_fee_ledger (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES airline_tickets(id) ON DELETE CASCADE,
      transfer_id TEXT NOT NULL REFERENCES ticket_transfers(id) ON DELETE CASCADE,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      collected_at TEXT,
      tx_hash TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_resale_fee_org ON resale_fee_ledger(org_id);
    CREATE INDEX IF NOT EXISTS idx_resale_fee_ticket ON resale_fee_ledger(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_resale_fee_status ON resale_fee_ledger(status);

    CREATE TABLE IF NOT EXISTS ticket_webhooks (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT DEFAULT '[]',
      secret TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      failure_count INTEGER DEFAULT 0,
      last_delivered_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_webhooks_org ON ticket_webhooks(org_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_webhooks_status ON ticket_webhooks(status);

    -- ====================================================================
    -- Hotel Reservations (vertical)
    -- ====================================================================
    CREATE TABLE IF NOT EXISTS hotel_reservations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      token_id TEXT,
      chain_token_id TEXT,
      contract_address TEXT,
      chain_id INTEGER,
      hotel_code TEXT NOT NULL,
      hotel_name TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      guest_email TEXT,
      room_type TEXT DEFAULT 'STANDARD',
      room_number TEXT,
      check_in_date TEXT NOT NULL,
      check_out_date TEXT NOT NULL,
      night_count INTEGER,
      rate TEXT,
      currency TEXT DEFAULT 'USD',
      guest_id TEXT,
      guest_wallet TEXT,
      confirmation_number TEXT,
      booking_reference TEXT,
      status TEXT NOT NULL DEFAULT 'CREATED',
      confirmed_at TEXT,
      checked_in_at TEXT,
      checked_out_at TEXT,
      closed_at TEXT,
      cancelled_at TEXT,
      transferable INTEGER DEFAULT 1,
      max_transfers INTEGER DEFAULT 2,
      transfer_count INTEGER DEFAULT 0,
      price_paid TEXT DEFAULT '0',
      metadata_version INTEGER DEFAULT 1,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_hotel_reservations_org ON hotel_reservations(org_id);
    CREATE INDEX IF NOT EXISTS idx_hotel_reservations_hotel_checkin ON hotel_reservations(hotel_code, check_in_date);
    CREATE INDEX IF NOT EXISTS idx_hotel_reservations_status ON hotel_reservations(status);
    CREATE INDEX IF NOT EXISTS idx_hotel_reservations_guest ON hotel_reservations(guest_id);
    CREATE INDEX IF NOT EXISTS idx_hotel_reservations_wallet ON hotel_reservations(guest_wallet);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_reservations_confirmation ON hotel_reservations(org_id, confirmation_number);

    CREATE TABLE IF NOT EXISTS hotel_reservation_transfers (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      reservation_id TEXT NOT NULL REFERENCES hotel_reservations(id) ON DELETE CASCADE,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      from_guest_id TEXT,
      to_guest_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      approved_by TEXT,
      approved_at TEXT,
      rejection_reason TEXT,
      kyc_required INTEGER DEFAULT 0,
      kyc_completed INTEGER DEFAULT 0,
      kyc_completed_at TEXT,
      resale_fee TEXT,
      resale_fee_currency TEXT,
      resale_fee_paid INTEGER DEFAULT 0,
      idempotency_key TEXT,
      tx_hash TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_hotel_reservation_transfers_org ON hotel_reservation_transfers(org_id);
    CREATE INDEX IF NOT EXISTS idx_hotel_reservation_transfers_reservation ON hotel_reservation_transfers(reservation_id);
    CREATE INDEX IF NOT EXISTS idx_hotel_reservation_transfers_status ON hotel_reservation_transfers(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_reservation_transfers_idempotency ON hotel_reservation_transfers(org_id, idempotency_key);

    CREATE TABLE IF NOT EXISTS hotel_reservation_events (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      reservation_id TEXT NOT NULL REFERENCES hotel_reservations(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT,
      actor_role TEXT,
      previous_state TEXT,
      new_state TEXT,
      details TEXT DEFAULT '{}',
      correlation_id TEXT,
      tx_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_hotel_reservation_events_org ON hotel_reservation_events(org_id);
    CREATE INDEX IF NOT EXISTS idx_hotel_reservation_events_reservation ON hotel_reservation_events(reservation_id);
    CREATE INDEX IF NOT EXISTS idx_hotel_reservation_events_type ON hotel_reservation_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_hotel_reservation_events_correlation ON hotel_reservation_events(correlation_id);
    CREATE INDEX IF NOT EXISTS idx_hotel_reservation_events_created ON hotel_reservation_events(created_at);

    -- ====================================================================
    -- Car Rentals (vertical)
    -- ====================================================================
    CREATE TABLE IF NOT EXISTS car_rentals (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      token_id TEXT,
      chain_token_id TEXT,
      contract_address TEXT,
      chain_id INTEGER,
      rental_company_code TEXT NOT NULL,
      rental_company_name TEXT NOT NULL,
      driver_name TEXT NOT NULL,
      vehicle_category TEXT DEFAULT 'MIDSIZE',
      vehicle_make TEXT,
      vehicle_model TEXT,
      vehicle_plate TEXT,
      pickup_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      pickup_location TEXT,
      return_location TEXT,
      daily_rate TEXT,
      currency TEXT DEFAULT 'USD',
      deposit_amount TEXT,
      deposit_resolution TEXT,
      charge_amount TEXT,
      insurance_type TEXT,
      insurance_provider TEXT,
      driver_id TEXT,
      driver_wallet TEXT,
      confirmation_number TEXT,
      booking_reference TEXT,
      status TEXT NOT NULL DEFAULT 'CREATED',
      confirmed_at TEXT,
      picked_up_at TEXT,
      returned_at TEXT,
      inspected_at TEXT,
      closed_at TEXT,
      cancelled_at TEXT,
      pickup_mileage INTEGER,
      pickup_fuel_level TEXT,
      return_mileage INTEGER,
      return_fuel_level TEXT,
      damage_report TEXT DEFAULT '{}',
      vehicle_condition TEXT DEFAULT '{}',
      transferable INTEGER DEFAULT 1,
      max_transfers INTEGER DEFAULT 2,
      transfer_count INTEGER DEFAULT 0,
      metadata_version INTEGER DEFAULT 1,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_car_rentals_org ON car_rentals(org_id);
    CREATE INDEX IF NOT EXISTS idx_car_rentals_company_pickup ON car_rentals(rental_company_code, pickup_date);
    CREATE INDEX IF NOT EXISTS idx_car_rentals_status ON car_rentals(status);
    CREATE INDEX IF NOT EXISTS idx_car_rentals_driver ON car_rentals(driver_id);
    CREATE INDEX IF NOT EXISTS idx_car_rentals_wallet ON car_rentals(driver_wallet);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_car_rentals_confirmation ON car_rentals(org_id, confirmation_number);

    CREATE TABLE IF NOT EXISTS car_rental_transfers (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      rental_id TEXT NOT NULL REFERENCES car_rentals(id) ON DELETE CASCADE,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      from_driver_id TEXT,
      to_driver_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      approved_by TEXT,
      approved_at TEXT,
      rejection_reason TEXT,
      kyc_required INTEGER DEFAULT 0,
      kyc_completed INTEGER DEFAULT 0,
      kyc_completed_at TEXT,
      resale_fee TEXT,
      resale_fee_currency TEXT,
      resale_fee_paid INTEGER DEFAULT 0,
      idempotency_key TEXT,
      tx_hash TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_car_rental_transfers_org ON car_rental_transfers(org_id);
    CREATE INDEX IF NOT EXISTS idx_car_rental_transfers_rental ON car_rental_transfers(rental_id);
    CREATE INDEX IF NOT EXISTS idx_car_rental_transfers_status ON car_rental_transfers(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_car_rental_transfers_idempotency ON car_rental_transfers(org_id, idempotency_key);

    CREATE TABLE IF NOT EXISTS car_rental_events (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      rental_id TEXT NOT NULL REFERENCES car_rentals(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT,
      actor_role TEXT,
      previous_state TEXT,
      new_state TEXT,
      details TEXT DEFAULT '{}',
      correlation_id TEXT,
      tx_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_car_rental_events_org ON car_rental_events(org_id);
    CREATE INDEX IF NOT EXISTS idx_car_rental_events_rental ON car_rental_events(rental_id);
    CREATE INDEX IF NOT EXISTS idx_car_rental_events_type ON car_rental_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_car_rental_events_correlation ON car_rental_events(correlation_id);
    CREATE INDEX IF NOT EXISTS idx_car_rental_events_created ON car_rental_events(created_at);

    -- ====================================================================
    -- Concert Tickets (vertical)
    -- ====================================================================
    CREATE TABLE IF NOT EXISTS concert_tickets (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      token_id TEXT,
      chain_token_id TEXT,
      contract_address TEXT,
      chain_id INTEGER,
      venue_code TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      event_name TEXT NOT NULL,
      artist TEXT,
      event_date TEXT NOT NULL,
      doors_open TEXT,
      section TEXT,
      row TEXT,
      seat_number TEXT,
      seating_tier TEXT DEFAULT 'GA',
      face_value TEXT,
      resale_price_cap TEXT,
      currency TEXT DEFAULT 'USD',
      fan_name TEXT,
      fan_id TEXT,
      fan_wallet TEXT,
      age_verified INTEGER DEFAULT 0,
      admitted_at TEXT,
      confirmation_code TEXT,
      booking_reference TEXT,
      status TEXT NOT NULL DEFAULT 'CREATED',
      issued_at TEXT,
      used_at TEXT,
      closed_at TEXT,
      cancelled_at TEXT,
      refunded_at TEXT,
      transferable INTEGER DEFAULT 1,
      max_transfers INTEGER DEFAULT 3,
      transfer_count INTEGER DEFAULT 0,
      metadata_version INTEGER DEFAULT 1,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_concert_tickets_org ON concert_tickets(org_id);
    CREATE INDEX IF NOT EXISTS idx_concert_tickets_venue_date ON concert_tickets(venue_code, event_date);
    CREATE INDEX IF NOT EXISTS idx_concert_tickets_status ON concert_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_concert_tickets_fan ON concert_tickets(fan_id);
    CREATE INDEX IF NOT EXISTS idx_concert_tickets_wallet ON concert_tickets(fan_wallet);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_concert_tickets_confirmation ON concert_tickets(org_id, confirmation_code);

    CREATE TABLE IF NOT EXISTS concert_ticket_transfers (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      concert_ticket_id TEXT NOT NULL REFERENCES concert_tickets(id) ON DELETE CASCADE,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      from_fan_id TEXT,
      to_fan_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      approved_by TEXT,
      approved_at TEXT,
      rejection_reason TEXT,
      kyc_required INTEGER DEFAULT 0,
      kyc_completed INTEGER DEFAULT 0,
      kyc_completed_at TEXT,
      resale_price TEXT,
      resale_fee TEXT,
      resale_fee_currency TEXT,
      resale_fee_paid INTEGER DEFAULT 0,
      idempotency_key TEXT,
      tx_hash TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_concert_ticket_transfers_org ON concert_ticket_transfers(org_id);
    CREATE INDEX IF NOT EXISTS idx_concert_ticket_transfers_ticket ON concert_ticket_transfers(concert_ticket_id);
    CREATE INDEX IF NOT EXISTS idx_concert_ticket_transfers_status ON concert_ticket_transfers(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_concert_ticket_transfers_idempotency ON concert_ticket_transfers(org_id, idempotency_key);

    CREATE TABLE IF NOT EXISTS concert_ticket_events (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      concert_ticket_id TEXT NOT NULL REFERENCES concert_tickets(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT,
      actor_role TEXT,
      previous_state TEXT,
      new_state TEXT,
      details TEXT DEFAULT '{}',
      correlation_id TEXT,
      tx_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_concert_ticket_events_org ON concert_ticket_events(org_id);
    CREATE INDEX IF NOT EXISTS idx_concert_ticket_events_ticket ON concert_ticket_events(concert_ticket_id);
    CREATE INDEX IF NOT EXISTS idx_concert_ticket_events_type ON concert_ticket_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_concert_ticket_events_correlation ON concert_ticket_events(correlation_id);
    CREATE INDEX IF NOT EXISTS idx_concert_ticket_events_created ON concert_ticket_events(created_at);

    -- ====================================================================
    -- Dashboard Metrics
    -- ====================================================================
    CREATE TABLE IF NOT EXISTS dashboard_metrics (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      metric_value TEXT NOT NULL,
      metric_date TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_metrics_unique ON dashboard_metrics(org_id, metric_name, metric_date);
  `);

  // ========================================================================
  // SECTION 23: GPU Compute Tokenization
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS gpu_nodes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      gpu_model TEXT NOT NULL,
      gpu_count INTEGER NOT NULL,
      vram_per_gpu_gb INTEGER NOT NULL,
      total_vram_gb INTEGER NOT NULL,
      interconnect TEXT NOT NULL,
      cpu_model TEXT,
      ram_gb INTEGER,
      storage_tb INTEGER,
      network_bandwidth_gbps INTEGER,
      datacenter_name TEXT NOT NULL,
      datacenter_tier INTEGER NOT NULL,
      datacenter_location TEXT NOT NULL,
      datacenter_certifications TEXT,
      power_cost_per_kwh TEXT,
      tdp_watts INTEGER,
      benchmark_score INTEGER,
      acquisition_cost_usd TEXT NOT NULL,
      acquisition_date TEXT NOT NULL,
      estimated_useful_life_months INTEGER NOT NULL,
      depreciated_value_usd TEXT,
      status TEXT NOT NULL DEFAULT 'registered',
      verified INTEGER DEFAULT 0,
      verified_at TEXT,
      last_verification_check TEXT,
      vast_machine_id TEXT,
      token_id TEXT,
      on_chain_token_id TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gpu_nodes_org ON gpu_nodes(org_id);
    CREATE INDEX IF NOT EXISTS idx_gpu_nodes_status ON gpu_nodes(status);
    CREATE INDEX IF NOT EXISTS idx_gpu_nodes_gpu_model ON gpu_nodes(gpu_model);
    CREATE INDEX IF NOT EXISTS idx_gpu_nodes_dc_tier ON gpu_nodes(datacenter_tier);

    CREATE TABLE IF NOT EXISTS gpu_node_metrics (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      node_id TEXT NOT NULL,
      utilization_percent TEXT,
      gpu_temp_celsius INTEGER,
      mem_used_gb TEXT,
      mem_total_gb TEXT,
      is_online INTEGER DEFAULT 1,
      spot_price_per_hour TEXT,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gpu_node_metrics_node ON gpu_node_metrics(node_id);

    CREATE TABLE IF NOT EXISTS gpu_revenue_periods (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      gross_revenue_usd TEXT NOT NULL,
      electricity_cost_usd TEXT NOT NULL,
      platform_fee_usd TEXT,
      maintenance_reserve_usd TEXT,
      insurance_cost_usd TEXT,
      net_revenue_usd TEXT,
      hours_rented TEXT,
      avg_utilization_percent TEXT,
      distributed INTEGER DEFAULT 0,
      distributed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gpu_revenue_org ON gpu_revenue_periods(org_id);
    CREATE INDEX IF NOT EXISTS idx_gpu_revenue_node ON gpu_revenue_periods(node_id);

    CREATE TABLE IF NOT EXISTS gpu_distributions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      revenue_period_id TEXT NOT NULL,
      total_distributed TEXT NOT NULL,
      token_holder_count INTEGER,
      distribution_method TEXT NOT NULL DEFAULT 'pro_rata',
      tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_gpu_dist_org ON gpu_distributions(org_id);
    CREATE INDEX IF NOT EXISTS idx_gpu_dist_node ON gpu_distributions(node_id);

    CREATE TABLE IF NOT EXISTS compute_listings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
      org_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      token_symbol TEXT NOT NULL,
      token_name TEXT NOT NULL,
      total_supply TEXT NOT NULL,
      price_per_token TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      annualized_yield_percent TEXT,
      total_raised_usd TEXT DEFAULT '0',
      investor_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      listed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_compute_listings_org ON compute_listings(org_id);
    CREATE INDEX IF NOT EXISTS idx_compute_listings_active ON compute_listings(is_active);
  `);

  // ========================================================================
  // Seed data: dev org + test API key
  // ========================================================================
  sqliteDb.exec(`
    INSERT OR IGNORE INTO orgs (id, name, slug, status) VALUES ('dev-org', 'Development Organization', 'dev-org', 'active');
  `);

  // ========================================================================
  // SECTION 24: Real Estate — Investor Tiers, Exit Windows, Secondary Market
  // ========================================================================
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS investor_plans (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      name TEXT NOT NULL,
      min_investment TEXT NOT NULL,
      max_investment TEXT NOT NULL,
      max_holding_percent TEXT NOT NULL,
      management_fee_percent TEXT NOT NULL,
      performance_fee_percent TEXT NOT NULL,
      lockup_days INTEGER NOT NULL,
      accreditation_required INTEGER NOT NULL DEFAULT 0,
      accreditation_types TEXT DEFAULT '[]',
      currency TEXT NOT NULL DEFAULT 'AED',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_investor_plans_asset ON investor_plans(asset_id);
    CREATE INDEX IF NOT EXISTS idx_investor_plans_tier ON investor_plans(tier);

    CREATE TABLE IF NOT EXISTS investor_tier_assignments (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      accreditation_status TEXT NOT NULL DEFAULT 'none',
      total_invested TEXT NOT NULL DEFAULT '0',
      verified_at TEXT,
      accreditation_docs TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_investor_tier_investor ON investor_tier_assignments(investor_id);

    CREATE TABLE IF NOT EXISTS exit_window_schedules (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      frequency TEXT NOT NULL,
      window_duration_days INTEGER NOT NULL,
      max_redemption_percent TEXT NOT NULL,
      notice_period_days INTEGER NOT NULL,
      next_window_opens TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_exit_schedules_asset ON exit_window_schedules(asset_id);

    CREATE TABLE IF NOT EXISTS exit_windows (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      opens_at TEXT NOT NULL,
      closes_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      max_redemption_percent TEXT NOT NULL,
      total_redeemed TEXT NOT NULL DEFAULT '0',
      total_requested TEXT NOT NULL DEFAULT '0',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_exit_windows_asset ON exit_windows(asset_id);
    CREATE INDEX IF NOT EXISTS idx_exit_windows_schedule ON exit_windows(schedule_id);
    CREATE INDEX IF NOT EXISTS idx_exit_windows_status ON exit_windows(status);

    CREATE TABLE IF NOT EXISTS exit_redemptions (
      id TEXT PRIMARY KEY,
      window_id TEXT NOT NULL,
      investor_id TEXT NOT NULL,
      amount TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_exit_redemptions_window ON exit_redemptions(window_id);
    CREATE INDEX IF NOT EXISTS idx_exit_redemptions_investor ON exit_redemptions(investor_id);

    CREATE TABLE IF NOT EXISTS secondary_listings (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      seller_wallet TEXT NOT NULL,
      token_amount TEXT NOT NULL,
      price_per_token TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'AED',
      status TEXT NOT NULL DEFAULT 'active',
      buyer_id TEXT,
      listed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      sold_at TEXT,
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_secondary_listings_asset ON secondary_listings(asset_id);
    CREATE INDEX IF NOT EXISTS idx_secondary_listings_seller ON secondary_listings(seller_id);
    CREATE INDEX IF NOT EXISTS idx_secondary_listings_status ON secondary_listings(status);
  `);

  logger.info('SQLite schema initialized (all tables created)');
}

// Auto-initialize SQLite schema on load
if (DB_MODE === 'sqlite') {
  initializeSqliteSchema();
}
