/**
 * KYC Badge Component
 *
 * Displays KYC verification status with visual indicator.
 *
 * @example
 * ```tsx
 * <KYCBadge verified={true} />
 * <KYCBadge verified={false} level="STANDARD" />
 * ```
 */

import React from 'react';
import { defaultTheme, type TokenisationTheme } from './theme.js';

export interface KYCBadgeProps {
  verified: boolean;
  level?: 'NONE' | 'BASIC' | 'STANDARD' | 'ENHANCED' | 'INSTITUTIONAL';
  expiresAt?: string;
  showExpiry?: boolean;
  theme?: TokenisationTheme;
}

export function KYCBadge({
  verified,
  level = 'NONE',
  expiresAt,
  showExpiry = false,
  theme = defaultTheme,
}: KYCBadgeProps) {
  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
  const effectiveVerified = verified && !isExpired;

  const backgroundColor = effectiveVerified
    ? `${theme.colors.success}20`
    : `${theme.colors.error}20`;

  const textColor = effectiveVerified
    ? theme.colors.success
    : theme.colors.error;

  const dotColor = effectiveVerified
    ? theme.colors.success
    : theme.colors.error;

  const levelLabels: Record<string, string> = {
    NONE: 'Not Verified',
    BASIC: 'Basic KYC',
    STANDARD: 'Standard KYC',
    ENHANCED: 'Enhanced KYC',
    INSTITUTIONAL: 'Institutional',
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        borderRadius: theme.borderRadius.full,
        backgroundColor,
        color: textColor,
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: theme.fonts.family,
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: dotColor,
        }}
      />
      {effectiveVerified ? levelLabels[level] || 'Verified' : 'Not Verified'}
      {showExpiry && expiresAt && effectiveVerified && (
        <span style={{ opacity: 0.7, fontSize: '10px' }}>
          (exp: {new Date(expiresAt).toLocaleDateString()})
        </span>
      )}
      {isExpired && (
        <span style={{ opacity: 0.7, fontSize: '10px' }}>(Expired)</span>
      )}
    </span>
  );
}
