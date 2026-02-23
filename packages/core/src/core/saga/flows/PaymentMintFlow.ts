/**
 * Payment + Mint Saga Flow
 *
 * Pre-built saga for the common pattern:
 * 1. Create payment intent (no compensation needed)
 * 2. Confirm payment → compensate: refund
 * 3. Mint tokens → compensate: manual (on-chain reversal not automatic)
 * 4. Update ledger → compensate: reverse entry
 *
 * @example
 * ```typescript
 * const flow = createPaymentMintFlow({
 *   paymentProvider,
 *   tokenService,
 *   ledgerService,
 * });
 *
 * const result = await flow.execute({
 *   payerId: 'user-123',
 *   amount: '10000',
 *   currency: 'USD',
 *   assetId: 'asset-456',
 *   recipientAddress: '0x...',
 *   tokenAmount: '100',
 * });
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../../types.js';
import type { SagaDefinition, SagaExecutionOptions, SagaExecutionResult } from '../types.js';
import { SagaBuilder, SagaCoordinator } from '../../Saga.js';
import type { IPaymentProvider, PaymentIntent, PaymentConfirmation, Refund } from '../../../providers/payment/PaymentProvider.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Payment mint flow context
 */
export interface PaymentMintContext {
  // Input
  payerId: string;
  payerEmail?: string;
  amount: string;
  currency: string;
  assetId: string;
  recipientAddress: string;
  tokenAmount: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;

  // Step results (populated during execution)
  paymentIntent?: PaymentIntent;
  paymentConfirmation?: PaymentConfirmation;
  mintTxHash?: string;
  ledgerEntryId?: string;
}

/**
 * Token minting service interface
 */
export interface ITokenMintService {
  mint(params: {
    assetId: string;
    to: string;
    amount: string;
    metadata?: Record<string, unknown>;
  }): Promise<Result<{ txHash: string; tokenId?: string }, string>>;

  // Note: On-chain burns are irreversible - compensation is manual/flagged
  flagForReview(txHash: string, reason: string): Promise<Result<void, string>>;
}

/**
 * Ledger service interface
 */
export interface ILedgerService {
  createEntry(params: {
    assetId: string;
    from: string;
    to: string;
    amount: string;
    type: 'mint' | 'transfer' | 'burn';
    metadata?: Record<string, unknown>;
  }): Promise<Result<{ entryId: string }, string>>;

  reverseEntry(entryId: string, reason: string): Promise<Result<void, string>>;
}

/**
 * Dependencies for payment mint flow
 */
export interface PaymentMintFlowDeps {
  paymentProvider: IPaymentProvider;
  tokenService: ITokenMintService;
  ledgerService: ILedgerService;
  onStepComplete?: (stepName: string, result: unknown) => void;
  onCompensation?: (stepName: string, error?: string) => void;
}

/**
 * Payment mint flow result
 */
export interface PaymentMintResult {
  paymentIntentId: string;
  paymentConfirmationId?: string;
  mintTxHash?: string;
  ledgerEntryId?: string;
  refund?: Refund;
}

// ============================================================================
// FLOW IMPLEMENTATION
// ============================================================================

/**
 * Create a payment + mint saga flow
 */
