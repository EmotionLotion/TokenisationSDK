/**
 * Database Type Definitions
 *
 * Types for database operations, schema definitions, and query building.
 */

// ============================================================================
// SCHEMA TYPES
// ============================================================================

/**
 * Column data types
 */
export type ColumnType =
  | 'text'
  | 'integer'
  | 'bigint'
  | 'boolean'
  | 'timestamp'
  | 'json'
  | 'jsonb'
  | 'uuid'
  | 'varchar'
  | 'decimal'
  | 'bytea';

/**
 * Column definition
 */
export interface ColumnDefinition {
  type: ColumnType;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: unknown;
  references?: {
    table: string;
    column: string;
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  };
}

/**
 * Table schema definition
 */
export interface TableSchema {
  name: string;
  columns: Record<string, ColumnDefinition>;
  indexes?: IndexDefinition[];
  constraints?: ConstraintDefinition[];
}

/**
 * Index definition
 */
export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
  method?: 'btree' | 'hash' | 'gin' | 'gist';
  where?: string;
}

/**
 * Constraint definition
 */
export interface ConstraintDefinition {
  name: string;
  type: 'PRIMARY KEY' | 'UNIQUE' | 'FOREIGN KEY' | 'CHECK';
  columns: string[];
  expression?: string;
  references?: {
    table: string;
    columns: string[];
  };
}

// ============================================================================
// RECORD TYPES
// ============================================================================

/**
 * Base database record with common fields
 */
export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Raw database record from query results
 */
export interface RawDatabaseRecord {
  [column: string]: string | number | boolean | null | Date | Buffer | Record<string, unknown>;
}

/**
 * Typed database record
 */
export type TypedRecord<T extends Record<string, unknown>> = BaseRecord & T;

/**
 * Record without auto-generated fields (for inserts)
 */
export type InsertRecord<T extends BaseRecord> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Record for updates (partial, without protected fields)
 */
export type UpdateRecord<T extends BaseRecord> = Partial<Omit<T, 'id' | 'createdAt'>>;

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * Comparison operators for where clauses
 */
export interface ComparisonOperators<T = unknown> {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
  $like?: string;
  $ilike?: string;
  $contains?: T;
  $containedBy?: T[];
  $isNull?: boolean;
}

/**
 * Where clause for a single field
 */
export type WhereFieldClause<T = unknown> = T | ComparisonOperators<T>;

/**
 * Complete where clause
 */
export type WhereClause<T extends Record<string, unknown> = Record<string, unknown>> = {
  [K in keyof T]?: WhereFieldClause<T[K]>;
};

/**
 * Order by direction
 */
export type OrderDirection = 'asc' | 'desc';

/**
 * Order by clause
 */
export interface OrderByClause<T extends Record<string, unknown> = Record<string, unknown>> {
  field: keyof T;
  direction: OrderDirection;
}

/**
 * Query pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Full query options
 */
export interface QueryOptions<T extends Record<string, unknown> = Record<string, unknown>>
  extends PaginationOptions {
  where?: WhereClause<T>;
  orderBy?: OrderByClause<T>[];
  select?: (keyof T)[];
  include?: string[];
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/**
 * Transaction isolation level
 */
export type IsolationLevel =
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

/**
 * Transaction options
 */
export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  readOnly?: boolean;
  timeout?: number;
}

/**
 * Transaction state
 */
export type TransactionState = 'pending' | 'committed' | 'rolled_back';

// ============================================================================
// SCHEMA TABLE TYPES
// ============================================================================

/**
 * Known table names in the SDK schema
 */
export type SchemaTable =
  | 'assets'
  | 'parties'
  | 'tokens'
  | 'transfers'
  | 'compliance_rules'
  | 'audit_log'
  | 'events'
  | 'idempotency_keys'
  | 'saga_state'
  | 'webhooks'
  | 'api_keys'
  | 'sessions';

/**
 * Table name to record type mapping
 */
export interface TableMap {
  assets: AssetRecord;
  parties: PartyRecord;
  tokens: TokenRecord;
  transfers: TransferRecord;
  compliance_rules: ComplianceRuleRecord;
  audit_log: AuditLogRecord;
  events: EventRecord;
  idempotency_keys: IdempotencyRecord;
  saga_state: SagaStateRecord;
  webhooks: WebhookRecord;
  api_keys: ApiKeyRecord;
  sessions: SessionRecord;
}

// ============================================================================
// RECORD TYPE DEFINITIONS
// ============================================================================

/**
 * Asset record
 */
export interface AssetRecord extends BaseRecord {
  name: string;
  rightType: string;
  state: string;
  metadata: Record<string, unknown>;
  jurisdiction: Record<string, unknown>;
  validityPeriod: Record<string, unknown>;
  transferabilityRules: Record<string, unknown>;
  version: number;
}

/**
 * Party record
 */
export interface PartyRecord extends BaseRecord {
  type: 'individual' | 'organization';
  name: string;
  email?: string;
  kycStatus: string;
  kycLevel: string;
  jurisdiction: string;
  wallets: string[];
  metadata: Record<string, unknown>;
}

/**
 * Token record
 */
export interface TokenRecord extends BaseRecord {
  assetId: string;
  chainId: number;
  contractAddress: string;
  tokenId?: string;
  totalSupply: string;
  metadata: Record<string, unknown>;
}

/**
 * Transfer record
 */
export interface TransferRecord extends BaseRecord {
  assetId: string;
  from: string;
  to: string;
  amount: string;
  status: 'pending' | 'confirmed' | 'failed';
  transactionHash?: string;
  metadata: Record<string, unknown>;
}

/**
 * Compliance rule record
 */
export interface ComplianceRuleRecord extends BaseRecord {
  name: string;
  type: string;
  condition: string;
  action: string;
  priority: number;
  enabled: boolean;
  assetId?: string;
  metadata: Record<string, unknown>;
}

/**
 * Audit log record
 */
export interface AuditLogRecord extends BaseRecord {
  action: string;
  actorId: string;
  actorType: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  previousHash?: string;
  hash: string;
  timestamp: string;
}

/**
 * Event record
 */
export interface EventRecord extends BaseRecord {
  type: string;
  assetId: string;
  actorId: string;
  payload: Record<string, unknown>;
  eventVersion: number;
  timestamp: string;
}

/**
 * Idempotency record
 */
export interface IdempotencyRecord extends BaseRecord {
  key: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  result?: unknown;
  error?: string;
  expiresAt: string;
  requestHash?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Saga state record
 */
export interface SagaStateRecord extends BaseRecord {
  sagaId: string;
  sagaType: string;
  status: string;
  currentStep: number;
  steps: Record<string, unknown>[];
  context: Record<string, unknown>;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

/**
 * Webhook record
 */
export interface WebhookRecord extends BaseRecord {
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  lastDeliveredAt?: string;
  failureCount: number;
  metadata: Record<string, unknown>;
}

/**
 * API key record
 */
export interface ApiKeyRecord extends BaseRecord {
  name: string;
  keyHash: string;
  prefix: string;
  scopes: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  metadata: Record<string, unknown>;
}

/**
 * Session record
 */
export interface SessionRecord extends BaseRecord {
  userId: string;
  token: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
}
