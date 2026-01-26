import { pgTable, uuid, varchar, text, boolean, timestamp, integer, jsonb, uniqueIndex, index, numeric, primaryKey } from 'drizzle-orm/pg-core';

// ============================================================================
// SECTION 1: IAM (Identity & Access Management)
// ============================================================================

// Organizations - Multi-tenant root
export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  slug: varchar('slug', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'), // active, suspended, disabled
  settings: jsonb('settings').default({}),
  riskProfile: jsonb('risk_profile').default({}),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  slugUnique: uniqueIndex('idx_orgs_slug').on(table.slug),
  statusIdx: index('idx_orgs_status').on(table.status),
}));

// Users - System users (not investors)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 256 }).notNull(),
  name: varchar('name', { length: 256 }),
  passwordHash: varchar('password_hash', { length: 256 }),
  status: varchar('status', { length: 32 }).notNull().default('active'), // active, disabled, pending
  emailVerified: boolean('email_verified').default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgEmailUnique: uniqueIndex('idx_users_org_email').on(table.orgId, table.email),
  orgIdx: index('idx_users_org').on(table.orgId),
  statusIdx: index('idx_users_status').on(table.status),
}));

// Roles - RBAC roles
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }).notNull(), // admin, compliance_officer, ops, dev, read_only
  description: text('description'),
  permissions: text('permissions').array().notNull().default([]),
  isSystem: boolean('is_system').default(false), // Built-in roles cannot be deleted
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgNameUnique: uniqueIndex('idx_roles_org_name').on(table.orgId, table.name),
  orgIdx: index('idx_roles_org').on(table.orgId),
}));

// User Roles - Many-to-many
export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow(),
  grantedBy: uuid('granted_by'),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.roleId] }),
  userIdx: index('idx_user_roles_user').on(table.userId),
  roleIdx: index('idx_user_roles_role').on(table.roleId),
}));

// API Keys - SDK authentication
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 256 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(), // sk_live_, sk_test_
  keyHash: varchar('key_hash', { length: 256 }).notNull(), // bcrypt/argon2 hash
  scopes: text('scopes').array().notNull().default([]), // read, write, admin
  environment: varchar('environment', { length: 16 }).notNull().default('test'), // test, live
  status: varchar('status', { length: 32 }).notNull().default('active'), // active, revoked
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => ({
  orgIdx: index('idx_api_keys_org').on(table.orgId),
  prefixIdx: index('idx_api_keys_prefix').on(table.keyPrefix),
  statusIdx: index('idx_api_keys_status').on(table.status),
}));

// OAuth Clients - For OAuth2 flows
export const oauthClients = pgTable('oauth_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  clientId: varchar('client_id', { length: 64 }).notNull(),
  clientSecretHash: varchar('client_secret_hash', { length: 256 }).notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  redirectUris: text('redirect_uris').array().notNull().default([]),
  scopes: text('scopes').array().notNull().default([]),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  clientIdUnique: uniqueIndex('idx_oauth_clients_client_id').on(table.clientId),
  orgIdx: index('idx_oauth_clients_org').on(table.orgId),
}));

// ============================================================================
// SECTION 2: Projects & Assets
// ============================================================================

// Projects - Group assets under projects
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  jurisdiction: varchar('jurisdiction', { length: 32 }).notNull().default('DUBAI'),
  assetType: varchar('asset_type', { length: 32 }).notNull().default('REAL_ESTATE'),
  status: varchar('status', { length: 32 }).notNull().default('draft'), // draft, active, frozen, closed
  settings: jsonb('settings').default({}),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_projects_org').on(table.orgId),
  statusIdx: index('idx_projects_status').on(table.status),
  jurisdictionIdx: index('idx_projects_jurisdiction').on(table.jurisdiction),
}));

// Documents - Document metadata (actual storage in S3/IPFS)
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 64 }).notNull(), // title_deed, SPA, valuation, prospectus, kyc_doc
  name: varchar('name', { length: 256 }).notNull(),
  storageProvider: varchar('storage_provider', { length: 32 }).notNull().default('s3'), // s3, ipfs, azure
  uri: text('uri').notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  mimeType: varchar('mime_type', { length: 128 }),
  size: integer('size'),
  signedBy: uuid('signed_by'),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  status: varchar('status', { length: 32 }).notNull().default('uploaded'), // uploaded, verified, expired, rejected
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_documents_org').on(table.orgId),
  projectIdx: index('idx_documents_project').on(table.projectId),
  assetIdx: index('idx_documents_asset').on(table.assetId),
  typeIdx: index('idx_documents_type').on(table.type),
  statusIdx: index('idx_documents_status').on(table.status),
}));

