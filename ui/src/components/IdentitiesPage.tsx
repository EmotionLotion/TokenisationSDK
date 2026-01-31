import { useState } from 'react';
import {
  UserCheck, Search, Plus, Shield, AlertTriangle,
  CheckCircle, XCircle, Clock, Globe, Briefcase, User, Eye,
  Wallet, ArrowUpRight, Ban, RefreshCw, Mail, Calendar,
  Fingerprint, Lock, Link2, ArrowRight, Loader2
} from 'lucide-react';
import { sdkStore } from '../store';
import { Party, VerificationLevel } from '../types';
import { useSDKStore, CCIDVertical, DecoProofType, DecoSessionStatus, type CCIDEligibilityResult } from '../core/store';
import { VerticalClearanceMatrix } from './shared/VerticalClearanceMatrix';

// Identity types
type KYCStatus = 'pending' | 'verified' | 'revoked' | 'expired';
type RiskTier = 'low' | 'medium' | 'high';
type IdentityType = 'individual' | 'company';
type TabId = 'kyc' | 'ccid' | 'deco';

interface Identity extends Party {
  identityType: IdentityType;
  kycStatus: KYCStatus;
  riskTier: RiskTier;
  jurisdiction: string;
  email?: string;
  accreditedInvestor?: boolean;
  portfolioValue?: number;
  totalTransactions?: number;
  lastActivity?: string;
}

const SAMPLE_IDENTITIES: Identity[] = ([
  { id: 'idn_alice_001', name: 'Alice Johnson', identityType: 'individual', kycStatus: 'verified', verificationLevel: 2, riskTier: 'low', jurisdiction: 'US', email: 'alice@example.com', accreditedInvestor: true, portfolioValue: 125000, totalTransactions: 45, lastActivity: '2024-01-15T10:30:00Z' },
  { id: 'idn_bob_002', name: 'Bob Smith', identityType: 'individual', kycStatus: 'pending', verificationLevel: 0, riskTier: 'medium', jurisdiction: 'UK', email: 'bob@example.com', accreditedInvestor: false, portfolioValue: 0, totalTransactions: 0, lastActivity: '2024-01-14T15:20:00Z' },
  { id: 'idn_acme_003', name: 'Acme Corporation', identityType: 'company', kycStatus: 'verified', verificationLevel: 2, riskTier: 'low', jurisdiction: 'AE', email: 'legal@acme.com', accreditedInvestor: true, portfolioValue: 2500000, totalTransactions: 156, lastActivity: '2024-01-15T09:15:00Z' },
  { id: 'idn_carol_004', name: 'Carol Williams', identityType: 'individual', kycStatus: 'revoked', verificationLevel: 0, riskTier: 'high', jurisdiction: 'SG', email: 'carol@example.com', accreditedInvestor: false, portfolioValue: 50000, totalTransactions: 12, lastActivity: '2024-01-10T11:45:00Z' },
  { id: 'idn_global_005', name: 'Global Investments Ltd', identityType: 'company', kycStatus: 'verified', verificationLevel: 2, riskTier: 'low', jurisdiction: 'CH', email: 'compliance@globalinv.com', accreditedInvestor: true, portfolioValue: 10000000, totalTransactions: 320, lastActivity: '2024-01-15T14:00:00Z' },
] as any) as Identity[];

const PROOF_TYPE_LABELS: Record<DecoProofType, { label: string; description: string }> = {
  [DecoProofType.BALANCE_THRESHOLD]: { label: 'Balance Threshold', description: 'Prove balance exceeds threshold without revealing exact amount' },
  [DecoProofType.ACCREDITED_INVESTOR]: { label: 'Accredited Investor', description: 'Prove accredited investor status from financial institution' },
  [DecoProofType.AGE_VERIFICATION]: { label: 'Age Verification', description: 'Prove age requirement without revealing date of birth' },
  [DecoProofType.INSURANCE_COVERAGE]: { label: 'Insurance Coverage', description: 'Prove active insurance policy without revealing details' },
};

