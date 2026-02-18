import React from 'react';
import { Landmark, FileText, Coins, Percent } from 'lucide-react';

export interface SPVOverviewProps {
  spvName: string;
  registrationNumber?: string;
  jurisdiction: string;
  status: 'draft' | 'registered' | 'active' | 'dissolved';
  properties: Array<{ name: string; valuation: number }>;
  totalValuation: number;
  totalTokens?: number;
  managementFee?: number;
  className?: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-500/10 border-gray-500/20', text: 'text-gray-400' },
  registered: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400' },
  active: { bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-400' },
  dissolved: { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400' },
};

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

const COMPOSITION_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
];

export function SPVOverview({
  spvName,
  registrationNumber,
  jurisdiction,
  status,
  properties,
  totalValuation,
  totalTokens,
  managementFee,
  className = '',
}: SPVOverviewProps) {
  const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.draft;

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <Landmark className="w-5 h-5 text-amber-400" />
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusStyle.bg} ${statusStyle.text} capitalize`}>
            {status}
          </span>
        </div>
        <h3 className="text-lg font-semibold text-white">{spvName}</h3>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          {registrationNumber && (
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {registrationNumber}
            </span>
          )}
          <span>{jurisdiction}</span>
        </div>
      </div>

      {/* Properties List */}
      <div className="px-5 py-3 space-y-2 border-b border-white/5">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Properties</p>
        {properties.map((prop, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-gray-300 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${COMPOSITION_COLORS[i % COMPOSITION_COLORS.length]}`} />
              {prop.name}
            </span>
            <span className="text-gray-400">AED {formatCurrency(prop.valuation)}</span>
          </div>
        ))}
      </div>

      {/* Composition Bar */}
      {totalValuation > 0 && (
        <div className="px-5 py-3 border-b border-white/5">
          <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
            {properties.map((prop, i) => {
              const pct = (prop.valuation / totalValuation) * 100;
              return (
                <div
                  key={i}
                  className={`${COMPOSITION_COLORS[i % COMPOSITION_COLORS.length]} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${prop.name}: ${pct.toFixed(1)}%`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="px-5 py-3 grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-gray-500">Total Valuation</p>
          <p className="text-sm font-semibold text-white flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            AED {formatCurrency(totalValuation)}
          </p>
        </div>
        {totalTokens !== undefined && (
          <div>
            <p className="text-xs text-gray-500">Total Tokens</p>
            <p className="text-sm font-semibold text-white">{totalTokens.toLocaleString()}</p>
          </div>
        )}
        {managementFee !== undefined && (
          <div>
            <p className="text-xs text-gray-500">Mgmt Fee</p>
            <p className="text-sm font-semibold text-white flex items-center gap-1">
              <Percent className="w-3.5 h-3.5 text-gray-400" />
              {managementFee}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
