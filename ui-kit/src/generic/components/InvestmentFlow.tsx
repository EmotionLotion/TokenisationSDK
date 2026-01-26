/**
 * InvestmentFlow - Multi-step wizard for acquiring/investing in assets
 *
 * Similar to Stripe Checkout - a production-grade modal wizard:
 * - Step 1: Quantity selection
 * - Step 2: Compliance check (KYC if required)
 * - Step 3: Payment/Wallet signature
 * - Step 4: Success confirmation
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  Loader2,
  Shield,
  Wallet,
  CreditCard,
  Info,
  Minus,
  Plus,
} from 'lucide-react';
import type { AssetInstance, AssetTemplate, PolicyEvaluationResult } from '../types';
import { useAssetsOptional, useAsset } from '../context/AssetContext';
import { useTokenisation } from '../../context/TokenisationProvider';
import { TokenAmount, PriceDisplay } from '../atoms/TokenAmount';
import { StatusBadge } from '../atoms/StatusBadge';

// ============================================
// Types
// ============================================

export interface InvestmentFlowProps {
  /** Asset ID to invest in */
  assetId: string;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Success callback */
  onSuccess?: (result: InvestmentResult) => void;
  /** Error callback */
  onError?: (error: Error) => void;
  /** Minimum investment amount */
  minAmount?: number;
  /** Maximum investment amount */
  maxAmount?: number;
  /** Price per unit (if not from asset) */
  pricePerUnit?: number;
  /** Currency */
  currency?: string;
}

export interface InvestmentResult {
  assetId: string;
  amount: string;
  transactionId: string;
  timestamp: string;
}

type FlowStep = 'quantity' | 'compliance' | 'payment' | 'signing' | 'success';

interface StepConfig {
  id: FlowStep;
  title: string;
  description: string;
}

const STEPS: StepConfig[] = [
  { id: 'quantity', title: 'Amount', description: 'Select investment amount' },
  { id: 'compliance', title: 'Compliance', description: 'Verify your identity' },
  { id: 'payment', title: 'Payment', description: 'Complete payment' },
  { id: 'signing', title: 'Confirm', description: 'Sign transaction' },
  { id: 'success', title: 'Complete', description: 'Investment confirmed' },
];

// ============================================
// Progress Indicator
// ============================================

interface ProgressIndicatorProps {
  steps: StepConfig[];
  currentStep: FlowStep;
  completedSteps: FlowStep[];
}

