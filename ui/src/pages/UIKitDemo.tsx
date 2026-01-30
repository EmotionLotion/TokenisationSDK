/**
 * UI Kit Demo — Connected to Live SDK Backend
 *
 * Every operation on this page calls the real sdkStore which wraps @tokenisation/sdk.
 * Sections reflect actual SDK capabilities: Asset Lifecycle, Party/KYC Management,
 * Token Operations, Compliance Checks, and Valuations.
 */

import { useState, useEffect, useSyncExternalStore, useCallback } from 'react';
import {
  Plus, UserPlus, ShieldCheck, Zap, Coins, ArrowLeftRight, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Building2, Plane, Music,
  Hotel, Car, ChevronRight, Wallet, TrendingUp, ClipboardCheck,
} from 'lucide-react';
import { sdkStore } from '../store';
import { LifecycleState } from '@tokenisation/sdk';
import { isKycVerified } from '../types';

// ============================================================================
// STORE HOOK
// ============================================================================

function useStore() {
  return useSyncExternalStore(
    (cb) => sdkStore.subscribe(cb),
    () => sdkStore.getVersion(),
  );
}

// ============================================================================
// LIFECYCLE STATE COLORS
// ============================================================================

const STATE_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  PENDING_VERIFICATION: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  VERIFIED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/30',
  FROZEN: 'bg-red-500/20 text-red-400 border-red-500/30',
  PARTIALLY_REDEEMED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  REDEEMED: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  EXPIRED: 'bg-gray-500/20 text-gray-500 border-gray-500/30',
  CLOSED: 'bg-gray-600/20 text-gray-600 border-gray-600/30',
  BURNED: 'bg-red-600/20 text-red-600 border-red-600/30',
};

const VERTICALS = [
  { label: 'Real Estate', icon: Building2, color: '#3B82F6', desc: 'OWNERSHIP — Property tokenisation' },
  { label: 'Airline Tickets', icon: Plane, color: '#A855F7', desc: 'ACCESS — FlyPlus flights' },
  { label: 'Concert Tickets', icon: Music, color: '#EC4899', desc: 'ACCESS — IITS events' },
  { label: 'Hotel Reservations', icon: Hotel, color: '#22C55E', desc: 'ACCESS — H2O bookings' },
  { label: 'Car Rentals', icon: Car, color: '#F97316', desc: 'ACCESS — GTS vehicles' },
];

// ============================================================================
// STATUS FEEDBACK COMPONENT
// ============================================================================

function StatusMsg({ msg, type }: { msg: string; type: 'success' | 'error' | 'info' }) {
  const colors = {
    success: 'text-green-400 bg-green-500/10 border-green-500/20',
    error: 'text-red-400 bg-red-500/10 border-red-500/20',
    info: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };
  return (
    <div className={`text-xs font-mono px-3 py-2 rounded-lg border ${colors[type]}`}>
      {msg}
    </div>
  );
}

// ============================================================================
// SECTION: OVERVIEW — Live SDK State
// ============================================================================

