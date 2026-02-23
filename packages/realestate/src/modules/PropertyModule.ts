/**
 * PropertyModule - SDK module for property management operations.
 *
 * Provides unit management, maintenance request lifecycle,
 * expense recording, and property analytics.
 *
 * Server routes are mounted at /api/v1/properties.
 */

import type { HttpClient } from '@tokenisation/core';
import { parseOrThrow, propertyUnitInputSchema, maintenanceRequestInputSchema, expenseInputSchema } from '../validation/real-estate.js';

// ============================================================================
// Types
// ============================================================================

export type UnitType = 'studio' | 'apartment' | '1bed' | '2bed' | '3bed' | 'penthouse' | 'retail' | 'office' | 'warehouse' | 'other';
export type UnitStatus = 'vacant' | 'occupied' | 'maintenance' | 'reserved';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';
export type MaintenanceStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type ExpenseCategory = 'maintenance' | 'insurance' | 'tax' | 'utility' | 'management_fee' | 'legal' | 'marketing' | 'other';

export interface PropertyUnit {
  id: string;
  propertyAssetId: string;
  unitNumber: string;
  type: UnitType;
  area: number;
  tenantName?: string;
  tenantEmail?: string;
  leaseStart?: string;
  leaseEnd?: string;
  monthlyRent?: string;
  currency: string;
  status: UnitStatus;
  metadata?: Record<string, unknown>;
}

export interface MaintenanceRequest {
  id: string;
  propertyAssetId: string;
  unitId?: string;
  category: string;
  priority: MaintenancePriority;
  description: string;
  status: MaintenanceStatus;
  assignee?: string;
  estimatedCost?: string;
  actualCost?: string;
  currency: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PropertyExpense {
  id: string;
  propertyAssetId: string;
  category: ExpenseCategory;
  amount: string;
  currency: string;
  description?: string;
  vendor?: string;
  invoiceRef?: string;
  paidAt?: string;
  period?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PropertySummary {
  assetId: string;
  totalUnits: number;
  occupiedUnits: number;
  totalMonthlyRent: string;
  totalExpenses: string;
  openMaintenanceRequests: number;
}

export interface OccupancyRate {
  assetId: string;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
}

// ============================================================================
// Module
// ============================================================================

export class PropertyModule {
  constructor(private http: HttpClient) {}

  // ---- Units ----

  /**
   * Add a unit to a property.
   */
  async addUnit(assetId: string, input: {
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
  }): Promise<PropertyUnit> {
    const validated = parseOrThrow(propertyUnitInputSchema, input, 'AddUnit');
    const response = await this.http.post<{ unit: PropertyUnit }>(
      `/api/v1/properties/${encodeURIComponent(assetId)}/units`,
      validated,
    );
    return response.data.unit;
  }

  /**
   * List all units for a property.
   */
  async listUnits(assetId: string): Promise<PropertyUnit[]> {
    const response = await this.http.get<{ units: PropertyUnit[]; count: number }>(
      `/api/v1/properties/${encodeURIComponent(assetId)}/units`,
    );
    return response.data.units;
  }

  /**
   * Update a property unit.
   */
  async updateUnit(assetId: string, unitId: string, input: {
    unitNumber?: string;
    type?: UnitType;
    area?: number;
    tenantName?: string | null;
    tenantEmail?: string | null;
    leaseStart?: string | null;
    leaseEnd?: string | null;
    monthlyRent?: string | null;
    currency?: string;
    status?: UnitStatus;
    metadata?: Record<string, unknown>;
  }): Promise<PropertyUnit> {
    const response = await this.http.patch<{ unit: PropertyUnit }>(
      `/api/v1/properties/${encodeURIComponent(assetId)}/units/${encodeURIComponent(unitId)}`,
      input,
    );
    return response.data.unit;
  }

  // ---- Maintenance ----

  /**
   * Create a maintenance request.
   */
  async createMaintenanceRequest(assetId: string, input: {
    unitId?: string;
    category: string;
    priority: MaintenancePriority;
    description: string;
    assignee?: string;
    estimatedCost?: string;
    currency?: string;
    metadata?: Record<string, unknown>;
  }): Promise<MaintenanceRequest> {
    const validated = parseOrThrow(maintenanceRequestInputSchema, input, 'CreateMaintenanceRequest');
    const response = await this.http.post<{ request: MaintenanceRequest }>(
      `/api/v1/properties/${encodeURIComponent(assetId)}/maintenance`,
      validated,
    );
    return response.data.request;
  }

  /**
   * List maintenance requests for a property.
   */
  async listMaintenanceRequests(assetId: string, params?: {
    status?: MaintenanceStatus;
    priority?: MaintenancePriority;
  }): Promise<MaintenanceRequest[]> {
    const response = await this.http.get<{ requests: MaintenanceRequest[]; count: number }>(
      `/api/v1/properties/${encodeURIComponent(assetId)}/maintenance`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data.requests;
  }

  /**
   * Update a maintenance request.
   */
  async updateMaintenanceRequest(assetId: string, requestId: string, input: {
    status?: MaintenanceStatus;
    assignee?: string | null;
    actualCost?: string | null;
    priority?: MaintenancePriority;
  }): Promise<MaintenanceRequest> {
    const response = await this.http.patch<{ request: MaintenanceRequest }>(
      `/api/v1/properties/${encodeURIComponent(assetId)}/maintenance/${encodeURIComponent(requestId)}`,
      input,
    );
    return response.data.request;
  }

  // ---- Expenses ----

  /**
   * Record a property expense.
   */
  async recordExpense(assetId: string, input: {
    category: ExpenseCategory;
    amount: string;
    currency?: string;
    description?: string;
    vendor?: string;
    invoiceRef?: string;
    paidAt?: string;
    period?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PropertyExpense> {
    const validated = parseOrThrow(expenseInputSchema, input, 'RecordExpense');
    const response = await this.http.post<{ expense: PropertyExpense }>(
      `/api/v1/properties/${encodeURIComponent(assetId)}/expenses`,
      validated,
    );
    return response.data.expense;
  }

  /**
   * List expenses for a property.
   */
  async listExpenses(assetId: string, params?: {
    category?: ExpenseCategory;
    from?: string;
    to?: string;
  }): Promise<PropertyExpense[]> {
    const response = await this.http.get<{ expenses: PropertyExpense[]; count: number }>(
      `/api/v1/properties/${encodeURIComponent(assetId)}/expenses`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data.expenses;
  }

  // ---- Analytics ----

  /**
   * Get property summary with analytics.
   */
  async getSummary(assetId: string): Promise<PropertySummary> {
    const response = await this.http.get<{ summary: PropertySummary }>(
      `/api/v1/properties/${encodeURIComponent(assetId)}/summary`,
    );
    return response.data.summary;
  }

  /**
   * Get occupancy rate for a property.
   */
  async getOccupancy(assetId: string): Promise<OccupancyRate> {
    const response = await this.http.get<OccupancyRate>(
      `/api/v1/properties/${encodeURIComponent(assetId)}/occupancy`,
    );
    return response.data;
  }
}
