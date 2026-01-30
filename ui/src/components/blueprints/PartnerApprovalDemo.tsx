/**
 * PartnerApprovalDemo — Split-pane demo showing Admin approval flow
 * on the left and SDK ledger state on the right. Demonstrates
 * bidirectional communication between a partner admin UI and the SDK.
 */

import { useState, useEffect, useCallback } from 'react';
import { Shield, BookOpen, CheckCircle, XCircle, Clock, Users, ArrowRight, RefreshCw } from 'lucide-react';
import { useSDKStore } from '../../core/store';

// ============================================================================
// TYPES
// ============================================================================

interface PendingRequest {
  id: string;
  type: 'kyc' | 'transfer' | 'mint';
  party: string;
  partyAddress: string;
  detail: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'rejected';
}

// ============================================================================
// MOCK DATA
// ============================================================================

const INITIAL_REQUESTS: PendingRequest[] = [
  {
    id: 'req_001',
    type: 'kyc',
    party: 'Alice Chen',
    partyAddress: '0xA11ce...1234',
    detail: 'Standard KYC — Passport + Proof of Address submitted',
    timestamp: Date.now() - 120_000,
    status: 'pending',
  },
  {
    id: 'req_002',
    type: 'kyc',
    party: 'Bob Martinez',
    partyAddress: '0xB0b...5678',
    detail: 'Enhanced KYC — Corporate entity verification',
    timestamp: Date.now() - 60_000,
    status: 'pending',
  },
  {
    id: 'req_003',
    type: 'transfer',
    party: 'Charlie Park',
    partyAddress: '0xCha7...9abc',
    detail: 'Transfer 500 TKN to 0xD4v1d...def0 — requires compliance pre-check',
    timestamp: Date.now() - 30_000,
    status: 'pending',
  },
  {
    id: 'req_004',
    type: 'mint',
    party: 'Issuer Corp',
    partyAddress: '0x1ssu...er00',
    detail: 'Mint 10,000 TKN to treasury 0xTrea...sury — new issuance round',
    timestamp: Date.now() - 10_000,
    status: 'pending',
  },
];

// ============================================================================
// LEDGER EVENT
// ============================================================================

interface LedgerEvent {
  id: string;
  action: string;
  detail: string;
  timestamp: number;
  source: 'admin' | 'sdk';
}

// ============================================================================
// ADMIN PANEL (Left Pane)
// ============================================================================

