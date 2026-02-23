/**
 * PostgreSQL Database Schema
 *
 * Drizzle ORM schema definitions for all SDK entities.
 * This is the source of truth for database structure.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// ENUMS
// ============================================================================

export const lifecycleStateEnum = pgEnum('lifecycle_state', [
  'DRAFT',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'ACTIVE',
  'SUSPENDED',
  'RETIRED',
]);

export const rightTypeEnum = pgEnum('right_type', [
  'OWNERSHIP',
  'REVENUE',
  'ACCESS',
  'VOTING',
  'BEHAVIOR',
  'VERIFICATION',
  'CUSTOM',
]);

export const transferabilityModeEnum = pgEnum('transferability_mode', [
  'FREELY_TRANSFERABLE',
  'COMPLIANCE_GATED',
  'NON_TRANSFERABLE',
]);

export const partyTypeEnum = pgEnum('party_type', [
  'INDIVIDUAL',
  'ORGANIZATION',
  'TRUST',
  'FUND',
]);

export const partyRoleEnum = pgEnum('party_role', [
  'ISSUER',
  'INVESTOR',
  'CUSTODIAN',
  'VERIFIER',
  'REGULATOR',
  'TRANSFER_AGENT',
]);

export const evidenceTypeEnum = pgEnum('evidence_type', [
  'LEGAL_DOCUMENT',
  'FINANCIAL_DOCUMENT',
  'AUDIT_REPORT',
  'CERTIFICATE',
  'VALUATION',
  'INSURANCE',
  'CUSTOM',
]);

export const evidenceStatusEnum = pgEnum('evidence_status', [
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
]);

export const offeringStatusEnum = pgEnum('offering_status', [
  'DRAFT',
  'OPEN',
  'PAUSED',
  'CLOSED',
  'CANCELLED',
  'SETTLED',
]);

export const offeringTypeEnum = pgEnum('offering_type', [
  'PUBLIC',
  'PRIVATE_PLACEMENT',
  'REG_D_506B',
  'REG_D_506C',
  'REG_S',
  'REG_A_PLUS',
  'REG_CF',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'PENDING',
  'KYC_REQUIRED',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'ALLOCATED',
  'REJECTED',
  'CANCELLED',
  'REFUNDED',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'WIRE',
  'ACH',
  'CRYPTO',
  'STABLECOIN',
  'CREDIT_CARD',
]);

export const transactionTypeEnum = pgEnum('transaction_type', [
  'MINT',
  'BURN',
  'TRANSFER',
  'FREEZE',
  'UNFREEZE',
]);

export const transactionStatusEnum = pgEnum('transaction_status', [
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'REVERTED',
]);

// ============================================================================
// CORE TABLES
// ============================================================================

/**
 * Assets - Tokenized real-world assets
 */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    rightType: rightTypeEnum('right_type').notNull(),
    state: lifecycleStateEnum('state').notNull().default('DRAFT'),

    // Jurisdiction
    jurisdictionCountry: varchar('jurisdiction_country', { length: 2 }).notNull(),
    jurisdictionAccreditedOnly: boolean('jurisdiction_accredited_only').default(false),
    blockedJurisdictions: jsonb('blocked_jurisdictions').$type<string[]>().default([]),

    // Validity
    validityStartTime: timestamp('validity_start_time'),
    validityEndTime: timestamp('validity_end_time'),
    validityIsPerpetual: boolean('validity_is_perpetual').default(false),

    // Transferability
    transferabilityMode: transferabilityModeEnum('transferability_mode').notNull(),
    lockupPeriodSeconds: integer('lockup_period_seconds').default(0),
    transferRequireKyc: boolean('transfer_require_kyc').default(true),
    maxHolders: integer('max_holders'),
    maxPerHolder: decimal('max_per_holder', { precision: 78, scale: 0 }),

    // Token info
    tokenStandard: varchar('token_standard', { length: 50 }),
    tokenDecimals: integer('token_decimals').default(18),
    contractAddress: varchar('contract_address', { length: 42 }),
    chainId: integer('chain_id'),
    totalSupply: decimal('total_supply', { precision: 78, scale: 0 }),

    // References
    issuerId: uuid('issuer_id').notNull(),

    // Metadata
    typedMetadata: jsonb('typed_metadata').$type<Record<string, unknown>>().default({}),

    // Audit
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    stateIdx: index('assets_state_idx').on(table.state),
    issuerIdx: index('assets_issuer_idx').on(table.issuerId),
    contractIdx: uniqueIndex('assets_contract_idx').on(table.contractAddress, table.chainId),
  })
);

