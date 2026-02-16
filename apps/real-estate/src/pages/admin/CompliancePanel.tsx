import { useState, useCallback } from 'react';
import {
  Shield,
  UserCheck,
  Globe,
  CheckCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useKYC, useCompliance, useInvestor } from '@tokenisation/sdk-react';
import { useSDKWithFallback, useSDKMutationWithFallback } from '../../hooks/useSDKWithFallback';
import { COMPLIANCE_CHECKPOINTS } from '../../data/dubai-properties';
import type { ComplianceCheckpoint } from '../../data/dubai-properties';

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

interface KycInvestor {
  id: string;
  name: string;
  jurisdiction: string;
  submittedDate: string;
  riskLevel: 'low' | 'medium' | 'high';
}

const MOCK_PENDING_KYC: KycInvestor[] = [
  { id: 'kyc-1', name: 'Al Habtoor Group Holdings', jurisdiction: 'UAE', submittedDate: '2024-02-12', riskLevel: 'low' },
  { id: 'kyc-2', name: 'Kuwait Investment Authority', jurisdiction: 'Kuwait', submittedDate: '2024-02-11', riskLevel: 'low' },
  { id: 'kyc-3', name: 'Mubadala Capital Ltd', jurisdiction: 'UAE - ADGM', submittedDate: '2024-02-10', riskLevel: 'low' },
  { id: 'kyc-4', name: 'Olayan Financing Company', jurisdiction: 'Saudi Arabia', submittedDate: '2024-02-09', riskLevel: 'medium' },
  { id: 'kyc-5', name: 'Bravo Capital Partners', jurisdiction: 'Cayman Islands', submittedDate: '2024-02-08', riskLevel: 'high' },
];

const MOCK_WHITELIST_ADDRESSES = [
  { address: '0x1a2B...9cDE', label: 'Al Habtoor Family Office', added: '2024-01-20' },
  { address: '0x3f4A...7bCD', label: 'ADIA Segregated Portfolio', added: '2024-01-18' },
  { address: '0x5c6D...2eFA', label: 'Mashreq Capital Markets', added: '2024-01-15' },
  { address: '0x8e9F...4aBC', label: 'NBAD Custody Wallet', added: '2024-01-12' },
];

const MOCK_DENYLIST_ADDRESSES = [
  { address: '0xdead...beef', label: 'Sanctioned Entity A', reason: 'OFAC SDN List' },
  { address: '0xbaad...f00d', label: 'Flagged Wallet', reason: 'STR Filed - Pending Investigation' },
];

const MOCK_JURISDICTIONS = [
  { code: 'UAE', name: 'United Arab Emirates (Mainland)', active: true },
  { code: 'DIFC', name: 'Dubai International Financial Centre', active: true },
  { code: 'ADGM', name: 'Abu Dhabi Global Market', active: true },
  { code: 'KSA', name: 'Kingdom of Saudi Arabia', active: false },
  { code: 'BHR', name: 'Bahrain', active: false },
  { code: 'SGP', name: 'Singapore', active: false },
];

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

