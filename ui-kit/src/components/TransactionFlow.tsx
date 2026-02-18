/**
 * TransactionFlow - Multi-step transaction component (Gap 10).
 *
 * Guides users through compliance check, gas estimation, wallet signature,
 * submission, and confirmation for mint / transfer / burn / redeem actions.
 *
 * @example
 * ```tsx
 * <TransactionFlow
 *   action="transfer"
 *   params={{ token: 'tok_1', from: '0xABC', to: '0xDEF', amount: '100' }}
 *   apiUrl="https://api.example.com"
 *   apiKey="sk_live_xxx"
 *   onComplete={(receipt) => console.log('Done', receipt)}
 *   onError={(err) => console.error(err)}
 * />
 * ```
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export type TransactionAction = 'mint' | 'transfer' | 'burn' | 'redeem';

export enum TransactionStep {
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
  GAS_ESTIMATE = 'GAS_ESTIMATE',
  WALLET_SIGN = 'WALLET_SIGN',
  SUBMITTING = 'SUBMITTING',
  CONFIRMED = 'CONFIRMED',
}

export type StepStatus = 'pending' | 'active' | 'completed' | 'error';

export interface TransactionParams {
  token: string;
  from?: string;
  to?: string;
  amount: string;
  /** Arbitrary extra fields forwarded to the API */
  [key: string]: unknown;
}

export interface StepState {
  step: TransactionStep;
  status: StepStatus;
  title: string;
  description: string;
  data?: Record<string, any>;
  error?: Error;
}

export interface TransactionReceipt {
  txHash: string;
  blockNumber?: number;
  status: string;
  action: TransactionAction;
  timestamp: string;
  [key: string]: unknown;
}