// ============================================================================
// SECTION 3: Parties (existing) - Updated with orgId
// ============================================================================

// Parties table - Identity/KYC records
export const parties = pgTable('parties', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 256 }).notNull(),
  type: varchar('type', { length: 32 }).notNull(), // INDIVIDUAL, ORGANIZATION, DAO, TRUST, FUND
  roles: text('roles').array().notNull().default([]), // ISSUER, VERIFIER, INVESTOR, CUSTODIAN, ORACLE_PROVIDER, REGULATOR
  jurisdiction: varchar('jurisdiction', { length: 2 }).notNull(),
  verificationLevel: varchar('verification_level', { length: 32 }).default('NONE'),
  kycVerified: boolean('kyc_verified').default(false),
  kycExpiryDate: timestamp('kyc_expiry_date', { withTimezone: true }),
  accreditedInvestor: boolean('accredited_investor').default(false),
  isFrozen: boolean('is_frozen').default(false),
  freezeReason: text('freeze_reason'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_parties_org').on(table.orgId),
  jurisdictionIdx: index('idx_parties_jurisdiction').on(table.jurisdiction),
  typeIdx: index('idx_parties_type').on(table.type),
  verificationIdx: index('idx_parties_verification').on(table.verificationLevel),
}));

// Party wallets - Link wallet addresses to parties
export const partyWallets = pgTable('party_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  partyId: uuid('party_id').notNull().references(() => parties.id, { onDelete: 'cascade' }),
  address: varchar('address', { length: 42 }).notNull(),
  chainId: integer('chain_id').notNull(),
  walletType: varchar('wallet_type', { length: 32 }).default('EOA'),
  custodyType: varchar('custody_type', { length: 32 }).default('non_custodial'), // custodial, non_custodial
  isPrimary: boolean('is_primary').default(false),
  verified: boolean('verified').default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  status: varchar('status', { length: 32 }).default('active'), // active, revoked
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  addressChainUnique: uniqueIndex('idx_party_wallets_address_chain').on(table.address, table.chainId),
  orgIdx: index('idx_party_wallets_org').on(table.orgId),
  partyIdx: index('idx_party_wallets_party').on(table.partyId),
}));

// ============================================================================
// SECTION 4: Investors & KYC
// ============================================================================

// Investors - Separate from parties for investor-specific data
export const investors = pgTable('investors', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  partyId: uuid('party_id').references(() => parties.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 32 }).notNull(), // individual, company
  jurisdiction: varchar('jurisdiction', { length: 2 }).notNull(),
  classification: varchar('classification', { length: 32 }).notNull().default('retail'), // retail, professional, institutional
  riskTier: varchar('risk_tier', { length: 16 }).notNull().default('medium'), // low, medium, high
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, active, suspended
  piiRef: varchar('pii_ref', { length: 256 }), // Pointer to encrypted vault or provider reference
  accreditedStatus: varchar('accredited_status', { length: 32 }).default('unknown'), // unknown, pending, verified, expired
  accreditedVerifiedAt: timestamp('accredited_verified_at', { withTimezone: true }),
  accreditedExpiresAt: timestamp('accredited_expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_investors_org').on(table.orgId),
  partyIdx: index('idx_investors_party').on(table.partyId),
  statusIdx: index('idx_investors_status').on(table.status),
  classificationIdx: index('idx_investors_classification').on(table.classification),
}));

// Investor Wallets - Wallet addresses for investors
export const investorWallets = pgTable('investor_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').notNull().references(() => investors.id, { onDelete: 'cascade' }),
  chainId: integer('chain_id').notNull(),
  address: varchar('address', { length: 42 }).notNull(),
  custodyType: varchar('custody_type', { length: 32 }).notNull().default('non_custodial'),
  status: varchar('status', { length: 32 }).notNull().default('active'), // active, revoked
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgInvestorChainAddressUnique: uniqueIndex('idx_investor_wallets_unique').on(table.orgId, table.investorId, table.chainId, table.address),
  orgIdx: index('idx_investor_wallets_org').on(table.orgId),
  investorIdx: index('idx_investor_wallets_investor').on(table.investorId),
}));

// KYC Sessions - KYC verification sessions
export const kycSessions = pgTable('kyc_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').notNull().references(() => investors.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(), // sumsub, onfido, jumio
  providerRef: varchar('provider_ref', { length: 256 }), // External reference ID
  status: varchar('status', { length: 32 }).notNull().default('created'), // created, pending, approved, rejected, expired
  level: varchar('level', { length: 32 }).notNull().default('basic'), // basic, enhanced, institutional
  checks: jsonb('checks').default({}), // Screening results summary
  evidenceHashes: jsonb('evidence_hashes').default([]), // Hash references, not raw docs
  failureReasons: jsonb('failure_reasons').default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_kyc_sessions_org').on(table.orgId),
  investorIdx: index('idx_kyc_sessions_investor').on(table.investorId),
  statusIdx: index('idx_kyc_sessions_status').on(table.status),
  providerIdx: index('idx_kyc_sessions_provider').on(table.provider),
}));

