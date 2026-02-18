import React from 'react';
import { Clock, XCircle, AlertTriangle } from 'lucide-react';

export interface ReverifyProps {
  reason: 'expired' | 'rejected' | 'updated_requirements';
  expiresAt?: string;
  onReverify: () => void;
  className?: string;
}

const REASON_CONFIG: Record<
  ReverifyProps['reason'],
  { icon: React.ElementType; color: string; bg: string; border: string; message: string }
> = {
  expired: {
    icon: Clock,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    message: 'Your verification has expired',
  },
  rejected: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    message: 'Your verification was not approved',
  },
  updated_requirements: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    message: 'New requirements require re-verification',
  },
};

export function Reverify({
  reason,
  expiresAt,
  onReverify,
  className = '',
}: ReverifyProps) {
  const config = REASON_CONFIG[reason];
  const Icon = config.icon;

  return (
    <div
      className={`rounded-lg border ${config.border} ${config.bg} p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${config.color}`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${config.color}`}>{config.message}</p>
          {reason === 'expired' && expiresAt && (
            <p className="text-xs text-slate-500 mt-0.5">Expired on {expiresAt}</p>
          )}
          <button
            onClick={onReverify}
            className={`mt-3 inline-flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-md border ${config.border} ${config.color} hover:bg-white/5 transition-colors`}
          >
            Reverify Now
          </button>
        </div>
      </div>
    </div>
  );
}
