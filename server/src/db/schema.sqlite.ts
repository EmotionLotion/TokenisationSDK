import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'crypto';

// Parties table - Identity/KYC records
export const parties = sqliteTable('parties', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  type: text('type').notNull(), // INDIVIDUAL, ORGANIZATION, AGENT
  roles: text('roles', { mode: 'json' }).$type<string[]>().notNull().default([]),
  jurisdiction: text('jurisdiction').notNull(),
  verificationLevel: text('verification_level').default('NONE'),
  kycVerified: integer('kyc_verified', { mode: 'boolean' }).default(false),
  kycExpiryDate: text('kyc_expiry_date'),
  accreditedInvestor: integer('accredited_investor', { mode: 'boolean' }).default(false),
  isFrozen: integer('is_frozen', { mode: 'boolean' }).default(false),
  freezeReason: text('freeze_reason'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Party wallets - Link wallet addresses to parties
export const partyWallets = sqliteTable('party_wallets', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  partyId: text('party_id').notNull().references(() => parties.id, { onDelete: 'cascade' }),
  address: text('address').notNull(),
  chainId: integer('chain_id').notNull(),
  walletType: text('wallet_type').default('EOA'),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  verified: integer('verified', { mode: 'boolean' }).default(false),
  verifiedAt: text('verified_at'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Assets table - Tokenized asset definitions
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id'),
  projectId: text('project_id'),
  name: text('name').notNull(),
  description: text('description'),
  titleDeedExternalId: text('title_deed_external_id'),
  rightType: text('right_type').notNull(), // OWNERSHIP, ACCESS, BEHAVIOR, VERIFICATION
  state: text('state').notNull().default('DRAFT'),
  issuerId: text('issuer_id').references(() => parties.id),
  jurisdiction: text('jurisdiction', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  attributes: text('attributes', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  verificationState: text('verification_state', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  validityPeriod: text('validity_period', { mode: 'json' }).$type<Record<string, unknown>>(),
  transferabilityRules: text('transferability_rules', { mode: 'json' }).$type<Record<string, unknown>>(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  version: integer('version').default(1),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Tokens table - Token definitions
export const tokens = sqliteTable('tokens', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id'),
  projectId: text('project_id'),
  assetId: text('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  standard: text('standard').notNull().default('erc3643'),
  chainId: integer('chain_id').notNull(),
  address: text('address'),
  identityRegistryAddress: text('identity_registry_address'),
  complianceAddress: text('compliance_address'),
  decimals: integer('decimals').notNull().default(18),
  totalSupply: text('total_supply').default('0'),
  issuedSupply: text('issued_supply').default('0'),
  maxSupply: text('max_supply'),
  status: text('status').notNull().default('draft'),
  policyId: text('policy_id'),
  complianceModules: text('compliance_modules', { mode: 'json' }).$type<string[]>().default([]),
  deployTxHash: text('deploy_tx_hash'),
  deployedAt: text('deployed_at'),
  deployedBy: text('deployed_by'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Events table - Audit trail (event sourcing)
export const events = sqliteTable('events', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  type: text('type').notNull(),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  eventVersion: integer('event_version').default(1),
  timestamp: text('timestamp').$defaultFn(() => new Date().toISOString()),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Sessions table - SIWE auth sessions
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  partyId: text('party_id').notNull().references(() => parties.id, { onDelete: 'cascade' }),
  walletAddress: text('wallet_address').notNull(),
  siweNonce: text('siwe_nonce').notNull(),
  siweIssuedAt: text('siwe_issued_at'),
  siweExpiryAt: text('siwe_expiry_at'),
  jwtIssuedAt: text('jwt_issued_at'),
  jwtExpiresAt: text('jwt_expires_at'),
  refreshTokenHash: text('refresh_token_hash'),
  refreshExpiresAt: text('refresh_expires_at'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  lastUsedAt: text('last_used_at'),
});

// Chain deployments - Contract addresses per chain
export const chainDeployments = sqliteTable('chain_deployments', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  assetId: text('asset_id').references(() => assets.id, { onDelete: 'cascade' }),
  chainId: integer('chain_id').notNull(),
  chainName: text('chain_name').notNull(),
  contractType: text('contract_type').notNull(), // ERC20, ERC721, ERC1155, SBT
  contractAddress: text('contract_address').notNull(),
  deployTxHash: text('deploy_tx_hash'),
  deployerAddress: text('deployer_address'),
  verified: integer('verified', { mode: 'boolean' }).default(false),
  abi: text('abi', { mode: 'json' }).$type<unknown[]>(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Token balances - Cached token balances per holder
export const tokenBalances = sqliteTable('token_balances', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  holderId: text('holder_id').notNull().references(() => parties.id, { onDelete: 'cascade' }),
  balance: text('balance').notNull().default('0'),
  lastUpdatedAt: text('last_updated_at').$defaultFn(() => new Date().toISOString()),
});

// Organizations table
export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('active'),
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  riskProfile: text('risk_profile', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// API Keys table
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  environment: text('environment').notNull().default('test'),
  scopes: text('scopes', { mode: 'json' }).$type<string[]>().default([]),
  status: text('status').notNull().default('active'),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Projects table
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Documents table
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  url: text('url'),
  hash: text('hash'),
  status: text('status').notNull().default('pending'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Roles table
export const roles = sqliteTable('roles', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  permissions: text('permissions', { mode: 'json' }).$type<string[]>().default([]),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// User Roles table
export const userRoles = sqliteTable('user_roles', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// OAuth Clients table
export const oauthClients = sqliteTable('oauth_clients', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  clientId: text('client_id').notNull().unique(),
  clientSecretHash: text('client_secret_hash').notNull(),
  redirectUris: text('redirect_uris', { mode: 'json' }).$type<string[]>().default([]),
  scopes: text('scopes', { mode: 'json' }).$type<string[]>().default([]),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Investors table
export const investors = sqliteTable('investors', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  externalId: text('external_id'),
  type: text('type').notNull().default('individual'),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  jurisdiction: text('jurisdiction'),
  kycStatus: text('kyc_status').notNull().default('pending'),
  kycVerifiedAt: text('kyc_verified_at'),
  kycExpiresAt: text('kyc_expires_at'),
  accreditationStatus: text('accreditation_status').default('none'),
  accreditationVerifiedAt: text('accreditation_verified_at'),
  riskScore: integer('risk_score'),
  taxId: text('tax_id'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Investor Wallets table
export const investorWallets = sqliteTable('investor_wallets', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  investorId: text('investor_id').notNull().references(() => investors.id, { onDelete: 'cascade' }),
  address: text('address').notNull(),
  chainId: integer('chain_id').notNull(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  verified: integer('verified', { mode: 'boolean' }).default(false),
  verifiedAt: text('verified_at'),
  label: text('label'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// KYC Sessions table
export const kycSessions = sqliteTable('kyc_sessions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  investorId: text('investor_id').notNull().references(() => investors.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalSessionId: text('external_session_id'),
  status: text('status').notNull().default('pending'),
  result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Policies table
export const policies = sqliteTable('policies', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull(),
  status: text('status').notNull().default('draft'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Policy Versions table
export const policyVersions = sqliteTable('policy_versions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  policyId: text('policy_id').notNull().references(() => policies.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  rules: text('rules', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  hash: text('hash'),
  status: text('status').notNull().default('draft'),
  activatedAt: text('activated_at'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Decisions table
export const decisions = sqliteTable('decisions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  policyVersionId: text('policy_version_id').references(() => policyVersions.id),
  type: text('type').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  result: text('result').notNull(),
  reasons: text('reasons', { mode: 'json' }).$type<string[]>().default([]),
  inputsHash: text('inputs_hash'),
  decisionHash: text('decision_hash'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Token Tranches table
export const tokenTranches = sqliteTable('token_tranches', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  supply: text('supply').notNull().default('0'),
  issuedSupply: text('issued_supply').default('0'),
  lockedUntil: text('locked_until'),
  restrictions: text('restrictions', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  vestingSchedule: text('vesting_schedule', { mode: 'json' }).$type<Record<string, unknown>>(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Issuances table
export const issuances = sqliteTable('issuances', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  trancheId: text('tranche_id').references(() => tokenTranches.id),
  investorId: text('investor_id').notNull().references(() => investors.id),
  walletAddress: text('wallet_address').notNull(),
  amount: text('amount').notNull(),
  txHash: text('tx_hash'),
  blockNumber: integer('block_number'),
  status: text('status').notNull().default('pending'),
  reason: text('reason'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  confirmedAt: text('confirmed_at'),
  updatedAt: text('updated_at'),
});

// Redemptions table
export const redemptions = sqliteTable('redemptions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  investorId: text('investor_id').notNull().references(() => investors.id),
  walletAddress: text('wallet_address').notNull(),
  amount: text('amount').notNull(),
  txHash: text('tx_hash'),
  blockNumber: integer('block_number'),
  status: text('status').notNull().default('pending'),
  reason: text('reason'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  confirmedAt: text('confirmed_at'),
  updatedAt: text('updated_at'),
});

// Transfers table
export const transfers = sqliteTable('transfers', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  fromAddress: text('from_address').notNull(),
  toAddress: text('to_address').notNull(),
  amount: text('amount').notNull(),
  txHash: text('tx_hash'),
  status: text('status').notNull().default('pending'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Settlements table
export const settlements = sqliteTable('settlements', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  transferId: text('transfer_id').notNull().references(() => transfers.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  settledAt: text('settled_at'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// DLD Titles table
export const dldTitles = sqliteTable('dld_titles', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  externalId: text('external_id').notNull(),
  assetId: text('asset_id').references(() => assets.id),
  status: text('status').notNull().default('pending'),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// DLD Events table
export const dldEvents = sqliteTable('dld_events', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  titleId: text('title_id').notNull().references(() => dldTitles.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// DLD Sync Jobs table
export const dldSyncJobs = sqliteTable('dld_sync_jobs', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  status: text('status').notNull().default('pending'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  error: text('error'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Ledger Positions table
export const ledgerPositions = sqliteTable('ledger_positions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id'),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  investorId: text('investor_id').notNull().references(() => investors.id),
  walletAddress: text('wallet_address').notNull(),
  balance: text('balance').notNull().default('0'),
  lockedBalance: text('locked_balance').default('0'),
  lastMovementAt: text('last_movement_at'),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Ledger Events table
export const ledgerEvents = sqliteTable('ledger_events', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id'),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  fromAddress: text('from_address'),
  toAddress: text('to_address'),
  walletAddress: text('wallet_address'),
  amount: text('amount').notNull(),
  txHash: text('tx_hash'),
  blockNumber: integer('block_number'),
  logIndex: integer('log_index'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Cap Table Snapshots table
export const capTableSnapshots = sqliteTable('cap_table_snapshots', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  snapshotAt: text('snapshot_at').notNull(),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Webhook Endpoints table
export const webhookEndpoints = sqliteTable('webhook_endpoints', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  events: text('events', { mode: 'json' }).$type<string[]>().default([]),
  secret: text('secret').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Webhook Deliveries table
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  endpointId: text('endpoint_id').notNull().references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').default(0),
  lastAttemptAt: text('last_attempt_at'),
  response: text('response'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Audit Log table
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').references(() => orgs.id, { onDelete: 'set null' }),
  actorId: text('actor_id'),
  actorType: text('actor_type').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  description: text('description'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  prevHash: text('prev_hash'),
  entryHash: text('entry_hash'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Idempotency Keys table
export const idempotencyKeys = sqliteTable('idempotency_keys', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  key: text('key').notNull().unique(),
  orgId: text('org_id').notNull(),
  endpoint: text('endpoint').notNull(),
  response: text('response', { mode: 'json' }).$type<Record<string, unknown>>(),
  statusCode: integer('status_code'),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Event Bus Queue table
export const eventBusQueue = sqliteTable('event_bus_queue', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id'),
  topic: text('topic').notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('pending'),
  retries: integer('retries').default(0),
  maxRetries: integer('max_retries').default(3),
  processAfter: text('process_after'),
  processedAt: text('processed_at'),
  error: text('error'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Clawbacks table
export const clawbacks = sqliteTable('clawbacks', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  investorId: text('investor_id').notNull().references(() => investors.id),
  walletAddress: text('wallet_address').notNull(),
  amount: text('amount').notNull(),
  reason: text('reason').notNull(),
  reasonCategory: text('reason_category').notNull().default('regulatory'),
  legalReference: text('legal_reference'),
  evidenceId: text('evidence_id'),
  txHash: text('tx_hash'),
  status: text('status').notNull().default('pending'),
  initiatedBy: text('initiated_by').notNull(),
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at'),
  executedAt: text('executed_at'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Vesting Schedules table
export const vestingSchedules = sqliteTable('vesting_schedules', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  investorId: text('investor_id').notNull().references(() => investors.id),
  walletAddress: text('wallet_address').notNull(),
  totalAmount: text('total_amount').notNull(),
  vestedAmount: text('vested_amount').default('0'),
  releasedAmount: text('released_amount').default('0'),
  vestingType: text('vesting_type').notNull().default('linear'),
  grantDate: text('grant_date').notNull(),
  startDate: text('start_date').notNull(),
  cliffDate: text('cliff_date'),
  endDate: text('end_date').notNull(),
  cliffMonths: integer('cliff_months').default(0),
  vestingMonths: integer('vesting_months').notNull(),
  cliffAmount: text('cliff_amount'),
  gradedSchedule: text('graded_schedule', { mode: 'json' }).$type<Array<{ monthsFromGrant: number; cumulativePercent: number }>>(),
  status: text('status').notNull().default('active'),
  terminatedAt: text('terminated_at'),
  terminationType: text('termination_type'),
  terminatedBy: text('terminated_by'),
  acceleratedAt: text('accelerated_at'),
  accelerationPercent: integer('acceleration_percent'),
  accelerationReason: text('acceleration_reason'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Vesting Milestones table
export const vestingMilestones = sqliteTable('vesting_milestones', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  scheduleId: text('schedule_id').notNull().references(() => vestingSchedules.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  vestingPercent: integer('vesting_percent').notNull(),
  targetDate: text('target_date'),
  completedAt: text('completed_at'),
  completedBy: text('completed_by'),
  status: text('status').notNull().default('pending'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Vesting Releases table
export const vestingReleases = sqliteTable('vesting_releases', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  scheduleId: text('schedule_id').notNull().references(() => vestingSchedules.id, { onDelete: 'cascade' }),
  amount: text('amount').notNull(),
  releaseDate: text('release_date').notNull(),
  txHash: text('tx_hash'),
  status: text('status').notNull().default('pending'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Distributions table
export const distributions = sqliteTable('distributions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull().default('dividend'),
  totalAmount: text('total_amount').notNull(),
  currency: text('currency').notNull(),
  amountPerToken: text('amount_per_token').default('0'),
  recordDate: text('record_date').notNull(),
  paymentDate: text('payment_date').notNull(),
  exDividendDate: text('ex_dividend_date'),
  allocationStrategy: text('allocation_strategy').notNull().default('pro_rata'),
  paymentMethod: text('payment_method').notNull().default('on_chain'),
  status: text('status').notNull().default('draft'),
  totalRecipients: integer('total_recipients').default(0),
  paidRecipients: integer('paid_recipients').default(0),
  totalPaid: text('total_paid').default('0'),
  snapshotData: text('snapshot_data', { mode: 'json' }).$type<Record<string, unknown>>(),
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Distribution Payments table
export const distributionPayments = sqliteTable('distribution_payments', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  distributionId: text('distribution_id').notNull().references(() => distributions.id, { onDelete: 'cascade' }),
  investorId: text('investor_id').notNull().references(() => investors.id),
  walletAddress: text('wallet_address'),
  tokenBalance: text('token_balance').notNull(),
  paymentAmount: text('payment_amount').notNull(),
  paymentMethod: text('payment_method').notNull(),
  status: text('status').notNull().default('pending'),
  txHash: text('tx_hash'),
  bankReference: text('bank_reference'),
  error: text('error'),
  completedAt: text('completed_at'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Corporate Actions table
export const corporateActions = sqliteTable('corporate_actions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  parameters: text('parameters', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  announcementDate: text('announcement_date').notNull(),
  recordDate: text('record_date').notNull(),
  effectiveDate: text('effective_date').notNull(),
  newTokenId: text('new_token_id'),
  status: text('status').notNull().default('announced'),
  totalEntitlements: integer('total_entitlements').default(0),
  processedEntitlements: integer('processed_entitlements').default(0),
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at'),
  executedBy: text('executed_by'),
  executedAt: text('executed_at'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Corporate Action Entitlements table
export const corporateActionEntitlements = sqliteTable('corporate_action_entitlements', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  corporateActionId: text('corporate_action_id').notNull().references(() => corporateActions.id, { onDelete: 'cascade' }),
  investorId: text('investor_id').notNull().references(() => investors.id),
  walletAddress: text('wallet_address').notNull(),
  originalBalance: text('original_balance').notNull(),
  originalTokenId: text('original_token_id').notNull(),
  newBalance: text('new_balance'),
  newTokenId: text('new_token_id'),
  fractionalAmount: text('fractional_amount'),
  status: text('status').notNull().default('pending'),
  processedAt: text('processed_at'),
  error: text('error'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Type exports
export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
export type PartyWallet = typeof partyWallets.$inferSelect;
export type NewPartyWallet = typeof partyWallets.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type ChainDeployment = typeof chainDeployments.$inferSelect;
export type NewChainDeployment = typeof chainDeployments.$inferInsert;
export type TokenBalance = typeof tokenBalances.$inferSelect;
export type NewTokenBalance = typeof tokenBalances.$inferInsert;
export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

// Phase 1 & 2 Types
export type Clawback = typeof clawbacks.$inferSelect;
export type NewClawback = typeof clawbacks.$inferInsert;
export type VestingSchedule = typeof vestingSchedules.$inferSelect;
export type NewVestingSchedule = typeof vestingSchedules.$inferInsert;
export type VestingMilestone = typeof vestingMilestones.$inferSelect;
export type NewVestingMilestone = typeof vestingMilestones.$inferInsert;
export type VestingRelease = typeof vestingReleases.$inferSelect;
export type NewVestingRelease = typeof vestingReleases.$inferInsert;
export type Distribution = typeof distributions.$inferSelect;
export type NewDistribution = typeof distributions.$inferInsert;
export type DistributionPayment = typeof distributionPayments.$inferSelect;
export type NewDistributionPayment = typeof distributionPayments.$inferInsert;
export type CorporateAction = typeof corporateActions.$inferSelect;
export type NewCorporateAction = typeof corporateActions.$inferInsert;
export type CorporateActionEntitlement = typeof corporateActionEntitlements.$inferSelect;
export type NewCorporateActionEntitlement = typeof corporateActionEntitlements.$inferInsert;
