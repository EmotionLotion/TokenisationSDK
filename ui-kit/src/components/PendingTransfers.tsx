import React from 'react';
import { ArrowRight, Clock, ShieldAlert, CheckCircle, Loader } from 'lucide-react';

export interface PendingTransfer {
  id: string;
  to: string;
  amount: string;
  status: 'pending' | 'kyc_required' | 'approved' | 'processing';
  createdAt: string;
}

export interface PendingTransfersProps {
  transfers: PendingTransfer[];
  className?: string;
}

const STATUS_STYLES: Record<
  PendingTransfer['status'],
  { bg: string; text: string; label: string }
> = {
  pending: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', label: 'Pending' },
  kyc_required: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400', label: 'KYC Required' },
  approved: { bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-400', label: 'Approved' },
  processing: { bg: 'bg-violet-500/10 border-violet-500/20', text: 'text-violet-400', label: 'Processing' },
};

function shortenAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function PendingTransfers({ transfers, className = '' }: PendingTransfersProps) {
  if (transfers.length === 0) {
    return (
      <div className={`rounded-lg border border-white/10 bg-white/5 p-4 text-center ${className}`}>
        <Clock className="w-5 h-5 text-slate-500 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No pending transfers</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-white/10 bg-white/5 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-200">Pending Transfers</span>
          <span className="text-xs text-slate-500">({transfers.length})</span>
        </div>
      </div>

      <ul className="divide-y divide-white/5">
        {transfers.map((tx) => {
          const style = STATUS_STYLES[tx.status];
          return (
            <li key={tx.id} className="px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm text-slate-200 font-medium">
                  To {shortenAddress(tx.to)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{timeAgo(tx.createdAt)}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-medium text-slate-300">{tx.amount}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${style.bg} ${style.text}`}>
                  {style.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
