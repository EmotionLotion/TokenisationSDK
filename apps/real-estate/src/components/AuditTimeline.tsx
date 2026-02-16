import { useCallback } from 'react';
import { Clock, CheckCircle, Shield, ArrowRight } from 'lucide-react';
import { useAuditLog } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../hooks/useSDKWithFallback';

interface AuditTimelineProps {
  propertyId: string;
}

interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: string;
  category: 'creation' | 'compliance' | 'token' | 'transfer' | 'distribution' | 'governance';
  txHash?: string;
}

const MOCK_EVENTS: AuditEvent[] = [
  {
    id: 'evt-001',
    timestamp: '2024-01-05T09:00:00Z',
    actor: 'AHOY Capital PJSC',
    action: 'Asset Created',
    details: 'Property record initialized in the tokenization platform. SPV structure registered with ADGM.',
    category: 'creation',
  },
  {
    id: 'evt-002',
    timestamp: '2024-01-08T14:30:00Z',
    actor: 'KPMG Lower Gulf',
    action: 'Valuation Completed',
    details: 'Independent RICS valuation submitted and approved. Valuation report hash stored on-chain.',
    category: 'compliance',
    txHash: '0x1a2b3c...def456',
  },
  {
    id: 'evt-003',
    timestamp: '2024-01-12T11:15:00Z',
    actor: 'Al Tamimi & Company',
    action: 'Legal Review Approved',
    details: 'SPV Memorandum of Association, subscription agreements, and token T&Cs reviewed and signed.',
    category: 'compliance',
  },
  {
    id: 'evt-004',
    timestamp: '2024-01-15T16:00:00Z',
    actor: 'Securities & Commodities Authority',
    action: 'Regulatory Approval Granted',
    details: 'SCA prospectus approval received. Security token offering authorized under UAE federal law.',
    category: 'compliance',
    txHash: '0x4d5e6f...abc789',
  },
  {
    id: 'evt-005',
    timestamp: '2024-01-20T10:00:00Z',
    actor: 'AHOY Tokenisation Platform',
    action: 'Smart Contract Deployed',
    details: 'ERC-3643 compliant token contract deployed to Ethereum mainnet. CertiK audit passed.',
    category: 'token',
    txHash: '0x7a8b9c...012def',
  },
  {
    id: 'evt-006',
    timestamp: '2024-01-20T10:05:00Z',
    actor: 'AHOY Tokenisation Platform',
    action: 'Tokens Minted',
    details: 'Initial token supply minted and allocated to issuer custody wallet. Whitelist registry initialized.',
    category: 'token',
    txHash: '0xd0e1f2...345abc',
  },
  {
    id: 'evt-007',
    timestamp: '2024-01-25T09:30:00Z',
    actor: 'Emirates NBD Custody',
    action: 'KYC Batch Verified',
    details: '15 institutional investors passed KYC/AML verification. Wallets added to compliance whitelist.',
    category: 'compliance',
    txHash: '0x3a4b5c...678def',
  },
  {
    id: 'evt-008',
    timestamp: '2024-02-01T14:00:00Z',
    actor: 'AHOY Tokenisation Platform',
    action: 'Primary Distribution Executed',
    details: 'Tokens transferred to 12 verified investors. Total raised: AED 192.5M (50% of issuance).',
    category: 'transfer',
    txHash: '0x6d7e8f...901abc',
  },
  {
    id: 'evt-009',
    timestamp: '2024-02-10T11:00:00Z',
    actor: 'Gulf Investment Fund',
    action: 'Secondary Transfer',
    details: '25,000 tokens transferred peer-to-peer. Compliance checks passed. 1.5% royalty collected.',
    category: 'transfer',
    txHash: '0x9a0b1c...234def',
  },
  {
    id: 'evt-010',
    timestamp: '2024-03-31T16:00:00Z',
    actor: 'AHOY Capital PJSC',
    action: 'Q1 Dividend Distributed',
    details: 'Quarterly rental income distributed. AED 0.57 per token. Total distribution: AED 5.7M.',
    category: 'distribution',
    txHash: '0xc2d3e4...567abc',
  },
];

