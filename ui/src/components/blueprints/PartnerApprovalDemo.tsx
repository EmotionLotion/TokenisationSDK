/**
 * PartnerApprovalDemo — Split-pane demo showing Admin approval flow
 * on the left and SDK ledger state on the right. Demonstrates
 * bidirectional communication between a partner admin UI and the SDK.
 *
 * Now with localStorage persistence for partner requests.
 */

import { useState, useEffect, useCallback } from 'react';
import { Shield, BookOpen, CheckCircle, XCircle, Clock, Users, ArrowRight, RefreshCw, Plus, X, UserPlus, Search, Filter } from 'lucide-react';
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

interface LedgerEvent {
  id: string;
  action: string;
  detail: string;
  timestamp: number;
  source: 'admin' | 'sdk';
}

const STORAGE_KEY = 'tokenisation_partner_requests';
const EVENTS_STORAGE_KEY = 'tokenisation_partner_events';

// ============================================================================
// INITIAL DATA
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
// STORAGE FUNCTIONS
// ============================================================================

function loadRequests(): PendingRequest[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load partner requests:', e);
  }
  // Initialize with default data
  localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_REQUESTS));
  return INITIAL_REQUESTS;
}

function saveRequests(requests: PendingRequest[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
}

function loadEvents(): LedgerEvent[] {
  try {
    const stored = localStorage.getItem(EVENTS_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load events:', e);
  }
  return [];
}

function saveEvents(events: LedgerEvent[]): void {
  localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
}

// ============================================================================
// CREATE REQUEST MODAL
// ============================================================================

function CreateRequestModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (request: Omit<PendingRequest, 'id' | 'timestamp' | 'status'>) => void;
}) {
  const [type, setType] = useState<'kyc' | 'transfer' | 'mint'>('kyc');
  const [party, setParty] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [detail, setDetail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!party || !partyAddress || !detail) return;
    onCreate({ type, party, partyAddress, detail });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card w-full max-w-md">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-amber-400" />
            New Partner Request
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Request Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'kyc' | 'transfer' | 'mint')}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#F8B032]/50"
            >
              <option value="kyc">KYC Verification</option>
              <option value="transfer">Transfer Approval</option>
              <option value="mint">Mint Request</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Party Name</label>
            <input
              type="text"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder="e.g., John Smith or Acme Corp"
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Wallet Address</label>
            <input
              type="text"
              value={partyAddress}
              onChange={(e) => setPartyAddress(e.target.value)}
              placeholder="e.g., 0x1234...5678"
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Details</label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Describe the request..."
              rows={3}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!party || !partyAddress || !detail}
              className="px-4 py-2 bg-amber-500 text-black rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Create Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN PANEL (Left Pane)
// ============================================================================

