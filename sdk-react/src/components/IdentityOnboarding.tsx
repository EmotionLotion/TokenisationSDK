/**
 * IdentityOnboarding Component - Multi-Step Identity Wizard
 *
 * Guides users through the full onboarding flow:
 * Connect Wallet → KYC → ONCHAINID → Claim Topics → Complete.
 *
 * @example
 * ```tsx
 * import { IdentityOnboarding } from '@tokenisation/sdk-react/components';
 *
 * function Onboarding() {
 *   return (
 *     <IdentityOnboarding
 *       requiredLevel="standard"
 *       claimTopics={['COUNTRY', 'ACCREDITATION']}
 *       onComplete={(result) => console.log('Onboarded:', result)}
 *     />
 *   );
 * }
 * ```
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';
import { useWallet } from '../hooks/useWallet.js';
import { useKYC } from '../hooks/useKYC.js';
import type { KYCLevel } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type OnboardingStep = 'wallet' | 'kyc' | 'identity' | 'claims' | 'complete';

export interface OnboardingResult {
  walletAddress: string;
  kycLevel: KYCLevel;
  identityId: string | null;
  claimsAdded: string[];
  completedAt: string;
}

export interface StepRenderProps {
  step: OnboardingStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
  error: Error | null;
}

export interface IdentityOnboardingProps {
  /** Required KYC level. Default: 'standard' */
  requiredLevel?: KYCLevel;
  /** Claim topics to register on identity. Default: [] */
  claimTopics?: string[];
  /** Called when all steps complete */
  onComplete?: (result: OnboardingResult) => void;
  /** Called when step changes */
  onStepChange?: (step: OnboardingStep) => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Custom step renderer */
  renderStep?: (props: StepRenderProps) => React.ReactNode;
}

// ============================================================================
// STEP ORDER
// ============================================================================

const STEPS: OnboardingStep[] = ['wallet', 'kyc', 'identity', 'claims', 'complete'];

const STEP_LABELS: Record<OnboardingStep, string> = {
  wallet: 'Connect Wallet',
  kyc: 'KYC Verification',
  identity: 'On-Chain Identity',
  claims: 'Claim Topics',
  complete: 'Complete',
};

// ============================================================================
// DEFAULT STYLES
// ============================================================================

const defaultStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    borderRadius: '12px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    maxWidth: '540px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 20px 0',
  },
  progressBar: {
    display: 'flex',
    gap: '4px',
    marginBottom: '24px',
  },
  progressSegment: {
    height: '4px',
    flex: 1,
    borderRadius: '2px',
    transition: 'background-color 0.3s',
  },
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  stepNumber: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
  },
  stepLabel: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#111827',
  },
  description: {
    fontSize: '14px',
    color: '#6b7280',
    lineHeight: 1.5,
    marginBottom: '16px',
  },
  button: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: '#3b82f6',
    color: 'white',
    transition: 'background-color 0.2s',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  buttonSecondary: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
    backgroundColor: 'white',
    color: '#374151',
    transition: 'background-color 0.2s',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px',
  },
  successContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#ecfdf5',
    borderRadius: '8px',
    border: '1px solid #a7f3d0',
  },
  errorContainer: {
    padding: '12px',
    backgroundColor: '#fef2f2',
    borderRadius: '8px',
    border: '1px solid #fecaca',
    fontSize: '13px',
    color: '#991b1b',
    marginBottom: '12px',
  },
  claimItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    fontSize: '13px',
    color: '#374151',
    marginBottom: '6px',
  },
  checkIcon: {
    color: '#10b981',
    fontWeight: 700,
  },
  spinnerIcon: {
    color: '#6b7280',
  },
  infoBox: {
    padding: '12px',
    backgroundColor: '#eff6ff',
    borderRadius: '8px',
    border: '1px solid #bfdbfe',
    fontSize: '13px',
    color: '#1e40af',
    marginBottom: '16px',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function IdentityOnboarding({
  requiredLevel = 'standard',
  claimTopics = [],
  onComplete,
  onStepChange,
  onError,
  className,
  style,
  renderStep,
}: IdentityOnboardingProps) {
  const { config, wallet: ctxWallet } = useTokenisation();
  const {
    address,
    isConnected,
    connect,
    loading: walletLoading,
  } = useWallet();
  const {
    initiateKYC,
    status: kycStatus,
    level: kycLevel,
    loading: kycLoading,
  } = useKYC();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>('wallet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [claimsAdded, setClaimsAdded] = useState<string[]>([]);
  const [claimProgress, setClaimProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({});

  const completeFiredRef = useRef(false);

  // Helper for API calls
  const apiCall = useCallback(
    async <T,>(endpoint: string, opts?: RequestInit): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(config.orgId ? { 'X-Org-Id': config.orgId } : {}),
        ...(ctxWallet?.address ? { 'X-Wallet-Address': ctxWallet.address } : {}),
      };

      const response = await fetch(`${config.apiUrl}${endpoint}`, {
        ...opts,
        headers: { ...headers, ...opts?.headers },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      return response.json();
    },
    [config, ctxWallet]
  );

  const stepIndex = STEPS.indexOf(currentStep);

  // Auto-advance wallet step when connected
  useEffect(() => {
    if (currentStep === 'wallet' && isConnected && address) {
      setCurrentStep('kyc');
    }
  }, [currentStep, isConnected, address]);

  // Auto-advance KYC step when approved
  useEffect(() => {
    if (currentStep === 'kyc' && kycStatus === 'approved') {
      setCurrentStep('identity');
    }
  }, [currentStep, kycStatus]);

  // Notify step changes
  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);

  // Step handlers
  const handleConnectWallet = useCallback(async () => {
    setError(null);
    try {
      await connect();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
    }
  }, [connect, onError]);

  const handleStartKYC = useCallback(async () => {
    setError(null);
    try {
      const result = await initiateKYC(requiredLevel);
      if (!result.success) {
        throw new Error(result.error || 'Failed to initiate KYC');
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
    }
  }, [initiateKYC, requiredLevel, onError]);

  const handleCreateIdentity = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await apiCall<{ identityId: string }>(
        '/api/v1/identity/create',
        {
          method: 'POST',
          body: JSON.stringify({
            walletAddress: address,
          }),
        }
      );
      setIdentityId(result.identityId);
      setCurrentStep('claims');
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
    } finally {
      setLoading(false);
    }
  }, [address, apiCall, onError]);

  const handleAddClaims = useCallback(async () => {
    if (claimTopics.length === 0) {
      setCurrentStep('complete');
      return;
    }

    setError(null);
    setLoading(true);

    const progress: Record<string, 'pending' | 'done' | 'error'> = {};
    claimTopics.forEach(t => { progress[t] = 'pending'; });
    setClaimProgress(progress);

    const added: string[] = [];

    for (const topic of claimTopics) {
      try {
        await apiCall<{ success: boolean }>(
          '/api/v1/identity/claims/add',
          {
            method: 'POST',
            body: JSON.stringify({
              identityId,
              topic,
            }),
          }
        );
        added.push(topic);
        setClaimProgress(prev => ({ ...prev, [topic]: 'done' }));
      } catch (err) {
        setClaimProgress(prev => ({ ...prev, [topic]: 'error' }));
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        onError?.(e);
      }
    }

    setClaimsAdded(added);
    setLoading(false);
    setCurrentStep('complete');
  }, [claimTopics, identityId, apiCall, onError]);

  // Fire completion callback
  useEffect(() => {
    if (currentStep === 'complete' && !completeFiredRef.current && address) {
      completeFiredRef.current = true;
      onComplete?.({
        walletAddress: address,
        kycLevel: kycLevel as KYCLevel,
        identityId,
        claimsAdded,
        completedAt: new Date().toISOString(),
      });
    }
  }, [currentStep, address, kycLevel, identityId, claimsAdded, onComplete]);

  // Navigation helpers
  const goBack = useCallback(() => {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(STEPS[idx - 1]);
      setError(null);
    }
  }, [currentStep]);

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) {
      setCurrentStep(STEPS[idx + 1]);
      setError(null);
    }
  }, [currentStep]);

  // Custom renderer path
  if (renderStep) {
    return (
      <div className={className} style={style}>
        {renderStep({
          step: currentStep,
          stepIndex,
          totalSteps: STEPS.length,
          onNext: goNext,
          onBack: goBack,
          loading: loading || walletLoading || kycLoading,
          error,
        })}
      </div>
    );
  }

  // ---- Render steps ----
  const renderContent = () => {
    switch (currentStep) {
      case 'wallet':
        return (
          <>
            <p style={defaultStyles.description}>
              Connect your wallet to begin the identity onboarding process.
              This wallet will be linked to your verified on-chain identity.
            </p>
            {isConnected && address ? (
              <div style={defaultStyles.successContainer}>
                <span style={{ fontSize: '20px' }}>&#10004;</span>
                <div>
                  <strong style={{ color: '#065f46' }}>Wallet Connected</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#065f46', fontFamily: 'monospace' }}>
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </p>
                </div>
              </div>
            ) : (
              <button
                onClick={handleConnectWallet}
                disabled={walletLoading}
                style={{
                  ...defaultStyles.button,
                  ...(walletLoading ? defaultStyles.buttonDisabled : {}),
                }}
              >
                {walletLoading ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </>
        );

      case 'kyc':
        return (
          <>
            <p style={defaultStyles.description}>
              Complete identity verification ({requiredLevel} level) to comply with regulatory requirements.
            </p>
            {kycStatus === 'approved' ? (
              <div style={defaultStyles.successContainer}>
                <span style={{ fontSize: '20px' }}>&#10004;</span>
                <div>
                  <strong style={{ color: '#065f46' }}>KYC Approved</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#065f46' }}>
                    Level: {kycLevel}
                  </p>
                </div>
              </div>
            ) : kycStatus === 'pending' || kycStatus === 'in_review' ? (
              <div style={defaultStyles.infoBox}>
                KYC verification is {kycStatus === 'pending' ? 'in progress' : 'under review'}.
                This step will auto-advance once approved.
              </div>
            ) : (
              <button
                onClick={handleStartKYC}
                disabled={kycLoading}
                style={{
                  ...defaultStyles.button,
                  ...(kycLoading ? defaultStyles.buttonDisabled : {}),
                }}
              >
                {kycLoading ? 'Starting...' : 'Start KYC Verification'}
              </button>
            )}
          </>
        );

      case 'identity':
        return (
          <>
            <p style={defaultStyles.description}>
              Deploy your on-chain identity (ONCHAINID). This creates a smart contract
              that represents your verified identity on the blockchain.
            </p>
            {identityId ? (
              <div style={defaultStyles.successContainer}>
                <span style={{ fontSize: '20px' }}>&#10004;</span>
                <div>
                  <strong style={{ color: '#065f46' }}>Identity Created</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#065f46', fontFamily: 'monospace' }}>
                    {identityId}
                  </p>
                </div>
              </div>
            ) : (
              <button
                onClick={handleCreateIdentity}
                disabled={loading}
                style={{
                  ...defaultStyles.button,
                  ...(loading ? defaultStyles.buttonDisabled : {}),
                }}
              >
                {loading ? 'Deploying Identity...' : 'Create On-Chain Identity'}
              </button>
            )}
          </>
        );

      case 'claims':
        return (
          <>
            <p style={defaultStyles.description}>
              Register claim topics on your on-chain identity. These claims enable
              compliant transfers across regulated markets.
            </p>
            {claimTopics.length === 0 ? (
              <div style={defaultStyles.infoBox}>
                No claim topics required. Proceeding to completion.
              </div>
            ) : (
              <div>
                {claimTopics.map(topic => {
                  const s = claimProgress[topic];
                  return (
                    <div key={topic} style={defaultStyles.claimItem}>
                      {s === 'done' ? (
                        <span style={defaultStyles.checkIcon}>&#10004;</span>
                      ) : s === 'error' ? (
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>&#10006;</span>
                      ) : s === 'pending' ? (
                        <span style={defaultStyles.spinnerIcon}>&#9203;</span>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>&#9675;</span>
                      )}
                      {topic}
                    </div>
                  );
                })}
                {!loading && claimsAdded.length === 0 && (
                  <button
                    onClick={handleAddClaims}
                    disabled={loading}
                    style={{
                      ...defaultStyles.button,
                      marginTop: '12px',
                      ...(loading ? defaultStyles.buttonDisabled : {}),
                    }}
                  >
                    Add Claim Topics
                  </button>
                )}
              </div>
            )}
          </>
        );

      case 'complete':
        return (
          <div style={defaultStyles.successContainer}>
            <span style={{ fontSize: '28px' }}>&#127881;</span>
            <div>
              <strong style={{ color: '#065f46', fontSize: '16px' }}>Onboarding Complete</strong>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#065f46' }}>
                Your wallet is connected, identity is verified, and on-chain identity has been deployed.
                You're ready to participate in tokenized markets.
              </p>
              {identityId && (
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>
                  Identity: {identityId}
                </p>
              )}
              {claimsAdded.length > 0 && (
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>
                  Claims: {claimsAdded.join(', ')}
                </p>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className={className} style={{ ...defaultStyles.container, ...style }}>
      <h2 style={defaultStyles.title}>Identity Onboarding</h2>

      {/* Progress bar */}
      <div style={defaultStyles.progressBar}>
        {STEPS.map((step, i) => (
          <div
            key={step}
            style={{
              ...defaultStyles.progressSegment,
              backgroundColor: i <= stepIndex ? '#3b82f6' : '#e5e7eb',
            }}
          />
        ))}
      </div>

      {/* Step indicator */}
      <div style={defaultStyles.stepIndicator}>
        <span
          style={{
            ...defaultStyles.stepNumber,
            backgroundColor: currentStep === 'complete' ? '#10b981' : '#3b82f6',
            color: 'white',
          }}
        >
          {currentStep === 'complete' ? '\u2713' : stepIndex + 1}
        </span>
        <span style={defaultStyles.stepLabel}>
          {STEP_LABELS[currentStep]}
        </span>
      </div>

      {/* Error display */}
      {error && (
        <div style={defaultStyles.errorContainer}>
          {error.message}
        </div>
      )}

      {/* Step content */}
      {renderContent()}

      {/* Navigation */}
      {currentStep !== 'wallet' && currentStep !== 'complete' && (
        <div style={defaultStyles.buttonRow}>
          <button
            onClick={goBack}
            style={defaultStyles.buttonSecondary}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
