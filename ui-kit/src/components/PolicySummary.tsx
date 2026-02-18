import React from 'react';
import { Shield, ArrowRight, Clock, Users, Award, CheckCircle, XCircle, Globe } from 'lucide-react';

export interface Policy {
  name: string;
  type: 'compliance' | 'transfer' | 'lockup' | 'whitelist' | 'accreditation';
  enabled: boolean;
  description: string;
}

export interface PolicySummaryProps {
  policies: Policy[];
  jurisdiction?: string;
  lastUpdated?: string;
  className?: string;
}

const TYPE_ICON: Record<Policy['type'], React.ElementType> = {
  compliance: Shield,
  transfer: ArrowRight,
  lockup: Clock,
  whitelist: Users,
  accreditation: Award,
};

const TYPE_COLOR: Record<Policy['type'], string> = {
  compliance: 'text-blue-400',
  transfer: 'text-violet-400',
  lockup: 'text-amber-400',
  whitelist: 'text-teal-400',
  accreditation: 'text-pink-400',
};

export function PolicySummary({
  policies,
  jurisdiction,
  lastUpdated,
  className = '',
}: PolicySummaryProps) {
  return (
    <div className={`rounded-lg border border-white/10 bg-white/5 overflow-hidden ${className}`}>
      {/* Header with jurisdiction */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-200">Policy Summary</span>
        {jurisdiction && (
          <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-400">
            <Globe className="w-3 h-3" />
            {jurisdiction}
          </span>
        )}
      </div>

      {/* Policies list */}
      <ul className="divide-y divide-white/5">
        {policies.map((policy, i) => {
          const Icon = TYPE_ICON[policy.type];
          const iconColor = TYPE_COLOR[policy.type];
          const StatusIcon = policy.enabled ? CheckCircle : XCircle;
          const statusColor = policy.enabled ? 'text-green-400' : 'text-slate-600';

          return (
            <li key={i} className="px-4 py-3 flex items-start gap-3">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-200">{policy.name}</p>
                  <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${statusColor}`} />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{policy.description}</p>
              </div>
              <span className={`text-xs flex-shrink-0 ${policy.enabled ? 'text-green-400' : 'text-slate-600'}`}>
                {policy.enabled ? 'Active' : 'Disabled'}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      {lastUpdated && (
        <div className="px-4 py-2 border-t border-white/5">
          <p className="text-xs text-slate-500">Last updated {lastUpdated}</p>
        </div>
      )}
    </div>
  );
}
