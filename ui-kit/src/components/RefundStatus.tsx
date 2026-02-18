import React from 'react';
import {
  RotateCcw,
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
} from 'lucide-react';

/**
 * A single refund record
 */
export interface RefundRecord {
  id: string;
  amount: string;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  reason: string;
  initiatedAt: string;
  completedAt?: string;
}

/**
 * Props for the RefundStatus component
 */
export interface RefundStatusProps {
  /** List of refund records to display */
  refunds: RefundRecord[];
  /** Custom class name */
  className?: string;
}

const STATUS_CONFIG: Record<RefundRecord['status'], { label: string; classes: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Pending',
    classes: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  processing: {
    label: 'Processing',
    classes: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  completed: {
    label: 'Completed',
    classes: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
  },
  failed: {
    label: 'Failed',
    classes: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

const PROGRESSION_STEPS: RefundRecord['status'][] = ['pending', 'processing', 'completed'];

/**
 * List of refund records with status progression indicators and timestamps.
 *
 * @example
 * ```tsx
 * <RefundStatus refunds={refunds} />
 * ```
 */
export function RefundStatus({ refunds, className = '' }: RefundStatusProps) {
  if (refunds.length === 0) {
    return (
      <div className={`text-center p-8 ${className}`} role="status">
        <RotateCcw className="w-12 h-12 text-gray-600 mx-auto mb-3" aria-hidden="true" />
        <p className="text-gray-400">No refunds found</p>
      </div>
    );
  }

  const getProgressIndex = (status: RefundRecord['status']): number => {
    if (status === 'failed') return -1;
    return PROGRESSION_STEPS.indexOf(status);
  };

  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden ${className}`} role="region" aria-label="Refund Status">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-2">
        <RotateCcw className="w-5 h-5 text-[#F8B032]" aria-hidden="true" />
        <h3 className="font-semibold text-white">Refunds</h3>
        <span className="text-xs text-gray-500 ml-auto">{refunds.length} records</span>
      </div>

      {/* Refund List */}
      <div className="divide-y divide-white/5" role="list">
        {refunds.map((refund) => {
          const config = STATUS_CONFIG[refund.status];
          const progressIndex = getProgressIndex(refund.status);

          return (
            <div key={refund.id} className="p-4 hover:bg-white/5 transition-colors" role="listitem">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-mono font-medium text-white">
                    {refund.currency} {refund.amount}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{refund.reason}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${config.classes}`}>
                  {config.icon}
                  {config.label}
                </span>
              </div>

              {/* Status Progression */}
              {refund.status !== 'failed' && (
                <div className="flex items-center gap-1 mb-3">
                  {PROGRESSION_STEPS.map((step, i) => (
                    <React.Fragment key={step}>
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                          i <= progressIndex
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-white/5 text-gray-500'
                        }`}
                        aria-label={`${step}${i <= progressIndex ? ' (done)' : ''}`}
                      >
                        {i <= progressIndex ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-gray-600" />
                        )}
                      </div>
                      {i < PROGRESSION_STEPS.length - 1 && (
                        <ArrowRight className={`w-3 h-3 ${i < progressIndex ? 'text-green-400' : 'text-gray-600'}`} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Initiated: {new Date(refund.initiatedAt).toLocaleString()}</span>
                {refund.completedAt && (
                  <span className="text-green-400">
                    Completed: {new Date(refund.completedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
