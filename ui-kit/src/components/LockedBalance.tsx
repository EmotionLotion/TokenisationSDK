import React from 'react';
import { Lock, Unlock, Wallet } from 'lucide-react';

export interface LockedBalanceProps {
  balance: string;
  locked: string;
  transferable: string;
  symbol?: string;
  className?: string;
}

export function LockedBalance({
  balance,
  locked,
  transferable,
  symbol = '',
  className = '',
}: LockedBalanceProps) {
  const lockedNum = parseFloat(locked) || 0;
  const transferableNum = parseFloat(transferable) || 0;
  const total = lockedNum + transferableNum;
  const lockedPct = total > 0 ? (lockedNum / total) * 100 : 0;

  const suffix = symbol ? ` ${symbol}` : '';

  return (
    <div className={`rounded-lg border border-white/10 bg-white/5 p-4 ${className}`}>
      {/* Total Balance */}
      <div className="flex items-center gap-2 mb-4">
        <Wallet className="w-4 h-4 text-slate-400" />
        <span className="text-xs text-slate-500 uppercase tracking-wider">Total Balance</span>
      </div>
      <p className="text-2xl font-semibold text-slate-100 mb-4">
        {balance}{suffix}
      </p>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-slate-700 overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-amber-500"
          style={{ width: `${lockedPct}%` }}
        />
      </div>

      {/* Locked / Transferable */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-400" />
          <div>
            <p className="text-xs text-slate-500">Locked</p>
            <p className="text-sm font-medium text-amber-400">{locked}{suffix}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Unlock className="w-4 h-4 text-green-400" />
          <div>
            <p className="text-xs text-slate-500">Transferable</p>
            <p className="text-sm font-medium text-green-400">{transferable}{suffix}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
