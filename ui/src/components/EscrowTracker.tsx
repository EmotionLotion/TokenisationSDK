/**
 * EscrowTracker - Milestone-based Escrow Management
 *
 * Comprehensive escrow tracking for:
 * - Viewing active escrow agreements
 * - Tracking milestone progress
 * - Completing milestones with evidence
 * - Managing escrow releases
 */

import { useState } from 'react';
import {
  Lock, Unlock, CheckCircle2, Clock, AlertTriangle,
  FileText, Shield, Users, ArrowRight, ChevronDown,
  ChevronUp, Calendar, DollarSign, Wallet, RefreshCw,
  Target, Milestone as MilestoneIcon, Building, Plane
} from 'lucide-react';
import {
  useEscrow,
  Escrow,
  Milestone,
  EscrowType,
  EscrowStatus
} from '../hooks/useModules';
import { useWallet } from '../hooks/useWallet';

// ============================================================================
// TYPES
// ============================================================================

type TabId = 'active' | 'completed';

// ============================================================================
// HELPERS
// ============================================================================

function getEscrowTypeIcon(type: EscrowType) {
  switch (type) {
    case 'MILESTONE': return Target;
    case 'TIME_LOCKED': return Clock;
    case 'CONDITIONAL': return Shield;
    case 'MULTI_SIG': return Users;
    default: return Lock;
  }
}

function getEscrowTypeColor(type: EscrowType) {
  switch (type) {
    case 'MILESTONE': return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
    case 'TIME_LOCKED': return { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' };
    case 'CONDITIONAL': return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' };
    case 'MULTI_SIG': return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' };
    default: return { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' };
  }
}

function getStatusColor(status: EscrowStatus) {
  switch (status) {
    case 'ACTIVE': return 'bg-blue-500/10 text-blue-400';
    case 'FUNDED': return 'bg-green-500/10 text-green-400';
    case 'PENDING_RELEASE': return 'bg-amber-500/10 text-amber-400';
    case 'RELEASED': return 'bg-green-500/10 text-green-400';
    case 'PARTIALLY_RELEASED': return 'bg-purple-500/10 text-purple-400';
    case 'DISPUTED': return 'bg-red-500/10 text-red-400';
    default: return 'bg-gray-500/10 text-gray-400';
  }
}

function formatCurrency(amount: string, currency: string) {
  const num = parseFloat(amount);
  if (currency === 'USDC' || currency === 'USD') {
    return `$${num.toLocaleString()}`;
  }
  return `${num.toLocaleString()} ${currency}`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  color = 'amber',
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ElementType;
  color?: 'amber' | 'green' | 'blue' | 'purple';
}) {
  const colorClasses = {
    amber: 'text-[#F8B032] bg-[#F8B032]/10',
    green: 'text-green-400 bg-green-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
  };

  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
          {subValue && <p className="text-xs text-gray-500">{subValue}</p>}
        </div>
      </div>
    </div>
  );
}

function MilestoneItem({
  milestone,
  escrowId,
  onComplete,
  isLoading,
  canComplete,
}: {
  milestone: Milestone;
  escrowId: string;
  onComplete: () => void;
  isLoading: boolean;
  canComplete: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg transition-all ${
        milestone.isCompleted
          ? 'bg-green-500/5 border border-green-500/20'
          : canComplete
          ? 'bg-white/5 border border-white/10 hover:border-blue-500/30'
          : 'bg-white/5 border border-white/10 opacity-60'
      }`}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          milestone.isCompleted
            ? 'bg-green-500/20'
            : 'bg-white/10'
        }`}
      >
        {milestone.isCompleted ? (
          <CheckCircle2 className="w-5 h-5 text-green-400" />
        ) : (
          <div className="w-3 h-3 rounded-full bg-gray-500" />
        )}
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h4 className={`font-medium ${milestone.isCompleted ? 'text-green-400' : 'text-white'}`}>
            {milestone.title}
          </h4>
          <span className={`text-xs px-2 py-0.5 rounded ${
            milestone.isCompleted ? 'bg-green-500/10 text-green-400' : 'bg-white/10 text-gray-400'
          }`}>
            {milestone.releasePercentage}%
          </span>
        </div>
        <p className="text-sm text-gray-500">{milestone.description}</p>
        {milestone.completedAt && (
          <p className="text-xs text-gray-600 mt-1">
            Completed {formatDate(milestone.completedAt)}
          </p>
        )}
      </div>

      {!milestone.isCompleted && canComplete && (
        <button
          onClick={onComplete}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {isLoading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          Complete
        </button>
      )}
    </div>
  );
}