function CheckpointBadge({ status }: { status: ComplianceCheckpoint['status'] }) {
  const map: Record<ComplianceCheckpoint['status'], { icon: React.ElementType; style: string; label: string }> = {
    approved: {
      icon: CheckCircle,
      style: 'bg-green-500/10 text-green-400 border-green-500/20',
      label: 'Approved',
    },
    pending: {
      icon: Clock,
      style: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      label: 'Pending',
    },
    'in-progress': {
      icon: Clock,
      style: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      label: 'In Progress',
    },
    conditional: {
      icon: AlertTriangle,
      style: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      label: 'Conditional',
    },
  };
  const { icon: Icon, style, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${style}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function RiskBadge({ level }: { level: KycInvestor['riskLevel'] }) {
  const styles: Record<string, string> = {
    low: 'bg-green-500/10 text-green-400 border-green-500/20',
    medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    high: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${styles[level]}`}>
      {level}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  CompliancePanel                                                    */
/* ------------------------------------------------------------------ */

export function CompliancePanel() {
  const [activeTab, setActiveTab] = useState<'checkpoints' | 'kyc' | 'lists' | 'jurisdictions'>('checkpoints');

  // SDK hooks
  const kyc = useKYC();
  const compliance = useCompliance();
  const investor = useInvestor();

  // Fetch pending KYC investors from SDK, fall back to mock
  const { data: pendingKyc, refresh: refreshKyc } = useSDKWithFallback<KycInvestor[]>(
    async () => {
      const investors = await investor.list({ kycStatus: 'pending' });
      return investors.map((inv) => ({
        id: inv.id,
        name: inv.name || inv.email,
        jurisdiction: inv.jurisdiction,
        submittedDate: inv.createdAt,
        riskLevel: (inv.classification === 'high' ? 'high' : inv.classification === 'medium' ? 'medium' : 'low') as KycInvestor['riskLevel'],
      }));
    },
    MOCK_PENDING_KYC,
    [],
  );

  // Fetch whitelist addresses from SDK, fall back to mock
  const { data: whitelistAddresses } = useSDKWithFallback(
    async () => {
      const receipts = await compliance.getReceipts('whitelist');
      return receipts.map((r) => ({
        address: (r as any).walletAddress || r.id.slice(0, 12) + '...',
        label: (r as any).label || r.id,
        added: r.issuedAt || '',
      }));
    },
    MOCK_WHITELIST_ADDRESSES,
    [],
  );

  // Fetch denylist addresses from SDK, fall back to mock
  const { data: denylistAddresses } = useSDKWithFallback(
    async () => {
      const receipts = await compliance.getReceipts('denylist');
      return receipts.map((r) => ({
        address: (r as any).walletAddress || r.id.slice(0, 12) + '...',
        label: (r as any).label || r.id,
        reason: (r as any).reason || 'Flagged',
      }));
    },
    MOCK_DENYLIST_ADDRESSES,
    [],
  );

  // Fetch jurisdictions from SDK, fall back to mock
  const { data: jurisdictions } = useSDKWithFallback(
    async () => {
      const receipts = await compliance.getReceipts('jurisdictions');
      return receipts.map((r) => ({
        code: (r as any).code || r.id,
        name: (r as any).name || r.id,
        active: (r as any).active ?? true,
      }));
    },
    MOCK_JURISDICTIONS,
    [],
  );

  // Approve KYC mutation
  const approveKycMutation = useSDKMutationWithFallback(
    useCallback(
      async (investorId: string) => {
        return await investor.approveKyc(investorId);
      },
      [investor],
    ),
    useCallback(
      async (_investorId: string) => {
        // Simulate approval with a small delay
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { id: _investorId, status: 'approved' } as any;
      },
      [],
    ),
  );

  // Reject KYC mutation (using suspend as reject equivalent)
  const rejectKycMutation = useSDKMutationWithFallback(
    useCallback(
      async (investorId: string) => {
        return await investor.suspend(investorId, 'KYC rejected');
      },
      [investor],
    ),
    useCallback(
      async (_investorId: string) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { id: _investorId, status: 'rejected' } as any;
      },
      [],
    ),
  );

  const handleApproveKyc = async (investorId: string) => {
    await approveKycMutation.execute(investorId);
    refreshKyc();
  };

  const handleRejectKyc = async (investorId: string) => {
    await rejectKycMutation.execute(investorId);
    refreshKyc();
  };

  const tabs = [
    { key: 'checkpoints' as const, label: 'Regulatory Checkpoints', icon: Shield },
    { key: 'kyc' as const, label: 'KYC Queue', icon: UserCheck },
    { key: 'lists' as const, label: 'Whitelist / Denylist', icon: CheckCircle },
    { key: 'jurisdictions' as const, label: 'Jurisdictions', icon: Globe },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Panel</h1>
          <p className="text-sm text-gray-400">Regulatory oversight and investor verification</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                activeTab === t.key
                  ? 'bg-primary/10 text-white border-primary/30'
                  : 'bg-white/5 text-gray-400 hover:text-white border-white/10 hover:border-white/20'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ---- Regulatory Checkpoints ---- */}
      {activeTab === 'checkpoints' && (
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-white">UAE Regulatory Checkpoints</h2>
          </div>
          <div className="divide-y divide-white/5">
            {COMPLIANCE_CHECKPOINTS.map((cp) => (
              <div key={cp.id} className="px-6 py-5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{cp.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{cp.authority}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {cp.requiredDocuments.map((doc) => (
                        <span
                          key={doc}
                          className="inline-flex items-center rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-gray-400"
                        >
                          {doc}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <CheckpointBadge status={cp.status} />
                    {cp.completedDate && (
                      <span className="text-[10px] text-gray-600">
                        Completed: {cp.completedDate}
                      </span>
                    )}
                    {cp.expiryDate && (
                      <span className="text-[10px] text-gray-600">
                        Expires: {cp.expiryDate}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- KYC Queue ---- */}
      {activeTab === 'kyc' && (
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-white">KYC Review Queue</h2>
            </div>
            <span className="inline-flex items-center rounded-full bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-0.5 text-[11px] font-medium text-yellow-400">
              {pendingKyc.length} Pending
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Investor</th>
                  <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Jurisdiction</th>
                  <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Submitted</th>
                  <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Risk</th>
                  <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pendingKyc.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-white font-medium">{inv.name}</td>
                    <td className="px-6 py-4 text-gray-400">{inv.jurisdiction}</td>
                    <td className="px-6 py-4 text-gray-400 font-mono text-xs">{inv.submittedDate}</td>
                    <td className="px-6 py-4"><RiskBadge level={inv.riskLevel} /></td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleApproveKyc(inv.id)}
                          disabled={approveKycMutation.loading}
                          className="px-3 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectKyc(inv.id)}
                          disabled={rejectKycMutation.loading}
                          className="px-3 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Whitelist / Denylist ---- */}
      {activeTab === 'lists' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Whitelist */}
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <h2 className="text-sm font-semibold text-white">Whitelisted Addresses</h2>
              </div>
              <span className="text-[11px] text-gray-500 font-medium">{whitelistAddresses.length} addresses</span>
            </div>
            <div className="divide-y divide-white/5">
              {whitelistAddresses.map((addr) => (
                <div key={addr.address} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div>
                    <p className="text-sm text-white font-medium">{addr.label}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{addr.address}</p>
                  </div>
                  <span className="text-[10px] text-gray-600">{addr.added}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Denylist */}
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h2 className="text-sm font-semibold text-white">Denylisted Addresses</h2>
              </div>
              <span className="text-[11px] text-gray-500 font-medium">{denylistAddresses.length} addresses</span>
            </div>
            <div className="divide-y divide-white/5">
              {denylistAddresses.map((addr) => (
                <div key={addr.address} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div>
                    <p className="text-sm text-white font-medium">{addr.label}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{addr.address}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] text-red-400">
                    {addr.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Jurisdictions ---- */}
      {activeTab === 'jurisdictions' && (
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-white">Jurisdiction Configuration</h2>
          </div>
          <div className="divide-y divide-white/5">
            {jurisdictions.map((j) => (
              <div key={j.code} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${j.active ? 'bg-green-400' : 'bg-gray-600'}`}
                  />
                  <div>
                    <p className="text-sm text-white font-medium">{j.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Code: {j.code}</p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                    j.active
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-white/5 text-gray-500 border-white/10'
                  }`}
                >
                  {j.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