export function createPaymentMintFlow(deps: PaymentMintFlowDeps) {
  const { paymentProvider, tokenService, ledgerService } = deps;

  return {
    /**
     * Execute the payment mint flow
     */
    async execute(
      context: PaymentMintContext,
      options?: SagaExecutionOptions
    ): Promise<Result<SagaExecutionResult<PaymentMintResult>, string>> {
      const sagaId = options?.sagaId ?? `payment-mint-${uuidv4().slice(0, 8)}`;
      const referenceId = context.referenceId ?? sagaId;

      const saga = new SagaCoordinator({
        id: sagaId,
        timeoutMs: options?.timeoutMs ?? 5 * 60 * 1000, // 5 minutes
        compensateOnTimeout: true,
        onStepComplete: (stepName) => {
          deps.onStepComplete?.(stepName, context);
        },
      });

      // Step 1: Create payment intent (no compensation - just metadata)
      saga.addStep<PaymentIntent>(
        'create-payment-intent',
        async () => {
          const result = await paymentProvider.createIntent({
            amount: context.amount,
            currency: context.currency,
            payerId: context.payerId,
            payerEmail: context.payerEmail,
            referenceId,
            referenceType: 'purchase',
            metadata: {
              ...context.metadata,
              assetId: context.assetId,
              tokenAmount: context.tokenAmount,
              recipientAddress: context.recipientAddress,
            },
          });

          if (!result.success) {
            throw new Error(result.error);
          }

          context.paymentIntent = result.data;
          return result.data;
        }
        // No compensation - intent creation is idempotent and can expire
      );

      // Step 2: Confirm payment → compensate: refund
      saga.addStep<PaymentConfirmation>(
        'confirm-payment',
        async () => {
          if (!context.paymentIntent) {
            throw new Error('Payment intent not created');
          }

          const result = await paymentProvider.confirmIntent(context.paymentIntent.id);

          if (!result.success) {
            throw new Error(result.error);
          }

          context.paymentConfirmation = result.data;
          return result.data;
        },
        async (confirmation) => {
          // Compensation: refund the payment
          deps.onCompensation?.('confirm-payment');

          const refundResult = await paymentProvider.createRefund({
            intentId: confirmation.intentId,
            reason: 'other',
            notes: 'Saga compensation - subsequent step failed',
            metadata: { sagaId, compensationFor: 'confirm-payment' },
          });

          if (!refundResult.success) {
            // Log but don't fail compensation - manual intervention needed
            console.error(`Failed to refund payment ${confirmation.intentId}: ${refundResult.error}`);
          }
        }
      );

      // Step 3: Mint tokens → compensate: flag for review (on-chain is irreversible)
      saga.addStep<{ txHash: string }>(
        'mint-tokens',
        async () => {
          const result = await tokenService.mint({
            assetId: context.assetId,
            to: context.recipientAddress,
            amount: context.tokenAmount,
            metadata: {
              ...context.metadata,
              paymentIntentId: context.paymentIntent?.id,
              payerId: context.payerId,
            },
          });

          if (!result.success) {
            throw new Error(result.error);
          }

          context.mintTxHash = result.data.txHash;
          return result.data;
        },
        async (mintResult) => {
          // Compensation: flag for manual review (on-chain mints can't be auto-reversed)
          deps.onCompensation?.('mint-tokens');

          await tokenService.flagForReview(
            mintResult.txHash,
            `Saga ${sagaId} compensation required - ledger step failed`
          );
        }
      );

      // Step 4: Update ledger → compensate: reverse entry
      saga.addStep<{ entryId: string }>(
        'update-ledger',
        async () => {
          const result = await ledgerService.createEntry({
            assetId: context.assetId,
            from: 'treasury',
            to: context.recipientAddress,
            amount: context.tokenAmount,
            type: 'mint',
            metadata: {
              ...context.metadata,
              paymentIntentId: context.paymentIntent?.id,
              mintTxHash: context.mintTxHash,
              payerId: context.payerId,
            },
          });

          if (!result.success) {
            throw new Error(result.error);
          }

          context.ledgerEntryId = result.data.entryId;
          return result.data;
        },
        async (ledgerResult) => {
          // Compensation: reverse ledger entry
          deps.onCompensation?.('update-ledger');

          const reverseResult = await ledgerService.reverseEntry(
            ledgerResult.entryId,
            `Saga ${sagaId} compensation`
          );

          if (!reverseResult.success) {
            console.error(`Failed to reverse ledger entry ${ledgerResult.entryId}: ${reverseResult.error}`);
          }
        }
      );

      // Execute the saga
      const startTime = Date.now();
      const result = await saga.execute<PaymentMintResult>();
      const duration = Date.now() - startTime;

      if (!result.success) {
        return { success: false, error: result.error ?? 'Saga execution failed' };
      }

      const sagaResult = result.data;

      return {
        success: true,
        data: {
          sagaId: sagaResult.sagaId,
          type: 'payment-mint',
          success: sagaResult.success,
          results: {
            paymentIntentId: context.paymentIntent?.id ?? '',
            paymentConfirmationId: context.paymentConfirmation?.intentId,
            mintTxHash: context.mintTxHash,
            ledgerEntryId: context.ledgerEntryId,
          },
          error: sagaResult.error,
          compensated: sagaResult.compensated,
          state: {
            id: sagaResult.sagaId,
            type: 'payment-mint',
            status: sagaResult.state.status === 'COMPLETED' ? 'COMPLETED' : sagaResult.state.status === 'FAILED' ? 'FAILED' : sagaResult.state.status,
            currentStepIndex: sagaResult.state.steps.length - 1,
            steps: sagaResult.state.steps.map((step) => ({
              name: step.name,
              status: step.status,
              error: step.error,
              startedAt: step.startedAt,
              completedAt: step.completedAt,
              compensatedAt: undefined,
              attempts: 1,
              maxAttempts: 1,
            })),
            context: context as unknown as Record<string, unknown>,
            results: sagaResult.results,
            error: sagaResult.error,
            startedAt: sagaResult.state.startedAt,
            completedAt: sagaResult.state.completedAt,
            createdAt: sagaResult.state.startedAt,
            updatedAt: sagaResult.state.completedAt ?? new Date().toISOString(),
            version: 1,
          },
          duration,
        },
      };
    },

    /**
     * Get saga definition for registration
     */
    getDefinition(): SagaDefinition<PaymentMintContext> {
      return {
        type: 'payment-mint',
        description: 'Payment confirmation and token minting with ledger update',
        steps: [
          {
            name: 'create-payment-intent',
            execute: async () => ({ id: 'placeholder' } as PaymentIntent),
            idempotent: true,
          },
          {
            name: 'confirm-payment',
            execute: async () => ({ intentId: 'placeholder' } as PaymentConfirmation),
            compensate: async () => {},
            compensationRequired: true,
          },
          {
            name: 'mint-tokens',
            execute: async () => ({ txHash: 'placeholder' }),
            compensate: async () => {},
            compensationRequired: true,
          },
          {
            name: 'update-ledger',
            execute: async () => ({ entryId: 'placeholder' }),
            compensate: async () => {},
            compensationRequired: true,
          },
        ],
        timeoutMs: 5 * 60 * 1000,
        compensateOnTimeout: true,
      };
    },
  };
}

export default createPaymentMintFlow;
