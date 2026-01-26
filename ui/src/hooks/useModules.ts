/**
 * useModules - SDK Module Integration Hooks
 *
 * Provides React hooks for CashFlow, Governance, and Escrow modules
 */

import { useState, useCallback, useEffect } from 'react';
import { useSDK, useAhoyState } from '../contexts/SDKContext';
import { useWallet } from './useWallet';

// ============================================================================
// CASHFLOW TYPES
// ============================================================================

export type DistributionType = 'DIVIDEND' | 'INTEREST' | 'ROYALTY' | 'REVENUE_SHARE' | 'RENT' | 'PROFIT_SHARE' | 'YIELD' | 'CUSTOM';
export type DistributionFrequency = 'ONE_TIME' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'ON_DEMAND';
export type AllocationStrategy = 'PRO_RATA' | 'EQUAL' | 'TIERED' | 'TIME_WEIGHTED' | 'CUSTOM';
export type DistributionStatus = 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED' | 'CANCELLED';

export interface DistributionSchedule {
  id: string;
  assetId: string;
  assetName: string;
  type: DistributionType;
  frequency: DistributionFrequency;
  allocationStrategy: AllocationStrategy;
  paymentCurrency: string;
  amount: string;
  rate?: number;
  startDate: Date;
  endDate?: Date;
  nextDistribution?: Date;
  isActive: boolean;
  totalDistributed: string;
  holdersCount: number;
}

export interface Distribution {
  id: string;
  scheduleId: string;
  assetName: string;
  type: DistributionType;
  amount: string;
  currency: string;
  recipientsCount: number;
  status: DistributionStatus;
  executedAt: Date;
  claimedAmount: string;
  unclaimedAmount: string;
}

export interface UnclaimedPayout {
  id: string;
  distributionId: string;
  assetName: string;
  type: DistributionType;
  amount: string;
  currency: string;
  availableSince: Date;
  expiresAt?: Date;
}

// ============================================================================
// GOVERNANCE TYPES
// ============================================================================

export type ProposalType = 'GENERAL' | 'PARAMETER_CHANGE' | 'TREASURY' | 'UPGRADE' | 'EMERGENCY' | 'MEMBERSHIP' | 'CUSTOM';
export type VoteType = 'FOR' | 'AGAINST' | 'ABSTAIN';
export type VotingStrategy = 'TOKEN_WEIGHTED' | 'ONE_PERSON_ONE_VOTE' | 'QUADRATIC' | 'CONVICTION' | 'RANKED_CHOICE' | 'APPROVAL';
export type ProposalStatus = 'DRAFT' | 'ACTIVE' | 'PASSED' | 'FAILED' | 'QUEUED' | 'EXECUTED' | 'EXPIRED' | 'CANCELLED';

export interface Proposal {
  id: string;
  assetId: string;
  type: ProposalType;
  title: string;
  description: string;
  proposer: string;
  status: ProposalStatus;
  votesFor: string;
  votesAgainst: string;
  votesAbstain: string;
  quorumRequired: string;
  quorumReached: boolean;
  votingEndsAt: Date;
  executionDelay: number;
  createdAt: Date;
  hasVoted?: boolean;
  userVote?: VoteType;
}

export interface VoteDelegation {
  id: string;
  from: string;
  to: string;
  assetId: string;
  votingPower: string;
  expiresAt?: Date;
  createdAt: Date;
}

// ============================================================================
// ESCROW TYPES
// ============================================================================

export type EscrowType = 'SIMPLE' | 'TIME_LOCKED' | 'MILESTONE' | 'MULTI_SIG' | 'ATOMIC_SWAP' | 'CONDITIONAL' | 'DISPUTE';
export type EscrowStatus = 'DRAFT' | 'FUNDED' | 'ACTIVE' | 'PENDING_RELEASE' | 'PARTIALLY_RELEASED' | 'RELEASED' | 'REFUNDED' | 'DISPUTED' | 'EXPIRED' | 'CANCELLED';
export type ReleaseConditionType = 'TIME' | 'SIGNATURE' | 'ORACLE' | 'MILESTONE' | 'MULTI_SIG' | 'EXTERNAL' | 'CUSTOM';

