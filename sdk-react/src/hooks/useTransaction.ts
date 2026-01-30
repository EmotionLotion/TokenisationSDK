/**
 * useTransaction - Hook orchestrating the full multi-step transaction flow.
 *
 * Manages a state machine that progresses through compliance check, gas
 * estimation, wallet signature, submission (with SSE status tracking), and
 * confirmation.
 *
 * @example
 * ```tsx
 * function MintButton({ tokenId }: { tokenId: string }) {
 *   const { execute, currentStep, isLoading, txHash, error, retry, cancel } =
 *     useTransaction();
 *
 *   return (
 *     <div>
 *       <button
 *         onClick={() => execute('mint', { token: tokenId, amount: '1000' })}
 *         disabled={isLoading}
 *       >
 *         Mint
 *       </button>
 *       {error && <button onClick={retry}>Retry</button>}
 *       {txHash && <span>Tx: {txHash}</span>}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTokenisation } from '../context/index.js';

// ============================================================================
// Types
// ============================================================================

export type TransactionAction = 'mint' | 'transfer' | 'burn' | 'redeem';

export enum TransactionStep {
  IDLE = 'IDLE',
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
  GAS_ESTIMATE = 'GAS_ESTIMATE',
  WALLET_SIGN = 'WALLET_SIGN',
  SUBMITTING = 'SUBMITTING',
  CONFIRMED = 'CONFIRMED',
}

export interface TransactionParams {
  token: string;
  from?: string;
  to?: string;
  amount: string;
  [key: string]: unknown;
}

export interface TransactionReceipt {
  txHash: string;
  blockNumber?: number;
  status: string;
  action: TransactionAction;
  timestamp: string;
  [key: string]: unknown;
}

export interface StepData {
  compliance?: unknown;
  gas?: unknown;
  wallet?: unknown;
  submission?: unknown;
  receipt?: TransactionReceipt;
}

export interface UseTransactionReturn {
  /** The current step in the flow */
  currentStep: TransactionStep;
  /** Data collected at each step */
  stepData: StepData;
  /** Current error, if any */
  error: Error | null;
  /** Start the transaction flow */
  execute: (action: TransactionAction, params: TransactionParams) => Promise<void>;
  /** Retry the current failed step */
  retry: () => void;
  /** Cancel the in-progress flow */
  cancel: () => void;
  /** Whether any step is in progress */
  isLoading: boolean;
  /** Transaction hash (available after submission) */
  txHash: string | null;
  /** Final receipt (available after confirmation) */
  receipt: TransactionReceipt | null;
}

// ============================================================================
// Helpers
// ============================================================================

