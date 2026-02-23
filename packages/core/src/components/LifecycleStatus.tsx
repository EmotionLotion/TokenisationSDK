/**
 * Lifecycle Status Component
 *
 * Displays the current lifecycle state of an asset with visual indicator.
 *
 * @example
 * ```tsx
 * <LifecycleStatus state="ACTIVE" />
 * <LifecycleStatus state="DRAFT" showDescription />
 * ```
 */

import React from 'react';
import { LifecycleState } from '../core/types.js';
import { defaultTheme, type TokenisationTheme } from './theme.js';

export interface LifecycleStatusProps {
  state: LifecycleState | string;
  showDescription?: boolean;
  size?: 'sm' | 'md' | 'lg';
  theme?: TokenisationTheme;
}

const stateConfig: Record<
  string,
  { color: string; icon: string; description: string }
> = {
  DRAFT: {
    color: '#64748B',
    icon: '📝',
    description: 'Asset is being drafted',
  },
  PENDING_VERIFICATION: {
    color: '#F59E0B',
    icon: '⏳',
    description: 'Awaiting verification',
  },
  VERIFIED: {
    color: '#3B82F6',
    icon: '✓',
    description: 'Verified, ready to activate',
  },
  ACTIVE: {
    color: '#10B981',
    icon: '✅',
    description: 'Active and tradeable',
  },
  SUSPENDED: {
    color: '#EF4444',
    icon: '⏸️',
    description: 'Temporarily suspended',
  },
  REDEEMED: {
    color: '#8B5CF6',
    icon: '🎁',
    description: 'Redeemed by holder',
  },
  EXPIRED: {
    color: '#6B7280',
    icon: '⏰',
    description: 'Validity period ended',
  },
  BURNED: {
    color: '#374151',
    icon: '🔥',
    description: 'Permanently destroyed',
  },
};

const sizeStyles = {
  sm: { fontSize: '11px', padding: '2px 6px', iconSize: '10px' },
  md: { fontSize: '12px', padding: '4px 10px', iconSize: '12px' },
  lg: { fontSize: '14px', padding: '6px 14px', iconSize: '14px' },
};

export function LifecycleStatus({
  state,
  showDescription = false,
  size = 'md',
  theme = defaultTheme,
}: LifecycleStatusProps) {
  const config = stateConfig[state] || {
    color: '#64748B',
    icon: '❓',
    description: 'Unknown state',
  };
  const styles = sizeStyles[size];

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: showDescription ? 'column' : 'row',
        alignItems: showDescription ? 'flex-start' : 'center',
        gap: showDescription ? theme.spacing.xs : theme.spacing.sm,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: styles.padding,
          borderRadius: theme.borderRadius.full,
          backgroundColor: `${config.color}20`,
          color: config.color,
          fontSize: styles.fontSize,
          fontWeight: 600,
          fontFamily: theme.fonts.family,
        }}
      >
        <span style={{ fontSize: styles.iconSize }}>{config.icon}</span>
        {state.replace(/_/g, ' ')}
      </span>
      {showDescription && (
        <span
          style={{
            fontSize: '11px',
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.family,
          }}
        >
          {config.description}
        </span>
      )}
    </div>
  );
}
