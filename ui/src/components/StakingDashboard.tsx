/**
 * StakingDashboard - AHOY Token Staking Interface
 *
 * Comprehensive staking dashboard with:
 * - Token balance and staking positions
 * - Stake/Unstake functionality
 * - Reward tracking and claiming
 * - Vesting schedule display
 * - Governance voting
 */

import { useState } from 'react';
import {
  Coins, TrendingUp, Lock, Unlock, Gift, Vote, Clock,
  ArrowRight, ChevronDown, Check, AlertCircle, Wallet,
  BarChart3, PieChart, Calendar, Shield
} from 'lucide-react';
import {
  useAhoyTokenInfo,
  useAhoyBalance,
  useAhoyStaking,
  useVesting,
  useRewardHistory,
  useGovernance,
} from '../hooks/useAhoyToken';
import { useWallet } from '../hooks/useWallet';

// ============================================================================
// TYPES
// ============================================================================

type TabId = 'overview' | 'stake' | 'rewards' | 'governance';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  color = 'amber',
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ElementType;
  color?: 'amber' | 'green' | 'blue' | 'purple';
}) {
  const colorClasses = {
    amber: 'text-[#F8B032] bg-[#F8B032]/10',
    green: 'text-green-400 bg-green-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
  };

  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
          {subValue && <p className="text-xs text-gray-500">{subValue}</p>}
        </div>
      </div>
    </div>
  );
}

