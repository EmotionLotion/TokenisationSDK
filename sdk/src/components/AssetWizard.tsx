/**
 * Asset Wizard Component
 *
 * Multi-step wizard for creating tokenized assets.
 * Similar to Stripe Checkout flow.
 *
 * @example
 * ```tsx
 * <AssetWizard
 *   sdk={sdk}
 *   issuerId={issuer.id}
 *   onSuccess={(asset) => console.log('Created:', asset)}
 *   onClose={() => setShowWizard(false)}
 * />
 * ```
 */

import React, { useState } from 'react';
import { type TokenisationSDK } from '../SDK.js';
import { type Asset, type CreateAssetParams } from '../models/Asset.js';
import { RightType, TransferabilityMode, LifecycleState } from '../core/types.js';
import { defaultTheme, createStyles, type TokenisationTheme } from './theme.js';

export interface AssetWizardProps {
  sdk: TokenisationSDK;
  issuerId: string;
  onSuccess?: (asset: Asset) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  defaultRightType?: RightType;
  theme?: TokenisationTheme;
}

type WizardStep = 'type' | 'details' | 'jurisdiction' | 'rules' | 'review';

const rightTypeOptions = [
  {
    value: RightType.OWNERSHIP,
    label: 'Ownership',
    icon: '🏠',
    description: 'Real estate, IP, collectibles, physical assets',
  },
  {
    value: RightType.ACCESS,
    label: 'Access',
    icon: '🎫',
    description: 'Tickets, memberships, subscriptions, credentials',
  },
  {
    value: RightType.BEHAVIOR,
    label: 'Behavior',
    icon: '⭐',
    description: 'Loyalty points, reputation scores, ratings',
  },
  {
    value: RightType.VERIFICATION,
    label: 'Verification',
    icon: '✅',
    description: 'Carbon credits, certificates, degrees',
  },
];

const transferModeOptions = [
  {
    value: TransferabilityMode.UNRESTRICTED,
    label: 'Unrestricted',
    description: 'Anyone can receive tokens',
  },
  {
    value: TransferabilityMode.COMPLIANCE_GATED,
    label: 'Compliance Gated',
    description: 'Requires KYC verification',
  },
  {
    value: TransferabilityMode.WHITELIST_ONLY,
    label: 'Whitelist Only',
    description: 'Pre-approved addresses only',
  },
  {
    value: TransferabilityMode.NON_TRANSFERABLE,
    label: 'Non-Transferable',
    description: 'Cannot be transferred (soulbound)',
  },
];

const jurisdictionOptions = [
  { code: 'AE', name: 'UAE', framework: 'UAE_VARA' },
  { code: 'US', name: 'United States', framework: 'US_SEC' },
  { code: 'GB', name: 'United Kingdom', framework: 'UK_FCA' },
  { code: 'SG', name: 'Singapore', framework: 'SG_MAS' },
  { code: 'CH', name: 'Switzerland', framework: 'CH_FINMA' },
  { code: 'DE', name: 'Germany', framework: 'EU_MIFID' },
];