function ProgressIndicator({ steps, currentStep, completedSteps }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = completedSteps.includes(step.id);
        const isPast = steps.findIndex((s) => s.id === currentStep) > index;

        return (
          <React.Fragment key={step.id}>
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                transition-all
                ${isActive ? 'bg-blue-500 text-white' : ''}
                ${isCompleted || isPast ? 'bg-green-500 text-white' : ''}
                ${!isActive && !isCompleted && !isPast ? 'bg-white/10 text-gray-500' : ''}
              `}
            >
              {isCompleted || isPast ? <Check className="w-4 h-4" /> : index + 1}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`
                  w-8 h-0.5 transition-colors
                  ${isPast || isCompleted ? 'bg-green-500' : 'bg-white/10'}
                `}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================
// Quantity Step
// ============================================

interface QuantityStepProps {
  asset: AssetInstance;
  template: AssetTemplate | null;
  amount: number;
  pricePerUnit: number;
  currency: string;
  minAmount: number;
  maxAmount: number;
  onChange: (amount: number) => void;
  onNext: () => void;
}

function QuantityStep({
  asset,
  template,
  amount,
  pricePerUnit,
  currency,
  minAmount,
  maxAmount,
  onChange,
  onNext,
}: QuantityStepProps) {
  const totalCost = amount * pricePerUnit;
  const isValid = amount >= minAmount && amount <= maxAmount;

  const presetAmounts = useMemo(() => {
    const max = Math.min(maxAmount, 10000);
    return [100, 500, 1000, max].filter((a) => a >= minAmount && a <= maxAmount);
  }, [minAmount, maxAmount]);

  return (
    <div className="space-y-6">
      {/* Asset info */}
      <div className="flex items-center gap-4 p-4 rounded-lg bg-white/5 border border-white/10">
        {asset.metadata.image && (
          <img
            src={asset.metadata.image}
            alt={asset.metadata.name}
            className="w-16 h-16 rounded-lg object-cover"
          />
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-white">{asset.metadata.name}</h3>
          <p className="text-sm text-gray-400">{template?.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={asset.status} size="sm" />
          </div>
        </div>
        <div className="text-right">
          <PriceDisplay price={pricePerUnit} currency={currency} size="sm" />
          <p className="text-xs text-gray-500">per unit</p>
        </div>
      </div>

      {/* Amount input */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Investment Amount
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange(Math.max(minAmount, amount - 100))}
            disabled={amount <= minAmount}
            className="p-2 rounded-lg bg-white/5 text-white hover:bg-white/10
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Minus className="w-5 h-5" />
          </button>

          <div className="flex-1">
            <input
              type="number"
              value={amount}
              onChange={(e) => onChange(Number(e.target.value))}
              min={minAmount}
              max={maxAmount}
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10
                text-white text-center text-xl font-semibold
                focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <button
            type="button"
            onClick={() => onChange(Math.min(maxAmount, amount + 100))}
            disabled={amount >= maxAmount}
            className="p-2 rounded-lg bg-white/5 text-white hover:bg-white/10
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Preset amounts */}
        <div className="flex gap-2 mt-3">
          {presetAmounts.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={`
                flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                ${amount === preset
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }
              `}
            >
              {preset.toLocaleString()}
            </button>
          ))}
        </div>

        {/* Min/max info */}
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>Min: {minAmount.toLocaleString()}</span>
          <span>Max: {maxAmount.toLocaleString()}</span>
        </div>
      </div>

      {/* Cost summary */}
      <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Units</span>
          <span className="text-white font-medium">{amount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Price per unit</span>
          <PriceDisplay price={pricePerUnit} currency={currency} size="sm" />
        </div>
        <div className="border-t border-white/10 pt-3 flex justify-between">
          <span className="text-gray-400">Total</span>
          <PriceDisplay price={totalCost} currency={currency} size="md" />
        </div>
      </div>

      {/* Next button */}
      <button
        type="button"
        onClick={onNext}
        disabled={!isValid}
        className="w-full py-3 rounded-lg bg-blue-500 text-white font-semibold
          hover:bg-blue-600 transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center gap-2"
      >
        Continue
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

// ============================================
// Compliance Step
// ============================================

interface ComplianceStepProps {
  asset: AssetInstance;
  policyResult: PolicyEvaluationResult | null;
  isLoading: boolean;
  onBack: () => void;
  onNext: () => void;
  onStartKYC: () => void;
}

function ComplianceStep({
  asset,
  policyResult,
  isLoading,
  onBack,
  onNext,
  onStartKYC,
}: ComplianceStepProps) {
  const context = useAssetsOptional();
  const userIdentity = context?.userIdentity;

  const isKYCVerified = userIdentity?.kycStatus === 'verified';
  const canProceed = policyResult?.allowed ?? false;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Identity Verification</h3>
        <p className="text-gray-400 text-sm">
          This asset requires identity verification before investing.
        </p>
      </div>

      {/* KYC Status */}
      <div className="p-4 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">KYC Status</span>
          <StatusBadge
            status={userIdentity?.kycStatus || 'pending'}
            showDot
            pulse={userIdentity?.kycStatus === 'pending'}
          />
        </div>
      </div>

      {/* Requirements */}
      {policyResult && !policyResult.allowed && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 font-medium mb-2">Requirements not met</p>
              <ul className="text-sm text-gray-400 space-y-1">
                {policyResult.requirements.map((req, i) => (
                  <li key={i}>• {req}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
      {canProceed && (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-green-400" />
            <p className="text-green-400">All requirements met. You can proceed.</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 rounded-lg bg-white/5 text-white font-medium
            hover:bg-white/10 transition-colors
            flex items-center justify-center gap-2"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>

        {!isKYCVerified && (
          <button
            type="button"
            onClick={onStartKYC}
            className="flex-1 py-3 rounded-lg bg-blue-500 text-white font-semibold
              hover:bg-blue-600 transition-colors
              flex items-center justify-center gap-2"
          >
            <Shield className="w-5 h-5" />
            Verify Identity
          </button>
        )}

        {canProceed && (
          <button
            type="button"
            onClick={onNext}
            disabled={isLoading}
            className="flex-1 py-3 rounded-lg bg-green-500 text-white font-semibold
              hover:bg-green-600 transition-colors
              disabled:opacity-50
              flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Continue
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Payment Step
// ============================================

interface PaymentStepProps {
  amount: number;
  pricePerUnit: number;
  currency: string;
  onBack: () => void;
  onNext: () => void;
}

function PaymentStep({ amount, pricePerUnit, currency, onBack, onNext }: PaymentStepProps) {
  const totalCost = amount * pricePerUnit;
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'card'>('wallet');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <CreditCard className="w-8 h-8 text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Payment Method</h3>
        <p className="text-gray-400 text-sm">Select how you'd like to pay</p>
      </div>

      {/* Payment methods */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setPaymentMethod('wallet')}
          className={`
            w-full flex items-center gap-4 p-4 rounded-lg border transition-all
            ${paymentMethod === 'wallet'
              ? 'bg-blue-500/10 border-blue-500'
              : 'bg-white/5 border-white/10 hover:border-white/20'
            }
          `}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center
            ${paymentMethod === 'wallet' ? 'bg-blue-500/20' : 'bg-white/10'}`}>
            <Wallet className={`w-5 h-5 ${paymentMethod === 'wallet' ? 'text-blue-400' : 'text-gray-400'}`} />
          </div>
          <div className="flex-1 text-left">
            <p className={`font-medium ${paymentMethod === 'wallet' ? 'text-blue-400' : 'text-white'}`}>
              Crypto Wallet
            </p>
            <p className="text-sm text-gray-500">Pay with USDC or USDT</p>
          </div>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
            ${paymentMethod === 'wallet' ? 'border-blue-500' : 'border-white/30'}`}>
            {paymentMethod === 'wallet' && (
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setPaymentMethod('card')}
          className={`
            w-full flex items-center gap-4 p-4 rounded-lg border transition-all
            ${paymentMethod === 'card'
              ? 'bg-blue-500/10 border-blue-500'
              : 'bg-white/5 border-white/10 hover:border-white/20'
            }
          `}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center
            ${paymentMethod === 'card' ? 'bg-blue-500/20' : 'bg-white/10'}`}>
            <CreditCard className={`w-5 h-5 ${paymentMethod === 'card' ? 'text-blue-400' : 'text-gray-400'}`} />
          </div>
          <div className="flex-1 text-left">
            <p className={`font-medium ${paymentMethod === 'card' ? 'text-blue-400' : 'text-white'}`}>
              Credit Card
            </p>
            <p className="text-sm text-gray-500">Visa, Mastercard, Amex</p>
          </div>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
            ${paymentMethod === 'card' ? 'border-blue-500' : 'border-white/30'}`}>
            {paymentMethod === 'card' && (
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            )}
          </div>
        </button>
      </div>

      {/* Summary */}
      <div className="p-4 rounded-lg bg-white/5 border border-white/10">
        <div className="flex justify-between mb-2">
          <span className="text-gray-400">Amount</span>
          <span className="text-white">{amount.toLocaleString()} units</span>
        </div>
        <div className="flex justify-between border-t border-white/10 pt-2">
          <span className="text-gray-400 font-medium">Total</span>
          <PriceDisplay price={totalCost} currency={currency} size="md" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 rounded-lg bg-white/5 text-white font-medium
            hover:bg-white/10 transition-colors
            flex items-center justify-center gap-2"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 py-3 rounded-lg bg-blue-500 text-white font-semibold
            hover:bg-blue-600 transition-colors
            flex items-center justify-center gap-2"
        >
          Continue
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ============================================
// Signing Step
// ============================================

interface SigningStepProps {
  asset: AssetInstance;
  amount: number;
  totalCost: number;
  currency: string;
  isProcessing: boolean;
  onBack: () => void;
  onSign: () => void;
}

function SigningStep({
  asset,
  amount,
  totalCost,
  currency,
  isProcessing,
  onBack,
  onSign,
}: SigningStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
          <Wallet className="w-8 h-8 text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Confirm Transaction</h3>
        <p className="text-gray-400 text-sm">
          Review and sign to complete your investment
        </p>
      </div>

      {/* Transaction details */}
      <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-400">Asset</span>
          <span className="text-white font-medium">{asset.metadata.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Amount</span>
          <span className="text-white">{amount.toLocaleString()} units</span>
        </div>
        <div className="flex justify-between border-t border-white/10 pt-3">
          <span className="text-gray-400 font-medium">Total Payment</span>
          <PriceDisplay price={totalCost} currency={currency} size="md" />
        </div>
      </div>

      {/* Info box */}
      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-300">
            You will be prompted to sign a transaction in your wallet.
            This authorizes the transfer of funds and issuance of tokens.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isProcessing}
          className="flex-1 py-3 rounded-lg bg-white/5 text-white font-medium
            hover:bg-white/10 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
        <button
          type="button"
          onClick={onSign}
          disabled={isProcessing}
          className="flex-1 py-3 rounded-lg bg-green-500 text-white font-semibold
            hover:bg-green-600 transition-colors
            disabled:opacity-50
            flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Sign & Confirm
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================
// Success Step
// ============================================

interface SuccessStepProps {
  asset: AssetInstance;
  amount: number;
  transactionId: string;
  onClose: () => void;
  onViewAsset: () => void;
}

function SuccessStep({ asset, amount, transactionId, onClose, onViewAsset }: SuccessStepProps) {
  return (
    <div className="space-y-6 text-center">
      {/* Confetti animation would go here */}
      <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
        <Check className="w-10 h-10 text-green-400" />
      </div>

      <div>
        <h3 className="text-xl font-semibold text-white mb-2">Investment Complete!</h3>
        <p className="text-gray-400">
          You have successfully invested in {asset.metadata.name}
        </p>
      </div>

      {/* Details */}
      <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-left space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Asset</span>
          <span className="text-white">{asset.metadata.name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Amount</span>
          <span className="text-white">{amount.toLocaleString()} units</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Transaction</span>
          <span className="text-blue-400 font-mono text-xs">
            {transactionId.slice(0, 8)}...{transactionId.slice(-6)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-3 rounded-lg bg-white/5 text-white font-medium
            hover:bg-white/10 transition-colors"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onViewAsset}
          className="flex-1 py-3 rounded-lg bg-blue-500 text-white font-semibold
            hover:bg-blue-600 transition-colors"
        >
          View Asset
        </button>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function InvestmentFlow({
  assetId,
  isOpen,
  onClose,
  onSuccess,
  onError,
  minAmount = 1,
  maxAmount = 100000,
  pricePerUnit = 1,
  currency = 'USD',
}: InvestmentFlowProps) {
  const { asset, template, loading: assetLoading } = useAsset(assetId);
  const context = useAssetsOptional();
  const { isAuthenticated, user } = useTokenisation();

  // State
  const [currentStep, setCurrentStep] = useState<FlowStep>('quantity');
  const [completedSteps, setCompletedSteps] = useState<FlowStep[]>([]);
  const [amount, setAmount] = useState(minAmount);
  const [isProcessing, setIsProcessing] = useState(false);
  const [policyResult, setPolicyResult] = useState<PolicyEvaluationResult | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [showKYC, setShowKYC] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('quantity');
      setCompletedSteps([]);
      setAmount(minAmount);
      setPolicyResult(null);
      setTransactionId('');
    }
  }, [isOpen, minAmount]);

  // Evaluate policy when moving to compliance step
  useEffect(() => {
    if (currentStep === 'compliance' && asset && context?.evaluateAction) {
      context.evaluateAction({
        action: 'issue',
        assetId: asset.id,
        actorIdentityId: user?.id || '',
        amount: String(amount),
      }).then(setPolicyResult);
    }
  }, [currentStep, asset, amount, context, user]);

  // Navigation helpers
  const goToStep = useCallback((step: FlowStep) => {
    setCurrentStep(step);
  }, []);

  const completeStep = useCallback((step: FlowStep) => {
    setCompletedSteps((prev) => [...prev, step]);
  }, []);

  // Step handlers
  const handleQuantityNext = useCallback(() => {
    completeStep('quantity');
    goToStep('compliance');
  }, [completeStep, goToStep]);

  const handleComplianceNext = useCallback(() => {
    completeStep('compliance');
    goToStep('payment');
  }, [completeStep, goToStep]);

  const handlePaymentNext = useCallback(() => {
    completeStep('payment');
    goToStep('signing');
  }, [completeStep, goToStep]);

  const handleSign = useCallback(async () => {
    if (!asset) return;

    setIsProcessing(true);
    try {
      // Need context for executing actions
      if (!context?.executeAction) {
        // Demo mode - simulate success
        completeStep('signing');
        setTransactionId('tx_demo_' + Date.now());
        goToStep('success');
        onSuccess?.({
          assetId: asset.id,
          amount: String(amount),
          transactionId: 'tx_demo_' + Date.now(),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await context.executeAction({
        action: 'issue',
        assetId: asset.id,
        actorId: user?.id || '',
        params: { amount: String(amount) },
      });

      if (result.success) {
        completeStep('signing');
        setTransactionId(result.transactionId || 'tx_' + Date.now());
        goToStep('success');
        onSuccess?.({
          assetId: asset.id,
          amount: String(amount),
          transactionId: result.transactionId || '',
          timestamp: new Date().toISOString(),
        });
      } else {
        throw new Error(result.message || 'Transaction failed');
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  }, [asset, amount, user, context, completeStep, goToStep, onSuccess, onError]);

  // Don't render if not open
  if (!isOpen) return null;

  // Loading state
  if (assetLoading || !asset) {
    return (
      <ModalWrapper onClose={onClose}>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      </ModalWrapper>
    );
  }

  const actualPrice = asset.currentPrice ? parseFloat(asset.currentPrice) : pricePerUnit;
  const totalCost = amount * actualPrice;

  return (
    <ModalWrapper onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Invest in Asset</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Progress */}
      {currentStep !== 'success' && (
        <ProgressIndicator
          steps={STEPS}
          currentStep={currentStep}
          completedSteps={completedSteps}
        />
      )}

      {/* Step Content */}
      {currentStep === 'quantity' && (
        <QuantityStep
          asset={asset}
          template={template}
          amount={amount}
          pricePerUnit={actualPrice}
          currency={currency}
          minAmount={minAmount}
          maxAmount={maxAmount}
          onChange={setAmount}
          onNext={handleQuantityNext}
        />
      )}

      {currentStep === 'compliance' && (
        <ComplianceStep
          asset={asset}
          policyResult={policyResult}
          isLoading={!policyResult}
          onBack={() => goToStep('quantity')}
          onNext={handleComplianceNext}
          onStartKYC={() => setShowKYC(true)}
        />
      )}

      {currentStep === 'payment' && (
        <PaymentStep
          amount={amount}
          pricePerUnit={actualPrice}
          currency={currency}
          onBack={() => goToStep('compliance')}
          onNext={handlePaymentNext}
        />
      )}

      {currentStep === 'signing' && (
        <SigningStep
          asset={asset}
          amount={amount}
          totalCost={totalCost}
          currency={currency}
          isProcessing={isProcessing}
          onBack={() => goToStep('payment')}
          onSign={handleSign}
        />
      )}

      {currentStep === 'success' && (
        <SuccessStep
          asset={asset}
          amount={amount}
          transactionId={transactionId}
          onClose={onClose}
          onViewAsset={() => {
            onClose();
            // Would navigate to asset detail
          }}
        />
      )}
    </ModalWrapper>
  );
}

// ============================================
// Modal Wrapper
// ============================================

interface ModalWrapperProps {
  children: React.ReactNode;
  onClose: () => void;
}

function ModalWrapper({ children, onClose }: ModalWrapperProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-gray-900 rounded-2xl border border-white/10 shadow-2xl p-6">
        {children}
      </div>
    </div>
  );
}

export { ModalWrapper };