// ============================================================================
// SECTION 5: Assets (updated with orgId and projectId)
// ============================================================================

// Assets table - Tokenized asset definitions
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  titleDeedExternalId: varchar('title_deed_external_id', { length: 128 }), // DLD reference
  rightType: varchar('right_type', { length: 32 }).notNull(), // OWNERSHIP, ACCESS, BEHAVIOR, VERIFICATION
  state: varchar('state', { length: 32 }).notNull().default('DRAFT'), // DRAFT, PENDING_VERIFICATION, VERIFIED, TOKENIZED, FROZEN, CLOSED
  issuerId: uuid('issuer_id').references(() => parties.id),
  jurisdiction: jsonb('jurisdiction').notNull(),
  attributes: jsonb('attributes').default({}), // location, size, developer, etc.
  verificationState: jsonb('verification_state').default({}), // Latest DLD status, timestamps
  validityPeriod: jsonb('validity_period'),
  transferabilityRules: jsonb('transferability_rules'),
  metadata: jsonb('metadata').default({}),
  version: integer('version').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_assets_org').on(table.orgId),
  projectIdx: index('idx_assets_project').on(table.projectId),
  stateIdx: index('idx_assets_state').on(table.state),
  rightTypeIdx: index('idx_assets_right_type').on(table.rightType),
  issuerIdx: index('idx_assets_issuer').on(table.issuerId),
  titleDeedIdx: index('idx_assets_title_deed').on(table.titleDeedExternalId),
}));

// ============================================================================
// SECTION 6: Policies & Compliance Decisions
// ============================================================================

// Policies - Compliance policy definitions
export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 32 }).notNull().default('transfer'), // transfer, issuance, redemption, freeze
  status: varchar('status', { length: 32 }).notNull().default('active'), // active, archived
  currentVersionId: uuid('current_version_id'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_policies_org').on(table.orgId),
  statusIdx: index('idx_policies_status').on(table.status),
  typeIdx: index('idx_policies_type').on(table.type),
}));

// Policy Versions - Versioned rulesets
export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  policyId: uuid('policy_id').notNull().references(() => policies.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  ruleset: jsonb('ruleset').notNull(), // DSL ruleset
  createdBy: uuid('created_by'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  policyVersionUnique: uniqueIndex('idx_policy_versions_unique').on(table.policyId, table.version),
  orgIdx: index('idx_policy_versions_org').on(table.orgId),
  policyIdx: index('idx_policy_versions_policy').on(table.policyId),
}));

// Decisions - Compliance decision audit trail
export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 32 }).notNull(), // transfer, issuance, redemption, freeze, force_transfer
  policyVersionId: uuid('policy_version_id').references(() => policyVersions.id),
  subjectRef: varchar('subject_ref', { length: 256 }).notNull(), // e.g., token_id/transfer_id
  subjectType: varchar('subject_type', { length: 32 }).notNull(), // token, transfer, issuance
  inputsHash: varchar('inputs_hash', { length: 64 }).notNull(), // SHA256 of canonical JSON inputs
  inputs: jsonb('inputs').notNull(), // Snapshot of input data
  result: varchar('result', { length: 32 }).notNull(), // allow, deny, require_action
  reasons: jsonb('reasons').notNull().default([]), // Array of {code, message, fields}
  requiredActions: jsonb('required_actions').default([]),
  signature: text('signature'), // Server signature over decision payload
  signedBy: varchar('signed_by', { length: 256 }),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_decisions_org').on(table.orgId),
  typeIdx: index('idx_decisions_type').on(table.type),
  resultIdx: index('idx_decisions_result').on(table.result),
  subjectIdx: index('idx_decisions_subject').on(table.subjectRef, table.subjectType),
  inputsHashIdx: index('idx_decisions_inputs_hash').on(table.inputsHash),
}));

// ============================================================================
// SECTION 7: Tokens & On-chain Objects
// ============================================================================

