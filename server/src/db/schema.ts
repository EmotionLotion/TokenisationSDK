import { pgTable, uuid, varchar, text, boolean, timestamp, integer, jsonb, uniqueIndex, index, numeric, primaryKey, bigint } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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

// OAuth Tokens - For OAuth2 token storage (refresh tokens)
export const oauthTokens = pgTable('oauth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  tokenType: varchar('token_type', { length: 20 }).notNull(), // 'access' | 'refresh'
  tokenHash: varchar('token_hash', { length: 128 }).notNull(), // SHA-256 of token
  scopes: text('scopes').notNull(), // space-separated
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('idx_oauth_tokens_org').on(table.orgId),
  clientIdx: index('idx_oauth_tokens_client').on(table.clientId),
  tokenHashIdx: index('idx_oauth_tokens_hash').on(table.tokenHash),
  expiresIdx: index('idx_oauth_tokens_expires').on(table.expiresAt),
}));

// OAuth Authorization Codes - For authorization code flow + PKCE
export const oauthAuthorizationCodes = pgTable('oauth_authorization_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  codeHash: varchar('code_hash', { length: 128 }).notNull(),
  redirectUri: varchar('redirect_uri', { length: 512 }).notNull(),
  scopes: text('scopes').notNull(),
  partyId: uuid('party_id').references(() => parties.id),
  userId: uuid('user_id'),
  state: varchar('state', { length: 256 }),
  codeChallenge: varchar('code_challenge', { length: 128 }),
  codeChallengeMethod: varchar('code_challenge_method', { length: 10 }), // 'S256' | 'plain'
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  codeHashIdx: uniqueIndex('idx_oauth_codes_hash').on(table.codeHash),
  clientIdx: index('idx_oauth_codes_client').on(table.clientId),
  expiresIdx: index('idx_oauth_codes_expires').on(table.expiresAt),
}));

// ============================================================================
// SECTION 1b: Billing & Usage Tracking
// ============================================================================

// Billing Plans - Available subscription plans
export const billingPlans = pgTable('billing_plans', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  quotas: jsonb('quotas').notNull(), // { api_calls: 10000, webhooks: 1000, ... }
  features: jsonb('features').notNull(), // { oauth: true, priority_support: false, ... }
  priceMonthly: integer('price_monthly'), // cents, null for custom/enterprise
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Organization Billing - Billing status per organization
export const orgBilling = pgTable('org_billing', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }).unique(),
  planId: varchar('plan_id', { length: 64 }).notNull().references(() => billingPlans.id),
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, suspended, cancelled
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('idx_org_billing_org').on(table.orgId),
  statusIdx: index('idx_org_billing_status').on(table.status),
}));

// Usage Records - Aggregated API usage per day/endpoint
export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  date: varchar('date', { length: 10 }).notNull(), // YYYY-MM-DD
  endpoint: varchar('endpoint', { length: 255 }).notNull(),
  method: varchar('method', { length: 10 }).notNull(),
  callCount: integer('call_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  totalResponseTimeMs: integer('total_response_time_ms').notNull().default(0),
  totalRequestBytes: bigint('total_request_bytes', { mode: 'bigint' }).notNull().default(BigInt(0)),
  totalResponseBytes: bigint('total_response_bytes', { mode: 'bigint' }).notNull().default(BigInt(0)),
}, (table) => ({
  orgDateIdx: index('idx_usage_org_date').on(table.orgId, table.date),
  uniqueRecord: uniqueIndex('idx_usage_unique').on(table.orgId, table.date, table.endpoint, table.method),
}));

// Usage Quotas - Per-resource quota tracking
export const usageQuotas = pgTable('usage_quotas', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  resource: varchar('resource', { length: 50 }).notNull(), // api_calls, webhooks, tokens, etc
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  limitValue: integer('limit_value').notNull(),
  usedValue: integer('used_value').notNull().default(0),
}, (table) => ({
  orgResourceIdx: index('idx_quota_org_resource').on(table.orgId, table.resource),
  uniqueQuota: uniqueIndex('idx_quota_unique').on(table.orgId, table.resource),
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
  externalId: varchar('external_id', { length: 256 }), // External system reference
  type: varchar('type', { length: 32 }).notNull(), // individual, company
  email: varchar('email', { length: 256 }),
  phone: varchar('phone', { length: 32 }),
  jurisdiction: varchar('jurisdiction', { length: 2 }).notNull(),
  countryCode: varchar('country_code', { length: 2 }), // ISO country code
  taxResidency: varchar('tax_residency', { length: 2 }), // Tax residency country code
  classification: varchar('classification', { length: 32 }).notNull().default('retail'), // retail, professional, institutional
  riskTier: varchar('risk_tier', { length: 16 }).notNull().default('medium'), // low, medium, high
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, active, suspended
  kycStatus: varchar('kyc_status', { length: 32 }).notNull().default('pending'), // pending, in_progress, passed, failed, expired
  kycLevel: varchar('kyc_level', { length: 32 }).default('basic'), // basic, enhanced, institutional
  kycProvider: varchar('kyc_provider', { length: 32 }), // sumsub, onfido, jumio
  piiRef: varchar('pii_ref', { length: 256 }), // Pointer to encrypted vault or provider reference
  accreditedStatus: varchar('accredited_status', { length: 32 }).default('unknown'), // unknown, pending, verified, expired
  accreditedVerifiedAt: timestamp('accredited_verified_at', { withTimezone: true }),
  accreditedExpiresAt: timestamp('accredited_expires_at', { withTimezone: true }),
  sanctionsStatus: varchar('sanctions_status', { length: 32 }).default('not_screened'), // not_screened, clear, flagged
  sanctionsScreenedAt: timestamp('sanctions_screened_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_investors_org').on(table.orgId),
  partyIdx: index('idx_investors_party').on(table.partyId),
  externalIdIdx: index('idx_investors_external_id').on(table.orgId, table.externalId),
  emailIdx: index('idx_investors_email').on(table.orgId, table.email),
  statusIdx: index('idx_investors_status').on(table.status),
  kycStatusIdx: index('idx_investors_kyc_status').on(table.kycStatus),
  classificationIdx: index('idx_investors_classification').on(table.classification),
  sanctionsStatusIdx: index('idx_investors_sanctions_status').on(table.sanctionsStatus),
}));

// Investor Wallets - Wallet addresses for investors
export const investorWallets = pgTable('investor_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').notNull().references(() => investors.id, { onDelete: 'cascade' }),
  chainId: integer('chain_id').notNull(),
  address: varchar('address', { length: 42 }).notNull(),
  label: varchar('label', { length: 128 }), // User-friendly wallet label
  custodyType: varchar('custody_type', { length: 32 }).notNull().default('non_custodial'),
  status: varchar('status', { length: 32 }).notNull().default('active'), // active, revoked
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
  externalSessionId: varchar('external_session_id', { length: 256 }), // Provider session ID
  status: varchar('status', { length: 32 }).notNull().default('created'), // created, pending, approved, rejected, expired
  level: varchar('level', { length: 32 }).notNull().default('basic'), // basic, enhanced, institutional
  levelRequested: varchar('level_requested', { length: 32 }).notNull().default('basic'), // Requested verification level
  redirectUrl: text('redirect_url'), // URL to redirect user for verification
  checks: jsonb('checks').default({}), // Screening results summary
  providerData: jsonb('provider_data').default({}), // Raw provider response data
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
  externalSessionIdx: index('idx_kyc_sessions_external').on(table.externalSessionId),
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
  standard: varchar('standard', { length: 32 }).notNull().default('ERC3643'), // ERC3643, ERC1400, ERC20
  chainId: integer('chain_id').notNull(),
  address: varchar('address', { length: 42 }),
  identityRegistryAddress: varchar('identity_registry_address', { length: 42 }),
  complianceAddress: varchar('compliance_address', { length: 42 }),
  decimals: integer('decimals').notNull().default(18),
  totalSupply: varchar('total_supply', { length: 78 }).default('0'),
  issuedSupply: varchar('issued_supply', { length: 78 }).default('0'),
  maxSupply: varchar('max_supply', { length: 78 }),
  status: varchar('status', { length: 32 }).notNull().default('draft'), // draft, deploying, deployed, paused, frozen, deprecated
  policyId: uuid('policy_id').references(() => policies.id),
  complianceModules: text('compliance_modules').array().default(['identity', 'country', 'investor_type']),
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

// Token Tranches - For different right classes
export const tokenTranches = pgTable('token_tranches', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  supply: varchar('supply', { length: 78 }).notNull().default('0'),
  issuedSupply: varchar('issued_supply', { length: 78 }).notNull().default('0'),
  vestingSchedule: jsonb('vesting_schedule').default({}),
  rights: jsonb('rights').notNull().default({}),
  restrictions: jsonb('restrictions').default({}),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_token_tranches_org').on(table.orgId),
  tokenIdx: index('idx_token_tranches_token').on(table.tokenId),
}));

// Issuances - Token issuance records
export const issuances = pgTable('issuances', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').references(() => investors.id),
  toWallet: varchar('to_wallet', { length: 42 }).notNull(),
  toInvestorId: uuid('to_investor_id').references(() => investors.id),
  trancheId: uuid('tranche_id').references(() => tokenTranches.id),
  amount: varchar('amount', { length: 78 }).notNull(), // BigInt as string
  reason: text('reason'),
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, approved, submitted, confirmed, failed
  decisionId: uuid('decision_id').references(() => decisions.id),
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
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
  investorId: uuid('investor_id').references(() => investors.id),
  fromWallet: varchar('from_wallet', { length: 42 }).notNull(),
  fromInvestorId: uuid('from_investor_id').references(() => investors.id),
  amount: varchar('amount', { length: 78 }).notNull(),
  reason: text('reason'),
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, approved, submitted, confirmed, failed
  decisionId: uuid('decision_id').references(() => decisions.id),
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
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

// Clawbacks - Administrative token recovery with full state machine
// States: requested → pending_approval → approved → executing → confirmed → failed
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
  reasonCode: varchar('reason_code', { length: 64 }), // COURT_ORDER, REGULATORY, FRAUD, AML, SANCTIONS, OTHER
  legalReference: text('legal_reference'), // Court order number, regulation citation, etc.

  // State machine
  status: varchar('status', { length: 32 }).notNull().default('requested'),
  // States: requested, pending_approval, approved, rejected, executing, confirmed, failed, cancelled

  // Compliance approval
  complianceApprovalId: uuid('compliance_approval_id'),
  decisionId: uuid('decision_id').references(() => decisions.id),

  // Approval chain
  requestedBy: uuid('requested_by'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow(),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectedBy: uuid('rejected_by'),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),

  // Execution
  executedBy: uuid('executed_by'),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),

  // Evidence
  evidencePackId: varchar('evidence_pack_id', { length: 64 }),

  idempotencyKey: varchar('idempotency_key', { length: 64 }),
  error: text('error'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_clawbacks_org').on(table.orgId),
  tokenIdx: index('idx_clawbacks_token').on(table.tokenId),
  statusIdx: index('idx_clawbacks_status').on(table.status),
  fromWalletIdx: index('idx_clawbacks_from_wallet').on(table.fromWallet),
  idempotencyUnique: uniqueIndex('idx_clawbacks_idempotency').on(table.orgId, table.idempotencyKey),
}));

