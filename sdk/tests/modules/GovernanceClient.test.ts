/**
 * GovernanceModule (Client) Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GovernanceModule } from '../../src/modules/GovernanceClient.js';

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

// Mock the validation module since GovernanceModule uses validate()
vi.mock('../../src/modules/validation.js', () => ({
  validate: (_schema: any, data: any) => data,
  UUIDSchema: { parse: (v: string) => v },
  PaginationSchema: { parse: (v: any) => v },
}));

vi.mock('../../src/modules/validation-governance.js', () => ({
  CreateProposalInputSchema: {},
  UpdateProposalInputSchema: {},
  CastVoteInputSchema: {},
  DelegateInputSchema: {},
  ListProposalsParamsSchema: {},
  ListVotesParamsSchema: {},
  ConfigureGovernanceInputSchema: {},
}));

describe('GovernanceModule', () => {
  let mod: GovernanceModule;
  let http: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    http = createMockHttp();
    mod = new GovernanceModule(http);
  });

  describe('configure', () => {
    it('should POST to /api/v1/governance/:assetId/configure', async () => {
      await mod.configure('asset-1', { votingStrategy: 'TOKEN_WEIGHTED' } as any);
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/governance/asset-1/configure',
        expect.objectContaining({ votingStrategy: 'TOKEN_WEIGHTED' }),
      );
    });
  });

  describe('getConfig', () => {
    it('should GET from /api/v1/governance/:assetId/config', async () => {
      await mod.getConfig('asset-1');
      expect(http.get).toHaveBeenCalledWith('/api/v1/governance/asset-1/config');
    });
  });

  describe('createProposal', () => {
    it('should POST to /api/v1/governance/proposals', async () => {
      const input = { assetId: 'a1', title: 'Test', type: 'GENERAL' };
      await mod.createProposal(input as any);
      expect(http.post).toHaveBeenCalledWith('/api/v1/governance/proposals', input);
    });
  });

  describe('castVote', () => {
    it('should POST vote to /api/v1/governance/proposals/:id/votes', async () => {
      const input = { voterId: 'v1', voteType: 'FOR' };
      await mod.castVote('prop-1', input as any);
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/governance/proposals/prop-1/votes',
        input,
      );
    });
  });

  describe('delegate', () => {
    it('should POST delegation to /api/v1/governance/delegations', async () => {
      const input = { assetId: 'a1', delegatorId: 'd1', delegateId: 'd2' };
      await mod.delegate(input as any);
      expect(http.post).toHaveBeenCalledWith('/api/v1/governance/delegations', input);
    });
  });

  describe('undelegate', () => {
    it('should DELETE with encoded delegateId in query string', async () => {
      await mod.undelegate('asset-1', 'delegate/special');
      expect(http.delete).toHaveBeenCalledWith(
        '/api/v1/governance/asset-1/delegations?delegateId=delegate%2Fspecial',
      );
    });

    it('should DELETE without query string when no delegateId', async () => {
      await mod.undelegate('asset-1');
      expect(http.delete).toHaveBeenCalledWith(
        '/api/v1/governance/asset-1/delegations',
      );
    });
  });

  describe('getVotingPower', () => {
    it('should GET from correct URL', async () => {
      await mod.getVotingPower('asset-1', 'voter-1');
      expect(http.get).toHaveBeenCalledWith(
        '/api/v1/governance/asset-1/voting-power/voter-1',
      );
    });
  });
});