function OverviewSection() {
  useStore();
  const assets = sdkStore.getAssets();
  const parties = sdkStore.getParties();

  const stateCounts: Record<string, number> = {};
  assets.forEach(a => {
    const s = String(a.state);
    stateCounts[s] = (stateCounts[s] || 0) + 1;
  });

  const kycVerified = parties.filter(p => isKycVerified(p)).length;

  return (
    <div className="space-y-8">
      {/* Verticals */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-white/10">
        <h2 className="text-lg font-semibold mb-1">SDK Verticals</h2>
        <p className="text-sm text-gray-500 mb-4">
          The SDK tokenises Rights (OWNERSHIP, ACCESS, BEHAVIOR, VERIFICATION) across these verticals.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {VERTICALS.map(v => {
            const Icon = v.icon;
            return (
              <div key={v.label} className="p-3 rounded-lg bg-white/5 border border-white/10"
                style={{ borderLeftColor: v.color, borderLeftWidth: 3 }}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4" style={{ color: v.color }} />
                  <span className="font-medium text-white text-sm">{v.label}</span>
                </div>
                <div className="text-xs text-gray-500">{v.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="text-2xl font-bold text-white">{assets.length}</div>
          <div className="text-xs text-gray-500">Total Assets</div>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="text-2xl font-bold text-white">{parties.length}</div>
          <div className="text-xs text-gray-500">Registered Parties</div>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="text-2xl font-bold text-green-400">{kycVerified}</div>
          <div className="text-xs text-gray-500">KYC Verified</div>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="text-2xl font-bold text-amber-400">{stateCounts['ACTIVE'] || 0}</div>
          <div className="text-xs text-gray-500">Active Assets</div>
        </div>
      </div>

      {/* Lifecycle Distribution */}
      {assets.length > 0 && (
        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-3">Lifecycle State Distribution</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stateCounts).map(([state, count]) => (
              <span key={state} className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${STATE_COLORS[state] || 'text-gray-400'}`}>
                {state}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Asset List */}
      {assets.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-white">Live Assets</h3>
          {assets.map(a => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
              <div>
                <span className="text-sm font-medium text-white">{a.name}</span>
                <span className="text-xs text-gray-500 ml-2">{a.id}</span>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium border ${STATE_COLORS[String(a.state)] || ''}`}>
                {String(a.state)}
              </span>
            </div>
          ))}
        </div>
      )}

      {assets.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No assets yet. Use the <strong>Asset Lifecycle</strong> tab to create one via the SDK.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SECTION: ASSET LIFECYCLE — Create, Transition, Freeze
// ============================================================================

function LifecycleSection() {
  useStore();
  const [status, setStatus] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const assets = sdkStore.getAssets();
  const parties = sdkStore.getParties();

  const show = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setStatus({ msg, type });
    setTimeout(() => setStatus(null), 4000);
  };

  const handleCreateAsset = async () => {
    const names = [
      'Marina Tower Unit 1204', 'FlyPlus DXB→LHR Business', 'IITS Festival VIP',
      'H2O Atlantis Suite', 'GTS Premium SUV Rental',
    ];
    const name = names[assets.length % names.length];
    sdkStore.logSdkCall('assets.create', { name, description: `Tokenised asset: ${name}` });
    const asset = await sdkStore.createAsset({ name, description: `Tokenised asset: ${name}` });
    show(`Asset created: ${asset.name} [${asset.id}] — state: DRAFT`);
  };

  const handleTransition = async (assetId: string, targetState: LifecycleState) => {
    const actor = parties[0]?.id || 'system';
    sdkStore.logSdkCall('assets.transition', { assetId, state: targetState, actorId: actor });
    const result = await sdkStore.transition(assetId, targetState, actor);
    if (result.success) {
      show(`Transitioned → ${targetState}`);
    } else {
      show(`Failed: ${result.error}`, 'error');
    }
  };

  // Valid transitions map
  const TRANSITIONS: Record<string, LifecycleState[]> = {
    DRAFT: [LifecycleState.PENDING_VERIFICATION],
    PENDING_VERIFICATION: [LifecycleState.VERIFIED, LifecycleState.DRAFT],
    VERIFIED: [LifecycleState.ACTIVE, LifecycleState.DRAFT],
    ACTIVE: [LifecycleState.FROZEN, LifecycleState.REDEEMED],
    FROZEN: [LifecycleState.ACTIVE],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">
            Create assets and transition them through the SDK lifecycle: DRAFT → PENDING_VERIFICATION → VERIFIED → ACTIVE
          </p>
        </div>
        <button onClick={handleCreateAsset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> sdk.assets.create()
        </button>
      </div>

      {status && <StatusMsg msg={status.msg} type={status.type} />}

      {/* Lifecycle State Machine Diagram */}
      <div className="p-5 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-semibold text-white mb-3">SDK Lifecycle State Machine</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'FROZEN', 'REDEEMED', 'EXPIRED', 'CLOSED', 'BURNED'].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded border ${STATE_COLORS[s]}`}>{s}</span>
              {i < 3 && <ChevronRight className="w-3 h-3 text-gray-600" />}
              {i === 3 && <span className="text-gray-600 mx-1">|</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Asset Cards with Transition Buttons */}
      {assets.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          Click <strong>sdk.assets.create()</strong> to create your first asset.
        </div>
      ) : (
        <div className="space-y-3">
          {assets.map(asset => {
            const state = String(asset.state);
            const nextStates = TRANSITIONS[state] || [];
            return (
              <div key={asset.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-medium text-white">{asset.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{asset.id}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-lg border text-xs font-semibold ${STATE_COLORS[state]}`}>
                    {state}
                  </span>
                </div>
                {nextStates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-gray-500 self-center mr-1">sdk.assets.transition →</span>
                    {nextStates.map(ns => (
                      <button key={ns} onClick={() => handleTransition(asset.id, ns)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:brightness-125 ${STATE_COLORS[ns]}`}>
                        {ns}
                      </button>
                    ))}
                  </div>
                )}
                {nextStates.length === 0 && (
                  <div className="text-xs text-gray-600">Terminal state — no further transitions available</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SECTION: PARTIES & KYC
// ============================================================================

function PartiesSection() {
  useStore();
  const [status, setStatus] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const parties = sdkStore.getParties();

  const show = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setStatus({ msg, type });
    setTimeout(() => setStatus(null), 4000);
  };

  const handleCreateParty = async () => {
    const types = ['ISSUER', 'INVESTOR', 'VERIFIER', 'CUSTODIAN'];
    const names = ['Dubai Properties LLC', 'Alpha Capital Fund', 'VARA Verification Authority', 'Brinks Custody UAE'];
    const idx = parties.length % names.length;
    const data = { name: names[idx], type: types[idx], jurisdiction: 'UAE' };
    sdkStore.logSdkCall('parties.create', data);
    const party = await sdkStore.createParty(data);
    show(`Party created: ${party.name} [${party.type}]`);
  };

  const handleVerifyKyc = (partyId: string) => {
    sdkStore.logSdkCall('parties.setKyc', { partyId, verified: true });
    sdkStore.verifyKyc(partyId);
    show(`KYC verified for ${partyId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">Register parties (Issuer, Investor, Verifier, Custodian) and manage KYC verification.</p>
        <button onClick={handleCreateParty}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium transition-colors">
          <UserPlus className="w-4 h-4" /> sdk.parties.create()
        </button>
      </div>

      {status && <StatusMsg msg={status.msg} type={status.type} />}

      {parties.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          Click <strong>sdk.parties.create()</strong> to register your first party.
        </div>
      ) : (
        <div className="space-y-3">
          {parties.map(p => (
            <div key={p.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <div className="font-medium text-white text-sm">{p.name}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-mono">{p.id}</span>
                    <span>•</span>
                    <span>{p.type}</span>
                    <span>•</span>
                    <span>{p.jurisdiction}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isKycVerified(p) ? (
                  <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> KYC Verified
                  </span>
                ) : (
                  <button onClick={() => handleVerifyKyc(p.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors">
                    <ShieldCheck className="w-3.5 h-3.5" /> sdk.parties.setKyc()
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SECTION: TOKEN OPERATIONS — Mint, Transfer, Balance
// ============================================================================

function TokenSection() {
  useStore();
  const [status, setStatus] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [balances, setBalances] = useState<Record<string, Record<string, string>>>({});

  const assets = sdkStore.getAssets();
  const parties = sdkStore.getParties();
  const activeAssets = assets.filter(a => String(a.state) === 'ACTIVE');

  const show = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setStatus({ msg, type });
    setTimeout(() => setStatus(null), 4000);
  };

  const refreshBalances = useCallback(async () => {
    const newBalances: Record<string, Record<string, string>> = {};
    for (const asset of activeAssets) {
      const b = await sdkStore.getBalances(asset.id);
      if (Object.keys(b).length > 0) newBalances[asset.id] = b;
    }
    setBalances(newBalances);
  }, [activeAssets.length]);

  useEffect(() => { refreshBalances(); }, [refreshBalances]);

  const handleMint = async (assetId: string) => {
    if (parties.length === 0) { show('Create a party first', 'error'); return; }
    const toParty = parties[0];
    sdkStore.logSdkCall('tokens.mint', { assetId, toPartyId: toParty.id, amount: '1000' });
    const result = await sdkStore.mint(assetId, toParty.id, '1000');
    if (result.success) {
      show(`Minted 1000 tokens → ${toParty.name}`);
      refreshBalances();
    } else {
      show(`Mint failed: ${result.error}`, 'error');
    }
  };

  const handleTransfer = async (assetId: string) => {
    if (parties.length < 2) { show('Need at least 2 parties for transfer', 'error'); return; }
    sdkStore.logSdkCall('tokens.transfer', { assetId, from: parties[0].id, to: parties[1].id, amount: '100' });
    const result = await sdkStore.transfer(assetId, parties[0].id, parties[1].id, '100');
    if (result.success) {
      show(`Transferred 100 tokens: ${parties[0].name} → ${parties[1].name}`);
      refreshBalances();
    } else {
      show(`Transfer failed: ${result.error}`, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Mint and transfer tokens for ACTIVE assets. Assets must reach ACTIVE state through the lifecycle first.
      </p>

      {status && <StatusMsg msg={status.msg} type={status.type} />}

      {activeAssets.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          <p>No ACTIVE assets. Use the <strong>Asset Lifecycle</strong> tab to transition an asset to ACTIVE.</p>
          <p className="mt-1 text-xs">DRAFT → PENDING_VERIFICATION → VERIFIED → ACTIVE</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeAssets.map(asset => (
            <div key={asset.id} className="p-5 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-medium text-white">{asset.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{asset.id}</div>
                </div>
                <span className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs font-medium border border-green-500/30">
                  ACTIVE
                </span>
              </div>

              {/* Token Actions */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => handleMint(asset.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors">
                  <Coins className="w-3.5 h-3.5" /> sdk.tokens.mint(1000)
                </button>
                <button onClick={() => handleTransfer(asset.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors">
                  <ArrowLeftRight className="w-3.5 h-3.5" /> sdk.tokens.transfer(100)
                </button>
                <button onClick={refreshBalances}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-medium hover:bg-white/10 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Balances
                </button>
              </div>

              {/* Balances */}
              {balances[asset.id] && Object.keys(balances[asset.id]).length > 0 ? (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 mb-2">Token Balances (sdk.tokens.getBalance):</div>
                  {Object.entries(balances[asset.id]).map(([partyId, amount]) => {
                    const party = parties.find(p => p.id === partyId);
                    return (
                      <div key={partyId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-900 border border-white/5">
                        <div className="flex items-center gap-2">
                          <Wallet className="w-3.5 h-3.5 text-gray-500" />
                          <span className="text-sm text-white">{party?.name || partyId}</span>
                        </div>
                        <span className="text-sm font-mono text-amber-400">{amount} tokens</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-gray-600">No tokens minted yet for this asset.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SECTION: COMPLIANCE — Transfer Eligibility Checks
// ============================================================================

function ComplianceSection() {
  useStore();
  const [result, setResult] = useState<any>(null);

  const assets = sdkStore.getAssets();
  const parties = sdkStore.getParties();
  const activeAssets = assets.filter(a => String(a.state) === 'ACTIVE');

  const runComplianceCheck = () => {
    if (activeAssets.length === 0 || parties.length < 2) {
      setResult({ error: 'Need at least 1 ACTIVE asset and 2 parties' });
      return;
    }
    const assetId = activeAssets[0].id;
    sdkStore.logSdkCall('compliance.checkTransfer', { assetId, from: parties[0].id, to: parties[1].id, amount: '100' });
    const check = sdkStore.checkTransferCompliance(assetId, parties[0].id, parties[1].id, '100');
    setResult(check);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        The SDK evaluates every transfer against compliance rules: KYC status, jurisdiction restrictions, asset state, holding period, and AML checks.
      </p>

      <button onClick={runComplianceCheck}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors">
        <ClipboardCheck className="w-4 h-4" /> sdk.compliance.checkTransfer()
      </button>

      {result?.error && <StatusMsg msg={result.error} type="error" />}

      {result?.checks && (
        <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center gap-2">
            {result.eligible ? (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <span className={`text-sm font-semibold ${result.eligible ? 'text-green-400' : 'text-red-400'}`}>
              {result.eligible ? 'Transfer Eligible' : 'Transfer Denied'}
            </span>
          </div>

          <div className="space-y-2">
            {result.checks.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-900 border border-white/5">
                <span className="text-sm text-white">{c.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{c.detail}</span>
                  {c.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!result && (
        <div className="text-center py-12 text-gray-500 text-sm">
          {activeAssets.length === 0 || parties.length < 2
            ? 'Need at least 1 ACTIVE asset and 2 parties to run compliance checks.'
            : 'Click the button above to run a compliance check.'}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SECTION: VALUATIONS — Oracle Price Updates
// ============================================================================

function ValuationSection() {
  useStore();
  const [status, setStatus] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const assets = sdkStore.getAssets();

  const show = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setStatus({ msg, type });
    setTimeout(() => setStatus(null), 4000);
  };

  const handleOracleUpdate = (assetId: string) => {
    const newValue = Math.round(Math.random() * 5000000 + 500000);
    sdkStore.logSdkCall('assets.updateValuation', { assetId, newValue });
    const result = sdkStore.updateAssetValuation(assetId, newValue);
    show(`Valuation updated: $${result.previous?.toLocaleString() || 0} → $${result.current.toLocaleString()} (${result.changePct > 0 ? '+' : ''}${result.changePct.toFixed(1)}%)`);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        The SDK tracks asset valuations with full history. Oracle updates simulate real-time price feeds.
      </p>

      {status && <StatusMsg msg={status.msg} type={status.type} />}

      {assets.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          Create assets first to track their valuations.
        </div>
      ) : (
        <div className="space-y-3">
          {assets.map(asset => {
            const val = sdkStore.getAssetValuation(asset.id);
            return (
              <div key={asset.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium text-white text-sm">{asset.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{asset.id}</div>
                  </div>
                  <button onClick={() => handleOracleUpdate(asset.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors">
                    <TrendingUp className="w-3.5 h-3.5" /> Oracle Update
                  </button>
                </div>
                {val ? (
                  <div className="flex items-center gap-4">
                    <div className="text-lg font-bold text-white">${val.value.toLocaleString()}</div>
                    {val.history.length > 1 && (
                      <div className="flex gap-1">
                        {val.history.slice(-8).map((h: any, i: number) => {
                          const max = Math.max(...val.history.slice(-8).map((x: any) => x.value));
                          const min = Math.min(...val.history.slice(-8).map((x: any) => x.value));
                          const range = max - min || 1;
                          const height = Math.round(((h.value - min) / range) * 24) + 4;
                          return (
                            <div key={i} className="w-2 rounded-sm bg-amber-400/60" style={{ height: `${height}px`, alignSelf: 'flex-end' }} />
                          );
                        })}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">{val.history.length} data points</div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-600">No valuation data. Click Oracle Update to set initial value.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SECTION: SDK API REFERENCE
// ============================================================================

function ApiReferenceSection() {
  const modules = [
    {
      name: 'sdk.assets',
      color: 'text-blue-400',
      methods: [
        { name: 'create(params)', desc: 'Create a new asset in DRAFT state' },
        { name: 'get(assetId)', desc: 'Retrieve asset by ID' },
        { name: 'getAll()', desc: 'List all assets' },
        { name: 'transition(assetId, state, actorId)', desc: 'Advance lifecycle state' },
        { name: 'verify(assetId, verifierId)', desc: 'Verify asset (shortcut)' },
        { name: 'activate(assetId, actorId)', desc: 'Activate asset (shortcut)' },
        { name: 'updateValuation(assetId, value)', desc: 'Update asset valuation via oracle' },
      ],
    },
    {
      name: 'sdk.parties',
      color: 'text-purple-400',
      methods: [
        { name: 'create(params)', desc: 'Register a party (Issuer, Investor, Verifier, Custodian)' },
        { name: 'get(partyId)', desc: 'Retrieve party by ID' },
        { name: 'getAll()', desc: 'List all parties' },
        { name: 'setKyc(partyId, verified)', desc: 'Set KYC verification status' },
        { name: 'freeze(partyId, reason)', desc: 'Freeze party for compliance' },
      ],
    },
    {
      name: 'sdk.tokens',
      color: 'text-amber-400',
      methods: [
        { name: 'mint(assetId, to, amount)', desc: 'Mint tokens to a party (requires ACTIVE asset)' },
        { name: 'transfer(assetId, from, to, amount)', desc: 'Transfer tokens between parties' },
        { name: 'burn(assetId, from, amount)', desc: 'Burn tokens permanently' },
        { name: 'getBalance(assetId, address)', desc: 'Get balance for a holder' },
      ],
    },
    {
      name: 'sdk.compliance',
      color: 'text-emerald-400',
      methods: [
        { name: 'checkTransfer(assetId, from, to, amount)', desc: 'Evaluate transfer eligibility (KYC, jurisdiction, AML)' },
        { name: 'evaluate(action, params)', desc: 'Policy evaluation for any action' },
      ],
    },
    {
      name: 'sdk.evidence',
      color: 'text-cyan-400',
      methods: [
        { name: 'create(params)', desc: 'Attach evidence document to asset' },
        { name: 'verify(evidenceId, verifierId)', desc: 'Verify evidence authenticity' },
        { name: 'getForAsset(assetId)', desc: 'Get all evidence for an asset' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Complete API surface of @tokenisation/sdk. Every method shown here is callable through sdkStore in the UI.
      </p>
      <div className="space-y-4">
        {modules.map(mod => (
          <div key={mod.name} className="p-4 rounded-xl bg-white/5 border border-white/10">
            <h3 className={`font-semibold text-sm mb-3 ${mod.color}`}>{mod.name}</h3>
            <div className="space-y-1.5">
              {mod.methods.map(m => (
                <div key={m.name} className="flex items-start gap-3 px-3 py-1.5 rounded bg-gray-900/50">
                  <code className="text-xs text-white font-mono whitespace-nowrap">{m.name}</code>
                  <span className="text-xs text-gray-500">{m.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Start Code */}
      <div className="p-5 rounded-xl bg-gray-900 border border-white/10">
        <h3 className="text-sm font-semibold mb-3 text-white">Quick Start</h3>
        <pre className="text-xs text-gray-300 overflow-x-auto">{`import { TokenisationSDK, LifecycleState } from '@tokenisation/sdk';

const sdk = new TokenisationSDK();

// 1. Register parties
const issuer = await sdk.parties_.create({ name: 'Dubai Properties', type: 'ISSUER', jurisdiction: 'UAE' });
const investor = await sdk.parties_.create({ name: 'Alpha Fund', type: 'INVESTOR', jurisdiction: 'UAE' });
sdk.parties_.setKyc(investor.id, true);

// 2. Create & activate asset
const asset = await sdk.assets.create({ name: 'Marina Tower Unit 1204', description: 'Luxury property' });
await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
await sdk.assets.transition(asset.id, LifecycleState.VERIFIED, issuer.id);
await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, issuer.id);

// 3. Mint & transfer tokens
await sdk.tokens.mint(asset.id, investor.id, '10000');
await sdk.tokens.transfer(asset.id, investor.id, issuer.id, '500');
const balance = await sdk.tokens.getBalance(asset.id, investor.id);
console.log('Balance:', balance); // "9500"`}</pre>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN DEMO PAGE
// ============================================================================

export function UIKitDemo() {
  const [activeSection, setActiveSection] = useState<string>('overview');

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'lifecycle', label: 'Asset Lifecycle' },
    { id: 'parties', label: 'Parties & KYC' },
    { id: 'tokens', label: 'Token Operations' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'valuations', label: 'Valuations' },
    { id: 'api', label: 'API Reference' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-gray-900/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold mb-1">SDK Demo — Live Backend</h1>
          <p className="text-gray-400 text-sm">
            Every button calls the real @tokenisation/sdk. Create assets, manage parties, mint tokens, and run compliance checks.
          </p>
        </div>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto pb-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeSection === 'overview' && <OverviewSection />}
        {activeSection === 'lifecycle' && <LifecycleSection />}
        {activeSection === 'parties' && <PartiesSection />}
        {activeSection === 'tokens' && <TokenSection />}
        {activeSection === 'compliance' && <ComplianceSection />}
        {activeSection === 'valuations' && <ValuationSection />}
        {activeSection === 'api' && <ApiReferenceSection />}
      </div>
    </div>
  );
}

export default UIKitDemo;