// Compliance Approvals - Workflow for sensitive operations requiring approval
export const complianceApprovals = pgTable('compliance_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),

  // What needs approval
  operationType: varchar('operation_type', { length: 64 }).notNull(), // clawback, force_transfer, freeze, large_transfer, manual_override
  operationRef: varchar('operation_ref', { length: 256 }).notNull(), // Reference to the operation (e.g., clawback ID)
  operationRefType: varchar('operation_ref_type', { length: 32 }).notNull(), // clawback, transfer, etc.

  // Request details
  requestedBy: uuid('requested_by').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow(),
  reason: text('reason').notNull(),
  supportingDocs: jsonb('supporting_docs').default([]), // Array of document references

  // Approval requirements
  requiredApprovers: integer('required_approvers').notNull().default(1),
  requiredRoles: text('required_roles').array().default([]), // compliance_officer, admin, etc.
  expiresAt: timestamp('expires_at', { withTimezone: true }), // Approval request expiration

  // Approval chain
  approvals: jsonb('approvals').default([]), // Array of { userId, role, timestamp, comment }
  rejections: jsonb('rejections').default([]), // Array of { userId, role, timestamp, reason }

  // Status
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  // States: pending, approved, rejected, expired, cancelled

  // Decision reference
  policyVersionId: uuid('policy_version_id').references(() => policyVersions.id),
  decisionId: uuid('decision_id').references(() => decisions.id),

  // Final decision
  finalizedBy: uuid('finalized_by'),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  finalDecision: varchar('final_decision', { length: 32 }), // approved, rejected

  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_compliance_approvals_org').on(table.orgId),
  statusIdx: index('idx_compliance_approvals_status').on(table.status),
  operationIdx: index('idx_compliance_approvals_operation').on(table.operationType, table.operationRef),
  requestedByIdx: index('idx_compliance_approvals_requester').on(table.requestedBy),
}));

// Offerings - Token offering/sale workflow
export const offerings = pgTable('offerings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),

  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  offeringType: varchar('offering_type', { length: 32 }).notNull().default('primary'), // primary, secondary, private_placement

  // Pricing (in smallest units)
  pricePerToken: varchar('price_per_token', { length: 78 }).notNull(),
  currency: varchar('currency', { length: 16 }).notNull().default('USDC'),
  decimals: integer('decimals').notNull().default(6), // Currency decimals

  // Supply and caps (in smallest units)
  hardCap: varchar('hard_cap', { length: 78 }).notNull(),
  softCap: varchar('soft_cap', { length: 78 }),
  minInvestment: varchar('min_investment', { length: 78 }),
  maxInvestment: varchar('max_investment', { length: 78 }),

  // Timeline
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),

  // Allocation tracking
  totalRaised: varchar('total_raised', { length: 78 }).notNull().default('0'),
  totalAllocations: integer('total_allocations').notNull().default(0),
  mintedAmount: varchar('minted_amount', { length: 78 }).notNull().default('0'),

  // Status
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  // States: draft, scheduled, open, paused, closed, settled, cancelled

  // Compliance
  policyId: uuid('policy_id').references(() => policies.id),
  jurisdictionRestrictions: text('jurisdiction_restrictions').array().default([]),
  investorRestrictions: jsonb('investor_restrictions').default({}),

  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_offerings_org').on(table.orgId),
  tokenIdx: index('idx_offerings_token').on(table.tokenId),
  statusIdx: index('idx_offerings_status').on(table.status),
}));

// Allocations - Investment allocations in an offering
export const allocations = pgTable('allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  offeringId: uuid('offering_id').notNull().references(() => offerings.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').notNull().references(() => investors.id),
  walletAddress: varchar('wallet_address', { length: 42 }).notNull(),

  // Allocation details (in smallest units)
  amount: varchar('amount', { length: 78 }).notNull(), // Token amount
  investmentAmount: varchar('investment_amount', { length: 78 }).notNull(), // Payment amount
  currency: varchar('currency', { length: 16 }).notNull(),

  // Status
  status: varchar('status', { length: 32 }).notNull().default('pending_kyc'),
  // States: pending_kyc, kyc_verified, compliance_pending, approved, rejected, mint_queued, minting, confirmed, failed, cancelled
  rejectionReason: varchar('rejection_reason', { length: 1024 }),

  // Payment tracking
  paymentRef: varchar('payment_ref', { length: 256 }),
  paymentMethod: varchar('payment_method', { length: 32 }), // bank_transfer, crypto, card
  paymentReceivedAt: timestamp('payment_received_at', { withTimezone: true }),

  // Chain tracking
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),

  // Minting tracking
  issuanceId: uuid('issuance_id').references(() => issuances.id),

  // Compliance
  decisionId: uuid('decision_id').references(() => decisions.id),

  // Timestamps
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),

  idempotencyKey: varchar('idempotency_key', { length: 64 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_allocations_org').on(table.orgId),
  offeringIdx: index('idx_allocations_offering').on(table.offeringId),
  investorIdx: index('idx_allocations_investor').on(table.investorId),
  statusIdx: index('idx_allocations_status').on(table.status),
  txHashIdx: index('idx_allocations_tx_hash').on(table.txHash),
  idempotencyUnique: uniqueIndex('idx_allocations_idempotency').on(table.orgId, table.idempotencyKey),
}));

// Buyback Requests - Token buyback workflow
export const buybackRequests = pgTable('buyback_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').notNull().references(() => investors.id),
  walletAddress: varchar('wallet_address', { length: 42 }).notNull(),

  // Request details (in smallest units)
  tokenAmount: varchar('token_amount', { length: 78 }).notNull(),
  pricePerToken: varchar('price_per_token', { length: 78 }).notNull(),
  totalPayment: varchar('total_payment', { length: 78 }).notNull(),
  paymentCurrency: varchar('payment_currency', { length: 10 }).notNull(),

  // Status
  status: varchar('status', { length: 32 }).notNull().default('requested'),
  // States: requested, approved, rejected, tokens_locked, payment_pending, payment_sent, completed, failed, cancelled

  // Approval
  complianceApprovalId: uuid('compliance_approval_id'),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),

  // Token handling
  tokensLockedAt: timestamp('tokens_locked_at', { withTimezone: true }),
  burnTxHash: varchar('burn_tx_hash', { length: 66 }),
  burnedAt: timestamp('burned_at', { withTimezone: true }),

  // Payment
  paymentRef: varchar('payment_ref', { length: 256 }),
  paymentMethod: varchar('payment_method', { length: 32 }),
  paymentSentAt: timestamp('payment_sent_at', { withTimezone: true }),
  paymentConfirmedAt: timestamp('payment_confirmed_at', { withTimezone: true }),

  // Settlement proof
  settlementProofUri: text('settlement_proof_uri'),
  settlementProofHash: varchar('settlement_proof_hash', { length: 64 }),

  idempotencyKey: varchar('idempotency_key', { length: 64 }),
  error: text('error'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_buyback_requests_org').on(table.orgId),
  tokenIdx: index('idx_buyback_requests_token').on(table.tokenId),
  investorIdx: index('idx_buyback_requests_investor').on(table.investorId),
  statusIdx: index('idx_buyback_requests_status').on(table.status),
  idempotencyUnique: uniqueIndex('idx_buyback_requests_idempotency').on(table.orgId, table.idempotencyKey),
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
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').references(() => investors.id),
  eventType: varchar('event_type', { length: 32 }).notNull(), // issuance, transfer, redemption, force_transfer, freeze, unfreeze
  fromWallet: varchar('from_wallet', { length: 42 }),
  toWallet: varchar('to_wallet', { length: 42 }),
  delta: varchar('delta', { length: 78 }).notNull(), // Amount change (can be negative for redemptions)
  ref: varchar('ref', { length: 256 }), // transfer_id, issuance_id, or tx_hash
  refType: varchar('ref_type', { length: 32 }), // transfer, issuance, redemption, allocation, tx
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),
  balanceBefore: varchar('balance_before', { length: 78 }),
  balanceAfter: varchar('balance_after', { length: 78 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_ledger_events_org').on(table.orgId),
  tokenIdx: index('idx_ledger_events_token').on(table.tokenId),
  eventTypeIdx: index('idx_ledger_events_type').on(table.eventType),
  refIdx: index('idx_ledger_events_ref').on(table.ref),
  investorIdx: index('idx_ledger_events_investor').on(table.investorId),
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

// Audit Log - Tamper-evident audit trail with hash chain
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  actorId: varchar('actor_id', { length: 256 }),
  actorType: varchar('actor_type', { length: 32 }).notNull(), // api_key, user, system, webhook
  action: varchar('action', { length: 128 }).notNull(),
  resourceType: varchar('resource_type', { length: 64 }).notNull(),
  resourceId: varchar('resource_id', { length: 256 }).notNull(),
  description: text('description'),
  metadata: jsonb('metadata').default({}),
  prevHash: varchar('prev_hash', { length: 64 }).notNull(),
  entryHash: varchar('entry_hash', { length: 64 }).notNull(),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_audit_log_org').on(table.orgId),
  actorIdx: index('idx_audit_log_actor').on(table.actorType, table.actorId),
  resourceIdx: index('idx_audit_log_resource').on(table.resourceType, table.resourceId),
  actionIdx: index('idx_audit_log_action').on(table.action),
  createdAtIdx: index('idx_audit_log_created').on(table.createdAt),
  hashIdx: index('idx_audit_log_hash').on(table.entryHash),
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
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, processing, completed, failed
  responseBody: jsonb('response_body'),
  statusCode: integer('status_code'),
  error: text('error'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgKeyUnique: uniqueIndex('idx_idempotency_keys_org_key').on(table.orgId, table.key),
  statusIdx: index('idx_idempotency_keys_status').on(table.status),
  expiresIdx: index('idx_idempotency_keys_expires').on(table.expiresAt),
}));

