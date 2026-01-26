/**
 * KYCFlow Component - KYC Verification Flow
 *
 * A component for handling KYC verification with status display.
 *
 * @example
 * ```tsx
 * import { KYCFlow } from '@tokenisation/sdk-react/components';
 *
 * function Onboarding() {
 *   return (
 *     <KYCFlow
 *       requiredLevel="standard"
 *       onComplete={(verification) => console.log('KYC complete:', verification)}
 *       onError={(error) => console.error('KYC error:', error)}
 *     />
 *   );
 * }
 * ```
 */

import { useCallback, useEffect } from 'react';
import { useKYC } from '../hooks/useKYC.js';
import type { KYCLevel, KYCStatus } from '../types/index.js';
import type { KYCVerification } from '../hooks/useKYC.js';

// ============================================================================
// TYPES
// ============================================================================

export interface KYCFlowProps {
  /** Required KYC level */
  requiredLevel?: KYCLevel;
  /** Auto-start verification if not started */
  autoStart?: boolean;
  /** Callback when KYC completes successfully */
  onComplete?: (verification: KYCVerification) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Callback on status change */
  onStatusChange?: (status: KYCStatus) => void;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Custom render for each status */
  renderStatus?: (props: {
    status: KYCStatus;
    level: KYCLevel;
    verification: KYCVerification | null;
    initiateKYC: () => void;
    loading: boolean;
  }) => React.ReactNode;
  /** Custom labels */
  labels?: {
    notStarted?: string;
    pending?: string;
    inReview?: string;
    approved?: string;
    rejected?: string;
    expired?: string;
    startButton?: string;
    retryButton?: string;
  };
}

// ============================================================================
// DEFAULT STYLES
// ============================================================================

const defaultStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    borderRadius: '12px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  },
  description: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '16px',
    lineHeight: 1.5,
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
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#fef2f2',
    borderRadius: '8px',
    border: '1px solid #fecaca',
  },
  pendingContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#fffbeb',
    borderRadius: '8px',
    border: '1px solid #fde68a',
  },
  infoList: {
    margin: '16px 0 0 0',
    paddingLeft: '20px',
    fontSize: '14px',
    color: '#374151',
  },
};

// ============================================================================
// STATUS COLORS
// ============================================================================

const statusColors: Record<KYCStatus, { bg: string; text: string }> = {
  not_started: { bg: '#e5e7eb', text: '#374151' },
  pending: { bg: '#fef3c7', text: '#92400e' },
  in_review: { bg: '#dbeafe', text: '#1e40af' },
  approved: { bg: '#d1fae5', text: '#065f46' },
  rejected: { bg: '#fee2e2', text: '#991b1b' },
  expired: { bg: '#fef2f2', text: '#991b1b' },
};

// ============================================================================
// LEVEL DESCRIPTIONS
// ============================================================================

const levelDescriptions: Record<KYCLevel, string> = {
  none: 'No verification required',
  basic: 'Basic verification: Name, email, and phone number',
  standard: 'Standard verification: Government ID and proof of address',
  enhanced: 'Enhanced verification: Source of funds and additional documentation',
  institutional: 'Institutional verification: Full corporate documentation',
};

// ============================================================================
// COMPONENT
// ============================================================================