function EscrowCard({
  escrow,
  onCompleteMilestone,
  onRelease,
  isLoading,
  completingMilestoneId,
}: {
  escrow: Escrow;
  onCompleteMilestone: (milestoneId: string) => void;
  onRelease: () => void;
  isLoading: boolean;
  completingMilestoneId: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const Icon = getEscrowTypeIcon(escrow.type);
  const colors = getEscrowTypeColor(escrow.type);

  const completedPercentage = escrow.milestones
    .filter(m => m.isCompleted)
    .reduce((sum, m) => sum + m.releasePercentage, 0);

  const releasedAmount = parseFloat(escrow.releasedAmount);
  const totalAmount = parseFloat(escrow.totalAmount);
  const progressPercent = totalAmount > 0 ? (releasedAmount / totalAmount) * 100 : 0;

  // Find first incomplete milestone
  const nextMilestoneIndex = escrow.milestones.findIndex(m => !m.isCompleted);

  return (
    <div className={`bg-white/5 rounded-xl border ${colors.border} overflow-hidden`}>
      {/* Header */}
      <div
        className="p-5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center`}>
              <Icon className={`w-6 h-6 ${colors.text}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-white">{escrow.title}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(escrow.status)}`}>
                  {escrow.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-sm text-gray-400">{escrow.type.replace(/_/g, ' ')} Escrow</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{formatCurrency(escrow.totalAmount, escrow.currency)}</p>
              <p className="text-sm text-gray-500">
                {formatCurrency(escrow.releasedAmount, escrow.currency)} released
              </p>
            </div>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">Progress</span>
            <span className="text-white font-medium">{completedPercentage}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all"
              style={{ width: `${completedPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-white/10">
          {/* Parties */}
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Building className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Depositor</p>
                <p className="text-sm font-medium text-white">{escrow.depositor}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Beneficiary</p>
                <p className="text-sm font-medium text-white">{escrow.beneficiary}</p>
              </div>
            </div>
            {escrow.arbiter && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Arbiter</p>
                  <p className="text-sm font-medium text-white">{escrow.arbiter}</p>
                </div>
              </div>
            )}
          </div>

          {/* Milestones */}
          <div className="p-5">
            <h4 className="font-medium text-white mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-400" />
              Milestones ({escrow.milestones.filter(m => m.isCompleted).length}/{escrow.milestones.length})
            </h4>
            <div className="space-y-3">
              {escrow.milestones.map((milestone, index) => (
                <MilestoneItem
                  key={milestone.id}
                  milestone={milestone}
                  escrowId={escrow.id}
                  onComplete={() => onCompleteMilestone(milestone.id)}
                  isLoading={completingMilestoneId === milestone.id}
                  canComplete={index === nextMilestoneIndex}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-5 bg-white/[0.02] border-t border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Created {formatDate(escrow.createdAt)}
              </span>
              {escrow.expiresAt && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Expires {formatDate(escrow.expiresAt)}
                </span>
              )}
            </div>
            {escrow.status === 'PENDING_RELEASE' && (
              <button
                onClick={onRelease}
                disabled={isLoading}
                className="px-4 py-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
                Release Funds
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function EscrowTracker() {
  const { address, isConnected } = useWallet();
  const {
    escrows,
    isLoading,
    completeMilestone,
    releaseEscrow,
    activeEscrows,
    completedEscrows,
  } = useEscrow();

  const [activeTab, setActiveTab] = useState<TabId>('active');
  const [completingMilestoneId, setCompletingMilestoneId] = useState<string | null>(null);
  const [releasingEscrowId, setReleasingEscrowId] = useState<string | null>(null);

  const handleCompleteMilestone = async (escrowId: string, milestoneId: string) => {
    setCompletingMilestoneId(milestoneId);
    await completeMilestone(escrowId, milestoneId);
    setCompletingMilestoneId(null);
  };

  const handleRelease = async (escrowId: string) => {
    setReleasingEscrowId(escrowId);
    await releaseEscrow(escrowId);
    setReleasingEscrowId(null);
  };

  // Calculate totals
  const totalInEscrow = activeEscrows.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);
  const totalReleased = escrows.reduce((sum, e) => sum + parseFloat(e.releasedAmount), 0);

  // Not connected state
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0B1120] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-[#F8B032]/10 flex items-center justify-center mx-auto mb-6">
              <Wallet className="w-10 h-10 text-[#F8B032]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-6">
              Connect your wallet to view and manage your escrow agreements.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Escrow Tracker</h1>
            <p className="text-gray-400">Monitor milestone-based escrows and releases</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Active Escrows"
            value={activeEscrows.length.toString()}
            subValue="In progress"
            icon={Lock}
            color="blue"
          />
          <StatCard
            label="Total in Escrow"
            value={`$${totalInEscrow.toLocaleString()}`}
            subValue="Across all agreements"
            icon={DollarSign}
            color="amber"
          />
          <StatCard
            label="Total Released"
            value={`$${totalReleased.toLocaleString()}`}
            subValue="Successfully paid out"
            icon={Unlock}
            color="green"
          />
          <StatCard
            label="Completed"
            value={completedEscrows.length.toString()}
            subValue="Fully released"
            icon={CheckCircle2}
            color="purple"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-2">
          {[
            { id: 'active', label: 'Active', icon: Lock, badge: activeEscrows.length },
            { id: 'completed', label: 'Completed', icon: CheckCircle2 },
          ].map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as TabId)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                activeTab === id
                  ? 'bg-[#F8B032]/10 text-[#F8B032]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge && badge > 0 && (
                <span className="px-1.5 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="mt-6 space-y-6">
          {activeTab === 'active' && (
            <>
              {activeEscrows.length > 0 ? (
                activeEscrows.map((escrow) => (
                  <EscrowCard
                    key={escrow.id}
                    escrow={escrow}
                    onCompleteMilestone={(milestoneId) => handleCompleteMilestone(escrow.id, milestoneId)}
                    onRelease={() => handleRelease(escrow.id)}
                    isLoading={releasingEscrowId === escrow.id}
                    completingMilestoneId={completingMilestoneId}
                  />
                ))
              ) : (
                <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                  <Lock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No active escrows</p>
                  <p className="text-sm text-gray-500 mt-1">Your escrow agreements will appear here</p>
                </div>
              )}
            </>
          )}

          {activeTab === 'completed' && (
            <>
              {completedEscrows.length > 0 ? (
                completedEscrows.map((escrow) => (
                  <EscrowCard
                    key={escrow.id}
                    escrow={escrow}
                    onCompleteMilestone={() => {}}
                    onRelease={() => {}}
                    isLoading={false}
                    completingMilestoneId={null}
                  />
                ))
              ) : (
                <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                  <CheckCircle2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No completed escrows yet</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
