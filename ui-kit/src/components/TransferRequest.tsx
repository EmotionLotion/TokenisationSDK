import React from 'react';
import {
  ArrowRight,
  CheckCircle,
  XCircle,
  Loader2,
  Wallet,
  Banknote,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplianceCheck {
  name: string;
  passed: boolean;
}

export interface TransferFees {
  gas: string;
  platform: string;
  total: string;
}

export interface TransferRequestProps {
  assetName: string;
  fromAddress?: string;
  toAddress: string;
  amount: string;
  symbol?: string;
  compliance?: {
    eligible: boolean;
    checks: ComplianceCheck[];
  };
  fees?: TransferFees;
  onSubmit: () => void;
  onCancel?: () => void;
  loading?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransferRequest({
  assetName,
  fromAddress,
  toAddress,
  amount,
  symbol,
  compliance,
  fees,
  onSubmit,
  onCancel,
  loading = false,
  className = '',
}: TransferRequestProps) {
  const isEligible = compliance ? compliance.eligible : true;

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <ArrowRight className="w-5 h-5 text-amber-400" />
          <span className="text-xs text-gray-500 uppercase tracking-wider">Transfer Request</span>
        </div>
        <h3 className="text-lg font-semibold text-white mt-2">{assetName}</h3>
      </div>

      {/* From / To */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          {fromAddress ? (
            <div className="flex-1 min-w-0">
              <span className="text-xs text-gray-500 block">From</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Wallet className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-slate-200 font-mono">{shortenAddress(fromAddress)}</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <span className="text-xs text-gray-500 block">From</span>
              <span className="text-sm text-gray-400 mt-0.5 block">Your wallet</span>
            </div>
          )}

          <ArrowRight className="w-5 h-5 text-gray-500 flex-shrink-0" />

          <div className="flex-1 min-w-0">
            <span className="text-xs text-gray-500 block">To</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Wallet className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm text-slate-200 font-mono">{shortenAddress(toAddress)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Amount */}
      <div className="px-5 py-4 border-b border-white/5 text-center">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Amount</span>
        <div className="mt-1 flex items-baseline justify-center gap-2">
          <span className="text-2xl font-bold text-white">{amount}</span>
          {symbol && <span className="text-sm text-gray-400">{symbol}</span>}
        </div>
      </div>

      {/* Compliance Checks */}
      {compliance && (
        <div className="px-5 py-4 border-b border-white/5">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Compliance Checks</h4>
          <ul className="space-y-1.5">
            {compliance.checks.map((check, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {check.passed ? (
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
                <span className={check.passed ? 'text-slate-300' : 'text-red-300'}>{check.name}</span>
              </li>
            ))}
          </ul>
          {!isEligible && (
            <p className="text-xs text-red-400 mt-2">
              One or more compliance checks have failed. Transfer cannot proceed.
            </p>
          )}
        </div>
      )}

      {/* Fee Breakdown */}
      {fees && (
        <div className="px-5 py-4 border-b border-white/5">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Banknote className="w-4 h-4" />
            Fees
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Gas</span>
              <span className="text-slate-300">{fees.gas}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Platform</span>
              <span className="text-slate-300">{fees.platform}</span>
            </div>
            <div className="flex justify-between border-t border-white/5 pt-1 mt-1">
              <span className="text-gray-300 font-medium">Total</span>
              <span className="text-white font-semibold">{fees.total}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-4 flex items-center gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          onClick={onSubmit}
          disabled={!isEligible || loading}
          className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            isEligible
              ? 'bg-amber-500 hover:bg-amber-400 text-black'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          } disabled:opacity-60`}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            'Submit Transfer'
          )}
        </button>
      </div>
    </div>
  );
}
