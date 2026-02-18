import React from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, Shield, ArrowRight, DollarSign, Timer } from 'lucide-react';

export interface PreflightCheckItem {
  name: string;
  status: 'pass' | 'fail' | 'pending' | 'warning';
  message?: string;
}

export interface PreflightCheckProps {
  checks: PreflightCheckItem[];
  limits?: { min?: string; max?: string; daily?: string; remaining?: string };
  fees?: { gas?: string; platform?: string; total?: string };
  lockupEnds?: string;
  estimatedTime?: string;
  className?: string;
}

const CHECK_ICON: Record<PreflightCheckItem['status'], { icon: React.ElementType; color: string }> = {
  pass: { icon: CheckCircle, color: 'text-green-400' },
  fail: { icon: XCircle, color: 'text-red-400' },
  pending: { icon: Clock, color: 'text-blue-400' },
  warning: { icon: AlertTriangle, color: 'text-amber-400' },
};

export function PreflightCheck({
  checks,
  limits,
  fees,
  lockupEnds,
  estimatedTime,
  className = '',
}: PreflightCheckProps) {
  const allPassed = checks.every((c) => c.status === 'pass');
  const hasFail = checks.some((c) => c.status === 'fail');

  const headerColor = hasFail ? 'text-red-400' : allPassed ? 'text-green-400' : 'text-amber-400';
  const headerText = hasFail ? 'Preflight failed' : allPassed ? 'Preflight passed' : 'Preflight in progress';

  return (
    <div className={`rounded-lg border border-white/10 bg-white/5 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Shield className={`w-4 h-4 ${headerColor}`} />
          <span className={`text-sm font-medium ${headerColor}`}>{headerText}</span>
        </div>
      </div>

      {/* Checks */}
      <div className="px-4 py-3 space-y-2 border-b border-white/5">
        {checks.map((check, i) => {
          const cfg = CHECK_ICON[check.status];
          const Icon = cfg.icon;
          return (
            <div key={i} className="flex items-start gap-2">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
              <div className="min-w-0">
                <p className="text-sm text-slate-200">{check.name}</p>
                {check.message && <p className="text-xs text-slate-500 mt-0.5">{check.message}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Limits */}
      {limits && (
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Investment Limits</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {limits.min && (
              <div>
                <span className="text-slate-500">Min:</span>{' '}
                <span className="text-slate-300">{limits.min}</span>
              </div>
            )}
            {limits.max && (
              <div>
                <span className="text-slate-500">Max:</span>{' '}
                <span className="text-slate-300">{limits.max}</span>
              </div>
            )}
            {limits.daily && (
              <div>
                <span className="text-slate-500">Daily:</span>{' '}
                <span className="text-slate-300">{limits.daily}</span>
              </div>
            )}
            {limits.remaining && (
              <div>
                <span className="text-slate-500">Remaining:</span>{' '}
                <span className="text-slate-300">{limits.remaining}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fees */}
      {fees && (
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Fee Breakdown</p>
          <div className="space-y-1 text-sm">
            {fees.gas && (
              <div className="flex justify-between">
                <span className="text-slate-500">Gas</span>
                <span className="text-slate-300">{fees.gas}</span>
              </div>
            )}
            {fees.platform && (
              <div className="flex justify-between">
                <span className="text-slate-500">Platform</span>
                <span className="text-slate-300">{fees.platform}</span>
              </div>
            )}
            {fees.total && (
              <div className="flex justify-between pt-1 border-t border-white/5">
                <span className="text-slate-400 font-medium">Total</span>
                <span className="text-slate-200 font-medium">{fees.total}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lockup + Estimated time */}
      {(lockupEnds || estimatedTime) && (
        <div className="px-4 py-3 flex items-center justify-between text-xs text-slate-500">
          {lockupEnds && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Lockup ends {lockupEnds}</span>
            </div>
          )}
          {estimatedTime && (
            <div className="flex items-center gap-1">
              <Timer className="w-3 h-3" />
              <span>Est. {estimatedTime}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