/**
 * Parties - Issuers, investors, custodians, etc.
 */
export const parties = pgTable(
  'parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: partyTypeEnum('type').notNull(),
    roles: jsonb('roles').$type<string[]>().notNull().default([]),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    jurisdiction: varchar('jurisdiction', { length: 2 }),

    // KYC
    kycVerified: boolean('kyc_verified').default(false),
    kycVerifiedAt: timestamp('kyc_verified_at'),
    kycExpiresAt: timestamp('kyc_expires_at'),
    kycProvider: varchar('kyc_provider', { length: 100 }),
    kycReference: varchar('kyc_reference', { length: 255 }),

    // Accreditation
    accreditedInvestor: boolean('accredited_investor').default(false),
    accreditationVerifiedAt: timestamp('accreditation_verified_at'),
    accreditationExpiresAt: timestamp('accreditation_expires_at'),

    // Status
    frozen: boolean('frozen').default(false),
    frozenReason: text('frozen_reason'),
    frozenAt: timestamp('frozen_at'),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    // Audit
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('parties_email_idx').on(table.email),
    typeIdx: index('parties_type_idx').on(table.type),
    kycIdx: index('parties_kyc_idx').on(table.kycVerified),
  })
);

/**
 * Wallets - Blockchain addresses linked to parties
 */
export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    address: varchar('address', { length: 42 }).notNull(),
    chainId: integer('chain_id').notNull(),
    label: varchar('label', { length: 100 }),
    isPrimary: boolean('is_primary').default(false),
    verified: boolean('verified').default(false),
    verifiedAt: timestamp('verified_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    addressChainIdx: uniqueIndex('wallets_address_chain_idx').on(table.address, table.chainId),
    partyIdx: index('wallets_party_idx').on(table.partyId),
  })
);

/**
 * Evidence - Supporting documents and proofs
 */
export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    type: evidenceTypeEnum('type').notNull(),
    status: evidenceStatusEnum('status').notNull().default('PENDING'),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),

    // Storage
    storageUrl: text('storage_url'),
    storageProvider: varchar('storage_provider', { length: 50 }),

    // Source
    sourceType: varchar('source_type', { length: 50 }),
    sourceIdentifier: varchar('source_identifier', { length: 255 }),
    sourceName: varchar('source_name', { length: 255 }),
    sourceTrusted: boolean('source_trusted').default(false),
    sourceReputationScore: integer('source_reputation_score'),

    // Verification
    verifierId: uuid('verifier_id').references(() => parties.id),
    verifiedAt: timestamp('verified_at'),
    verificationMethod: varchar('verification_method', { length: 100 }),
    verificationNotes: text('verification_notes'),

    // Validity
    expiresAt: timestamp('expires_at'),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    // Audit
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    assetIdx: index('evidence_asset_idx').on(table.assetId),
    statusIdx: index('evidence_status_idx').on(table.status),
    hashIdx: index('evidence_hash_idx').on(table.contentHash),
  })
);

/**
 * Token Balances - Current token holdings
 */
export const tokenBalances = pgTable(
  'token_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    holderId: uuid('holder_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    walletAddress: varchar('wallet_address', { length: 42 }).notNull(),
    balance: decimal('balance', { precision: 78, scale: 0 }).notNull().default('0'),
    frozenBalance: decimal('frozen_balance', { precision: 78, scale: 0 }).notNull().default('0'),
    lastTransactionAt: timestamp('last_transaction_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    assetHolderIdx: uniqueIndex('balances_asset_holder_idx').on(table.assetId, table.holderId),
    assetIdx: index('balances_asset_idx').on(table.assetId),
    holderIdx: index('balances_holder_idx').on(table.holderId),
    walletIdx: index('balances_wallet_idx').on(table.walletAddress),
  })
);