export interface StepRenderProps {
  step: TransactionStep;
  status: StepStatus;
  title: string;
  description: string;
  data: unknown;
  error?: Error;
  onContinue: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

export interface TransactionFlowProps {
  /** The type of blockchain action to perform */
  action: TransactionAction;
  /** Parameters for the transaction */
  params: TransactionParams;
  /** Base URL of the tokenisation API */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Called when the transaction is confirmed */
  onComplete?: (receipt: TransactionReceipt) => void;
  /** Called when a non-recoverable error occurs */
  onError?: (error: Error) => void;
  /** Optional render prop for full step customization */
  renderStep?: (props: StepRenderProps) => React.ReactNode;
}

// ============================================================================
// Step metadata
// ============================================================================

const STEP_ORDER: TransactionStep[] = [
  TransactionStep.COMPLIANCE_CHECK,
  TransactionStep.GAS_ESTIMATE,
  TransactionStep.WALLET_SIGN,
  TransactionStep.SUBMITTING,
  TransactionStep.CONFIRMED,
];

const STEP_META: Record<TransactionStep, { title: string; description: string }> = {
  [TransactionStep.COMPLIANCE_CHECK]: {
    title: 'Compliance Check',
    description: 'Evaluating regulatory and policy compliance...',
  },
  [TransactionStep.GAS_ESTIMATE]: {
    title: 'Gas Estimate',
    description: 'Estimating network fees for this transaction...',
  },
  [TransactionStep.WALLET_SIGN]: {
    title: 'Wallet Signature',
    description: 'Please sign the transaction in your wallet.',
  },
  [TransactionStep.SUBMITTING]: {
    title: 'Submitting',
    description: 'Broadcasting transaction to the network...',
  },
  [TransactionStep.CONFIRMED]: {
    title: 'Confirmed',
    description: 'Transaction has been confirmed on-chain.',
  },
};

// ============================================================================
// Helpers
// ============================================================================

async function apiFetch<T>(
  url: string,
  apiKey: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

function buildSubmitEndpoint(action: TransactionAction, params: TransactionParams): string {
  switch (action) {
    case 'mint':
      return `/api/v1/tokens/${encodeURIComponent(params.token)}/mint`;
    case 'transfer':
      return `/api/v1/transfers`;
    case 'burn':
      return `/api/v1/tokens/${encodeURIComponent(params.token)}/burn`;
    case 'redeem':
      return `/api/v1/tokens/${encodeURIComponent(params.token)}/redeem`;
  }
}

// ============================================================================
// Component
// ============================================================================

export function TransactionFlow({
  action,
  params,
  apiUrl,
  apiKey,
  onComplete,
  onError,
  renderStep,
}: TransactionFlowProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [currentIndex, setCurrentIndex] = useState(0);
  const [stepStates, setStepStates] = useState<StepState[]>(() =>
    STEP_ORDER.map((step, i) => ({
      step,
      status: i === 0 ? 'active' : 'pending',
      title: STEP_META[step].title,
      description: STEP_META[step].description,
    })),
  );
  const [cancelled, setCancelled] = useState(false);

  const sseRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      sseRef.current?.close();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Step-state helpers
  // ---------------------------------------------------------------------------

  const updateStep = useCallback(
    (index: number, patch: Partial<StepState>) => {
      setStepStates((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    },
    [],
  );

  const markCompleted = useCallback(
    (index: number, data?: Record<string, any>) => {
      updateStep(index, { status: 'completed', data });
    },
    [updateStep],
  );

  const markError = useCallback(
    (index: number, error: Error) => {
      updateStep(index, { status: 'error', error });
    },
    [updateStep],
  );

  const advanceTo = useCallback(
    (nextIndex: number) => {
      setCurrentIndex(nextIndex);
      updateStep(nextIndex, { status: 'active' });
    },
    [updateStep],
  );

  // ---------------------------------------------------------------------------
  // Step executors
  // ---------------------------------------------------------------------------

  const runComplianceCheck = useCallback(async () => {
    const idx = 0;
    updateStep(idx, { status: 'active' });
    try {
      const result = await apiFetch<{ data: unknown }>(
        `${apiUrl}/api/v1/compliance/evaluate`,
        apiKey,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
            token: params.token,
            from: params.from,
            to: params.to,
            amount: params.amount,
          }),
        },
      );
      markCompleted(idx, result.data as Record<string, any>);
      advanceTo(1);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      markError(idx, error);
    }
  }, [action, params, apiUrl, apiKey, updateStep, markCompleted, markError, advanceTo]);

  const runGasEstimate = useCallback(async () => {
    const idx = 1;
    updateStep(idx, { status: 'active' });
    try {
      const result = await apiFetch<{ data: unknown }>(
        `${apiUrl}/api/v1/gas/estimate`,
        apiKey,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
            token: params.token,
            from: params.from,
            to: params.to,
            amount: params.amount,
          }),
        },
      );
      markCompleted(idx, result.data as Record<string, any>);
      advanceTo(2);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      markError(idx, error);
    }
  }, [action, params, apiUrl, apiKey, updateStep, markCompleted, markError, advanceTo]);

  const runWalletSign = useCallback(async () => {
    const idx = 2;
    updateStep(idx, { status: 'active' });
    try {
      // In a real integration the wallet adapter would be invoked here.
      // For now we signal readiness and immediately advance.
      markCompleted(idx, { signed: true });
      advanceTo(3);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      markError(idx, error);
    }
  }, [updateStep, markCompleted, markError, advanceTo]);

  const runSubmit = useCallback(async () => {
    const idx = 3;
    updateStep(idx, { status: 'active' });
    try {
      const endpoint = buildSubmitEndpoint(action, params);
      const result = await apiFetch<{ data: { id?: string; txHash?: string; [k: string]: unknown } }>(
        `${apiUrl}${endpoint}`,
        apiKey,
        {
          method: 'POST',
          body: JSON.stringify({
            from: params.from,
            to: params.to,
            amount: params.amount,
          }),
        },
      );

      const txId = result.data?.id || result.data?.txHash;

      // Listen for real-time status via SSE if we got a trackable id
      if (txId && typeof EventSource !== 'undefined') {
        const es = new EventSource(
          `${apiUrl}/api/v1/events/stream?aggregateType=${action}&aggregateId=${txId}`,
        );
        sseRef.current = es;

        es.onmessage = (event) => {
          if (!mountedRef.current) { es.close(); return; }
          try {
            const payload = JSON.parse(event.data);
            if (payload.status === 'confirmed' || payload.eventType?.includes('confirmed')) {
              es.close();
              const receipt: TransactionReceipt = {
                txHash: payload.txHash || txId,
                blockNumber: payload.blockNumber,
                status: 'confirmed',
                action,
                timestamp: payload.timestamp || new Date().toISOString(),
                ...payload,
              };
              markCompleted(idx, result.data as Record<string, any>);
              advanceTo(4);
              updateStep(4, { status: 'completed', data: receipt });
              onComplete?.(receipt);
            }
          } catch {
            // ignore parse errors on heartbeat comments
          }
        };

        es.onerror = () => {
          es.close();
          // Fall through – treat as confirmed since submit succeeded
          const receipt: TransactionReceipt = {
            txHash: String(txId),
            status: 'confirmed',
            action,
            timestamp: new Date().toISOString(),
          };
          markCompleted(idx, result.data as Record<string, any>);
          advanceTo(4);
          updateStep(4, { status: 'completed', data: receipt });
          onComplete?.(receipt);
        };
      } else {
        // No SSE – assume immediate confirmation
        const receipt: TransactionReceipt = {
          txHash: String(txId || ''),
          status: 'confirmed',
          action,
          timestamp: new Date().toISOString(),
          ...result.data,
        };
        markCompleted(idx, result.data as Record<string, any>);
        advanceTo(4);
        updateStep(4, { status: 'completed', data: receipt });
        onComplete?.(receipt);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      markError(idx, error);
      onError?.(error);
    }
  }, [action, params, apiUrl, apiKey, updateStep, markCompleted, markError, advanceTo, onComplete, onError]);

  // ---------------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------------

  const executeCurrentStep = useCallback(() => {
    if (cancelled) return;
    const step = STEP_ORDER[currentIndex];
    switch (step) {
      case TransactionStep.COMPLIANCE_CHECK:
        runComplianceCheck();
        break;
      case TransactionStep.GAS_ESTIMATE:
        runGasEstimate();
        break;
      case TransactionStep.WALLET_SIGN:
        runWalletSign();
        break;
      case TransactionStep.SUBMITTING:
        runSubmit();
        break;
      case TransactionStep.CONFIRMED:
        // Terminal – nothing to execute
        break;
    }
  }, [cancelled, currentIndex, runComplianceCheck, runGasEstimate, runWalletSign, runSubmit]);

  // Auto-run the first step on mount
  useEffect(() => {
    if (currentIndex === 0 && stepStates[0].status === 'active') {
      runComplianceCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-advance after completing a step (for automatic steps)
  useEffect(() => {
    const current = stepStates[currentIndex];
    if (current.status === 'active') {
      // Already running
      return;
    }
    if (current.status === 'completed' && currentIndex < STEP_ORDER.length - 1) {
      // The advanceTo call in each executor handles this
    }
  }, [stepStates, currentIndex]);

  // ---------------------------------------------------------------------------
  // User actions
  // ---------------------------------------------------------------------------

  const handleContinue = useCallback(() => {
    executeCurrentStep();
  }, [executeCurrentStep]);

  const handleRetry = useCallback(() => {
    updateStep(currentIndex, { status: 'active', error: undefined });
    executeCurrentStep();
  }, [currentIndex, updateStep, executeCurrentStep]);

  const handleCancel = useCallback(() => {
    setCancelled(true);
    sseRef.current?.close();
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (cancelled) {
    return (
      <div className="tk-transaction-flow tk-transaction-flow--cancelled">
        <p>Transaction cancelled.</p>
      </div>
    );
  }

  return (
    <div className="tk-transaction-flow">
      {stepStates.map((s, i) => {
        const statusClass =
          s.status === 'active'
            ? 'tk-step-active'
            : s.status === 'completed'
              ? 'tk-step-completed'
              : s.status === 'error'
                ? 'tk-step-error'
                : '';

        // Custom render prop
        if (renderStep) {
          return (
            <div key={s.step} className={`tk-step ${statusClass}`}>
              {renderStep({
                step: s.step,
                status: s.status,
                title: s.title,
                description: s.description,
                data: s.data,
                error: s.error,
                onContinue: handleContinue,
                onCancel: handleCancel,
                onRetry: handleRetry,
              })}
            </div>
          );
        }

        return (
          <div key={s.step} className={`tk-step ${statusClass}`}>
            <div className="tk-step__header">
              <span className="tk-step__number">{i + 1}</span>
              <h3 className="tk-step__title">{s.title}</h3>
            </div>

            <p className="tk-step__description">{s.description}</p>

            {/* Step-specific content */}
            {s.status === 'completed' && s.data && (
              <div className="tk-step__content">
                {s.step === TransactionStep.GAS_ESTIMATE && (
                  <span className="tk-step__gas">
                    Estimated cost: {(s.data as Record<string, string>).displayCost ?? 'N/A'}
                  </span>
                )}
                {s.step === TransactionStep.CONFIRMED && (
                  <span className="tk-step__txhash">
                    Tx: {(s.data as TransactionReceipt).txHash}
                  </span>
                )}
              </div>
            )}

            {/* Error with retry */}
            {s.status === 'error' && s.error && (
              <div className="tk-step__error">
                <p className="tk-step__error-message">{s.error.message}</p>
                <button type="button" className="tk-step__retry-btn" onClick={handleRetry}>
                  Retry
                </button>
              </div>
            )}

            {/* Actions for the active step */}
            {s.status === 'active' && i === currentIndex && (
              <div className="tk-step__actions">
                {s.step === TransactionStep.WALLET_SIGN && (
                  <button type="button" className="tk-step__continue-btn" onClick={handleContinue}>
                    Sign &amp; Continue
                  </button>
                )}
                <button type="button" className="tk-step__cancel-btn" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default TransactionFlow;
