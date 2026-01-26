/**
 * PostgreSQL Database Adapter
 *
 * Production-ready PostgreSQL adapter using Drizzle ORM.
 * Supports connection pooling, transactions, and migrations.
 */

import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, or, gt, lt, gte, lte, inArray, ne, sql, desc, asc } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { ok, err, type Result } from '../../core/types.js';
import type { IDatabaseAdapter, ITransaction, DatabaseRecord, QueryOptions, WhereClause } from '../DatabaseAdapter.js';
import * as schema from './schema.js';

const { Pool } = pg;

// ============================================================================
// TYPES
// ============================================================================

export interface DrizzlePostgresConfig {
  /** Connection string (preferred) */
  connectionString?: string;

  /** Individual connection params (alternative to connectionString) */
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;

  /** Connection pool settings */
  pool?: {
    min?: number;
    max?: number;
    idleTimeoutMs?: number;
    connectionTimeoutMs?: number;
  };

  /** SSL settings */
  ssl?: boolean | pg.ConnectionConfig['ssl'];

  /** Schema name (default: public) */
  schema?: string;
}

// Table name to schema mapping
type TableName = keyof typeof schema;

const tableMap: Record<string, any> = {
  assets: schema.assets,
  parties: schema.parties,
  wallets: schema.wallets,
  evidence: schema.evidence,
  token_balances: schema.tokenBalances,
  transactions: schema.transactions,
  offerings: schema.offerings,
  subscriptions: schema.subscriptions,
  compliance_decisions: schema.complianceDecisions,
  kyc_records: schema.kycRecords,
  events: schema.events,
  distribution_schedules: schema.distributionSchedules,
  distributions: schema.distributions,
};

// ============================================================================
// POSTGRES ADAPTER
// ============================================================================

export class PostgresAdapter implements IDatabaseAdapter {
  private pool: pg.Pool | null = null;
  private db: NodePgDatabase<typeof schema> | null = null;
  private config: DrizzlePostgresConfig;
  private connected: boolean = false;

  constructor(config: DrizzlePostgresConfig) {
    this.config = config;
  }

  async connect(): Promise<Result<void, string>> {
    try {
      const poolConfig: pg.PoolConfig = this.config.connectionString
        ? { connectionString: this.config.connectionString }
        : {
            host: this.config.host || 'localhost',
            port: this.config.port || 5432,
            database: this.config.database || 'tokenisation',
            user: this.config.user || 'postgres',
            password: this.config.password,
          };

      // Add pool settings
      if (this.config.pool) {
        poolConfig.min = this.config.pool.min ?? 2;
        poolConfig.max = this.config.pool.max ?? 10;
        poolConfig.idleTimeoutMillis = this.config.pool.idleTimeoutMs ?? 30000;
        poolConfig.connectionTimeoutMillis = this.config.pool.connectionTimeoutMs ?? 5000;
      }

      // Add SSL if configured
      if (this.config.ssl) {
        poolConfig.ssl = this.config.ssl === true ? { rejectUnauthorized: false } : this.config.ssl;
      }

      this.pool = new Pool(poolConfig);
      this.db = drizzle(this.pool, { schema });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.connected = true;
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown connection error';
      return err(`Failed to connect to PostgreSQL: ${message}`);
    }
  }

