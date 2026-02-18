import React from 'react';
import { ShieldOff, Clock, ShieldCheck, AlertTriangle, Ban } from 'lucide-react';

export interface IdentityStatusProps {
  status: 'unverified' | 'pending' | 'verified' | 'expired' | 'blocked';
  name?: string;
  verifiedAt?: string;
  expiresAt?: string;
  onAction?: () => void;
  className?: string;
}

const STATUS_CONFIG: Record<
  IdentityStatusProps['status'],
  { icon: React.ElementType; color: string; bg: string; border: string; label: string; action: string }
> = {
  unverified: {
    icon: ShieldOff,
    color: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    label: 'Unverified',
    action: 'Start Verification',
  },
  pending: {
    icon: Clock,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    label: 'Pending',
    action: 'View Status',
  },
  verified: {
    icon: ShieldCheck,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    label: 'Verified',
    action: 'View Status',
  },
  expired: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    label: 'Expired',
    action: 'Reverify',
  },
  blocked: {
    icon: Ban,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    label: 'Blocked',
    action: 'Contact Support',
  },
};

export function IdentityStatus({
  status,
  name,
  verifiedAt,
  expiresAt,
  onAction,
  className = '',
}: IdentityStatusProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${config.color}`} />
          <div>
            {name && <p className="text-sm font-medium text-slate-200">{name}</p>}
            <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${config.border} ${config.bg} ${config.color}`}>
          {config.label}
        </span>
      </div>

      {status === 'verified' && verifiedAt && (
        <p className="mt-2 ml-8 text-xs text-slate-500">Verified on {verifiedAt}</p>
      )}
      {status === 'expired' && expiresAt && (
        <p className="mt-2 ml-8 text-xs text-amber-400/60">Expired on {expiresAt}</p>
      )}

      {onAction && (
        <button
          onClick={onAction}
          className={`mt-3 w-full text-sm font-medium py-1.5 rounded-md border ${config.border} ${config.color} hover:bg-white/5 transition-colors`}
        >
          {config.action}
        </button>
      )}
    </div>
  );
}
