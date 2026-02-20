import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PropertyModule } from '../../src/modules/PropertyModule.js';
import { ValidationError } from '../../src/validation/real-estate.js';

// ---------------------------------------------------------------------------
// Mock HttpClient
// ---------------------------------------------------------------------------

function createMockHttp() {
  return {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  } as any;
}

describe('PropertyModule', () => {
  let http: ReturnType<typeof createMockHttp>;
  let mod: PropertyModule;

  beforeEach(() => {
    http = createMockHttp();
    mod = new PropertyModule(http);
  });

  // ========================================================================
  // addUnit
  // ========================================================================

  describe('addUnit', () => {
    const validInput = {
      unitNumber: 'A-101',
      type: 'apartment' as const,
      area: 85.5,
    };

    it('should POST to the correct URL with encoded assetId and validated body', async () => {
      const fakeUnit = { id: 'u1', ...validInput, status: 'vacant', currency: 'AED' };
      http.post.mockResolvedValueOnce({ data: { unit: fakeUnit } });

      const result = await mod.addUnit('asset/1', validInput);

      expect(http.post).toHaveBeenCalledTimes(1);
      const [url, body] = http.post.mock.calls[0];
      expect(url).toBe('/api/v1/properties/asset%2F1/units');
      expect(body).toMatchObject({
        unitNumber: 'A-101',
        type: 'apartment',
        area: 85.5,
      });
      expect(result).toEqual(fakeUnit);
    });

    it('should pass through optional fields in the validated body', async () => {
      const fullInput = {
        ...validInput,
        tenantName: 'Jane Doe',
        tenantEmail: 'jane@example.com',
        leaseStart: '2025-01-01',
        leaseEnd: '2026-01-01',
        monthlyRent: '5000',
        currency: 'USD',
        status: 'occupied' as const,
        metadata: { floor: 10 },
      };
      http.post.mockResolvedValueOnce({ data: { unit: { id: 'u2', ...fullInput } } });

      await mod.addUnit('prop-abc', fullInput);

      const body = http.post.mock.calls[0][1];
      expect(body.tenantName).toBe('Jane Doe');
      expect(body.tenantEmail).toBe('jane@example.com');
      expect(body.currency).toBe('USD');
      expect(body.status).toBe('occupied');
      expect(body.metadata).toEqual({ floor: 10 });
    });

    it('should throw ValidationError when unitNumber is missing', async () => {
      const bad = { type: 'apartment', area: 50 };

      await expect(mod.addUnit('asset1', bad as any)).rejects.toThrow(ValidationError);
      await expect(mod.addUnit('asset1', bad as any)).rejects.toThrow(/unitNumber/);
      expect(http.post).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when area is negative', async () => {
      const bad = { unitNumber: 'B-1', type: 'studio' as const, area: -10 };

      try {
        await mod.addUnit('asset1', bad);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).fieldErrors.some(e => e.path === 'area')).toBe(true);
      }
    });

    it('should throw ValidationError for an invalid unit type', async () => {
      const bad = { unitNumber: 'C-1', type: 'castle' as any, area: 100 };

      await expect(mod.addUnit('asset1', bad)).rejects.toBeInstanceOf(ValidationError);
    });
  });

  // ========================================================================
  // listUnits
  // ========================================================================

  describe('listUnits', () => {
    it('should GET the correct URL and return units array', async () => {
      const fakeUnits = [
        { id: 'u1', unitNumber: 'A-1' },
        { id: 'u2', unitNumber: 'A-2' },
      ];
      http.get.mockResolvedValueOnce({ data: { units: fakeUnits, count: 2 } });

      const result = await mod.listUnits('prop-xyz');

      expect(http.get).toHaveBeenCalledTimes(1);
      expect(http.get).toHaveBeenCalledWith('/api/v1/properties/prop-xyz/units');
      expect(result).toEqual(fakeUnits);
    });

    it('should encode special characters in assetId', async () => {
      http.get.mockResolvedValueOnce({ data: { units: [], count: 0 } });

      await mod.listUnits('has spaces & more');

      const url = http.get.mock.calls[0][0];
      expect(url).toBe('/api/v1/properties/has%20spaces%20%26%20more/units');
    });
  });

  // ========================================================================
  // updateUnit
  // ========================================================================

  describe('updateUnit', () => {
    it('should PATCH the correct URL with both assetId and unitId encoded', async () => {
      const patchBody = { status: 'occupied' as const, monthlyRent: '4500' };
      const fakeUnit = { id: 'unit/2', ...patchBody };
      http.patch.mockResolvedValueOnce({ data: { unit: fakeUnit } });

      const result = await mod.updateUnit('asset/1', 'unit/2', patchBody);

      expect(http.patch).toHaveBeenCalledTimes(1);
      const [url, body] = http.patch.mock.calls[0];
      expect(url).toBe('/api/v1/properties/asset%2F1/units/unit%2F2');
      expect(body).toEqual(patchBody);
      expect(result).toEqual(fakeUnit);
    });
  });

  // ========================================================================
  // createMaintenanceRequest
  // ========================================================================

  describe('createMaintenanceRequest', () => {
    const validInput = {
      category: 'plumbing',
      priority: 'high' as const,
      description: 'Leaking faucet in unit A-101',
    };

    it('should POST to maintenance endpoint and return the created request', async () => {
      const fakeReq = { id: 'mr-1', ...validInput, status: 'open' };
      http.post.mockResolvedValueOnce({ data: { request: fakeReq } });

      const result = await mod.createMaintenanceRequest('prop-1', validInput);

      expect(http.post).toHaveBeenCalledTimes(1);
      const [url, body] = http.post.mock.calls[0];
      expect(url).toBe('/api/v1/properties/prop-1/maintenance');
      expect(body).toMatchObject({
        category: 'plumbing',
        priority: 'high',
        description: 'Leaking faucet in unit A-101',
      });
      expect(result).toEqual(fakeReq);
    });

    it('should throw ValidationError when description is empty', async () => {
      const bad = { category: 'plumbing', priority: 'low' as const, description: '' };

      await expect(mod.createMaintenanceRequest('prop-1', bad)).rejects.toBeInstanceOf(ValidationError);
      expect(http.post).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when priority is invalid', async () => {
      const bad = { category: 'plumbing', priority: 'extreme' as any, description: 'broken pipe' };

      await expect(mod.createMaintenanceRequest('prop-1', bad)).rejects.toBeInstanceOf(ValidationError);
    });
  });

  // ========================================================================
  // listMaintenanceRequests
  // ========================================================================

  describe('listMaintenanceRequests', () => {
    it('should GET maintenance endpoint with optional params', async () => {
      const fakeRequests = [{ id: 'mr-1' }];
      http.get.mockResolvedValueOnce({ data: { requests: fakeRequests, count: 1 } });

      const result = await mod.listMaintenanceRequests('prop-1', {
        status: 'open',
        priority: 'urgent',
      });

      expect(http.get).toHaveBeenCalledTimes(1);
      const [url, params] = http.get.mock.calls[0];
      expect(url).toBe('/api/v1/properties/prop-1/maintenance');
      expect(params).toEqual({ status: 'open', priority: 'urgent' });
      expect(result).toEqual(fakeRequests);
    });

    it('should work without optional params', async () => {
      http.get.mockResolvedValueOnce({ data: { requests: [], count: 0 } });

      const result = await mod.listMaintenanceRequests('prop-2');

      expect(http.get).toHaveBeenCalledWith('/api/v1/properties/prop-2/maintenance', undefined);
      expect(result).toEqual([]);
    });
  });

  // ========================================================================
  // updateMaintenanceRequest
  // ========================================================================

  describe('updateMaintenanceRequest', () => {
    it('should PATCH the correct maintenance request URL', async () => {
      const patchInput = { status: 'completed' as const, actualCost: '250' };
      const fakeReq = { id: 'mr-5', ...patchInput };
      http.patch.mockResolvedValueOnce({ data: { request: fakeReq } });

      const result = await mod.updateMaintenanceRequest('prop-1', 'mr-5', patchInput);

      expect(http.patch).toHaveBeenCalledTimes(1);
      const [url, body] = http.patch.mock.calls[0];
      expect(url).toBe('/api/v1/properties/prop-1/maintenance/mr-5');
      expect(body).toEqual(patchInput);
      expect(result).toEqual(fakeReq);
    });
  });

  // ========================================================================
  // recordExpense
  // ========================================================================

  describe('recordExpense', () => {
    const validInput = {
      category: 'maintenance' as const,
      amount: '1500.50',
    };

    it('should POST to expenses endpoint and return created expense', async () => {
      const fakeExpense = { id: 'exp-1', ...validInput, currency: 'AED' };
      http.post.mockResolvedValueOnce({ data: { expense: fakeExpense } });

      const result = await mod.recordExpense('prop-1', validInput);

      expect(http.post).toHaveBeenCalledTimes(1);
      const [url, body] = http.post.mock.calls[0];
      expect(url).toBe('/api/v1/properties/prop-1/expenses');
      expect(body).toMatchObject({ category: 'maintenance', amount: '1500.50' });
      expect(result).toEqual(fakeExpense);
    });

    it('should throw ValidationError when amount is not a valid number string', async () => {
      const bad = { category: 'tax' as const, amount: 'not-a-number' };

      await expect(mod.recordExpense('prop-1', bad)).rejects.toBeInstanceOf(ValidationError);
      expect(http.post).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when category is invalid', async () => {
      const bad = { category: 'fun_money' as any, amount: '100' };

      await expect(mod.recordExpense('prop-1', bad)).rejects.toBeInstanceOf(ValidationError);
    });

    it('should pass through optional expense fields', async () => {
      const fullInput = {
        ...validInput,
        currency: 'USD',
        description: 'Elevator repair',
        vendor: 'ElevatorCo',
        invoiceRef: 'INV-2025-042',
        paidAt: '2025-06-15',
        period: '2025-Q2',
        metadata: { approvedBy: 'finance-dept' },
      };
      http.post.mockResolvedValueOnce({ data: { expense: { id: 'exp-2', ...fullInput } } });

      await mod.recordExpense('prop-1', fullInput);

      const body = http.post.mock.calls[0][1];
      expect(body.vendor).toBe('ElevatorCo');
      expect(body.invoiceRef).toBe('INV-2025-042');
      expect(body.metadata).toEqual({ approvedBy: 'finance-dept' });
    });
  });

  // ========================================================================
  // listExpenses
  // ========================================================================

  describe('listExpenses', () => {
    it('should GET expenses endpoint with optional filter params', async () => {
      const fakeExpenses = [{ id: 'exp-1' }, { id: 'exp-2' }];
      http.get.mockResolvedValueOnce({ data: { expenses: fakeExpenses, count: 2 } });

      const result = await mod.listExpenses('prop-1', {
        category: 'insurance',
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(http.get).toHaveBeenCalledTimes(1);
      const [url, params] = http.get.mock.calls[0];
      expect(url).toBe('/api/v1/properties/prop-1/expenses');
      expect(params).toEqual({ category: 'insurance', from: '2025-01-01', to: '2025-12-31' });
      expect(result).toEqual(fakeExpenses);
    });
  });

  // ========================================================================
  // getSummary
  // ========================================================================

  describe('getSummary', () => {
    it('should GET summary endpoint and return the summary object', async () => {
      const fakeSummary = {
        assetId: 'prop-1',
        totalUnits: 20,
        occupiedUnits: 18,
        totalMonthlyRent: '90000',
        totalExpenses: '12000',
        openMaintenanceRequests: 3,
      };
      http.get.mockResolvedValueOnce({ data: { summary: fakeSummary } });

      const result = await mod.getSummary('prop-1');

      expect(http.get).toHaveBeenCalledTimes(1);
      expect(http.get).toHaveBeenCalledWith('/api/v1/properties/prop-1/summary');
      expect(result).toEqual(fakeSummary);
    });
  });

  // ========================================================================
  // getOccupancy
  // ========================================================================

  describe('getOccupancy', () => {
    it('should GET occupancy endpoint and return the response data directly', async () => {
      const fakeOccupancy = {
        assetId: 'prop-1',
        totalUnits: 20,
        occupiedUnits: 18,
        vacantUnits: 2,
        occupancyRate: 0.9,
      };
      http.get.mockResolvedValueOnce({ data: fakeOccupancy });

      const result = await mod.getOccupancy('prop-1');

      expect(http.get).toHaveBeenCalledTimes(1);
      expect(http.get).toHaveBeenCalledWith('/api/v1/properties/prop-1/occupancy');
      expect(result).toEqual(fakeOccupancy);
    });

    it('should encode assetId with special characters', async () => {
      http.get.mockResolvedValueOnce({
        data: { assetId: 'a/b', totalUnits: 0, occupiedUnits: 0, vacantUnits: 0, occupancyRate: 0 },
      });

      await mod.getOccupancy('a/b');

      expect(http.get.mock.calls[0][0]).toBe('/api/v1/properties/a%2Fb/occupancy');
    });
  });
});
