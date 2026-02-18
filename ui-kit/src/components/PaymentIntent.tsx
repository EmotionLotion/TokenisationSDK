import React, { useState } from 'react';
import {
  CreditCard,
  Building,
  Landmark,
  Bitcoin,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

/**
 * Props for the PaymentIntent component
 */
export interface PaymentIntentProps {
  /** Payment amount to display */
  amount: string;
  /** Currency code (e.g. USD, EUR) */
  currency: string;
  /** Payment method */
  method?: 'card' | 'wire' | 'ach' | 'crypto';
  /** Current status of the payment intent */
  status: 'idle' | 'processing' | 'requires_action' | 'succeeded' | 'failed';
  /** Callback when the user initiates payment */
  onInitiate?: () => void;
  /** Callback when the user cancels */
  onCancel?: () => void;
  /** Error message to display when status is failed */
  error?: string;
  /** Custom class name */
  className?: string;
}

const METHOD_OPTIONS: { key: PaymentIntentProps['method']; label: string; icon: React.ReactNode }[] = [
  { key: 'card', label: 'Card', icon: <CreditCard className="w-4 h-4" /> },
  { key: 'wire', label: 'Wire', icon: <Building className="w-4 h-4" /> },
  { key: 'ach', label: 'ACH', icon: <Landmark className="w-4 h-4" /> },
  { key: 'crypto', label: 'Crypto', icon: <Bitcoin className="w-4 h-4" /> },
];

/**
 * Payment intent card with method selector and status-aware action button.
 *
 * @example
 * ```tsx
 * <PaymentIntent
 *   amount="1,250.00"
 *   currency="USD"
 *   method="card"
 *   status="idle"
 *   onInitiate={() => handlePay()}
 * />
 * ```
 */
export function PaymentIntent({
  amount,
  currency,
  method: controlledMethod,
  status,
  onInitiate,
  onCancel,
  error,
  className = '',
}: PaymentIntentProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentIntentProps['method']>(controlledMethod ?? 'card');
  const activeMethod = controlledMethod ?? selectedMethod;

  const isDisabled = status === 'processing' || status === 'succeeded';

  const renderButton = () => {
    switch (status) {
      case 'processing':
        return (
          <button disabled className="w-full py-3 bg-white/10 text-white font-semibold rounded-xl flex items-center justify-center gap-2 opacity-70 cursor-not-allowed">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </button>
        );
      case 'requires_action':
        return (
          <button onClick={onInitiate} className="w-full py-3 bg-amber-500 text-black font-semibold rounded-xl hover:bg-amber-400 transition-colors flex items-center justify-center gap-2">
            <ArrowRight className="w-4 h-4" />
            Complete Action
          </button>
        );
      case 'succeeded':
        return (
          <button disabled className="w-full py-3 bg-green-500/20 text-green-400 font-semibold rounded-xl flex items-center justify-center gap-2 cursor-not-allowed">
            <CheckCircle className="w-4 h-4" />
            Payment Succeeded
          </button>
        );
      case 'failed':
        return (
          <button onClick={onInitiate} className="w-full py-3 bg-red-500/20 text-red-400 font-semibold rounded-xl hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2">
            Retry Payment
          </button>
        );
      default:
        return (
          <button onClick={onInitiate} className="w-full py-3 bg-[#F8B032] text-black font-semibold rounded-xl hover:bg-[#E8A633] transition-colors flex items-center justify-center gap-2">
            Pay {currency} {amount}
          </button>
        );
    }
  };

  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden ${className}`} role="region" aria-label="Payment Intent">
      {/* Amount Display */}
      <div className="p-6 border-b border-white/5 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Amount</p>
        <p className="text-3xl font-bold text-white">
          {currency} {amount}
        </p>
      </div>

      {/* Method Selector */}
      <div className="p-4 border-b border-white/5">
        <p className="text-xs text-gray-500 mb-2">Payment Method</p>
        <div className="grid grid-cols-4 gap-2">
          {METHOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => !isDisabled && setSelectedMethod(opt.key)}
              disabled={isDisabled}
              className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs transition-colors ${
                activeMethod === opt.key
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              aria-pressed={activeMethod === opt.key}
              aria-label={opt.label}
            >
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Action */}
      <div className="p-4 space-y-3">
        {renderButton()}

        {status === 'failed' && error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg" role="alert">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {onCancel && status !== 'succeeded' && (
          <button onClick={onCancel} className="w-full py-2 text-gray-400 text-sm hover:text-white transition-colors">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
