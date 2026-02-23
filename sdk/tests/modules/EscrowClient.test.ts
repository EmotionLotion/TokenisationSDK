/**
 * EscrowModule (Client) Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EscrowModule } from '@tokenisation/core';

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

// Mock validation functions
vi.mock('../../../packages/core/src/modules/validation.js', () => ({
  validate: (_schema: any, data: any) => data,
  UUIDSchema: { parse: (v: string) => v },
}));

vi.mock('../../../packages/core/src/modules/validation-governance.js', () => ({
  CreateEscrowInputSchema: {},
  FundEscrowInputSchema: {},
  ReleaseEscrowInputSchema: {},
  RaiseDisputeInputSchema: {},
  ResolveDisputeInputSchema: {},
  CreateMilestoneInputSchema: {},
  SubmitMilestoneEvidenceInputSchema: {},
  ApproveMilestoneInputSchema: {},
  ListEscrowsParamsSchema: {},
}));

describe('EscrowModule', () => {
  let mod: EscrowModule;
  let http: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    http = createMockHttp();
    mod = new EscrowModule(http);
  });

  describe('create', () => {
    it('should POST to /api/v1/escrow', async () => {
      const input = { title: 'Test Escrow', assetId: 'a1', amount: '1000', currency: 'AED' };
      await mod.create(input as any);
      expect(http.post).toHaveBeenCalledWith('/api/v1/escrow', input);
    });
  });

  describe('get', () => {
    it('should GET from /api/v1/escrow/:id', async () => {
      const expected = { id: 'esc-1', status: 'DRAFT' };
      http.get.mockResolvedValue({ data: expected });
      const result = await mod.get('esc-1');
      expect(http.get).toHaveBeenCalledWith('/api/v1/escrow/esc-1');
      expect(result).toEqual(expected);
    });
  });

  describe('fund', () => {
    it('should POST to /api/v1/escrow/:id/fund', async () => {
      const input = { amount: '500', partyId: 'party-1' };
      await mod.fund('esc-1', input as any);
      expect(http.post).toHaveBeenCalledWith('/api/v1/escrow/esc-1/fund', input);
    });
  });

  describe('release', () => {
    it('should POST to /api/v1/escrow/:id/release', async () => {
      await mod.release('esc-1');
      expect(http.post).toHaveBeenCalledWith('/api/v1/escrow/esc-1/release', undefined);
    });

    it('should pass release input when provided', async () => {
      const input = { amount: '300' };
      await mod.release('esc-1', input as any);
      expect(http.post).toHaveBeenCalledWith('/api/v1/escrow/esc-1/release', input);
    });
  });

  describe('refund', () => {
    it('should POST to /api/v1/escrow/:id/refund with reason', async () => {
      await mod.refund('esc-1', 'Deal fell through');
      expect(http.post).toHaveBeenCalledWith('/api/v1/escrow/esc-1/refund', { reason: 'Deal fell through' });
    });
  });

  describe('dispute', () => {
    it('should POST to /api/v1/escrow/:id/dispute', async () => {
      const input = { reason: 'Non-delivery' };
      await mod.dispute('esc-1', input as any);
      expect(http.post).toHaveBeenCalledWith('/api/v1/escrow/esc-1/dispute', input);
    });
  });

  describe('milestones', () => {
    it('should POST milestone to /api/v1/escrow/:id/milestones', async () => {
      const input = { title: 'Phase 1', amount: '200' };
      await mod.addMilestone('esc-1', input as any);
      expect(http.post).toHaveBeenCalledWith('/api/v1/escrow/esc-1/milestones', input);
    });

    it('should GET milestones from /api/v1/escrow/:id/milestones', async () => {
      http.get.mockResolvedValue({ data: { data: [{ id: 'm1' }] } });
      const result = await mod.getMilestones('esc-1');
      expect(http.get).toHaveBeenCalledWith('/api/v1/escrow/esc-1/milestones');
      expect(result).toEqual([{ id: 'm1' }]);
    });
  });
});
