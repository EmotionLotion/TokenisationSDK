import React, { useMemo } from 'react';
import { Clock, ArrowDownToLine, Timer, Banknote, AlertTriangle } from 'lucide-react';

export interface RedemptionWindowProps {
  windowStart: string;
  windowEnd: string;
  status: 'upcoming' | 'open' | 'closing_soon' | 'closed';
  navPerToken?: string;
  minAmount?: string;
  maxAmount?: string;
  processingTime?: string;
  onRedeem?: () => void;
  className?: string;
}

const STATUS_CONFIG: Record<string, { border: string; badge: string; text: string; label: string }> = {
  upcoming: { border: 'border-blue-500/30', badge: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', label: 'Upcoming' },
  open: { border: 'border-green-500/30', badge: 'bg-green-500/10 border-green-500/20', text: 'text-green-400', label: 'Open' },
  closing_soon: { border: 'border-amber-500/30', badge: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400', label: 'Closing Soon' },
  closed: { border: 'border-slate-500/30', badge: 'bg-slate-500/10 border-slate-500/20', text: 'text-slate-400', label: 'Closed' },
};

function computeCountdown(end: string): { days: number; hours: number; minutes: number } | null {
  const diff = new Date(end).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes };
}

export function RedemptionWindow({
  windowStart,
  windowEnd,
  status,
  navPerToken,
  minAmount,
  maxAmount,
  processingTime,
  onRedeem,
  className = '',
}: RedemptionWindowProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.closed;
  const isOpen = status === 'open' || status === 'closing_soon';

  const countdown = useMemo(() => {
    if (status === 'upcoming') return computeCountdown(windowStart);
    if (isOpen) return computeCountdown(windowEnd);
    return null;
  }, [windowStart, windowEnd, status, isOpen]);

  return (
    <div className={`rounded-xl border ${config.border} bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Redemption Window</span>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${config.badge} ${config.text}`}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Clock className="w-4 h-4" />
          <span>{new Date(windowStart).toLocaleDateString()} — {new Date(windowEnd).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Countdown */}
      {countdown && (
        <div className="px-5 py-3 border-b border-white/5">
          <p className="text-xs text-gray-500 mb-2">
            {status === 'upcoming' ? 'Opens in' : 'Closes in'}
          </p>
          <div className="flex items-center gap-3">
            {[
              { value: countdown.days, label: 'Days' },
              { value: countdown.hours, label: 'Hrs' },
              { value: countdown.minutes, label: 'Min' },
            ].map((unit) => (
              <div key={unit.label} className="flex flex-col items-center bg-white/5 rounded-lg px-3 py-1.5">
                <span className="text-lg font-bold text-white">{unit.value}</span>
                <span className="text-[10px] text-gray-500 uppercase">{unit.label}</span>
              </div>
            ))}
            {status === 'closing_soon' && <AlertTriangle className="w-4 h-4 text-amber-400 ml-auto" />}
          </div>
        </div>
      )}

      {/* Details */}
      <div className="px-5 py-3 space-y-2 border-b border-white/5">
        {navPerToken && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" />NAV / Token</span>
            <span className="text-white font-medium">{navPerToken}</span>
          </div>
        )}
        {minAmount && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Min Redemption</span>
            <span className="text-gray-300">{minAmount}</span>
          </div>
        )}
        {maxAmount && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Max Redemption</span>
            <span className="text-gray-300">{maxAmount}</span>
          </div>
        )}
        {processingTime && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" />Processing</span>
            <span className="text-gray-300">{processingTime}</span>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="px-5 py-3">
        <button
          onClick={onRedeem}
          disabled={!isOpen}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            isOpen
              ? 'bg-green-500 hover:bg-green-600 text-white cursor-pointer'
              : 'bg-white/5 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isOpen ? 'Redeem' : status === 'upcoming' ? 'Not Yet Open' : 'Window Closed'}
        </button>
      </div>
    </div>
  );
}
