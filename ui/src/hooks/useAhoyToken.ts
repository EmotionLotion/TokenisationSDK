/**
 * useAhoyToken - AHOY Token Economy Hooks
 *
 * Provides React hooks for interacting with the AHOY token ecosystem:
 * - Token balance and transfers
 * - Staking and rewards
 * - Vesting schedules
 * - Governance voting
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSDK, useAhoyState } from '../contexts/SDKContext';
import { useTokenBalance } from './useBlockchain';
import { useWallet } from './useWallet';

// ============================================================================
// TYPES
// ============================================================================

export interface AhoyTokenInfo {
  address: string;
  symbol: string;
  name: string;
  totalSupply: string;
  circulatingSupply: string;
  stakedSupply: string;
  price: string;
  priceChange24h: number;
  marketCap: string;
}

export interface StakingPosition {
  id: string;
  amount: string;
  startTime: Date;
  lockPeriod: number; // days
  unlockTime: Date;
  apy: number;
  rewards: string;
  status: 'LOCKED' | 'UNLOCKED' | 'UNSTAKING';
}

export interface VestingSchedule {
  id: string;
  beneficiary: string;
  totalAmount: string;
  releasedAmount: string;
  remainingAmount: string;
  startTime: Date;
  cliffDuration: number; // days
  vestingDuration: number; // days
  isCliffReached: boolean;
  nextRelease: Date;
  releaseRate: string; // per day
}

export interface RewardEvent {
  id: string;
  type: 'STAKING' | 'DELIVERY' | 'DATA_SHARE' | 'REFERRAL' | 'GOVERNANCE';
  amount: string;
  source: string;
  timestamp: Date;
  txHash?: string;
}

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status: 'ACTIVE' | 'PASSED' | 'REJECTED' | 'EXECUTED' | 'CANCELLED';
  votesFor: string;
  votesAgainst: string;
  quorum: string;
  startTime: Date;
  endTime: Date;
  actions: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Mock AHOY token address (would be real contract address in production)
const AHOY_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000001';

const STAKING_TIERS = [
  { days: 30, apy: 8, minAmount: '1000' },
  { days: 90, apy: 12, minAmount: '5000' },
  { days: 180, apy: 18, minAmount: '10000' },
  { days: 365, apy: 25, minAmount: '50000' },
];

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for AHOY token information
 */
export function useAhoyTokenInfo(): AhoyTokenInfo {
  return useMemo(() => ({
    address: AHOY_TOKEN_ADDRESS,
    symbol: 'AHOY',
    name: 'Ahoy Token',
    totalSupply: '1,000,000,000',
    circulatingSupply: '450,000,000',
    stakedSupply: '125,000,000',
    price: '0.042',
    priceChange24h: 3.45,
    marketCap: '18,900,000',
  }), []);
}

/**
 * Hook for user's AHOY token balance
 */
export function useAhoyBalance() {
  const { address } = useWallet();
  const { ahoyState } = useAhoyState();
  const { balance: tokenBalance, isLoading, error } = useTokenBalance(
    address ? AHOY_TOKEN_ADDRESS : null
  );

  // Fallback to simulated balance if no real token connection
  const simulatedBalance = useMemo(() => {
    if (!address) return null;
    // Use ahoyState.balance which is the points balance
    const ahoyBalance = ahoyState.balance || '25000';
    return {
      address: AHOY_TOKEN_ADDRESS,
      symbol: 'AHOY',
      name: 'Ahoy Token',
      balance: (parseFloat(ahoyBalance) * 1e18).toString(),
      decimals: 18,
      formatted: parseFloat(ahoyBalance).toLocaleString(),
    };
  }, [address, ahoyState.balance]);

  return {
    balance: tokenBalance || simulatedBalance,
    isLoading,
    error,
  };
}

/**
 * Hook for staking AHOY tokens
 */