/**
 * Transactions - Token transfer history
 */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id),
    type: transactionTypeEnum('type').notNull(),
    status: transactionStatusEnum('status').notNull().default('PENDING'),

    // Parties
    fromAddress: varchar('from_address', { length: 42 }),
    toAddress: varchar('to_address', { length: 42 }),
    fromPartyId: uuid('from_party_id').references(() => parties.id),
    toPartyId: uuid('to_party_id').references(() => parties.id),

    // Amount
    amount: decimal('amount', { precision: 78, scale: 0 }).notNull(),

    // Blockchain
    txHash: varchar('tx_hash', { length: 66 }),
    blockNumber: integer('block_number'),
    chainId: integer('chain_id'),
    gasUsed: decimal('gas_used', { precision: 78, scale: 0 }),

    // Compliance
    complianceCheckId: uuid('compliance_check_id'),
    complianceApproved: boolean('compliance_approved'),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    // Audit
    createdAt: timestamp('created_at').notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at'),
  },
  (table) => ({
    assetIdx: index('transactions_asset_idx').on(table.assetId),
    txHashIdx: uniqueIndex('transactions_tx_hash_idx').on(table.txHash),
    fromIdx: index('transactions_from_idx').on(table.fromAddress),
    toIdx: index('transactions_to_idx').on(table.toAddress),
    statusIdx: index('transactions_status_idx').on(table.status),
    createdIdx: index('transactions_created_idx').on(table.createdAt),
  })
);

// ============================================================================
// OFFERINGS TABLES
// ============================================================================

/**
 * Offerings - Token sale offerings
 */
export const offerings = pgTable(
  'offerings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    type: offeringTypeEnum('type').notNull().default('PRIVATE_PLACEMENT'),
    status: offeringStatusEnum('status').notNull().default('DRAFT'),

    // Investment limits
    minInvestment: decimal('min_investment', { precision: 78, scale: 0 }).notNull(),
    maxInvestment: decimal('max_investment', { precision: 78, scale: 0 }).notNull(),
    targetRaise: decimal('target_raise', { precision: 78, scale: 0 }).notNull(),
    hardCap: decimal('hard_cap', { precision: 78, scale: 0 }).notNull(),
    tokenPrice: decimal('token_price', { precision: 78, scale: 18 }).notNull(),

    // Timeline
    subscriptionStart: timestamp('subscription_start').notNull(),
    subscriptionEnd: timestamp('subscription_end').notNull(),

    // Compliance
    allowedTiers: jsonb('allowed_tiers').$type<string[]>().default([]),
    allowedJurisdictions: jsonb('allowed_jurisdictions').$type<string[]>().default([]),
    blockedJurisdictions: jsonb('blocked_jurisdictions').$type<string[]>().default([]),
    requireAccreditation: boolean('require_accreditation').default(true),
    lockupDays: integer('lockup_days').default(0),

    // Tracking
    totalSubscribed: decimal('total_subscribed', { precision: 78, scale: 0 }).notNull().default('0'),
    totalConfirmed: decimal('total_confirmed', { precision: 78, scale: 0 }).notNull().default('0'),
    totalAllocated: decimal('total_allocated', { precision: 78, scale: 0 }).notNull().default('0'),
    subscriberCount: integer('subscriber_count').notNull().default(0),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    // Audit
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    openedAt: timestamp('opened_at'),
    closedAt: timestamp('closed_at'),
    settledAt: timestamp('settled_at'),
  },
  (table) => ({
    assetIdx: index('offerings_asset_idx').on(table.assetId),
    statusIdx: index('offerings_status_idx').on(table.status),
  })
);

