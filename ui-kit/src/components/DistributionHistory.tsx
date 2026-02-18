import React from 'react';
import {
  Coins,
  Building,
  Percent,
  TrendingUp,
  Users,
  Calendar,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Distribution {
  id: string;
  type: 'dividend' | 'rent' | 'interest' | 'profit_share';
  amount: string;
  currency: string;
  date: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  recipientCount: number;
}

export interface DistributionHistoryProps {
  distributions: Distribution[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<
  Distribution['type'],
  { icon: React.ElementType; label: string; color: string }
> = {
  dividend: { icon: Coins, label: 'Dividend', color: 'text-amber-400 bg-amber-400/10' },
  rent: { icon: Building, label: 'Rent', color: 'text-blue-400 bg-blue-400/10' },
  interest: { icon: Percent, label: 'Interest', color: 'text-violet-400 bg-violet-400/10' },
  profit_share: { icon: TrendingUp, label: 'Profit Share', color: 'text-green-400 bg-green-400/10' },
};

const STATUS_STYLES: Record<Distribution['status'], { dot: string; text: string; label: string }> = {
  pending: { dot: 'bg-blue-400', text: 'text-blue-400', label: 'Pending' },
  processing: { dot: 'bg-violet-400', text: 'text-violet-400', label: 'Processing' },
  completed: { dot: 'bg-green-400', text: 'text-green-400', label: 'Completed' },
  failed: { dot: 'bg-red-400', text: 'text-red-400', label: 'Failed' },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DistributionHistory({ distributions, className = '' }: DistributionHistoryProps) {
  const sorted = [...distributions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-amber-400" />
          <span className="text-xs text-gray-500 uppercase tracking-wider">Distribution History</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-5 py-4">
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No distributions recorded yet.</p>
        ) : (
          <div className="relative">
            {sorted.map((dist, i) => {
              const typeCfg = TYPE_CONFIG[dist.type];
              const statusCfg = STATUS_STYLES[dist.status];
              const Icon = typeCfg.icon;
              const isLast = i === sorted.length - 1;

              return (
                <div key={dist.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {/* Vertical line */}
                  {!isLast && (
                    <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-white/10" />
                  )}

                  {/* Dot */}
                  <div className={`relative z-10 w-6 h-6 rounded-full ${statusCfg.dot}/20 flex items-center justify-center shrink-0 mt-0.5`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${statusCfg.dot}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeCfg.color}`}>
                        <Icon className="w-3 h-3" />
                        {typeCfg.label}
                      </span>
                      <span className={`text-xs font-medium ${statusCfg.text}`}>
                        {statusCfg.label}
                      </span>
                    </div>

                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-lg font-semibold text-white">{dist.amount}</span>
                      <span className="text-sm text-gray-400">{dist.currency}</span>
                    </div>

                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(dist.date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {dist.recipientCount} recipient{dist.recipientCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
