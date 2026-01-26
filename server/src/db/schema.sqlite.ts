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