/** Map an SDK action string to one of our local category values */
function inferCategory(action: string): AuditEvent['category'] {
  const lower = action.toLowerCase();
  if (lower.includes('creat') || lower.includes('init')) return 'creation';
  if (lower.includes('compli') || lower.includes('kyc') || lower.includes('verif') || lower.includes('regulat') || lower.includes('legal') || lower.includes('valuat')) return 'compliance';
  if (lower.includes('mint') || lower.includes('deploy') || lower.includes('token') || lower.includes('contract')) return 'token';
  if (lower.includes('transfer') || lower.includes('secondary')) return 'transfer';
  if (lower.includes('distribut') || lower.includes('dividend') || lower.includes('payout')) return 'distribution';
  if (lower.includes('govern') || lower.includes('vote') || lower.includes('proposal')) return 'governance';
  return 'token';
}

function getCategoryIcon(category: AuditEvent['category']) {
  switch (category) {
    case 'creation':
      return <CheckCircle className="w-4 h-4" />;
    case 'compliance':
      return <Shield className="w-4 h-4" />;
    case 'token':
      return <Clock className="w-4 h-4" />;
    case 'transfer':
      return <ArrowRight className="w-4 h-4" />;
    case 'distribution':
      return <CheckCircle className="w-4 h-4" />;
    case 'governance':
      return <Shield className="w-4 h-4" />;
  }
}

function getCategoryColor(category: AuditEvent['category']) {
  switch (category) {
    case 'creation':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'compliance':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'token':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'transfer':
      return 'bg-[#F8B032]/20 text-[#F8B032] border-[#F8B032]/30';
    case 'distribution':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'governance':
      return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
  }
}

function getCategoryLineColor(category: AuditEvent['category']) {
  switch (category) {
    case 'creation':
      return 'bg-blue-500/40';
    case 'compliance':
      return 'bg-green-500/40';
    case 'token':
      return 'bg-purple-500/40';
    case 'transfer':
      return 'bg-[#F8B032]/40';
    case 'distribution':
      return 'bg-emerald-500/40';
    case 'governance':
      return 'bg-indigo-500/40';
  }
}

function formatTimestamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function AuditTimeline({ propertyId }: AuditTimelineProps) {
  const auditLog = useAuditLog({ resourceId: propertyId });

  const sdkCall = useCallback(async () => {
    const { entries } = auditLog;
    if (!entries || entries.length === 0) return null;
    return entries.map((entry): AuditEvent => ({
      id: entry.id,
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date(entry.timestamp).toISOString(),
      actor: entry.actorId ?? 'Unknown',
      action: entry.action,
      details: (entry.metadata as Record<string, unknown>)?.details as string ?? entry.action,
      category: inferCategory(entry.action),
      txHash: (entry.metadata as Record<string, unknown>)?.txHash as string | undefined,
    }));
  }, [auditLog]);

  const { data: events } = useSDKWithFallback<AuditEvent[]>(
    sdkCall,
    MOCK_EVENTS,
    [sdkCall],
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#F8B032]/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-[#F8B032]" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Audit Trail</h3>
              <p className="text-gray-400 text-xs">{events.length} events recorded</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-xs font-medium">Immutable Record</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-6">
        <div className="relative">
          {events.map((event, index) => {
            const { date, time } = formatTimestamp(event.timestamp);
            const isLast = index === events.length - 1;
            const colorClasses = getCategoryColor(event.category);
            const lineColor = getCategoryLineColor(event.category);

            return (
              <div key={event.id} className="relative flex gap-4 pb-6">
                {/* Timeline Line */}
                {!isLast && (
                  <div
                    className={`absolute left-[17px] top-9 bottom-0 w-[2px] ${lineColor}`}
                  />
                )}

                {/* Icon */}
                <div
                  className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 ${colorClasses}`}
                >
                  {getCategoryIcon(event.category)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-white text-sm font-semibold">{event.action}</h4>
                    <div className="text-right flex-shrink-0">
                      <p className="text-gray-400 text-xs">{date}</p>
                      <p className="text-gray-500 text-[10px]">{time}</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs mb-1">by {event.actor}</p>
                  <p className="text-gray-300 text-xs leading-relaxed">{event.details}</p>
                  {event.txHash && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10">
                      <span className="text-gray-500 text-[10px]">TX:</span>
                      <span className="text-[#F8B032] text-[10px] font-mono">{event.txHash}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02]">
        <p className="text-gray-500 text-xs text-center">
          All events are cryptographically signed and stored on-chain for immutable auditability.
        </p>
      </div>
    </div>
  );
}
