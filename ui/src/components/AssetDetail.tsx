import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, Coins, Send, History, CheckCircle2, XCircle, Activity,
  ShieldCheck, FileText, ChevronRight, Users, Shield, Zap, Clock, Globe, Eye,
  BarChart3, TrendingUp, Settings, AlertTriangle, Lock, Unlock, RefreshCw
} from 'lucide-react';
import { sdkStore } from '../store';
import { Asset, Party, BaseEvent, TokenBalance, LifecycleState, STATE_COLORS, LIFECYCLE_TRANSITIONS, EventType } from '../types';
import { PolicyStudio } from './PolicyStudio';

interface AssetDetailProps {
  asset: Asset;
  onBack: () => void;
}

type TabId = 'overview' | 'holders' | 'rules' | 'lifecycle' | 'events' | 'transactions';

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'overview', label: 'Overview', icon: Eye },
  { id: 'holders', label: 'Holders', icon: Users },
  { id: 'rules', label: 'Rules', icon: Shield },
  { id: 'lifecycle', label: 'Lifecycle', icon: Activity },
  { id: 'events', label: 'Events', icon: History },
  { id: 'transactions', label: 'Transactions', icon: Send },
];

export function AssetDetail({ asset: initialAsset, onBack }: AssetDetailProps) {
  const [asset, setAsset] = useState(initialAsset);
  const [parties, setParties] = useState<Party[]>([]);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [events, setEvents] = useState<BaseEvent[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [mintAmount, setMintAmount] = useState('100');
  const [mintTo, setMintTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('50');
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const loadBalances = async () => {
    const balanceMap = await sdkStore.getBalances(initialAsset.id);
    const partyList = sdkStore.getParties();
    const balanceList: TokenBalance[] = Object.entries(balanceMap).map(([partyId, balance]) => {
      const party = partyList.find(p => p.id === partyId);
      return {
        partyId,
        partyName: party?.name || partyId,
        balance
      };
    });
    setBalances(balanceList);
  };

  const refreshEvents = () => {
    setEvents(sdkStore.getEvents(initialAsset.id).reverse());
  };

  useEffect(() => {
    const update = () => {
      const updated = sdkStore.getAsset(initialAsset.id);
      if (updated) setAsset(updated);
      setParties(sdkStore.getParties());
      loadBalances();
      refreshEvents();
    };
    update();
    return sdkStore.subscribe(update);
  }, [initialAsset.id]);

  const validNextStates = LIFECYCLE_TRANSITIONS[asset.state];
  const issuer = parties.find(p => p.id === asset.issuerId);

  const handleTransition = async (toState: LifecycleState) => {
    const result = await sdkStore.transition(asset.id, toState, asset.issuerId);
    if (result.success) {
      setMessage({ type: 'success', text: `Transitioned to ${toState}` });
    } else {
      setMessage({ type: 'error', text: result.error || 'Transition failed' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleMint = async () => {
    if (!mintTo) {
      setMintError('Select a recipient');
      return;
    }
    try {
      setTransferring(true);
      const res = await sdkStore.mint(asset.id, mintTo, mintAmount);
      if (res.success) {
        loadBalances();
        refreshEvents();
        setMessage({ type: 'success', text: `Minted ${mintAmount} tokens` });
        setMintAmount('100');
        setMintTo('');
        setMintError(null);
      } else {
        setMintError(res.error || 'Minting failed');
        setMessage({ type: 'error', text: res.error || 'Mint failed' });
      }
    } catch (err) {
      setMintError('Minting failed');
      setMessage({ type: 'error', text: 'Minting failed' });
    } finally {
      setTransferring(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleTransfer = async () => {
    if (!transferFrom || !transferTo) {
      setTransferError('Select sender and recipient');
      return;
    }
    try {
      setTransferring(true);
      const res = await sdkStore.transfer(asset.id, transferFrom, transferTo, transferAmount);
      if (res.success) {
        loadBalances();
        refreshEvents();
        setMessage({ type: 'success', text: `Transferred ${transferAmount} tokens` });
        setTransferAmount('50');
        setTransferFrom('');
        setTransferTo('');
        setTransferError(null);
      } else {
        setTransferError(res.error || 'Transfer failed');
        setMessage({ type: 'error', text: res.error || 'Transfer failed' });
      }
    } catch (err) {
      setTransferError('Transfer failed');
      setMessage({ type: 'error', text: 'Transfer failed' });
    } finally {
      setTransferring(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const allStates = Object.values(LifecycleState);

  const getStatusColor = (state: LifecycleState) => {
    switch (state) {
      case LifecycleState.ACTIVE: return 'text-accent bg-accent/10 border-accent/20';
      case LifecycleState.VERIFIED: return 'text-primary bg-primary/10 border-primary/20';
      case LifecycleState.DRAFT: return 'text-gray-400 bg-white/5 border-white/10';
      case LifecycleState.PENDING_VERIFICATION: return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      default: return 'text-gray-400 bg-white/5';
    }
  };

  const totalHolders = balances.length;
  const totalSupply = parseInt(asset.tokenInfo?.totalSupply?.toString() || '0');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-card p-4 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Coins className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Supply</p>
                    <p className="text-lg font-bold text-white">{totalSupply.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Holders</p>
                    <p className="text-lg font-bold text-white">{totalHolders}</p>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Events</p>
                    <p className="text-lg font-bold text-white">{events.length}</p>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Jurisdiction</p>
                    <p className="text-lg font-bold text-white">
                      {typeof asset.jurisdiction === 'string' ? asset.jurisdiction : asset.jurisdiction.countryCode}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card rounded-xl p-5 border border-white/10">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#F8B032]" />
                  Asset Details
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">Right Type</span>
                    <span className="text-sm font-medium text-white bg-white/5 px-3 py-1 rounded-lg">{asset.rightType}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">State</span>
                    <span className={`px-2.5 py-1 text-xs rounded-full border ${getStatusColor(asset.state)}`}>
                      {asset.state}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">Issuer</span>
                    <span className="text-sm font-medium text-white">{issuer?.name || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">Created</span>
                    <span className="text-sm text-gray-300">{new Date(asset.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-400">Asset ID</span>
                    <span className="text-xs font-mono text-gray-500">{asset.id.slice(0, 16)}...</span>
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-xl p-5 border border-white/10">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#F8B032]" />
                  Quick Actions
                </h3>
                <div className="space-y-2">
                  {asset.state === LifecycleState.ACTIVE ? (
                    <>
                      <button
                        onClick={() => setActiveTab('holders')}
                        className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <Coins className="w-5 h-5 text-green-400" />
                          <span className="text-sm text-white">Mint Tokens</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                      </button>
                      <button
                        onClick={() => setActiveTab('holders')}
                        className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <Send className="w-5 h-5 text-blue-400" />
                          <span className="text-sm text-white">Transfer Tokens</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                      </button>
                    </>
                  ) : (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      Asset must be active to perform token operations
                    </div>
                  )}
                  <button
                    onClick={() => setActiveTab('rules')}
                    className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-purple-400" />
                      <span className="text-sm text-white">Manage Rules</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                  </button>
                  <button
                    onClick={() => setActiveTab('lifecycle')}
                    className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="w-5 h-5 text-orange-400" />
                      <span className="text-sm text-white">View Lifecycle</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                  </button>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-xl p-5 border border-white/10">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-[#F8B032]" />
                Recent Activity
              </h3>
              {events.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-2">
                  {events.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#F8B032]/10 flex items-center justify-center">
                          <Activity className="w-4 h-4 text-[#F8B032]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{event.type}</p>
                          <p className="text-xs text-gray-500">{new Date(event.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-gray-500">{event.id.slice(0, 8)}</span>
                    </div>
                  ))}
                  {events.length > 5 && (
                    <button
                      onClick={() => setActiveTab('events')}
                      className="w-full text-center py-2 text-sm text-[#F8B032] hover:underline"
                    >
                      View all {events.length} events
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 'holders':
        return (
          <div className="space-y-6">
            {asset.state === LifecycleState.ACTIVE && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card rounded-xl p-5 border border-white/10 border-l-4 border-l-green-500">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-green-400" />
                    Mint Tokens
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Amount</label>
                      <input
                        type="number"
                        value={mintAmount}
                        onChange={e => setMintAmount(e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Recipient</label>
                      <select
                        value={mintTo}
                        onChange={e => setMintTo(e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-green-500/50 appearance-none"
                      >
                        <option value="">Select party...</option>
                        {parties.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleMint}
                      disabled={transferring}
                      className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {transferring ? 'Minting...' : 'Mint Tokens'}
                    </button>
                    {mintError && <p className="text-red-400 text-xs mt-2">{mintError}</p>}
                  </div>
                </div>

                <div className="glass-card rounded-xl p-5 border border-white/10 border-l-4 border-l-blue-500">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Send className="w-4 h-4 text-blue-400" />
                    Transfer Tokens
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Amount</label>
                      <input
                        type="number"
                        value={transferAmount}
                        onChange={e => setTransferAmount(e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">From</label>
                        <select
                          value={transferFrom}
                          onChange={e => setTransferFrom(e.target.value)}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                        >
                          <option value="">Sender...</option>
                          {balances.map(b => (
                            <option key={b.partyId} value={b.partyId}>{b.partyName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">To</label>
                        <select
                          value={transferTo}
                          onChange={e => setTransferTo(e.target.value)}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                        >
                          <option value="">Recipient...</option>
                          {parties.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={handleTransfer}
                      disabled={transferring}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {transferring ? 'Transferring...' : 'Transfer Tokens'}
                    </button>
                    {transferError && <p className="text-red-400 text-xs mt-2">{transferError}</p>}
                  </div>
                </div>
              </div>
            )}

            <div className="glass-card rounded-xl p-5 border border-white/10">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#F8B032]" />
                Token Holders ({totalHolders})
              </h3>
              {balances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <Coins className="w-12 h-12 mb-3 opacity-20" />
                  <p>No tokens minted yet</p>
                  {asset.state === LifecycleState.ACTIVE && (
                    <p className="text-xs mt-1">Use the mint form above to issue tokens</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Holder</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Balance</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Percentage</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {balances.map(b => {
                        const percentage = totalSupply > 0 ? (parseInt(b.balance.toString()) / totalSupply * 100).toFixed(2) : '0';
                        return (
                          <tr key={b.partyId} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                                  {b.partyName.charAt(0)}
                                </div>
                                <span className="text-sm font-medium text-white">{b.partyName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-sm text-white">{parseInt(b.balance).toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#F8B032]"
                                    style={{ width: `${Math.min(parseFloat(percentage), 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-400">{percentage}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 text-xs bg-green-500/10 text-green-400 rounded">Active</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );

      case 'rules':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Asset Rules</h3>
                <p className="text-sm text-gray-400">Configure compliance policies for this asset</p>
              </div>
            </div>
            <PolicyStudio embedded />
          </div>
        );

      case 'lifecycle':
        return (
          <div className="space-y-6">
            <div className="glass-card rounded-xl p-6 border border-white/10">
              <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#F8B032]" />
                Lifecycle State Machine
              </h3>

              <div className="flex flex-wrap items-center gap-2 mb-6">
                {allStates.map((state, index) => {
                  const isActive = state === asset.state;
                  const isPast = allStates.indexOf(asset.state) > index;

                  return (
                    <div key={state} className="flex items-center">
                      <div
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${isActive
                          ? `${getStatusColor(state)} shadow-lg scale-105`
                          : isPast
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : 'bg-white/5 text-gray-500 border-transparent'
                          }`}
                      >
                        {state.replace('_', ' ')}
                      </div>
                      {index < allStates.length - 1 && (
                        <div className={`w-8 h-0.5 mx-2 ${isPast ? 'bg-green-500/30' : 'bg-white/10'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {validNextStates.length > 0 ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">Available Transitions:</span>
                    {validNextStates.map(state => (
                      <button
                        key={state}
                        onClick={() => handleTransition(state)}
                        className="px-4 py-2 rounded-lg bg-[#F8B032] hover:bg-[#E8A633] text-black text-sm font-medium transition-all flex items-center gap-2"
                      >
                        <span>Proceed to {state.replace('_', ' ')}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500 italic bg-white/5 px-4 py-2 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    Terminal state - no further actions available
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card rounded-xl p-6 border border-white/10">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#F8B032]" />
                Lifecycle Actions
              </h3>
              <p className="text-sm text-gray-400 mb-4">Execute lifecycle operations on this asset</p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <button
                  disabled={asset.state !== LifecycleState.ACTIVE}
                  className={`p-4 rounded-xl border text-left transition-all ${asset.state === LifecycleState.ACTIVE
                    ? 'border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 cursor-pointer'
                    : 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-blue-400" />
                    </div>
                    <span className="text-sm font-bold text-white">Freeze</span>
                  </div>
                  <p className="text-xs text-gray-400">Temporarily block all transfers</p>
                </button>

                <button
                  disabled={asset.state !== LifecycleState.ACTIVE}
                  className={`p-4 rounded-xl border text-left transition-all ${asset.state === LifecycleState.ACTIVE
                    ? 'border-green-500/30 bg-green-500/10 hover:bg-green-500/20 cursor-pointer'
                    : 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <Coins className="w-4 h-4 text-green-400" />
                    </div>
                    <span className="text-sm font-bold text-white">Distribute</span>
                  </div>
                  <p className="text-xs text-gray-400">Send dividends to all holders</p>
                </button>

                <button
                  disabled={asset.state !== LifecycleState.ACTIVE}
                  className={`p-4 rounded-xl border text-left transition-all ${asset.state === LifecycleState.ACTIVE
                    ? 'border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 cursor-pointer'
                    : 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-orange-400" />
                    </div>
                    <span className="text-sm font-bold text-white">Redeem</span>
                  </div>
                  <p className="text-xs text-gray-400">Burn tokens for underlying value</p>
                </button>

                <button
                  disabled={asset.state !== LifecycleState.ACTIVE}
                  className={`p-4 rounded-xl border text-left transition-all ${asset.state === LifecycleState.ACTIVE
                    ? 'border-red-500/30 bg-red-500/10 hover:bg-red-500/20 cursor-pointer'
                    : 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <XCircle className="w-4 h-4 text-red-400" />
                    </div>
                    <span className="text-sm font-bold text-white">Retire</span>
                  </div>
                  <p className="text-xs text-gray-400">Permanently end asset lifecycle</p>
                </button>

                <button
                  disabled={asset.state !== LifecycleState.ACTIVE}
                  className={`p-4 rounded-xl border text-left transition-all ${asset.state === LifecycleState.ACTIVE
                    ? 'border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 cursor-pointer'
                    : 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-yellow-400" />
                    </div>
                    <span className="text-sm font-bold text-white">Expire</span>
                  </div>
                  <p className="text-xs text-gray-400">Set expiration timestamp</p>
                </button>

                <button
                  disabled={asset.state !== LifecycleState.ACTIVE}
                  className={`p-4 rounded-xl border text-left transition-all ${asset.state === LifecycleState.ACTIVE
                    ? 'border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 cursor-pointer'
                    : 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="text-sm font-bold text-white">Force Transfer</span>
                  </div>
                  <p className="text-xs text-gray-400">Admin override for compliance</p>
                </button>
              </div>

              {asset.state !== LifecycleState.ACTIVE && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <p className="text-sm text-yellow-400">
                    Asset must be in ACTIVE state to perform lifecycle actions
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 'events':
        return (
          <div className="glass-card rounded-xl border border-white/10">
            <div className="p-5 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-[#F8B032]" />
                Audit Log ({events.length} events)
              </h3>
            </div>
            {events.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No events recorded yet</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {events.map((event) => (
                  <div key={event.id} className="flex items-start gap-4 p-4 hover:bg-white/5 transition-colors">
                    <div className="mt-1 min-w-[100px]">
                      <span className="text-xs font-mono text-gray-500 block">
                        {new Date(event.timestamp).toLocaleDateString()}
                      </span>
                      <span className="text-xs font-mono text-gray-600">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-white text-sm">{event.type}</span>
                        <span className="text-[10px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded uppercase">
                          {event.id.slice(0, 8)}
                        </span>
                      </div>
                      {event.payload && (
                        <div className="bg-black/30 rounded p-2 mt-2">
                          <code className="text-xs font-mono text-gray-400 break-all">
                            {JSON.stringify(event.payload, null, 2)}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'transactions':
        return (
          <div className="glass-card rounded-xl border border-white/10">
            <div className="p-5 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-[#F8B032]" />
                Transaction History
              </h3>
            </div>
            {(() => {
              const transferEvents = events.filter(e => e.type.includes('TRANSFER') || e.type.includes('MINT') || e.type.includes('TRANSITION'));
              return transferEvents.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <Send className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No transactions yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">From</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">To</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {transferEvents.map(event => (
                        <tr key={event.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${event.type === EventType.STATE_CHANGED ? 'bg-purple-500/20 text-purple-400' :
                              event.type === EventType.TOKEN_MINTED ? 'bg-green-500/20 text-green-400' :
                                'bg-blue-500/20 text-blue-400'
                              }`}>
                              {event.type === EventType.STATE_CHANGED ? 'Transition' : event.type === EventType.TOKEN_MINTED ? 'Mint' : 'Transfer'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">
                            {String(event.payload?.from || '-')}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">
                            {String(event.payload?.to || '-')}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-white">
                            {String(event.payload?.amount || '-')}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {new Date(event.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>
            {asset.name}
            <span className={`px-2.5 py-0.5 text-xs rounded-full border ${getStatusColor(asset.state)}`}>
              {asset.state}
            </span>
          </h1>
          <p className="text-gray-400 font-mono text-sm">{asset.id}</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2 ${message.type === 'success'
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      <div className="border-b border-white/10">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${activeTab === tab.id
                  ? 'text-[#F8B032] border-[#F8B032]'
                  : 'text-gray-400 border-transparent hover:text-white hover:border-white/20'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {renderTabContent()}
    </div>
  );
}