function AdminPanel({
  requests,
  onApprove,
  onReject,
}: {
  requests: PendingRequest[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const pending = requests.filter(r => r.status === 'pending');
  const processed = requests.filter(r => r.status !== 'pending');

  const typeIcon = (type: PendingRequest['type']) => {
    switch (type) {
      case 'kyc': return <Shield className="w-3.5 h-3.5 text-blue-400" />;
      case 'transfer': return <ArrowRight className="w-3.5 h-3.5 text-green-400" />;
      case 'mint': return <RefreshCw className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  const typeLabel = (type: PendingRequest['type']) => {
    switch (type) {
      case 'kyc': return 'KYC Verification';
      case 'transfer': return 'Transfer Approval';
      case 'mint': return 'Mint Request';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/10 bg-amber-500/5 flex items-center gap-2">
        <Users className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-bold text-amber-400">Partner Admin</span>
        <span className="ml-auto text-[10px] text-gray-500">{pending.length} pending</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {pending.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-xs">
            All requests processed
          </div>
        )}

        {pending.map(req => (
          <div key={req.id} className="bg-white/[0.03] rounded-lg border border-white/10 p-3 space-y-2">
            <div className="flex items-center gap-2">
              {typeIcon(req.type)}
              <span className="text-xs font-bold text-white">{typeLabel(req.type)}</span>
              <span className="ml-auto text-[10px] text-gray-600 font-mono">{req.id}</span>
            </div>
            <div className="text-xs text-gray-400">
              <span className="text-white font-medium">{req.party}</span>
              <span className="text-gray-600 ml-1">({req.partyAddress})</span>
            </div>
            <p className="text-[11px] text-gray-500">{req.detail}</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onApprove(req.id)}
                className="flex-1 py-1.5 bg-green-500/20 text-green-400 rounded text-xs font-bold border border-green-500/30 hover:bg-green-500/30 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => onReject(req.id)}
                className="flex-1 py-1.5 bg-red-500/20 text-red-400 rounded text-xs font-bold border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        ))}

        {processed.length > 0 && (
          <>
            <div className="pt-2 pb-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-600 font-medium">Processed</span>
            </div>
            {processed.map(req => (
              <div key={req.id} className="bg-white/[0.02] rounded-lg border border-white/5 p-3 opacity-60">
                <div className="flex items-center gap-2">
                  {req.status === 'approved'
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                  <span className="text-xs text-gray-400">{req.party}</span>
                  <span className={`ml-auto text-[10px] font-bold ${req.status === 'approved' ? 'text-green-500' : 'text-red-500'}`}>
                    {req.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// LEDGER PANEL (Right Pane)
// ============================================================================

function LedgerPanel({ events }: { events: LedgerEvent[] }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/10 bg-blue-500/5 flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-bold text-blue-400">SDK Ledger</span>
        <span className="ml-auto text-[10px] text-gray-500">{events.length} events</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {events.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-xs">
            No ledger events yet — approve or reject requests
          </div>
        )}

        {events.map(evt => (
          <div
            key={evt.id}
            className="bg-white/[0.03] rounded-lg border border-white/5 px-3 py-2 animate-in slide-in-from-right duration-300"
          >
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${evt.source === 'admin' ? 'bg-amber-400' : 'bg-blue-400'}`} />
              <span className="text-xs font-bold text-white">{evt.action}</span>
              <span className="ml-auto text-[10px] text-gray-600 font-mono">
                {new Date(evt.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 pl-3.5">{evt.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PartnerApprovalDemo() {
  const [requests, setRequests] = useState<PendingRequest[]>(INITIAL_REQUESTS);
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([]);

  const store = useSDKStore;

  const addEvent = useCallback((action: string, detail: string, source: 'admin' | 'sdk') => {
    setLedgerEvents(prev => [
      { id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, action, detail, timestamp: Date.now(), source },
      ...prev,
    ]);
  }, []);

  const handleApprove = useCallback((id: string) => {
    const req = requests.find(r => r.id === id);
    if (!req) return;

    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' as const } : r));

    // Fire admin event
    addEvent(
      `${req.type.toUpperCase()} Approved`,
      `Admin approved ${req.type} for ${req.party}`,
      'admin',
    );

    // Simulate SDK-side reactions
    setTimeout(() => {
      switch (req.type) {
        case 'kyc': {
          // Call store's verifyKyc action
          try {
            store.getState().verifyKyc(req.party);
          } catch {
            // Store may not have party — still record event
          }
          addEvent(
            'KYC Verified',
            `${req.party} (${req.partyAddress}) identity verified — level: standard`,
            'sdk',
          );
          setTimeout(() => {
            addEvent(
              'Whitelist Updated',
              `${req.partyAddress} added to compliant investor whitelist`,
              'sdk',
            );
            try {
              store.getState().whitelist(req.partyAddress);
            } catch {
              // ok
            }
          }, 600);
          break;
        }
        case 'transfer': {
          addEvent(
            'Compliance Check',
            `Pre-transfer compliance evaluation for ${req.partyAddress} — ALLOW`,
            'sdk',
          );
          setTimeout(() => {
            addEvent(
              'Transfer Executed',
              `500 TKN transferred from ${req.partyAddress} — tx pending confirmation`,
              'sdk',
            );
          }, 800);
          break;
        }
        case 'mint': {
          addEvent(
            'Mint Executed',
            `10,000 TKN minted to treasury — supply updated`,
            'sdk',
          );
          setTimeout(() => {
            addEvent(
              'Supply Snapshot',
              `New total supply: 110,000 TKN — snapshot recorded`,
              'sdk',
            );
          }, 500);
          break;
        }
      }
    }, 400);
  }, [requests, addEvent, store]);

  const handleReject = useCallback((id: string) => {
    const req = requests.find(r => r.id === id);
    if (!req) return;

    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' as const } : r));

    addEvent(
      `${req.type.toUpperCase()} Rejected`,
      `Admin rejected ${req.type} for ${req.party}`,
      'admin',
    );

    setTimeout(() => {
      addEvent(
        'Request Closed',
        `${req.type} request ${req.id} closed — no state changes`,
        'sdk',
      );
    }, 300);
  }, [requests, addEvent]);

  // Record initial mount event
  useEffect(() => {
    addEvent('Demo Started', 'Partner Admin approval demo initialized — 4 pending requests loaded', 'sdk');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Partner Admin Demo</h1>
          <p className="text-sm text-gray-400">Approve KYC, transfers, and mints — see SDK ledger react in real-time</p>
        </div>
      </div>

      {/* Intro */}
      <div className="glass-card rounded-xl border border-white/10 p-4">
        <p className="text-sm text-gray-300">
          This demo shows <strong className="text-white">bidirectional communication</strong> between a partner admin UI and the SDK.
          Approve or reject requests on the left — the right panel shows how the SDK ledger reacts to each decision in real-time.
        </p>
      </div>

      {/* Split Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: '500px' }}>
        {/* Left: Admin View */}
        <div className="glass-card rounded-xl border border-amber-500/20 overflow-hidden flex flex-col">
          <AdminPanel requests={requests} onApprove={handleApprove} onReject={handleReject} />
        </div>

        {/* Right: SDK Ledger View */}
        <div className="glass-card rounded-xl border border-blue-500/20 overflow-hidden flex flex-col">
          <LedgerPanel events={ledgerEvents} />
        </div>
      </div>

      {/* Legend */}
      <div className="glass-card rounded-xl border border-white/10 p-4">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <h4 className="font-bold text-amber-400 mb-2 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Admin Actions
            </h4>
            <ul className="space-y-1 text-gray-400">
              <li>Approve/reject KYC submissions</li>
              <li>Authorize transfer requests</li>
              <li>Greenlight mint operations</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-blue-400 mb-2 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              SDK Reactions
            </h4>
            <ul className="space-y-1 text-gray-400">
              <li>Verify identity on-chain</li>
              <li>Update compliance whitelist</li>
              <li>Execute transfers and mints</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
