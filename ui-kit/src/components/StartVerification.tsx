import React from 'react';
import { Shield, Loader2, ExternalLink } from 'lucide-react';

export interface StartVerificationProps {
  onStart: () => void;
  provider?: string;
  status?: 'idle' | 'loading' | 'redirecting';
  className?: string;
}

export function StartVerification({
  onStart,
  provider,
  status = 'idle',
  className = '',
}: StartVerificationProps) {
  const isDisabled = status !== 'idle';

  return (
    <div
      className={`bg-white/5 border border-white/10 rounded-xl p-6 ${className}`}
      role="region"
      aria-label="Identity verification"
    >
      <div className="flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
          <Shield className="w-6 h-6 text-blue-400" aria-hidden="true" />
        </div>

        <h3 className="text-lg font-semibold text-white">Verify Your Identity</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-xs">
          Complete identity verification to unlock all features
        </p>

        {provider && (
          <span className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5">
            via {provider}
          </span>
        )}

        <button
          onClick={onStart}
          disabled={isDisabled}
          className={`mt-5 w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg transition-colors ${
            isDisabled
              ? 'bg-blue-500/20 text-blue-300/60 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {status === 'idle' && (
            <>
              <Shield className="w-4 h-4" aria-hidden="true" />
              Start Verification
            </>
          )}
          {status === 'loading' && (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Preparing...
            </>
          )}
          {status === 'redirecting' && (
            <>
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              Redirecting...
            </>
          )}
        </button>
      </div>
    </div>
  );
}
