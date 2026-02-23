/**
 * Tokenize Button Component
 *
 * One-click button to open tokenization wizard.
 * Similar to Stripe's "Pay" button.
 *
 * @example
 * ```tsx
 * <TokenizeButton
 *   sdk={sdk}
 *   issuerId={issuer.id}
 *   onSuccess={(asset) => console.log('Created:', asset)}
 * />
 * ```
 */

import React, { useState } from 'react';
import { type TokenisationSDK } from '../SDK.js';
import { type Asset } from '../models/Asset.js';
import { AssetWizard } from './AssetWizard.js';
import { defaultTheme, type TokenisationTheme } from './theme.js';

export interface TokenizeButtonProps {
  sdk: TokenisationSDK;
  issuerId: string;
  onSuccess?: (asset: Asset) => void;
  onError?: (error: Error) => void;
  buttonText?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  theme?: TokenisationTheme;
}

const sizeStyles = {
  sm: { padding: '6px 12px', fontSize: '12px' },
  md: { padding: '10px 20px', fontSize: '14px' },
  lg: { padding: '14px 28px', fontSize: '16px' },
};

export function TokenizeButton({
  sdk,
  issuerId,
  onSuccess,
  onError,
  buttonText = 'Tokenize Asset',
  variant = 'primary',
  size = 'md',
  disabled = false,
  theme = defaultTheme,
}: TokenizeButtonProps) {
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const styles = sizeStyles[size];

  const getButtonStyles = () => {
    const base = {
      padding: styles.padding,
      fontSize: styles.fontSize,
      fontWeight: 600,
      fontFamily: theme.fonts.family,
      borderRadius: theme.borderRadius.md,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.2s',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
    };

    switch (variant) {
      case 'primary':
        return {
          ...base,
          backgroundColor: theme.colors.primary,
          color: '#000000',
          border: 'none',
        };
      case 'secondary':
        return {
          ...base,
          backgroundColor: theme.colors.secondary,
          color: '#FFFFFF',
          border: 'none',
        };
      case 'outline':
        return {
          ...base,
          backgroundColor: 'transparent',
          color: theme.colors.primary,
          border: `2px solid ${theme.colors.primary}`,
        };
      default:
        return base;
    }
  };

  const handleSuccess = (asset: Asset) => {
    setIsWizardOpen(false);
    onSuccess?.(asset);
  };

  const handleError = (error: Error) => {
    onError?.(error);
  };

  return (
    <>
      <button
        onClick={() => setIsWizardOpen(true)}
        disabled={disabled}
        style={getButtonStyles() as React.CSSProperties}
      >
        <span style={{ fontSize: '16px' }}>✨</span>
        {buttonText}
      </button>

      {isWizardOpen && (
        <AssetWizard
          sdk={sdk}
          issuerId={issuerId}
          onSuccess={handleSuccess}
          onError={handleError}
          onClose={() => setIsWizardOpen(false)}
          theme={theme}
        />
      )}
    </>
  );
}