// ============================================================================
// SECTION 17: Outbox Pattern (Transactional Events)
// ============================================================================

// Domain Events Outbox - Persist events in same transaction as business data
export const domainEventsOutbox = pgTable('domain_events_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),

  // Event identification
  eventId: varchar('event_id', { length: 64 }).notNull(),
  eventType: varchar('event_type', { length: 128 }).notNull(), // e.g., 'transfer.created', 'token.deployed'
  aggregateType: varchar('aggregate_type', { length: 64 }).notNull(), // e.g., 'transfer', 'token', 'investor'
  aggregateId: varchar('aggregate_id', { length: 256 }).notNull(), // The ID of the entity that generated this event

  // Event data
  payload: jsonb('payload').notNull(),
  metadata: jsonb('metadata').default({}), // requestId, actorId, actorType, idempotencyKey, etc.

  // Ordering
  sequence: integer('sequence').notNull(), // Per-aggregate sequence number
  globalSequence: integer('global_sequence'), // Global ordering (set by worker)

  // Processing state
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, processing, published, failed
  publishedAt: timestamp('published_at', { withTimezone: true }),
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),

  // Tracing
  requestId: varchar('request_id', { length: 64 }),
  actorId: varchar('actor_id', { length: 256 }),
  actorType: varchar('actor_type', { length: 32 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  eventIdUnique: uniqueIndex('idx_outbox_event_id').on(table.eventId),
  orgIdx: index('idx_outbox_org').on(table.orgId),
  statusIdx: index('idx_outbox_status').on(table.status),
  aggregateIdx: index('idx_outbox_aggregate').on(table.aggregateType, table.aggregateId),
  createdAtIdx: index('idx_outbox_created').on(table.createdAt),
  pendingIdx: index('idx_outbox_pending').on(table.status).where(sql`status = 'pending'`),
}));

// ============================================================================
// SECTION 17b: Internal Event Bus Queue
// ============================================================================

// Event Bus Queue - Internal message queue (for systems without Kafka)
export const eventBusQueue = pgTable('event_bus_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  topic: varchar('topic', { length: 128 }).notNull(), // e.g., 'transfer.requested', 'token.deployed'
  eventId: uuid('event_id').defaultRandom(), // Auto-generated if not provided
  deduplicationKey: varchar('deduplication_key', { length: 128 }), // For idempotent event processing
  payload: jsonb('payload').notNull(),
  trace: jsonb('trace').default({}), // requestId, idempotencyKey, correlationId
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, processing, processed, failed, dlq
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  processedBy: varchar('processed_by', { length: 64 }), // Worker ID
  processedAt: timestamp('processed_at', { withTimezone: true }),
  processAfter: timestamp('process_after', { withTimezone: true }).defaultNow(), // Scheduled processing time
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  lastError: text('last_error'),
  error: text('error'), // Final error if moved to DLQ
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).defaultNow(), // Alias for processAfter
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_event_bus_queue_org').on(table.orgId),
  topicIdx: index('idx_event_bus_queue_topic').on(table.topic),
  statusIdx: index('idx_event_bus_queue_status').on(table.status),
  scheduledIdx: index('idx_event_bus_queue_scheduled').on(table.scheduledFor),
  processAfterIdx: index('idx_event_bus_queue_process_after').on(table.processAfter),
  deduplicationIdx: uniqueIndex('idx_event_bus_queue_deduplication').on(table.deduplicationKey),
  eventIdUnique: uniqueIndex('idx_event_bus_queue_event_id').on(table.eventId),
}));

// ============================================================================
// SECTION 18: Vesting Schedules
// ============================================================================

// Vesting Schedules - Employee/investor token vesting
export const vestingSchedules = pgTable('vesting_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').notNull().references(() => investors.id),
  walletAddress: varchar('wallet_address', { length: 42 }).notNull(),

  // Vesting parameters
  totalAmount: varchar('total_amount', { length: 78 }).notNull(),
  vestingType: varchar('vesting_type', { length: 20 }).notNull(), // linear, cliff, cliff_then_linear, milestone, graded
  grantDate: timestamp('grant_date', { withTimezone: true }).notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  cliffDate: timestamp('cliff_date', { withTimezone: true }), // Optional cliff
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  cliffMonths: integer('cliff_months').default(0),
  vestingMonths: integer('vesting_months').notNull(),
  cliffAmount: varchar('cliff_amount', { length: 78 }), // Amount released at cliff

  // Graded schedule (JSON array of { monthsFromGrant, cumulativePercent })
  gradedSchedule: jsonb('graded_schedule'),

  // Current state
  vestedAmount: varchar('vested_amount', { length: 78 }).notNull().default('0'),
  releasedAmount: varchar('released_amount', { length: 78 }).notNull().default('0'),
  claimedAmount: varchar('claimed_amount', { length: 78 }).notNull().default('0'),

  // Status
  status: varchar('status', { length: 20 }).notNull().default('active'), // not_started, active, fully_vested, terminated, accelerated

  // Termination
  terminationDate: timestamp('termination_date', { withTimezone: true }),
  terminationType: varchar('termination_type', { length: 30 }), // voluntary, for_cause, without_cause, death_disability, change_of_control

  // Acceleration triggers (JSON)
  accelerationTriggers: jsonb('acceleration_triggers'),

  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_vesting_schedules_org').on(table.orgId),
  tokenIdx: index('idx_vesting_schedules_token').on(table.tokenId),
  investorIdx: index('idx_vesting_schedules_investor').on(table.investorId),
  statusIdx: index('idx_vesting_schedules_status').on(table.status),
}));

// Vesting Milestones - For milestone-based vesting
export const vestingMilestones = pgTable('vesting_milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  scheduleId: uuid('schedule_id').notNull().references(() => vestingSchedules.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  vestingPercent: numeric('vesting_percent', { precision: 5, scale: 2 }).notNull(), // Percentage that vests
  targetDate: timestamp('target_date', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, completed
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: uuid('completed_by'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  scheduleIdx: index('idx_vesting_milestones_schedule').on(table.scheduleId),
  statusIdx: index('idx_vesting_milestones_status').on(table.status),
}));

// Vesting Releases - Record of token releases
export const vestingReleases = pgTable('vesting_releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  scheduleId: uuid('schedule_id').notNull().references(() => vestingSchedules.id, { onDelete: 'cascade' }),
  amount: varchar('amount', { length: 78 }).notNull(),
  releaseType: varchar('release_type', { length: 20 }).notNull(), // scheduled, cliff, milestone, acceleration, claim
  milestoneId: uuid('milestone_id').references(() => vestingMilestones.id),
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, confirmed, failed
  releasedAt: timestamp('released_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  scheduleIdx: index('idx_vesting_releases_schedule').on(table.scheduleId),
  statusIdx: index('idx_vesting_releases_status').on(table.status),
}));

// ============================================================================
// SECTION 19: Distributions (Dividends, Interest, etc.)
// ============================================================================

// Distributions - Dividend/interest payment events
export const distributions = pgTable('distributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),

  // Distribution details
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 30 }).notNull(), // dividend, interest, royalty, revenue_share, rent, profit_share, yield, custom

  // Amount
  totalAmount: varchar('total_amount', { length: 78 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(), // USD, USDC, ETH, etc.
  amountPerToken: varchar('amount_per_token', { length: 78 }).notNull(), // Amount per whole token (in smallest unit)

  // Allocation
  allocationStrategy: varchar('allocation_strategy', { length: 20 }).notNull().default('pro_rata'), // pro_rata, equal, tiered, time_weighted, custom

  // Timing
  recordDate: timestamp('record_date', { withTimezone: true }).notNull(), // Snapshot date for cap table
  paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
  exDividendDate: timestamp('ex_dividend_date', { withTimezone: true }), // Date after which buyers don't get dividend

  // Payment method
  paymentMethod: varchar('payment_method', { length: 20 }).notNull(), // on_chain, bank_transfer, mixed

  // Status
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft, announced, approved, processing, completed, cancelled

  // Snapshot data (frozen cap table at record date)
  snapshotData: jsonb('snapshot_data'),

  // Statistics
  totalRecipients: integer('total_recipients'),
  paidRecipients: integer('paid_recipients').default(0),
  totalPaid: varchar('total_paid', { length: 78 }).default('0'),

  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_distributions_org').on(table.orgId),
  tokenIdx: index('idx_distributions_token').on(table.tokenId),
  statusIdx: index('idx_distributions_status').on(table.status),
  recordDateIdx: index('idx_distributions_record_date').on(table.recordDate),
}));

// Distribution Payments - Individual payment records
export const distributionPayments = pgTable('distribution_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  distributionId: uuid('distribution_id').notNull().references(() => distributions.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').notNull().references(() => investors.id),
  walletAddress: varchar('wallet_address', { length: 42 }),

  // Amounts
  tokenBalance: varchar('token_balance', { length: 78 }).notNull(), // At record date
  paymentAmount: varchar('payment_amount', { length: 78 }).notNull(),

  // Payment details
  paymentMethod: varchar('payment_method', { length: 20 }).notNull(), // on_chain, bank_transfer
  txHash: varchar('tx_hash', { length: 66 }),
  txBlock: integer('tx_block'),
  bankReference: varchar('bank_reference', { length: 100 }),

  // Status
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, processing, completed, failed
  error: text('error'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  distributionIdx: index('idx_distribution_payments_distribution').on(table.distributionId),
  investorIdx: index('idx_distribution_payments_investor').on(table.investorId),
  statusIdx: index('idx_distribution_payments_status').on(table.status),
}));

// ============================================================================
// SECTION 20: Corporate Actions
// ============================================================================

// Corporate Actions - Splits, mergers, conversions
export const corporateActions = pgTable('corporate_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),

  type: varchar('type', { length: 30 }).notNull(), // split, reverse_split, conversion, merger, spinoff, name_change
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),

  // Parameters (type-specific JSON)
  // split/reverse_split: { ratio: "2:1", multiplier: 2.0 }
  // conversion: { newTokenId: "...", conversionRate: "1.5" }
  // merger: { survivingTokenId: "...", exchangeRatio: "0.8" }
  parameters: jsonb('parameters').notNull(),

  // Timing
  announcementDate: timestamp('announcement_date', { withTimezone: true }).notNull(),
  recordDate: timestamp('record_date', { withTimezone: true }).notNull(),
  effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull(),

  // Status
  status: varchar('status', { length: 20 }).notNull().default('announced'), // announced, approved, processing, completed, cancelled

  // For token conversions/mergers
  newTokenId: uuid('new_token_id').references(() => tokens.id),

  // Statistics
  totalEntitlements: integer('total_entitlements'),
  processedEntitlements: integer('processed_entitlements').default(0),

  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  executedBy: uuid('executed_by'),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_corporate_actions_org').on(table.orgId),
  tokenIdx: index('idx_corporate_actions_token').on(table.tokenId),
  statusIdx: index('idx_corporate_actions_status').on(table.status),
  effectiveDateIdx: index('idx_corporate_actions_effective').on(table.effectiveDate),
}));

