import React from 'react';
import { CheckCircle2, XCircle, ArrowRight, CreditCard, Clock, AlertCircle } from 'lucide-react';

export interface RefundEligibilityProps {
  eligible: boolean;
  reason?: string;
  refundAmount?: string;
  currency?: string;
  originalAmount?: string;
  refundPercentage?: number;
  method?: string;
  estimatedTime?: string;
  onRequestRefund?: () => void;
  className?: string;
}

export function RefundEligibility({
  eligible,
  reason,
  refundAmount,
  currency = 'USD',
  originalAmount,
  refundPercentage,
  method,
  estimatedTime,
  onRequestRefund,
  className = '',
}: RefundEligibilityProps) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Eligibility Status */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          {eligible ? (
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-6 h-6 text-red-400" />
            </div>
          )}
          <div>
            <h3 className={`text-lg font-semibold ${eligible ? 'text-green-400' : 'text-red-400'}`}>
              {eligible ? 'Refund Eligible' : 'Not Eligible'}
            </h3>
            <p className="text-xs text-gray-500">Refund Assessment</p>
          </div>
        </div>
      </div>

      {eligible ? (
        <>
          {/* Breakdown */}
          {(originalAmount || refundAmount) && (
            <div className="px-5 py-4 border-b border-white/5">
              <div className="flex items-center justify-center gap-3">
                {originalAmount && (
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Original</p>
                    <p className="text-sm text-gray-400">{currency} {originalAmount}</p>
                  </div>
                )}
                {originalAmount && refundAmount && (
                  <ArrowRight className="w-4 h-4 text-gray-500 mt-3" />
                )}
                {refundAmount && (
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Refund</p>
                    <p className="text-base font-semibold text-green-400">{currency} {refundAmount}</p>
                  </div>
                )}
                {refundPercentage !== undefined && (
                  <span className="mt-3 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
                    {refundPercentage}%
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="px-5 py-3 space-y-2 border-b border-white/5">
            {method && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  Payment Method
                </span>
                <span className="text-gray-300">{method}</span>
              </div>
            )}
            {estimatedTime && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Estimated Processing
                </span>
                <span className="text-gray-300">{estimatedTime}</span>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="px-5 py-3">
            <button
              onClick={onRequestRefund}
              className="w-full py-2 rounded-lg text-sm font-medium bg-green-500 hover:bg-green-600 text-white transition-colors cursor-pointer"
            >
              Request Refund
            </button>
          </div>
        </>
      ) : (
        /* Not Eligible Reason */
        <div className="px-5 py-4">
          <div className="flex items-start gap-2 text-sm text-gray-400">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p>{reason || 'This ticket is not eligible for a refund based on the current fare rules.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
