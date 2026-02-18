'use client';

import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Holding {
  assetId: string;
  assetName: string;
  assetType?: string;
  tokenBalance: string;
  currentValue: number;
  costBasis: number;
  currency: string;
  change24h?: number;
  locked?: number;
}

export interface PortfolioDashboardProps {
  holdings: Holding[];
  totalValue: number;
  totalCost: number;
  currency?: string;
  onAssetClick?: (assetId: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOCATION_COLORS = [
  'bg-amber-400',
  'bg-blue-400',
  'bg-emerald-400',
  'bg-purple-400',
  'bg-rose-400',
  'bg-cyan-400',
  'bg-orange-400',
  'bg-pink-400',
  'bg-teal-400',
  'bg-indigo-400',
];

const ASSET_TYPE_STYLES: Record<string, string> = {
  real_estate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  equity: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  ticket: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  debt: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  fund: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

const DOT_COLORS: Record<string, string> = {
  'bg-amber-400': 'bg-amber-400',
  'bg-blue-400': 'bg-blue-400',
  'bg-emerald-400': 'bg-emerald-400',
  'bg-purple-400': 'bg-purple-400',
  'bg-rose-400': 'bg-rose-400',
  'bg-cyan-400': 'bg-cyan-400',
  'bg-orange-400': 'bg-orange-400',
  'bg-pink-400': 'bg-pink-400',
  'bg-teal-400': 'bg-teal-400',
  'bg-indigo-400': 'bg-indigo-400',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatTypeLabel(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PortfolioDashboard({
  holdings,
  totalValue,
  totalCost,
  currency = 'USD',
  onAssetClick,
  onRefresh,
  loading = false,
  className = '',
}: PortfolioDashboardProps) {
  const totalPnL = totalValue - totalCost;
  const totalPnLPercent = totalCost > 0 ? ((totalPnL / totalCost) * 100) : 0;
  const isPnLPositive = totalPnL >= 0;

  // --- Loading state ---
  if (loading) {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm ${className}`}>
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-white/40 animate-spin" />
          <span className="ml-3 text-sm text-white/60">Loading portfolio...</span>
        </div>
      </div>
    );
  }

  // --- Empty state ---
  if (holdings.length === 0) {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm ${className}`}>
        <div className="px-5 py-4 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-white">Portfolio</h2>
            </div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 px-5">
          <Wallet className="w-10 h-10 text-white/20 mb-3" />
          <p className="text-sm text-white/60">No holdings yet.</p>
          <p className="text-xs text-white/40 mt-1">Your portfolio will appear here once you hold tokens.</p>
        </div>
      </div>
    );
  }

  // --- Allocation data ---
  const allocations = holdings.map((h, i) => ({
    name: h.assetName,
    value: h.currentValue,
    percent: totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0,
    color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
  }));

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Portfolio</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-white">
              {formatCurrency(totalValue, currency)}
            </span>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-white/5">
        {/* Total Value */}
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-white/60 uppercase tracking-wider">Total Value</span>
          </div>
          <p className="text-base font-semibold text-white">{formatCurrency(totalValue, currency)}</p>
        </div>

        {/* Total P&L */}
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            {isPnLPositive ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
            <span className="text-xs text-white/60 uppercase tracking-wider">Total P&L</span>
          </div>
          <p className={`text-base font-semibold ${isPnLPositive ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(totalPnL, currency)}
          </p>
          <p className={`text-xs ${isPnLPositive ? 'text-green-400/70' : 'text-red-400/70'}`}>
            {formatPercent(totalPnLPercent)}
          </p>
        </div>

        {/* Holdings Count */}
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <PieChart className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-white/60 uppercase tracking-wider">Holdings</span>
          </div>
          <p className="text-base font-semibold text-white">{holdings.length}</p>
        </div>
      </div>

      {/* Allocation bar */}
      <div className="px-5 py-4 border-b border-white/5">
        <h4 className="text-xs text-white/60 uppercase tracking-wider mb-2">Allocation</h4>
        <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
          {allocations.map((a, i) => (
            <div
              key={a.name}
              className={`${a.color} transition-all`}
              style={{ width: `${a.percent}%` }}
              title={`${a.name}: ${a.percent.toFixed(1)}%`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {allocations.map((a) => (
            <div key={a.name} className="flex items-center gap-1.5 text-xs text-white/60">
              <span className={`w-2 h-2 rounded-full ${a.color}`} />
              <span>{a.name}</span>
              <span className="text-white/40">{a.percent.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Holdings table */}
      <div className="px-5 py-4">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] divide-y divide-white/5">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-2 text-xs text-white/40 uppercase tracking-wider">
            <span>Asset</span>
            <span className="text-right w-20">Balance</span>
            <span className="text-right w-24">Value</span>
            <span className="text-right w-24">P&L</span>
            <span className="text-right w-16">24h</span>
            <span className="text-right w-14">Locked</span>
          </div>

          {/* Table rows */}
          {holdings.map((h) => {
            const pnl = h.currentValue - h.costBasis;
            const pnlPercent = h.costBasis > 0 ? (pnl / h.costBasis) * 100 : 0;
            const pnlPositive = pnl >= 0;
            const changePositive = (h.change24h ?? 0) >= 0;
            const typeStyle =
              h.assetType && ASSET_TYPE_STYLES[h.assetType]
                ? ASSET_TYPE_STYLES[h.assetType]
                : 'text-gray-400 bg-gray-500/10 border-gray-500/20';

            return (
              <div
                key={h.assetId}
                onClick={() => onAssetClick?.(h.assetId)}
                className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 items-center text-sm transition-colors ${
                  onAssetClick ? 'cursor-pointer hover:bg-white/[0.03]' : ''
                }`}
              >
                {/* Asset name + type */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-200 truncate">{h.assetName}</span>
                  {h.assetType && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border flex-shrink-0 ${typeStyle}`}>
                      {formatTypeLabel(h.assetType)}
                    </span>
                  )}
                </div>

                {/* Balance */}
                <span className="text-right text-slate-200 font-mono text-xs w-20 truncate">
                  {h.tokenBalance}
                </span>

                {/* Value */}
                <span className="text-right text-slate-200 w-24">
                  {formatCurrency(h.currentValue, h.currency)}
                </span>

                {/* P&L */}
                <div className="text-right w-24">
                  <span className={`flex items-center justify-end gap-0.5 ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {pnlPositive ? (
                      <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3 flex-shrink-0" />
                    )}
                    {formatPercent(pnlPercent)}
                  </span>
                </div>

                {/* 24h change */}
                <div className="text-right w-16">
                  {h.change24h !== undefined ? (
                    <span className={`text-xs ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(h.change24h)}
                    </span>
                  ) : (
                    <span className="text-xs text-white/20">--</span>
                  )}
                </div>

                {/* Locked */}
                <div className="text-right w-14">
                  {h.locked && h.locked > 0 ? (
                    <span className="text-xs text-amber-400" title={`${h.locked} tokens locked`}>
                      {h.locked}
                    </span>
                  ) : (
                    <span className="text-xs text-white/20">--</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