// Tokens - Token contract instances
export const tokens = pgTable('tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 256 }).notNull(),
  symbol: varchar('symbol', { length: 32 }).notNull(),
  standard: varchar('standard', { length: 32 }).notNull().default('erc3643'), // erc3643, erc20, erc721, erc1155
  chainId: integer('chain_id').notNull(),
  address: varchar('address', { length: 42 }),
  identityRegistryAddress: varchar('identity_registry_address', { length: 42 }),
  complianceAddress: varchar('compliance_address', { length: 42 }),
  decimals: integer('decimals').notNull().default(18),
  totalSupply: varchar('total_supply', { length: 78 }).default('0'),
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, deploying, active, frozen, deprecated
  policyId: uuid('policy_id').references(() => policies.id),
  deployTxHash: varchar('deploy_tx_hash', { length: 66 }),
  deployedAt: timestamp('deployed_at', { withTimezone: true }),
  deployedBy: varchar('deployed_by', { length: 42 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_tokens_org').on(table.orgId),
  projectIdx: index('idx_tokens_project').on(table.projectId),
  assetIdx: index('idx_tokens_asset').on(table.assetId),
  chainIdx: index('idx_tokens_chain').on(table.chainId),
  statusIdx: index('idx_tokens_status').on(table.status),
  addressChainUnique: uniqueIndex('idx_tokens_address_chain').on(table.address, table.chainId),
}));

// Token Tranches - For future use with different right classes
export const tokenTranches = pgTable('token_tranches', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  rights: jsonb('rights').notNull().default({}),
  restrictions: jsonb('restrictions').default({}),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_token_tranches_org').on(table.orgId),
  tokenIdx: index('idx_token_tranches_token').on(table.tokenId),
}));

// Issuances - Token issuance records
export const issuances = pgTable('issuances', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  toWallet: varchar('to_wallet', { length: 42 }).notNull(),
  toInvestorId: uuid('to_investor_id').references(() => investors.id),
  amount: varchar('amount', { length: 78 }).notNull(), // BigInt as string
  status: varchar('status', { length: 32 }).notNull().default('created'), // created, approved, submitted, confirmed, settled, failed
  decisionId: uuid('decision_id').references(() => decisions.id),
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),
  idempotencyKey: varchar('idempotency_key', { length: 64 }),
  error: text('error'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_issuances_org').on(table.orgId),
  tokenIdx: index('idx_issuances_token').on(table.tokenId),
  statusIdx: index('idx_issuances_status').on(table.status),
  idempotencyUnique: uniqueIndex('idx_issuances_idempotency').on(table.orgId, table.idempotencyKey),
}));

// Redemptions - Token redemption records
export const redemptions = pgTable('redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  fromWallet: varchar('from_wallet', { length: 42 }).notNull(),
  fromInvestorId: uuid('from_investor_id').references(() => investors.id),
  amount: varchar('amount', { length: 78 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('created'),
  decisionId: uuid('decision_id').references(() => decisions.id),
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),
  idempotencyKey: varchar('idempotency_key', { length: 64 }),
  error: text('error'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_redemptions_org').on(table.orgId),
  tokenIdx: index('idx_redemptions_token').on(table.tokenId),
  statusIdx: index('idx_redemptions_status').on(table.status),
  idempotencyUnique: uniqueIndex('idx_redemptions_idempotency').on(table.orgId, table.idempotencyKey),
}));

// Clawbacks - Administrative token recovery
export const clawbacks = pgTable('clawbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  fromWallet: varchar('from_wallet', { length: 42 }).notNull(),
  toWallet: varchar('to_wallet', { length: 42 }).notNull(),
  fromInvestorId: uuid('from_investor_id').references(() => investors.id),
  toInvestorId: uuid('to_investor_id').references(() => investors.id),
  amount: varchar('amount', { length: 78 }).notNull(),
  reason: text('reason').notNull(), // Regulatory requirement - reason must be documented
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  decisionId: uuid('decision_id').references(() => decisions.id), // Compliance approval
  approvedBy: uuid('approved_by'), // User/API key that approved
  executedBy: uuid('executed_by'), // User/API key that executed
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),
  idempotencyKey: varchar('idempotency_key', { length: 64 }),
  error: text('error'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_clawbacks_org').on(table.orgId),
  tokenIdx: index('idx_clawbacks_token').on(table.tokenId),
  statusIdx: index('idx_clawbacks_status').on(table.status),
  fromWalletIdx: index('idx_clawbacks_from_wallet').on(table.fromWallet),
  idempotencyUnique: uniqueIndex('idx_clawbacks_idempotency').on(table.orgId, table.idempotencyKey),
}));

// ============================================================================
// SECTION 8: Transfers & Settlement
// ============================================================================