// Corporate Action Entitlements - Per-holder records
export const corporateActionEntitlements = pgTable('corporate_action_entitlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  corporateActionId: uuid('corporate_action_id').notNull().references(() => corporateActions.id, { onDelete: 'cascade' }),
  investorId: uuid('investor_id').notNull().references(() => investors.id),
  walletAddress: varchar('wallet_address', { length: 42 }).notNull(),

  // Before
  originalBalance: varchar('original_balance', { length: 78 }).notNull(),
  originalTokenId: uuid('original_token_id').notNull(),

  // After
  newBalance: varchar('new_balance', { length: 78 }),
  newTokenId: uuid('new_token_id'), // For conversions/mergers

  // Fractional handling
  fractionalAmount: varchar('fractional_amount', { length: 78 }), // Cash-in-lieu for fractional shares
  cashInLieu: varchar('cash_in_lieu', { length: 78 }),

  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, processed, failed
  processedAt: timestamp('processed_at', { withTimezone: true }),
  txHash: varchar('tx_hash', { length: 66 }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  actionIdx: index('idx_corporate_action_entitlements_action').on(table.corporateActionId),
  investorIdx: index('idx_corporate_action_entitlements_investor').on(table.investorId),
  statusIdx: index('idx_corporate_action_entitlements_status').on(table.status),
}));

// ============================================================================
// SECTION 21: Declarative Policy Layer (Enterprise)
// ============================================================================

// Policy Rulesets - Full declarative policy storage with versioning
export const policyRulesets = pgTable('policy_rulesets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  policyVersionId: uuid('policy_version_id').notNull().references(() => policyVersions.id, { onDelete: 'cascade' }),

  // Policy content
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  rulesetJson: jsonb('ruleset_json').notNull(), // Full JSON policy schema
  rulesetHash: varchar('ruleset_hash', { length: 64 }).notNull(), // SHA256 hash of ruleset
  compiledRules: jsonb('compiled_rules'), // Pre-compiled rules for fast evaluation

  // Jurisdiction scoping
  jurisdiction: varchar('jurisdiction', { length: 8 }).notNull(),
  jurisdictionOverlays: text('jurisdiction_overlays').array().default([]), // Additional jurisdiction overlays

  // Activation
  isActive: boolean('is_active').default(false),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  activatedBy: uuid('activated_by'),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  deactivatedBy: uuid('deactivated_by'),

  // Validity period
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),

  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_policy_rulesets_org').on(table.orgId),
  policyVersionIdx: index('idx_policy_rulesets_policy_version').on(table.policyVersionId),
  jurisdictionIdx: index('idx_policy_rulesets_jurisdiction').on(table.jurisdiction),
  activeIdx: index('idx_policy_rulesets_active').on(table.isActive),
  hashIdx: index('idx_policy_rulesets_hash').on(table.rulesetHash),
}));

// Compliance Decision Receipts - Cryptographic proof of compliance decisions
export const complianceReceipts = pgTable('compliance_receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),

  // Linking
  decisionId: uuid('decision_id').references(() => decisions.id, { onDelete: 'set null' }),
  traceId: varchar('trace_id', { length: 64 }).notNull(),

  // Cryptographic proof
  receiptHash: varchar('receipt_hash', { length: 64 }).notNull(), // SHA256 of receipt content
  policyHash: varchar('policy_hash', { length: 64 }).notNull(), // Hash of policy used
  inputsHash: varchar('inputs_hash', { length: 64 }).notNull(), // Hash of evaluation inputs

  // Action & Result
  action: varchar('action', { length: 64 }).notNull(), // transfer, issuance, redemption, etc.
  result: varchar('result', { length: 32 }).notNull(), // allow, deny, require_action

  // Signature
  signature: text('signature').notNull(), // Server signature over receipt
  signatureAlgorithm: varchar('signature_algorithm', { length: 32 }).notNull().default('ES256'),
  signedBy: varchar('signed_by', { length: 256 }).notNull(),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull(),

  // Audit trail
  evaluationDurationMs: integer('evaluation_duration_ms'),
  rulesEvaluated: integer('rules_evaluated').notNull(),
  rulesPassed: integer('rules_passed').notNull(),
  rulesFailed: integer('rules_failed').notNull(),

  // For chain anchoring
  anchoredTxHash: varchar('anchored_tx_hash', { length: 66 }),
  anchoredAt: timestamp('anchored_at', { withTimezone: true }),

  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_compliance_receipts_org').on(table.orgId),
  decisionIdx: index('idx_compliance_receipts_decision').on(table.decisionId),
  traceIdx: index('idx_compliance_receipts_trace').on(table.traceId),
  receiptHashIdx: uniqueIndex('idx_compliance_receipts_hash').on(table.receiptHash),
  resultIdx: index('idx_compliance_receipts_result').on(table.result),
  createdAtIdx: index('idx_compliance_receipts_created').on(table.createdAt),
}));

// Compliance Audit Log - Detailed compliance evaluation history
export const complianceAuditLog = pgTable('compliance_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),

  // Request identification
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  requestId: varchar('request_id', { length: 64 }),

  // Action
  action: varchar('action', { length: 64 }).notNull(),
  subjectType: varchar('subject_type', { length: 32 }).notNull(), // token, transfer, investor, etc.
  subjectId: varchar('subject_id', { length: 256 }).notNull(),

  // Evaluation
  result: varchar('result', { length: 32 }).notNull(), // allow, deny, require_action
  rulesEvaluated: integer('rules_evaluated').notNull(),
  violations: jsonb('violations').default([]), // Array of { ruleId, code, message, severity }

  // Partner-facing explanation
  partnerExplanation: text('partner_explanation'), // Human-readable summary
  suggestedActions: jsonb('suggested_actions').default([]), // Array of { action, endpoint, description }

  // Actor
  actorId: varchar('actor_id', { length: 256 }).notNull(),
  actorType: varchar('actor_type', { length: 32 }).notNull(),

  // Hash chain for tamper-evidence
  entryHash: varchar('entry_hash', { length: 64 }).notNull(),
  previousEntryHash: varchar('previous_entry_hash', { length: 64 }),

  // Timing
  evaluationDurationMs: integer('evaluation_duration_ms'),

  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_compliance_audit_log_org').on(table.orgId),
  traceIdx: index('idx_compliance_audit_log_trace').on(table.traceId),
  actionIdx: index('idx_compliance_audit_log_action').on(table.action),
  resultIdx: index('idx_compliance_audit_log_result').on(table.result),
  subjectIdx: index('idx_compliance_audit_log_subject').on(table.subjectType, table.subjectId),
  createdAtIdx: index('idx_compliance_audit_log_created').on(table.createdAt),
  entryHashIdx: index('idx_compliance_audit_log_hash').on(table.entryHash),
}));

// ============================================================================
// SECTION 22: Versioned State Transitions (P2 - Audit Trail)
// ============================================================================

// State Transitions - Full audit trail with who/why/when
export const stateTransitions = pgTable('state_transitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),

  // Subject
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').references(() => tokens.id, { onDelete: 'cascade' }),
  subjectType: varchar('subject_type', { length: 32 }).notNull(), // asset, token, investor, transfer
  subjectId: uuid('subject_id').notNull(), // Polymorphic reference

  // State change
  previousState: varchar('previous_state', { length: 32 }).notNull(),
  newState: varchar('new_state', { length: 32 }).notNull(),

  // Versioning
  version: integer('version').notNull().default(1),
  previousTransitionId: uuid('previous_transition_id'),

  // Actor information (who)
  triggeredById: varchar('triggered_by_id', { length: 256 }).notNull(),
  triggeredByType: varchar('triggered_by_type', { length: 32 }).notNull(), // user, api_key, system, webhook
  triggeredByName: varchar('triggered_by_name', { length: 256 }),
  triggeredByIp: varchar('triggered_by_ip', { length: 64 }),

  // Justification (why)
  reason: varchar('reason', { length: 1024 }).notNull(), // Machine-readable reason code
  justification: text('justification'), // Human-readable explanation

  // Compliance linkage
  decisionReceiptId: uuid('decision_receipt_id').references(() => complianceReceipts.id, { onDelete: 'set null' }),
  complianceResult: varchar('compliance_result', { length: 16 }), // allow, deny, override

  // Hash chain for tamper-evidence
  transitionHash: varchar('transition_hash', { length: 64 }).notNull(),
  previousTransitionHash: varchar('previous_transition_hash', { length: 64 }),

  // Request context
  requestId: varchar('request_id', { length: 64 }),
  traceId: varchar('trace_id', { length: 64 }),

  // Timing (when)
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),

  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_state_transitions_org').on(table.orgId),
  assetIdx: index('idx_state_transitions_asset').on(table.assetId),
  tokenIdx: index('idx_state_transitions_token').on(table.tokenId),
  subjectIdx: index('idx_state_transitions_subject').on(table.subjectType, table.subjectId),
  stateIdx: index('idx_state_transitions_states').on(table.previousState, table.newState),
  versionIdx: index('idx_state_transitions_version').on(table.subjectId, table.version),
  triggeredByIdx: index('idx_state_transitions_triggered_by').on(table.triggeredByType, table.triggeredById),
  executedAtIdx: index('idx_state_transitions_executed').on(table.executedAt),
  hashIdx: index('idx_state_transitions_hash').on(table.transitionHash),
  previousHashIdx: index('idx_state_transitions_prev_hash').on(table.previousTransitionHash),
}));

// ============================================================================
// SECTION 15: Airline Tickets (NFT Utility Tokens)
// ============================================================================

