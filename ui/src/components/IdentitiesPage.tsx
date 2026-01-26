import { useState, useEffect } from 'react';
import {
  UserCheck, Search, Filter, Plus, ChevronDown, Shield, AlertTriangle,
  CheckCircle, XCircle, Clock, Globe, Briefcase, User, Eye, MoreVertical,
  Wallet, ArrowUpRight, Ban, RefreshCw, Mail, Phone, MapPin, Calendar
} from 'lucide-react';
import { sdkStore } from '../store';
import { Party, VerificationLevel } from '../types';

// Identity types from StripeSDKPlan Section 4.1
type KYCStatus = 'pending' | 'verified' | 'revoked' | 'expired';
type RiskTier = 'low' | 'medium' | 'high';
type IdentityType = 'individual' | 'company';

interface Identity extends Party {
  identityType: IdentityType;
  kycStatus: KYCStatus;
  riskTier: RiskTier;
  jurisdiction: string;
  email?: string;
  phone?: string;
  accreditedInvestor?: boolean;
  portfolioValue?: number;
  totalTransactions?: number;
  lastActivity?: string;
}

// Sample identities data
const SAMPLE_IDENTITIES: Identity[] = ([
  {
    id: 'idn_alice_001',
    name: 'Alice Johnson',
    identityType: 'individual',
    kycStatus: 'verified',
    verificationLevel: 2 as unknown as VerificationLevel,
    riskTier: 'low',
    jurisdiction: 'US',
    email: 'alice@example.com',
    accreditedInvestor: true,
    portfolioValue: 125000,
    totalTransactions: 45,
    lastActivity: '2024-01-15T10:30:00Z'
  },
  {
    id: 'idn_bob_002',
    name: 'Bob Smith',
    identityType: 'individual',
    kycStatus: 'pending',
    verificationLevel: 0 as unknown as VerificationLevel,
    riskTier: 'medium',
    jurisdiction: 'UK',
    email: 'bob@example.com',
    accreditedInvestor: false,
    portfolioValue: 0,
    totalTransactions: 0,
    lastActivity: '2024-01-14T15:20:00Z'
  },
  {
    id: 'idn_acme_003',
    name: 'Acme Corporation',
    identityType: 'company',
    kycStatus: 'verified',
    verificationLevel: 2 as unknown as VerificationLevel,
    riskTier: 'low',
    jurisdiction: 'AE',
    email: 'legal@acme.com',
    accreditedInvestor: true,
    portfolioValue: 2500000,
    totalTransactions: 156,
    lastActivity: '2024-01-15T09:15:00Z'
  },
  {
    id: 'idn_carol_004',
    name: 'Carol Williams',
    identityType: 'individual',
    kycStatus: 'revoked',
    verificationLevel: 0 as unknown as VerificationLevel,
    riskTier: 'high',
    jurisdiction: 'SG',
    email: 'carol@example.com',
    accreditedInvestor: false,
    portfolioValue: 50000,
    totalTransactions: 12,
    lastActivity: '2024-01-10T11:45:00Z'
  },
  {
    id: 'idn_global_005',
    name: 'Global Investments Ltd',
    identityType: 'company',
    kycStatus: 'verified',
    verificationLevel: 2 as unknown as VerificationLevel,
    riskTier: 'low',
    jurisdiction: 'CH',
    email: 'compliance@globalinv.com',
    accreditedInvestor: true,
    portfolioValue: 10000000,
    totalTransactions: 320,
    lastActivity: '2024-01-15T14:00:00Z'
  }
] as any) as Identity[];

