/**
 * StatusBadge - Visual indicator for asset/identity status
 */

import React from 'react';
import type { AssetStatus, KYCStatus } from '../types';

// ============================================
// Types
// ============================================

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusBadgeProps {
  /** The status text to display */
  status: string;
  /** Visual variant (auto-detected if not provided) */
  variant?: BadgeVariant;
  /** Size of the badge */
  size?: 'sm' | 'md' | 'lg';
  /** Show a dot indicator */
  showDot?: boolean;
  /** Pulsing animation for active states */
  pulse?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// Status to Variant Mapping
// ============================================

const assetStatusVariants: Record<AssetStatus, BadgeVariant> = {
  draft: 'neutral',
  pending_verification: 'warning',
  verified: 'info',
  active: 'success',
  frozen: 'error',
  redeemed: 'info',
  expired: 'warning',
  burned: 'error',
};

const kycStatusVariants: Record<KYCStatus, BadgeVariant> = {
  pending: 'warning',
  verified: 'success',
  revoked: 'error',
  expired: 'warning',
};

function getVariantFromStatus(status: string): BadgeVariant {
  const lowerStatus = status.toLowerCase().replace(/_/g, '_') as AssetStatus | KYCStatus;
  return (
    assetStatusVariants[lowerStatus as AssetStatus] ||
    kycStatusVariants[lowerStatus as KYCStatus] ||
    'default'
  );
}

// ============================================
// Variant Styles
// ============================================

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  success: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  neutral: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const dotStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-400',
  success: 'bg-green-400',
  warning: 'bg-yellow-400',
  error: 'bg-red-400',
  info: 'bg-blue-400',
  neutral: 'bg-slate-400',
};

const sizeStyles = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

// ============================================
// Component
// ============================================

export function StatusBadge({
  status,
  variant,
  size = 'md',
  showDot = false,
  pulse = false,
  className = '',
}: StatusBadgeProps) {
  const resolvedVariant = variant || getVariantFromStatus(status);

  const formatStatus = (s: string) => {
    return s
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-md border font-medium
        ${variantStyles[resolvedVariant]}
        ${sizeStyles[size]}
        ${className}
      `}
    >
      {showDot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={`
                absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping
                ${dotStyles[resolvedVariant]}
              `}
            />
          )}
          <span
            className={`
              relative inline-flex h-2 w-2 rounded-full
              ${dotStyles[resolvedVariant]}
            `}
          />
        </span>
      )}
      {formatStatus(status)}
    </span>
  );
}

// ============================================
// Specialized Variants
// ============================================

export interface ComplianceBadgeProps {
  status: 'compliant' | 'action_required' | 'pending' | 'revoked';
  message?: string;
  onClick?: () => void;
  className?: string;
}

export function ComplianceBadge({
  status,
  message,
  onClick,
  className = '',
}: ComplianceBadgeProps) {
  const config = {
    compliant: {
      variant: 'success' as BadgeVariant,
      icon: '✓',
      label: 'Compliant',
    },
    action_required: {
      variant: 'error' as BadgeVariant,
      icon: '!',
      label: 'Action Required',
    },
    pending: {
      variant: 'warning' as BadgeVariant,
      icon: '○',
      label: 'Pending',
    },
    revoked: {
      variant: 'error' as BadgeVariant,
      icon: '✕',
      label: 'Revoked',
    },
  };

  const { variant, icon, label } = config[status];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-medium text-xs
        transition-all
        ${variantStyles[variant]}
        ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
        ${className}
      `}
      title={message}
    >
      <span className="font-bold">{icon}</span>
      {label}
    </button>
  );
}