// Airline Tickets - Core ticket records
export const airlineTickets = pgTable('airline_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').references(() => tokens.id, { onDelete: 'set null' }),
  // On-chain reference
  chainTokenId: varchar('chain_token_id', { length: 78 }), // On-chain NFT token ID
  contractAddress: varchar('contract_address', { length: 42 }),
  chainId: integer('chain_id'),
  // Flight info
  flightNumber: varchar('flight_number', { length: 16 }).notNull(),
  airline: varchar('airline', { length: 8 }).notNull(),
  departureTime: timestamp('departure_time', { withTimezone: true }).notNull(),
  arrivalTime: timestamp('arrival_time', { withTimezone: true }).notNull(),
  departureAirport: varchar('departure_airport', { length: 4 }).notNull(),
  arrivalAirport: varchar('arrival_airport', { length: 4 }).notNull(),
  gate: varchar('gate', { length: 16 }),
  seat: varchar('seat', { length: 8 }),
  ticketClass: varchar('ticket_class', { length: 20 }).notNull().default('ECONOMY'), // ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
  // Passenger
  passengerId: uuid('passenger_id').references(() => investors.id, { onDelete: 'set null' }),
  passengerWallet: varchar('passenger_wallet', { length: 42 }),
  passengerName: varchar('passenger_name', { length: 256 }),
  eTicketNumber: varchar('e_ticket_number', { length: 64 }),
  bookingReference: varchar('booking_reference', { length: 16 }),
  // Lifecycle
  status: varchar('status', { length: 32 }).notNull().default('ISSUED'),
  // ISSUED, CONFIRMED, CHECKED_IN, BOARDED, COMPLETED, CANCELLED, REFUNDED, EXPIRED, BURNED, VOID
  issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow(),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  boardedAt: timestamp('boarded_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  burnedAt: timestamp('burned_at', { withTimezone: true }),
  // Transfer rules
  transferable: boolean('transferable').default(true),
  maxTransfers: integer('max_transfers').default(3),
  transferCount: integer('transfer_count').default(0),
  // Pricing
  pricePaid: numeric('price_paid', { precision: 18, scale: 8 }),
  currency: varchar('currency', { length: 8 }).default('ETH'),
  // Metadata
  metadataVersion: integer('metadata_version').default(1),
  metadataUri: text('metadata_uri'), // IPFS/S3 pointer for rich metadata
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_airline_tickets_org').on(table.orgId),
  flightIdx: index('idx_airline_tickets_flight').on(table.flightNumber, table.departureTime),
  statusIdx: index('idx_airline_tickets_status').on(table.status),
  passengerIdx: index('idx_airline_tickets_passenger').on(table.passengerId),
  walletIdx: index('idx_airline_tickets_wallet').on(table.passengerWallet),
  eTicketIdx: uniqueIndex('idx_airline_tickets_eticket').on(table.orgId, table.eTicketNumber),
  bookingIdx: index('idx_airline_tickets_booking').on(table.bookingReference),
  departureIdx: index('idx_airline_tickets_departure').on(table.departureTime),
  chainTokenIdx: index('idx_airline_tickets_chain_token').on(table.contractAddress, table.chainTokenId),
}));

// Ticket Transfers - Transfer request history
export const ticketTransfers = pgTable('ticket_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => airlineTickets.id, { onDelete: 'cascade' }),
  // Transfer details
  fromWallet: varchar('from_wallet', { length: 42 }).notNull(),
  toWallet: varchar('to_wallet', { length: 42 }).notNull(),
  fromPassengerId: uuid('from_passenger_id').references(() => investors.id, { onDelete: 'set null' }),
  toPassengerId: uuid('to_passenger_id').references(() => investors.id, { onDelete: 'set null' }),
  // Approval
  status: varchar('status', { length: 32 }).notNull().default('PENDING'), // PENDING, KYC_REQUIRED, APPROVED, REJECTED, COMPLETED, EXPIRED
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  // Re-KYC
  kycRequired: boolean('kyc_required').default(false),
  kycCompleted: boolean('kyc_completed').default(false),
  kycCompletedAt: timestamp('kyc_completed_at', { withTimezone: true }),
  // Resale fee
  resaleFee: numeric('resale_fee', { precision: 18, scale: 8 }),
  resaleFeeCurrency: varchar('resale_fee_currency', { length: 8 }),
  resaleFeePaid: boolean('resale_fee_paid').default(false),
  // Idempotency
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  // On-chain
  txHash: varchar('tx_hash', { length: 66 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_ticket_transfers_org').on(table.orgId),
  ticketIdx: index('idx_ticket_transfers_ticket').on(table.ticketId),
  statusIdx: index('idx_ticket_transfers_status').on(table.status),
  idempotencyIdx: uniqueIndex('idx_ticket_transfers_idempotency').on(table.orgId, table.idempotencyKey),
}));

// Ticket Events - Audit trail for ticket operations
export const ticketEvents = pgTable('ticket_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => airlineTickets.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  // TICKET_ISSUED, CHECK_IN_COMPLETED, BOARDING_COMPLETED, TICKET_TRANSFERRED,
  // TICKET_CANCELLED, TICKET_REFUNDED, TICKET_EXPIRED, TICKET_BURNED,
  // GATE_CHANGED, SEAT_CHANGED, FLIGHT_DELAYED, METADATA_UPDATED, KYC_VERIFIED
  actor: varchar('actor', { length: 256 }), // Who performed the action
  actorRole: varchar('actor_role', { length: 32 }), // AIRLINE_ADMIN, AIRLINE_AGENT, PASSENGER, SYSTEM
  previousState: varchar('previous_state', { length: 32 }),
  newState: varchar('new_state', { length: 32 }),
  details: jsonb('details').default({}), // Event-specific data
  correlationId: varchar('correlation_id', { length: 64 }),
  txHash: varchar('tx_hash', { length: 66 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_ticket_events_org').on(table.orgId),
  ticketIdx: index('idx_ticket_events_ticket').on(table.ticketId),
  eventTypeIdx: index('idx_ticket_events_type').on(table.eventType),
  correlationIdx: index('idx_ticket_events_correlation').on(table.correlationId),
  createdAtIdx: index('idx_ticket_events_created').on(table.createdAt),
}));

// Ticket Metadata Versions - Track metadata changes (gate, seat, etc.)
export const ticketMetadataVersions = pgTable('ticket_metadata_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => airlineTickets.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  field: varchar('field', { length: 64 }).notNull(), // gate, seat, ticketClass, departureTime, status
  oldValue: text('old_value'),
  newValue: text('new_value'),
  changedBy: varchar('changed_by', { length: 256 }),
  changeReason: varchar('change_reason', { length: 256 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  ticketVersionIdx: index('idx_ticket_metadata_versions_ticket').on(table.ticketId, table.version),
  fieldIdx: index('idx_ticket_metadata_versions_field').on(table.ticketId, table.field),
}));

// Resale Fee Ledger - Track resale fees collected
export const resaleFeeLedger = pgTable('resale_fee_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => airlineTickets.id, { onDelete: 'cascade' }),
  transferId: uuid('transfer_id').notNull().references(() => ticketTransfers.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 18, scale: 8 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('PENDING'), // PENDING, COLLECTED, FAILED, REFUNDED
  collectedAt: timestamp('collected_at', { withTimezone: true }),
  txHash: varchar('tx_hash', { length: 66 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_resale_fee_org').on(table.orgId),
  ticketIdx: index('idx_resale_fee_ticket').on(table.ticketId),
  statusIdx: index('idx_resale_fee_status').on(table.status),
}));

// Ticket Webhooks - Webhook configurations for ticket events
export const ticketWebhooks = pgTable('ticket_webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  events: text('events').array().notNull().default([]), // Which event types to subscribe to
  secret: varchar('secret', { length: 256 }).notNull(), // HMAC-SHA256 signing secret
  status: varchar('status', { length: 32 }).notNull().default('active'), // active, paused, disabled
  failureCount: integer('failure_count').default(0),
  lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_ticket_webhooks_org').on(table.orgId),
  statusIdx: index('idx_ticket_webhooks_status').on(table.status),
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
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type NewOAuthClient = typeof oauthClients.$inferInsert;
export type OAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type NewOAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferInsert;

// Billing & Usage Types
export type BillingPlan = typeof billingPlans.$inferSelect;
export type NewBillingPlan = typeof billingPlans.$inferInsert;
export type OrgBilling = typeof orgBilling.$inferSelect;
export type NewOrgBilling = typeof orgBilling.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type UsageQuota = typeof usageQuotas.$inferSelect;
export type NewUsageQuota = typeof usageQuotas.$inferInsert;

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

// Vesting Types
export type VestingSchedule = typeof vestingSchedules.$inferSelect;
export type NewVestingSchedule = typeof vestingSchedules.$inferInsert;
export type VestingMilestone = typeof vestingMilestones.$inferSelect;
export type NewVestingMilestone = typeof vestingMilestones.$inferInsert;
export type VestingRelease = typeof vestingReleases.$inferSelect;
export type NewVestingRelease = typeof vestingReleases.$inferInsert;

// Distribution Types
export type Distribution = typeof distributions.$inferSelect;
export type NewDistribution = typeof distributions.$inferInsert;
export type DistributionPayment = typeof distributionPayments.$inferSelect;
export type NewDistributionPayment = typeof distributionPayments.$inferInsert;

// Corporate Action Types
export type CorporateAction = typeof corporateActions.$inferSelect;
export type NewCorporateAction = typeof corporateActions.$inferInsert;
export type CorporateActionEntitlement = typeof corporateActionEntitlements.$inferSelect;
export type NewCorporateActionEntitlement = typeof corporateActionEntitlements.$inferInsert;

// Domain Events Outbox Types
export type DomainEventOutbox = typeof domainEventsOutbox.$inferSelect;
export type NewDomainEventOutbox = typeof domainEventsOutbox.$inferInsert;

// Compliance Approval Types
export type ComplianceApproval = typeof complianceApprovals.$inferSelect;
export type NewComplianceApproval = typeof complianceApprovals.$inferInsert;

// Offering Types
export type Offering = typeof offerings.$inferSelect;
export type NewOffering = typeof offerings.$inferInsert;
export type Allocation = typeof allocations.$inferSelect;
export type NewAllocation = typeof allocations.$inferInsert;

// Buyback Types
export type BuybackRequest = typeof buybackRequests.$inferSelect;
export type NewBuybackRequest = typeof buybackRequests.$inferInsert;

// Clawback Type (enhanced)
export type Clawback = typeof clawbacks.$inferSelect;
export type NewClawback = typeof clawbacks.$inferInsert;

// Policy Ruleset Types
export type PolicyRuleset = typeof policyRulesets.$inferSelect;
export type NewPolicyRuleset = typeof policyRulesets.$inferInsert;

// Compliance Receipt Types
export type ComplianceReceipt = typeof complianceReceipts.$inferSelect;
export type NewComplianceReceipt = typeof complianceReceipts.$inferInsert;

// Compliance Audit Log Types
export type ComplianceAuditLogEntry = typeof complianceAuditLog.$inferSelect;
export type NewComplianceAuditLogEntry = typeof complianceAuditLog.$inferInsert;

// State Transition Types
export type StateTransition = typeof stateTransitions.$inferSelect;
export type NewStateTransition = typeof stateTransitions.$inferInsert;

// Airline Ticket Types
export type AirlineTicket = typeof airlineTickets.$inferSelect;
export type NewAirlineTicket = typeof airlineTickets.$inferInsert;
export type TicketTransfer = typeof ticketTransfers.$inferSelect;
export type NewTicketTransfer = typeof ticketTransfers.$inferInsert;
export type TicketEvent = typeof ticketEvents.$inferSelect;
export type NewTicketEvent = typeof ticketEvents.$inferInsert;
export type TicketMetadataVersion = typeof ticketMetadataVersions.$inferSelect;
export type NewTicketMetadataVersion = typeof ticketMetadataVersions.$inferInsert;
export type ResaleFeeEntry = typeof resaleFeeLedger.$inferSelect;
export type NewResaleFeeEntry = typeof resaleFeeLedger.$inferInsert;
export type TicketWebhook = typeof ticketWebhooks.$inferSelect;
export type NewTicketWebhook = typeof ticketWebhooks.$inferInsert;

// ============================================================================
// SECTION: Payment Rails
// ============================================================================

export const paymentRailConfigs = pgTable('payment_rail_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  railType: varchar('rail_type', { length: 32 }).notNull(), // usdc, bank_ach, bank_wire, bank_sepa
  name: varchar('name', { length: 256 }).notNull(),
  config: jsonb('config').notNull().default({}), // provider-specific config (encrypted at rest)
  supportedCurrencies: jsonb('supported_currencies').notNull().default([]),
  fees: jsonb('fees').default({}), // { fixed?: string, percentage?: number }
  limits: jsonb('limits').default({}), // { minAmount?, maxAmount?, dailyLimit? }
  isDefault: boolean('is_default').default(false),
  status: varchar('status', { length: 32 }).notNull().default('active'), // active, disabled
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_payment_rail_configs_org').on(table.orgId),
  typeIdx: index('idx_payment_rail_configs_type').on(table.railType),
  statusIdx: index('idx_payment_rail_configs_status').on(table.status),
}));

