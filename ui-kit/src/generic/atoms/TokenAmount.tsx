/**
 * TokenAmount - Formatted display of token amounts with symbol
 */

import React from 'react';

// ============================================
// Types
// ============================================

export interface TokenAmountProps {
  /** Amount as string, number, or bigint */
  amount: string | number | bigint;
  /** Decimal places for the token */
  decimals?: number;
  /** Number of decimal places to display */
  displayDecimals?: number;
  /** Token symbol (optional) */
  symbol?: string;
  /** Symbol position */
  symbolPosition?: 'prefix' | 'suffix';
  /** Show full precision on hover */
  showFullOnHover?: boolean;
  /** Size variant */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Color variant */
  variant?: 'default' | 'positive' | 'negative' | 'muted';
  /** Show + sign for positive numbers */
  showSign?: boolean;
  /** Compact format for large numbers (1M, 1B) */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// Formatting Utilities
// ============================================

function formatBigInt(
  value: bigint,
  decimals: number,
  displayDecimals: number
): string {
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;

  if (fraction === 0n) {
    return whole.toLocaleString();
  }

  const fractionStr = fraction
    .toString()
    .padStart(decimals, '0')
    .slice(0, displayDecimals)
    .replace(/0+$/, ''); // Remove trailing zeros

  if (!fractionStr) {
    return whole.toLocaleString();
  }

  return `${whole.toLocaleString()}.${fractionStr}`;
}

function formatNumber(
  value: number,
  displayDecimals: number,
  compact: boolean
): string {
  if (compact) {
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000_000) {
      return (value / 1_000_000_000).toFixed(1) + 'B';
    }
    if (absValue >= 1_000_000) {
      return (value / 1_000_000).toFixed(1) + 'M';
    }
    if (absValue >= 1_000) {
      return (value / 1_000).toFixed(1) + 'K';
    }
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: displayDecimals,
  });
}

function parseAmount(amount: string | number | bigint): bigint | number {
  if (typeof amount === 'bigint') return amount;
  if (typeof amount === 'number') return amount;

  // Try to parse as bigint first
  try {
    return BigInt(amount);
  } catch {
    // Fall back to number
    return parseFloat(amount) || 0;
  }
}

// ============================================
// Styles
// ============================================

const sizeStyles = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-2xl font-semibold',
};

const variantStyles = {
  default: 'text-white',
  positive: 'text-green-400',
  negative: 'text-red-400',
  muted: 'text-gray-400',
};

// ============================================
// Component
// ============================================

export function TokenAmount({
  amount,
  decimals = 18,
  displayDecimals = 4,
  symbol,
  symbolPosition = 'suffix',
  showFullOnHover = true,
  size = 'md',
  variant = 'default',
  showSign = false,
  compact = false,
  className = '',
}: TokenAmountProps) {
  const parsedAmount = parseAmount(amount);
  const isBigInt = typeof parsedAmount === 'bigint';

  // Format for display
  let formattedAmount: string;
  let fullAmount: string;

  if (isBigInt) {
    formattedAmount = formatBigInt(parsedAmount as bigint, decimals, displayDecimals);
    fullAmount = formatBigInt(parsedAmount as bigint, decimals, decimals);
  } else {
    const numValue = parsedAmount as number;
    formattedAmount = formatNumber(numValue, displayDecimals, compact);
    fullAmount = numValue.toLocaleString(undefined, {
      maximumFractionDigits: 20,
    });
  }

  // Handle sign
  const numericValue = isBigInt
    ? Number(parsedAmount) / 10 ** decimals
    : (parsedAmount as number);

  if (showSign && numericValue > 0) {
    formattedAmount = '+' + formattedAmount;
  }

  // Build display string
  let displayText = formattedAmount;
  if (symbol) {
    displayText =
      symbolPosition === 'prefix'
        ? `${symbol} ${formattedAmount}`
        : `${formattedAmount} ${symbol}`;
  }

  return (
    <span
      className={`
        font-mono inline-flex items-center gap-1
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        ${className}
      `}
      title={showFullOnHover ? fullAmount + (symbol ? ` ${symbol}` : '') : undefined}
    >
      {displayText}
    </span>
  );
}

// ============================================
// Specialized Variants
// ============================================

export interface PriceDisplayProps {
  price: string | number;
  currency?: string;
  change?: number; // percentage change
  size?: TokenAmountProps['size'];
  className?: string;
}

export function PriceDisplay({
  price,
  currency = 'USD',
  change,
  size = 'md',
  className = '',
}: PriceDisplayProps) {
  const currencySymbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    USDC: 'USDC',
    USDT: 'USDT',
  };

  const symbol = currencySymbols[currency] || currency;
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <TokenAmount
        amount={numPrice}
        decimals={0}
        displayDecimals={2}
        symbol={symbol}
        symbolPosition="prefix"
        size={size}
        compact={numPrice >= 1000000}
      />
      {change !== undefined && (
        <span
          className={`
            text-xs font-medium
            ${change >= 0 ? 'text-green-400' : 'text-red-400'}
          `}
        >
          {change >= 0 ? '+' : ''}
          {change.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

export interface BalanceDisplayProps {
  balance: string | number | bigint;
  decimals?: number;
  symbol?: string;
  label?: string;
  size?: TokenAmountProps['size'];
  className?: string;
}

export function BalanceDisplay({
  balance,
  decimals = 18,
  symbol,
  label = 'Balance',
  size = 'md',
  className = '',
}: BalanceDisplayProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <TokenAmount
        amount={balance}
        decimals={decimals}
        displayDecimals={4}
        symbol={symbol}
        size={size}
      />
    </div>
  );
}
