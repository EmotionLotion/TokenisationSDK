/**
 * IdentityProfile - Identity Hub / DID Management
 *
 * Shows the "User" behind the wallet with:
 * - Verifiable Credentials (Driver License, KYC Badge)
 * - Permissions (Grant/Revoke app access)
 * - Wallet addresses and linked accounts
 */

import { useState } from 'react';
import {
  User, Shield, Key, CheckCircle2, XCircle, Clock, ExternalLink,
  Copy, ChevronDown, ChevronUp, Lock, Unlock, Eye, EyeOff, Plus,
  Fingerprint, FileCheck, Car, Plane, Droplets, Database, Award
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useParties } from '../contexts/SDKContext';

// ============================================================================
// TYPES
// ============================================================================

interface VerifiableCredential {
  id: string;
  type: string;
  name: string;
  issuer: string;
  issuedAt: string;
  expiresAt?: string;
  status: 'VALID' | 'EXPIRED' | 'REVOKED' | 'PENDING';
  icon: React.ElementType;
  color: string;
  claims: Record<string, string>;
}

interface AppPermission {
  id: string;
  appName: string;
  appIcon: React.ElementType;
  description: string;
  permissions: string[];
  grantedAt: string;
  isActive: boolean;
}

// ============================================================================
// MOCK DATA (Will be replaced with real SDK calls)
// ============================================================================

const MOCK_CREDENTIALS: VerifiableCredential[] = [
  {
    id: 'vc-kyc-1',
    type: 'KYCCredential',
    name: 'KYC Verification',
    issuer: 'Ahoy Identity Services',
    issuedAt: '2024-01-15',
    expiresAt: '2025-01-15',
    status: 'VALID',
    icon: Shield,
    color: 'text-green-400',
    claims: {
      'Full Name': 'Ahmed Al Maktoum',
      'Nationality': 'UAE',
      'Verification Level': 'Enhanced',
    },
  },
  {
    id: 'vc-driver-1',
    type: 'DriverLicense',
    name: 'Commercial Driver License',
    issuer: 'UAE RTA',
    issuedAt: '2023-06-01',
    expiresAt: '2028-06-01',
    status: 'VALID',
    icon: Car,
    color: 'text-blue-400',
    claims: {
      'License Class': 'Heavy Vehicle',
      'License Number': 'DXB-2024-****',
      'Endorsements': 'Hazmat, Tanker',
    },
  },
  {
    id: 'vc-accredited-1',
    type: 'AccreditedInvestor',
    name: 'Accredited Investor Status',
    issuer: 'DFSA',
    issuedAt: '2024-03-01',
    status: 'VALID',
    icon: Award,
    color: 'text-purple-400',
    claims: {
      'Category': 'Professional Client',
      'Net Worth Verified': 'Yes',
    },
  },
  {
    id: 'vc-water-1',
    type: 'WaterOperator',
    name: 'Water Systems Operator',
    issuer: 'DEWA',
    issuedAt: '2023-09-15',
    expiresAt: '2024-09-15',
    status: 'EXPIRED',
    icon: Droplets,
    color: 'text-cyan-400',
    claims: {
      'Certification Level': 'Class II',
      'Facility Type': 'Municipal',
    },
  },
];

