/**
 * Transfer Form Component
 *
 * Pre-built form for transferring tokens between parties.
 *
 * @example
 * ```tsx
 * <TransferForm
 *   assetId={asset.id}
 *   fromPartyId={sender.id}
 *   parties={allParties}
 *   onTransfer={async (to, amount) => { ... }}
 * />
 * ```
 */

import React, { useState } from 'react';
import { type Party } from '../models/Party.js';
import { defaultTheme, createStyles, type TokenisationTheme } from './theme.js';

export interface TransferFormProps {
  assetId: string;
  assetName?: string;
  fromPartyId: string;
  parties: Party[];
  balance?: string;
  symbol?: string;
  onTransfer: (toPartyId: string, amount: string) => Promise<{ success: boolean; error?: string }>;
  theme?: TokenisationTheme;
}

export function TransferForm({
  assetId,
  assetName,
  fromPartyId,
  parties,
  balance = '0',
  symbol = 'tokens',
  onTransfer,
  theme = defaultTheme,
}: TransferFormProps) {
  const [toPartyId, setToPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const styles = createStyles(theme);
  const availableRecipients = parties.filter((p) => p.id !== fromPartyId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!toPartyId) {
      setError('Please select a recipient');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (parseFloat(amount) > parseFloat(balance)) {
      setError('Insufficient balance');
      return;
    }

    setIsLoading(true);

    try {
      const result = await onTransfer(toPartyId, amount);
      if (result.success) {
        setSuccess(true);
        setAmount('');
        setToPartyId('');
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error || 'Transfer failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        ...styles.container,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}
    >
      {/* Header */}
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: 600,
            color: theme.colors.text,
          }}
        >
          Transfer {symbol}
        </h3>
        {assetName && (
          <p
            style={{
              margin: `${theme.spacing.xs} 0 0`,
              fontSize: '13px',
              color: theme.colors.textMuted,
            }}
          >
            Asset: {assetName}
          </p>
        )}
      </div>

      {/* Balance */}
      <div
        style={{
          padding: theme.spacing.sm,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.background,
        }}
      >
        <div
          style={{
            fontSize: '11px',
            color: theme.colors.textMuted,
            marginBottom: '2px',
          }}
        >
          Available Balance
        </div>
        <div
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: theme.colors.text,
            fontFamily: theme.fonts.mono,
          }}
        >
          {parseFloat(balance).toLocaleString()} {symbol}
        </div>
      </div>

      {/* Recipient */}
      <div>
        <label style={styles.label}>Recipient</label>
        <select
          value={toPartyId}
          onChange={(e) => setToPartyId(e.target.value)}
          style={{
            ...styles.input,
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394A3B8' d='M6 8L2 4h8z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: '36px',
          }}
          disabled={isLoading}
        >
          <option value="">Select recipient...</option>
          {availableRecipients.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name} ({party.jurisdiction})
              {party.verificationLevel === 'NONE' ? ' - Not KYC' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Amount */}
      <div>
        <label style={styles.label}>Amount</label>
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min="0"
            max={balance}
            style={styles.input}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setAmount(balance)}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              padding: '2px 8px',
              fontSize: '11px',
              borderRadius: theme.borderRadius.sm,
              border: 'none',
              backgroundColor: theme.colors.primary,
              color: '#000',
              cursor: 'pointer',
              fontWeight: 500,
            }}
            disabled={isLoading}
          >
            MAX
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: theme.spacing.sm,
            borderRadius: theme.borderRadius.md,
            backgroundColor: `${theme.colors.error}20`,
            color: theme.colors.error,
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Success */}
      {success && (
        <div
          style={{
            padding: theme.spacing.sm,
            borderRadius: theme.borderRadius.md,
            backgroundColor: `${theme.colors.success}20`,
            color: theme.colors.success,
            fontSize: '13px',
          }}
        >
          Transfer completed successfully!
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        style={{
          ...styles.button,
          width: '100%',
          opacity: isLoading ? 0.7 : 1,
        }}
        disabled={isLoading}
      >
        {isLoading ? 'Transferring...' : `Transfer ${symbol}`}
      </button>
    </form>
  );
}
