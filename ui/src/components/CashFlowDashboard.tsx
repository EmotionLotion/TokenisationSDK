/**
 * CashFlowDashboard - Distribution & Payout Management
 *
 * Comprehensive dashboard for:
 * - Viewing distribution schedules (dividends, interest, royalties)
 * - Tracking payout history
 * - Claiming unclaimed payouts
 * - Managing distribution settings
 */

import { useState } from 'react';
import {
  Banknote, TrendingUp, Calendar, Clock, CheckCircle2,
  AlertCircle, Coins, PieChart, ArrowRight, RefreshCw,
  Building2, Music, FileText, Wallet, DollarSign
} from 'lucide-react';
import {
  useCashFlow,
  DistributionSchedule,
  Distribution,
  UnclaimedPayout,
  DistributionType
} from '../hooks/useModules';
import { useWallet } from '../hooks/useWallet';

// ============================================================================
// TYPES
// ============================================================================

type TabId = 'schedules' | 'history' | 'claims';

// ============================================================================
// HELPERS
// ============================================================================

function getTypeIcon(type: DistributionType) {
  switch (type) {
    case 'DIVIDEND': return Building2;
    case 'INTEREST': return TrendingUp;
    case 'ROYALTY': return Music;
    case 'REVENUE_SHARE': return PieChart;
    default: return Coins;
  }
}

