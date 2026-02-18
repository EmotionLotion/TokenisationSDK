'use client';

import React from 'react';
import { ShieldOff, Globe, AlertTriangle, ExternalLink } from 'lucide-react';

// ---------------------------------------------------------------------------
// Country code to name mapping
// ---------------------------------------------------------------------------

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  CN: 'China',
  RU: 'Russia',
  KP: 'North Korea',
  IR: 'Iran',
  CU: 'Cuba',
  SY: 'Syria',
  DE: 'Germany',
  FR: 'France',
  JP: 'Japan',
  KR: 'South Korea',
  IN: 'India',
  BR: 'Brazil',
  AE: 'United Arab Emirates',
  SG: 'Singapore',
  HK: 'Hong Kong',
  AU: 'Australia',
  CA: 'Canada',
  CH: 'Switzerland',
  NL: 'Netherlands',
  SE: 'Sweden',
  VE: 'Venezuela',
  MM: 'Myanmar',
  BY: 'Belarus',
  ZW: 'Zimbabwe',
  SD: 'Sudan',
  SO: 'Somalia',
  YE: 'Yemen',
  LB: 'Lebanon',
};

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] || code.toUpperCase();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Props for the JurisdictionGate component. */
export interface JurisdictionGateProps {
  /** ISO country code of the user's jurisdiction. */
  userJurisdiction: string;
  /** ISO country codes that are blocked (blacklist mode). */
  blockedJurisdictions: string[];
  /** If provided, only these jurisdictions are allowed (whitelist mode). */
  allowedJurisdictions?: string[];
  /** Optional display name of the asset being gated. */
  assetName?: string;
  /** Content to render when the user is NOT blocked. */
  children: React.ReactNode;
  /** Callback when the user clicks the contact/appeal button. */
  onBlockedAction?: () => void;
  /** Optional additional CSS class name. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JurisdictionGate({
  userJurisdiction,
  blockedJurisdictions,
  allowedJurisdictions,
  assetName,
  children,
  onBlockedAction,
  className = '',
}: JurisdictionGateProps) {
  const normalised = userJurisdiction.toUpperCase();

  const isBlocked = allowedJurisdictions
    ? !allowedJurisdictions.map((j) => j.toUpperCase()).includes(normalised)
    : blockedJurisdictions.map((j) => j.toUpperCase()).includes(normalised);

  if (!isBlocked) {
    return <>{children}</>;
  }

  const countryName = getCountryName(normalised);

  return (
    <div
      className={`relative flex min-h-[400px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 p-8 ${className}`}
    >
      <div className="flex max-w-md flex-col items-center text-center">
        {/* Icon */}
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <ShieldOff className="h-8 w-8 text-red-400" />
        </div>

        {/* Heading */}
        <h2 className="text-xl font-semibold text-white">Access Restricted</h2>

        {/* Primary message */}
        <p className="mt-2 text-sm text-white/60">
          This asset is not available in your jurisdiction ({countryName}).
        </p>

        {/* Asset-specific message */}
        {assetName && (
          <p className="mt-1 text-sm text-white/60">
            Access to {assetName} is restricted in {countryName} due to
            regulatory requirements.
          </p>
        )}

        {/* Regulatory info section */}
        <div className="mt-6 w-full rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
            <div className="min-w-0 text-left">
              <p className="text-sm font-medium text-white">
                Regulatory Restriction
              </p>
              <p className="mt-1 text-xs text-white/60">
                Securities and digital asset regulations in {countryName} prevent
                access to this offering. This restriction is enforced to comply
                with local laws and protect investors.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
            <Globe className="h-3 w-3 flex-shrink-0" />
            <span>Jurisdiction: {countryName} ({normalised})</span>
          </div>
        </div>

        {/* Contact support button */}
        {onBlockedAction && (
          <button
            type="button"
            onClick={onBlockedAction}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Contact Support
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Footer text */}
        <p className="mt-4 text-xs text-white/40">
          If you believe this is an error, please contact our compliance team.
        </p>
      </div>
    </div>
  );
}