function StakingTierCard({
  days,
  apy,
  minAmount,
  isSelected,
  onSelect,
}: {
  days: number;
  apy: number;
  minAmount: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`p-4 rounded-xl border text-left transition-all hover:-translate-y-1 ${
        isSelected
          ? 'border-[#F8B032] bg-[#F8B032]/10'
          : 'border-white/10 bg-white/5 hover:border-white/20'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg font-bold text-white">{days} Days</span>
        {isSelected && <Check className="w-5 h-5 text-[#F8B032]" />}
      </div>
      <p className="text-2xl font-bold text-[#F8B032]">{apy}% APY</p>
      <p className="text-xs text-gray-500 mt-1">Min: {parseInt(minAmount).toLocaleString()} AHOY</p>
    </button>
  );
}

function PositionCard({
  position,
  onUnstake,
  onClaimRewards,
}: {
  position: {
    id: string;
    amount: string;
    lockPeriod: number;
    unlockTime: Date;
    apy: number;
    rewards: string;
    status: 'LOCKED' | 'UNLOCKED' | 'UNSTAKING';
  };
  onUnstake: () => void;
  onClaimRewards: () => void;
}) {
  const isLocked = position.status === 'LOCKED';
  const daysRemaining = Math.max(
    0,
    Math.ceil((position.unlockTime.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );

  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isLocked ? (
            <Lock className="w-5 h-5 text-amber-400" />
          ) : (
            <Unlock className="w-5 h-5 text-green-400" />
          )}
          <span className="font-medium text-white">{position.lockPeriod} Day Lock</span>
        </div>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            isLocked
              ? 'bg-amber-500/10 text-amber-400'
              : position.status === 'UNSTAKING'
              ? 'bg-blue-500/10 text-blue-400'
              : 'bg-green-500/10 text-green-400'
          }`}
        >
          {position.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 uppercase">Staked</p>
          <p className="text-lg font-bold text-white">
            {parseInt(position.amount).toLocaleString()} AHOY
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">APY</p>
          <p className="text-lg font-bold text-[#F8B032]">{position.apy}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Rewards</p>
          <p className="text-lg font-bold text-green-400">{position.rewards} AHOY</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">
            {isLocked ? 'Unlocks In' : 'Status'}
          </p>
          <p className="text-lg font-bold text-white">
            {isLocked ? `${daysRemaining} days` : 'Ready'}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {parseFloat(position.rewards) > 0 && (
          <button
            onClick={onClaimRewards}
            className="flex-1 px-4 py-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <Gift className="w-4 h-4" />
            Claim Rewards
          </button>
        )}
        {!isLocked && position.status !== 'UNSTAKING' && (
          <button
            onClick={onUnstake}
            className="flex-1 px-4 py-2 bg-[#F8B032]/10 text-[#F8B032] rounded-lg hover:bg-[#F8B032]/20 transition-colors flex items-center justify-center gap-2"
          >
            <Unlock className="w-4 h-4" />
            Unstake
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StakingDashboard() {
  const { address, isConnected } = useWallet();
  const tokenInfo = useAhoyTokenInfo();
  const { balance } = useAhoyBalance();
  const {
    positions,
    totalStaked,
    totalRewards,
    stakingTiers,
    isLoading,
    stake,
    unstake,
    claimRewards,
  } = useAhoyStaking();
  const { schedules } = useVesting();
  const { rewards: rewardHistory, totalEarned } = useRewardHistory();
  const { proposals, votingPower, vote } = useGovernance();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [stakeAmount, setStakeAmount] = useState('');
  const [selectedTier, setSelectedTier] = useState(stakingTiers[0]);
  const [isStaking, setIsStaking] = useState(false);

  const handleStake = async () => {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) return;

    setIsStaking(true);
    const result = await stake(stakeAmount, selectedTier.days);
    setIsStaking(false);

    if (result.success) {
      setStakeAmount('');
    }
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0B1120] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-[#F8B032]/10 flex items-center justify-center mx-auto mb-6">
              <Wallet className="w-10 h-10 text-[#F8B032]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-6">
              Connect your wallet to view your AHOY staking positions and rewards.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">AHOY Staking</h1>
            <p className="text-gray-400">Stake AHOY to earn rewards and participate in governance</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-400">AHOY Price</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-white">${tokenInfo.price}</span>
                <span className="text-sm text-green-400">+{tokenInfo.priceChange24h}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Available Balance"
            value={`${balance?.formatted || '0'} AHOY`}
            subValue={`$${(parseFloat(balance?.formatted?.replace(/,/g, '') || '0') * parseFloat(tokenInfo.price)).toLocaleString()}`}
            icon={Coins}
            color="amber"
          />
          <StatCard
            label="Total Staked"
            value={`${parseInt(totalStaked).toLocaleString()} AHOY`}
            subValue={`$${(parseFloat(totalStaked) * parseFloat(tokenInfo.price)).toLocaleString()}`}
            icon={Lock}
            color="blue"
          />
          <StatCard
            label="Pending Rewards"
            value={`${parseFloat(totalRewards).toLocaleString()} AHOY`}
            subValue={`$${(parseFloat(totalRewards) * parseFloat(tokenInfo.price)).toLocaleString()}`}
            icon={Gift}
            color="green"
          />
          <StatCard
            label="Voting Power"
            value={`${parseInt(votingPower).toLocaleString()}`}
            subValue="Based on staked balance"
            icon={Vote}
            color="purple"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-2">
          {[
            { id: 'overview', label: 'Overview', icon: PieChart },
            { id: 'stake', label: 'Stake', icon: Lock },
            { id: 'rewards', label: 'Rewards', icon: Gift },
            { id: 'governance', label: 'Governance', icon: Vote },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as TabId)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                activeTab === id
                  ? 'bg-[#F8B032]/10 text-[#F8B032]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Active Positions */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-[#F8B032]" />
                  Active Positions
                </h3>
                {positions.length === 0 ? (
                  <div className="p-6 bg-white/5 rounded-xl border border-white/10 text-center">
                    <p className="text-gray-400">No active staking positions</p>
                    <button
                      onClick={() => setActiveTab('stake')}
                      className="mt-4 px-4 py-2 bg-[#F8B032] text-black rounded-lg font-medium"
                    >
                      Start Staking
                    </button>
                  </div>
                ) : (
                  positions.map((position) => (
                    <PositionCard
                      key={position.id}
                      position={position}
                      onUnstake={() => unstake(position.id)}
                      onClaimRewards={() => claimRewards(position.id)}
                    />
                  ))
                )}
              </div>

              {/* Vesting & Recent Rewards */}
              <div className="space-y-6">
                {/* Vesting Schedule */}
                {schedules.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-purple-400" />
                      Vesting Schedule
                    </h3>
                    {schedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="p-4 bg-white/5 rounded-xl border border-white/10"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-medium text-white">Token Vesting</span>
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              schedule.isCliffReached
                                ? 'bg-green-500/10 text-green-400'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}
                          >
                            {schedule.isCliffReached ? 'Active' : 'Cliff Period'}
                          </span>
                        </div>
                        <div className="mb-3">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-400">Progress</span>
                            <span className="text-white">
                              {parseInt(schedule.releasedAmount).toLocaleString()} /{' '}
                              {parseInt(schedule.totalAmount).toLocaleString()} AHOY
                            </span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full"
                              style={{
                                width: `${
                                  (parseInt(schedule.releasedAmount) /
                                    parseInt(schedule.totalAmount)) *
                                  100
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          Next release: {schedule.nextRelease.toLocaleDateString()} (~
                          {schedule.releaseRate} AHOY/day)
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent Rewards */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Gift className="w-5 h-5 text-green-400" />
                      Recent Rewards
                    </h3>
                    <span className="text-sm text-gray-400">
                      Total Earned: <span className="text-green-400">{totalEarned} AHOY</span>
                    </span>
                  </div>
                  <div className="space-y-2">
                    {rewardHistory.slice(0, 5).map((reward) => (
                      <div
                        key={reward.id}
                        className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              reward.type === 'STAKING'
                                ? 'bg-blue-500/10'
                                : reward.type === 'DELIVERY'
                                ? 'bg-amber-500/10'
                                : 'bg-green-500/10'
                            }`}
                          >
                            {reward.type === 'STAKING' ? (
                              <TrendingUp className="w-4 h-4 text-blue-400" />
                            ) : reward.type === 'DELIVERY' ? (
                              <Shield className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Gift className="w-4 h-4 text-green-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{reward.type}</p>
                            <p className="text-xs text-gray-500">{reward.source}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-400">+{reward.amount} AHOY</p>
                          <p className="text-xs text-gray-500">
                            {reward.timestamp.toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stake Tab */}
          {activeTab === 'stake' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="p-6 bg-white/5 rounded-xl border border-white/10">
                <h3 className="text-lg font-bold text-white mb-4">Stake AHOY Tokens</h3>

                {/* Amount Input */}
                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-2">Amount to Stake</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <button
                        onClick={() => setStakeAmount(balance?.formatted?.replace(/,/g, '') || '0')}
                        className="px-2 py-1 text-xs bg-[#F8B032]/10 text-[#F8B032] rounded"
                      >
                        MAX
                      </button>
                      <span className="text-gray-400">AHOY</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Available: {balance?.formatted || '0'} AHOY
                  </p>
                </div>

                {/* Lock Period Selection */}
                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-3">Lock Period</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {stakingTiers.map((tier) => (
                      <StakingTierCard
                        key={tier.days}
                        days={tier.days}
                        apy={tier.apy}
                        minAmount={tier.minAmount}
                        isSelected={selectedTier.days === tier.days}
                        onSelect={() => setSelectedTier(tier)}
                      />
                    ))}
                  </div>
                </div>

                {/* Estimated Rewards */}
                {stakeAmount && parseFloat(stakeAmount) > 0 && (
                  <div className="p-4 bg-[#F8B032]/10 rounded-lg mb-6">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300">Estimated Annual Rewards</span>
                      <span className="text-xl font-bold text-[#F8B032]">
                        {(
                          (parseFloat(stakeAmount) * selectedTier.apy) /
                          100
                        ).toLocaleString()}{' '}
                        AHOY
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Based on {selectedTier.apy}% APY over {selectedTier.days} days
                    </p>
                  </div>
                )}

                {/* Stake Button */}
                <button
                  onClick={handleStake}
                  disabled={
                    isStaking ||
                    !stakeAmount ||
                    parseFloat(stakeAmount) < parseFloat(selectedTier.minAmount)
                  }
                  className="w-full py-3 bg-[#F8B032] text-black font-bold rounded-lg hover:bg-[#F8B032]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isStaking ? (
                    <>
                      <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Staking...
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      Stake AHOY
                    </>
                  )}
                </button>

                {parseFloat(stakeAmount || '0') < parseFloat(selectedTier.minAmount) &&
                  stakeAmount && (
                    <p className="text-sm text-amber-400 mt-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Minimum stake for this tier is {parseInt(selectedTier.minAmount).toLocaleString()}{' '}
                      AHOY
                    </p>
                  )}
              </div>
            </div>
          )}

          {/* Rewards Tab */}
          {activeTab === 'rewards' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  label="Total Earned (All Time)"
                  value={`${totalEarned} AHOY`}
                  icon={TrendingUp}
                  color="green"
                />
                <StatCard
                  label="Pending Rewards"
                  value={`${parseFloat(totalRewards).toLocaleString()} AHOY`}
                  icon={Gift}
                  color="amber"
                />
                <StatCard
                  label="Reward Sources"
                  value={`${new Set(rewardHistory.map((r) => r.type)).size}`}
                  icon={BarChart3}
                  color="blue"
                />
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <div className="p-4 border-b border-white/10">
                  <h3 className="font-bold text-white">Reward History</h3>
                </div>
                <div className="divide-y divide-white/5">
                  {rewardHistory.map((reward) => (
                    <div key={reward.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            reward.type === 'STAKING'
                              ? 'bg-blue-500/10'
                              : reward.type === 'DELIVERY'
                              ? 'bg-amber-500/10'
                              : reward.type === 'DATA_SHARE'
                              ? 'bg-cyan-500/10'
                              : reward.type === 'REFERRAL'
                              ? 'bg-purple-500/10'
                              : 'bg-green-500/10'
                          }`}
                        >
                          {reward.type === 'STAKING' && (
                            <TrendingUp className="w-5 h-5 text-blue-400" />
                          )}
                          {reward.type === 'DELIVERY' && (
                            <Shield className="w-5 h-5 text-amber-400" />
                          )}
                          {reward.type === 'DATA_SHARE' && (
                            <BarChart3 className="w-5 h-5 text-cyan-400" />
                          )}
                          {reward.type === 'REFERRAL' && (
                            <Gift className="w-5 h-5 text-purple-400" />
                          )}
                          {reward.type === 'GOVERNANCE' && (
                            <Vote className="w-5 h-5 text-green-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-white">
                            {reward.type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-sm text-gray-500">Source: {reward.source}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-400">+{reward.amount} AHOY</p>
                        <p className="text-xs text-gray-500">
                          {reward.timestamp.toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Governance Tab */}
          {activeTab === 'governance' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Active Proposals</h3>
                  <p className="text-sm text-gray-400">
                    Your Voting Power: <span className="text-[#F8B032]">{parseInt(votingPower).toLocaleString()}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {proposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="p-6 bg-white/5 rounded-xl border border-white/10"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-500">{proposal.id}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              proposal.status === 'ACTIVE'
                                ? 'bg-blue-500/10 text-blue-400'
                                : proposal.status === 'PASSED'
                                ? 'bg-green-500/10 text-green-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}
                          >
                            {proposal.status}
                          </span>
                        </div>
                        <h4 className="text-lg font-bold text-white">{proposal.title}</h4>
                        <p className="text-sm text-gray-400 mt-1">{proposal.description}</p>
                      </div>
                    </div>

                    {/* Voting Progress */}
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-green-400">
                          For: {(parseInt(proposal.votesFor) / 1e6).toFixed(1)}M
                        </span>
                        <span className="text-red-400">
                          Against: {(parseInt(proposal.votesAgainst) / 1e6).toFixed(1)}M
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-green-500"
                          style={{
                            width: `${
                              (parseInt(proposal.votesFor) /
                                (parseInt(proposal.votesFor) + parseInt(proposal.votesAgainst))) *
                              100
                            }%`,
                          }}
                        />
                        <div
                          className="h-full bg-red-500"
                          style={{
                            width: `${
                              (parseInt(proposal.votesAgainst) /
                                (parseInt(proposal.votesFor) + parseInt(proposal.votesAgainst))) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Quorum: {(parseInt(proposal.quorum) / 1e6).toFixed(1)}M required
                      </p>
                    </div>

                    {/* Vote Buttons */}
                    {proposal.status === 'ACTIVE' && (
                      <div className="flex gap-3">
                        <button
                          onClick={() => vote(proposal.id, true)}
                          className="flex-1 py-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4" />
                          Vote For
                        </button>
                        <button
                          onClick={() => vote(proposal.id, false)}
                          className="flex-1 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                        >
                          <AlertCircle className="w-4 h-4" />
                          Vote Against
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10 text-xs text-gray-500">
                      <span>Proposed by: {proposal.proposer}</span>
                      <span>
                        {proposal.status === 'ACTIVE'
                          ? `Ends: ${proposal.endTime.toLocaleDateString()}`
                          : `Ended: ${proposal.endTime.toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