export function IdentitiesPage() {
  const [identities, setIdentities] = useState<Identity[]>(SAMPLE_IDENTITIES);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<KYCStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<IdentityType | 'all'>('all');
  const [selectedIdentity, setSelectedIdentity] = useState<Identity | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
    switch (status) {
      case 'verified':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 text-green-400 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" /> Verified
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 text-yellow-400 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
      case 'revoked':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 text-red-400 rounded-full text-xs font-medium">
            <XCircle className="w-3 h-3" /> Revoked
          </span>
        );
      case 'expired':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-500/10 text-gray-400 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" /> Expired
          </span>
        );
    }
  };

  const getRiskBadge = (risk: RiskTier) => {
    switch (risk) {
      case 'low':
        return <span className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-[10px] font-medium">LOW</span>;
      case 'medium':
        return <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded text-[10px] font-medium">MEDIUM</span>;
      case 'high':
        return <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px] font-medium">HIGH</span>;
    }
  };

  const handleVerify = (id: string) => {
    // In a real app we'd call SDK to verify
    // sdkStore.verifyKyc(id);
    setIdentities(identities.map(i =>
      i.id === id ? { ...i, kycStatus: 'verified' as KYCStatus, verificationLevel: 2 as unknown as VerificationLevel } : i
    ));
  };

  const handleRevoke = (id: string) => {
    setIdentities(identities.map(i =>
      i.id === id ? { ...i, kycStatus: 'revoked' as KYCStatus, verificationLevel: 0 as unknown as VerificationLevel } : i
    ));
  };

  const handleRequestReverification = (id: string) => {
    setIdentities(identities.map(i =>
      i.id === id ? { ...i, kycStatus: 'pending' as KYCStatus } : i
    ));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>
            Identities
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage KYC verification, risk tiers, and compliance status
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-xl font-medium transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          Add Identity
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 rounded-xl border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Identities</p>
              <p className="text-xl font-bold text-white">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Verified</p>
              <p className="text-xl font-bold text-white">{stats.verified}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Pending</p>
              <p className="text-xl font-bold text-white">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Revoked</p>
              <p className="text-xl font-bold text-white">{stats.revoked}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name, email, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as KYCStatus | 'all')}
            className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-4 text-gray-300 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
          >
            <option value="all">All Status</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="revoked">Revoked</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as IdentityType | 'all')}
            className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-4 text-gray-300 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
          >
            <option value="all">All Types</option>
            <option value="individual">Individual</option>
            <option value="company">Company</option>
          </select>
        </div>
      </div>

      {/* Identities Table */}
      <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Identity</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Risk</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Jurisdiction</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Portfolio</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredIdentities.map(identity => (
                <tr
                  key={identity.id}
                  className="hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => setSelectedIdentity(identity)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${identity.identityType === 'company'
                        ? 'bg-purple-500/20'
                        : 'bg-blue-500/20'
                        }`}>
                        {identity.identityType === 'company' ? (
                          <Briefcase className="w-5 h-5 text-purple-400" />
                        ) : (
                          <User className="w-5 h-5 text-blue-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-white">{identity.name}</p>
                        <p className="text-xs text-gray-500">{identity.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-300 capitalize">{identity.identityType}</span>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(identity.kycStatus)}
                  </td>
                  <td className="px-6 py-4">
                    {getRiskBadge(identity.riskTier)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5 text-sm text-gray-300">
                      <Globe className="w-3 h-3" />
                      {identity.jurisdiction}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-white">
                      ${identity.portfolioValue?.toLocaleString() || '0'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {identity.kycStatus === 'pending' && (
                        <button
                          onClick={() => handleVerify(identity.id)}
                          className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors"
                          title="Verify"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {identity.kycStatus === 'verified' && (
                        <button
                          onClick={() => handleRevoke(identity.id)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                          title="Revoke"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                      {identity.kycStatus === 'revoked' && (
                        <button
                          onClick={() => handleRequestReverification(identity.id)}
                          className="p-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-lg transition-colors"
                          title="Request Re-verification"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedIdentity(identity)}
                        className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredIdentities.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No identities found</p>
          </div>
        )}
      </div>

      {/* Identity Detail Modal */}
      {selectedIdentity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-white/5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${selectedIdentity.identityType === 'company'
                    ? 'bg-purple-500/20'
                    : 'bg-blue-500/20'
                    }`}>
                    {selectedIdentity.identityType === 'company' ? (
                      <Briefcase className="w-7 h-7 text-purple-400" />
                    ) : (
                      <User className="w-7 h-7 text-blue-400" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedIdentity.name}</h2>
                    <p className="text-sm text-gray-500 font-mono">{selectedIdentity.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedIdentity(null)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Status & Risk */}
              <div className="flex items-center gap-4">
                {getStatusBadge(selectedIdentity.kycStatus)}
                {getRiskBadge(selectedIdentity.riskTier)}
                {selectedIdentity.accreditedInvestor && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F8B032]/10 text-[#F8B032] rounded-full text-xs font-medium">
                    <Shield className="w-3 h-3" /> Accredited Investor
                  </span>
                )}
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Email</p>
                  <p className="text-sm text-white flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    {selectedIdentity.email || '-'}
                  </p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Jurisdiction</p>
                  <p className="text-sm text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-gray-400" />
                    {selectedIdentity.jurisdiction}
                  </p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Portfolio Value</p>
                  <p className="text-sm text-white flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-gray-400" />
                    ${selectedIdentity.portfolioValue?.toLocaleString() || '0'}
                  </p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Total Transactions</p>
                  <p className="text-sm text-white flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-gray-400" />
                    {selectedIdentity.totalTransactions || 0}
                  </p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Type</p>
                  <p className="text-sm text-white capitalize">{selectedIdentity.identityType}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Last Activity</p>
                  <p className="text-sm text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {selectedIdentity.lastActivity
                      ? new Date(selectedIdentity.lastActivity).toLocaleDateString()
                      : '-'}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                {selectedIdentity.kycStatus === 'pending' && (
                  <button
                    onClick={() => {
                      handleVerify(selectedIdentity.id);
                      setSelectedIdentity({ ...selectedIdentity, kycStatus: 'verified' });
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Verify Identity
                  </button>
                )}
                {selectedIdentity.kycStatus === 'verified' && (
                  <>
                    <button
                      onClick={() => {
                        handleRevoke(selectedIdentity.id);
                        setSelectedIdentity({ ...selectedIdentity, kycStatus: 'revoked' });
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors"
                    >
                      <Ban className="w-4 h-4" />
                      Revoke
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors">
                      <RefreshCw className="w-4 h-4" />
                      Request Re-verification
                    </button>
                  </>
                )}
                {selectedIdentity.kycStatus === 'revoked' && (
                  <button
                    onClick={() => {
                      handleRequestReverification(selectedIdentity.id);
                      setSelectedIdentity({ ...selectedIdentity, kycStatus: 'pending' });
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-xl font-medium transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Request Re-verification
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
