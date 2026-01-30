/**
 * ComplianceGuard - Compliance-aware wrapper component and HOC
 *
 * Wraps sensitive actions (e.g. "Buy Token", "Transfer") and automatically
 * disables them if the backend returns a non-compliant status for the current user.
 *
 * @example
 * ```tsx
 * // Wrapper pattern
 * <ComplianceGuard action="token:transfer" context={{ assetId: 'asset-123' }}>
 *   <button onClick={handleTransfer}>Transfer</button>
 * </ComplianceGuard>
 *
 * // Render prop pattern
 * <ComplianceGuard action="token:transfer">
 *   {(status) => (
 *     <button disabled={!status.isCompliant}>
 *       {status.loading ? 'Checking...' : 'Transfer'}
 *     </button>
 *   )}
 * </ComplianceGuard>
 *
 * // HOC pattern
 * const GuardedButton = withComplianceGuard(TransferButton, 'token:transfer');
 * ```
 */

import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type ComponentType,
} from 'react';

import { useCompliance } from '../hooks/useCompliance.js';
import type { ComplianceAction, PolicyDecision } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Compliance status exposed via render prop and used internally.
 */
export interface ComplianceStatus {
  /** Whether the action is fully allowed */
  isCompliant: boolean;
  /** Whether the action is conditionally allowed (with warnings) */
  isConditional: boolean;
  /** The full policy decision, or null while loading / on error */
  decision: PolicyDecision | null;
  /** Whether the compliance check is in progress */
  loading: boolean;
}

/**
 * Props for the ComplianceGuard wrapper component.
 */
export interface ComplianceGuardProps {
  /** The compliance action to evaluate */
  action: ComplianceAction;
  /** Additional context passed to the compliance check */
  context?: Record<string, unknown>;
  /** Fallback UI rendered when the action is denied */
  fallback?: ReactNode;
  /**
   * Children to render.
   * Can be a ReactNode (rendered when compliant) or a render function
   * that receives the current ComplianceStatus.
   */
  children: ReactNode | ((status: ComplianceStatus) => ReactNode);
  /** Callback invoked when the action is blocked (DENY) */
  onBlock?: (decision: PolicyDecision) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ComplianceGuard wraps children and gates them behind a compliance check.
 *
 * - ALLOW: renders children normally.
 * - DENY: renders `fallback` if provided, otherwise a default disabled overlay
 *   listing violation messages.
 * - CONDITIONAL: renders children with a warning badge overlay.
 */
export function ComplianceGuard({
  action,
  context,
  fallback,
  children,
  onBlock,
}: ComplianceGuardProps) {
  const { checkAction, loading: hookLoading } = useCompliance();

  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkError, setCheckError] = useState<Error | null>(null);

  // Track whether onBlock has been called for the current decision to avoid
  // firing it repeatedly on re-renders.
  const blockedRef = useRef(false);

  // Serialise context so we can use it as an effect dependency without
  // causing infinite loops on object identity changes.
  const contextKey = context ? JSON.stringify(context) : '';

  useEffect(() => {
    let cancelled = false;
    blockedRef.current = false;

    async function evaluate() {
      setLoading(true);
      setCheckError(null);

      try {
        const result = await checkAction(action, context ?? {});
        if (!cancelled) {
          setDecision(result.decision);
        }
      } catch (err) {
        if (!cancelled) {
          setCheckError(err instanceof Error ? err : new Error(String(err)));
          setDecision(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    evaluate();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, contextKey]);

  // Fire onBlock when a DENY decision is received.
  useEffect(() => {
    if (decision && decision.result === 'DENY' && !blockedRef.current) {
      blockedRef.current = true;
      onBlock?.(decision);
    }
  }, [decision, onBlock]);

  // Build the status object that is exposed via render props.
  const status: ComplianceStatus = {
    isCompliant: decision?.result === 'ALLOW',
    isConditional: decision?.result === 'CONDITIONAL',
    decision,
    loading: loading || hookLoading,
  };

  // --- Render prop pattern ---
  if (typeof children === 'function') {
    return <>{children(status)}</>;
  }

  // --- Loading state ---
  if (loading) {
    return (
      <span
        style={{ display: 'inline-block', opacity: 0.5, pointerEvents: 'none' }}
        aria-busy="true"
      >
        {children}
      </span>
    );
  }

  // --- Error state (treat as deny to be safe) ---
  if (checkError) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div
        role="alert"
        style={{
          position: 'relative',
          opacity: 0.5,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {children}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            fontSize: '12px',
            color: '#b91c1c',
            padding: '4px 8px',
            textAlign: 'center',
          }}
        >
          Compliance check failed
        </div>
      </div>
    );
  }

  // --- DENY ---
  if (decision?.result === 'DENY') {
    if (fallback) {
      return <>{fallback}</>;
    }

    const violations = decision.violations ?? [];

    return (
      <div
        role="alert"
        style={{
          position: 'relative',
          opacity: 0.5,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {children}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            padding: '8px',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#b91c1c',
              marginBottom: violations.length > 0 ? '4px' : undefined,
            }}
          >
            Action not permitted
          </span>
          {violations.length > 0 && (
            <ul
              style={{
                margin: 0,
                padding: '0 0 0 16px',
                fontSize: '11px',
                color: '#7f1d1d',
                textAlign: 'left',
              }}
            >
              {violations.map((v, i) => (
                <li key={`${v.code}-${i}`}>{v.message}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // --- CONDITIONAL ---
  if (decision?.result === 'CONDITIONAL') {
    const warnings = decision.warnings ?? [];

    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {children}
        {warnings.length > 0 && (
          <div
            role="status"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              transform: 'translate(50%, -50%)',
              backgroundColor: '#f59e0b',
              color: '#fff',
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
            title={warnings.map((w) => w.message).join('; ')}
          >
            !
          </div>
        )}
      </div>
    );
  }

  // --- ALLOW (or unknown result treated as allow) ---
  return <>{children}</>;
}

// ============================================================================
// HOC
// ============================================================================

/**
 * Higher-Order Component that wraps a component with ComplianceGuard.
 *
 * @example
 * ```tsx
 * const SafeTransferButton = withComplianceGuard(TransferButton, 'token:transfer', {
 *   fallbackMessage: 'Transfers are currently restricted for your account.',
 * });
 * ```
 */
export function withComplianceGuard<P extends Record<string, unknown>>(
  WrappedComponent: ComponentType<P>,
  action: ComplianceAction,
  options?: { fallbackMessage?: string },
): ComponentType<P> {
  const displayName =
    WrappedComponent.displayName || WrappedComponent.name || 'Component';

  function WithComplianceGuard(props: P) {
    const fallbackNode = options?.fallbackMessage ? (
      <div
        role="alert"
        style={{
          padding: '8px 12px',
          fontSize: '13px',
          color: '#b91c1c',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '4px',
        }}
      >
        {options.fallbackMessage}
      </div>
    ) : undefined;

    return (
      <ComplianceGuard action={action} fallback={fallbackNode}>
        <WrappedComponent {...props} />
      </ComplianceGuard>
    );
  }

  WithComplianceGuard.displayName = `withComplianceGuard(${displayName})`;

  return WithComplianceGuard;
}