export function useAhoyStaking() {
  const { address } = useWallet();
  const { simulateAhoyAction } = useAhoyState();
  const [positions, setPositions] = useState<StakingPosition[]>([]);
  const [totalStaked, setTotalStaked] = useState('0');
  const [totalRewards, setTotalRewards] = useState('0');
  const [isLoading, setIsLoading] = useState(false);

  // Load existing staking positions (simulated)
  useEffect(() => {
    if (!address) {
      setPositions([]);
      return;
    }

    // Simulated existing positions
    const mockPositions: StakingPosition[] = [
      {
        id: 'STK-001',
        amount: '10000',
        startTime: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        lockPeriod: 90,
        unlockTime: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        apy: 12,
        rewards: '147.95',
        status: 'LOCKED',
      },
      {
        id: 'STK-002',
        amount: '5000',
        startTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        lockPeriod: 180,
        unlockTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        apy: 18,
        rewards: '450.00',
        status: 'UNLOCKED',
      },
    ];

    setPositions(mockPositions);
    setTotalStaked('15000');
    setTotalRewards('597.95');
  }, [address]);

  // Stake tokens
  const stake = useCallback(
    async (amount: string, lockDays: number) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);

      try {
        const tier = STAKING_TIERS.find((t) => t.days === lockDays);
        if (!tier) {
          setIsLoading(false);
          return { success: false, error: 'Invalid lock period' };
        }

        if (parseFloat(amount) < parseFloat(tier.minAmount)) {
          setIsLoading(false);
          return { success: false, error: `Minimum stake is ${tier.minAmount} AHOY` };
        }

        const now = new Date();
        const newPosition: StakingPosition = {
          id: `STK-${Date.now()}`,
          amount,
          startTime: now,
          lockPeriod: lockDays,
          unlockTime: new Date(now.getTime() + lockDays * 24 * 60 * 60 * 1000),
          apy: tier.apy,
          rewards: '0',
          status: 'LOCKED',
        };

        setPositions((prev) => [...prev, newPosition]);
        setTotalStaked((prev) => (parseFloat(prev) + parseFloat(amount)).toString());

        simulateAhoyAction('STAKE_CREATED', 'CONNECT');

        setIsLoading(false);
        return { success: true, positionId: newPosition.id };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Stake failed' };
      }
    },
    [address, simulateAhoyAction]
  );

  // Unstake tokens
  const unstake = useCallback(
    async (positionId: string) => {
      const position = positions.find((p) => p.id === positionId);
      if (!position) return { success: false, error: 'Position not found' };

      if (position.status !== 'UNLOCKED') {
        return { success: false, error: 'Position is still locked' };
      }

      setIsLoading(true);

      try {
        // Mark as unstaking
        setPositions((prev) =>
          prev.map((p) => (p.id === positionId ? { ...p, status: 'UNSTAKING' as const } : p))
        );

        // Simulate unstaking delay
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Remove position
        setPositions((prev) => prev.filter((p) => p.id !== positionId));
        setTotalStaked((prev) => (parseFloat(prev) - parseFloat(position.amount)).toString());

        simulateAhoyAction('STAKE_WITHDRAWN', 'CONNECT');

        setIsLoading(false);
        return { success: true, amountReturned: position.amount, rewards: position.rewards };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Unstake failed' };
      }
    },
    [positions, simulateAhoyAction]
  );

  // Claim rewards
  const claimRewards = useCallback(
    async (positionId: string) => {
      const position = positions.find((p) => p.id === positionId);
      if (!position) return { success: false, error: 'Position not found' };

      if (parseFloat(position.rewards) <= 0) {
        return { success: false, error: 'No rewards to claim' };
      }

      setIsLoading(true);

      try {
        const claimedAmount = position.rewards;

        setPositions((prev) =>
          prev.map((p) => (p.id === positionId ? { ...p, rewards: '0' } : p))
        );
        setTotalRewards((prev) => (parseFloat(prev) - parseFloat(claimedAmount)).toString());

        simulateAhoyAction('REWARDS_CLAIMED', 'CONNECT');

        setIsLoading(false);
        return { success: true, amount: claimedAmount };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Claim failed' };
      }
    },
    [positions, simulateAhoyAction]
  );

  return {
    positions,
    totalStaked,
    totalRewards,
    stakingTiers: STAKING_TIERS,
    isLoading,
    stake,
    unstake,
    claimRewards,
  };
}

/**
 * Hook for vesting schedules
 */
export function useVesting() {
  const { address } = useWallet();
  const [schedules, setSchedules] = useState<VestingSchedule[]>([]);

  useEffect(() => {
    if (!address) {
      setSchedules([]);
      return;
    }

    // Simulated vesting schedules
    const mockSchedules: VestingSchedule[] = [
      {
        id: 'VEST-001',
        beneficiary: address,
        totalAmount: '100000',
        releasedAmount: '25000',
        remainingAmount: '75000',
        startTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        cliffDuration: 90,
        vestingDuration: 730, // 2 years
        isCliffReached: true,
        nextRelease: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        releaseRate: '136.99', // per day
      },
    ];

    setSchedules(mockSchedules);
  }, [address]);

  const claimVested = useCallback(async (scheduleId: string) => {
    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) return { success: false, error: 'Schedule not found' };

    if (!schedule.isCliffReached) {
      return { success: false, error: 'Cliff not reached' };
    }

    // Simulate claim
    return { success: true, amount: schedule.releaseRate };
  }, [schedules]);

  return {
    schedules,
    claimVested,
  };
}

