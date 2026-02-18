/**
 * GPU Compute Tokenization Schema
 *
 * Drizzle ORM table definitions for GPU compute node tokenization:
 * - gpu_nodes: Physical GPU node records with specs, financials, and status
 * - gpu_node_metrics: Time series metrics (utilization, temperature, pricing)
 * - gpu_revenue_periods: Revenue tracking per billing period
 * - gpu_distributions: Yield distribution records to token holders
 * - compute_listings: Marketplace listings for tokenized GPU nodes
 */

import { pgTable, uuid, text, integer, numeric, boolean, timestamp, jsonb, smallint, index, uniqueIndex } from 'drizzle-orm/pg-core';

// ============================================================================
// gpu_nodes - Physical GPU node records
// ============================================================================

export const gpuNodes = pgTable('gpu_nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  gpuModel: text('gpu_model').notNull(),
  gpuCount: smallint('gpu_count').notNull(),
  vramPerGpuGB: smallint('vram_per_gpu_gb').notNull(),
  totalVramGB: smallint('total_vram_gb').notNull(),
  interconnect: text('interconnect').notNull(),
  cpuModel: text('cpu_model'),
  ramGB: integer('ram_gb'),
  storageTB: smallint('storage_tb'),
  networkBandwidthGbps: smallint('network_bandwidth_gbps'),
  datacenterName: text('datacenter_name').notNull(),
  datacenterTier: smallint('datacenter_tier').notNull(),
  datacenterLocation: text('datacenter_location').notNull(),
  datacenterCertifications: jsonb('datacenter_certifications').$type<string[]>(),
  powerCostPerKwh: numeric('power_cost_per_kwh'),
  tdpWatts: integer('tdp_watts'),
  benchmarkScore: integer('benchmark_score'),
  acquisitionCostUsd: numeric('acquisition_cost_usd').notNull(),
  acquisitionDate: timestamp('acquisition_date', { withTimezone: true }).notNull(),
  estimatedUsefulLifeMonths: smallint('estimated_useful_life_months').notNull(),
  depreciatedValueUsd: numeric('depreciated_value_usd'),
  status: text('status').notNull().default('registered'),
  verified: boolean('verified').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  lastVerificationCheck: timestamp('last_verification_check', { withTimezone: true }),
  vastMachineId: text('vast_machine_id'),
  tokenId: uuid('token_id'),
  onChainTokenId: text('on_chain_token_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('idx_gpu_nodes_org').on(table.orgId),
  statusIdx: index('idx_gpu_nodes_status').on(table.status),
  gpuModelIdx: index('idx_gpu_nodes_gpu_model').on(table.gpuModel),
  dcTierIdx: index('idx_gpu_nodes_dc_tier').on(table.datacenterTier),
  orgStatusIdx: index('idx_gpu_nodes_org_status').on(table.orgId, table.status),
  vastMachineIdx: uniqueIndex('idx_gpu_nodes_vast_machine').on(table.vastMachineId),
}));

// ============================================================================
// gpu_node_metrics - Time series metrics
// ============================================================================

export const gpuNodeMetrics = pgTable('gpu_node_metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  nodeId: uuid('node_id').notNull(),
  utilizationPercent: numeric('utilization_percent'),
  gpuTempCelsius: smallint('gpu_temp_celsius'),
  memUsedGB: numeric('mem_used_gb'),
  memTotalGB: numeric('mem_total_gb'),
  isOnline: boolean('is_online').notNull().default(true),
  spotPricePerHour: numeric('spot_price_per_hour'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nodeIdx: index('idx_gpu_node_metrics_node').on(table.nodeId),
  recordedAtIdx: index('idx_gpu_node_metrics_recorded_at').on(table.recordedAt),
  nodeRecordedIdx: index('idx_gpu_node_metrics_node_recorded').on(table.nodeId, table.recordedAt),
}));

// ============================================================================
// gpu_revenue_periods - Revenue tracking per period
// ============================================================================

export const gpuRevenuePeriods = pgTable('gpu_revenue_periods', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  nodeId: uuid('node_id').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  grossRevenueUsd: numeric('gross_revenue_usd').notNull(),
  electricityCostUsd: numeric('electricity_cost_usd').notNull(),
  platformFeeUsd: numeric('platform_fee_usd'),
  maintenanceReserveUsd: numeric('maintenance_reserve_usd'),
  insuranceCostUsd: numeric('insurance_cost_usd'),
  netRevenueUsd: numeric('net_revenue_usd'),
  hoursRented: numeric('hours_rented'),
  avgUtilizationPercent: numeric('avg_utilization_percent'),
  distributed: boolean('distributed').notNull().default(false),
  distributedAt: timestamp('distributed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('idx_gpu_revenue_org').on(table.orgId),
  nodeIdx: index('idx_gpu_revenue_node').on(table.nodeId),
  periodIdx: index('idx_gpu_revenue_period').on(table.periodStart, table.periodEnd),
  nodeOrgIdx: index('idx_gpu_revenue_node_org').on(table.nodeId, table.orgId),
}));

// ============================================================================
// gpu_distributions - Distribution records
// ============================================================================

export const gpuDistributions = pgTable('gpu_distributions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  nodeId: uuid('node_id').notNull(),
  revenuePeriodId: uuid('revenue_period_id').notNull(),
  totalDistributed: numeric('total_distributed').notNull(),
  tokenHolderCount: integer('token_holder_count'),
  distributionMethod: text('distribution_method').notNull().default('pro_rata'),
  txHash: text('tx_hash'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  orgIdx: index('idx_gpu_dist_org').on(table.orgId),
  nodeIdx: index('idx_gpu_dist_node').on(table.nodeId),
  revenuePeriodIdx: index('idx_gpu_dist_revenue_period').on(table.revenuePeriodId),
  statusIdx: index('idx_gpu_dist_status').on(table.status),
}));

// ============================================================================
// compute_listings - Marketplace listings
// ============================================================================

export const computeListings = pgTable('compute_listings', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  nodeId: uuid('node_id').notNull(),
  tokenSymbol: text('token_symbol').notNull(),
  tokenName: text('token_name').notNull(),
  totalSupply: numeric('total_supply').notNull(),
  pricePerToken: numeric('price_per_token').notNull(),
  currency: text('currency').notNull().default('USD'),
  annualizedYieldPercent: numeric('annualized_yield_percent'),
  totalRaisedUsd: numeric('total_raised_usd').default('0'),
  investorCount: integer('investor_count').default(0),
  isActive: boolean('is_active').notNull().default(true),
  listedAt: timestamp('listed_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('idx_compute_listings_org').on(table.orgId),
  nodeIdx: uniqueIndex('idx_compute_listings_node').on(table.nodeId),
  activeIdx: index('idx_compute_listings_active').on(table.isActive),
  symbolIdx: uniqueIndex('idx_compute_listings_symbol').on(table.tokenSymbol),
}));
