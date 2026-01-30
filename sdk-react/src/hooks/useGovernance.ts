/**
 * useGovernance - Hook for governance operations via GovernanceModule.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface ProposalData {
  id: string;
  title: string;
  description: string;
  proposer: string;
  state: string;
  votesFor: string;
  votesAgainst: string;
  votesAbstain: string;
  startTime: string;
  endTime: string;
  [key: string]: unknown;
}

export interface VotingPowerData {
  address: string;
  power: string;
  delegatedFrom: string[];
  [key: string]: unknown;
}

export interface UseGovernanceReturn {
  createProposal: (params: { title: string; description: string; actions?: any[]; tokenId?: string }) => Promise<ProposalData>;
  listProposals: (params?: { tokenId?: string; state?: string; limit?: number }) => Promise<ProposalData[]>;
  getProposal: (proposalId: string) => Promise<ProposalData | null>;
  castVote: (proposalId: string, vote: 'for' | 'against' | 'abstain', reason?: string) => Promise<void>;
  getVotingPower: (address: string, tokenId?: string) => Promise<VotingPowerData | null>;
  delegate: (to: string, tokenId: string) => Promise<void>;
  finalizeProposal: (proposalId: string) => Promise<ProposalData>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useGovernance(): UseGovernanceReturn {
  const { modules } = useTokenisation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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
    [],
  );

  const createProposal = useCallback(
    (params: { title: string; description: string; actions?: any[]; tokenId?: string }) =>
      wrapAsync(async () => {
        const result = await modules.governance.createProposal(params as any);
        return (result as any).data;
      }),
    [modules.governance, wrapAsync],
  );

  const listProposals = useCallback(
    (params?: { tokenId?: string; state?: string; limit?: number }) =>
      wrapAsync(async () => {
        const result = await modules.governance.listProposals(params as any);
        return (result as any).data ?? [];
      }),
    [modules.governance, wrapAsync],
  );

  const getProposal = useCallback(
    (proposalId: string) =>
      wrapAsync(async () => {
        const result = await modules.governance.getProposal(proposalId);
        return (result as any).data ?? null;
      }),
    [modules.governance, wrapAsync],
  );

  const castVote = useCallback(
    (proposalId: string, vote: 'for' | 'against' | 'abstain', reason?: string) =>
      wrapAsync(async () => {
        await modules.governance.castVote(proposalId, { vote, reason } as any);
      }),
    [modules.governance, wrapAsync],
  );

  const getVotingPower = useCallback(
    (address: string, tokenId?: string) =>
      wrapAsync(async () => {
        const result = await modules.governance.getVotingPower(address, tokenId as any);
        return (result as any).data ?? null;
      }),
    [modules.governance, wrapAsync],
  );

  const delegate = useCallback(
    (to: string, tokenId: string) =>
      wrapAsync(async () => {
        await modules.governance.delegate({ to, tokenId } as any);
      }),
    [modules.governance, wrapAsync],
  );

  const finalizeProposal = useCallback(
    (proposalId: string) =>
      wrapAsync(async () => {
        const result = await modules.governance.finalizeProposal(proposalId);
        return (result as any).data;
      }),
    [modules.governance, wrapAsync],
  );

  return {
    createProposal, listProposals, getProposal, castVote,
    getVotingPower, delegate, finalizeProposal,
    loading, error,
  };
}