// Transfers - Transfer saga state machine
export const transfers = pgTable('transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  fromWallet: varchar('from_wallet', { length: 42 }).notNull(),
  toWallet: varchar('to_wallet', { length: 42 }).notNull(),
  fromInvestorId: uuid('from_investor_id').references(() => investors.id),
  toInvestorId: uuid('to_investor_id').references(() => investors.id),
  amount: varchar('amount', { length: 78 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('created'),
  // created, prechecked, approved, rejected, signing, submitted, confirmed, reconciled, settled, failed, expired, cancelled
  decisionId: uuid('decision_id').references(() => decisions.id),
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),
  txPayload: jsonb('tx_payload'), // For non-custodial signing
  signedAt: timestamp('signed_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  idempotencyKey: varchar('idempotency_key', { length: 64 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  error: text('error'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_transfers_org').on(table.orgId),
  tokenIdx: index('idx_transfers_token').on(table.tokenId),
  statusIdx: index('idx_transfers_status').on(table.status),
  fromWalletIdx: index('idx_transfers_from_wallet').on(table.fromWallet),
  toWalletIdx: index('idx_transfers_to_wallet').on(table.toWallet),
  txHashIdx: index('idx_transfers_tx_hash').on(table.txHash),
  idempotencyUnique: uniqueIndex('idx_transfers_idempotency').on(table.orgId, table.idempotencyKey),
}));

// Settlements - Finality tracking
export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  transferId: uuid('transfer_id').references(() => transfers.id, { onDelete: 'cascade' }),
  issuanceId: uuid('issuance_id').references(() => issuances.id, { onDelete: 'cascade' }),
  redemptionId: uuid('redemption_id').references(() => redemptions.id, { onDelete: 'cascade' }),
  txHash: varchar('tx_hash', { length: 66 }).notNull(),
  chainId: integer('chain_id').notNull(),
  finalityStatus: varchar('finality_status', { length: 32 }).notNull().default('pending'), // pending, finalized, reorged
  confirmedBlock: integer('confirmed_block'),
  finalizedBlock: integer('finalized_block'),
  confirmations: integer('confirmations').default(0),
  requiredConfirmations: integer('required_confirmations').notNull().default(12),
  indexedAt: timestamp('indexed_at', { withTimezone: true }),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  reorgedAt: timestamp('reorged_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_settlements_org').on(table.orgId),
  transferIdx: index('idx_settlements_transfer').on(table.transferId),
  txHashIdx: index('idx_settlements_tx_hash').on(table.txHash),
  finalityIdx: index('idx_settlements_finality').on(table.finalityStatus),
}));

// ============================================================================
// SECTION 9: DLD (Dubai Land Department) Integration
// ============================================================================

// DLD Titles - Title deed snapshots
export const dldTitles = pgTable('dld_titles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  externalTitleDeedId: varchar('external_title_deed_id', { length: 128 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('unknown'), // unknown, pending, verified, conflict
  snapshot: jsonb('snapshot').default({}), // Latest normalized data
  flags: text('flags').array().default([]), // dispute, lien, restriction, transfer_locked
  ownerName: varchar('owner_name', { length: 256 }),
  propertyType: varchar('property_type', { length: 64 }),
  location: jsonb('location').default({}),
  area: numeric('area', { precision: 18, scale: 4 }),
  areaUnit: varchar('area_unit', { length: 16 }).default('sqm'),
  valuationAed: numeric('valuation_aed', { precision: 18, scale: 2 }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: uuid('verified_by'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_dld_titles_org').on(table.orgId),
  assetIdx: index('idx_dld_titles_asset').on(table.assetId),
  externalIdUnique: uniqueIndex('idx_dld_titles_external_id').on(table.orgId, table.externalTitleDeedId),
  statusIdx: index('idx_dld_titles_status').on(table.status),
}));

// DLD Events - Incoming events from DLD
export const dldEvents = pgTable('dld_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  externalEventId: varchar('external_event_id', { length: 128 }),
  titleDeedExternalId: varchar('title_deed_external_id', { length: 128 }).notNull(),
  dldTitleId: uuid('dld_title_id').references(() => dldTitles.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 64 }).notNull(), // ownership_change, lien_added, lien_removed, restriction_added, etc.
  payload: jsonb('payload').notNull(),
  processed: boolean('processed').default(false),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_dld_events_org').on(table.orgId),
  titleDeedIdx: index('idx_dld_events_title_deed').on(table.titleDeedExternalId),
  typeIdx: index('idx_dld_events_type').on(table.type),
  processedIdx: index('idx_dld_events_processed').on(table.processed),
  externalEventUnique: uniqueIndex('idx_dld_events_external').on(table.orgId, table.externalEventId),
}));

// DLD Sync Jobs - Sync operation tracking
export const dldSyncJobs = pgTable('dld_sync_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 32 }).notNull(), // poll, reconcile, manual
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  dldTitleId: uuid('dld_title_id').references(() => dldTitles.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, running, succeeded, failed
  result: jsonb('result').default({}),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_dld_sync_jobs_org').on(table.orgId),
  statusIdx: index('idx_dld_sync_jobs_status').on(table.status),
  typeIdx: index('idx_dld_sync_jobs_type').on(table.type),
}));

