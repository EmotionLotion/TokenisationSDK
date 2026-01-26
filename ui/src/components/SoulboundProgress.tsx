/**
 * SoulboundProgress - Tier Progression & Achievement UI
 *
 * Comprehensive display for:
 * - Soulbound token tier progression
 * - Achievement badges and milestones
 * - XP and level tracking
 * - Benefit unlocks
 */

import { useState, useEffect } from 'react';
import {
  Award, Star, Shield, Crown, Zap, Target,
  TrendingUp, Gift, Lock, Unlock, ChevronRight,
  Sparkles, Trophy, Medal, Gem, Wallet
} from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useAhoyState } from '../contexts/SDKContext';

// ============================================================================
// TYPES
// ============================================================================

type TierLevel = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

interface Tier {
  level: TierLevel;
  name: string;
  minXp: number;
  maxXp: number;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ElementType;
  benefits: string[];
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  xpReward: number;
  isUnlocked: boolean;
  unlockedAt?: Date;
  progress?: number;
  maxProgress?: number;
}

// ============================================================================
// DATA
// ============================================================================

const TIERS: Tier[] = [
  {
    level: 'BRONZE',
    name: 'Bronze',
    minXp: 0,
    maxXp: 1000,
    color: 'text-amber-600',
    bgColor: 'bg-amber-600/10',
    borderColor: 'border-amber-600/30',
    icon: Shield,
    benefits: ['Basic access to platform', 'Community forums', 'Standard support'],
  },
  {
    level: 'SILVER',
    name: 'Silver',
    minXp: 1000,
    maxXp: 5000,
    color: 'text-gray-300',
    bgColor: 'bg-gray-300/10',
    borderColor: 'border-gray-300/30',
    icon: Medal,
    benefits: ['5% fee discount', 'Early access to features', 'Priority support', 'Vote weight: 1.2x'],
  },
  {
    level: 'GOLD',
    name: 'Gold',
    minXp: 5000,
    maxXp: 15000,
    color: 'text-[#F8B032]',
    bgColor: 'bg-[#F8B032]/10',
    borderColor: 'border-[#F8B032]/30',
    icon: Star,
    benefits: ['15% fee discount', 'Exclusive airdrops', 'VIP support', 'Vote weight: 1.5x', 'Governance proposals'],
  },
  {
    level: 'PLATINUM',
    name: 'Platinum',
    minXp: 15000,
    maxXp: 50000,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-400/10',
    borderColor: 'border-cyan-400/30',
    icon: Crown,
    benefits: ['25% fee discount', 'Private alpha access', 'Dedicated account manager', 'Vote weight: 2x', 'Revenue share'],
  },
  {
    level: 'DIAMOND',
    name: 'Diamond',
    minXp: 50000,
    maxXp: 100000,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/30',
    icon: Gem,
    benefits: ['50% fee discount', 'Founder tier benefits', 'Board seat eligibility', 'Vote weight: 3x', 'Max revenue share', 'Exclusive events'],
  },
];

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-asset', title: 'First Asset', description: 'Create your first tokenized asset', icon: Target, xpReward: 100, isUnlocked: true, unlockedAt: new Date('2025-12-01') },
  { id: 'early-adopter', title: 'Early Adopter', description: 'Join during platform launch', icon: Zap, xpReward: 500, isUnlocked: true, unlockedAt: new Date('2025-11-15') },
  { id: 'trader', title: 'Active Trader', description: 'Complete 10 trades', icon: TrendingUp, xpReward: 200, isUnlocked: true, unlockedAt: new Date('2025-12-20'), progress: 10, maxProgress: 10 },
  { id: 'staker', title: 'Diamond Hands', description: 'Stake tokens for 30 days', icon: Lock, xpReward: 300, isUnlocked: false, progress: 18, maxProgress: 30 },
  { id: 'voter', title: 'Governance Guru', description: 'Vote on 5 proposals', icon: Award, xpReward: 250, isUnlocked: false, progress: 3, maxProgress: 5 },
  { id: 'referrer', title: 'Community Builder', description: 'Refer 3 new users', icon: Gift, xpReward: 400, isUnlocked: false, progress: 1, maxProgress: 3 },
  { id: 'kyc', title: 'Verified Identity', description: 'Complete KYC verification', icon: Shield, xpReward: 150, isUnlocked: true, unlockedAt: new Date('2025-11-20') },
  { id: 'million', title: 'Millionaire', description: 'Hold $1M in assets', icon: Trophy, xpReward: 1000, isUnlocked: false, progress: 0, maxProgress: 1 },
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TierCard({
  tier,
  isCurrentTier,
  isUnlocked,
  progress,
}: {
  tier: Tier;
  isCurrentTier: boolean;
  isUnlocked: boolean;
  progress?: number;
}) {
  const Icon = tier.icon;

  return (
    <div
      className={`relative p-4 rounded-xl border transition-all ${
        isCurrentTier
          ? `${tier.borderColor} ${tier.bgColor} ring-2 ring-offset-2 ring-offset-[#0B1120] ${tier.borderColor.replace('border', 'ring')}`
          : isUnlocked
          ? `border-white/10 bg-white/5`
          : `border-white/5 bg-white/[0.02] opacity-50`
      }`}
    >
      {isCurrentTier && (
        <div className={`absolute -top-2 -right-2 px-2 py-0.5 ${tier.bgColor} ${tier.color} text-xs font-bold rounded-full border ${tier.borderColor}`}>
          Current
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg ${tier.bgColor} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${tier.color}`} />
        </div>
        <div>
          <h3 className={`font-bold ${isUnlocked ? tier.color : 'text-gray-500'}`}>{tier.name}</h3>
          <p className="text-xs text-gray-500">{tier.minXp.toLocaleString()} - {tier.maxXp.toLocaleString()} XP</p>
        </div>
      </div>

      {progress !== undefined && isCurrentTier && (
        <div className="mb-3">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${tier.bgColor.replace('/10', '')} rounded-full transition-all`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-1">
        {tier.benefits.slice(0, 3).map((benefit, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {isUnlocked ? (
              <Unlock className="w-3 h-3 text-green-400" />
            ) : (
              <Lock className="w-3 h-3 text-gray-500" />
            )}
            <span className={isUnlocked ? 'text-gray-300' : 'text-gray-500'}>{benefit}</span>
          </div>
        ))}
        {tier.benefits.length > 3 && (
          <p className="text-xs text-gray-500 pl-5">+{tier.benefits.length - 3} more benefits</p>
        )}
      </div>
    </div>
  );
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const Icon = achievement.icon;

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        achievement.isUnlocked
          ? 'border-green-500/20 bg-green-500/5'
          : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            achievement.isUnlocked ? 'bg-green-500/20' : 'bg-white/10'
          }`}
        >
          <Icon
            className={`w-6 h-6 ${achievement.isUnlocked ? 'text-green-400' : 'text-gray-500'}`}
          />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <h4 className={`font-medium ${achievement.isUnlocked ? 'text-white' : 'text-gray-400'}`}>
              {achievement.title}
            </h4>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              achievement.isUnlocked ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-500'
            }`}>
              +{achievement.xpReward} XP
            </span>
          </div>
          <p className="text-sm text-gray-500">{achievement.description}</p>

          {!achievement.isUnlocked && achievement.progress !== undefined && achievement.maxProgress && (
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Progress</span>
                <span className="text-gray-400">{achievement.progress}/{achievement.maxProgress}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${(achievement.progress / achievement.maxProgress) * 100}%` }}
                />
              </div>
            </div>
          )}

          {achievement.isUnlocked && achievement.unlockedAt && (
            <p className="text-xs text-gray-600 mt-1">
              Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SoulboundProgress() {
  const { address, isConnected } = useWallet();
  const { simulateAhoyAction } = useAhoyState();

  // Demo state - would come from SDK in production
  const [userXp, setUserXp] = useState(7850);
  const [achievements, setAchievements] = useState(ACHIEVEMENTS);

  // Calculate current tier
  const currentTier = TIERS.find(t => userXp >= t.minXp && userXp < t.maxXp) || TIERS[0];
  const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];
  const progressToNextTier = nextTier
    ? ((userXp - currentTier.minXp) / (nextTier.minXp - currentTier.minXp)) * 100
    : 100;

  const unlockedAchievements = achievements.filter(a => a.isUnlocked);
  const totalPossibleXp = achievements.reduce((sum, a) => sum + a.xpReward, 0);
  const earnedXp = unlockedAchievements.reduce((sum, a) => sum + a.xpReward, 0);

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
              Connect your wallet to view your Soulbound tier and achievements.
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
            <h1 className="text-2xl font-bold text-white">Soulbound Progress</h1>
            <p className="text-gray-400">Track your tier progression and achievements</p>
          </div>
        </div>

        {/* Current Status Card */}
        <div className={`p-6 rounded-2xl border ${currentTier.borderColor} ${currentTier.bgColor} relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-64 h-64 opacity-5">
            <currentTier.icon className="w-full h-full" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl ${currentTier.bgColor} border ${currentTier.borderColor} flex items-center justify-center`}>
                  <currentTier.icon className={`w-8 h-8 ${currentTier.color}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Current Tier</p>
                  <h2 className={`text-3xl font-bold ${currentTier.color}`}>{currentTier.name}</h2>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400">Total XP</p>
                <p className="text-3xl font-bold text-white">{userXp.toLocaleString()}</p>
              </div>
            </div>

            {nextTier && (
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Progress to {nextTier.name}</span>
                  <span className="text-white font-medium">
                    {userXp.toLocaleString()} / {nextTier.minXp.toLocaleString()} XP
                  </span>
                </div>
                <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${currentTier.bgColor.replace('/10', '')} rounded-full transition-all`}
                    style={{ width: `${progressToNextTier}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {(nextTier.minXp - userXp).toLocaleString()} XP needed to reach {nextTier.name}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Award className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Achievements</p>
                <p className="text-xl font-bold text-white">{unlockedAchievements.length}/{achievements.length}</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">XP Earned</p>
                <p className="text-xl font-bold text-white">{earnedXp.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Completion</p>
                <p className="text-xl font-bold text-white">{((earnedXp / totalPossibleXp) * 100).toFixed(0)}%</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Tier Rank</p>
                <p className="text-xl font-bold text-white">#{TIERS.indexOf(currentTier) + 1} of {TIERS.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tier Progression */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Crown className="w-5 h-5 text-[#F8B032]" />
              Tier Progression
            </h3>
            <div className="space-y-4">
              {TIERS.map((tier, index) => (
                <TierCard
                  key={tier.level}
                  tier={tier}
                  isCurrentTier={tier.level === currentTier.level}
                  isUnlocked={userXp >= tier.minXp}
                  progress={tier.level === currentTier.level ? progressToNextTier : undefined}
                />
              ))}
            </div>
          </div>

          {/* Achievements */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-purple-400" />
              Achievements
            </h3>
            <div className="space-y-3">
              {achievements.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} />
              ))}
            </div>
          </div>
        </div>

        {/* Current Tier Benefits */}
        <div className={`p-6 rounded-xl border ${currentTier.borderColor} ${currentTier.bgColor}`}>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Gift className={`w-5 h-5 ${currentTier.color}`} />
            Your {currentTier.name} Benefits
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentTier.benefits.map((benefit, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
              >
                <div className={`w-8 h-8 rounded-lg ${currentTier.bgColor} flex items-center justify-center`}>
                  <Unlock className={`w-4 h-4 ${currentTier.color}`} />
                </div>
                <span className="text-sm text-gray-300">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
