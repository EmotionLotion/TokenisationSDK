import { useState, useCallback } from 'react';
import {
  Banknote,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  DollarSign,
  Calendar,
} from 'lucide-react';
import { sdkStore } from '../../store';

// =============================================================================
// Original DividendDistribution component (backward-compatible)
// =============================================================================

interface Payee {
  name: string;
  amount: number;
  settled: boolean;
}

interface DividendDistributionProps {
  assetName: string;
  totalDividend: number;
  payees: Payee[];
  currency: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20', label: 'Pending' },
  in_progress: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'In Progress' },
  completed: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'Completed' },
  failed: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Failed' },
};

export function DividendDistribution({
  assetName,
  totalDividend,
  payees,
  currency,
  status,
}: DividendDistributionProps) {
  const cfg = STATUS_CONFIG[status];
  const StatusIcon = cfg.icon;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Dividend Distribution</h3>
          <p className="text-sm text-gray-500">{assetName}</p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.color} ${cfg.bg} ${cfg.border}`}>
          <StatusIcon className="w-3 h-3" />
          {cfg.label}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Banknote className="w-5 h-5 text-amber-400" />
        <span className="text-2xl font-bold text-white">
          {currency} {totalDividend.toLocaleString()}
        </span>
      </div>

      <div className="space-y-2">
        {payees.map((p, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/5 bg-white/5">
            <span className="text-sm text-gray-300">{p.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                {currency} {p.amount.toLocaleString()}
              </span>
              {p.settled ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-gray-500" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// DividendDashboard - Full-featured dividend management component
// =============================================================================

interface DividendDashboardProps {
  assetId: string;
  assetName: string;
  currency?: string;
}

type DistributionStatus = 'pending' | 'processing' | 'completed';

interface TokenHolder {
  id: string;
  name: string;
  tokens: number;
  share: number;
  walletAddress: string;
}

interface DistributionRecord {
  id: string;
  date: string;
  grossIncome: number;
  expenses: number;
  netDistributable: number;
  holders: { name: string; amount: number }[];
  status: DistributionStatus;
}

const DIST_STATUS_STYLES: Record<DistributionStatus, { icon: typeof Clock; color: string; bg: string; border: string; label: string }> = {
  pending: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20', label: 'Pending' },
  processing: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Processing' },
  completed: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'Completed' },
};

function generateHolders(): TokenHolder[] {
  const parties = sdkStore.getParties();
  const totalTokens = parties.length > 0 ? parties.length * 500 : 1000;
  return parties.length > 0
    ? parties.map((p, i) => {
        const tokens = i === 0 ? 500 : Math.floor(Math.random() * 300) + 100;
        return {
          id: p.id,
          name: p.name || `Holder ${i + 1}`,
          tokens,
          share: 0,
          walletAddress: `0x${p.id.replace(/-/g, '').slice(0, 8)}...${p.id.replace(/-/g, '').slice(-4)}`,
        };
      })
    : [
        { id: 'h1', name: 'Ahmed Al Maktoum', tokens: 500, share: 0, walletAddress: '0x1234...5678' },
        { id: 'h2', name: 'Sara Holdings', tokens: 300, share: 0, walletAddress: '0x2345...6789' },
        { id: 'h3', name: 'Global Fund II', tokens: 200, share: 0, walletAddress: '0x3456...7890' },
      ];
}

function computeShares(holders: TokenHolder[]): TokenHolder[] {
  const total = holders.reduce((sum, h) => sum + h.tokens, 0);
  return holders.map(h => ({ ...h, share: total > 0 ? (h.tokens / total) * 100 : 0 }));
}

function getNextDistributionDate(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function DividendDashboard({ assetId, assetName, currency = 'USD' }: DividendDashboardProps) {
  // Income breakdown state
  const [grossIncome, setGrossIncome] = useState(12500);
  const [managementFee] = useState(1250);
  const [maintenanceReserve] = useState(625);
  const [platformFee] = useState(375);

  const expenses = managementFee + maintenanceReserve + platformFee;
  const netDistributable = grossIncome - expenses;

  // Holders
  const [holders] = useState<TokenHolder[]>(() => computeShares(generateHolders()));
  const totalTokens = holders.reduce((sum, h) => sum + h.tokens, 0);

  // Distribution history
  const [distributions, setDistributions] = useState<DistributionRecord[]>([]);
  const [isDistributing, setIsDistributing] = useState(false);

  // Summary stats
  const totalDistributed = distributions
    .filter(d => d.status === 'completed')
    .reduce((sum, d) => sum + d.netDistributable, 0);
  const assetValue = 250000;
  const annualizedYield = assetValue > 0 ? ((netDistributable * 12) / assetValue) * 100 : 0;

  const handleDistribute = useCallback(() => {
    if (isDistributing) return;
    setIsDistributing(true);

    // Log the SDK call
    sdkStore.logSdkCall('dividends.distribute', {
      assetId,
      grossIncome,
      expenses,
      netDistributable,
      holdersCount: holders.length,
      currency,
    });

    const newDistribution: DistributionRecord = {
      id: `DIST-${Date.now()}`,
      date: new Date().toISOString(),
      grossIncome,
      expenses,
      netDistributable,
      holders: holders.map(h => ({
        name: h.name,
        amount: parseFloat(((h.share / 100) * netDistributable).toFixed(2)),
      })),
      status: 'pending',
    };

    setDistributions(prev => [newDistribution, ...prev]);

    // Simulate processing
    setTimeout(() => {
      setDistributions(prev =>
        prev.map(d => (d.id === newDistribution.id ? { ...d, status: 'processing' as DistributionStatus } : d))
      );
    }, 1000);

    // Simulate completion
    setTimeout(() => {
      setDistributions(prev =>
        prev.map(d => (d.id === newDistribution.id ? { ...d, status: 'completed' as DistributionStatus } : d))
      );
      setIsDistributing(false);

      sdkStore.logSdkCall('dividends.distribute.completed', {
        distributionId: newDistribution.id,
        assetId,
        netDistributable,
      });
    }, 3000);
  }, [isDistributing, assetId, grossIncome, expenses, netDistributable, holders, currency]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Dividend Dashboard</h2>
              <p className="text-sm text-gray-500">{assetName}</p>
            </div>
          </div>
          <button
            onClick={handleDistribute}
            disabled={isDistributing}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isDistributing
                ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-400 text-black'
            }`}
          >
            {isDistributing ? 'Distributing...' : 'Distribute Now'}
          </button>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Distributed</span>
          </div>
          <p className="text-xl font-bold text-white">
            {currency} {totalDistributed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">{distributions.filter(d => d.status === 'completed').length} distributions</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Next Distribution</span>
          </div>
          <p className="text-xl font-bold text-white">{getNextDistributionDate()}</p>
          <p className="text-xs text-gray-500 mt-1">Monthly cycle</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Annual Yield</span>
          </div>
          <p className="text-xl font-bold text-white">{annualizedYield.toFixed(2)}%</p>
          <p className="text-xs text-gray-500 mt-1">Based on current income</p>
        </div>
      </div>

      {/* Income Breakdown */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
        <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Income Breakdown</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Gross Rental Income</span>
            <span className="text-sm font-medium text-white">{currency} {grossIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="w-full h-px bg-white/10" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Management Fee (10%)</span>
            <span className="text-sm text-red-400">- {currency} {managementFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Maintenance Reserve (5%)</span>
            <span className="text-sm text-red-400">- {currency} {maintenanceReserve.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Platform Fee (3%)</span>
            <span className="text-sm text-red-400">- {currency} {platformFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="w-full h-px bg-white/10" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Net Distributable</span>
            <span className="text-sm font-bold text-green-400">{currency} {netDistributable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* Token Holders */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Token Holders</h3>
          <span className="ml-auto text-xs text-gray-500">{holders.length} holders &middot; {totalTokens.toLocaleString()} tokens</span>
        </div>
        <div className="space-y-2">
          {holders.map(holder => {
            const proportionalAmount = (holder.share / 100) * netDistributable;
            return (
              <div
                key={holder.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-white/5 bg-white/5"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-gray-300 truncate">{holder.name}</span>
                  <span className="text-xs text-gray-600 font-mono">{holder.walletAddress}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{holder.tokens.toLocaleString()} tokens</p>
                    <p className="text-xs text-gray-600">{holder.share.toFixed(1)}%</p>
                  </div>
                  <span className="text-sm font-medium text-white min-w-[100px] text-right">
                    {currency} {proportionalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Distribution History */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
        <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Distribution History</h3>
        {distributions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-600">
            <Banknote className="w-8 h-8 mb-2 text-gray-700" />
            <p className="text-sm">No distributions yet</p>
            <p className="text-xs mt-1">Click "Distribute Now" to create the first distribution</p>
          </div>
        ) : (
          <div className="space-y-3">
            {distributions.map(dist => {
              const style = DIST_STATUS_STYLES[dist.status];
              const Icon = style.icon;
              return (
                <div key={dist.id} className="rounded-lg border border-white/5 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{dist.id}</span>
                      <span className="text-xs text-gray-600">
                        {new Date(dist.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${style.color} ${style.bg} ${style.border}`}
                    >
                      <Icon className="w-3 h-3" />
                      {style.label}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-gray-500">Gross</p>
                      <p className="text-sm font-medium text-white">
                        {currency} {dist.grossIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Expenses</p>
                      <p className="text-sm font-medium text-red-400">
                        - {currency} {dist.expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Distributed</p>
                      <p className="text-sm font-bold text-green-400">
                        {currency} {dist.netDistributable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* Per-holder breakdown (collapsed by default for completed) */}
                  {dist.status !== 'pending' && (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                      {dist.holders.map((h, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">{h.name}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-300">
                              {currency} {h.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            {dist.status === 'completed' ? (
                              <CheckCircle className="w-3 h-3 text-green-400" />
                            ) : (
                              <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
