import React from 'react';
import { DollarSign, ArrowRight, RotateCcw, Banknote, Loader2, ShieldAlert } from 'lucide-react';

export interface ActionButtonProps {
  type: 'invest' | 'transfer' | 'refund' | 'redeem';
  label?: string;
  amount?: string;
  currency?: string;
  disabled?: boolean;
  blocked?: boolean;
  blockedReason?: string;
  loading?: boolean;
  onClick: () => void;
  className?: string;
}

const TYPE_CONFIG: Record<
  ActionButtonProps['type'],
  {
    icon: React.ElementType;
    label: string;
    base: string;
    hover: string;
    ring: string;
  }
> = {
  invest: {
    icon: DollarSign,
    label: 'Invest',
    base: 'bg-green-500',
    hover: 'hover:bg-green-600',
    ring: 'ring-green-500/30',
  },
  transfer: {
    icon: ArrowRight,
    label: 'Transfer',
    base: 'bg-blue-500',
    hover: 'hover:bg-blue-600',
    ring: 'ring-blue-500/30',
  },
  refund: {
    icon: RotateCcw,
    label: 'Request Refund',
    base: 'bg-amber-500',
    hover: 'hover:bg-amber-600',
    ring: 'ring-amber-500/30',
  },
  redeem: {
    icon: Banknote,
    label: 'Redeem',
    base: 'bg-violet-500',
    hover: 'hover:bg-violet-600',
    ring: 'ring-violet-500/30',
  },
};

export function ActionButton({
  type,
  label,
  amount,
  currency,
  disabled = false,
  blocked = false,
  blockedReason,
  loading = false,
  onClick,
  className = '',
}: ActionButtonProps) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;
  const displayLabel = label ?? config.label;
  const isDisabled = disabled || blocked || loading;

  const buttonText = amount
    ? `${displayLabel} ${currency ? `${currency} ` : '$'}${amount}`
    : displayLabel;

  const buttonClass = blocked
    ? 'bg-white/5 border-2 border-red-500/50 text-red-400 cursor-not-allowed'
    : disabled
      ? 'bg-white/5 text-slate-500 cursor-not-allowed'
      : loading
        ? `${config.base} opacity-80 text-white cursor-wait`
        : `${config.base} ${config.hover} text-white ring-1 ${config.ring} cursor-pointer`;

  return (
    <div className={className}>
      <button
        onClick={onClick}
        disabled={isDisabled}
        className={`w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 px-4 rounded-lg transition-all ${buttonClass}`}
        aria-disabled={isDisabled}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Processing...
          </>
        ) : blocked ? (
          <>
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            {buttonText}
          </>
        ) : (
          <>
            <Icon className="w-4 h-4" aria-hidden="true" />
            {buttonText}
          </>
        )}
      </button>
      {blocked && blockedReason && (
        <p className="mt-1.5 text-xs text-red-400/80 text-center">{blockedReason}</p>
      )}
    </div>
  );
}