export interface Milestone {
  id: string;
  title: string;
  description: string;
  releasePercentage: number;
  isCompleted: boolean;
  completedAt?: Date;
  evidence?: string;
  approvedBy?: string[];
}

export interface Escrow {
  id: string;
  type: EscrowType;
  status: EscrowStatus;
  title: string;
  description: string;
  totalAmount: string;
  currency: string;
  releasedAmount: string;
  depositor: string;
  beneficiary: string;
  arbiter?: string;
  milestones: Milestone[];
  createdAt: Date;
  expiresAt?: Date;
  fundedAt?: Date;
}

// ============================================================================
// CASHFLOW HOOK
// ============================================================================

export function useCashFlow(assetId?: string) {
  const { assets } = useSDK();
  const { simulateAhoyAction } = useAhoyState();
  const { address } = useWallet();

  const [schedules, setSchedules] = useState<DistributionSchedule[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [unclaimedPayouts, setUnclaimedPayouts] = useState<UnclaimedPayout[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Generate demo schedules
  useEffect(() => {
    const demoSchedules: DistributionSchedule[] = [
      {
        id: 'sched-1',
        assetId: 'asset-dubai-tower',
        assetName: 'Dubai Marina Tower',
        type: 'DIVIDEND',
        frequency: 'QUARTERLY',
        allocationStrategy: 'PRO_RATA',
        paymentCurrency: 'USDC',
        amount: '50000',
        startDate: new Date('2024-01-01'),
        nextDistribution: new Date('2026-04-01'),
        isActive: true,
        totalDistributed: '150000',
        holdersCount: 124,
      },
      {
        id: 'sched-2',
        assetId: 'asset-bond-01',
        assetName: 'Corporate Bond Series A',
        type: 'INTEREST',
        frequency: 'SEMI_ANNUAL',
        allocationStrategy: 'PRO_RATA',
        paymentCurrency: 'USDC',
        amount: '0',
        rate: 5.5,
        startDate: new Date('2024-06-01'),
        nextDistribution: new Date('2026-06-01'),
        isActive: true,
        totalDistributed: '275000',
        holdersCount: 45,
      },
      {
        id: 'sched-3',
        assetId: 'asset-music-royalty',
        assetName: 'Music Royalty Pool',
        type: 'ROYALTY',
        frequency: 'MONTHLY',
        allocationStrategy: 'TIME_WEIGHTED',
        paymentCurrency: 'AHOY',
        amount: '12500',
        startDate: new Date('2025-01-01'),
        nextDistribution: new Date('2026-02-01'),
        isActive: true,
        totalDistributed: '162500',
        holdersCount: 892,
      },
    ];

    const demoDistributions: Distribution[] = [
      {
        id: 'dist-1',
        scheduleId: 'sched-1',
        assetName: 'Dubai Marina Tower',
        type: 'DIVIDEND',
        amount: '50000',
        currency: 'USDC',
        recipientsCount: 118,
        status: 'COMPLETED',
        executedAt: new Date('2026-01-01'),
        claimedAmount: '48500',
        unclaimedAmount: '1500',
      },
      {
        id: 'dist-2',
        scheduleId: 'sched-3',
        assetName: 'Music Royalty Pool',
        type: 'ROYALTY',
        amount: '12500',
        currency: 'AHOY',
        recipientsCount: 845,
        status: 'COMPLETED',
        executedAt: new Date('2026-01-01'),
        claimedAmount: '11200',
        unclaimedAmount: '1300',
      },
    ];

    const demoUnclaimed: UnclaimedPayout[] = [
      {
        id: 'unc-1',
        distributionId: 'dist-1',
        assetName: 'Dubai Marina Tower',
        type: 'DIVIDEND',
        amount: '425.50',
        currency: 'USDC',
        availableSince: new Date('2026-01-01'),
        expiresAt: new Date('2026-07-01'),
      },
      {
        id: 'unc-2',
        distributionId: 'dist-2',
        assetName: 'Music Royalty Pool',
        type: 'ROYALTY',
        amount: '156.25',
        currency: 'AHOY',
        availableSince: new Date('2026-01-01'),
      },
    ];

    setSchedules(demoSchedules);
    setDistributions(demoDistributions);
    setUnclaimedPayouts(demoUnclaimed);
  }, [assetId]);

  const createSchedule = useCallback(async (params: Partial<DistributionSchedule>) => {
    setIsLoading(true);

    const newSchedule: DistributionSchedule = {
      id: `sched-${Date.now()}`,
      assetId: params.assetId || 'asset-new',
      assetName: params.assetName || 'New Asset',
      type: params.type || 'DIVIDEND',
      frequency: params.frequency || 'QUARTERLY',
      allocationStrategy: params.allocationStrategy || 'PRO_RATA',
      paymentCurrency: params.paymentCurrency || 'USDC',
      amount: params.amount || '0',
      rate: params.rate,
      startDate: params.startDate || new Date(),
      nextDistribution: params.startDate || new Date(),
      isActive: true,
      totalDistributed: '0',
      holdersCount: 0,
    };

    setSchedules(prev => [...prev, newSchedule]);
    simulateAhoyAction('DISTRIBUTION_CREATED', 'CONNECT');

    setIsLoading(false);
    return { success: true, scheduleId: newSchedule.id };
  }, [simulateAhoyAction]);

  const claimPayout = useCallback(async (payoutId: string) => {
    setIsLoading(true);

    const payout = unclaimedPayouts.find(p => p.id === payoutId);
    if (payout) {
      setUnclaimedPayouts(prev => prev.filter(p => p.id !== payoutId));
      simulateAhoyAction('PAYOUT_CLAIMED', 'CONNECT');
    }

    setIsLoading(false);
    return { success: true };
  }, [unclaimedPayouts, simulateAhoyAction]);

  const executeDistribution = useCallback(async (scheduleId: string) => {
    setIsLoading(true);

    const schedule = schedules.find(s => s.id === scheduleId);
    if (schedule) {
      const newDistribution: Distribution = {
        id: `dist-${Date.now()}`,
        scheduleId,
        assetName: schedule.assetName,
        type: schedule.type,
        amount: schedule.amount,
        currency: schedule.paymentCurrency,
        recipientsCount: schedule.holdersCount,
        status: 'COMPLETED',
        executedAt: new Date(),
        claimedAmount: '0',
        unclaimedAmount: schedule.amount,
      };

      setDistributions(prev => [newDistribution, ...prev]);
      simulateAhoyAction('DISTRIBUTION_EXECUTED', 'CONNECT');
    }

    setIsLoading(false);
    return { success: true };
  }, [schedules, simulateAhoyAction]);

  return {
    schedules,
    distributions,
    unclaimedPayouts,
    isLoading,
    createSchedule,
    claimPayout,
    executeDistribution,
    totalUnclaimed: unclaimedPayouts.reduce((sum, p) => sum + parseFloat(p.amount), 0),
  };
}

// ============================================================================
// GOVERNANCE HOOK
// ============================================================================

export function useGovernance(assetId?: string) {
  const { assets } = useSDK();
  const { simulateAhoyAction } = useAhoyState();
  const { address } = useWallet();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [delegations, setDelegations] = useState<VoteDelegation[]>([]);
  const [votingPower, setVotingPower] = useState('1000');
  const [isLoading, setIsLoading] = useState(false);

  // Generate demo proposals
  useEffect(() => {
    const demoProposals: Proposal[] = [
      {
        id: 'prop-1',
        assetId: 'asset-dao',
        type: 'TREASURY',
        title: 'Allocate 100,000 AHOY for Developer Grants',
        description: 'This proposal allocates funds from the treasury to support ecosystem developers building on the Ahoy platform. The grants will be distributed over 6 months.',
        proposer: '0x1234...5678',
        status: 'ACTIVE',
        votesFor: '450000',
        votesAgainst: '125000',
        votesAbstain: '25000',
        quorumRequired: '500000',
        quorumReached: true,
        votingEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        executionDelay: 48 * 60 * 60,
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        hasVoted: false,
      },
      {
        id: 'prop-2',
        assetId: 'asset-dao',
        type: 'PARAMETER_CHANGE',
        title: 'Reduce Proposal Threshold to 500 AHOY',
        description: 'Lower the barrier for community members to create proposals by reducing the required token threshold from 1000 to 500 AHOY.',
        proposer: '0x8765...4321',
        status: 'ACTIVE',
        votesFor: '280000',
        votesAgainst: '320000',
        votesAbstain: '50000',
        quorumRequired: '500000',
        quorumReached: true,
        votingEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        executionDelay: 24 * 60 * 60,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        hasVoted: true,
        userVote: 'FOR',
      },
      {
        id: 'prop-3',
        assetId: 'asset-dao',
        type: 'GENERAL',
        title: 'Partner with Dubai Tourism Board',
        description: 'Establish an official partnership with Dubai Tourism Board to integrate Fly+ passes with official tourism programs.',
        proposer: '0x9999...1111',
        status: 'PASSED',
        votesFor: '720000',
        votesAgainst: '180000',
        votesAbstain: '100000',
        quorumRequired: '500000',
        quorumReached: true,
        votingEndsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        executionDelay: 72 * 60 * 60,
        createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
        hasVoted: true,
        userVote: 'FOR',
      },
      {
        id: 'prop-4',
        assetId: 'asset-dao',
        type: 'EMERGENCY',
        title: 'Pause Staking Rewards (Security Audit)',
        description: 'Temporarily pause staking rewards while we conduct a security audit of the reward distribution contract.',
        proposer: '0xABCD...EFGH',
        status: 'EXECUTED',
        votesFor: '890000',
        votesAgainst: '10000',
        votesAbstain: '5000',
        quorumRequired: '500000',
        quorumReached: true,
        votingEndsAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        executionDelay: 0,
        createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
        hasVoted: true,
        userVote: 'FOR',
      },
    ];

    setProposals(demoProposals);
  }, [assetId]);

  const createProposal = useCallback(async (params: {
    type: ProposalType;
    title: string;
    description: string;
  }) => {
    setIsLoading(true);

    const newProposal: Proposal = {
      id: `prop-${Date.now()}`,
      assetId: assetId || 'asset-dao',
      type: params.type,
      title: params.title,
      description: params.description,
      proposer: address || '0x0000...0000',
      status: 'ACTIVE',
      votesFor: '0',
      votesAgainst: '0',
      votesAbstain: '0',
      quorumRequired: '500000',
      quorumReached: false,
      votingEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      executionDelay: 48 * 60 * 60,
      createdAt: new Date(),
      hasVoted: false,
    };

    setProposals(prev => [newProposal, ...prev]);
    simulateAhoyAction('PROPOSAL_CREATED', 'CONNECT');

    setIsLoading(false);
    return { success: true, proposalId: newProposal.id };
  }, [assetId, address, simulateAhoyAction]);

  const vote = useCallback(async (proposalId: string, voteType: VoteType) => {
    setIsLoading(true);

    setProposals(prev => prev.map(p => {
      if (p.id !== proposalId) return p;

      const voteAmount = parseInt(votingPower);
      return {
        ...p,
        votesFor: voteType === 'FOR' ? (parseInt(p.votesFor) + voteAmount).toString() : p.votesFor,
        votesAgainst: voteType === 'AGAINST' ? (parseInt(p.votesAgainst) + voteAmount).toString() : p.votesAgainst,
        votesAbstain: voteType === 'ABSTAIN' ? (parseInt(p.votesAbstain) + voteAmount).toString() : p.votesAbstain,
        hasVoted: true,
        userVote: voteType,
      };
    }));

    simulateAhoyAction('VOTE_CAST', 'CONNECT');

    setIsLoading(false);
    return { success: true };
  }, [votingPower, simulateAhoyAction]);

  const delegate = useCallback(async (toAddress: string, expiresAt?: Date) => {
    setIsLoading(true);

    const delegation: VoteDelegation = {
      id: `del-${Date.now()}`,
      from: address || '0x0000...0000',
      to: toAddress,
      assetId: assetId || 'asset-dao',
      votingPower,
      expiresAt,
      createdAt: new Date(),
    };

    setDelegations(prev => [...prev, delegation]);
    setVotingPower('0');

    setIsLoading(false);
    return { success: true };
  }, [address, assetId, votingPower]);

  return {
    proposals,
    delegations,
    votingPower,
    isLoading,
    createProposal,
    vote,
    delegate,
    activeProposals: proposals.filter(p => p.status === 'ACTIVE'),
    passedProposals: proposals.filter(p => p.status === 'PASSED' || p.status === 'EXECUTED'),
  };
}

// ============================================================================
// ESCROW HOOK
// ============================================================================

export function useEscrow() {
  const { simulateAhoyAction } = useAhoyState();
  const { address } = useWallet();

  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Generate demo escrows
  useEffect(() => {
    const demoEscrows: Escrow[] = [
      {
        id: 'esc-1',
        type: 'MILESTONE',
        status: 'ACTIVE',
        title: 'Patent Purchase Agreement - AI Model',
        description: 'Escrow for the purchase of AI model patent rights with milestone-based release.',
        totalAmount: '250000',
        currency: 'USDC',
        releasedAmount: '100000',
        depositor: 'Ahoy Tech Ltd',
        beneficiary: 'TechCorp AI',
        arbiter: 'Dubai IP Authority',
        milestones: [
          { id: 'm1', title: 'Patent Transfer Initiated', description: 'Legal documents filed', releasePercentage: 20, isCompleted: true, completedAt: new Date('2025-12-01') },
          { id: 'm2', title: 'Due Diligence Complete', description: 'Technical and legal review passed', releasePercentage: 20, isCompleted: true, completedAt: new Date('2025-12-15') },
          { id: 'm3', title: 'Patent Registered', description: 'Ownership transferred in registry', releasePercentage: 30, isCompleted: false },
          { id: 'm4', title: 'Integration Complete', description: 'Patent integrated into platform', releasePercentage: 30, isCompleted: false },
        ],
        createdAt: new Date('2025-11-15'),
        expiresAt: new Date('2026-06-15'),
        fundedAt: new Date('2025-11-20'),
      },
      {
        id: 'esc-2',
        type: 'TIME_LOCKED',
        status: 'FUNDED',
        title: 'Employee Token Vesting',
        description: 'Time-locked vesting for employee AHOY allocation.',
        totalAmount: '50000',
        currency: 'AHOY',
        releasedAmount: '0',
        depositor: 'Ahoy Treasury',
        beneficiary: 'Employee #1042',
        milestones: [
          { id: 'm1', title: '6 Month Cliff', description: 'Initial vesting period', releasePercentage: 25, isCompleted: false },
          { id: 'm2', title: '12 Month Vest', description: 'Year 1 vesting', releasePercentage: 25, isCompleted: false },
          { id: 'm3', title: '24 Month Vest', description: 'Year 2 vesting', releasePercentage: 25, isCompleted: false },
          { id: 'm4', title: '36 Month Vest', description: 'Year 3 vesting', releasePercentage: 25, isCompleted: false },
        ],
        createdAt: new Date('2025-06-01'),
        expiresAt: new Date('2028-06-01'),
        fundedAt: new Date('2025-06-01'),
      },
      {
        id: 'esc-3',
        type: 'CONDITIONAL',
        status: 'PENDING_RELEASE',
        title: 'Flight Delay Insurance Payout',
        description: 'Automatic payout triggered by Chainlink flight delay oracle.',
        totalAmount: '500',
        currency: 'USDC',
        releasedAmount: '0',
        depositor: 'Fly+ Insurance Pool',
        beneficiary: 'Passenger 0x7821...3fa2',
        milestones: [
          { id: 'm1', title: 'Flight Delay Verified', description: 'Oracle confirmed >4hr delay', releasePercentage: 100, isCompleted: true, completedAt: new Date() },
        ],
        createdAt: new Date('2026-01-08'),
        fundedAt: new Date('2026-01-08'),
      },
    ];

    setEscrows(demoEscrows);
  }, []);

  const createEscrow = useCallback(async (params: Partial<Escrow>) => {
    setIsLoading(true);

    const newEscrow: Escrow = {
      id: `esc-${Date.now()}`,
      type: params.type || 'SIMPLE',
      status: 'DRAFT',
      title: params.title || 'New Escrow',
      description: params.description || '',
      totalAmount: params.totalAmount || '0',
      currency: params.currency || 'USDC',
      releasedAmount: '0',
      depositor: params.depositor || address || '',
      beneficiary: params.beneficiary || '',
      milestones: params.milestones || [],
      createdAt: new Date(),
    };

    setEscrows(prev => [newEscrow, ...prev]);
    simulateAhoyAction('ESCROW_CREATED', 'CONNECT');

    setIsLoading(false);
    return { success: true, escrowId: newEscrow.id };
  }, [address, simulateAhoyAction]);

  const fundEscrow = useCallback(async (escrowId: string) => {
    setIsLoading(true);

    setEscrows(prev => prev.map(e =>
      e.id === escrowId ? { ...e, status: 'FUNDED' as EscrowStatus, fundedAt: new Date() } : e
    ));

    setIsLoading(false);
    return { success: true };
  }, []);

  const completeMilestone = useCallback(async (escrowId: string, milestoneId: string, evidence?: string) => {
    setIsLoading(true);

    setEscrows(prev => prev.map(e => {
      if (e.id !== escrowId) return e;

      const updatedMilestones = e.milestones.map(m =>
        m.id === milestoneId ? { ...m, isCompleted: true, completedAt: new Date(), evidence } : m
      );

      const completedPercentage = updatedMilestones
        .filter(m => m.isCompleted)
        .reduce((sum, m) => sum + m.releasePercentage, 0);

      const releasedAmount = (parseFloat(e.totalAmount) * completedPercentage / 100).toString();

      return {
        ...e,
        milestones: updatedMilestones,
        releasedAmount,
        status: completedPercentage >= 100 ? 'RELEASED' as EscrowStatus : e.status,
      };
    }));

    simulateAhoyAction('MILESTONE_COMPLETED', 'CONNECT');

    setIsLoading(false);
    return { success: true };
  }, [simulateAhoyAction]);

  const releaseEscrow = useCallback(async (escrowId: string) => {
    setIsLoading(true);

    setEscrows(prev => prev.map(e =>
      e.id === escrowId ? { ...e, status: 'RELEASED' as EscrowStatus, releasedAmount: e.totalAmount } : e
    ));

    simulateAhoyAction('ESCROW_RELEASED', 'CONNECT');

    setIsLoading(false);
    return { success: true };
  }, [simulateAhoyAction]);

  return {
    escrows,
    isLoading,
    createEscrow,
    fundEscrow,
    completeMilestone,
    releaseEscrow,
    activeEscrows: escrows.filter(e => ['ACTIVE', 'FUNDED', 'PENDING_RELEASE'].includes(e.status)),
    completedEscrows: escrows.filter(e => e.status === 'RELEASED'),
  };
}
