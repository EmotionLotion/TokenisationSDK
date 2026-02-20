/**
 * Property Management Service - Unit Tests
 *
 * Tests unit CRUD operations (addUnit, listUnits, updateUnit),
 * occupancy analytics (getPropertySummary, getOccupancyRate),
 * and expense filtering (recordExpense, listExpenses with filters).
 *
 * Mocks the database module (rawQuery, execStatement) to isolate
 * the service logic from actual SQLite/Postgres calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Suppress logger output during tests
// ============================================================================

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// Mock the database module
// ============================================================================

vi.mock('../config/database.js', () => ({
  rawQuery: vi.fn(),
  execStatement: vi.fn(),
}));

import { rawQuery, execStatement } from '../config/database.js';
import {
  addUnit,
  listUnits,
  updateUnit,
  recordExpense,
  listExpenses,
  getPropertySummary,
  getOccupancyRate,
  ensureTables,
  type PropertyUnit,
  type PropertyExpense,
} from '../services/property-management.service.js';

// ============================================================================
// Helpers
// ============================================================================

const ORG_ID = 'org-prop-001';
const ASSET_ID = 'asset-prop-001';

let idCounter = 0;
function uniqueUnitNumber(): string {
  return `UNIT-${Date.now()}-${++idCounter}`;
}

/** Build a mock database row for a property unit (snake_case column names). */
function mockUnitRow(overrides: Record<string, any> = {}): Record<string, any> {
  const now = new Date().toISOString();
  return {
    id: `unit-${++idCounter}`,
    org_id: ORG_ID,
    property_asset_id: ASSET_ID,
    unit_number: 'A-101',
    type: 'apartment',
    area: 85,
    tenant_name: null,
    tenant_email: null,
    lease_start: null,
    lease_end: null,
    monthly_rent: null,
    currency: 'USD',
    status: 'vacant',
    metadata: '{}',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/** Build a mock database row for a property expense (snake_case column names). */
function mockExpenseRow(overrides: Record<string, any> = {}): Record<string, any> {
  const now = new Date().toISOString();
  return {
    id: `exp-${++idCounter}`,
    org_id: ORG_ID,
    property_asset_id: ASSET_ID,
    category: 'maintenance',
    amount: '1500.00',
    currency: 'USD',
    description: null,
    vendor: null,
    invoice_ref: null,
    paid_at: null,
    period: null,
    metadata: '{}',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Property Management Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // execStatement for ensureTables always succeeds
    (execStatement as any).mockResolvedValue(undefined);
  });

  // --------------------------------------------------------------------------
  // Unit CRUD - addUnit
  // --------------------------------------------------------------------------
  describe('addUnit', () => {
    it('creates a unit and returns it with correct camelCase fields', async () => {
      const unitRow = mockUnitRow({ unit_number: 'B-201', type: '2bed', area: 120 });

      // execStatement for the INSERT
      (execStatement as any).mockResolvedValue(undefined);
      // rawQuery for the SELECT after insert
      (rawQuery as any).mockResolvedValue([unitRow]);

      const result = await addUnit(ORG_ID, {
        propertyAssetId: ASSET_ID,
        unitNumber: 'B-201',
        type: '2bed',
        area: 120,
      });

      expect(result.unitNumber).toBe('B-201');
      expect(result.type).toBe('2bed');
      expect(result.area).toBe(120);
      expect(result.orgId).toBe(ORG_ID);
      expect(result.propertyAssetId).toBe(ASSET_ID);
      expect(result.status).toBe('vacant');
      expect(result.currency).toBe('USD');
    });

    it('defaults status to vacant when not provided', async () => {
      const unitRow = mockUnitRow({ status: 'vacant' });
      (rawQuery as any).mockResolvedValue([unitRow]);

      const result = await addUnit(ORG_ID, {
        propertyAssetId: ASSET_ID,
        unitNumber: 'C-301',
        type: 'studio',
        area: 45,
      });

      expect(result.status).toBe('vacant');
    });

    it('accepts occupied status', async () => {
      const unitRow = mockUnitRow({
        status: 'occupied',
        tenant_name: 'John Doe',
        tenant_email: 'john@example.com',
        monthly_rent: '3500.00',
      });
      (rawQuery as any).mockResolvedValue([unitRow]);

      const result = await addUnit(ORG_ID, {
        propertyAssetId: ASSET_ID,
        unitNumber: 'D-401',
        type: 'apartment',
        area: 95,
        status: 'occupied',
        tenantName: 'John Doe',
        tenantEmail: 'john@example.com',
        monthlyRent: '3500.00',
      });

      expect(result.status).toBe('occupied');
      expect(result.tenantName).toBe('John Doe');
      expect(result.monthlyRent).toBe('3500.00');
    });

    it('throws ValidationError when propertyAssetId is missing', async () => {
      await expect(
        addUnit(ORG_ID, {
          propertyAssetId: '',
          unitNumber: 'E-501',
          type: 'apartment',
          area: 80,
        }),
      ).rejects.toThrow(/propertyAssetId is required/);
    });

    it('throws ValidationError when unitNumber is missing', async () => {
      await expect(
        addUnit(ORG_ID, {
          propertyAssetId: ASSET_ID,
          unitNumber: '',
          type: 'apartment',
          area: 80,
        }),
      ).rejects.toThrow(/unitNumber is required/);
    });

    it('throws ValidationError when type is missing', async () => {
      await expect(
        addUnit(ORG_ID, {
          propertyAssetId: ASSET_ID,
          unitNumber: 'F-601',
          type: '' as any,
          area: 80,
        }),
      ).rejects.toThrow(/type is required/);
    });

    it('throws ValidationError when area is negative', async () => {
      await expect(
        addUnit(ORG_ID, {
          propertyAssetId: ASSET_ID,
          unitNumber: 'G-701',
          type: 'apartment',
          area: -10,
        }),
      ).rejects.toThrow(/area must be a non-negative number/);
    });

    it('calls execStatement with correct INSERT parameters', async () => {
      const unitRow = mockUnitRow();
      (rawQuery as any).mockResolvedValue([unitRow]);

      await addUnit(ORG_ID, {
        propertyAssetId: ASSET_ID,
        unitNumber: 'H-801',
        type: 'office',
        area: 200,
        currency: 'AED',
      });

      // execStatement should be called for table creation(s) and the INSERT
      const insertCall = (execStatement as any).mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO property_units'),
      );
      expect(insertCall).toBeDefined();
      // Verify params include the key data
      const params = insertCall[1];
      expect(params).toContain(ORG_ID);
      expect(params).toContain(ASSET_ID);
      expect(params).toContain('H-801');
      expect(params).toContain('office');
      expect(params).toContain(200);
      expect(params).toContain('AED');
    });
  });

  // --------------------------------------------------------------------------
  // Unit CRUD - listUnits
  // --------------------------------------------------------------------------
  describe('listUnits', () => {
    it('returns empty array when no units exist', async () => {
      (rawQuery as any).mockResolvedValue([]);

      const result = await listUnits(ORG_ID, ASSET_ID);

      expect(result).toEqual([]);
    });

    it('returns units mapped to camelCase', async () => {
      const rows = [
        mockUnitRow({ unit_number: 'A-101', type: 'studio', area: 45 }),
        mockUnitRow({ unit_number: 'A-102', type: 'apartment', area: 85 }),
      ];
      (rawQuery as any).mockResolvedValue(rows);

      const result = await listUnits(ORG_ID, ASSET_ID);

      expect(result).toHaveLength(2);
      expect(result[0].unitNumber).toBe('A-101');
      expect(result[1].unitNumber).toBe('A-102');
      expect(result[0].type).toBe('studio');
      expect(result[1].type).toBe('apartment');
    });

    it('passes orgId and assetId to the SQL query', async () => {
      (rawQuery as any).mockResolvedValue([]);

      await listUnits(ORG_ID, ASSET_ID);

      // Find the rawQuery call for listing units (not table creation)
      const listCall = (rawQuery as any).mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('SELECT * FROM property_units'),
      );
      expect(listCall).toBeDefined();
      expect(listCall[1]).toEqual([ORG_ID, ASSET_ID]);
    });

    it('throws ValidationError when assetId is empty', async () => {
      await expect(listUnits(ORG_ID, '')).rejects.toThrow(/assetId is required/);
    });
  });

  // --------------------------------------------------------------------------
  // Unit CRUD - updateUnit
  // --------------------------------------------------------------------------
  describe('updateUnit', () => {
    it('updates a unit and returns the updated record', async () => {
      const existingRow = mockUnitRow({ id: 'unit-upd-1', unit_number: 'A-101', status: 'vacant' });
      const updatedRow = { ...existingRow, status: 'occupied', tenant_name: 'Jane Doe' };

      // First rawQuery: check existing unit
      // Second rawQuery: fetch updated unit
      (rawQuery as any)
        .mockResolvedValueOnce([existingRow])  // SELECT existing
        .mockResolvedValueOnce([updatedRow]);   // SELECT after update

      const result = await updateUnit(ORG_ID, 'unit-upd-1', {
        status: 'occupied',
        tenantName: 'Jane Doe',
      });

      expect(result.status).toBe('occupied');
      expect(result.tenantName).toBe('Jane Doe');
    });

    it('throws NotFoundError when unit does not exist', async () => {
      (rawQuery as any).mockResolvedValue([]);

      await expect(
        updateUnit(ORG_ID, 'non-existent-unit', { status: 'occupied' }),
      ).rejects.toThrow(/not found/i);
    });

    it('throws ValidationError when unitId is empty', async () => {
      await expect(
        updateUnit(ORG_ID, '', { status: 'occupied' }),
      ).rejects.toThrow(/unitId is required/);
    });

    it('throws ValidationError when no fields to update', async () => {
      const existingRow = mockUnitRow({ id: 'unit-upd-2' });
      (rawQuery as any).mockResolvedValue([existingRow]);

      await expect(
        updateUnit(ORG_ID, 'unit-upd-2', {}),
      ).rejects.toThrow(/No fields to update/);
    });
  });

  // --------------------------------------------------------------------------
  // Occupancy Analytics - getOccupancyRate
  // --------------------------------------------------------------------------
  describe('getOccupancyRate', () => {
    it('returns 0% occupancy when no units exist', async () => {
      (rawQuery as any).mockResolvedValue([{ total: 0, occupied: 0 }]);

      const result = await getOccupancyRate(ORG_ID, ASSET_ID);

      expect(result.assetId).toBe(ASSET_ID);
      expect(result.occupancyRate).toBe(0);
      expect(result.occupied).toBe(0);
      expect(result.total).toBe(0);
    });

    it('computes occupancy rate correctly', async () => {
      (rawQuery as any).mockResolvedValue([{ total: 10, occupied: 7 }]);

      const result = await getOccupancyRate(ORG_ID, ASSET_ID);

      expect(result.total).toBe(10);
      expect(result.occupied).toBe(7);
      expect(result.occupancyRate).toBe(70);
    });

    it('rounds occupancy rate to 2 decimal places', async () => {
      (rawQuery as any).mockResolvedValue([{ total: 3, occupied: 1 }]);

      const result = await getOccupancyRate(ORG_ID, ASSET_ID);

      // 1/3 = 33.333...% -> rounds to 33.33
      expect(result.occupancyRate).toBe(33.33);
    });

    it('returns 100% when all units are occupied', async () => {
      (rawQuery as any).mockResolvedValue([{ total: 5, occupied: 5 }]);

      const result = await getOccupancyRate(ORG_ID, ASSET_ID);

      expect(result.occupancyRate).toBe(100);
    });

    it('throws ValidationError when assetId is empty', async () => {
      await expect(getOccupancyRate(ORG_ID, '')).rejects.toThrow(/assetId is required/);
    });
  });

  // --------------------------------------------------------------------------
  // Occupancy Analytics - getPropertySummary
  // --------------------------------------------------------------------------
  describe('getPropertySummary', () => {
    it('returns a complete summary with all fields', async () => {
      // rawQuery is called 3 times: unitStats, maintStats, expStats
      (rawQuery as any)
        .mockResolvedValueOnce([{
          total: 20,
          occupied: 15,
          vacant: 3,
          in_maintenance: 1,
          reserved: 1,
          total_rent: 75000,
        }])
        .mockResolvedValueOnce([{
          open_count: 5,
          in_progress_count: 2,
          completed_count: 10,
        }])
        .mockResolvedValueOnce([{
          total_amount: 50000,
          currency: 'USD',
        }]);

      const summary = await getPropertySummary(ORG_ID, ASSET_ID);

      expect(summary.assetId).toBe(ASSET_ID);
      expect(summary.totalUnits).toBe(20);
      expect(summary.occupiedUnits).toBe(15);
      expect(summary.vacantUnits).toBe(3);
      expect(summary.maintenanceUnits).toBe(1);
      expect(summary.reservedUnits).toBe(1);
      expect(summary.occupancyRate).toBe(75);
      expect(summary.totalMonthlyRent).toBe(75000);
      expect(summary.maintenanceOpen).toBe(5);
      expect(summary.maintenanceInProgress).toBe(2);
      expect(summary.maintenanceCompleted).toBe(10);
      expect(summary.totalExpenses).toBe(50000);
      expect(summary.expenseCurrency).toBe('USD');
    });

    it('returns zeros for empty property', async () => {
      (rawQuery as any)
        .mockResolvedValueOnce([{ total: 0, occupied: 0, vacant: 0, in_maintenance: 0, reserved: 0, total_rent: 0 }])
        .mockResolvedValueOnce([{ open_count: 0, in_progress_count: 0, completed_count: 0 }])
        .mockResolvedValueOnce([{ total_amount: 0, currency: 'USD' }]);

      const summary = await getPropertySummary(ORG_ID, ASSET_ID);

      expect(summary.totalUnits).toBe(0);
      expect(summary.occupiedUnits).toBe(0);
      expect(summary.occupancyRate).toBe(0);
      expect(summary.totalMonthlyRent).toBe(0);
      expect(summary.totalExpenses).toBe(0);
    });

    it('computes occupancy rate with 2 decimal precision', async () => {
      (rawQuery as any)
        .mockResolvedValueOnce([{ total: 3, occupied: 1, vacant: 2, in_maintenance: 0, reserved: 0, total_rent: 3000 }])
        .mockResolvedValueOnce([{ open_count: 0, in_progress_count: 0, completed_count: 0 }])
        .mockResolvedValueOnce([{ total_amount: 0, currency: 'USD' }]);

      const summary = await getPropertySummary(ORG_ID, ASSET_ID);

      // 1/3 = 33.33%
      expect(summary.occupancyRate).toBe(33.33);
    });

    it('throws ValidationError when assetId is empty', async () => {
      await expect(getPropertySummary(ORG_ID, '')).rejects.toThrow(/assetId is required/);
    });

    it('handles null/undefined DB values gracefully', async () => {
      (rawQuery as any)
        .mockResolvedValueOnce([{}])  // all undefined
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}]);

      const summary = await getPropertySummary(ORG_ID, ASSET_ID);

      expect(summary.totalUnits).toBe(0);
      expect(summary.occupiedUnits).toBe(0);
      expect(summary.occupancyRate).toBe(0);
      expect(summary.maintenanceOpen).toBe(0);
      expect(summary.totalExpenses).toBe(0);
      expect(summary.expenseCurrency).toBe('USD');
    });
  });

  // --------------------------------------------------------------------------
  // Expense Filtering - recordExpense
  // --------------------------------------------------------------------------
  describe('recordExpense', () => {
    it('records an expense and returns it with camelCase fields', async () => {
      const expRow = mockExpenseRow({
        category: 'insurance',
        amount: '12000.00',
        vendor: 'InsuranceCo',
      });
      (rawQuery as any).mockResolvedValue([expRow]);

      const result = await recordExpense(ORG_ID, {
        propertyAssetId: ASSET_ID,
        category: 'insurance',
        amount: '12000.00',
        vendor: 'InsuranceCo',
      });

      expect(result.category).toBe('insurance');
      expect(result.amount).toBe('12000.00');
      expect(result.vendor).toBe('InsuranceCo');
      expect(result.orgId).toBe(ORG_ID);
      expect(result.currency).toBe('USD');
    });

    it('defaults currency to USD', async () => {
      const expRow = mockExpenseRow({ currency: 'USD' });
      (rawQuery as any).mockResolvedValue([expRow]);

      const result = await recordExpense(ORG_ID, {
        propertyAssetId: ASSET_ID,
        category: 'maintenance',
        amount: '500.00',
      });

      expect(result.currency).toBe('USD');
    });

    it('accepts a custom currency', async () => {
      const expRow = mockExpenseRow({ currency: 'AED' });
      (rawQuery as any).mockResolvedValue([expRow]);

      const result = await recordExpense(ORG_ID, {
        propertyAssetId: ASSET_ID,
        category: 'tax',
        amount: '8000.00',
        currency: 'AED',
      });

      expect(result.currency).toBe('AED');
    });

    it('throws ValidationError when propertyAssetId is missing', async () => {
      await expect(
        recordExpense(ORG_ID, {
          propertyAssetId: '',
          category: 'maintenance',
          amount: '500.00',
        }),
      ).rejects.toThrow(/propertyAssetId is required/);
    });

    it('throws ValidationError when category is missing', async () => {
      await expect(
        recordExpense(ORG_ID, {
          propertyAssetId: ASSET_ID,
          category: '' as any,
          amount: '500.00',
        }),
      ).rejects.toThrow(/category is required/);
    });

    it('throws ValidationError when amount is missing', async () => {
      await expect(
        recordExpense(ORG_ID, {
          propertyAssetId: ASSET_ID,
          category: 'maintenance',
          amount: '',
        }),
      ).rejects.toThrow(/amount is required/);
    });

    it('stores optional fields (description, vendor, invoiceRef, paidAt, period)', async () => {
      const expRow = mockExpenseRow({
        description: 'HVAC repair',
        vendor: 'CoolAir Ltd',
        invoice_ref: 'INV-2025-001',
        paid_at: '2025-01-15T00:00:00Z',
        period: '2025-01',
      });
      (rawQuery as any).mockResolvedValue([expRow]);

      const result = await recordExpense(ORG_ID, {
        propertyAssetId: ASSET_ID,
        category: 'maintenance',
        amount: '3200.00',
        description: 'HVAC repair',
        vendor: 'CoolAir Ltd',
        invoiceRef: 'INV-2025-001',
        paidAt: '2025-01-15T00:00:00Z',
        period: '2025-01',
      });

      expect(result.description).toBe('HVAC repair');
      expect(result.vendor).toBe('CoolAir Ltd');
      expect(result.invoiceRef).toBe('INV-2025-001');
      expect(result.paidAt).toBe('2025-01-15T00:00:00Z');
      expect(result.period).toBe('2025-01');
    });
  });

  // --------------------------------------------------------------------------
  // Expense Filtering - listExpenses
  // --------------------------------------------------------------------------
  describe('listExpenses', () => {
    it('returns empty array when no expenses exist', async () => {
      (rawQuery as any).mockResolvedValue([]);

      const result = await listExpenses(ORG_ID, ASSET_ID);

      expect(result).toEqual([]);
    });

    it('returns expenses mapped to camelCase', async () => {
      const rows = [
        mockExpenseRow({ category: 'maintenance', amount: '1500.00' }),
        mockExpenseRow({ category: 'insurance', amount: '12000.00' }),
      ];
      (rawQuery as any).mockResolvedValue(rows);

      const result = await listExpenses(ORG_ID, ASSET_ID);

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('maintenance');
      expect(result[1].category).toBe('insurance');
    });

    it('filters by category', async () => {
      const rows = [
        mockExpenseRow({ category: 'tax', amount: '8000.00' }),
      ];
      (rawQuery as any).mockResolvedValue(rows);

      const result = await listExpenses(ORG_ID, ASSET_ID, { category: 'tax' });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('tax');

      // Verify the SQL includes a category filter param
      const listCall = (rawQuery as any).mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('property_expenses'),
      );
      expect(listCall).toBeDefined();
      expect(listCall[1]).toContain('tax');
    });

    it('filters by date range (from/to)', async () => {
      (rawQuery as any).mockResolvedValue([]);

      await listExpenses(ORG_ID, ASSET_ID, {
        from: '2025-01-01',
        to: '2025-01-31',
      });

      const listCall = (rawQuery as any).mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('property_expenses'),
      );
      expect(listCall).toBeDefined();
      expect(listCall[1]).toContain('2025-01-01');
      expect(listCall[1]).toContain('2025-01-31');
    });

    it('combines category and date range filters', async () => {
      (rawQuery as any).mockResolvedValue([]);

      await listExpenses(ORG_ID, ASSET_ID, {
        category: 'utility',
        from: '2025-01-01',
        to: '2025-06-30',
      });

      const listCall = (rawQuery as any).mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('property_expenses'),
      );
      expect(listCall).toBeDefined();
      const params = listCall[1];
      expect(params).toContain(ORG_ID);
      expect(params).toContain(ASSET_ID);
      expect(params).toContain('utility');
      expect(params).toContain('2025-01-01');
      expect(params).toContain('2025-06-30');
    });

    it('throws ValidationError when assetId is empty', async () => {
      await expect(listExpenses(ORG_ID, '')).rejects.toThrow(/assetId is required/);
    });

    it('passes orgId and assetId as base query params', async () => {
      (rawQuery as any).mockResolvedValue([]);

      await listExpenses(ORG_ID, ASSET_ID);

      const listCall = (rawQuery as any).mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('property_expenses'),
      );
      expect(listCall).toBeDefined();
      expect(listCall[1][0]).toBe(ORG_ID);
      expect(listCall[1][1]).toBe(ASSET_ID);
    });
  });
});