  async disconnect(): Promise<Result<void, string>> {
    try {
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
        this.db = null;
      }
      this.connected = false;
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown disconnect error';
      return err(`Failed to disconnect: ${message}`);
    }
  }

  isConnected(): boolean {
    return this.connected && this.pool !== null;
  }

  async insert<T extends DatabaseRecord>(
    collection: string,
    record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Result<T, string>> {
    if (!this.db) {
      return err('Database not connected');
    }

    try {
      const table = tableMap[collection];
      if (!table) {
        return err(`Unknown collection: ${collection}`);
      }

      const now = new Date();
      const id = uuidv4();

      const insertData = {
        ...record,
        id,
        createdAt: now,
        updatedAt: now,
      };

      const result = await this.db.insert(table).values(insertData as any).returning() as any[];

      if (!result || result.length === 0) {
        return err('Insert failed: no rows returned');
      }

      return ok(this.transformRecord(result[0]) as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown insert error';
      return err(`Insert failed: ${message}`);
    }
  }

  async findById<T extends DatabaseRecord>(
    collection: string,
    id: string
  ): Promise<Result<T | null, string>> {
    if (!this.db) {
      return err('Database not connected');
    }

    try {
      const table = tableMap[collection];
      if (!table) {
        return err(`Unknown collection: ${collection}`);
      }

      const result = await this.db.select().from(table).where(eq(table.id, id)).limit(1);

      if (result.length === 0) {
        return ok(null);
      }

      return ok(this.transformRecord(result[0]) as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown find error';
      return err(`Find failed: ${message}`);
    }
  }

  async find<T extends DatabaseRecord>(
    collection: string,
    where?: WhereClause,
    options?: QueryOptions
  ): Promise<Result<T[], string>> {
    if (!this.db) {
      return err('Database not connected');
    }

    try {
      const table = tableMap[collection];
      if (!table) {
        return err(`Unknown collection: ${collection}`);
      }

      let query = this.db.select().from(table);

      // Apply where clause
      if (where) {
        const conditions = this.buildWhereConditions(table, where);
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }
      }

      // Apply ordering
      if (options?.orderBy) {
        const column = table[options.orderBy as keyof typeof table];
        if (column) {
          query = query.orderBy(
            options.orderDirection === 'desc' ? desc(column) : asc(column)
          ) as any;
        }
      }

      // Apply limit and offset
      if (options?.limit) {
        query = query.limit(options.limit) as any;
      }
      if (options?.offset) {
        query = query.offset(options.offset) as any;
      }

      const result = await query;
      return ok(result.map((r) => this.transformRecord(r)) as T[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown find error';
      return err(`Find failed: ${message}`);
    }
  }

  async findOne<T extends DatabaseRecord>(
    collection: string,
    where: WhereClause
  ): Promise<Result<T | null, string>> {
    const result = await this.find<T>(collection, where, { limit: 1 });
    if (!result.success) {
      return result as Result<T | null, string>;
    }
    return ok(result.data[0] || null);
  }

  async update<T extends DatabaseRecord>(
    collection: string,
    id: string,
    updates: Partial<T>
  ): Promise<Result<T, string>> {
    if (!this.db) {
      return err('Database not connected');
    }

    try {
      const table = tableMap[collection];
      if (!table) {
        return err(`Unknown collection: ${collection}`);
      }

      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      // Remove id and createdAt from updates
      delete (updateData as any).id;
      delete (updateData as any).createdAt;

      const result = await this.db
        .update(table)
        .set(updateData as any)
        .where(eq(table.id, id))
        .returning();

      if (result.length === 0) {
        return err(`Record not found: ${id}`);
      }

      return ok(this.transformRecord(result[0]) as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown update error';
      return err(`Update failed: ${message}`);
    }
  }

  async delete(collection: string, id: string): Promise<Result<boolean, string>> {
    if (!this.db) {
      return err('Database not connected');
    }

    try {
      const table = tableMap[collection];
      if (!table) {
        return err(`Unknown collection: ${collection}`);
      }

      const result = await this.db.delete(table).where(eq(table.id, id)).returning({ id: table.id });

      return ok(result.length > 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delete error';
      return err(`Delete failed: ${message}`);
    }
  }

  async count(collection: string, where?: WhereClause): Promise<Result<number, string>> {
    if (!this.db) {
      return err('Database not connected');
    }

    try {
      const table = tableMap[collection];
      if (!table) {
        return err(`Unknown collection: ${collection}`);
      }

      let query = this.db.select({ count: sql<number>`count(*)` }).from(table);

      if (where) {
        const conditions = this.buildWhereConditions(table, where);
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }
      }

      const result = await query;
      return ok(Number(result[0]?.count || 0));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown count error';
      return err(`Count failed: ${message}`);
    }
  }

  async raw<T>(query: string, params?: unknown[]): Promise<Result<T, string>> {
    if (!this.pool) {
      return err('Database not connected');
    }

    try {
      const result = await this.pool.query(query, params as any[]);
      return ok(result.rows as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown query error';
      return err(`Raw query failed: ${message}`);
    }
  }

  async beginTransaction(): Promise<Result<ITransaction, string>> {
    if (!this.pool || !this.db) {
      return err('Database not connected');
    }

    try {
      const client = await this.pool.connect();
      await client.query('BEGIN');

      return ok(new PostgresTransaction(client, this.db));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transaction error';
      return err(`Begin transaction failed: ${message}`);
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations(migrationsFolder: string): Promise<Result<void, string>> {
    if (!this.db) {
      return err('Database not connected');
    }

    try {
      await migrate(this.db, { migrationsFolder });
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown migration error';
      return err(`Migration failed: ${message}`);
    }
  }

  /**
   * Create tables using schema (for development/testing)
   */
  async createTables(): Promise<Result<void, string>> {
    if (!this.pool) {
      return err('Database not connected');
    }

    try {
      // Create enums
      const enumQueries = [
        `DO $$ BEGIN
          CREATE TYPE lifecycle_state AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'SUSPENDED', 'RETIRED');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE right_type AS ENUM ('OWNERSHIP', 'REVENUE', 'ACCESS', 'VOTING', 'BEHAVIOR', 'VERIFICATION', 'CUSTOM');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE transferability_mode AS ENUM ('FREELY_TRANSFERABLE', 'COMPLIANCE_GATED', 'NON_TRANSFERABLE');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE party_type AS ENUM ('INDIVIDUAL', 'ORGANIZATION', 'TRUST', 'FUND');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE party_role AS ENUM ('ISSUER', 'INVESTOR', 'CUSTODIAN', 'VERIFIER', 'REGULATOR', 'TRANSFER_AGENT');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE evidence_type AS ENUM ('LEGAL_DOCUMENT', 'FINANCIAL_DOCUMENT', 'AUDIT_REPORT', 'CERTIFICATE', 'VALUATION', 'INSURANCE', 'CUSTOM');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE evidence_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE offering_status AS ENUM ('DRAFT', 'OPEN', 'PAUSED', 'CLOSED', 'CANCELLED', 'SETTLED');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE offering_type AS ENUM ('PUBLIC', 'PRIVATE_PLACEMENT', 'REG_D_506B', 'REG_D_506C', 'REG_S', 'REG_A_PLUS', 'REG_CF');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE subscription_status AS ENUM ('PENDING', 'KYC_REQUIRED', 'PAYMENT_PENDING', 'CONFIRMED', 'ALLOCATED', 'REJECTED', 'CANCELLED', 'REFUNDED');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE payment_method AS ENUM ('WIRE', 'ACH', 'CRYPTO', 'STABLECOIN', 'CREDIT_CARD');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE transaction_type AS ENUM ('MINT', 'BURN', 'TRANSFER', 'FREEZE', 'UNFREEZE');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
        `DO $$ BEGIN
          CREATE TYPE transaction_status AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REVERTED');
        EXCEPTION WHEN duplicate_object THEN null; END $$`,
      ];

      for (const q of enumQueries) {
        await this.pool.query(q);
      }

      // Create tables
      const tableQueries = [
        // Parties table
        `CREATE TABLE IF NOT EXISTS parties (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type party_type NOT NULL,
          roles JSONB NOT NULL DEFAULT '[]',
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(50),
          jurisdiction VARCHAR(2),
          kyc_verified BOOLEAN DEFAULT false,
          kyc_verified_at TIMESTAMP,
          kyc_expires_at TIMESTAMP,
          kyc_provider VARCHAR(100),
          kyc_reference VARCHAR(255),
          accredited_investor BOOLEAN DEFAULT false,
          accreditation_verified_at TIMESTAMP,
          accreditation_expires_at TIMESTAMP,
          frozen BOOLEAN DEFAULT false,
          frozen_reason TEXT,
          frozen_at TIMESTAMP,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,

        // Assets table
        `CREATE TABLE IF NOT EXISTS assets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          right_type right_type NOT NULL,
          state lifecycle_state NOT NULL DEFAULT 'DRAFT',
          jurisdiction_country VARCHAR(2) NOT NULL,
          jurisdiction_accredited_only BOOLEAN DEFAULT false,
          blocked_jurisdictions JSONB DEFAULT '[]',
          validity_start_time TIMESTAMP,
          validity_end_time TIMESTAMP,
          validity_is_perpetual BOOLEAN DEFAULT false,
          transferability_mode transferability_mode NOT NULL,
          lockup_period_seconds INTEGER DEFAULT 0,
          transfer_require_kyc BOOLEAN DEFAULT true,
          max_holders INTEGER,
          max_per_holder DECIMAL(78, 0),
          token_standard VARCHAR(50),
          token_decimals INTEGER DEFAULT 18,
          contract_address VARCHAR(42),
          chain_id INTEGER,
          total_supply DECIMAL(78, 0),
          issuer_id UUID NOT NULL REFERENCES parties(id),
          typed_metadata JSONB DEFAULT '{}',
          version INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,

        // Wallets table
        `CREATE TABLE IF NOT EXISTS wallets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
          address VARCHAR(42) NOT NULL,
          chain_id INTEGER NOT NULL,
          label VARCHAR(100),
          is_primary BOOLEAN DEFAULT false,
          verified BOOLEAN DEFAULT false,
          verified_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(address, chain_id)
        )`,

        // Evidence table
        `CREATE TABLE IF NOT EXISTS evidence (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          type evidence_type NOT NULL,
          status evidence_status NOT NULL DEFAULT 'PENDING',
          title VARCHAR(255) NOT NULL,
          description TEXT,
          content_hash VARCHAR(128) NOT NULL,
          storage_url TEXT,
          storage_provider VARCHAR(50),
          source_type VARCHAR(50),
          source_identifier VARCHAR(255),
          source_name VARCHAR(255),
          source_trusted BOOLEAN DEFAULT false,
          source_reputation_score INTEGER,
          verifier_id UUID REFERENCES parties(id),
          verified_at TIMESTAMP,
          verification_method VARCHAR(100),
          verification_notes TEXT,
          expires_at TIMESTAMP,
          metadata JSONB DEFAULT '{}',
          version INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,

        // Token balances table
        `CREATE TABLE IF NOT EXISTS token_balances (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          holder_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
          wallet_address VARCHAR(42) NOT NULL,
          balance DECIMAL(78, 0) NOT NULL DEFAULT 0,
          frozen_balance DECIMAL(78, 0) NOT NULL DEFAULT 0,
          last_transaction_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(asset_id, holder_id)
        )`,

        // Transactions table
        `CREATE TABLE IF NOT EXISTS transactions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          asset_id UUID NOT NULL REFERENCES assets(id),
          type transaction_type NOT NULL,
          status transaction_status NOT NULL DEFAULT 'PENDING',
          from_address VARCHAR(42),
          to_address VARCHAR(42),
          from_party_id UUID REFERENCES parties(id),
          to_party_id UUID REFERENCES parties(id),
          amount DECIMAL(78, 0) NOT NULL,
          tx_hash VARCHAR(66) UNIQUE,
          block_number INTEGER,
          chain_id INTEGER,
          gas_used DECIMAL(78, 0),
          compliance_check_id UUID,
          compliance_approved BOOLEAN,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          confirmed_at TIMESTAMP
        )`,

        // Offerings table
        `CREATE TABLE IF NOT EXISTS offerings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          asset_id UUID NOT NULL REFERENCES assets(id),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          type offering_type NOT NULL DEFAULT 'PRIVATE_PLACEMENT',
          status offering_status NOT NULL DEFAULT 'DRAFT',
          min_investment DECIMAL(78, 0) NOT NULL,
          max_investment DECIMAL(78, 0) NOT NULL,
          target_raise DECIMAL(78, 0) NOT NULL,
          hard_cap DECIMAL(78, 0) NOT NULL,
          token_price DECIMAL(78, 18) NOT NULL,
          subscription_start TIMESTAMP NOT NULL,
          subscription_end TIMESTAMP NOT NULL,
          allowed_tiers JSONB DEFAULT '[]',
          allowed_jurisdictions JSONB DEFAULT '[]',
          blocked_jurisdictions JSONB DEFAULT '[]',
          require_accreditation BOOLEAN DEFAULT true,
          lockup_days INTEGER DEFAULT 0,
          total_subscribed DECIMAL(78, 0) NOT NULL DEFAULT 0,
          total_confirmed DECIMAL(78, 0) NOT NULL DEFAULT 0,
          total_allocated DECIMAL(78, 0) NOT NULL DEFAULT 0,
          subscriber_count INTEGER NOT NULL DEFAULT 0,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          opened_at TIMESTAMP,
          closed_at TIMESTAMP,
          settled_at TIMESTAMP
        )`,

        // Subscriptions table
        `CREATE TABLE IF NOT EXISTS subscriptions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          offering_id UUID NOT NULL REFERENCES offerings(id),
          investor_id UUID NOT NULL REFERENCES parties(id),
          status subscription_status NOT NULL DEFAULT 'PENDING',
          amount DECIMAL(78, 0) NOT NULL,
          token_amount DECIMAL(78, 0) NOT NULL,
          payment_method payment_method NOT NULL,
          payment_reference VARCHAR(255),
          wallet_address VARCHAR(42),
          kyc_verified BOOLEAN DEFAULT false,
          accreditation_verified BOOLEAN DEFAULT false,
          jurisdiction_approved BOOLEAN DEFAULT false,
          allocated_amount DECIMAL(78, 0),
          allocation_reason TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          confirmed_at TIMESTAMP,
          allocated_at TIMESTAMP
        )`,

        // Compliance decisions table
        `CREATE TABLE IF NOT EXISTS compliance_decisions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          asset_id UUID REFERENCES assets(id),
          action VARCHAR(50) NOT NULL,
          decision VARCHAR(20) NOT NULL,
          reasons JSONB DEFAULT '[]',
          conditions JSONB DEFAULT '[]',
          actor_id UUID REFERENCES parties(id),
          target_id UUID REFERENCES parties(id),
          context JSONB DEFAULT '{}',
          previous_decision_id UUID,
          hash VARCHAR(128) NOT NULL UNIQUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP
        )`,

        // KYC records table
        `CREATE TABLE IF NOT EXISTS kyc_records (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
          provider VARCHAR(100) NOT NULL,
          external_id VARCHAR(255),
          status VARCHAR(50) NOT NULL,
          level VARCHAR(50),
          document_verified BOOLEAN,
          address_verified BOOLEAN,
          sanctions_cleared BOOLEAN,
          pep_cleared BOOLEAN,
          risk_score INTEGER,
          risk_level VARCHAR(20),
          verification_data JSONB DEFAULT '{}',
          submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMP,
          expires_at TIMESTAMP,
          UNIQUE(provider, external_id)
        )`,

        // Events table
        `CREATE TABLE IF NOT EXISTS events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          aggregate_id UUID NOT NULL,
          aggregate_type VARCHAR(50) NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          event_version INTEGER NOT NULL DEFAULT 1,
          payload JSONB NOT NULL,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,

        // Distribution schedules table
        `CREATE TABLE IF NOT EXISTS distribution_schedules (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          asset_id UUID NOT NULL REFERENCES assets(id),
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          frequency VARCHAR(50) NOT NULL,
          allocation_strategy VARCHAR(50) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          next_distribution_at TIMESTAMP,
          last_distribution_at TIMESTAMP,
          total_distributed DECIMAL(78, 0) NOT NULL DEFAULT 0,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,

        // Distributions table
        `CREATE TABLE IF NOT EXISTS distributions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          schedule_id UUID NOT NULL REFERENCES distribution_schedules(id),
          asset_id UUID NOT NULL REFERENCES assets(id),
          total_amount DECIMAL(78, 0) NOT NULL,
          currency VARCHAR(10) NOT NULL,
          snapshot_block INTEGER,
          recipient_count INTEGER NOT NULL DEFAULT 0,
          status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          processed_at TIMESTAMP,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
      ];

      for (const q of tableQueries) {
        await this.pool.query(q);
      }

      // Create indexes
      const indexQueries = [
        `CREATE INDEX IF NOT EXISTS assets_state_idx ON assets(state)`,
        `CREATE INDEX IF NOT EXISTS assets_issuer_idx ON assets(issuer_id)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS assets_contract_idx ON assets(contract_address, chain_id) WHERE contract_address IS NOT NULL`,
        `CREATE UNIQUE INDEX IF NOT EXISTS parties_email_idx ON parties(email) WHERE email IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS parties_type_idx ON parties(type)`,
        `CREATE INDEX IF NOT EXISTS parties_kyc_idx ON parties(kyc_verified)`,
        `CREATE INDEX IF NOT EXISTS wallets_party_idx ON wallets(party_id)`,
        `CREATE INDEX IF NOT EXISTS evidence_asset_idx ON evidence(asset_id)`,
        `CREATE INDEX IF NOT EXISTS evidence_status_idx ON evidence(status)`,
        `CREATE INDEX IF NOT EXISTS balances_asset_idx ON token_balances(asset_id)`,
        `CREATE INDEX IF NOT EXISTS balances_holder_idx ON token_balances(holder_id)`,
        `CREATE INDEX IF NOT EXISTS transactions_asset_idx ON transactions(asset_id)`,
        `CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status)`,
        `CREATE INDEX IF NOT EXISTS transactions_created_idx ON transactions(created_at)`,
        `CREATE INDEX IF NOT EXISTS offerings_asset_idx ON offerings(asset_id)`,
        `CREATE INDEX IF NOT EXISTS offerings_status_idx ON offerings(status)`,
        `CREATE INDEX IF NOT EXISTS subscriptions_offering_idx ON subscriptions(offering_id)`,
        `CREATE INDEX IF NOT EXISTS subscriptions_investor_idx ON subscriptions(investor_id)`,
        `CREATE INDEX IF NOT EXISTS events_aggregate_idx ON events(aggregate_id, aggregate_type)`,
        `CREATE INDEX IF NOT EXISTS events_type_idx ON events(event_type)`,
        `CREATE INDEX IF NOT EXISTS events_created_idx ON events(created_at)`,
      ];

      for (const q of indexQueries) {
        await this.pool.query(q);
      }

      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Create tables failed: ${message}`);
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private buildWhereConditions(table: any, where: WhereClause): any[] {
    const conditions: any[] = [];

    for (const [field, value] of Object.entries(where)) {
      const column = table[this.toCamelCase(field)];
      if (!column) continue;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const ops = value as Record<string, unknown>;
        if ('$gt' in ops) conditions.push(gt(column, ops.$gt));
        if ('$lt' in ops) conditions.push(lt(column, ops.$lt));
        if ('$gte' in ops) conditions.push(gte(column, ops.$gte));
        if ('$lte' in ops) conditions.push(lte(column, ops.$lte));
        if ('$in' in ops && Array.isArray(ops.$in)) conditions.push(inArray(column, ops.$in));
        if ('$ne' in ops) conditions.push(ne(column, ops.$ne));
      } else {
        conditions.push(eq(column, value));
      }
    }

    return conditions;
  }

  private transformRecord(record: any): DatabaseRecord {
    const transformed: any = {};

    for (const [key, value] of Object.entries(record)) {
      // Convert snake_case to camelCase
      const camelKey = this.toCamelCase(key);

      // Convert Date objects to ISO strings
      if (value instanceof Date) {
        transformed[camelKey] = value.toISOString();
      } else {
        transformed[camelKey] = value;
      }
    }

    return transformed as DatabaseRecord;
  }

  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}

// ============================================================================
// TRANSACTION IMPLEMENTATION
// ============================================================================

class PostgresTransaction implements ITransaction {
  private client: pg.PoolClient;
  private db: NodePgDatabase<typeof schema>;
  private committed: boolean = false;
  private rolledBack: boolean = false;

  constructor(client: pg.PoolClient, db: NodePgDatabase<typeof schema>) {
    this.client = client;
    this.db = db;
  }

  async commit(): Promise<Result<void, string>> {
    if (this.committed || this.rolledBack) {
      return err('Transaction already finalized');
    }

    try {
      await this.client.query('COMMIT');
      this.committed = true;
      this.client.release();
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown commit error';
      this.client.release();
      return err(`Commit failed: ${message}`);
    }
  }

  async rollback(): Promise<Result<void, string>> {
    if (this.committed || this.rolledBack) {
      return err('Transaction already finalized');
    }

    try {
      await this.client.query('ROLLBACK');
      this.rolledBack = true;
      this.client.release();
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown rollback error';
      this.client.release();
      return err(`Rollback failed: ${message}`);
    }
  }

  async insert<T extends DatabaseRecord>(
    collection: string,
    record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Result<T, string>> {
    try {
      const table = tableMap[collection];
      if (!table) {
        return err(`Unknown collection: ${collection}`);
      }

      const now = new Date();
      const id = uuidv4();

      const insertData = {
        ...record,
        id,
        createdAt: now,
        updatedAt: now,
      };

      const result = await this.db.insert(table).values(insertData as any).returning() as any[];

      if (!result || result.length === 0) {
        return err('Insert failed: no rows returned');
      }

      return ok(this.transformRecord(result[0]) as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown insert error';
      return err(`Insert failed: ${message}`);
    }
  }

  async update<T extends DatabaseRecord>(
    collection: string,
    id: string,
    updates: Partial<T>
  ): Promise<Result<T, string>> {
    try {
      const table = tableMap[collection];
      if (!table) {
        return err(`Unknown collection: ${collection}`);
      }

      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      delete (updateData as any).id;
      delete (updateData as any).createdAt;

      const result = await this.db
        .update(table)
        .set(updateData as any)
        .where(eq(table.id, id))
        .returning();

      if (result.length === 0) {
        return err(`Record not found: ${id}`);
      }

      return ok(this.transformRecord(result[0]) as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown update error';
      return err(`Update failed: ${message}`);
    }
  }

  async delete(collection: string, id: string): Promise<Result<boolean, string>> {
    try {
      const table = tableMap[collection];
      if (!table) {
        return err(`Unknown collection: ${collection}`);
      }

      const result = await this.db.delete(table).where(eq(table.id, id)).returning({ id: table.id });

      return ok(result.length > 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delete error';
      return err(`Delete failed: ${message}`);
    }
  }

  private transformRecord(record: any): DatabaseRecord {
    const transformed: any = {};
    for (const [key, value] of Object.entries(record)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      if (value instanceof Date) {
        transformed[camelKey] = value.toISOString();
      } else {
        transformed[camelKey] = value;
      }
    }
    return transformed as DatabaseRecord;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a PostgreSQL adapter
 */
export function createPostgresAdapter(config: DrizzlePostgresConfig): PostgresAdapter {
  return new PostgresAdapter(config);
}

/**
 * Create adapter from environment variables
 */
export function createPostgresAdapterFromEnv(): PostgresAdapter {
  return new PostgresAdapter({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true',
  });
}
