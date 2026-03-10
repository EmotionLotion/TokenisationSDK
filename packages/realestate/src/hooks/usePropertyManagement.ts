/**
 * usePropertyManagement Hook
 *
 * Provides property management functionality for real estate tokenized assets:
 * - Unit management (tenants, leases, rent)
 * - Maintenance request lifecycle
 * - Expense recording and reporting
 * - Occupancy and summary analytics
 *
 * @example
 * ```tsx
 * function PropertyDashboard({ assetId }: { assetId: string }) {
 *   const {
 *     units, listUnits, addUnit,
 *     maintenance, listMaintenance, createMaintenance,
 *     expenses, listExpenses, recordExpense,
 *     summary, getSummary,
 *     loading, error
 *   } = usePropertyManagement();
 *
 *   useEffect(() => {
 *     listUnits(assetId);
 *     getSummary(assetId);
 *   }, [assetId]);
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *
 *   return (
 *     <div>
 *       <OccupancyCard rate={summary?.occupancyRate} />
 *       <UnitList units={units} />
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '@tokenisation/sdk-react';

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
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AddUnitInput {
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

export interface UpdateUnitInput {
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
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceInput {
  unitId?: string;
  category: string;
  priority: MaintenancePriority;
  description: string;
  assignee?: string;
  estimatedCost?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateMaintenanceInput {
  status?: MaintenanceStatus;
  assignee?: string | null;
  actualCost?: string | null;
  priority?: MaintenancePriority;
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
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RecordExpenseInput {
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

export interface OccupancyData {
  assetId: string;
  occupancyRate: number;
  occupied: number;
  total: number;
}

export interface UsePropertyManagementReturn {
  // Unit operations
  units: PropertyUnit[];
  addUnit: (assetId: string, input: AddUnitInput) => Promise<PropertyUnit>;
  listUnits: (assetId: string) => Promise<PropertyUnit[]>;
  updateUnit: (assetId: string, unitId: string, updates: UpdateUnitInput) => Promise<PropertyUnit>;

  // Maintenance operations
  maintenance: MaintenanceRequest[];
  createMaintenance: (assetId: string, input: CreateMaintenanceInput) => Promise<MaintenanceRequest>;
  listMaintenance: (assetId: string, filters?: MaintenanceFilters) => Promise<MaintenanceRequest[]>;
  updateMaintenance: (assetId: string, requestId: string, updates: UpdateMaintenanceInput) => Promise<MaintenanceRequest>;

  // Expense operations
  expenses: PropertyExpense[];
  recordExpense: (assetId: string, input: RecordExpenseInput) => Promise<PropertyExpense>;
  listExpenses: (assetId: string, filters?: ExpenseFilters) => Promise<PropertyExpense[]>;

  // Analytics
  summary: PropertySummary | null;
  getSummary: (assetId: string) => Promise<PropertySummary>;
  getOccupancy: (assetId: string) => Promise<OccupancyData>;

  // State
  loading: boolean;
  error: Error | null;
  clearError: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function usePropertyManagement(): UsePropertyManagementReturn {
  const { api } = useTokenisation();

  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([]);
  const [expenses, setExpenses] = useState<PropertyExpense[]>([]);
  const [summary, setSummary] = useState<PropertySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Wrapper for async operations with loading/error handling
  const wrapAsync = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ============================================================================
  // Unit Operations
  // ============================================================================

  const addUnit = useCallback(
    (assetId: string, input: AddUnitInput) =>
      wrapAsync(async () => {
        const response = await api.post<{ unit: PropertyUnit }>(
          `/api/v1/properties/${assetId}/units`,
          input
        );
        const unit = response.data.unit;
        setUnits(prev => [...prev, unit]);
        return unit;
      }),
    [api, wrapAsync]
  );

  const listUnits = useCallback(
    (assetId: string) =>
      wrapAsync(async () => {
        const response = await api.get<{ units: PropertyUnit[]; count: number }>(
          `/api/v1/properties/${assetId}/units`
        );
        const unitList = response.data.units;
        setUnits(unitList);
        return unitList;
      }),
    [api, wrapAsync]
  );

  const updateUnit = useCallback(
    (assetId: string, unitId: string, updates: UpdateUnitInput) =>
      wrapAsync(async () => {
        const response = await api.patch<{ unit: PropertyUnit }>(
          `/api/v1/properties/${assetId}/units/${unitId}`,
          updates
        );
        const updatedUnit = response.data.unit;
        setUnits(prev => prev.map(u => (u.id === unitId ? updatedUnit : u)));
        return updatedUnit;
      }),
    [api, wrapAsync]
  );

  // ============================================================================
  // Maintenance Operations
  // ============================================================================

  const createMaintenance = useCallback(
    (assetId: string, input: CreateMaintenanceInput) =>
      wrapAsync(async () => {
        const response = await api.post<{ request: MaintenanceRequest }>(
          `/api/v1/properties/${assetId}/maintenance`,
          input
        );
        const request = response.data.request;
        setMaintenance(prev => [request, ...prev]);
        return request;
      }),
    [api, wrapAsync]
  );

  const listMaintenance = useCallback(
    (assetId: string, filters?: MaintenanceFilters) =>
      wrapAsync(async () => {
        const query: Record<string, string> = {};
        if (filters?.status) query.status = filters.status;
        if (filters?.priority) query.priority = filters.priority;

        const response = await api.get<{ requests: MaintenanceRequest[]; count: number }>(
          `/api/v1/properties/${assetId}/maintenance`,
          query
        );
        const requests = response.data.requests;
        setMaintenance(requests);
        return requests;
      }),
    [api, wrapAsync]
  );

  const updateMaintenance = useCallback(
    (assetId: string, requestId: string, updates: UpdateMaintenanceInput) =>
      wrapAsync(async () => {
        const response = await api.patch<{ request: MaintenanceRequest }>(
          `/api/v1/properties/${assetId}/maintenance/${requestId}`,
          updates
        );
        const updatedRequest = response.data.request;
        setMaintenance(prev => prev.map(m => (m.id === requestId ? updatedRequest : m)));
        return updatedRequest;
      }),
    [api, wrapAsync]
  );

  // ============================================================================
  // Expense Operations
  // ============================================================================

  const recordExpense = useCallback(
    (assetId: string, input: RecordExpenseInput) =>
      wrapAsync(async () => {
        const response = await api.post<{ expense: PropertyExpense }>(
          `/api/v1/properties/${assetId}/expenses`,
          input
        );
        const expense = response.data.expense;
        setExpenses(prev => [expense, ...prev]);
        return expense;
      }),
    [api, wrapAsync]
  );

  const listExpenses = useCallback(
    (assetId: string, filters?: ExpenseFilters) =>
      wrapAsync(async () => {
        const query: Record<string, string> = {};
        if (filters?.category) query.category = filters.category;
        if (filters?.from) query.from = filters.from;
        if (filters?.to) query.to = filters.to;

        const response = await api.get<{ expenses: PropertyExpense[]; count: number }>(
          `/api/v1/properties/${assetId}/expenses`,
          query
        );
        const expenseList = response.data.expenses;
        setExpenses(expenseList);
        return expenseList;
      }),
    [api, wrapAsync]
  );

  // ============================================================================
  // Analytics
  // ============================================================================

  const getSummary = useCallback(
    (assetId: string) =>
      wrapAsync(async () => {
        const response = await api.get<{ summary: PropertySummary }>(
          `/api/v1/properties/${assetId}/summary`
        );
        const summaryData = response.data.summary;
        setSummary(summaryData);
        return summaryData;
      }),
    [api, wrapAsync]
  );

  const getOccupancy = useCallback(
    (assetId: string) =>
      wrapAsync(async () => {
        const response = await api.get<OccupancyData>(
          `/api/v1/properties/${assetId}/occupancy`
        );
        return response.data;
      }),
    [api, wrapAsync]
  );

  return {
    // Units
    units,
    addUnit,
    listUnits,
    updateUnit,

    // Maintenance
    maintenance,
    createMaintenance,
    listMaintenance,
    updateMaintenance,

    // Expenses
    expenses,
    recordExpense,
    listExpenses,

    // Analytics
    summary,
    getSummary,
    getOccupancy,

    // State
    loading,
    error,
    clearError,
  };
}
