import React from 'react';
import { ShieldOff, ShieldAlert, ShieldCheck, Info, Clock, UserX, Lock, AlertTriangle, Ban } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single compliance restriction reason (matches server DecisionReason). */
export interface RestrictionReason {
  code: string;
  message: string;
  fields?: string[];
  ruleId?: string;
}

/** Props for the TransferRestrictionExplainer component. */
export interface TransferRestrictionExplainerProps {
  /** Overall result: 'allow', 'deny', or 'require_action'. */
  result: 'allow' | 'deny' | 'require_action';
  /** Array of restriction reasons from the compliance engine. */
  reasons: RestrictionReason[];
  /** Display mode. */
  mode?: 'inline' | 'card';
  /** Optional class name. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Friendly explanations keyed by compliance engine error codes
// ---------------------------------------------------------------------------

interface FriendlyExplanation {
  title: string;
  description: string;
  icon: React.ElementType;
  action?: string;
}

const CODE_MAP: Record<string, FriendlyExplanation> = {
  KYC_REQUIRED: {
    title: 'Identity verification required',
    description: 'Your identity must be verified before you can transfer tokens. Complete the KYC process to proceed.',
    icon: UserX,
    action: 'Complete KYC verification',
  },
  SANCTIONS_BLOCKED: {
    title: 'Sanctions restriction',
    description: 'This transfer cannot proceed due to sanctions screening results. Contact support for assistance.',
    icon: Ban,
  },
  TOKEN_NOT_ACTIVE: {
    title: 'Token not active',
    description: 'This token is not in an active state. Transfers are only permitted for active tokens.',
    icon: Lock,
  },
  DLD_DISPUTE: {
    title: 'Asset under dispute',
    description: 'This asset is currently flagged as under dispute at the Dubai Land Department. Transfers are paused until the dispute is resolved.',
    icon: AlertTriangle,
  },
  DLD_LIEN: {
    title: 'Lien on asset',
    description: 'A lien is registered against this asset at the Dubai Land Department. The lien must be released before transfers can proceed.',
    icon: Lock,
  },
  DLD_TRANSFER_LOCKED: {
    title: 'Transfer locked',
    description: 'Transfers for this asset have been locked at the Dubai Land Department. Contact the issuer for more information.',
    icon: Lock,
  },
  LOCKUP_PERIOD_ACTIVE: {
    title: 'Lockup period active',
    description: 'Your tokens are still within the mandatory lockup period and cannot be transferred yet. Please wait until the lockup period has elapsed.',
    icon: Clock,
    action: 'Wait for lockup to expire',
  },
  SENDER_NOT_WHITELISTED: {
    title: 'Sender not whitelisted',
    description: 'Your wallet address is not on the transfer whitelist for this token. Contact the issuer to request whitelist approval.',
    icon: UserX,
    action: 'Request whitelist approval',
  },
  RECIPIENT_NOT_WHITELISTED: {
    title: 'Recipient not whitelisted',
    description: 'The recipient wallet address is not on the transfer whitelist. The recipient must be whitelisted before they can receive tokens.',
    icon: UserX,
    action: 'Have recipient request whitelist approval',
  },
  ACCREDITATION_REQUIRED: {
    title: 'Accreditation required',
    description: 'This transfer requires accredited investor status. Submit your accreditation documentation to proceed.',
    icon: ShieldAlert,
    action: 'Submit accreditation',
  },
  PRICE_CAP_EXCEEDED: {
    title: 'Price cap exceeded',
    description: 'The transfer price exceeds the maximum allowed markup for this token. Anti-scalping rules limit the resale price.',
    icon: AlertTriangle,
  },
  MAX_TRANSFERS_REACHED: {
    title: 'Maximum transfers reached',
    description: 'This token has reached its maximum number of allowed transfers and can no longer be transferred.',
    icon: Ban,
  },
  CHECKIN_LOCKED: {
    title: 'Check-in locked',
    description: 'This ticket has already been checked in and cannot be transferred.',
    icon: Lock,
  },
  DEPARTURE_CUTOFF: {
    title: 'Too close to departure',
    description: 'Transfers are not permitted within 24 hours of departure. The transfer window has closed.',
    icon: Clock,
  },
};

function getFriendlyExplanation(reason: RestrictionReason): FriendlyExplanation {
  if (reason.code && CODE_MAP[reason.code]) {
    return CODE_MAP[reason.code];
  }
  // Fallback for unknown codes
  return {
    title: 'Transfer restricted',
    description: reason.message || `Compliance check failed (${reason.code || 'unknown'}).`,
    icon: ShieldAlert,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransferRestrictionExplainer({
  result,
  reasons,
  mode = 'card',
  className = '',
}: TransferRestrictionExplainerProps) {
  if (result === 'allow' && reasons.length === 0) {
    if (mode === 'inline') {
      return (
        <div className={`flex items-center gap-1.5 text-sm text-green-400 ${className}`}>
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
          <span>Transfer permitted</span>
        </div>
      );
    }
    return (
      <div className={`rounded-lg border border-green-800/50 bg-green-900/20 p-3 text-sm ${className}`}>
        <div className="flex items-center gap-2 text-green-400">
          <ShieldCheck className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium">Transfer permitted</span>
        </div>
        <p className="mt-1 text-green-300/70 ml-7">
          All compliance checks passed. You may proceed with this transfer.
        </p>
      </div>
    );
  }

  const isDeny = result === 'deny';
  const borderColor = isDeny ? 'border-red-800/50' : 'border-amber-800/50';
  const bgColor = isDeny ? 'bg-red-900/20' : 'bg-amber-900/20';
  const headerColor = isDeny ? 'text-red-400' : 'text-amber-400';
  const HeaderIcon = isDeny ? ShieldOff : ShieldAlert;
  const headerText = isDeny ? 'Transfer blocked' : 'Action required';

  if (mode === 'inline') {
    return (
      <div className={`space-y-1 ${className}`}>
        <div className={`flex items-center gap-1.5 text-sm ${headerColor}`}>
          <HeaderIcon className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{headerText}</span>
          <span className="text-slate-500">({reasons.length} {reasons.length === 1 ? 'issue' : 'issues'})</span>
        </div>
        <ul className="ml-5 space-y-0.5">
          {reasons.map((reason, i) => {
            const friendly = getFriendlyExplanation(reason);
            return (
              <li key={reason.code || i} className="text-sm text-slate-300">
                {friendly.title}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // Card mode
  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-4 text-sm ${className}`}>
      <div className={`flex items-center gap-2 ${headerColor} mb-3`}>
        <HeaderIcon className="w-5 h-5 flex-shrink-0" />
        <span className="font-medium text-base">{headerText}</span>
      </div>

      <div className="space-y-3">
        {reasons.map((reason, i) => {
          const friendly = getFriendlyExplanation(reason);
          const Icon = friendly.icon;

          return (
            <div key={reason.code || i} className="flex gap-3 ml-1">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isDeny ? 'text-red-400/70' : 'text-amber-400/70'}`} />
              <div className="min-w-0">
                <p className="text-slate-200 font-medium">{friendly.title}</p>
                <p className="text-slate-400 mt-0.5">{friendly.description}</p>
                {friendly.action && (
                  <p className={`mt-1 text-xs ${isDeny ? 'text-red-300/60' : 'text-amber-300/60'}`}>
                    <Info className="w-3 h-3 inline mr-1" />
                    {friendly.action}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
