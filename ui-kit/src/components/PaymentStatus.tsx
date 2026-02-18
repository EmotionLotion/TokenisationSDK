import React from 'react';
import {
  CreditCard,
  Building,
  Landmark,
  Bitcoin,
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  ExternalLink,
} from 'lucide-react';

/**
 * A single payment record
 */
export interface PaymentRecord {
  id: string;
  amount: string;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  method: string;
  createdAt: string;
  txHash?: string;
}

/**
 * Props for the PaymentStatus component
 */
export interface PaymentStatusProps {
  /** List of payment records to display */
  payments: PaymentRecord[];
  /** Custom class name */
  className?: string;
}

const STATUS_CONFIG: Record<PaymentRecord['status'], { label: string; classes: string; icon: React.ReactNode }> = {
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

const getMethodIcon = (method: string): React.ReactNode => {
  switch (method.toLowerCase()) {
    case 'card':
      return <CreditCard className="w-4 h-4 text-gray-400" />;
    case 'wire':
      return <Building className="w-4 h-4 text-gray-400" />;
    case 'ach':
      return <Landmark className="w-4 h-4 text-gray-400" />;
    case 'crypto':
      return <Bitcoin className="w-4 h-4 text-gray-400" />;
    default:
      return <CreditCard className="w-4 h-4 text-gray-400" />;
  }
};

/**
 * List of payment records with status badges, method icons, and optional tx hash links.
 *
 * @example
 * ```tsx
 * <PaymentStatus payments={payments} />
 * ```
 */
export function PaymentStatus({ payments, className = '' }: PaymentStatusProps) {
  if (payments.length === 0) {
    return (
      <div className={`text-center p-8 ${className}`} role="status">
        <CreditCard className="w-12 h-12 text-gray-600 mx-auto mb-3" aria-hidden="true" />
        <p className="text-gray-400">No payments found</p>
      </div>
    );
  }

  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden ${className}`} role="region" aria-label="Payment Status">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-[#F8B032]" aria-hidden="true" />
        <h3 className="font-semibold text-white">Payments</h3>
        <span className="text-xs text-gray-500 ml-auto">{payments.length} records</span>
      </div>

      {/* Payment List */}
      <div className="divide-y divide-white/5" role="list">
        {payments.map((payment) => {
          const config = STATUS_CONFIG[payment.status];
          return (
            <div key={payment.id} className="p-4 hover:bg-white/5 transition-colors" role="listitem">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center" aria-hidden="true">
                    {getMethodIcon(payment.method)}
                  </div>
                  <div>
                    <p className="text-sm font-mono font-medium text-white">
                      {payment.currency} {payment.amount}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(payment.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${config.classes}`}>
                    {config.icon}
                    {config.label}
                  </span>
                </div>
              </div>
              {payment.txHash && (
                <div className="mt-2 ml-11">
                  <a
                    href={`https://etherscan.io/tx/${payment.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <span className="font-mono">{payment.txHash.slice(0, 10)}...{payment.txHash.slice(-6)}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
