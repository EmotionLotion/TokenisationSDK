import React from 'react';
import { Coins, Calendar, CheckCircle, Loader2, X } from 'lucide-react';

export interface DistributionHolder {
  name: string;
  address: string;
  share: number;
  amount: string;
}

export interface DistributionPreviewProps {
  assetName: string;
  distributionType: 'dividend' | 'rent' | 'interest' | 'profit_share';
  totalAmount: string;
  currency: string;
  holders: DistributionHolder[];
  paymentDate?: string;
  snapshotDate?: string;
  status: 'draft' | 'preview' | 'approved' | 'executing';
  onApprove?: () => void;
  onCancel?: () => void;
  className?: string;
}

const TYPE_LABELS: Record<DistributionPreviewProps['distributionType'], string> = {
  dividend: 'Dividend',
  rent: 'Rent',
  interest: 'Interest',
  profit_share: 'Profit Share',
};

const STATUS_STYLE: Record<DistributionPreviewProps['status'], { color: string; bg: string; label: string }> = {
  draft: { color: 'text-slate-400', bg: 'bg-slate-500/10', label: 'Draft' },
  preview: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Preview' },
  approved: { color: 'text-green-400', bg: 'bg-green-500/10', label: 'Approved' },
  executing: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Executing' },
};

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function DistributionPreview({
  assetName,
  distributionType,
  totalAmount,
  currency,
  holders,
  paymentDate,
  snapshotDate,
  status,
  onApprove,
  onCancel,
  className = '',
}: DistributionPreviewProps) {
  const statusStyle = STATUS_STYLE[status];

  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden ${className}`} role="region" aria-label="Distribution preview">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" aria-hidden="true" />
            <h3 className="font-semibold text-white">{assetName}</h3>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle.color} ${statusStyle.bg}`}>
            {statusStyle.label}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs text-slate-500 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
            {TYPE_LABELS[distributionType]}
          </span>
          <span className="text-lg font-semibold text-white">
            {currency} {totalAmount}
          </span>
        </div>
      </div>

      {/* Dates */}
      {(snapshotDate || paymentDate) && (
        <div className="px-4 py-3 border-b border-white/10 flex gap-4">
          {snapshotDate && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Snapshot: {snapshotDate}</span>
            </div>
          )}
          {paymentDate && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Payment: {paymentDate}</span>
            </div>
          )}
        </div>
      )}

      {/* Holder Breakdown */}
      <div className="divide-y divide-white/5">
        {/* Table header */}
        <div className="px-4 py-2 flex items-center text-xs text-slate-500 font-medium">
          <span className="flex-1">Holder</span>
          <span className="w-20 text-right">Share</span>
          <span className="w-28 text-right">Amount</span>
        </div>
        {holders.map((holder, i) => (
          <div key={i} className="px-4 py-2.5 flex items-center hover:bg-white/5 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 truncate">{holder.name}</p>
              <p className="text-xs text-slate-500 font-mono">{shortenAddress(holder.address)}</p>
            </div>
            <span className="w-20 text-right text-xs text-slate-400">{holder.share}%</span>
            <span className="w-28 text-right text-sm font-mono text-white">
              {currency} {holder.amount}
            </span>
          </div>
        ))}
        {/* Total row */}
        <div className="px-4 py-2.5 flex items-center bg-white/5">
          <span className="flex-1 text-sm font-medium text-slate-300">Total</span>
          <span className="w-20 text-right text-xs text-slate-400">100%</span>
          <span className="w-28 text-right text-sm font-mono font-semibold text-white">
            {currency} {totalAmount}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
        {status === 'preview' && (
          <>
            {onCancel && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
                Cancel
              </button>
            )}
            {onApprove && (
              <button
                onClick={onApprove}
                className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
              >
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
                Approve
              </button>
            )}
          </>
        )}
        {status === 'executing' && (
          <span className="flex items-center gap-1.5 text-sm text-amber-400">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Executing...
          </span>
        )}
        {status === 'approved' && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full">
            <CheckCircle className="w-4 h-4" aria-hidden="true" />
            Approved
          </span>
        )}
      </div>
    </div>
  );
}