// ============================================================================
// SECTION 10: Ledger & Reporting
// ============================================================================

// Ledger Positions - Canonical positions (cap table)
export const ledgerPositions = pgTable('ledger_positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').references(() => investors.id, { onDelete: 'set null' }),
  walletAddress: varchar('wallet_address', { length: 42 }).notNull(),
  balance: varchar('balance', { length: 78 }).notNull().default('0'),
  frozenBalance: varchar('frozen_balance', { length: 78 }).notNull().default('0'),
  lastEventRef: varchar('last_event_ref', { length: 256 }), // tx_hash or internal event id
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tokenWalletUnique: uniqueIndex('idx_ledger_positions_token_wallet').on(table.tokenId, table.walletAddress),
  orgIdx: index('idx_ledger_positions_org').on(table.orgId),
  tokenIdx: index('idx_ledger_positions_token').on(table.tokenId),
  investorIdx: index('idx_ledger_positions_investor').on(table.investorId),
  walletIdx: index('idx_ledger_positions_wallet').on(table.walletAddress),
}));

// Ledger Events - Position change history
export const ledgerEvents = pgTable('ledger_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 32 }).notNull(), // issuance, transfer, redemption, force_transfer, freeze, unfreeze
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  fromWallet: varchar('from_wallet', { length: 42 }),
  toWallet: varchar('to_wallet', { length: 42 }),
  amount: varchar('amount', { length: 78 }).notNull(),
  ref: varchar('ref', { length: 256 }).notNull(), // transfer_id, issuance_id, or tx_hash
  refType: varchar('ref_type', { length: 32 }).notNull(), // transfer, issuance, redemption, tx
  balanceBefore: varchar('balance_before', { length: 78 }),
  balanceAfter: varchar('balance_after', { length: 78 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_ledger_events_org').on(table.orgId),
  tokenIdx: index('idx_ledger_events_token').on(table.tokenId),
  typeIdx: index('idx_ledger_events_type').on(table.type),
  refIdx: index('idx_ledger_events_ref').on(table.ref),
  createdAtIdx: index('idx_ledger_events_created').on(table.createdAt),
}));

// Cap Table Snapshots - Point-in-time snapshots
export const capTableSnapshots = pgTable('cap_table_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  asOf: timestamp('as_of', { withTimezone: true }).notNull(),
  snapshot: jsonb('snapshot').notNull(), // Full cap table data
  totalHolders: integer('total_holders').notNull().default(0),
  totalSupply: varchar('total_supply', { length: 78 }).notNull(),
  merkleRoot: varchar('merkle_root', { length: 66 }), // For verification
  generatedBy: varchar('generated_by', { length: 64 }), // system, manual, scheduled
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_cap_table_snapshots_org').on(table.orgId),
  tokenIdx: index('idx_cap_table_snapshots_token').on(table.tokenId),
  asOfIdx: index('idx_cap_table_snapshots_as_of').on(table.asOf),
}));

// ============================================================================
// SECTION 11: Webhooks
// ============================================================================

// Webhook Endpoints - Subscription configuration
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  secret: varchar('secret', { length: 256 }).notNull(), // Encrypted
  description: text('description'),
  events: text('events').array().notNull().default([]), // Event type filters (e.g., 'transfer.*', 'token.*')
  status: varchar('status', { length: 32 }).notNull().default('active'), // active, disabled
  version: varchar('version', { length: 16 }).notNull().default('v1'),
  lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
  lastDeliveryStatus: varchar('last_delivery_status', { length: 32 }),
  failureCount: integer('failure_count').notNull().default(0),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_webhook_endpoints_org').on(table.orgId),
  statusIdx: index('idx_webhook_endpoints_status').on(table.status),
}));

// Webhook Deliveries - Delivery attempts
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  endpointId: uuid('endpoint_id').notNull().references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
  eventId: varchar('event_id', { length: 64 }).notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, sent, failed, dlq
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  lastError: text('last_error'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_webhook_deliveries_org').on(table.orgId),
  endpointIdx: index('idx_webhook_deliveries_endpoint').on(table.endpointId),
  statusIdx: index('idx_webhook_deliveries_status').on(table.status),
  nextAttemptIdx: index('idx_webhook_deliveries_next_attempt').on(table.nextAttemptAt),
  eventIdx: index('idx_webhook_deliveries_event').on(table.eventId),
}));

// ============================================================================
// SECTION 12: Audit Log (Enhanced)
// ============================================================================

