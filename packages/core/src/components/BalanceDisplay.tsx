/**
 * Balance Display Component
 *
 * Shows token balance for a party with optional USD value.
 *
 * @example
 * ```tsx
 * <BalanceDisplay balance="1000" symbol="AHOY" />
 * <BalanceDisplay balance="500" symbol="PROP" usdValue="125000" />
 * ```
 */

import React from 'react';
import { defaultTheme, type TokenisationTheme } from './theme.js';

export interface BalanceDisplayProps {
  balance: string;
  symbol?: string;
  decimals?: number;
  usdValue?: string;
  showChange?: boolean;
  changePercent?: number;
  size?: 'sm' | 'md' | 'lg';
  theme?: TokenisationTheme;
}

const sizeStyles = {
  sm: { balance: '18px', symbol: '12px', usd: '11px' },
  md: { balance: '24px', symbol: '14px', usd: '12px' },
  lg: { balance: '32px', symbol: '16px', usd: '14px' },
};

function formatBalance(balance: string, decimals: number = 0): string {
  const num = parseFloat(balance) / Math.pow(10, decimals);
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUSD(value: string): string {
  const num = parseFloat(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function BalanceDisplay({
  balance,
  symbol,
  decimals = 0,
  usdValue,
  showChange = false,
  changePercent,
  size = 'md',
  theme = defaultTheme,
}: BalanceDisplayProps) {
  const styles = sizeStyles[size];
  const formattedBalance = formatBalance(balance, decimals);
  const isPositiveChange = changePercent !== undefined && changePercent >= 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        fontFamily: theme.fonts.family,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span
          style={{
            fontSize: styles.balance,
            fontWeight: 700,
            color: theme.colors.text,
            fontFamily: theme.fonts.mono,
          }}
        >
          {formattedBalance}
        </span>
        {symbol && (
          <span
            style={{
              fontSize: styles.symbol,
              fontWeight: 500,
              color: theme.colors.textSecondary,
            }}
          >
            {symbol}
          </span>
        )}
        {showChange && changePercent !== undefined && (
          <span
            style={{
              fontSize: styles.usd,
              fontWeight: 500,
              color: isPositiveChange ? theme.colors.success : theme.colors.error,
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            {isPositiveChange ? '↑' : '↓'}
            {Math.abs(changePercent).toFixed(1)}%
          </span>
        )}
      </div>
      {usdValue && (
        <span
          style={{
            fontSize: styles.usd,
            color: theme.colors.textMuted,
          }}
        >
          ≈ {formatUSD(usdValue)}
        </span>
      )}
    </div>
  );
}