export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  railConfigId: uuid('rail_config_id').notNull().references(() => paymentRailConfigs.id),
  railType: varchar('rail_type', { length: 32 }).notNull(),
  direction: varchar('direction', { length: 16 }).notNull(), // inbound, outbound
  amount: numeric('amount', { precision: 36, scale: 18 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending, processing, completed, failed, cancelled
  reference: varchar('reference', { length: 256 }),
  externalId: varchar('external_id', { length: 256 }), // provider's transaction ID (Stripe PI, Circle transfer ID)
  investorId: uuid('investor_id').references(() => investors.id),
  walletAddress: varchar('wallet_address', { length: 128 }),
  bankDetails: jsonb('bank_details').default({}),
  txHash: varchar('tx_hash', { length: 128 }), // on-chain hash for USDC
  feeAmount: numeric('fee_amount', { precision: 36, scale: 18 }),
  feeCurrency: varchar('fee_currency', { length: 8 }),
  error: text('error'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  orgIdx: index('idx_payment_txns_org').on(table.orgId),
  railIdx: index('idx_payment_txns_rail').on(table.railConfigId),
  statusIdx: index('idx_payment_txns_status').on(table.status),
  investorIdx: index('idx_payment_txns_investor').on(table.investorId),
  directionIdx: index('idx_payment_txns_direction').on(table.direction),
  externalIdx: index('idx_payment_txns_external').on(table.externalId),
  createdIdx: index('idx_payment_txns_created').on(table.createdAt),
}));

// Payment Rail Types
export type PaymentRailConfig = typeof paymentRailConfigs.$inferSelect;
export type NewPaymentRailConfig = typeof paymentRailConfigs.$inferInsert;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type NewPaymentTransaction = typeof paymentTransactions.$inferInsert;

// ============================================================================
// SECTION 17: Hotel Reservations (NFT Utility Tokens)
// ============================================================================

// Hotel Reservations - Core reservation records
export const hotelReservations = pgTable('hotel_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').references(() => tokens.id, { onDelete: 'set null' }),
  // On-chain reference
  chainTokenId: varchar('chain_token_id', { length: 78 }),
  contractAddress: varchar('contract_address', { length: 42 }),
  chainId: integer('chain_id'),
  // Hotel info
  hotelCode: varchar('hotel_code', { length: 16 }).notNull(),
  hotelName: varchar('hotel_name', { length: 256 }).notNull(),
  guestName: varchar('guest_name', { length: 256 }).notNull(),
  roomType: varchar('room_type', { length: 32 }).notNull().default('STANDARD'), // STANDARD, DELUXE, SUITE, PENTHOUSE
  roomNumber: varchar('room_number', { length: 16 }),
  checkInDate: timestamp('check_in_date', { withTimezone: true }).notNull(),
  checkOutDate: timestamp('check_out_date', { withTimezone: true }).notNull(),
  nightCount: integer('night_count').notNull(),
  // Pricing
  rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
  currency: varchar('currency', { length: 8 }).default('USD'),
  // Guest
  guestId: uuid('guest_id').references(() => investors.id, { onDelete: 'set null' }),
  guestWallet: varchar('guest_wallet', { length: 42 }),
  confirmationCode: varchar('confirmation_code', { length: 32 }).notNull(),
  bookingReference: varchar('booking_reference', { length: 16 }),
  // Lifecycle
  status: varchar('status', { length: 32 }).notNull().default('CREATED'),
  // CREATED, CONFIRMED, CHECKED_IN, CHECKED_OUT, CLOSED, CANCELLED, NO_SHOW, EXPIRED, VOID
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  // Transfer rules
  transferable: boolean('transferable').default(true),
  maxTransfers: integer('max_transfers').default(2),
  transferCount: integer('transfer_count').default(0),
  // Metadata
  metadataVersion: integer('metadata_version').default(1),
  metadata: jsonb('metadata').default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_hotel_reservations_org').on(table.orgId),
  hotelCheckInIdx: index('idx_hotel_reservations_hotel_checkin').on(table.hotelCode, table.checkInDate),
  statusIdx: index('idx_hotel_reservations_status').on(table.status),
  guestIdx: index('idx_hotel_reservations_guest').on(table.guestId),
  guestWalletIdx: index('idx_hotel_reservations_wallet').on(table.guestWallet),
  confirmationIdx: uniqueIndex('idx_hotel_reservations_confirmation').on(table.orgId, table.confirmationCode),
}));

// Hotel Reservation Transfers - Transfer request history
export const hotelReservationTransfers = pgTable('hotel_reservation_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  reservationId: uuid('reservation_id').notNull().references(() => hotelReservations.id, { onDelete: 'cascade' }),
  // Transfer details
  fromWallet: varchar('from_wallet', { length: 42 }).notNull(),
  toWallet: varchar('to_wallet', { length: 42 }).notNull(),
  fromGuestId: uuid('from_guest_id').references(() => investors.id, { onDelete: 'set null' }),
  toGuestId: uuid('to_guest_id').references(() => investors.id, { onDelete: 'set null' }),
  // Approval
  status: varchar('status', { length: 32 }).notNull().default('PENDING'), // PENDING, KYC_REQUIRED, APPROVED, REJECTED, COMPLETED, EXPIRED
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  // Re-KYC
  kycRequired: boolean('kyc_required').default(false),
  kycCompleted: boolean('kyc_completed').default(false),
  kycCompletedAt: timestamp('kyc_completed_at', { withTimezone: true }),
  // Resale fee
  resaleFee: numeric('resale_fee', { precision: 18, scale: 8 }),
  resaleFeeCurrency: varchar('resale_fee_currency', { length: 8 }),
  resaleFeePaid: boolean('resale_fee_paid').default(false),
  // Idempotency
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  // On-chain
  txHash: varchar('tx_hash', { length: 66 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_hotel_reservation_transfers_org').on(table.orgId),
  reservationIdx: index('idx_hotel_reservation_transfers_reservation').on(table.reservationId),
  statusIdx: index('idx_hotel_reservation_transfers_status').on(table.status),
  idempotencyIdx: uniqueIndex('idx_hotel_reservation_transfers_idempotency').on(table.orgId, table.idempotencyKey),
}));

// Hotel Reservation Events - Audit trail for reservation operations
export const hotelReservationEvents = pgTable('hotel_reservation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  reservationId: uuid('reservation_id').notNull().references(() => hotelReservations.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  // RESERVATION_CREATED, RESERVATION_CONFIRMED, CHECK_IN_COMPLETED, CHECK_OUT_COMPLETED,
  // RESERVATION_TRANSFERRED, RESERVATION_CANCELLED, RESERVATION_EXPIRED, METADATA_UPDATED, KYC_VERIFIED
  actor: varchar('actor', { length: 256 }),
  actorRole: varchar('actor_role', { length: 32 }), // HOTEL_ADMIN, HOTEL_AGENT, GUEST, SYSTEM
  previousState: varchar('previous_state', { length: 32 }),
  newState: varchar('new_state', { length: 32 }),
  details: jsonb('details').default({}),
  correlationId: varchar('correlation_id', { length: 64 }),
  txHash: varchar('tx_hash', { length: 66 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_hotel_reservation_events_org').on(table.orgId),
  reservationIdx: index('idx_hotel_reservation_events_reservation').on(table.reservationId),
  eventTypeIdx: index('idx_hotel_reservation_events_type').on(table.eventType),
  correlationIdx: index('idx_hotel_reservation_events_correlation').on(table.correlationId),
  createdAtIdx: index('idx_hotel_reservation_events_created').on(table.createdAt),
}));

// ============================================================================
// SECTION 18: Car Rentals (NFT Utility Tokens)
// ============================================================================

