import React from 'react';
import {
  Users,
  User,
  Building2,
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Globe,
} from 'lucide-react';

/**
 * A single investor record
 */
export interface InvestorRecord {
  id: string;
  name: string;
  type: 'individual' | 'institutional';
  status: 'pending' | 'active' | 'suspended' | 'blocked';
  kycStatus: 'not_started' | 'pending' | 'approved' | 'rejected' | 'expired';
  jurisdiction: string;
  balance?: string;
}

/**
 * Props for the InvestorList component
 */
export interface InvestorListProps {
  /** List of investor records to display */
  investors: InvestorRecord[];
  /** Callback when an investor is selected */
  onSelect?: (id: string) => void;
  /** Custom class name */
  className?: string;
}

const TYPE_CONFIG: Record<InvestorRecord['type'], { label: string; classes: string; icon: React.ReactNode }> = {
  individual: {
    label: 'Individual',
    classes: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: <User className="w-3 h-3" />,
  },
  institutional: {
    label: 'Institutional',
    classes: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    icon: <Building2 className="w-3 h-3" />,
  },
};

const STATUS_CONFIG: Record<InvestorRecord['status'], { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  active: { label: 'Active', classes: 'bg-green-500/20 text-green-400 border-green-500/30' },
  suspended: { label: 'Suspended', classes: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  blocked: { label: 'Blocked', classes: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const KYC_CONFIG: Record<InvestorRecord['kycStatus'], { label: string; classes: string; icon: React.ReactNode }> = {
  not_started: {
    label: 'Not Started',
    classes: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    icon: <Clock className="w-3 h-3" />,
  },
  pending: {
    label: 'Pending',
    classes: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: <Shield className="w-3 h-3" />,
  },
  approved: {
    label: 'Approved',
    classes: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: <CheckCircle className="w-3 h-3" />,
  },
  rejected: {
    label: 'Rejected',
    classes: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: <XCircle className="w-3 h-3" />,
  },
  expired: {
    label: 'Expired',
    classes: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
};

/**
 * Table-style list of investors with type, status, KYC, and jurisdiction badges.
 *
 * @example
 * ```tsx
 * <InvestorList
 *   investors={investors}
 *   onSelect={(id) => navigate(`/investors/${id}`)}
 * />
 * ```
 */
export function InvestorList({ investors, onSelect, className = '' }: InvestorListProps) {
  if (investors.length === 0) {
    return (
      <div className={`text-center p-8 ${className}`} role="status">
        <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" aria-hidden="true" />
        <p className="text-gray-400">No investors found</p>
      </div>
    );
  }

  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden ${className}`} role="region" aria-label="Investor List">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-2">
        <Users className="w-5 h-5 text-[#F8B032]" aria-hidden="true" />
        <h3 className="font-semibold text-white">Investors</h3>
        <span className="text-xs text-gray-500 ml-auto">{investors.length} total</span>
      </div>

      {/* Investor Rows */}
      <div className="divide-y divide-white/5" role="list">
        {investors.map((investor) => {
          const typeConfig = TYPE_CONFIG[investor.type];
          const statusConfig = STATUS_CONFIG[investor.status];
          const kycConfig = KYC_CONFIG[investor.kycStatus];

          return (
            <div
              key={investor.id}
              role="listitem"
              tabIndex={onSelect ? 0 : undefined}
              className={`p-4 hover:bg-white/5 transition-colors ${onSelect ? 'cursor-pointer' : ''}`}
              onClick={() => onSelect?.(investor.id)}
              onKeyDown={(e) => {
                if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelect(investor.id);
                }
              }}
              aria-label={`${investor.name}, ${investor.type}, status: ${investor.status}, KYC: ${investor.kycStatus}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                    {investor.type === 'institutional' ? (
                      <Building2 className="w-4 h-4 text-purple-400" />
                    ) : (
                      <User className="w-4 h-4 text-blue-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{investor.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Globe className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      <span className="text-xs text-gray-500">{investor.jurisdiction}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {investor.balance && (
                    <span className="text-xs font-mono text-gray-400 hidden sm:inline">
                      {Number(investor.balance).toLocaleString()}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${typeConfig.classes}`}>
                    {typeConfig.icon}
                    {typeConfig.label}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusConfig.classes}`}>
                    {statusConfig.label}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${kycConfig.classes}`}>
                    {kycConfig.icon}
                    {kycConfig.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