const MOCK_PERMISSIONS: AppPermission[] = [
  {
    id: 'perm-comet',
    appName: 'COMET Logistics',
    appIcon: Car,
    description: 'Driver reputation and fleet management',
    permissions: ['Read Reputation Score', 'Submit Deliveries', 'View Earnings'],
    grantedAt: '2024-01-20',
    isActive: true,
  },
  {
    id: 'perm-flyplus',
    appName: 'Fly+ Aviation',
    appIcon: Plane,
    description: 'Premium travel experience',
    permissions: ['Read Travel History', 'Book Services', 'View Passes'],
    grantedAt: '2024-02-15',
    isActive: true,
  },
  {
    id: 'perm-h2o',
    appName: 'H2O Utilities',
    appIcon: Droplets,
    description: 'Water credits and sustainability',
    permissions: ['Read Meter Data', 'Trade Credits'],
    grantedAt: '2024-03-01',
    isActive: false,
  },
  {
    id: 'perm-ams',
    appName: 'AMS Marketplace',
    appIcon: Database,
    description: 'Data and algorithm marketplace',
    permissions: ['Read API Access', 'Publish Data'],
    grantedAt: '2024-01-10',
    isActive: true,
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function IdentityProfile() {
  const { session, party } = useAuth();
  const { parties } = useParties();
  const [expandedCredential, setExpandedCredential] = useState<string | null>(null);
  const [showRevokedApps, setShowRevokedApps] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const walletAddress = session?.address || '0x0000...0000';
  const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const togglePermission = (permId: string) => {
    // In production, this would call SDK to update permissions
    console.log('Toggle permission:', permId);
  };

  const getStatusBadge = (status: VerifiableCredential['status']) => {
    switch (status) {
      case 'VALID':
        return <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Valid</span>;
      case 'EXPIRED':
        return <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-full flex items-center gap-1"><XCircle className="w-3 h-3" /> Expired</span>;
      case 'REVOKED':
        return <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-full flex items-center gap-1"><XCircle className="w-3 h-3" /> Revoked</span>;
      case 'PENDING':
        return <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 text-xs rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
    }
  };

  const activePermissions = MOCK_PERMISSIONS.filter(p => p.isActive);
  const revokedPermissions = MOCK_PERMISSIONS.filter(p => !p.isActive);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Profile Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] p-6 border border-white/10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#F8B032]/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative flex items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#F8B032] to-[#D69A31] flex items-center justify-center shadow-lg">
            <User className="w-10 h-10 text-black" />
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">{party?.name || 'Anonymous User'}</h1>
              {party?.kycVerified && (
                <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> KYC Verified
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-400">
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Fingerprint className="w-4 h-4 text-[#F8B032]" />
                <span className="font-mono">{shortAddress}</span>
                {copiedAddress ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>

              <span className="flex items-center gap-1">
                <Key className="w-4 h-4" />
                Chain ID: {session?.chainId || 1}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6 mt-4">
              <div>
                <p className="text-2xl font-bold text-white">{MOCK_CREDENTIALS.filter(c => c.status === 'VALID').length}</p>
                <p className="text-xs text-gray-500">Active Credentials</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <p className="text-2xl font-bold text-white">{activePermissions.length}</p>
                <p className="text-xs text-gray-500">Connected Apps</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <p className="text-2xl font-bold text-white">{party?.roles?.length || 1}</p>
                <p className="text-xs text-gray-500">Roles</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Verifiable Credentials */}
        <div className="glass-card rounded-xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-[#F8B032]" />
              <h2 className="text-lg font-bold text-white">Verifiable Credentials</h2>
            </div>
            <button className="px-3 py-1.5 bg-[#F8B032]/10 text-[#F8B032] text-sm rounded-lg hover:bg-[#F8B032]/20 transition-colors flex items-center gap-1">
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          <div className="space-y-3">
            {MOCK_CREDENTIALS.map((cred) => (
              <div
                key={cred.id}
                className="border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors"
              >
                <button
                  onClick={() => setExpandedCredential(expandedCredential === cred.id ? null : cred.id)}
                  className="w-full p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center`}>
                      <cred.icon className={`w-5 h-5 ${cred.color}`} />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-white">{cred.name}</p>
                      <p className="text-xs text-gray-500">{cred.issuer}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(cred.status)}
                    {expandedCredential === cred.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {expandedCredential === cred.id && (
                  <div className="px-4 pb-4 border-t border-white/10 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(cred.claims).map(([key, value]) => (
                        <div key={key} className="p-2 bg-black/20 rounded-lg">
                          <p className="text-xs text-gray-500">{key}</p>
                          <p className="text-sm text-white font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                      <span>Issued: {cred.issuedAt}</span>
                      {cred.expiresAt && <span>Expires: {cred.expiresAt}</span>}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button className="flex-1 px-3 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors text-sm flex items-center justify-center gap-1">
                        <Eye className="w-4 h-4" />
                        View on Chain
                      </button>
                      <button className="flex-1 px-3 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors text-sm flex items-center justify-center gap-1">
                        <ExternalLink className="w-4 h-4" />
                        Share
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* App Permissions */}
        <div className="glass-card rounded-xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#F8B032]" />
              <h2 className="text-lg font-bold text-white">App Permissions</h2>
            </div>
            <span className="text-xs text-gray-500">{activePermissions.length} active</span>
          </div>

          <div className="space-y-3">
            {activePermissions.map((perm) => (
              <div
                key={perm.id}
                className="p-4 border border-white/10 rounded-xl hover:border-white/20 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                      <perm.appIcon className="w-5 h-5 text-[#F8B032]" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{perm.appName}</p>
                      <p className="text-xs text-gray-500">{perm.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => togglePermission(perm.id)}
                    className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs rounded-lg hover:bg-red-500/20 transition-colors"
                  >
                    Revoke
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {perm.permissions.map((p, i) => (
                    <span key={i} className="px-2 py-1 bg-white/5 text-gray-400 text-xs rounded">
                      {p}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2">Granted {perm.grantedAt}</p>
              </div>
            ))}
          </div>

          {revokedPermissions.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowRevokedApps(!showRevokedApps)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showRevokedApps ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showRevokedApps ? 'Hide' : 'Show'} revoked apps ({revokedPermissions.length})
              </button>

              {showRevokedApps && (
                <div className="mt-3 space-y-2">
                  {revokedPermissions.map((perm) => (
                    <div
                      key={perm.id}
                      className="p-3 border border-white/5 rounded-lg opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <perm.appIcon className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-400">{perm.appName}</span>
                        </div>
                        <button
                          onClick={() => togglePermission(perm.id)}
                          className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded hover:bg-green-500/20 transition-colors flex items-center gap-1"
                        >
                          <Unlock className="w-3 h-3" />
                          Restore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
