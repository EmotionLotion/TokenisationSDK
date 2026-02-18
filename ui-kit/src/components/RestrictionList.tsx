import React from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

export interface Restriction {
  code: string;
  title: string;
  severity: 'error' | 'warning' | 'info';
}

export interface RestrictionListProps {
  restrictions: Restriction[];
  className?: string;
}

const SEVERITY_CONFIG: Record<
  Restriction['severity'],
  { icon: React.ElementType; color: string; bullet: string }
> = {
  error: { icon: AlertCircle, color: 'text-red-400', bullet: 'bg-red-400' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bullet: 'bg-amber-400' },
  info: { icon: Info, color: 'text-blue-400', bullet: 'bg-blue-400' },
};

export function RestrictionList({ restrictions, className = '' }: RestrictionListProps) {
  if (restrictions.length === 0) {
    return (
      <div className={`rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-500 text-center ${className}`}>
        No restrictions
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-white/10 bg-white/5 overflow-hidden ${className}`}>
      <ul className="divide-y divide-white/5">
        {restrictions.map((r, i) => {
          const cfg = SEVERITY_CONFIG[r.severity];
          return (
            <li key={r.code || i} className="px-4 py-3 flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.bullet}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-200">{r.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{r.code}</p>
              </div>
              <span className={`text-xs font-medium ${cfg.color}`}>
                {r.severity.charAt(0).toUpperCase() + r.severity.slice(1)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