/**
 * Hook for reward history
 */
export function useRewardHistory() {
  const { address } = useWallet();
  const [rewards, setRewards] = useState<RewardEvent[]>([]);

  useEffect(() => {
    if (!address) {
      setRewards([]);
      return;
    }

    // Simulated reward history
    const mockRewards: RewardEvent[] = [
      {
        id: 'RWD-001',
        type: 'STAKING',
        amount: '45.50',
        source: 'STK-001',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'RWD-002',
        type: 'DELIVERY',
        amount: '12.00',
        source: 'COMET',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'RWD-003',
        type: 'DATA_SHARE',
        amount: '8.75',
        source: 'H2O',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'RWD-004',
        type: 'REFERRAL',
        amount: '25.00',
        source: 'FLYPLUS',
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'RWD-005',
        type: 'GOVERNANCE',
        amount: '5.00',
        source: 'PROPOSAL-123',
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    ];

    setRewards(mockRewards);
  }, [address]);

  const totalEarned = useMemo(() => {
    return rewards.reduce((sum, r) => sum + parseFloat(r.amount), 0).toFixed(2);
  }, [rewards]);

  return {
    rewards,
    totalEarned,
  };
}

/**
 * Hook for governance proposals
 */
export function useGovernance() {
  const { address } = useWallet();
  const { simulateAhoyAction } = useAhoyState();
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [votingPower, setVotingPower] = useState('0');

  useEffect(() => {
    if (!address) {
      setProposals([]);
      setVotingPower('0');
      return;
    }

    // Simulated proposals
    const mockProposals: GovernanceProposal[] = [
      {
        id: 'PROP-001',
        title: 'Increase COMET Driver Rewards by 10%',
        description: 'Proposal to increase the AHOY rewards for COMET drivers with excellent reputation scores.',
        proposer: '0x1234...5678',
        status: 'ACTIVE',
        votesFor: '8500000',
        votesAgainst: '2100000',
        quorum: '10000000',
        startTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        actions: ['Update RewardDistributor parameters'],
      },
      {
        id: 'PROP-002',
        title: 'Add New H2O Partner Municipality',
        description: 'Onboard Dubai Municipality as a verified H2O water credit issuer.',
        proposer: '0xabcd...efgh',
        status: 'PASSED',
        votesFor: '15000000',
        votesAgainst: '3000000',
        quorum: '10000000',
        startTime: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        actions: ['Whitelist Dubai Municipality address', 'Grant H2O_ISSUER role'],
      },
    ];

    setProposals(mockProposals);
    setVotingPower('15000'); // Based on staked tokens
  }, [address]);

  const vote = useCallback(
    async (proposalId: string, support: boolean) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      const proposal = proposals.find((p) => p.id === proposalId);
      if (!proposal || proposal.status !== 'ACTIVE') {
        return { success: false, error: 'Proposal not active' };
      }

      try {
        setProposals((prev) =>
          prev.map((p) => {
            if (p.id !== proposalId) return p;
            return {
              ...p,
              votesFor: support
                ? (parseInt(p.votesFor) + parseInt(votingPower)).toString()
                : p.votesFor,
              votesAgainst: !support
                ? (parseInt(p.votesAgainst) + parseInt(votingPower)).toString()
                : p.votesAgainst,
            };
          })
        );

        simulateAhoyAction('VOTE_CAST', 'CONNECT');

        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Vote failed' };
      }
    },
    [address, proposals, votingPower, simulateAhoyAction]
  );

  return {
    proposals,
    votingPower,
    vote,
  };
}

/**
 * Unified hook for all AHOY token functionality
 */
export function useAhoyEconomy() {
  const tokenInfo = useAhoyTokenInfo();
  const balance = useAhoyBalance();
  const staking = useAhoyStaking();
  const vesting = useVesting();
  const rewards = useRewardHistory();
  const governance = useGovernance();

  return {
    tokenInfo,
    balance,
    staking,
    vesting,
    rewards,
    governance,
  };
}