// Audit Log - Tamper-evident audit trail
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'set null' }),
  actorType: varchar('actor_type', { length: 32 }).notNull(), // api_key, user, system, webhook
  actorId: varchar('actor_id', { length: 256 }).notNull(),
  action: varchar('action', { length: 128 }).notNull(),
  entityType: varchar('entity_type', { length: 64 }).notNull(),
  entityId: varchar('entity_id', { length: 256 }).notNull(),
  diff: jsonb('diff'), // Before/after changes
  context: jsonb('context').default({}), // Request context (IP, user agent, etc.)
  requestId: varchar('request_id', { length: 64 }),
  hash: varchar('hash', { length: 64 }).notNull(), // SHA256 hash of entry
  prevHash: varchar('prev_hash', { length: 64 }), // Previous entry hash (chain)
  signature: text('signature'), // Optional cryptographic signature
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_audit_log_org').on(table.orgId),
  actorIdx: index('idx_audit_log_actor').on(table.actorType, table.actorId),
  entityIdx: index('idx_audit_log_entity').on(table.entityType, table.entityId),
  actionIdx: index('idx_audit_log_action').on(table.action),
  createdAtIdx: index('idx_audit_log_created').on(table.createdAt),
  hashIdx: index('idx_audit_log_hash').on(table.hash),
}));

// ============================================================================
// SECTION 13: Events (Legacy - Updated)
// ============================================================================

// Events table - Audit trail (event sourcing)
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 64 }).notNull(),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'cascade' }),
  actorId: varchar('actor_id', { length: 256 }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  eventVersion: integer('event_version').default(1),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_events_org').on(table.orgId),
  assetIdx: index('idx_events_asset').on(table.assetId),
  typeIdx: index('idx_events_type').on(table.type),
  timestampIdx: index('idx_events_timestamp').on(table.timestamp),
  assetTypeIdx: index('idx_events_asset_type').on(table.assetId, table.type),
}));

// ============================================================================
// SECTION 14: Sessions (Updated)
// ============================================================================

// Sessions table - SIWE auth sessions
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  partyId: uuid('party_id').references(() => parties.id, { onDelete: 'cascade' }),
  walletAddress: varchar('wallet_address', { length: 42 }).notNull(),
  siweNonce: varchar('siwe_nonce', { length: 64 }).notNull(),
  siweIssuedAt: timestamp('siwe_issued_at', { withTimezone: true }),
  siweExpiryAt: timestamp('siwe_expiry_at', { withTimezone: true }),
  jwtIssuedAt: timestamp('jwt_issued_at', { withTimezone: true }),
  jwtExpiresAt: timestamp('jwt_expires_at', { withTimezone: true }),
  refreshTokenHash: varchar('refresh_token_hash', { length: 256 }),
  refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, (table) => ({
  orgIdx: index('idx_sessions_org').on(table.orgId),
  userIdx: index('idx_sessions_user').on(table.userId),
  partyIdx: index('idx_sessions_party').on(table.partyId),
  walletIdx: index('idx_sessions_wallet').on(table.walletAddress),
  activeIdx: index('idx_sessions_active').on(table.isActive),
}));

// ============================================================================
// SECTION 15: Chain Deployments (Updated)
// ============================================================================

// Chain deployments - Contract addresses per chain
export const chainDeployments = pgTable('chain_deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').references(() => tokens.id, { onDelete: 'cascade' }),
  chainId: integer('chain_id').notNull(),
  chainName: varchar('chain_name', { length: 64 }).notNull(),
  contractType: varchar('contract_type', { length: 32 }).notNull(), // ERC20, ERC721, ERC1155, SBT, ERC3643
  contractAddress: varchar('contract_address', { length: 42 }).notNull(),
  deployTxHash: varchar('deploy_tx_hash', { length: 66 }),
  deployerAddress: varchar('deployer_address', { length: 42 }),
  verified: boolean('verified').default(false),
  abi: jsonb('abi'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_deployments_org').on(table.orgId),
  assetChainTypeUnique: uniqueIndex('idx_deployments_asset_chain_type').on(table.assetId, table.chainId, table.contractType),
  chainIdx: index('idx_deployments_chain').on(table.chainId),
  assetIdx: index('idx_deployments_asset').on(table.assetId),
  tokenIdx: index('idx_deployments_token').on(table.tokenId),
}));

// Token balances - Cached token balances per holder
export const tokenBalances = pgTable('token_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  holderId: uuid('holder_id').notNull().references(() => parties.id, { onDelete: 'cascade' }),
  balance: varchar('balance', { length: 78 }).notNull().default('0'), // BigInt as string
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_balances_org').on(table.orgId),
  assetHolderUnique: uniqueIndex('idx_balances_asset_holder').on(table.assetId, table.holderId),
  assetIdx: index('idx_balances_asset').on(table.assetId),
  holderIdx: index('idx_balances_holder').on(table.holderId),
}));

