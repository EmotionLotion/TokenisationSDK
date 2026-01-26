import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../db/schema.js';

const { Pool } = pg;

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://ahoy:ahoy_dev_password@localhost:5432/ahoy_tokenisation',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error on idle client', err);
});

// Initialize Drizzle ORM with PostgreSQL
const db = drizzle(pool, { schema });

// Re-export all schema tables for convenience
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
} = schema;

// Export schema for query builder access
export { schema };

// Export database instance and pool
export { db, pool };

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Get database mode (always postgresql now)
 */
export function getDbMode(): string {
  return 'postgresql';
}

/**
 * Gracefully close the connection pool
 */
export async function closePool(): Promise<void> {
  await pool.end();
}
