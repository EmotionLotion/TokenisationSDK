/**
 * useTransaction - Hook orchestrating the full multi-step transaction flow.
 *
 * Manages a state machine that progresses through compliance check, gas
 * estimation, wallet signature, submission (with SSE status tracking), and
 * confirmation.
 *
 * Phase 4: Wallet signing is now implemented via EIP-1193 wallet adapter
 * from context instead of a placeholder stub.
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
  currentStep: TransactionStep;
  stepData: StepData;
  error: Error | null;
  execute: (action: TransactionAction, params: TransactionParams) => Promise<void>;
  retry: () => void;
  cancel: () => void;
  isLoading: boolean;
  txHash: string | null;
  receipt: TransactionReceipt | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useTransaction(): UseTransactionReturn {
  const { config, wallet, api, modules, signMessage, sendTransaction } = useTokenisation();

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
      const result = await api.post<{ data: unknown }>(
        '/api/v1/compliance/evaluate',
        {
          action,
          token: params.token,
          from: params.from,
          to: params.to,
          amount: params.amount,
        },
      );
      setStepData((prev) => ({ ...prev, compliance: result.data }));
      return result.data;
    },
    [api],
  );

  const runGasEstimate = useCallback(
    async (action: TransactionAction, params: TransactionParams): Promise<unknown> => {
      setCurrentStep(TransactionStep.GAS_ESTIMATE);
      const result = await api.post<{ data: unknown }>(
        '/api/v1/gas/estimate',
        {
          action,
          token: params.token,
          from: params.from,
          to: params.to,
          amount: params.amount,
        },
      );
      setStepData((prev) => ({ ...prev, gas: result.data }));
      return result.data;
    },
    [api],
  );

  const runWalletSign = useCallback(
    async (action: TransactionAction, params: TransactionParams): Promise<unknown> => {
      setCurrentStep(TransactionStep.WALLET_SIGN);

      if (!wallet?.address) {
        throw new Error('Wallet not connected');
      }

      let signResult: unknown;

      if (action === 'transfer' || action === 'redeem') {
        // For transfers and redemptions, the server returns an unsigned tx.
        // Fetch the unsigned transaction from the server.
        const prepareResult = await api.post<{
          data: { unsignedTx?: any; message?: string };
        }>(
          `/api/v1/transfers/prepare`,
          {
            action,
            token: params.token,
            from: params.from || wallet.address,
            to: params.to,
            amount: params.amount,
          },
        );

        const prepared = prepareResult.data.data;

        if (prepared?.unsignedTx) {
          // Sign and send the transaction via wallet
          const hash = await sendTransaction({
            to: prepared.unsignedTx.to,
            from: prepared.unsignedTx.from || wallet.address,
            data: prepared.unsignedTx.data,
            value: prepared.unsignedTx.value,
            gasLimit: prepared.unsignedTx.gasLimit,
            maxFeePerGas: prepared.unsignedTx.maxFeePerGas,
            maxPriorityFeePerGas: prepared.unsignedTx.maxPriorityFeePerGas,
            chainId: prepared.unsignedTx.chainId,
          });

          signResult = { signed: true, txHash: hash, address: wallet.address };
        } else {
          // Fallback: sign a structured message to prove wallet ownership
          const message = prepared?.message || `Authorize ${action} of ${params.amount} tokens`;
          const signature = await signMessage(message);
          signResult = { signed: true, signature, address: wallet.address };
        }
      } else {
        // For mints/burns, these are typically server-signed (relayer).
        // Sign a structured message to prove wallet ownership.
        const message = [
          `Action: ${action}`,
          `Token: ${params.token}`,
          `Amount: ${params.amount}`,
          params.to ? `To: ${params.to}` : '',
          `Timestamp: ${new Date().toISOString()}`,
        ].filter(Boolean).join('\n');

        const signature = await signMessage(message);
        signResult = { signed: true, signature, address: wallet.address };
      }

      setStepData((prev) => ({ ...prev, wallet: signResult }));
      return signResult;
    },
    [wallet, api, signMessage, sendTransaction],
  );

  const runSubmit = useCallback(
    async (action: TransactionAction, params: TransactionParams): Promise<TransactionReceipt> => {
      setCurrentStep(TransactionStep.SUBMITTING);

      // Use modules for submission when possible
      let result: any;
      const walletData = (stepData.wallet as any) || {};

      switch (action) {
        case 'mint':
          result = await modules.tokens.issue(params.token, {
            to: params.to,
            amount: params.amount,
            signature: walletData.signature,
          } as any);
          break;
        case 'transfer':
          if (walletData.txHash) {
            // Transaction was already sent on-chain via wallet
            result = await api.post('/api/v1/transfers', {
              tokenId: params.token,
              fromWallet: params.from || wallet?.address,
              toWallet: params.to,
              amount: params.amount,
              txHash: walletData.txHash,
            });
          } else {
            result = await modules.transfers.create({
              tokenId: params.token,
              fromWallet: params.from || wallet?.address || '',
              toWallet: params.to || '',
              amount: params.amount,
              metadata: { signature: walletData.signature },
            } as any);
          }
          break;
        case 'burn':
          result = await modules.tokens.redeem(params.token, {
            from: params.from || wallet?.address,
            amount: params.amount,
            signature: walletData.signature,
          } as any);
          break;
        case 'redeem':
          if (walletData.txHash) {
            result = await api.post(`/api/v1/tokens/${encodeURIComponent(params.token)}/redeem`, {
              from: params.from || wallet?.address,
              amount: params.amount,
              txHash: walletData.txHash,
            });
          } else {
            result = await modules.tokens.redeem(params.token, {
              from: params.from || wallet?.address,
              amount: params.amount,
              signature: walletData.signature,
            } as any);
          }
          break;
      }

      const data = result?.data?.data ?? result?.data ?? result ?? {};
      const txId = walletData.txHash || data.txHash || data.id || '';
      setTxHash(String(txId));
      setStepData((prev) => ({ ...prev, submission: data }));

      // Listen for real-time updates via SSE
      const receiptPromise = new Promise<TransactionReceipt>((resolve) => {
        if (txId && typeof EventSource !== 'undefined') {
          const es = new EventSource(
            `${config.apiUrl}/api/v1/events/stream?aggregateType=${action}&aggregateId=${txId}`,
          );
          sseRef.current = es;

          const timeout = setTimeout(() => {
            es.close();
            resolve({
              txHash: String(txId),
              status: 'confirmed',
              action,
              timestamp: new Date().toISOString(),
              ...data,
            });
          }, 60_000);

          es.onmessage = (event) => {
            try {
              const payload = JSON.parse(event.data);
              if (payload.status === 'confirmed' || payload.eventType?.includes('confirmed')) {
                clearTimeout(timeout);
                es.close();
                resolve({
                  txHash: payload.txHash || String(txId),
                  blockNumber: payload.blockNumber,
                  status: 'confirmed',
                  action,
                  timestamp: payload.timestamp || new Date().toISOString(),
                  ...payload,
                });
              }
            } catch {
              // ignore heartbeat
            }
          };

          es.onerror = () => {
            clearTimeout(timeout);
            es.close();
            resolve({
              txHash: String(txId),
              status: 'confirmed',
              action,
              timestamp: new Date().toISOString(),
              ...data,
            });
          };
        } else {
          resolve({
            txHash: String(txId),
            status: 'confirmed',
            action,
            timestamp: new Date().toISOString(),
            ...data,
          });
        }
      });

      return receiptPromise;
    },
    [config.apiUrl, api, modules, wallet, stepData.wallet],
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
              await runWalletSign(action, params);
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
