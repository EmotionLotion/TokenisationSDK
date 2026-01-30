/**
 * SecondaryTransfer — Blueprint component extracted from airline showcase steps 16-18.
 *
 * Handles the secondary market transfer flow: mint ticket for new holder,
 * run eligibility checks, and execute the transfer.
 */

import { useState } from 'react';
import { ArrowRight, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export interface TransferParty {
  id: string;
  name: string;
  kycVerified: boolean;
  jurisdiction?: string;
}

export interface SecondaryTransferProps {
  assetId: string;
  assetName?: string;
  fromParty: TransferParty;
  toParty: TransferParty;
  onTransfer: (assetId: string, fromId: string, toId: string) => Promise<{ success: boolean; error?: string }>;
  onEligibilityCheck?: (assetId: string, fromId: string, toId: string) => { eligible: boolean; checks: { name: string; passed: boolean; detail: string }[] };
}

type TransferPhase = 'idle' | 'checking' | 'eligible' | 'ineligible' | 'transferring' | 'complete' | 'failed';

export function SecondaryTransfer({
  assetId,
  assetName,
  fromParty,
  toParty,
  onTransfer,
  onEligibilityCheck,
}: SecondaryTransferProps) {
  const [phase, setPhase] = useState<TransferPhase>('idle');
  const [checks, setChecks] = useState<{ name: string; passed: boolean; detail: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runEligibilityCheck = () => {
    setPhase('checking');
    setError(null);

    setTimeout(() => {
      if (onEligibilityCheck) {
        const result = onEligibilityCheck(assetId, fromParty.id, toParty.id);
        setChecks(result.checks);
        setPhase(result.eligible ? 'eligible' : 'ineligible');
      } else {
        // Default checks
        const defaultChecks = [
          { name: 'KYC Verified (Buyer)', passed: toParty.kycVerified, detail: toParty.kycVerified ? 'VERIFIED' : 'NOT VERIFIED' },
          { name: 'KYC Verified (Seller)', passed: fromParty.kycVerified, detail: fromParty.kycVerified ? 'VERIFIED' : 'NOT VERIFIED' },
          { name: 'Jurisdiction', passed: true, detail: toParty.jurisdiction || 'ALLOWED' },
        ];
        setChecks(defaultChecks);
        setPhase(defaultChecks.every(c => c.passed) ? 'eligible' : 'ineligible');
      }
    }, 500);
  };

  const executeTransfer = async () => {
    setPhase('transferring');
    setError(null);
    try {
      const result = await onTransfer(assetId, fromParty.id, toParty.id);
      setPhase(result.success ? 'complete' : 'failed');
      if (!result.success) setError(result.error || 'Transfer failed');
    } catch (e) {
      setPhase('failed');
      setError(e instanceof Error ? e.message : 'Transfer failed');
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white">Secondary Transfer</h3>
      {assetName && <p className="text-sm text-gray-400">{assetName}</p>}

      {/* Transfer parties */}
      <div className="flex items-center gap-4">
        <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/10">
          <p className="text-xs text-gray-500 mb-1">From</p>
          <p className="text-sm font-bold text-white">{fromParty.name}</p>
          <p className={`text-xs mt-1 ${fromParty.kycVerified ? 'text-green-400' : 'text-red-400'}`}>
            {fromParty.kycVerified ? 'KYC Verified' : 'KYC Pending'}
          </p>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-500 shrink-0" />
        <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/10">
          <p className="text-xs text-gray-500 mb-1">To</p>
          <p className="text-sm font-bold text-white">{toParty.name}</p>
          <p className={`text-xs mt-1 ${toParty.kycVerified ? 'text-green-400' : 'text-red-400'}`}>
            {toParty.kycVerified ? 'KYC Verified' : 'KYC Pending'}
          </p>
        </div>
      </div>

      {/* Eligibility checks */}
      {checks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-medium">Compliance Checks</p>
          {checks.map(check => (
            <div key={check.name} className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg border border-white/5">
              <div className="flex items-center gap-2">
                {check.passed
                  ? <CheckCircle className="w-4 h-4 text-green-400" />
                  : <XCircle className="w-4 h-4 text-red-400" />
                }
                <span className="text-xs text-gray-300">{check.name}</span>
              </div>
              <span className={`text-xs font-bold ${check.passed ? 'text-green-400' : 'text-red-400'}`}>
                {check.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Status / Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          {error}
        </div>
      )}

      {phase === 'complete' && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 font-medium">
          Transfer completed successfully
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {(phase === 'idle' || phase === 'ineligible' || phase === 'failed') && (
          <button
            onClick={runEligibilityCheck}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm"
          >
            Check Eligibility
          </button>
        )}
        {phase === 'eligible' && (
          <button
            onClick={executeTransfer}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors text-sm"
          >
            Execute Transfer
          </button>
        )}
        {(phase === 'checking' || phase === 'transferring') && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            {phase === 'checking' ? 'Checking eligibility...' : 'Processing transfer...'}
          </div>
        )}
      </div>
    </div>
  );
}
