/**
 * Property Management Service
 *
 * Provides property management hooks/adapters for real estate tokenised assets:
 * - Unit tracking (tenants, leases, rent)
 * - Maintenance request lifecycle
 * - Expense recording and reporting
 * - Occupancy and summary analytics
 *
 * Tables are created lazily via rawQuery (not in the Drizzle schema).
 *
 * @packageDocumentation
 */

import { randomUUID } from 'crypto';
import { rawQuery, execStatement } from '../config/database.js';
import { logger } from '../middleware/logger.js';
import { AppError, ValidationError, NotFoundError } from '../middleware/errorHandler.js';

// ============================================================================
// TYPES
// ============================================================================

export type UnitType = 'studio' | 'apartment' | '1bed' | '2bed' | '3bed' | 'penthouse' | 'retail' | 'office' | 'warehouse' | 'other';
export type UnitStatus = 'vacant' | 'occupied' | 'maintenance' | 'reserved';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';
export type MaintenanceStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type ExpenseCategory = 'maintenance' | 'insurance' | 'tax' | 'utility' | 'management_fee' | 'legal' | 'marketing' | 'other';

export interface PropertyUnit {
  id: string;
  orgId: string;
  propertyAssetId: string;
  unitNumber: string;
  type: UnitType;
  area: number;
  tenantName: string | null;
  tenantEmail: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  monthlyRent: string | null;
  currency: string;
  status: UnitStatus;
  metadata: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddUnitInput {
  propertyAssetId: string;
  unitNumber: string;
  type: UnitType;
  area: number;
  tenantName?: string;
  tenantEmail?: string;
  leaseStart?: string;
  leaseEnd?: string;
  monthlyRent?: string;
  currency?: string;
  status?: UnitStatus;
  metadata?: Record<string, unknown>;
}

export interface MaintenanceRequest {
  id: string;
  orgId: string;
  propertyAssetId: string;
  unitId: string | null;
  category: string;
  priority: MaintenancePriority;
  description: string;
  status: MaintenanceStatus;
  assignee: string | null;
  estimatedCost: string | null;
  actualCost: string | null;
  currency: string;
  completedAt: string | null;
  metadata: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceInput {
  propertyAssetId: string;
  unitId?: string;
  category: string;
  priority: MaintenancePriority;
  description: string;
  assignee?: string;
  estimatedCost?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface PropertyExpense {
  id: string;
  orgId: string;
  propertyAssetId: string;
  category: ExpenseCategory;
  amount: string;
  currency: string;
  description: string | null;
  vendor: string | null;
  invoiceRef: string | null;
  paidAt: string | null;
  period: string | null;
  metadata: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecordExpenseInput {
  propertyAssetId: string;
  category: ExpenseCategory;
  amount: string;
  currency?: string;
  description?: string;
  vendor?: string;
  invoiceRef?: string;
  paidAt?: string;
  period?: string;
  metadata?: Record<string, unknown>;
}

export interface MaintenanceFilters {
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
}

export interface ExpenseFilters {
  category?: ExpenseCategory;
  from?: string;
  to?: string;
}

export interface PropertySummary {
  assetId: string;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  maintenanceUnits: number;
  reservedUnits: number;
  occupancyRate: number;
  totalMonthlyRent: number;
  maintenanceOpen: number;
  maintenanceInProgress: number;
  maintenanceCompleted: number;
  totalExpenses: number;
  expenseCurrency: string;
}

// ============================================================================
// SCHEMA INITIALISATION
// ============================================================================

let tablesInitialised = false;

export async function ensureTables(): Promise<void> {
  if (tablesInitialised) return;

  try {
    await execStatement(`
      CREATE TABLE IF NOT EXISTS property_units (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        property_asset_id TEXT NOT NULL,
        unit_number TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'apartment',
        area REAL NOT NULL DEFAULT 0,
        tenant_name TEXT,
        tenant_email TEXT,
        lease_start TEXT,
        lease_end TEXT,
        monthly_rent TEXT,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'vacant',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await execStatement(`CREATE INDEX IF NOT EXISTS idx_prop_units_org_asset ON property_units(org_id, property_asset_id)`);
    await execStatement(`CREATE UNIQUE INDEX IF NOT EXISTS idx_prop_units_number ON property_units(org_id, property_asset_id, unit_number)`);

    await execStatement(`
      CREATE TABLE IF NOT EXISTS maintenance_requests (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        property_asset_id TEXT NOT NULL,
        unit_id TEXT,
        category TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        assignee TEXT,
        estimated_cost TEXT,
        actual_cost TEXT,
        currency TEXT NOT NULL DEFAULT 'USD',
        completed_at TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await execStatement(`CREATE INDEX IF NOT EXISTS idx_maint_req_org_asset ON maintenance_requests(org_id, property_asset_id)`);
    await execStatement(`CREATE INDEX IF NOT EXISTS idx_maint_req_status ON maintenance_requests(org_id, status)`);

    await execStatement(`
      CREATE TABLE IF NOT EXISTS property_expenses (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        property_asset_id TEXT NOT NULL,
        category TEXT NOT NULL,
        amount TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        description TEXT,
        vendor TEXT,
        invoice_ref TEXT,
        paid_at TEXT,
        period TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await execStatement(`CREATE INDEX IF NOT EXISTS idx_prop_exp_org_asset ON property_expenses(org_id, property_asset_id)`);
    await execStatement(`CREATE INDEX IF NOT EXISTS idx_prop_exp_category ON property_expenses(org_id, category)`);

    tablesInitialised = true;
    logger.info('Property management tables initialised');
  } catch (error) {
    logger.error('Failed to initialise property management tables', { error: error as Error });
    throw error;
  }
}

// ============================================================================
// UNIT MANAGEMENT
// ============================================================================

export async function addUnit(orgId: string, input: AddUnitInput): Promise<PropertyUnit> {
  await ensureTables();

  if (!input.propertyAssetId) throw new ValidationError('propertyAssetId is required');
  if (!input.unitNumber) throw new ValidationError('unitNumber is required');
  if (!input.type) throw new ValidationError('type is required');
  if (input.area == null || input.area < 0) throw new ValidationError('area must be a non-negative number');

  const id = randomUUID();
  const now = new Date().toISOString();
  const status = input.status ?? 'vacant';
  const currency = input.currency ?? 'USD';
  const metadata = JSON.stringify(input.metadata ?? {});

  await execStatement(
    `INSERT INTO property_units (id, org_id, property_asset_id, unit_number, type, area, tenant_name, tenant_email, lease_start, lease_end, monthly_rent, currency, status, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [id, orgId, input.propertyAssetId, input.unitNumber, input.type, input.area,
     input.tenantName ?? null, input.tenantEmail ?? null, input.leaseStart ?? null,
     input.leaseEnd ?? null, input.monthlyRent ?? null, currency, status, metadata, now, now]
  );

  logger.info('Property unit added', { orgId, unitId: id, assetId: input.propertyAssetId, unitNumber: input.unitNumber });

  const rows = await rawQuery<PropertyUnit>(`SELECT * FROM property_units WHERE id = $1`, [id]);
  return mapUnit(rows[0]);
}

export async function listUnits(orgId: string, assetId: string): Promise<PropertyUnit[]> {
  await ensureTables();
  if (!assetId) throw new ValidationError('assetId is required');

  const rows = await rawQuery<any>(
    `SELECT * FROM property_units WHERE org_id = $1 AND property_asset_id = $2 ORDER BY unit_number ASC`,
    [orgId, assetId]
  );
  logger.debug('Listed property units', { orgId, assetId, count: rows.length });
  return rows.map(mapUnit);
}

export async function updateUnit(orgId: string, unitId: string, updates: Partial<AddUnitInput>): Promise<PropertyUnit> {
  await ensureTables();
  if (!unitId) throw new ValidationError('unitId is required');

  const existing = await rawQuery<any>(`SELECT * FROM property_units WHERE id = $1 AND org_id = $2`, [unitId, orgId]);
  if (!existing.length) throw new NotFoundError('Property unit not found');

  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;

  const maybeSet = (col: string, val: any) => {
    if (val !== undefined) {
      fields.push(`${col} = $${idx++}`);
      params.push(val);
    }
  };

  maybeSet('unit_number', updates.unitNumber);
  maybeSet('type', updates.type);
  maybeSet('area', updates.area);
  maybeSet('tenant_name', updates.tenantName);
  maybeSet('tenant_email', updates.tenantEmail);
  maybeSet('lease_start', updates.leaseStart);
  maybeSet('lease_end', updates.leaseEnd);
  maybeSet('monthly_rent', updates.monthlyRent);
  maybeSet('currency', updates.currency);
  maybeSet('status', updates.status);
  if (updates.metadata !== undefined) {
    maybeSet('metadata', JSON.stringify(updates.metadata));
  }

  if (!fields.length) throw new ValidationError('No fields to update');

  fields.push(`updated_at = $${idx++}`);
  params.push(new Date().toISOString());
  params.push(unitId);
  params.push(orgId);

  await execStatement(
    `UPDATE property_units SET ${fields.join(', ')} WHERE id = $${idx++} AND org_id = $${idx}`,
    params
  );

  logger.info('Property unit updated', { orgId, unitId });
  const rows = await rawQuery<any>(`SELECT * FROM property_units WHERE id = $1 AND org_id = $2`, [unitId, orgId]);
  return mapUnit(rows[0]);
}

// ============================================================================
// MAINTENANCE REQUESTS
// ============================================================================

export async function createMaintenanceRequest(orgId: string, input: CreateMaintenanceInput): Promise<MaintenanceRequest> {
  await ensureTables();

  if (!input.propertyAssetId) throw new ValidationError('propertyAssetId is required');
  if (!input.category) throw new ValidationError('category is required');
  if (!input.description) throw new ValidationError('description is required');
  if (!input.priority) throw new ValidationError('priority is required');

  const id = randomUUID();
  const now = new Date().toISOString();
  const currency = input.currency ?? 'USD';
  const metadata = JSON.stringify(input.metadata ?? {});

  await execStatement(
    `INSERT INTO maintenance_requests (id, org_id, property_asset_id, unit_id, category, priority, description, status, assignee, estimated_cost, currency, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [id, orgId, input.propertyAssetId, input.unitId ?? null, input.category, input.priority,
     input.description, 'open', input.assignee ?? null, input.estimatedCost ?? null,
     currency, metadata, now, now]
  );

  logger.info('Maintenance request created', { orgId, requestId: id, assetId: input.propertyAssetId, priority: input.priority });

  const rows = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id = $1`, [id]);
  return mapMaintenance(rows[0]);
}

export async function listMaintenanceRequests(
  orgId: string,
  assetId: string,
  filters?: MaintenanceFilters
): Promise<MaintenanceRequest[]> {
  await ensureTables();
  if (!assetId) throw new ValidationError('assetId is required');

  let query = `SELECT * FROM maintenance_requests WHERE org_id = $1 AND property_asset_id = $2`;
  const params: any[] = [orgId, assetId];
  let idx = 3;

  if (filters?.status) {
    query += ` AND status = $${idx++}`;
    params.push(filters.status);
  }
  if (filters?.priority) {
    query += ` AND priority = $${idx++}`;
    params.push(filters.priority);
  }

  query += ` ORDER BY created_at DESC`;

  const rows = await rawQuery<any>(query, params);
  logger.debug('Listed maintenance requests', { orgId, assetId, count: rows.length });
  return rows.map(mapMaintenance);
}

export async function updateMaintenanceRequest(
  orgId: string,
  requestId: string,
  updates: Partial<Pick<MaintenanceRequest, 'status' | 'assignee' | 'actualCost' | 'priority'>>
): Promise<MaintenanceRequest> {
  await ensureTables();
  if (!requestId) throw new ValidationError('requestId is required');

  const existing = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id = $1 AND org_id = $2`, [requestId, orgId]);
  if (!existing.length) throw new NotFoundError('Maintenance request not found');

  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;

  const maybeSet = (col: string, val: any) => {
    if (val !== undefined) {
      fields.push(`${col} = $${idx++}`);
      params.push(val);
    }
  };

  maybeSet('status', updates.status);
  maybeSet('assignee', updates.assignee);
  maybeSet('actual_cost', updates.actualCost);
  maybeSet('priority', updates.priority);

  if (updates.status === 'completed') {
    fields.push(`completed_at = $${idx++}`);
    params.push(new Date().toISOString());
  }

  if (!fields.length) throw new ValidationError('No fields to update');

  fields.push(`updated_at = $${idx++}`);
  params.push(new Date().toISOString());
  params.push(requestId);
  params.push(orgId);

  await execStatement(
    `UPDATE maintenance_requests SET ${fields.join(', ')} WHERE id = $${idx++} AND org_id = $${idx}`,
    params
  );

  logger.info('Maintenance request updated', { orgId, requestId, status: updates.status });
  const rows = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id = $1 AND org_id = $2`, [requestId, orgId]);
  return mapMaintenance(rows[0]);
}

// ============================================================================
// EXPENSE TRACKING
// ============================================================================

export async function recordExpense(orgId: string, input: RecordExpenseInput): Promise<PropertyExpense> {
  await ensureTables();

  if (!input.propertyAssetId) throw new ValidationError('propertyAssetId is required');
  if (!input.category) throw new ValidationError('category is required');
  if (!input.amount) throw new ValidationError('amount is required');

  const id = randomUUID();
  const now = new Date().toISOString();
  const currency = input.currency ?? 'USD';
  const metadata = JSON.stringify(input.metadata ?? {});

  await execStatement(
    `INSERT INTO property_expenses (id, org_id, property_asset_id, category, amount, currency, description, vendor, invoice_ref, paid_at, period, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [id, orgId, input.propertyAssetId, input.category, input.amount, currency,
     input.description ?? null, input.vendor ?? null, input.invoiceRef ?? null,
     input.paidAt ?? null, input.period ?? null, metadata, now, now]
  );

  logger.info('Property expense recorded', { orgId, expenseId: id, assetId: input.propertyAssetId, category: input.category, amount: input.amount });

  const rows = await rawQuery<any>(`SELECT * FROM property_expenses WHERE id = $1`, [id]);
  return mapExpense(rows[0]);
}

export async function listExpenses(
  orgId: string,
  assetId: string,
  filters?: ExpenseFilters
): Promise<PropertyExpense[]> {
  await ensureTables();
  if (!assetId) throw new ValidationError('assetId is required');

  let query = `SELECT * FROM property_expenses WHERE org_id = $1 AND property_asset_id = $2`;
  const params: any[] = [orgId, assetId];
  let idx = 3;

  if (filters?.category) {
    query += ` AND category = $${idx++}`;
    params.push(filters.category);
  }
  if (filters?.from) {
    query += ` AND (paid_at >= $${idx++} OR created_at >= $${idx - 1})`;
    params.push(filters.from);
  }
  if (filters?.to) {
    query += ` AND (paid_at <= $${idx++} OR created_at <= $${idx - 1})`;
    params.push(filters.to);
  }

  query += ` ORDER BY created_at DESC`;

  const rows = await rawQuery<any>(query, params);
  logger.debug('Listed property expenses', { orgId, assetId, count: rows.length });
  return rows.map(mapExpense);
}

// ============================================================================
// ANALYTICS
// ============================================================================

export async function getPropertySummary(orgId: string, assetId: string): Promise<PropertySummary> {
  await ensureTables();
  if (!assetId) throw new ValidationError('assetId is required');

  // Unit stats
  const unitStats = await rawQuery<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied,
       SUM(CASE WHEN status = 'vacant' THEN 1 ELSE 0 END) AS vacant,
       SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS in_maintenance,
       SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) AS reserved,
       COALESCE(SUM(CASE WHEN status = 'occupied' AND monthly_rent IS NOT NULL THEN CAST(monthly_rent AS REAL) ELSE 0 END), 0) AS total_rent
     FROM property_units
     WHERE org_id = $1 AND property_asset_id = $2`,
    [orgId, assetId]
  );

  // Maintenance stats
  const maintStats = await rawQuery<any>(
    `SELECT
       SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
       SUM(CASE WHEN status IN ('assigned', 'in_progress') THEN 1 ELSE 0 END) AS in_progress_count,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count
     FROM maintenance_requests
     WHERE org_id = $1 AND property_asset_id = $2`,
    [orgId, assetId]
  );

  // Expense totals
  const expStats = await rawQuery<any>(
    `SELECT
       COALESCE(SUM(CAST(amount AS REAL)), 0) AS total_amount,
       COALESCE(MIN(currency), 'USD') AS currency
     FROM property_expenses
     WHERE org_id = $1 AND property_asset_id = $2`,
    [orgId, assetId]
  );

  const u = unitStats[0] || {};
  const m = maintStats[0] || {};
  const e = expStats[0] || {};
  const total = Number(u.total || 0);
  const occupied = Number(u.occupied || 0);

  const summary: PropertySummary = {
    assetId,
    totalUnits: total,
    occupiedUnits: occupied,
    vacantUnits: Number(u.vacant || 0),
    maintenanceUnits: Number(u.in_maintenance || 0),
    reservedUnits: Number(u.reserved || 0),
    occupancyRate: total > 0 ? Math.round((occupied / total) * 10000) / 100 : 0,
    totalMonthlyRent: Number(u.total_rent || 0),
    maintenanceOpen: Number(m.open_count || 0),
    maintenanceInProgress: Number(m.in_progress_count || 0),
    maintenanceCompleted: Number(m.completed_count || 0),
    totalExpenses: Number(e.total_amount || 0),
    expenseCurrency: e.currency || 'USD',
  };

  logger.info('Property summary generated', { orgId, assetId, totalUnits: summary.totalUnits, occupancyRate: summary.occupancyRate });
  return summary;
}

export async function getOccupancyRate(orgId: string, assetId: string): Promise<{ assetId: string; occupancyRate: number; occupied: number; total: number }> {
  await ensureTables();
  if (!assetId) throw new ValidationError('assetId is required');

  const rows = await rawQuery<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied
     FROM property_units
     WHERE org_id = $1 AND property_asset_id = $2`,
    [orgId, assetId]
  );

  const total = Number(rows[0]?.total || 0);
  const occupied = Number(rows[0]?.occupied || 0);
  const occupancyRate = total > 0 ? Math.round((occupied / total) * 10000) / 100 : 0;

  logger.debug('Occupancy rate computed', { orgId, assetId, occupancyRate });
  return { assetId, occupancyRate, occupied, total };
}

// ============================================================================
// ROW MAPPERS (snake_case DB rows -> camelCase typed objects)
// ============================================================================

function mapUnit(row: any): PropertyUnit {
  return {
    id: row.id,
    orgId: row.org_id,
    propertyAssetId: row.property_asset_id,
    unitNumber: row.unit_number,
    type: row.type,
    area: Number(row.area),
    tenantName: row.tenant_name,
    tenantEmail: row.tenant_email,
    leaseStart: row.lease_start,
    leaseEnd: row.lease_end,
    monthlyRent: row.monthly_rent,
    currency: row.currency,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMaintenance(row: any): MaintenanceRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    propertyAssetId: row.property_asset_id,
    unitId: row.unit_id,
    category: row.category,
    priority: row.priority,
    description: row.description,
    status: row.status,
    assignee: row.assignee,
    estimatedCost: row.estimated_cost,
    actualCost: row.actual_cost,
    currency: row.currency,
    completedAt: row.completed_at,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExpense(row: any): PropertyExpense {
  return {
    id: row.id,
    orgId: row.org_id,
    propertyAssetId: row.property_asset_id,
    category: row.category,
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    vendor: row.vendor,
    invoiceRef: row.invoice_ref,
    paidAt: row.paid_at,
    period: row.period,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