/**
 * Subscriptions - Investor subscriptions to offerings
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => offerings.id),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => parties.id),
    status: subscriptionStatusEnum('status').notNull().default('PENDING'),

    // Investment
    amount: decimal('amount', { precision: 78, scale: 0 }).notNull(),
    tokenAmount: decimal('token_amount', { precision: 78, scale: 0 }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    paymentReference: varchar('payment_reference', { length: 255 }),
    walletAddress: varchar('wallet_address', { length: 42 }),

    // Compliance
    kycVerified: boolean('kyc_verified').default(false),
    accreditationVerified: boolean('accreditation_verified').default(false),
    jurisdictionApproved: boolean('jurisdiction_approved').default(false),

    // Allocation
    allocatedAmount: decimal('allocated_amount', { precision: 78, scale: 0 }),
    allocationReason: text('allocation_reason'),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    // Audit
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at'),
    allocatedAt: timestamp('allocated_at'),
  },
  (table) => ({
    offeringIdx: index('subscriptions_offering_idx').on(table.offeringId),
    investorIdx: index('subscriptions_investor_idx').on(table.investorId),
    statusIdx: index('subscriptions_status_idx').on(table.status),
  })
);

// ============================================================================
// COMPLIANCE TABLES
// ============================================================================

/**
 * Compliance Decisions - Audit trail of compliance checks
 */
export const complianceDecisions = pgTable(
  'compliance_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id').references(() => assets.id),
    action: varchar('action', { length: 50 }).notNull(),
    decision: varchar('decision', { length: 20 }).notNull(),
    reasons: jsonb('reasons').$type<string[]>().default([]),
    conditions: jsonb('conditions').$type<string[]>().default([]),

    // Context
    actorId: uuid('actor_id').references(() => parties.id),
    targetId: uuid('target_id').references(() => parties.id),
    context: jsonb('context').$type<Record<string, unknown>>().default({}),

    // Chain
    previousDecisionId: uuid('previous_decision_id'),
    hash: varchar('hash', { length: 128 }).notNull(),

    // Audit
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => ({
    assetIdx: index('compliance_asset_idx').on(table.assetId),
    actionIdx: index('compliance_action_idx').on(table.action),
    hashIdx: uniqueIndex('compliance_hash_idx').on(table.hash),
  })
);

/**
 * KYC Records - Detailed KYC verification records
 */
export const kycRecords = pgTable(
  'kyc_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 100 }).notNull(),
    externalId: varchar('external_id', { length: 255 }),
    status: varchar('status', { length: 50 }).notNull(),
    level: varchar('level', { length: 50 }),

    // Results
    documentVerified: boolean('document_verified'),
    addressVerified: boolean('address_verified'),
    sanctionsCleared: boolean('sanctions_cleared'),
    pepCleared: boolean('pep_cleared'),
    riskScore: integer('risk_score'),
    riskLevel: varchar('risk_level', { length: 20 }),

    // Data
    verificationData: jsonb('verification_data').$type<Record<string, unknown>>().default({}),

    // Audit
    submittedAt: timestamp('submitted_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
    expiresAt: timestamp('expires_at'),
  },
  (table) => ({
    partyIdx: index('kyc_party_idx').on(table.partyId),
    providerIdx: index('kyc_provider_idx').on(table.provider),
    externalIdx: uniqueIndex('kyc_external_idx').on(table.provider, table.externalId),
  })
);

// ============================================================================
// EVENTS TABLE (Event Sourcing)
// ============================================================================

/**
 * Events - Immutable event log for event sourcing
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aggregateId: uuid('aggregate_id').notNull(),
    aggregateType: varchar('aggregate_type', { length: 50 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    eventVersion: integer('event_version').notNull().default(1),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    aggregateIdx: index('events_aggregate_idx').on(table.aggregateId, table.aggregateType),
    typeIdx: index('events_type_idx').on(table.eventType),
    createdIdx: index('events_created_idx').on(table.createdAt),
  })
);

// ============================================================================
// DISTRIBUTIONS TABLE
// ============================================================================

/**
 * Distribution Schedules - Dividend/revenue share schedules
 */