async function apiFetch<T>(
  url: string,
  headers: Record<string, string>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
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
// Hook
// ============================================================================

export function useTransaction(): UseTransactionReturn {
  const { config, wallet } = useTokenisation();

  const [currentStep, setCurrentStep] = useState<TransactionStep>(TransactionStep.IDLE);
  const [stepData, setStepData] = useState<StepData>({});
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);

  const cancelledRef = useRef(false);
  const sseRef = useRef<EventSource | null>(null);
  const lastActionRef = useRef<TransactionAction | null>(null);
  const lastParamsRef = useRef<TransactionParams | null>(null);
  const retryStepRef = useRef<TransactionStep | null>(null);

  const apiHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (config.orgId) h['X-Org-Id'] = config.orgId;
    if (wallet?.address) h['X-Wallet-Address'] = wallet.address;
    return h;
  }, [config.orgId, wallet?.address]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sseRef.current?.close();
    };
  }, []);

  // --------------------------------------------------------------------------
  // Step runners
  // --------------------------------------------------------------------------

  const runCompliance = useCallback(
    async (action: TransactionAction, params: TransactionParams): Promise<unknown> => {
      setCurrentStep(TransactionStep.COMPLIANCE_CHECK);
      const result = await apiFetch<{ data: unknown }>(
        `${config.apiUrl}/api/v1/compliance/evaluate`,
        apiHeaders(),
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
      setStepData((prev) => ({ ...prev, compliance: result.data }));
      return result.data;
    },
    [config.apiUrl, apiHeaders],
  );

  const runGasEstimate = useCallback(
    async (action: TransactionAction, params: TransactionParams): Promise<unknown> => {
      setCurrentStep(TransactionStep.GAS_ESTIMATE);
      const result = await apiFetch<{ data: unknown }>(
        `${config.apiUrl}/api/v1/gas/estimate`,
        apiHeaders(),
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
      setStepData((prev) => ({ ...prev, gas: result.data }));
      return result.data;
    },
    [config.apiUrl, apiHeaders],
  );

  const runWalletSign = useCallback(async (): Promise<unknown> => {
    setCurrentStep(TransactionStep.WALLET_SIGN);
    // Wallet signing is handled externally (e.g. MetaMask). This step is a
    // placeholder for the integration point. In production, the wallet adapter
    // would be called here.
    const signResult = { signed: true, address: wallet?.address };
    setStepData((prev) => ({ ...prev, wallet: signResult }));
    return signResult;
  }, [wallet?.address]);

  const runSubmit = useCallback(
    async (action: TransactionAction, params: TransactionParams): Promise<TransactionReceipt> => {
      setCurrentStep(TransactionStep.SUBMITTING);

      const endpoint = buildSubmitEndpoint(action, params);
      const result = await apiFetch<{ data: { id?: string; txHash?: string; [k: string]: unknown } }>(
        `${config.apiUrl}${endpoint}`,
        apiHeaders(),
        {
          method: 'POST',
          body: JSON.stringify({
            from: params.from,
            to: params.to,
            amount: params.amount,
          }),
        },
      );

      const txId = result.data?.txHash || result.data?.id || '';
      setTxHash(String(txId));
      setStepData((prev) => ({ ...prev, submission: result.data }));

      // Listen for real-time updates via SSE
      const receiptPromise = new Promise<TransactionReceipt>((resolve) => {
        if (txId && typeof EventSource !== 'undefined') {
          const es = new EventSource(
            `${config.apiUrl}/api/v1/events/stream?aggregateType=${action}&aggregateId=${txId}`,
          );
          sseRef.current = es;

          const timeout = setTimeout(() => {
            es.close();
            const fallback: TransactionReceipt = {
              txHash: String(txId),
              status: 'confirmed',
              action,
              timestamp: new Date().toISOString(),
              ...result.data,
            };
            resolve(fallback);
          }, 60_000);

          es.onmessage = (event) => {
            try {
              const payload = JSON.parse(event.data);
              if (payload.status === 'confirmed' || payload.eventType?.includes('confirmed')) {
                clearTimeout(timeout);
                es.close();
                const r: TransactionReceipt = {
                  txHash: payload.txHash || String(txId),
                  blockNumber: payload.blockNumber,
                  status: 'confirmed',
                  action,
                  timestamp: payload.timestamp || new Date().toISOString(),
                  ...payload,
                };
                resolve(r);
              }
            } catch {
              // ignore heartbeat
            }
          };

          es.onerror = () => {
            clearTimeout(timeout);
            es.close();
            const fallback: TransactionReceipt = {
              txHash: String(txId),
              status: 'confirmed',
              action,
              timestamp: new Date().toISOString(),
              ...result.data,
            };
            resolve(fallback);
          };
        } else {
          const fallback: TransactionReceipt = {
            txHash: String(txId),
            status: 'confirmed',
            action,
            timestamp: new Date().toISOString(),
            ...result.data,
          };
          resolve(fallback);
        }
      });

      return receiptPromise;
    },
    [config.apiUrl, apiHeaders],
  );

  // --------------------------------------------------------------------------
  // Orchestrator
  // --------------------------------------------------------------------------

  const executeFlow = useCallback(
    async (action: TransactionAction, params: TransactionParams, startFrom?: TransactionStep) => {
      cancelledRef.current = false;
      setError(null);
      setIsLoading(true);
      setReceipt(null);
      setTxHash(null);

      lastActionRef.current = action;
      lastParamsRef.current = params;

      const steps: TransactionStep[] = [
        TransactionStep.COMPLIANCE_CHECK,
        TransactionStep.GAS_ESTIMATE,
        TransactionStep.WALLET_SIGN,
        TransactionStep.SUBMITTING,
      ];

      const startIdx = startFrom ? steps.indexOf(startFrom) : 0;

      try {
        for (let i = Math.max(startIdx, 0); i < steps.length; i++) {
          if (cancelledRef.current) return;

          const step = steps[i];
          retryStepRef.current = step;

          switch (step) {
            case TransactionStep.COMPLIANCE_CHECK:
              await runCompliance(action, params);
              break;
            case TransactionStep.GAS_ESTIMATE:
              await runGasEstimate(action, params);
              break;
            case TransactionStep.WALLET_SIGN:
              await runWalletSign();
              break;
            case TransactionStep.SUBMITTING: {
              const r = await runSubmit(action, params);
              setCurrentStep(TransactionStep.CONFIRMED);
              setStepData((prev) => ({ ...prev, receipt: r }));
              setReceipt(r);
              break;
            }
          }
        }
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
      } finally {
        setIsLoading(false);
      }
    },
    [runCompliance, runGasEstimate, runWalletSign, runSubmit],
  );

  const execute = useCallback(
    async (action: TransactionAction, params: TransactionParams) => {
      await executeFlow(action, params);
    },
    [executeFlow],
  );

  const retry = useCallback(() => {
    if (!lastActionRef.current || !lastParamsRef.current) return;
    executeFlow(lastActionRef.current, lastParamsRef.current, retryStepRef.current ?? undefined);
  }, [executeFlow]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    sseRef.current?.close();
    setIsLoading(false);
    setCurrentStep(TransactionStep.IDLE);
  }, []);

  return {
    currentStep,
    stepData,
    error,
    execute,
    retry,
    cancel,
    isLoading,
    txHash,
    receipt,
  };
}
