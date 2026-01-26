/**
 * AhoyBalanceWidget - Reusable AHOY token balance display
 * Shows current balance, tier, and recent point changes with animations
 */

import { useState, useEffect, useCallback } from 'react';
import { Coins, TrendingUp, TrendingDown, Sparkles, ChevronDown, ChevronUp, History } from 'lucide-react';
import { useAhoyState } from '../contexts/SDKContext';

interface PointAnimation {
  id: string;
  points: number;
  description: string;
  isEarn: boolean;
  timestamp: number;
}

interface AhoyBalanceWidgetProps {
  vertical: 'COMET' | 'FLYPLUS' | 'H2O' | 'IITS' | 'GTS' | 'AMS' | 'TROUVE' | 'CONNECT';
  compact?: boolean;
  showHistory?: boolean;
}

const TIER_COLORS = {
  BRONZE: 'from-amber-700 to-amber-900',
  SILVER: 'from-gray-400 to-gray-600',
  GOLD: 'from-yellow-400 to-yellow-600',
  PLATINUM: 'from-cyan-300 to-cyan-500',
  DIAMOND: 'from-purple-400 to-pink-400',
};

const TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 5000,
  GOLD: 15000,
  PLATINUM: 50000,
  DIAMOND: 100000,
};

export function AhoyBalanceWidget({ vertical, compact = false, showHistory = true }: AhoyBalanceWidgetProps) {
  const { ahoyState } = useAhoyState();
  const [pointAnimations, setPointAnimations] = useState<PointAnimation[]>([]);
  const [prevBalance, setPrevBalance] = useState(ahoyState.balance);
  const [showTransactions, setShowTransactions] = useState(false);
  const [balanceAnimating, setBalanceAnimating] = useState(false);

  // Watch for balance changes and create animations
  useEffect(() => {
    if (ahoyState.balance !== prevBalance) {
      const diff = parseInt(ahoyState.balance) - parseInt(prevBalance);
      if (diff !== 0) {
        const latestTx = ahoyState.transactions[0];
        const animation: PointAnimation = {
          id: `anim-${Date.now()}`,
          points: diff,
          description: latestTx?.action?.replace(/_/g, ' ') || (diff > 0 ? 'Earned' : 'Spent'),
          isEarn: diff > 0,
          timestamp: Date.now(),
        };
        setPointAnimations(prev => [animation, ...prev].slice(0, 5));
        setBalanceAnimating(true);
        setTimeout(() => setBalanceAnimating(false), 500);
      }
      setPrevBalance(ahoyState.balance);
    }
  }, [ahoyState.balance, prevBalance, ahoyState.transactions]);

  // Clean up old animations
  useEffect(() => {
    const cleanup = setInterval(() => {
      setPointAnimations(prev => prev.filter(a => Date.now() - a.timestamp < 3000));
    }, 1000);
    return () => clearInterval(cleanup);
  }, []);

  // Get next tier info
  const getNextTierInfo = useCallback(() => {
    const tiers = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'] as const;
    const currentIndex = tiers.indexOf(ahoyState.tier);
    if (currentIndex === tiers.length - 1) return null;
    const nextTier = tiers[currentIndex + 1];
    const needed = TIER_THRESHOLDS[nextTier] - ahoyState.lifetimeEarned;
    return { tier: nextTier, needed };
  }, [ahoyState.tier, ahoyState.lifetimeEarned]);

  const nextTier = getNextTierInfo();

  // Filter transactions for this vertical
  const verticalTransactions = ahoyState.transactions.filter(
    tx => tx.source === vertical || tx.source === vertical.replace('FLYPLUS', 'FLYPLUS')
  ).slice(0, 10);

  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
        <Coins className="w-4 h-4 text-amber-400" />
        <span className={`font-bold text-amber-400 transition-all duration-300 ${balanceAnimating ? 'scale-110' : ''}`}>
          {parseInt(ahoyState.balance).toLocaleString()}
        </span>
        <span className="text-xs text-gray-400">AHOY</span>
        {pointAnimations.length > 0 && (
          <span className={`text-xs font-medium animate-pulse ${pointAnimations[0].isEarn ? 'text-green-400' : 'text-red-400'}`}>
            {pointAnimations[0].isEarn ? '+' : ''}{pointAnimations[0].points}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-xl border border-white/10 overflow-hidden">
      {/* Header with balance */}
      <div className="p-4 relative">
        {/* Point animations overlay */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {pointAnimations.map((anim, idx) => (
            <div
              key={anim.id}
              className={`absolute right-4 animate-fade-up text-sm font-bold ${
                anim.isEarn ? 'text-green-400' : 'text-red-400'
              }`}
              style={{
                top: `${20 + idx * 20}px`,
                animation: 'fadeUp 2s ease-out forwards',
                opacity: 1 - idx * 0.3,
              }}
            >
              {anim.isEarn ? '+' : ''}{anim.points} AHOY
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${TIER_COLORS[ahoyState.tier]} flex items-center justify-center`}>
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">AHOY Balance</div>
              <div className={`text-2xl font-bold text-white transition-all duration-300 ${balanceAnimating ? 'scale-105 text-amber-400' : ''}`}>
                {parseInt(ahoyState.balance).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className={`px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${TIER_COLORS[ahoyState.tier]} text-white`}>
              {ahoyState.tier}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {ahoyState.lifetimeEarned.toLocaleString()} earned
            </div>
          </div>
        </div>

        {/* Progress to next tier */}
        {nextTier && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progress to {nextTier.tier}</span>
              <span>{nextTier.needed.toLocaleString()} AHOY needed</span>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${TIER_COLORS[nextTier.tier]} transition-all duration-500`}
                style={{
                  width: `${Math.min(100, (1 - nextTier.needed / (TIER_THRESHOLDS[nextTier.tier] - TIER_THRESHOLDS[ahoyState.tier])) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Streak indicator */}
        {ahoyState.streak > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span className="text-amber-400 font-medium">{ahoyState.streak} day streak</span>
          </div>
        )}
      </div>

      {/* Transaction history toggle */}
      {showHistory && verticalTransactions.length > 0 && (
        <>
          <button
            onClick={() => setShowTransactions(!showTransactions)}
            className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-between text-sm text-gray-400"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4" />
              <span>Recent Activity</span>
            </div>
            {showTransactions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showTransactions && (
            <div className="px-4 py-2 space-y-2 max-h-48 overflow-y-auto">
              {verticalTransactions.map(tx => (
                <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2">
                    {tx.points > 0 ? (
                      <TrendingUp className="w-3 h-3 text-green-400" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-red-400" />
                    )}
                    <span className="text-gray-300">{tx.action.replace(/_/g, ' ')}</span>
                  </div>
                  <span className={tx.points > 0 ? 'text-green-400' : 'text-red-400'}>
                    {tx.points > 0 ? '+' : ''}{tx.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* CSS for animation */}
      <style>{`
        @keyframes fadeUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-30px); }
        }
      `}</style>
    </div>
  );
}

/**
 * Compact inline point indicator - shows after an action
 */
export function PointIndicator({ points, action }: { points: number; action: string }) {
  const isEarn = points > 0;

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      isEarn ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
    }`}>
      {isEarn ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isEarn ? '+' : ''}{points} AHOY
    </div>
  );
}

/**
 * Action button with point preview
 */
interface AhoyActionButtonProps {
  label: string;
  points: number;
  isEarn: boolean;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function AhoyActionButton({
  label,
  points,
  isEarn,
  onClick,
  disabled = false,
  loading = false,
  icon,
  className = '',
}: AhoyActionButtonProps) {
  const { ahoyState } = useAhoyState();
  const canAfford = isEarn || parseInt(ahoyState.balance) >= Math.abs(points);

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading || (!isEarn && !canAfford)}
      className={`
        relative flex items-center justify-between gap-2 px-4 py-2 rounded-lg
        font-medium transition-all duration-200
        ${isEarn
          ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30'
          : 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30'
        }
        ${disabled || (!isEarn && !canAfford) ? 'opacity-50 cursor-not-allowed' : ''}
        ${loading ? 'animate-pulse' : ''}
        ${className}
      `}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-xs font-bold ${isEarn ? 'text-green-300' : 'text-red-300'}`}>
        {isEarn ? '+' : '-'}{Math.abs(points)} AHOY
      </div>
      {!isEarn && !canAfford && (
        <div className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full">
          Insufficient
        </div>
      )}
    </button>
  );
}

export default AhoyBalanceWidget;