function AdminPanel({
  requests,
  onApprove,
  onReject,
  onCreateNew,
  filterType,
  setFilterType,
  searchQuery,
  setSearchQuery,
}: {
  requests: PendingRequest[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCreateNew: () => void;
  filterType: string;
  setFilterType: (type: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}) {
  const filteredRequests = requests.filter(r => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return r.party.toLowerCase().includes(query) ||
             r.partyAddress.toLowerCase().includes(query) ||
             r.detail.toLowerCase().includes(query);
    }
    return true;
  });

  const pending = filteredRequests.filter(r => r.status === 'pending');
  const processed = filteredRequests.filter(r => r.status !== 'pending');

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

      {/* Filters */}
      <div className="px-3 py-2 border-b border-white/5 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3 h-3 text-gray-500" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-gray-300 focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="kyc">KYC</option>
            <option value="transfer">Transfer</option>
            <option value="mint">Mint</option>
          </select>
          <button
            onClick={onCreateNew}
            className="px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-xs font-medium hover:bg-amber-500/20 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {pending.length === 0 && processed.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-xs">
            No requests found
          </div>
        )}

        {pending.length === 0 && processed.length > 0 && (
          <div className="text-center py-4 text-gray-500 text-xs">
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
            <div className="text-[10px] text-gray-600">
              {new Date(req.timestamp).toLocaleString()}
            </div>
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
              <span className="text-[10px] uppercase tracking-widest text-gray-600 font-medium">Processed ({processed.length})</span>
            </div>
            {processed.slice(0, 10).map(req => (
              <div key={req.id} className="bg-white/[0.02] rounded-lg border border-white/5 p-3 opacity-60">
                <div className="flex items-center gap-2">
                  {req.status === 'approved'
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                  <span className="text-xs text-gray-400">{req.party}</span>
                  <span className="text-[10px] text-gray-600">{typeLabel(req.type)}</span>
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

function LedgerPanel({ events, onClear }: { events: LedgerEvent[]; onClear: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/10 bg-blue-500/5 flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-bold text-blue-400">SDK Ledger</span>
        <span className="ml-auto text-[10px] text-gray-500">{events.length} events</span>
        {events.length > 0 && (
          <button
            onClick={onClear}
            className="ml-2 text-[10px] text-gray-500 hover:text-gray-300"
          >
            Clear
          </button>
        )}
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
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const store = useSDKStore;

  // Load data on mount
  useEffect(() => {
    setRequests(loadRequests());
    setLedgerEvents(loadEvents());
  }, []);

  const addEvent = useCallback((action: string, detail: string, source: 'admin' | 'sdk') => {
    setLedgerEvents(prev => {
      const newEvents = [
        { id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, action, detail, timestamp: Date.now(), source },
        ...prev,
      ].slice(0, 50); // Keep max 50 events
      saveEvents(newEvents);
      return newEvents;
    });
  }, []);

  const handleCreateRequest = useCallback((data: Omit<PendingRequest, 'id' | 'timestamp' | 'status'>) => {
    const newRequest: PendingRequest = {
      ...data,
      id: `req_${Date.now().toString(36)}`,
      timestamp: Date.now(),
      status: 'pending',
    };
    setRequests(prev => {
      const updated = [newRequest, ...prev];
      saveRequests(updated);
      return updated;
    });
    addEvent('Request Created', `New ${data.type.toUpperCase()} request from ${data.party}`, 'admin');
  }, [addEvent]);

  const handleApprove = useCallback((id: string) => {
    const req = requests.find(r => r.id === id);
    if (!req) return;

    setRequests(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, status: 'approved' as const } : r);
      saveRequests(updated);
      return updated;
    });

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
          try {
            store.getState().verifyKyc(req.party);
          } catch {
            // Store may not have party
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

    setRequests(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, status: 'rejected' as const } : r);
      saveRequests(updated);
      return updated;
    });

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

  const handleClearEvents = useCallback(() => {
    setLedgerEvents([]);
    saveEvents([]);
  }, []);

  // Stats
  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Partner Admin Demo</h1>
            <p className="text-sm text-gray-400">Approve KYC, transfers, and mints — see SDK ledger react in real-time</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="text-sm text-gray-400">Total Requests</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.total}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-sm text-gray-400 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            Pending
          </div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">{stats.pending}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-sm text-gray-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            Approved
          </div>
          <div className="text-2xl font-bold text-green-400 mt-1">{stats.approved}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-sm text-gray-400 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400" />
            Rejected
          </div>
          <div className="text-2xl font-bold text-red-400 mt-1">{stats.rejected}</div>
        </div>
      </div>

      {/* Intro */}
      <div className="glass-card rounded-xl border border-white/10 p-4">
        <p className="text-sm text-gray-300">
          This demo shows <strong className="text-white">bidirectional communication</strong> between a partner admin UI and the SDK.
          Approve or reject requests on the left — the right panel shows how the SDK ledger reacts to each decision in real-time.
          All changes are persisted to localStorage.
        </p>
      </div>

      {/* Split Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: '500px' }}>
        {/* Left: Admin View */}
        <div className="glass-card rounded-xl border border-amber-500/20 overflow-hidden flex flex-col">
          <AdminPanel
            requests={requests}
            onApprove={handleApprove}
            onReject={handleReject}
            onCreateNew={() => setShowCreateModal(true)}
            filterType={filterType}
            setFilterType={setFilterType}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        </div>

        {/* Right: SDK Ledger View */}
        <div className="glass-card rounded-xl border border-blue-500/20 overflow-hidden flex flex-col">
          <LedgerPanel events={ledgerEvents} onClear={handleClearEvents} />
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
              <li>Create new partner requests</li>
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
              <li>Record supply snapshots</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateRequestModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateRequest}
        />
      )}
    </div>
  );
}