// ============================================================================
// SECTION 16: Idempotency
// ============================================================================

// Idempotency Keys - For safe retries
export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 64 }).notNull(),
  requestHash: varchar('request_hash', { length: 64 }).notNull(), // SHA256 of request body
  responseBody: jsonb('response_body'),
  statusCode: integer('status_code'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgKeyUnique: uniqueIndex('idx_idempotency_keys_org_key').on(table.orgId, table.key),
  expiresIdx: index('idx_idempotency_keys_expires').on(table.expiresAt),
}));

// ============================================================================
// SECTION 17: Internal Event Bus Queue
// ============================================================================

// Event Bus Queue - Internal message queue (for systems without Kafka)
export const eventBusQueue = pgTable('event_bus_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  topic: varchar('topic', { length: 128 }).notNull(), // e.g., 'transfer.requested', 'token.deployed'
  eventId: varchar('event_id', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull(),
  trace: jsonb('trace').default({}), // requestId, idempotencyKey, correlationId
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, processing, processed, failed, dlq
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  processedBy: varchar('processed_by', { length: 64 }), // Worker ID
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_event_bus_queue_org').on(table.orgId),
  topicIdx: index('idx_event_bus_queue_topic').on(table.topic),
  statusIdx: index('idx_event_bus_queue_status').on(table.status),
  scheduledIdx: index('idx_event_bus_queue_scheduled').on(table.scheduledFor),
  eventIdUnique: uniqueIndex('idx_event_bus_queue_event_id').on(table.eventId),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// IAM Types
export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type NewOAuthClient = typeof oauthClients.$inferInsert;

// Project & Document Types
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

// Party Types
export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
export type PartyWallet = typeof partyWallets.$inferSelect;
export type NewPartyWallet = typeof partyWallets.$inferInsert;

// Investor Types
export type Investor = typeof investors.$inferSelect;
export type NewInvestor = typeof investors.$inferInsert;
export type InvestorWallet = typeof investorWallets.$inferSelect;
export type NewInvestorWallet = typeof investorWallets.$inferInsert;
export type KycSession = typeof kycSessions.$inferSelect;
export type NewKycSession = typeof kycSessions.$inferInsert;

// Asset Types
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

// Policy Types
export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;
export type PolicyVersion = typeof policyVersions.$inferSelect;
export type NewPolicyVersion = typeof policyVersions.$inferInsert;
export type Decision = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;

// Token Types
export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
export type TokenTranche = typeof tokenTranches.$inferSelect;
export type NewTokenTranche = typeof tokenTranches.$inferInsert;
export type Issuance = typeof issuances.$inferSelect;
export type NewIssuance = typeof issuances.$inferInsert;
export type Redemption = typeof redemptions.$inferSelect;
export type NewRedemption = typeof redemptions.$inferInsert;

// Transfer Types
export type Transfer = typeof transfers.$inferSelect;
export type NewTransfer = typeof transfers.$inferInsert;
export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;

// DLD Types
export type DldTitle = typeof dldTitles.$inferSelect;
export type NewDldTitle = typeof dldTitles.$inferInsert;
export type DldEvent = typeof dldEvents.$inferSelect;
export type NewDldEvent = typeof dldEvents.$inferInsert;
export type DldSyncJob = typeof dldSyncJobs.$inferSelect;
export type NewDldSyncJob = typeof dldSyncJobs.$inferInsert;

// Ledger Types
export type LedgerPosition = typeof ledgerPositions.$inferSelect;
export type NewLedgerPosition = typeof ledgerPositions.$inferInsert;
export type LedgerEvent = typeof ledgerEvents.$inferSelect;
export type NewLedgerEvent = typeof ledgerEvents.$inferInsert;
export type CapTableSnapshot = typeof capTableSnapshots.$inferSelect;
export type NewCapTableSnapshot = typeof capTableSnapshots.$inferInsert;

// Webhook Types
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;

// Audit Types
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

// Event Types
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

// Session Types
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// Chain Types
export type ChainDeployment = typeof chainDeployments.$inferSelect;
export type NewChainDeployment = typeof chainDeployments.$inferInsert;
export type TokenBalance = typeof tokenBalances.$inferSelect;
export type NewTokenBalance = typeof tokenBalances.$inferInsert;

// Idempotency Types
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;

// Event Bus Types
export type EventBusMessage = typeof eventBusQueue.$inferSelect;
export type NewEventBusMessage = typeof eventBusQueue.$inferInsert;