export function AssetWizard({
  sdk,
  issuerId,
  onSuccess,
  onError,
  onClose,
  defaultRightType,
  theme = defaultTheme,
}: AssetWizardProps) {
  const [step, setStep] = useState<WizardStep>('type');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [rightType, setRightType] = useState<RightType>(defaultRightType || RightType.OWNERSHIP);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [jurisdiction, setJurisdiction] = useState('AE');
  const [transferMode, setTransferMode] = useState<TransferabilityMode>(
    TransferabilityMode.COMPLIANCE_GATED
  );
  const [requireKyc, setRequireKyc] = useState(true);
  const [maxHolders, setMaxHolders] = useState('');

  const styles = createStyles(theme);

  const steps: { key: WizardStep; label: string }[] = [
    { key: 'type', label: 'Type' },
    { key: 'details', label: 'Details' },
    { key: 'jurisdiction', label: 'Jurisdiction' },
    { key: 'rules', label: 'Rules' },
    { key: 'review', label: 'Review' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex].key);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex].key);
    }
  };

  const handleCreate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const jurisdictionData = jurisdictionOptions.find((j) => j.code === jurisdiction);

      const params: CreateAssetParams = {
        name,
        description,
        rightType,
        issuerId,
        jurisdiction: {
          countryCode: jurisdiction,
          regulatoryFramework: jurisdictionData?.framework,
          accreditedOnly: false,
          blockedJurisdictions: [],
        },
        transferabilityRules: {
          mode: transferMode,
          lockupPeriodSeconds: 0,
          requireKyc,
          maxHolders: maxHolders ? parseInt(maxHolders) : undefined,
        },
        validityPeriod: {
          isPerpetual: true,
          startTime: new Date().toISOString(),
        },
      };

      const asset = await sdk.assets.create(params);

      // Auto-advance through lifecycle
      await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuerId);
      await sdk.assets.verify(asset.id, issuerId);
      await sdk.assets.activate(asset.id, issuerId);

      const finalAsset = await sdk.assets.get(asset.id);
      onSuccess?.(finalAsset!);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create asset');
      setError(error.message);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'type':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            <p style={{ margin: 0, color: theme.colors.textSecondary, fontSize: '14px' }}>
              What type of right are you tokenizing?
            </p>
            {rightTypeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setRightType(option.value);
                  handleNext();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  padding: theme.spacing.md,
                  borderRadius: theme.borderRadius.md,
                  border: `2px solid ${rightType === option.value ? theme.colors.primary : theme.colors.border}`,
                  backgroundColor: rightType === option.value ? `${theme.colors.primary}10` : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span style={{ fontSize: '24px' }}>{option.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, color: theme.colors.text, fontSize: '14px' }}>
                    {option.label}
                  </div>
                  <div style={{ color: theme.colors.textMuted, fontSize: '12px' }}>
                    {option.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        );

      case 'details':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            <div>
              <label style={styles.label}>Asset Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Dubai Marina Tower - Unit 1501"
                style={styles.input}
              />
            </div>
            <div>
              <label style={styles.label}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your asset..."
                rows={3}
                style={{ ...styles.input, resize: 'vertical' }}
              />
            </div>
          </div>
        );

      case 'jurisdiction':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            <p style={{ margin: 0, color: theme.colors.textSecondary, fontSize: '14px' }}>
              Where is this asset based?
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: theme.spacing.sm }}>
              {jurisdictionOptions.map((option) => (
                <button
                  key={option.code}
                  onClick={() => setJurisdiction(option.code)}
                  style={{
                    padding: theme.spacing.md,
                    borderRadius: theme.borderRadius.md,
                    border: `2px solid ${jurisdiction === option.code ? theme.colors.primary : theme.colors.border}`,
                    backgroundColor: jurisdiction === option.code ? `${theme.colors.primary}10` : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 600, color: theme.colors.text, fontSize: '14px' }}>
                    {option.name}
                  </div>
                  <div style={{ color: theme.colors.textMuted, fontSize: '11px' }}>
                    {option.framework}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 'rules':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            <div>
              <label style={styles.label}>Transfer Mode</label>
              <select
                value={transferMode}
                onChange={(e) => setTransferMode(e.target.value as TransferabilityMode)}
                style={styles.input}
              >
                {transferModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
              <input
                type="checkbox"
                id="requireKyc"
                checked={requireKyc}
                onChange={(e) => setRequireKyc(e.target.checked)}
              />
              <label htmlFor="requireKyc" style={{ color: theme.colors.text, fontSize: '14px' }}>
                Require KYC verification for transfers
              </label>
            </div>
            <div>
              <label style={styles.label}>Max Holders (optional)</label>
              <input
                type="number"
                value={maxHolders}
                onChange={(e) => setMaxHolders(e.target.value)}
                placeholder="Leave empty for unlimited"
                style={styles.input}
              />
            </div>
          </div>
        );

      case 'review':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            <div
              style={{
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                backgroundColor: theme.colors.background,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: theme.spacing.md }}>
                <div>
                  <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>Type</div>
                  <div style={{ color: theme.colors.text, fontWeight: 500 }}>
                    {rightTypeOptions.find((r) => r.value === rightType)?.label}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>Jurisdiction</div>
                  <div style={{ color: theme.colors.text, fontWeight: 500 }}>
                    {jurisdictionOptions.find((j) => j.code === jurisdiction)?.name}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>Name</div>
                  <div style={{ color: theme.colors.text, fontWeight: 500 }}>{name || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>Transfer Mode</div>
                  <div style={{ color: theme.colors.text, fontWeight: 500 }}>
                    {transferModeOptions.find((t) => t.value === transferMode)?.label}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>KYC Required</div>
                  <div style={{ color: theme.colors.text, fontWeight: 500 }}>
                    {requireKyc ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>
            </div>
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
          </div>
        );
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: theme.spacing.md,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        style={{
          ...styles.container,
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: theme.spacing.md,
          }}
        >
          <h2 style={{ margin: 0, color: theme.colors.text, fontSize: '18px' }}>
            Create Tokenized Asset
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.textMuted,
              cursor: 'pointer',
              fontSize: '20px',
              padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Progress */}
        <div
          style={{
            display: 'flex',
            gap: theme.spacing.xs,
            marginBottom: theme.spacing.lg,
          }}
        >
          {steps.map((s, i) => (
            <div
              key={s.key}
              style={{
                flex: 1,
                height: '4px',
                borderRadius: '2px',
                backgroundColor: i <= currentStepIndex ? theme.colors.primary : theme.colors.border,
                transition: 'background-color 0.2s',
              }}
            />
          ))}
        </div>

        {/* Step label */}
        <div
          style={{
            fontSize: '12px',
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.sm,
          }}
        >
          Step {currentStepIndex + 1} of {steps.length}: {steps[currentStepIndex].label}
        </div>

        {/* Content */}
        <div style={{ marginBottom: theme.spacing.lg }}>{renderStepContent()}</div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          {step !== 'type' && (
            <button onClick={handleBack} style={styles.buttonSecondary} disabled={isLoading}>
              Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step === 'review' ? (
            <button
              onClick={handleCreate}
              style={{ ...styles.button, opacity: isLoading ? 0.7 : 1 }}
              disabled={isLoading || !name}
            >
              {isLoading ? 'Creating...' : 'Create Asset'}
            </button>
          ) : (
            step !== 'type' && (
              <button
                onClick={handleNext}
                style={styles.button}
                disabled={step === 'details' && !name}
              >
                Continue
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