// Car Rentals - Core rental records
export const carRentals = pgTable('car_rentals', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').references(() => tokens.id, { onDelete: 'set null' }),
  // On-chain reference
  chainTokenId: varchar('chain_token_id', { length: 78 }),
  contractAddress: varchar('contract_address', { length: 42 }),
  chainId: integer('chain_id'),
  // Rental company info
  rentalCompanyCode: varchar('rental_company_code', { length: 16 }).notNull(),
  rentalCompanyName: varchar('rental_company_name', { length: 256 }).notNull(),
  // Driver
  driverName: varchar('driver_name', { length: 256 }).notNull(),
  driverId: uuid('driver_id').references(() => investors.id, { onDelete: 'set null' }),
  driverWallet: varchar('driver_wallet', { length: 42 }),
  // Vehicle info
  vehicleCategory: varchar('vehicle_category', { length: 32 }).notNull().default('ECONOMY'), // ECONOMY, COMPACT, MIDSIZE, FULLSIZE, LUXURY, SUV, VAN
  vehicleMake: varchar('vehicle_make', { length: 64 }).notNull(),
  vehicleModel: varchar('vehicle_model', { length: 64 }).notNull(),
  licensePlate: varchar('license_plate', { length: 20 }),
  // Rental period
  pickupDate: timestamp('pickup_date', { withTimezone: true }).notNull(),
  returnDate: timestamp('return_date', { withTimezone: true }).notNull(),
  pickupLocation: varchar('pickup_location', { length: 256 }).notNull(),
  returnLocation: varchar('return_location', { length: 256 }).notNull(),
  // Pricing
  dailyRate: numeric('daily_rate', { precision: 18, scale: 8 }).notNull(),
  currency: varchar('currency', { length: 8 }).default('USD'),
  // Deposit
  depositAmount: numeric('deposit_amount', { precision: 18, scale: 8 }).notNull(),
  depositStatus: varchar('deposit_status', { length: 32 }).notNull().default('HELD'), // HELD, RELEASED, PARTIALLY_CHARGED, FULLY_CHARGED
  // Mileage & fuel
  pickupMileage: integer('pickup_mileage'),
  returnMileage: integer('return_mileage'),
  pickupFuel: varchar('pickup_fuel', { length: 16 }),
  returnFuel: varchar('return_fuel', { length: 16 }),
  // Vehicle condition
  vehicleCondition: jsonb('vehicle_condition').default({}),
  damageReport: jsonb('damage_report'),
  // Insurance
  insuranceType: varchar('insurance_type', { length: 32 }),
  insuranceProvider: varchar('insurance_provider', { length: 128 }),
  // Booking
  confirmationCode: varchar('confirmation_code', { length: 32 }).notNull(),
  bookingReference: varchar('booking_reference', { length: 16 }),
  // Lifecycle
  status: varchar('status', { length: 32 }).notNull().default('CREATED'),
  // CREATED, CONFIRMED, PICKED_UP, RETURNED, INSPECTED, CLOSED, CANCELLED, NO_SHOW, EXPIRED, VOID
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
  returnedAt: timestamp('returned_at', { withTimezone: true }),
  inspectedAt: timestamp('inspected_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  // Transfer rules
  transferable: boolean('transferable').default(true),
  maxTransfers: integer('max_transfers').default(2),
  transferCount: integer('transfer_count').default(0),
  // Metadata
  metadataVersion: integer('metadata_version').default(1),
  metadata: jsonb('metadata').default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_car_rentals_org').on(table.orgId),
  companyPickupIdx: index('idx_car_rentals_company_pickup').on(table.rentalCompanyCode, table.pickupDate),
  statusIdx: index('idx_car_rentals_status').on(table.status),
  driverIdx: index('idx_car_rentals_driver').on(table.driverId),
  driverWalletIdx: index('idx_car_rentals_wallet').on(table.driverWallet),
  confirmationIdx: uniqueIndex('idx_car_rentals_confirmation').on(table.orgId, table.confirmationCode),
}));

// Car Rental Transfers - Transfer request history
export const carRentalTransfers = pgTable('car_rental_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  rentalId: uuid('rental_id').notNull().references(() => carRentals.id, { onDelete: 'cascade' }),
  // Transfer details
  fromWallet: varchar('from_wallet', { length: 42 }).notNull(),
  toWallet: varchar('to_wallet', { length: 42 }).notNull(),
  fromDriverId: uuid('from_driver_id').references(() => investors.id, { onDelete: 'set null' }),
  toDriverId: uuid('to_driver_id').references(() => investors.id, { onDelete: 'set null' }),
  // Approval
  status: varchar('status', { length: 32 }).notNull().default('PENDING'), // PENDING, KYC_REQUIRED, APPROVED, REJECTED, COMPLETED, EXPIRED
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  // Re-KYC
  kycRequired: boolean('kyc_required').default(false),
  kycCompleted: boolean('kyc_completed').default(false),
  kycCompletedAt: timestamp('kyc_completed_at', { withTimezone: true }),
  // Resale fee
  resaleFee: numeric('resale_fee', { precision: 18, scale: 8 }),
  resaleFeeCurrency: varchar('resale_fee_currency', { length: 8 }),
  resaleFeePaid: boolean('resale_fee_paid').default(false),
  // Idempotency
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  // On-chain
  txHash: varchar('tx_hash', { length: 66 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_car_rental_transfers_org').on(table.orgId),
  rentalIdx: index('idx_car_rental_transfers_rental').on(table.rentalId),
  statusIdx: index('idx_car_rental_transfers_status').on(table.status),
  idempotencyIdx: uniqueIndex('idx_car_rental_transfers_idempotency').on(table.orgId, table.idempotencyKey),
}));

// Car Rental Events - Audit trail for rental operations
export const carRentalEvents = pgTable('car_rental_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  rentalId: uuid('rental_id').notNull().references(() => carRentals.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  // RENTAL_CREATED, RENTAL_CONFIRMED, PICKUP_COMPLETED, RETURN_COMPLETED,
  // INSPECTION_COMPLETED, RENTAL_TRANSFERRED, RENTAL_CANCELLED, RENTAL_EXPIRED,
  // DAMAGE_REPORTED, DEPOSIT_RELEASED, METADATA_UPDATED, KYC_VERIFIED
  actor: varchar('actor', { length: 256 }),
  actorRole: varchar('actor_role', { length: 32 }), // RENTAL_ADMIN, RENTAL_AGENT, DRIVER, SYSTEM
  previousState: varchar('previous_state', { length: 32 }),
  newState: varchar('new_state', { length: 32 }),
  details: jsonb('details').default({}),
  correlationId: varchar('correlation_id', { length: 64 }),
  txHash: varchar('tx_hash', { length: 66 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_car_rental_events_org').on(table.orgId),
  rentalIdx: index('idx_car_rental_events_rental').on(table.rentalId),
  eventTypeIdx: index('idx_car_rental_events_type').on(table.eventType),
  correlationIdx: index('idx_car_rental_events_correlation').on(table.correlationId),
  createdAtIdx: index('idx_car_rental_events_created').on(table.createdAt),
}));

// ============================================================================
// SECTION 19: Concert Tickets (NFT Utility Tokens)
// ============================================================================

// Concert Tickets - Core ticket records
export const concertTickets = pgTable('concert_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  tokenId: uuid('token_id').references(() => tokens.id, { onDelete: 'set null' }),
  // On-chain reference
  chainTokenId: varchar('chain_token_id', { length: 78 }),
  contractAddress: varchar('contract_address', { length: 42 }),
  chainId: integer('chain_id'),
  // Venue & event info
  venueCode: varchar('venue_code', { length: 16 }).notNull(),
  venueName: varchar('venue_name', { length: 256 }).notNull(),
  eventName: varchar('event_name', { length: 256 }).notNull(),
  artist: varchar('artist', { length: 256 }).notNull(),
  eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
  doorsOpen: timestamp('doors_open', { withTimezone: true }),
  // Seating
  section: varchar('section', { length: 32 }),
  row: varchar('row', { length: 16 }),
  seatNumber: varchar('seat_number', { length: 16 }),
  seatingTier: varchar('seating_tier', { length: 32 }).notNull().default('GA'), // GA, FLOOR, LOWER, UPPER, VIP, BACKSTAGE
  // Pricing
  faceValue: numeric('face_value', { precision: 18, scale: 8 }).notNull(),
  resalePriceCap: numeric('resale_price_cap', { precision: 18, scale: 8 }),
  currency: varchar('currency', { length: 8 }).default('USD'),
  // Fan
  fanName: varchar('fan_name', { length: 256 }),
  fanId: uuid('fan_id').references(() => investors.id, { onDelete: 'set null' }),
  fanWallet: varchar('fan_wallet', { length: 42 }),
  ageVerified: boolean('age_verified').default(false),
  admittedAt: timestamp('admitted_at', { withTimezone: true }),
  // Booking
  confirmationCode: varchar('confirmation_code', { length: 32 }).notNull(),
  bookingReference: varchar('booking_reference', { length: 16 }),
  // Lifecycle
  status: varchar('status', { length: 32 }).notNull().default('CREATED'),
  // CREATED, ISSUED, ADMITTED, USED, CLOSED, CANCELLED, REFUNDED, EXPIRED, VOID
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  // Transfer rules
  transferable: boolean('transferable').default(true),
  maxTransfers: integer('max_transfers').default(3),
  transferCount: integer('transfer_count').default(0),
  // Metadata
  metadataVersion: integer('metadata_version').default(1),
  metadata: jsonb('metadata').default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_concert_tickets_org').on(table.orgId),
  venueEventIdx: index('idx_concert_tickets_venue_event').on(table.venueCode, table.eventDate),
  statusIdx: index('idx_concert_tickets_status').on(table.status),
  fanIdx: index('idx_concert_tickets_fan').on(table.fanId),
  fanWalletIdx: index('idx_concert_tickets_wallet').on(table.fanWallet),
  confirmationIdx: uniqueIndex('idx_concert_tickets_confirmation').on(table.orgId, table.confirmationCode),
}));