function getTypeColor(type: DistributionType) {
  switch (type) {
    case 'DIVIDEND': return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
    case 'INTEREST': return { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' };
    case 'ROYALTY': return { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' };
    case 'REVENUE_SHARE': return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' };
    default: return { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' };
  }
}

function formatCurrency(amount: string, currency: string) {
  const num = parseFloat(amount);
  if (currency === 'USDC' || currency === 'USD') {
    return `$${num.toLocaleString()}`;
  }
  return `${num.toLocaleString()} ${currency}`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

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

function ScheduleCard({
  schedule,
  onExecute,
  isLoading,
}: {
  schedule: DistributionSchedule;
  onExecute: () => void;
  isLoading: boolean;
}) {
  const Icon = getTypeIcon(schedule.type);
  const colors = getTypeColor(schedule.type);

  return (
    <div className={`p-5 bg-white/5 rounded-xl border ${colors.border} hover:bg-white/[0.07] transition-all`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${colors.text}`} />
          </div>
          <div>
            <h3 className="font-bold text-white">{schedule.assetName}</h3>
            <p className={`text-sm ${colors.text}`}>{schedule.type.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${schedule.isActive ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
          {schedule.isActive ? 'Active' : 'Paused'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 uppercase">Amount</p>
          <p className="text-lg font-bold text-white">
            {schedule.rate ? `${schedule.rate}% APY` : formatCurrency(schedule.amount, schedule.paymentCurrency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Frequency</p>
          <p className="text-lg font-bold text-white">{schedule.frequency.replace(/_/g, ' ')}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Holders</p>
          <p className="text-lg font-bold text-white">{schedule.holdersCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Total Distributed</p>
          <p className="text-lg font-bold text-green-400">{formatCurrency(schedule.totalDistributed, schedule.paymentCurrency)}</p>
        </div>
      </div>

      {schedule.nextDistribution && (
        <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Next Distribution</span>
          </div>
          <span className="text-sm font-medium text-white">{formatDate(schedule.nextDistribution)}</span>
        </div>
      )}

      <button
        onClick={onExecute}
        disabled={isLoading || !schedule.isActive}
        className={`w-full py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
          schedule.isActive
            ? `${colors.bg} ${colors.text} hover:opacity-80`
            : 'bg-gray-500/10 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isLoading ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <ArrowRight className="w-4 h-4" />
        )}
        Execute Distribution
      </button>
    </div>
  );
}

function DistributionHistoryRow({ distribution }: { distribution: Distribution }) {
  const Icon = getTypeIcon(distribution.type);
  const colors = getTypeColor(distribution.type);

  const statusColors = {
    COMPLETED: 'bg-green-500/10 text-green-400',
    PROCESSING: 'bg-blue-500/10 text-blue-400',
    PARTIALLY_COMPLETED: 'bg-amber-500/10 text-amber-400',
    FAILED: 'bg-red-500/10 text-red-400',
    SCHEDULED: 'bg-gray-500/10 text-gray-400',
    CANCELLED: 'bg-gray-500/10 text-gray-400',
  };

  return (
    <div className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${colors.text}`} />
        </div>
        <div>
          <p className="font-medium text-white">{distribution.assetName}</p>
          <p className="text-sm text-gray-500">{distribution.type.replace(/_/g, ' ')} - {distribution.recipientsCount} recipients</p>
        </div>
      </div>
      <div className="text-center">
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[distribution.status]}`}>
          {distribution.status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="text-right">
        <p className="font-bold text-white">{formatCurrency(distribution.amount, distribution.currency)}</p>
        <p className="text-xs text-gray-500">{formatDate(distribution.executedAt)}</p>
      </div>
    </div>
  );
}

function ClaimCard({
  payout,
  onClaim,
  isLoading,
}: {
  payout: UnclaimedPayout;
  onClaim: () => void;
  isLoading: boolean;
}) {
  const Icon = getTypeIcon(payout.type);
  const colors = getTypeColor(payout.type);
  const daysUntilExpiry = payout.expiresAt
    ? Math.ceil((new Date(payout.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;

  return (
    <div className={`p-5 bg-white/5 rounded-xl border ${colors.border}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <p className="font-medium text-white">{payout.assetName}</p>
            <p className={`text-sm ${colors.text}`}>{payout.type.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">{formatCurrency(payout.amount, payout.currency)}</p>
          <p className="text-xs text-gray-500">Available since {formatDate(payout.availableSince)}</p>
        </div>
      </div>

      {daysUntilExpiry !== null && daysUntilExpiry <= 30 && (
        <div className="flex items-center gap-2 p-2 bg-amber-500/10 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-amber-400">
            {daysUntilExpiry <= 0 ? 'Expired' : `Expires in ${daysUntilExpiry} days`}
          </span>
        </div>
      )}

      <button
        onClick={onClaim}
        disabled={isLoading}
        className="w-full py-2.5 bg-[#F8B032] text-black font-bold rounded-lg hover:bg-[#F8B032]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Claiming...
          </>
        ) : (
          <>
            <DollarSign className="w-4 h-4" />
            Claim Payout
          </>
        )}
      </button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CashFlowDashboard() {
  const { address, isConnected } = useWallet();
  const {
    schedules,
    distributions,
    unclaimedPayouts,
    isLoading,
    claimPayout,
    executeDistribution,
    totalUnclaimed,
  } = useCashFlow();

  const [activeTab, setActiveTab] = useState<TabId>('schedules');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const handleClaim = async (payoutId: string) => {
    setClaimingId(payoutId);
    await claimPayout(payoutId);
    setClaimingId(null);
  };

  const handleExecute = async (scheduleId: string) => {
    setExecutingId(scheduleId);
    await executeDistribution(scheduleId);
    setExecutingId(null);
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
              Connect your wallet to view your distribution schedules and payouts.
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
            <h1 className="text-2xl font-bold text-white">CashFlow Dashboard</h1>
            <p className="text-gray-400">Manage distributions, dividends, and payouts</p>
          </div>
          {unclaimedPayouts.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-sm text-gray-400">Unclaimed</p>
                <p className="text-lg font-bold text-green-400">${totalUnclaimed.toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Active Schedules"
            value={schedules.filter(s => s.isActive).length.toString()}
            subValue={`of ${schedules.length} total`}
            icon={Calendar}
            color="blue"
          />
          <StatCard
            label="Total Distributions"
            value={distributions.length.toString()}
            subValue="All time"
            icon={Banknote}
            color="green"
          />
          <StatCard
            label="Unclaimed Payouts"
            value={unclaimedPayouts.length.toString()}
            subValue={`$${totalUnclaimed.toLocaleString()} available`}
            icon={Clock}
            color="amber"
          />
          <StatCard
            label="Total Distributed"
            value={`$${schedules.reduce((sum, s) => sum + parseFloat(s.totalDistributed), 0).toLocaleString()}`}
            subValue="Across all assets"
            icon={TrendingUp}
            color="purple"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-2">
          {[
            { id: 'schedules', label: 'Schedules', icon: Calendar },
            { id: 'history', label: 'History', icon: FileText },
            { id: 'claims', label: 'Claim Payouts', icon: Banknote, badge: unclaimedPayouts.length },
          ].map(({ id, label, icon: Icon, badge }) => (
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
              {badge && badge > 0 && (
                <span className="px-1.5 py-0.5 bg-green-500 text-black text-xs font-bold rounded-full">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* Schedules Tab */}
          {activeTab === 'schedules' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {schedules.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  onExecute={() => handleExecute(schedule.id)}
                  isLoading={executingId === schedule.id}
                />
              ))}
              {schedules.length === 0 && (
                <div className="col-span-2 text-center py-12 bg-white/5 rounded-xl border border-white/10">
                  <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No distribution schedules configured</p>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h3 className="font-bold text-white">Distribution History</h3>
              </div>
              <div className="divide-y divide-white/5">
                {distributions.map((distribution) => (
                  <DistributionHistoryRow key={distribution.id} distribution={distribution} />
                ))}
                {distributions.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-gray-400">No distribution history yet</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Claims Tab */}
          {activeTab === 'claims' && (
            <div className="space-y-6">
              {unclaimedPayouts.length > 0 ? (
                <>
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-6 h-6 text-green-400" />
                      <div>
                        <p className="font-bold text-white">You have unclaimed payouts!</p>
                        <p className="text-sm text-gray-400">{unclaimedPayouts.length} payout(s) waiting to be claimed</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-green-400">${totalUnclaimed.toLocaleString()}</p>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {unclaimedPayouts.map((payout) => (
                      <ClaimCard
                        key={payout.id}
                        payout={payout}
                        onClaim={() => handleClaim(payout.id)}
                        isLoading={claimingId === payout.id}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                  <CheckCircle2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No unclaimed payouts</p>
                  <p className="text-sm text-gray-500 mt-1">All your payouts have been claimed</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