export function KYCFlow({
  requiredLevel = 'standard',
  autoStart = false,
  onComplete,
  onError,
  onStatusChange,
  className,
  style,
  renderStatus,
  labels = {},
}: KYCFlowProps) {
  const {
    initiateKYC,
    status,
    level,
    verification,
    meetsLevel: _meetsLevel,
    loading,
    error,
    refresh,
  } = useKYC();

  // Default labels
  const {
    notStarted: _notStarted = 'Identity Verification Required',
    pending = 'Verification In Progress',
    inReview = 'Under Review',
    approved = 'Verification Complete',
    rejected = 'Verification Failed',
    expired = 'Verification Expired',
    startButton = 'Start Verification',
    retryButton = 'Retry Verification',
  } = labels;

  // Handle status change
  useEffect(() => {
    onStatusChange?.(status);

    if (status === 'approved' && verification) {
      onComplete?.(verification);
    }
  }, [status, verification, onStatusChange, onComplete]);

  // Handle errors
  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  // Auto-start if configured
  useEffect(() => {
    if (autoStart && status === 'not_started' && !loading) {
      handleInitiate();
    }
  }, [autoStart, status, loading]);

  // Poll for updates when pending
  useEffect(() => {
    if (status === 'pending' || status === 'in_review') {
      const interval = setInterval(refresh, 10000); // Poll every 10s
      return () => clearInterval(interval);
    }
  }, [status, refresh]);

  // Initiate KYC
  const handleInitiate = useCallback(async () => {
    try {
      const result = await initiateKYC(requiredLevel);
      if (!result.success) {
        onError?.(new Error(result.error || 'Failed to initiate KYC'));
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error);
    }
  }, [initiateKYC, requiredLevel, onError]);

  // Custom render
  if (renderStatus) {
    return (
      <div className={className} style={style}>
        {renderStatus({
          status,
          level,
          verification,
          initiateKYC: handleInitiate,
          loading,
        })}
      </div>
    );
  }

  // Status-specific rendering
  const renderContent = () => {
    switch (status) {
      case 'not_started':
        return (
          <>
            <p style={defaultStyles.description}>
              {levelDescriptions[requiredLevel]}
            </p>
            <ul style={defaultStyles.infoList}>
              {requiredLevel !== 'none' && (
                <>
                  {['basic', 'standard', 'enhanced', 'institutional'].includes(requiredLevel) && (
                    <li>Government-issued photo ID</li>
                  )}
                  {['standard', 'enhanced', 'institutional'].includes(requiredLevel) && (
                    <li>Proof of address (utility bill or bank statement)</li>
                  )}
                  {['enhanced', 'institutional'].includes(requiredLevel) && (
                    <li>Source of funds documentation</li>
                  )}
                  {requiredLevel === 'institutional' && (
                    <li>Corporate documents and beneficial ownership</li>
                  )}
                </>
              )}
            </ul>
            <button
              onClick={handleInitiate}
              disabled={loading}
              style={{
                ...defaultStyles.button,
                ...(loading ? defaultStyles.buttonDisabled : {}),
                marginTop: '16px',
              }}
            >
              {loading ? 'Starting...' : startButton}
            </button>
          </>
        );

      case 'pending':
        return (
          <div style={defaultStyles.pendingContainer}>
            <span style={{ fontSize: '24px' }}>&#9203;</span>
            <div>
              <strong>{pending}</strong>
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#92400e' }}>
                Please complete the verification in the popup window.
              </p>
            </div>
          </div>
        );

      case 'in_review':
        return (
          <div style={defaultStyles.pendingContainer}>
            <span style={{ fontSize: '24px' }}>&#128269;</span>
            <div>
              <strong>{inReview}</strong>
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#1e40af' }}>
                Your documents are being reviewed. This typically takes 1-2 business days.
              </p>
            </div>
          </div>
        );

      case 'approved':
        return (
          <div style={defaultStyles.successContainer}>
            <span style={{ fontSize: '24px' }}>&#10004;</span>
            <div>
              <strong>{approved}</strong>
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#065f46' }}>
                Your identity has been verified. You can now proceed with tokenization.
              </p>
              {verification?.expiresAt && (
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>
                  Valid until: {new Date(verification.expiresAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        );

      case 'rejected':
        return (
          <div style={defaultStyles.errorContainer}>
            <span style={{ fontSize: '24px' }}>&#10006;</span>
            <div>
              <strong>{rejected}</strong>
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#991b1b' }}>
                {verification?.rejectionReason || 'Your verification could not be completed.'}
              </p>
              <button
                onClick={handleInitiate}
                disabled={loading}
                style={{
                  ...defaultStyles.button,
                  ...(loading ? defaultStyles.buttonDisabled : {}),
                  marginTop: '12px',
                  backgroundColor: '#dc2626',
                }}
              >
                {loading ? 'Starting...' : retryButton}
              </button>
            </div>
          </div>
        );

      case 'expired':
        return (
          <div style={defaultStyles.errorContainer}>
            <span style={{ fontSize: '24px' }}>&#9888;</span>
            <div>
              <strong>{expired}</strong>
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#991b1b' }}>
                Your verification has expired. Please complete verification again.
              </p>
              <button
                onClick={handleInitiate}
                disabled={loading}
                style={{
                  ...defaultStyles.button,
                  ...(loading ? defaultStyles.buttonDisabled : {}),
                  marginTop: '12px',
                }}
              >
                {loading ? 'Starting...' : retryButton}
              </button>
            </div>
          </div>
        );
    }
  };

  const statusColor = statusColors[status];

  return (
    <div className={className} style={{ ...defaultStyles.container, ...style }}>
      <div style={defaultStyles.header}>
        <h3 style={defaultStyles.title}>Identity Verification</h3>
        <span
          style={{
            ...defaultStyles.statusBadge,
            backgroundColor: statusColor.bg,
            color: statusColor.text,
          }}
        >
          {status.replace('_', ' ')}
        </span>
      </div>
      {renderContent()}
    </div>
  );
}
