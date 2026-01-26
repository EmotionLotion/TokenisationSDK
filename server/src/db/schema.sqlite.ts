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
  name: text('name').notNull(),
  description: text('description'),
  rightType: text('right_type').notNull(), // OWNERSHIP, ACCESS, BEHAVIOR, VERIFICATION
  state: text('state').notNull().default('DRAFT'),
  issuerId: text('issuer_id').references(() => parties.id),
  jurisdiction: text('jurisdiction', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  validityPeriod: text('validity_period', { mode: 'json' }).$type<Record<string, unknown>>(),
  transferabilityRules: text('transferability_rules', { mode: 'json' }).$type<Record<string, unknown>>(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  version: integer('version').default(1),
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

// Type exports
export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
export type PartyWallet = typeof partyWallets.$inferSelect;
export type NewPartyWallet = typeof partyWallets.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type ChainDeployment = typeof chainDeployments.$inferSelect;
export type NewChainDeployment = typeof chainDeployments.$inferInsert;
export type TokenBalance = typeof tokenBalances.$inferSelect;
export type NewTokenBalance = typeof tokenBalances.$inferInsert;
