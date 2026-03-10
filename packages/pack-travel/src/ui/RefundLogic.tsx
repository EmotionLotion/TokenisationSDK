/**
 * RefundLogic — Blueprint component extracted from airline showcase steps 13-15.
 *
 * Handles refund computation, insurance claims, and settlement flow.
 */

import { useState } from 'react';
import { DollarSign, Shield, CheckCircle, Loader2 } from 'lucide-react';

export interface RefundOption {
  type: 'voucher' | 'partial_refund' | 'full_refund';
  label: string;
  amount: number;
  currency: string;
  description: string;
}

export interface InsuranceClaim {
  eligible: boolean;
  premium: number;
  maxPayout: number;
  claimAmount: number;
  status: 'pending' | 'approved' | 'denied';
}

export interface RefundLogicProps {
  assetId: string;
  assetName?: string;
  party: { id: string; name: string };
  delayMinutes?: number;
  onRefund: (assetId: string, partyId: string, option: RefundOption) => Promise<{ success: boolean; settlementId?: string; error?: string }>;
  refundPolicy?: {
    cancellation: { fullRefund: boolean; deadline: number };
    delay: Record<string, unknown>;
    insurance: { premium: number; maxPayout: number };
  };
}

type RefundPhase = 'idle' | 'computing' | 'options' | 'claiming' | 'settling' | 'complete';

export function RefundLogic({
  assetId,
  assetName,
  party,
  delayMinutes = 0,
  onRefund,
  refundPolicy,
}: RefundLogicProps) {
  const [phase, setPhase] = useState<RefundPhase>('idle');
  const [options, setOptions] = useState<RefundOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<RefundOption | null>(null);
  const [insurance, setInsurance] = useState<InsuranceClaim | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);

  const computeRefundOptions = () => {
    setPhase('computing');
    setTimeout(() => {
      const computed: RefundOption[] = [];
      if (delayMinutes >= 60) {
        computed.push({ type: 'voucher', label: 'Travel Voucher', amount: 50, currency: 'USD', description: '$50 voucher for next booking' });
      }
      if (delayMinutes >= 120) {
        computed.push({ type: 'partial_refund', label: 'Partial Refund', amount: 425, currency: 'USD', description: '50% cash refund' });
      }
      if (delayMinutes >= 240) {
        computed.push({ type: 'full_refund', label: 'Full Refund', amount: 850, currency: 'USD', description: 'Complete ticket refund' });
      }
      if (computed.length === 0) {
        computed.push({ type: 'voucher', label: 'Goodwill Voucher', amount: 25, currency: 'USD', description: 'Courtesy voucher' });
      }
      setOptions(computed);
      setPhase('options');

      // Compute insurance eligibility
      if (refundPolicy?.insurance) {
        const claimAmount = Math.min(delayMinutes >= 240 ? 500 : delayMinutes >= 120 ? 250 : 0, refundPolicy.insurance.maxPayout);
        setInsurance({
          eligible: claimAmount > 0,
          premium: refundPolicy.insurance.premium,
          maxPayout: refundPolicy.insurance.maxPayout,
          claimAmount,
          status: claimAmount > 0 ? 'approved' : 'denied',
        });
      }
    }, 600);
  };

  const selectAndSettle = async (option: RefundOption) => {
    setSelectedOption(option);
    setPhase('settling');
    try {
      const result = await onRefund(assetId, party.id, option);
      if (result.success) {
        setSettlementId(result.settlementId || 'STL-' + Date.now());
        setPhase('complete');
      } else {
        setPhase('options');
      }
    } catch {
      setPhase('options');
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white">Refund & Disruption</h3>
      {assetName && <p className="text-sm text-gray-400">{assetName}</p>}

      {/* Delay info */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Passenger</p>
          <p className="text-sm font-bold text-white">{party.name}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Delay</p>
          <p className={`text-sm font-bold ${delayMinutes >= 120 ? 'text-red-400' : delayMinutes >= 60 ? 'text-yellow-400' : 'text-green-400'}`}>
            {delayMinutes > 0 ? `${delayMinutes} min` : 'On Time'}
          </p>
        </div>
      </div>

      {/* Refund options */}
      {phase === 'options' && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-medium">Refund Options</p>
          {options.map(opt => (
            <button
              key={opt.type}
              onClick={() => selectAndSettle(opt)}
              className="w-full flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <DollarSign className="w-4 h-4 text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.description}</p>
                </div>
              </div>
              <span className="text-sm font-bold text-green-400">
                ${opt.amount}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Insurance claim */}
      {insurance && phase !== 'idle' && phase !== 'computing' && (
        <div className={`p-3 rounded-lg border ${insurance.eligible ? 'bg-sky-500/10 border-sky-500/20' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-medium text-sky-400">Insurance Claim</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {insurance.eligible ? `Approved — $${insurance.claimAmount} payout` : 'Not eligible for claim'}
            </span>
            <span className={`text-xs font-bold ${insurance.eligible ? 'text-green-400' : 'text-gray-500'}`}>
              {insurance.status.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* Settlement complete */}
      {phase === 'complete' && selectedOption && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-sm font-bold text-green-400">Settlement Complete</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Type:</span>{' '}
              <span className="text-white">{selectedOption.label}</span>
            </div>
            <div>
              <span className="text-gray-500">Amount:</span>{' '}
              <span className="text-green-400 font-bold">${selectedOption.amount}</span>
            </div>
            <div>
              <span className="text-gray-500">Settlement ID:</span>{' '}
              <span className="text-white font-mono">{settlementId}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {phase === 'idle' && (
          <button
            onClick={computeRefundOptions}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm"
          >
            Compute Refund Options
          </button>
        )}
        {(phase === 'computing' || phase === 'settling') && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            {phase === 'computing' ? 'Computing options...' : 'Processing settlement...'}
          </div>
        )}
      </div>
    </div>
  );
}