// Concert Ticket Transfers - Transfer request history
export const concertTicketTransfers = pgTable('concert_ticket_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  concertTicketId: uuid('concert_ticket_id').notNull().references(() => concertTickets.id, { onDelete: 'cascade' }),
  // Transfer details
  fromWallet: varchar('from_wallet', { length: 42 }).notNull(),
  toWallet: varchar('to_wallet', { length: 42 }).notNull(),
  fromFanId: uuid('from_fan_id').references(() => investors.id, { onDelete: 'set null' }),
  toFanId: uuid('to_fan_id').references(() => investors.id, { onDelete: 'set null' }),
  // Resale price
  resalePrice: numeric('resale_price', { precision: 18, scale: 8 }),
  // Approval
  status: varchar('status', { length: 32 }).notNull().default('PENDING'), // PENDING, KYC_REQUIRED, APPROVED, REJECTED, COMPLETED, EXPIRED
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  // Re-KYC
  kycRequired: boolean('kyc_required').default(false),
  kycCompleted: boolean('kyc_completed').default(false),
  kycCompletedAt: timestamp('kyc_completed_at', { withTimezone: true }),
  // Resale fee
  resaleFee: numeric('resale_fee', { precision: 18, scale: 8 }),
  resaleFeeCurrency: varchar('resale_fee_currency', { length: 8 }),
  resaleFeePaid: boolean('resale_fee_paid').default(false),
  // Idempotency
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  // On-chain
  txHash: varchar('tx_hash', { length: 66 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_concert_ticket_transfers_org').on(table.orgId),
  concertTicketIdx: index('idx_concert_ticket_transfers_ticket').on(table.concertTicketId),
  statusIdx: index('idx_concert_ticket_transfers_status').on(table.status),
  idempotencyIdx: uniqueIndex('idx_concert_ticket_transfers_idempotency').on(table.orgId, table.idempotencyKey),
}));

// Concert Ticket Events - Audit trail for concert ticket operations
export const concertTicketEvents = pgTable('concert_ticket_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  concertTicketId: uuid('concert_ticket_id').notNull().references(() => concertTickets.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  // TICKET_CREATED, TICKET_ISSUED, TICKET_ADMITTED, TICKET_USED,
  // TICKET_TRANSFERRED, TICKET_CANCELLED, TICKET_REFUNDED, TICKET_EXPIRED,
  // RESALE_PRICE_SET, METADATA_UPDATED, KYC_VERIFIED, AGE_VERIFIED
  actor: varchar('actor', { length: 256 }),
  actorRole: varchar('actor_role', { length: 32 }), // VENUE_ADMIN, VENUE_AGENT, FAN, SYSTEM
  previousState: varchar('previous_state', { length: 32 }),
  newState: varchar('new_state', { length: 32 }),
  details: jsonb('details').default({}),
  correlationId: varchar('correlation_id', { length: 64 }),
  txHash: varchar('tx_hash', { length: 66 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_concert_ticket_events_org').on(table.orgId),
  concertTicketIdx: index('idx_concert_ticket_events_ticket').on(table.concertTicketId),
  eventTypeIdx: index('idx_concert_ticket_events_type').on(table.eventType),
  correlationIdx: index('idx_concert_ticket_events_correlation').on(table.correlationId),
  createdAtIdx: index('idx_concert_ticket_events_created').on(table.createdAt),
}));

// ============================================================================
// SECTION 20: Dashboard Metrics
// ============================================================================

// Dashboard Metrics - Aggregated metric snapshots
export const dashboardMetrics = pgTable('dashboard_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  metricName: varchar('metric_name', { length: 64 }).notNull(),
  metricValue: numeric('metric_value', { precision: 18, scale: 8 }).notNull(),
  metricDate: varchar('metric_date', { length: 10 }).notNull(), // YYYY-MM-DD
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgMetricDateIdx: uniqueIndex('idx_dashboard_metrics_org_metric_date').on(table.orgId, table.metricName, table.metricDate),
}));

// Hotel Types
export type HotelReservation = typeof hotelReservations.$inferSelect;
export type NewHotelReservation = typeof hotelReservations.$inferInsert;
export type HotelReservationTransfer = typeof hotelReservationTransfers.$inferSelect;
export type NewHotelReservationTransfer = typeof hotelReservationTransfers.$inferInsert;
export type HotelReservationEvent = typeof hotelReservationEvents.$inferSelect;
export type NewHotelReservationEvent = typeof hotelReservationEvents.$inferInsert;

// Car Rental Types
export type CarRental = typeof carRentals.$inferSelect;
export type NewCarRental = typeof carRentals.$inferInsert;
export type CarRentalTransfer = typeof carRentalTransfers.$inferSelect;
export type NewCarRentalTransfer = typeof carRentalTransfers.$inferInsert;
export type CarRentalEvent = typeof carRentalEvents.$inferSelect;
export type NewCarRentalEvent = typeof carRentalEvents.$inferInsert;

// Concert Ticket Types
export type ConcertTicket = typeof concertTickets.$inferSelect;
export type NewConcertTicket = typeof concertTickets.$inferInsert;
export type ConcertTicketTransfer = typeof concertTicketTransfers.$inferSelect;
export type NewConcertTicketTransfer = typeof concertTicketTransfers.$inferInsert;
export type ConcertTicketEvent = typeof concertTicketEvents.$inferSelect;
export type NewConcertTicketEvent = typeof concertTicketEvents.$inferInsert;

// Dashboard Metrics Types
export type DashboardMetric = typeof dashboardMetrics.$inferSelect;
export type NewDashboardMetric = typeof dashboardMetrics.$inferInsert;

// ============================================================================
// SECTION 24: Real Estate — Investor Tiers, Exit Windows, Secondary Market
// ============================================================================

// Investor Plans — per-asset tier investment plans (VARA compliance)
export const investorPlans = pgTable('investor_plans', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull(),
  tier: varchar('tier', { length: 32 }).notNull(), // retail, qualified, professional, institutional
  name: varchar('name', { length: 256 }).notNull(),
  minInvestment: numeric('min_investment', { precision: 18, scale: 2 }).notNull(),
  maxInvestment: numeric('max_investment', { precision: 18, scale: 2 }).notNull(),
  maxHoldingPercent: numeric('max_holding_percent', { precision: 5, scale: 2 }).notNull(),
  managementFeePercent: numeric('management_fee_percent', { precision: 5, scale: 2 }).notNull(),
  performanceFeePercent: numeric('performance_fee_percent', { precision: 5, scale: 2 }).notNull(),
  lockupDays: integer('lockup_days').notNull(),
  accreditationRequired: boolean('accreditation_required').notNull().default(false),
  accreditationTypes: jsonb('accreditation_types').default([]),
  currency: varchar('currency', { length: 8 }).notNull().default('AED'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  assetIdx: index('idx_investor_plans_asset').on(table.assetId),
  tierIdx: index('idx_investor_plans_tier').on(table.tier),
}));

// Investor Tier Assignments — which tier an investor is verified for
export const investorTierAssignments = pgTable('investor_tier_assignments', {
  id: text('id').primaryKey(),
  investorId: text('investor_id').notNull(),
  tier: varchar('tier', { length: 32 }).notNull(),
  accreditationStatus: varchar('accreditation_status', { length: 32 }).notNull().default('none'),
  totalInvested: numeric('total_invested', { precision: 18, scale: 2 }).notNull().default('0'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  accreditationDocs: jsonb('accreditation_docs').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  investorIdx: uniqueIndex('idx_investor_tier_assignments_investor').on(table.investorId),
}));

// Exit Window Schedules — recurring redemption window configuration
export const exitWindowSchedules = pgTable('exit_window_schedules', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull(),
  frequency: varchar('frequency', { length: 32 }).notNull(), // monthly, quarterly, semi-annually, annually
  windowDurationDays: integer('window_duration_days').notNull(),
  maxRedemptionPercent: numeric('max_redemption_percent', { precision: 5, scale: 2 }).notNull(),
  noticePeriodDays: integer('notice_period_days').notNull(),
  nextWindowOpens: text('next_window_opens').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  assetIdx: uniqueIndex('idx_exit_window_schedules_asset').on(table.assetId),
}));

// Exit Windows — individual window instances
export const exitWindows = pgTable('exit_windows', {
  id: text('id').primaryKey(),
  scheduleId: text('schedule_id').notNull(),
  assetId: text('asset_id').notNull(),
  opensAt: text('opens_at').notNull(),
  closesAt: text('closes_at').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('scheduled'), // scheduled, open, closed
  maxRedemptionPercent: numeric('max_redemption_percent', { precision: 5, scale: 2 }).notNull(),
  totalRedeemed: numeric('total_redeemed', { precision: 18, scale: 2 }).notNull().default('0'),
  totalRequested: numeric('total_requested', { precision: 18, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  assetIdx: index('idx_exit_windows_asset').on(table.assetId),
  scheduleIdx: index('idx_exit_windows_schedule').on(table.scheduleId),
  statusIdx: index('idx_exit_windows_status').on(table.status),
}));

// Exit Redemptions — individual redemption requests within a window
export const exitRedemptions = pgTable('exit_redemptions', {
  id: text('id').primaryKey(),
  windowId: text('window_id').notNull(),
  investorId: text('investor_id').notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'), // pending, approved, executed, rejected
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  windowIdx: index('idx_exit_redemptions_window').on(table.windowId),
  investorIdx: index('idx_exit_redemptions_investor').on(table.investorId),
}));

// Secondary Listings — P2P token trading on secondary market
export const secondaryListings = pgTable('secondary_listings', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull(),
  sellerId: text('seller_id').notNull(),
  sellerWallet: varchar('seller_wallet', { length: 128 }).notNull(),
  tokenAmount: numeric('token_amount', { precision: 18, scale: 2 }).notNull(),
  pricePerToken: numeric('price_per_token', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull().default('AED'),
  status: varchar('status', { length: 16 }).notNull().default('active'), // active, sold, cancelled, expired
  buyerId: text('buyer_id'),
  listedAt: timestamp('listed_at', { withTimezone: true }).defaultNow(),
  soldAt: timestamp('sold_at', { withTimezone: true }),
  expiresAt: text('expires_at'),
}, (table) => ({
  assetIdx: index('idx_secondary_listings_asset').on(table.assetId),
  sellerIdx: index('idx_secondary_listings_seller').on(table.sellerId),
  statusIdx: index('idx_secondary_listings_status').on(table.status),
}));

// Real Estate Phase 2 Types
export type InvestorPlanRow = typeof investorPlans.$inferSelect;
export type NewInvestorPlanRow = typeof investorPlans.$inferInsert;
export type InvestorTierAssignment = typeof investorTierAssignments.$inferSelect;
export type NewInvestorTierAssignment = typeof investorTierAssignments.$inferInsert;
export type ExitWindowScheduleRow = typeof exitWindowSchedules.$inferSelect;
export type NewExitWindowScheduleRow = typeof exitWindowSchedules.$inferInsert;
export type ExitWindowRow = typeof exitWindows.$inferSelect;
export type NewExitWindowRow = typeof exitWindows.$inferInsert;
export type ExitRedemptionRow = typeof exitRedemptions.$inferSelect;
export type NewExitRedemptionRow = typeof exitRedemptions.$inferInsert;
export type SecondaryListingRow = typeof secondaryListings.$inferSelect;
export type NewSecondaryListingRow = typeof secondaryListings.$inferInsert;
