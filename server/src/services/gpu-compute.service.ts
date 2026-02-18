/**
 * GPU Compute Service
 *
 * Business logic for GPU node management, verification, tokenization,
 * revenue tracking, and marketplace operations.
 */

import crypto from 'crypto';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { db, execStatement } from '../config/database.js';
import { gpuNodes, gpuNodeMetrics, gpuRevenuePeriods, gpuDistributions, computeListings } from '../db/gpu-compute.schema.js';

// SQLite compatibility: convert values that PG handles natively but SQLite cannot bind
function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : d;
}
function toJson(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

// ============================================================================
// GPU Node CRUD
// ============================================================================

export async function createGPUNode(orgId: string, data: {
  gpuModel: string; gpuCount: number; vramPerGpuGB: number; interconnect: string;
  cpuModel?: string; ramGB?: number; storageTB?: number; networkBandwidthGbps?: number;
  datacenterName: string; datacenterTier: number; datacenterLocation: string;
  datacenterCertifications?: string[]; powerCostPerKwh?: string;
  tdpWatts?: number; benchmarkScore?: number;
  acquisitionCostUsd: string; acquisitionDate: string; estimatedUsefulLifeMonths: number;
  vastMachineId?: string; metadata?: Record<string, unknown>;
}) {

  const totalVramGB = data.gpuCount * data.vramPerGpuGB;

  // Use raw SQL insert to bypass PG column type serializers (timestamp, jsonb, boolean)
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await execStatement(
    `INSERT INTO gpu_nodes (
      id, org_id, gpu_model, gpu_count, vram_per_gpu_gb, total_vram_gb, interconnect,
      cpu_model, ram_gb, storage_tb, network_bandwidth_gbps,
      datacenter_name, datacenter_tier, datacenter_location, datacenter_certifications,
      power_cost_per_kwh, tdp_watts, benchmark_score,
      acquisition_cost_usd, acquisition_date, estimated_useful_life_months,
      vast_machine_id, metadata, status, verified, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, orgId, data.gpuModel, data.gpuCount, data.vramPerGpuGB, totalVramGB, data.interconnect,
     data.cpuModel ?? null, data.ramGB ?? null, data.storageTB ?? null, data.networkBandwidthGbps ?? null,
     data.datacenterName, data.datacenterTier, data.datacenterLocation, toJson(data.datacenterCertifications),
     data.powerCostPerKwh ?? null, data.tdpWatts ?? null, data.benchmarkScore ?? null,
     data.acquisitionCostUsd, data.acquisitionDate, data.estimatedUsefulLifeMonths,
     data.vastMachineId ?? null, toJson(data.metadata), 'registered', 0, now, now]
  );

  const [node] = await db.select().from(gpuNodes).where(eq(gpuNodes.id, id));

  return node;
}

export async function getGPUNode(orgId: string, nodeId: string) {

  const [node] = await db.select().from(gpuNodes)
    .where(and(eq(gpuNodes.id, nodeId), eq(gpuNodes.orgId, orgId)));
  return node || null;
}

export async function listGPUNodes(orgId: string, filters: {
  status?: string; gpuModel?: string; datacenterTier?: number;
  page?: number; limit?: number;
} = {}) {

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [eq(gpuNodes.orgId, orgId)];
  if (filters.status) conditions.push(eq(gpuNodes.status, filters.status));
  if (filters.gpuModel) conditions.push(eq(gpuNodes.gpuModel, filters.gpuModel));
  if (filters.datacenterTier) conditions.push(eq(gpuNodes.datacenterTier, filters.datacenterTier));

  const nodes = await db.select().from(gpuNodes)
    .where(and(...conditions))
    .orderBy(desc(gpuNodes.createdAt))
    .limit(limit).offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(gpuNodes)
    .where(and(...conditions));

  return { data: nodes, total: Number(count), page, limit };
}

export async function updateGPUNode(orgId: string, nodeId: string, data: Record<string, unknown>) {
  // Build raw SQL SET clause to bypass PG column type serializers
  const now = new Date().toISOString();
  const entries = Object.entries(data);
  // Map camelCase keys to snake_case column names
  const toSnake = (s: string) => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
  const setClauses = entries.map(([k]) => `${toSnake(k)} = ?`).join(', ');
  const values = entries.map(([, v]) => {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v !== null && typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  values.push(now); // for updated_at

  const rawSql = `UPDATE gpu_nodes SET ${setClauses}, updated_at = ? WHERE id = ? AND org_id = ?`;
  const allValues = [...values, nodeId, orgId];

  await execStatement(rawSql, allValues);

  const [node] = await db.select().from(gpuNodes)
    .where(and(eq(gpuNodes.id, nodeId), eq(gpuNodes.orgId, orgId)));
  return node || null;
}

export async function decommissionGPUNode(orgId: string, nodeId: string) {
  return updateGPUNode(orgId, nodeId, { status: 'decommissioned' });
}

// ============================================================================
// Verification
// ============================================================================

export async function requestVerification(orgId: string, nodeId: string) {
  return updateGPUNode(orgId, nodeId, { status: 'pending_verification' });
}

export async function completeVerification(orgId: string, nodeId: string, passed: boolean) {
  const now = new Date();
  return updateGPUNode(orgId, nodeId, {
    status: passed ? 'verified' : 'registered',
    verified: passed,
    verifiedAt: passed ? now : null,
    lastVerificationCheck: now,
  });
}

// ============================================================================
// Tokenization
// ============================================================================

export async function tokenizeNode(orgId: string, nodeId: string, tokenConfig: {
  tokenSymbol: string; tokenName: string; totalSupply: string; pricePerToken: string;
}) {

  // Update node status
  await updateGPUNode(orgId, nodeId, { status: 'active' });

  // Create marketplace listing via raw SQL (bypass PG column type serializers)
  const listingId = crypto.randomUUID();
  const listNow = new Date().toISOString();
  await execStatement(
    `INSERT INTO compute_listings (id, org_id, node_id, token_symbol, token_name, total_supply, price_per_token, is_active, listed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [listingId, orgId, nodeId, tokenConfig.tokenSymbol, tokenConfig.tokenName, tokenConfig.totalSupply, tokenConfig.pricePerToken, listNow, listNow]
  );

  const [listing] = await db.select().from(computeListings).where(eq(computeListings.id, listingId));
  return listing;
}

export async function getNodeToken(orgId: string, nodeId: string) {

  const [listing] = await db.select().from(computeListings)
    .where(and(eq(computeListings.nodeId, nodeId), eq(computeListings.orgId, orgId)));
  return listing || null;
}

// ============================================================================
// Metrics
// ============================================================================

export async function recordNodeMetrics(nodeId: string, metrics: {
  utilizationPercent?: string; gpuTempCelsius?: number;
  memUsedGB?: string; memTotalGB?: string; isOnline: boolean; spotPricePerHour?: string;
}) {

  const metricId = crypto.randomUUID();
  const metricNow = new Date().toISOString();
  await execStatement(
    `INSERT INTO gpu_node_metrics (id, node_id, utilization_percent, gpu_temp_celsius, mem_used_gb, mem_total_gb, is_online, spot_price_per_hour, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [metricId, nodeId, metrics.utilizationPercent ?? null, metrics.gpuTempCelsius ?? null, metrics.memUsedGB ?? null, metrics.memTotalGB ?? null, metrics.isOnline ? 1 : 0, metrics.spotPricePerHour ?? null, metricNow]
  );
  const [record] = await db.select().from(gpuNodeMetrics).where(eq(gpuNodeMetrics.id, metricId));
  return record;
}

export async function getNodeMetrics(nodeId: string, limit = 100) {

  return db.select().from(gpuNodeMetrics)
    .where(eq(gpuNodeMetrics.nodeId, nodeId))
    .orderBy(desc(gpuNodeMetrics.recordedAt))
    .limit(limit);
}

// ============================================================================
// Revenue
// ============================================================================

export async function recordRevenuePeriod(orgId: string, nodeId: string, data: {
  grossRevenueUsd: string; electricityCostUsd: string;
  periodStart: string; periodEnd: string;
  hoursRented?: string; avgUtilizationPercent?: string;
}) {

  const gross = parseFloat(data.grossRevenueUsd);
  const electricity = parseFloat(data.electricityCostUsd);
  const afterElectricity = gross - electricity;
  const platformFee = afterElectricity * 0.10;
  const maintenanceReserve = afterElectricity * 0.05;
  const insurance = afterElectricity * 0.02;
  const netRevenue = afterElectricity - platformFee - maintenanceReserve - insurance;

  const revId = crypto.randomUUID();
  const revNow = new Date().toISOString();
  await execStatement(
    `INSERT INTO gpu_revenue_periods (id, org_id, node_id, period_start, period_end, gross_revenue_usd, electricity_cost_usd, platform_fee_usd, maintenance_reserve_usd, insurance_cost_usd, net_revenue_usd, hours_rented, avg_utilization_percent, distributed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [revId, orgId, nodeId, data.periodStart, data.periodEnd, data.grossRevenueUsd, data.electricityCostUsd, platformFee.toFixed(2), maintenanceReserve.toFixed(2), insurance.toFixed(2), netRevenue.toFixed(2), data.hoursRented ?? null, data.avgUtilizationPercent ?? null, revNow]
  );

  const [period] = await db.select().from(gpuRevenuePeriods).where(eq(gpuRevenuePeriods.id, revId));
  return period;
}

export async function getNodeRevenue(orgId: string, nodeId: string, period?: { start?: string; end?: string }) {

  const conditions = [eq(gpuRevenuePeriods.nodeId, nodeId), eq(gpuRevenuePeriods.orgId, orgId)];
  if (period?.start) conditions.push(gte(gpuRevenuePeriods.periodStart, period.start as any));
  if (period?.end) conditions.push(lte(gpuRevenuePeriods.periodEnd, period.end as any));

  return db.select().from(gpuRevenuePeriods)
    .where(and(...conditions))
    .orderBy(desc(gpuRevenuePeriods.periodStart));
}

export async function getNodeRevenueSummary(orgId: string, nodeId: string) {

  const [summary] = await db.select({
    totalGross: sql<string>`coalesce(sum(CAST(${gpuRevenuePeriods.grossRevenueUsd} AS REAL)), 0)`,
    totalNet: sql<string>`coalesce(sum(CAST(${gpuRevenuePeriods.netRevenueUsd} AS REAL)), 0)`,
    periodCount: sql<number>`count(*)`,
    avgUtilization: sql<string>`coalesce(avg(CAST(${gpuRevenuePeriods.avgUtilizationPercent} AS REAL)), 0)`,
  }).from(gpuRevenuePeriods)
    .where(and(eq(gpuRevenuePeriods.nodeId, nodeId), eq(gpuRevenuePeriods.orgId, orgId)));

  return summary;
}

// ============================================================================
// Distribution
// ============================================================================

export async function distributeRevenue(orgId: string, nodeId: string, revenuePeriodId: string) {

  const [period] = await db.select().from(gpuRevenuePeriods)
    .where(and(eq(gpuRevenuePeriods.id, revenuePeriodId), eq(gpuRevenuePeriods.orgId, orgId)));

  if (!period || period.distributed) return null;

  // Mark period as distributed
  const distNow = new Date().toISOString();
  await execStatement('UPDATE gpu_revenue_periods SET distributed = 1, distributed_at = ? WHERE id = ?', [distNow, revenuePeriodId]);

  // Create distribution record
  const distId = crypto.randomUUID();
  await execStatement(
    `INSERT INTO gpu_distributions (id, org_id, node_id, revenue_period_id, total_distributed, distribution_method, status, completed_at, created_at) VALUES (?, ?, ?, ?, ?, 'pro_rata', 'completed', ?, ?)`,
    [distId, orgId, nodeId, revenuePeriodId, period.netRevenueUsd || '0', distNow, distNow]
  );

  const [distribution] = await db.select().from(gpuDistributions).where(eq(gpuDistributions.id, distId));
  return distribution;
}

export async function getDistributions(orgId: string, nodeId: string) {

  return db.select().from(gpuDistributions)
    .where(and(eq(gpuDistributions.nodeId, nodeId), eq(gpuDistributions.orgId, orgId)))
    .orderBy(desc(gpuDistributions.createdAt));
}

// ============================================================================
// Marketplace
// ============================================================================

export async function listComputeMarket(filters: {
  gpuModel?: string; minYield?: number; maxPrice?: number;
  datacenterTier?: number; sort?: string; page?: number; limit?: number;
} = {}) {

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;

  // Build filter conditions
  const conditions = [eq(computeListings.isActive, 1 as any)];
  if (filters.gpuModel) conditions.push(eq(gpuNodes.gpuModel, filters.gpuModel));
  if (filters.datacenterTier) conditions.push(eq(gpuNodes.datacenterTier, filters.datacenterTier));
  if (filters.maxPrice) conditions.push(lte(computeListings.pricePerToken, String(filters.maxPrice)));
  if (filters.minYield) conditions.push(gte(computeListings.annualizedYieldPercent, String(filters.minYield)));

  // Determine sort order
  let orderClause;
  switch (filters.sort) {
    case 'yield': orderClause = desc(computeListings.annualizedYieldPercent); break;
    case 'price': orderClause = desc(computeListings.pricePerToken); break;
    case 'newest': orderClause = desc(computeListings.listedAt); break;
    default: orderClause = desc(computeListings.listedAt);
  }

  // Join listings with nodes for full marketplace view
  const listings = await db.select({
    listing: computeListings,
    node: gpuNodes,
  })
    .from(computeListings)
    .innerJoin(gpuNodes, eq(computeListings.nodeId, gpuNodes.id))
    .where(and(...conditions))
    .orderBy(orderClause)
    .limit(limit).offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` })
    .from(computeListings)
    .innerJoin(gpuNodes, eq(computeListings.nodeId, gpuNodes.id))
    .where(and(...conditions));

  return {
    data: listings.map((l: { listing: typeof computeListings.$inferSelect; node: typeof gpuNodes.$inferSelect }) => ({ ...l.listing, node: l.node })),
    total: Number(count),
    page, limit,
  };
}

export async function getMarketAnalytics() {

  const [stats] = await db.select({
    totalNodes: sql<number>`count(*)`,
    totalGpus: sql<number>`coalesce(sum(${gpuNodes.gpuCount}), 0)`,
    totalVramTB: sql<string>`coalesce(sum(CAST(${gpuNodes.totalVramGB} AS REAL)) / 1000, 0)`,
    avgAcquisitionCost: sql<string>`coalesce(avg(CAST(${gpuNodes.acquisitionCostUsd} AS REAL)), 0)`,
  }).from(gpuNodes).where(eq(gpuNodes.status, 'active'));

  const modelBreakdown = await db.select({
    gpuModel: gpuNodes.gpuModel,
    count: sql<number>`count(*)`,
    totalGpus: sql<number>`sum(${gpuNodes.gpuCount})`,
    totalVram: sql<number>`sum(${gpuNodes.totalVramGB})`,
  }).from(gpuNodes)
    .where(eq(gpuNodes.status, 'active'))
    .groupBy(gpuNodes.gpuModel);

  return { ...stats, modelBreakdown };
}
