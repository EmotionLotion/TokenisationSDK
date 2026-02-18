import React from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lock,
  Clock,
  Shield,
  ArrowRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EligibilityRestriction {
  code: string;
  reason: string;
  resolvable: boolean;
  action?: string;
}

export interface TransferLimits {
  maxAmount?: string;
  dailyRemaining?: string;
}

export interface TransferEligibilityProps {
  eligible: boolean;
  restrictions: EligibilityRestriction[];
  limits?: TransferLimits;
  lockupEnds?: string;
  whitelistRequired?: boolean;
  whitelisted?: boolean;
  onResolve?: (code: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isLockupActive(lockupEnds: string): boolean {
  return new Date(lockupEnds).getTime() > Date.now();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransferEligibility({
  eligible,
  restrictions,
  limits,
  lockupEnds,
  whitelistRequired,
  whitelisted,
  onResolve,
  className = '',
}: TransferEligibilityProps) {
  const lockupActive = lockupEnds ? isLockupActive(lockupEnds) : false;

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Eligibility Header */}
      <div className={`px-5 py-4 border-b border-white/5 ${eligible ? 'bg-green-900/10' : 'bg-red-900/10'}`}>
        <div className="flex items-center gap-2">
          {eligible ? (
            <CheckCircle className="w-6 h-6 text-green-400" />
          ) : (
            <XCircle className="w-6 h-6 text-red-400" />
          )}
          <div>
            <h3 className={`text-lg font-semibold ${eligible ? 'text-green-400' : 'text-red-400'}`}>
              {eligible ? 'Transfer Eligible' : 'Transfer Ineligible'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {eligible
                ? 'All requirements met. You may proceed.'
                : `${restrictions.length} issue${restrictions.length !== 1 ? 's' : ''} must be resolved.`}
            </p>
          </div>
        </div>
      </div>

      {/* Restrictions */}
      {restrictions.length > 0 && (
        <div className="px-5 py-4 border-b border-white/5">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Restrictions</h4>
          <ul className="space-y-2">
            {restrictions.map((r, i) => (
              <li
                key={r.code || i}
                className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200">{r.reason}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.code}</p>
                  {r.action && (
                    <p className="text-xs text-gray-400 mt-0.5">{r.action}</p>
                  )}
                </div>
                {r.resolvable && onResolve && (
                  <button
                    onClick={() => onResolve(r.code)}
                    className="flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors px-2 py-1 rounded border border-amber-400/20 bg-amber-400/5 flex-shrink-0"
                  >
                    <ArrowRight className="w-3 h-3" />
                    Resolve
                  </button>
                )}
                {!r.resolvable && (
                  <span className="text-xs text-gray-600 flex-shrink-0">Not resolvable</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Limits */}
      {limits && (limits.maxAmount || limits.dailyRemaining) && (
        <div className="px-5 py-4 border-b border-white/5">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Transfer Limits</h4>
          <div className="grid grid-cols-2 gap-3">
            {limits.maxAmount && (
              <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <span className="text-xs text-gray-500 block">Max Amount</span>
                <span className="text-sm text-white font-semibold">{limits.maxAmount}</span>
              </div>
            )}
            {limits.dailyRemaining && (
              <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <span className="text-xs text-gray-500 block">Daily Remaining</span>
                <span className="text-sm text-white font-semibold">{limits.dailyRemaining}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lockup */}
      {lockupEnds && (
        <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
          <Lock className={`w-4 h-4 ${lockupActive ? 'text-red-400' : 'text-green-400'}`} />
          {lockupActive ? (
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-red-400" />
              <span className="text-sm text-red-300">
                Lockup active until {formatDate(lockupEnds)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-green-300">Lockup period ended</span>
          )}
        </div>
      )}

      {/* Whitelist Status */}
      {whitelistRequired !== undefined && (
        <div className="px-5 py-3 flex items-center gap-2">
          <Shield className={`w-4 h-4 ${whitelistRequired ? (whitelisted ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}`} />
          {whitelistRequired ? (
            whitelisted ? (
              <span className="flex items-center gap-1.5 text-sm text-green-300">
                <CheckCircle className="w-4 h-4 text-green-400" />
                Whitelisted
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-red-300">
                <XCircle className="w-4 h-4 text-red-400" />
                Not whitelisted (required)
              </span>
            )
          ) : (
            <span className="text-sm text-gray-400">Whitelist not required</span>
          )}
        </div>
      )}
    </div>
  );
}