const STATUS_COLORS: Record<DecoSessionStatus, string> = {
  [DecoSessionStatus.PENDING]: 'bg-gray-500/10 text-gray-400',
  [DecoSessionStatus.ATTESTING]: 'bg-blue-500/10 text-blue-400',
  [DecoSessionStatus.PROVING]: 'bg-yellow-500/10 text-yellow-400',
  [DecoSessionStatus.VERIFIED]: 'bg-green-500/10 text-green-400',
  [DecoSessionStatus.FAILED]: 'bg-red-500/10 text-red-400',
  [DecoSessionStatus.EXPIRED]: 'bg-gray-500/10 text-gray-500',
};

export function IdentitiesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('kyc');
  const [identities, setIdentities] = useState<Identity[]>(SAMPLE_IDENTITIES);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<KYCStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<IdentityType | 'all'>('all');
  const [selectedIdentity, setSelectedIdentity] = useState<Identity | null>(null);

  // CCID state
  const [ccidWallet, setCcidWallet] = useState('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18');
  const [eligibilityResults, setEligibilityResults] = useState<Map<CCIDVertical, CCIDEligibilityResult>>(new Map());
  const store = useSDKStore();

  // DECO state
  const [decoProofType, setDecoProofType] = useState<DecoProofType>(DecoProofType.BALANCE_THRESHOLD);
  const [decoPredicate, setDecoPredicate] = useState('>= 100000 USD');
  const [decoThreshold, setDecoThreshold] = useState('100000');
  const [decoAdvancing, setDecoAdvancing] = useState<string | null>(null);
  const [showAutoClear, setShowAutoClear] = useState<string | null>(null);

  const tabs: { id: TabId; label: string; icon: typeof UserCheck }[] = [
    { id: 'kyc', label: 'KYC Management', icon: UserCheck },
    { id: 'ccid', label: 'Cross-Vertical Clearance', icon: Fingerprint },
    { id: 'deco', label: 'Privacy Proofs', icon: Lock },
  ];

  // KYC helpers
  const filteredIdentities = identities.filter(identity => {
    const matchesSearch = identity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      identity.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      identity.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || identity.kycStatus === filterStatus;
    const matchesType = filterType === 'all' || identity.identityType === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const stats = {
    total: identities.length,
    verified: identities.filter(i => i.kycStatus === 'verified').length,
    pending: identities.filter(i => i.kycStatus === 'pending').length,
    revoked: identities.filter(i => i.kycStatus === 'revoked').length,
  };

  const getStatusBadge = (status: KYCStatus) => {
    const map: Record<KYCStatus, { color: string; icon: typeof CheckCircle; label: string }> = {
      verified: { color: 'bg-green-500/10 text-green-400', icon: CheckCircle, label: 'Verified' },
      pending: { color: 'bg-yellow-500/10 text-yellow-400', icon: Clock, label: 'Pending' },
      revoked: { color: 'bg-red-500/10 text-red-400', icon: XCircle, label: 'Revoked' },
      expired: { color: 'bg-gray-500/10 text-gray-400', icon: Clock, label: 'Expired' },
    };
    const { color, icon: Icon, label } = map[status];
    return <span className={`flex items-center gap-1.5 px-2.5 py-1 ${color} rounded-full text-xs font-medium`}><Icon className="w-3 h-3" /> {label}</span>;
  };

  const getRiskBadge = (risk: RiskTier) => {
    const map: Record<RiskTier, string> = {
      low: 'bg-green-500/10 text-green-400',
      medium: 'bg-yellow-500/10 text-yellow-400',
      high: 'bg-red-500/10 text-red-400',
    };
    return <span className={`px-2 py-0.5 ${map[risk]} rounded text-[10px] font-medium`}>{risk.toUpperCase()}</span>;
  };

  const handleVerify = (id: string) => {
    setIdentities(identities.map(i => i.id === id ? { ...i, kycStatus: 'verified' as KYCStatus, verificationLevel: 2 as unknown as VerificationLevel } : i));
  };
  const handleRevoke = (id: string) => {
    setIdentities(identities.map(i => i.id === id ? { ...i, kycStatus: 'revoked' as KYCStatus, verificationLevel: 0 as unknown as VerificationLevel } : i));
  };
  const handleRequestReverification = (id: string) => {
    setIdentities(identities.map(i => i.id === id ? { ...i, kycStatus: 'pending' as KYCStatus } : i));
  };

  // CCID handlers
  const handleRegisterCCID = () => {
    if (!ccidWallet) return;
    store.registerCCIDIdentity(ccidWallet);
  };

  const handleCheckEligibility = (vertical: CCIDVertical) => {
    const result = store.checkCCIDEligibility(ccidWallet, vertical);
    setEligibilityResults(prev => new Map(prev).set(vertical, result));
  };

  const handleClearVertical = (vertical: CCIDVertical) => {
    const required = eligibilityResults.get(vertical)?.satisfied || [];
    store.clearCCIDVertical(ccidWallet, vertical, required);
  };

  // DECO handlers
  const handleInitiateProof = () => {
    store.initiateDecoProof({ proofType: decoProofType, predicate: decoPredicate, threshold: decoThreshold });
  };

  const handleAdvanceSession = (sessionId: string) => {
    setDecoAdvancing(sessionId);
    const result = store.advanceDecoSession(sessionId);
    setTimeout(() => {
      setDecoAdvancing(null);
      if (result.status === DecoSessionStatus.VERIFIED) {
        setShowAutoClear(sessionId);
      }
    }, 600);
  };

  const handleAutoClearFromDeco = (sessionId: string) => {
    const session = store.getDecoSession(sessionId);
    if (!session) return;
    // Map proof type to vertical
    const verticalMap: Partial<Record<DecoProofType, CCIDVertical>> = {
      [DecoProofType.BALANCE_THRESHOLD]: CCIDVertical.REAL_ESTATE,
      [DecoProofType.ACCREDITED_INVESTOR]: CCIDVertical.REAL_ESTATE,
      [DecoProofType.AGE_VERIFICATION]: CCIDVertical.CONCERT,
      [DecoProofType.INSURANCE_COVERAGE]: CCIDVertical.CAR_RENTAL,
    };
    const vertical = verticalMap[session.proofType];
    if (vertical && ccidWallet) {
      if (!store.getCCIDIdentity(ccidWallet)) store.registerCCIDIdentity(ccidWallet);
      store.clearCCIDVertical(ccidWallet, vertical, [session.proofHash || sessionId]);
    }
    setShowAutoClear(null);
  };

  const ccidIdentity = store.getCCIDIdentity(ccidWallet);
  const decoHistory = store.getDecoHistory();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>Identities</h1>
          <p className="text-gray-400 text-sm mt-1">Manage KYC, cross-vertical clearance, and privacy proofs</p>
        </div>
        <button
          onClick={() => {}}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-xl font-medium transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          Add Identity
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                activeTab === tab.id ? 'bg-[#F8B032]/10 text-[#F8B032] border border-[#F8B032]/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ============ KYC TAB ============ */}
      {activeTab === 'kyc' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Identities', value: stats.total, icon: UserCheck, color: 'blue' },
              { label: 'Verified', value: stats.verified, icon: CheckCircle, color: 'green' },
              { label: 'Pending', value: stats.pending, icon: Clock, color: 'yellow' },
              { label: 'Revoked', value: stats.revoked, icon: AlertTriangle, color: 'red' },
            ].map(s => (
              <div key={s.label} className="glass-card p-4 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-${s.color}-500/20 flex items-center justify-center`}>
                    <s.icon className={`w-5 h-5 text-${s.color}-400`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{s.label}</p>
                    <p className="text-xl font-bold text-white">{s.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" placeholder="Search by name, email, or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as KYCStatus | 'all')}
              className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-4 text-gray-300 focus:outline-none focus:border-[#F8B032]/50">
              <option value="all">All Status</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="revoked">Revoked</option>
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as IdentityType | 'all')}
              className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-4 text-gray-300 focus:outline-none focus:border-[#F8B032]/50">
              <option value="all">All Types</option>
              <option value="individual">Individual</option>
              <option value="company">Company</option>
            </select>
          </div>

          <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    {['Identity', 'Type', 'Status', 'Risk', 'Jurisdiction', 'Portfolio', 'Actions'].map(h => (
                      <th key={h} className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredIdentities.map(identity => (
                    <tr key={identity.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setSelectedIdentity(identity)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${identity.identityType === 'company' ? 'bg-purple-500/20' : 'bg-blue-500/20'}`}>
                            {identity.identityType === 'company' ? <Briefcase className="w-5 h-5 text-purple-400" /> : <User className="w-5 h-5 text-blue-400" />}
                          </div>
                          <div><p className="font-medium text-white">{identity.name}</p><p className="text-xs text-gray-500">{identity.email}</p></div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><span className="text-sm text-gray-300 capitalize">{identity.identityType}</span></td>
                      <td className="px-6 py-4">{getStatusBadge(identity.kycStatus)}</td>
                      <td className="px-6 py-4">{getRiskBadge(identity.riskTier)}</td>
                      <td className="px-6 py-4"><span className="flex items-center gap-1.5 text-sm text-gray-300"><Globe className="w-3 h-3" />{identity.jurisdiction}</span></td>
                      <td className="px-6 py-4"><span className="font-mono text-sm text-white">${identity.portfolioValue?.toLocaleString() || '0'}</span></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {identity.kycStatus === 'pending' && <button onClick={() => handleVerify(identity.id)} className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors"><CheckCircle className="w-4 h-4" /></button>}
                          {identity.kycStatus === 'verified' && <button onClick={() => handleRevoke(identity.id)} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"><Ban className="w-4 h-4" /></button>}
                          {identity.kycStatus === 'revoked' && <button onClick={() => handleRequestReverification(identity.id)} className="p-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-lg transition-colors"><RefreshCw className="w-4 h-4" /></button>}
                          <button onClick={() => setSelectedIdentity(identity)} className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg transition-colors"><Eye className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredIdentities.length === 0 && <div className="p-12 text-center text-gray-500"><UserCheck className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>No identities found</p></div>}
          </div>
        </>
      )}

      {/* ============ CCID TAB ============ */}
      {activeTab === 'ccid' && (
        <div className="space-y-6">
          {/* Registration Card */}
          <div className="glass-card p-6 rounded-xl border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#F8B032]/10 flex items-center justify-center">
                <Fingerprint className="w-5 h-5 text-[#F8B032]" />
              </div>
              <div>
                <h3 className="font-medium text-white">CCID Identity Registration</h3>
                <p className="text-xs text-gray-500">Register a wallet for cross-vertical clearance</p>
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="text" value={ccidWallet} onChange={e => setCcidWallet(e.target.value)} placeholder="0x..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg py-2.5 px-4 text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
              />
              <button onClick={handleRegisterCCID} className="px-5 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-xl font-medium transition-colors">
                {ccidIdentity ? 'Registered' : 'Register'}
              </button>
            </div>
            {ccidIdentity && (
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span>Registered: {new Date(ccidIdentity.registeredAt).toLocaleDateString()}</span>
                <span className="flex items-center gap-1"><Link2 className="w-3 h-3" />{ccidIdentity.linkedWallets.length} wallet(s)</span>
                <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-400" />{ccidIdentity.clearances.filter(c => c.cleared).length}/5 cleared</span>
              </div>
            )}
          </div>

          {/* Identity Passport */}
          {ccidIdentity && (
            <div className="glass-card p-6 rounded-xl border border-[#F8B032]/20 bg-gradient-to-br from-[#F8B032]/5 to-transparent">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#F8B032] to-[#E8A633] flex items-center justify-center">
                  <Fingerprint className="w-8 h-8 text-black" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">CCID Passport</h3>
                  <p className="text-sm text-gray-400 font-mono">{ccidWallet.slice(0, 6)}...{ccidWallet.slice(-4)}</p>
                </div>
                <div className="ml-auto flex gap-2">
                  {ccidIdentity.clearances.filter(c => c.cleared).map(c => (
                    <span key={c.vertical} className="px-2 py-1 bg-green-500/10 text-green-400 rounded text-[10px] font-medium border border-green-500/20">
                      {c.vertical.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>

              <VerticalClearanceMatrix
                wallet={ccidWallet}
                clearances={ccidIdentity.clearances}
                onCheckEligibility={handleCheckEligibility}
                onClearVertical={handleClearVertical}
                eligibilityResults={eligibilityResults}
              />
            </div>
          )}

          {!ccidIdentity && (
            <div className="glass-card p-12 rounded-xl border border-white/10 text-center">
              <Fingerprint className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500">Register a wallet to view the clearance matrix</p>
            </div>
          )}
        </div>
      )}

      {/* ============ DECO TAB ============ */}
      {activeTab === 'deco' && (
        <div className="space-y-6">
          {/* Proof Request Wizard */}
          <div className="glass-card p-6 rounded-xl border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h3 className="font-medium text-white">Create Privacy Proof</h3>
                <p className="text-xs text-gray-500">Generate zero-knowledge proofs from web data via DECO</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Proof Type</label>
                <select value={decoProofType} onChange={e => setDecoProofType(e.target.value as DecoProofType)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 text-white text-sm focus:outline-none focus:border-violet-500/50">
                  {Object.entries(PROOF_TYPE_LABELS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Predicate</label>
                <input type="text" value={decoPredicate} onChange={e => setDecoPredicate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Threshold</label>
                <input type="text" value={decoThreshold} onChange={e => setDecoThreshold(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500/50" />
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-3 mb-4 text-xs text-gray-400">
              {PROOF_TYPE_LABELS[decoProofType].description}
            </div>

            {/* Privacy visualization */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                <p className="text-[10px] text-green-400 font-medium mb-2">What verifier sees</p>
                <p className="text-xs text-gray-300 font-mono">proof_valid: true</p>
                <p className="text-xs text-gray-300 font-mono">predicate: "{decoPredicate}"</p>
                <p className="text-xs text-gray-300 font-mono">proof_hash: 0xabc...def</p>
              </div>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-[10px] text-red-400 font-medium mb-2">What stays private</p>
                <p className="text-xs text-gray-500 font-mono">actual_balance: [HIDDEN]</p>
                <p className="text-xs text-gray-500 font-mono">account_number: [HIDDEN]</p>
                <p className="text-xs text-gray-500 font-mono">institution: [HIDDEN]</p>
              </div>
            </div>

            <button onClick={handleInitiateProof} className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
              <Lock className="w-4 h-4" />
              Initiate DECO Proof
            </button>
          </div>

          {/* Proof History */}
          {decoHistory.length > 0 && (
            <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/5">
                <h4 className="font-medium text-white">Proof Sessions</h4>
              </div>
              <div className="divide-y divide-white/5">
                {decoHistory.map(session => (
                  <div key={session.sessionId} className="p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium text-white">{PROOF_TYPE_LABELS[session.proofType].label}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[session.status]}`}>
                        {session.status}
                      </span>
                      <span className="text-xs text-gray-500 ml-auto font-mono">{session.sessionId}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">Predicate: {session.predicate}</p>

                    <div className="flex items-center gap-2">
                      {/* Status progression */}
                      {[DecoSessionStatus.PENDING, DecoSessionStatus.ATTESTING, DecoSessionStatus.PROVING, DecoSessionStatus.VERIFIED].map((s, i) => (
                        <div key={s} className="flex items-center gap-1">
                          {i > 0 && <ArrowRight className="w-3 h-3 text-gray-600" />}
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            session.status === s ? STATUS_COLORS[s] + ' font-bold' :
                            Object.values(DecoSessionStatus).indexOf(session.status) > Object.values(DecoSessionStatus).indexOf(s)
                              ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-gray-600'
                          }`}>{s}</span>
                        </div>
                      ))}

                      <div className="ml-auto flex gap-2">
                        {session.status !== DecoSessionStatus.VERIFIED && session.status !== DecoSessionStatus.FAILED && session.status !== DecoSessionStatus.EXPIRED && (
                          <button
                            onClick={() => handleAdvanceSession(session.sessionId)}
                            disabled={decoAdvancing === session.sessionId}
                            className="px-3 py-1.5 bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                          >
                            {decoAdvancing === session.sessionId ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                            Advance
                          </button>
                        )}
                      </div>
                    </div>

                    {session.proofHash && (
                      <div className="mt-2 text-[10px] text-gray-500 font-mono">
                        Proof: {session.proofHash.slice(0, 20)}... | Valid until: {session.validUntil ? new Date(session.validUntil).toLocaleDateString() : '-'}
                      </div>
                    )}

                    {/* Auto-clear prompt */}
                    {showAutoClear === session.sessionId && session.status === DecoSessionStatus.VERIFIED && (
                      <div className="mt-3 p-3 bg-[#F8B032]/10 border border-[#F8B032]/20 rounded-lg flex items-center gap-3">
                        <Fingerprint className="w-5 h-5 text-[#F8B032] shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-white font-medium">Auto-clear CCID vertical?</p>
                          <p className="text-[10px] text-gray-400">This verified proof can automatically clear the relevant CCID vertical.</p>
                        </div>
                        <button onClick={() => handleAutoClearFromDeco(session.sessionId)}
                          className="px-3 py-1.5 bg-[#F8B032] text-black rounded-lg text-xs font-medium hover:bg-[#E8A633] transition-colors">
                          Clear Vertical
                        </button>
                        <button onClick={() => setShowAutoClear(null)} className="p-1.5 text-gray-400 hover:text-white">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {decoHistory.length === 0 && (
            <div className="glass-card p-12 rounded-xl border border-white/10 text-center">
              <Lock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500">No proof sessions yet. Create your first privacy proof above.</p>
            </div>
          )}
        </div>
      )}

      {/* Identity Detail Modal (KYC) */}
      {selectedIdentity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${selectedIdentity.identityType === 'company' ? 'bg-purple-500/20' : 'bg-blue-500/20'}`}>
                    {selectedIdentity.identityType === 'company' ? <Briefcase className="w-7 h-7 text-purple-400" /> : <User className="w-7 h-7 text-blue-400" />}
                  </div>
                  <div><h2 className="text-xl font-bold text-white">{selectedIdentity.name}</h2><p className="text-sm text-gray-500 font-mono">{selectedIdentity.id}</p></div>
                </div>
                <button onClick={() => setSelectedIdentity(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400"><XCircle className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                {getStatusBadge(selectedIdentity.kycStatus)}
                {getRiskBadge(selectedIdentity.riskTier)}
                {selectedIdentity.accreditedInvestor && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F8B032]/10 text-[#F8B032] rounded-full text-xs font-medium"><Shield className="w-3 h-3" /> Accredited Investor</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Email', value: selectedIdentity.email || '-', icon: Mail },
                  { label: 'Jurisdiction', value: selectedIdentity.jurisdiction, icon: Globe },
                  { label: 'Portfolio Value', value: `$${selectedIdentity.portfolioValue?.toLocaleString() || '0'}`, icon: Wallet },
                  { label: 'Total Transactions', value: String(selectedIdentity.totalTransactions || 0), icon: ArrowUpRight },
                  { label: 'Type', value: selectedIdentity.identityType, icon: User },
                  { label: 'Last Activity', value: selectedIdentity.lastActivity ? new Date(selectedIdentity.lastActivity).toLocaleDateString() : '-', icon: Calendar },
                ].map(d => (
                  <div key={d.label} className="bg-white/5 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{d.label}</p>
                    <p className="text-sm text-white flex items-center gap-2 capitalize"><d.icon className="w-4 h-4 text-gray-400" />{d.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                {selectedIdentity.kycStatus === 'pending' && (
                  <button onClick={() => { handleVerify(selectedIdentity.id); setSelectedIdentity({ ...selectedIdentity, kycStatus: 'verified' }); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors"><CheckCircle className="w-4 h-4" />Verify Identity</button>
                )}
                {selectedIdentity.kycStatus === 'verified' && (
                  <button onClick={() => { handleRevoke(selectedIdentity.id); setSelectedIdentity({ ...selectedIdentity, kycStatus: 'revoked' }); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors"><Ban className="w-4 h-4" />Revoke</button>
                )}
                {selectedIdentity.kycStatus === 'revoked' && (
                  <button onClick={() => { handleRequestReverification(selectedIdentity.id); setSelectedIdentity({ ...selectedIdentity, kycStatus: 'pending' }); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-xl font-medium transition-colors"><RefreshCw className="w-4 h-4" />Request Re-verification</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