export const distributionSchedules = pgTable(
  'distribution_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    frequency: varchar('frequency', { length: 50 }).notNull(),
    allocationStrategy: varchar('allocation_strategy', { length: 50 }).notNull(),
    isActive: boolean('is_active').default(true),
    nextDistributionAt: timestamp('next_distribution_at'),
    lastDistributionAt: timestamp('last_distribution_at'),
    totalDistributed: decimal('total_distributed', { precision: 78, scale: 0 }).notNull().default('0'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    assetIdx: index('dist_schedules_asset_idx').on(table.assetId),
  })
);

/**
 * Distributions - Individual distribution events
 */
export const distributions = pgTable(
  'distributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => distributionSchedules.id),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id),
    totalAmount: decimal('total_amount', { precision: 78, scale: 0 }).notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    snapshotBlock: integer('snapshot_block'),
    recipientCount: integer('recipient_count').notNull().default(0),
    status: varchar('status', { length: 50 }).notNull().default('PENDING'),
    processedAt: timestamp('processed_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    scheduleIdx: index('distributions_schedule_idx').on(table.scheduleId),
    assetIdx: index('distributions_asset_idx').on(table.assetId),
  })
);

// ============================================================================
// RELATIONS
// ============================================================================

export const assetsRelations = relations(assets, ({ one, many }) => ({
  issuer: one(parties, {
    fields: [assets.issuerId],
    references: [parties.id],
  }),
  evidence: many(evidence),
  balances: many(tokenBalances),
  transactions: many(transactions),
  offerings: many(offerings),
}));

export const partiesRelations = relations(parties, ({ many }) => ({
  wallets: many(wallets),
  balances: many(tokenBalances),
  kycRecords: many(kycRecords),
  subscriptions: many(subscriptions),
}));

export const walletsRelations = relations(wallets, ({ one }) => ({
  party: one(parties, {
    fields: [wallets.partyId],
    references: [parties.id],
  }),
}));

export const evidenceRelations = relations(evidence, ({ one }) => ({
  asset: one(assets, {
    fields: [evidence.assetId],
    references: [assets.id],
  }),
  verifier: one(parties, {
    fields: [evidence.verifierId],
    references: [parties.id],
  }),
}));

export const tokenBalancesRelations = relations(tokenBalances, ({ one }) => ({
  asset: one(assets, {
    fields: [tokenBalances.assetId],
    references: [assets.id],
  }),
  holder: one(parties, {
    fields: [tokenBalances.holderId],
    references: [parties.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  asset: one(assets, {
    fields: [transactions.assetId],
    references: [assets.id],
  }),
  fromParty: one(parties, {
    fields: [transactions.fromPartyId],
    references: [parties.id],
  }),
  toParty: one(parties, {
    fields: [transactions.toPartyId],
    references: [parties.id],
  }),
}));

export const offeringsRelations = relations(offerings, ({ one, many }) => ({
  asset: one(assets, {
    fields: [offerings.assetId],
    references: [assets.id],
  }),
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  offering: one(offerings, {
    fields: [subscriptions.offeringId],
    references: [offerings.id],
  }),
  investor: one(parties, {
    fields: [subscriptions.investorId],
    references: [parties.id],
  }),
}));

export const kycRecordsRelations = relations(kycRecords, ({ one }) => ({
  party: one(parties, {
    fields: [kycRecords.partyId],
    references: [parties.id],
  }),
}));

export const distributionSchedulesRelations = relations(distributionSchedules, ({ one, many }) => ({
  asset: one(assets, {
    fields: [distributionSchedules.assetId],
    references: [assets.id],
  }),
  distributions: many(distributions),
}));

export const distributionsRelations = relations(distributions, ({ one }) => ({
  schedule: one(distributionSchedules, {
    fields: [distributions.scheduleId],
    references: [distributionSchedules.id],
  }),
  asset: one(assets, {
    fields: [distributions.assetId],
    references: [assets.id],
  }),
}));
