/**
 * GovernancePortal - DAO Voting & Proposal Management
 *
 * Comprehensive governance interface for:
 * - Viewing and voting on proposals
 * - Creating new proposals
 * - Delegating voting power
 * - Tracking governance activity
 */

import { useState } from 'react';
import {
  Vote, Users, FileText, Clock, CheckCircle2,
  XCircle, AlertCircle, ChevronRight, Shield,
  PlusCircle, Send, Wallet, TrendingUp, Award
} from 'lucide-react';
import {
  useGovernance,
  Proposal,
  ProposalType,
  VoteType
} from '../hooks/useModules';
import { useWallet } from '../hooks/useWallet';

// ============================================================================
// TYPES
// ============================================================================

type TabId = 'active' | 'passed' | 'create';

// ============================================================================
// HELPERS
// ============================================================================

function getProposalTypeColor(type: ProposalType) {
  switch (type) {
    case 'TREASURY': return { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' };
    case 'PARAMETER_CHANGE': return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
    case 'UPGRADE': return { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' };
    case 'EMERGENCY': return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' };
    case 'MEMBERSHIP': return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' };
    default: return { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' };
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'ACTIVE': return 'bg-blue-500/10 text-blue-400';
    case 'PASSED': return 'bg-green-500/10 text-green-400';
    case 'EXECUTED': return 'bg-green-500/10 text-green-400';
    case 'FAILED': return 'bg-red-500/10 text-red-400';
    case 'QUEUED': return 'bg-amber-500/10 text-amber-400';
    default: return 'bg-gray-500/10 text-gray-400';
  }
}

function formatVotes(votes: string) {
  const num = parseInt(votes);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toLocaleString();
}

function getTimeRemaining(endDate: Date) {
  const now = Date.now();
  const end = new Date(endDate).getTime();
  const diff = end - now;

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
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

function ProposalCard({
  proposal,
  onVote,
  isLoading,
}: {
  proposal: Proposal;
  onVote: (type: VoteType) => void;
  isLoading: boolean;
}) {
  const typeColors = getProposalTypeColor(proposal.type);
  const totalVotes = parseInt(proposal.votesFor) + parseInt(proposal.votesAgainst) + parseInt(proposal.votesAbstain);
  const forPercent = totalVotes > 0 ? (parseInt(proposal.votesFor) / totalVotes) * 100 : 0;
  const againstPercent = totalVotes > 0 ? (parseInt(proposal.votesAgainst) / totalVotes) * 100 : 0;

  return (
    <div className={`p-6 bg-white/5 rounded-xl border ${typeColors.border} hover:bg-white/[0.07] transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors.bg} ${typeColors.text}`}>
              {proposal.type.replace(/_/g, ' ')}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(proposal.status)}`}>
              {proposal.status}
            </span>
            {proposal.hasVoted && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-400">
                Voted {proposal.userVote}
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-white mb-1">{proposal.title}</h3>
          <p className="text-sm text-gray-400 line-clamp-2">{proposal.description}</p>
        </div>
      </div>

      {/* Voting Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-green-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            For: {formatVotes(proposal.votesFor)} ({forPercent.toFixed(1)}%)
          </span>
          <span className="text-red-400 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Against: {formatVotes(proposal.votesAgainst)} ({againstPercent.toFixed(1)}%)
          </span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${forPercent}%` }}
          />
          <div
            className="h-full bg-red-500 transition-all"
            style={{ width: `${againstPercent}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-gray-500">
            Quorum: {formatVotes(proposal.quorumRequired)} required
            {proposal.quorumReached && (
              <span className="text-green-400 ml-2">Reached</span>
            )}
          </p>
          {proposal.status === 'ACTIVE' && (
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {getTimeRemaining(proposal.votingEndsAt)}
            </p>
          )}
        </div>
      </div>

      {/* Vote Buttons */}
      {proposal.status === 'ACTIVE' && !proposal.hasVoted && (
        <div className="flex gap-3">
          <button
            onClick={() => onVote('FOR')}
            disabled={isLoading}
            className="flex-1 py-2.5 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors flex items-center justify-center gap-2 font-medium disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            Vote For
          </button>
          <button
            onClick={() => onVote('AGAINST')}
            disabled={isLoading}
            className="flex-1 py-2.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 font-medium disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Vote Against
          </button>
          <button
            onClick={() => onVote('ABSTAIN')}
            disabled={isLoading}
            className="px-4 py-2.5 bg-gray-500/10 text-gray-400 rounded-lg hover:bg-gray-500/20 transition-colors disabled:opacity-50"
          >
            Abstain
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10 text-xs text-gray-500">
        <span>Proposed by: {proposal.proposer}</span>
        <span>
          {proposal.status === 'ACTIVE'
            ? `Ends: ${new Date(proposal.votingEndsAt).toLocaleDateString()}`
            : `Created: ${new Date(proposal.createdAt).toLocaleDateString()}`}
        </span>
      </div>
    </div>
  );
}

function CreateProposalForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (params: { type: ProposalType; title: string; description: string }) => void;
  isLoading: boolean;
}) {
  const [type, setType] = useState<ProposalType>('GENERAL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    onSubmit({ type, title, description });
    setTitle('');
    setDescription('');
  };

  const proposalTypes: { value: ProposalType; label: string; description: string }[] = [
    { value: 'GENERAL', label: 'General', description: 'General community proposals' },
    { value: 'TREASURY', label: 'Treasury', description: 'Fund allocation and spending' },
    { value: 'PARAMETER_CHANGE', label: 'Parameter', description: 'Protocol parameter changes' },
    { value: 'UPGRADE', label: 'Upgrade', description: 'Smart contract upgrades' },
    { value: 'MEMBERSHIP', label: 'Membership', description: 'Membership and access changes' },
  ];

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      <div className="p-6 bg-white/5 rounded-xl border border-white/10">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-[#F8B032]" />
          Create New Proposal
        </h3>

        {/* Proposal Type */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-3">Proposal Type</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {proposalTypes.map((pt) => {
              const colors = getProposalTypeColor(pt.value);
              return (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setType(pt.value)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    type === pt.value
                      ? `${colors.border} ${colors.bg}`
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <p className={`font-medium ${type === pt.value ? colors.text : 'text-white'}`}>
                    {pt.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{pt.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a clear, concise title"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
            required
          />
        </div>

        {/* Description */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide detailed context and rationale for your proposal..."
            rows={5}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 resize-none"
            required
          />
        </div>

        {/* Info Box */}
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-400 font-medium">Before submitting</p>
              <ul className="text-xs text-gray-400 mt-1 space-y-1">
                <li>- Proposals require 1,000 AHOY to submit</li>
                <li>- Voting period lasts 7 days</li>
                <li>- 500,000 votes required for quorum</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !title.trim() || !description.trim()}
          className="w-full py-3 bg-[#F8B032] text-black font-bold rounded-lg hover:bg-[#F8B032]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Submit Proposal
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function GovernancePortal() {
  const { address, isConnected } = useWallet();
  const {
    proposals,
    delegations,
    votingPower,
    isLoading,
    createProposal,
    vote,
    activeProposals,
    passedProposals,
  } = useGovernance();

  const [activeTab, setActiveTab] = useState<TabId>('active');
  const [votingId, setVotingId] = useState<string | null>(null);

  const handleVote = async (proposalId: string, voteType: VoteType) => {
    setVotingId(proposalId);
    await vote(proposalId, voteType);
    setVotingId(null);
  };

  const handleCreateProposal = async (params: { type: ProposalType; title: string; description: string }) => {
    await createProposal(params);
    setActiveTab('active');
  };

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
              Connect your wallet to participate in governance.
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
            <h1 className="text-2xl font-bold text-white">Governance Portal</h1>
            <p className="text-gray-400">Vote on proposals and shape the future of Ahoy</p>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl">
            <Shield className="w-5 h-5 text-purple-400" />
            <div>
              <p className="text-sm text-gray-400">Your Voting Power</p>
              <p className="text-lg font-bold text-purple-400">{parseInt(votingPower).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Active Proposals"
            value={activeProposals.length.toString()}
            subValue="Open for voting"
            icon={Vote}
            color="blue"
          />
          <StatCard
            label="Passed Proposals"
            value={passedProposals.length.toString()}
            subValue="Successfully passed"
            icon={CheckCircle2}
            color="green"
          />
          <StatCard
            label="Your Votes Cast"
            value={proposals.filter(p => p.hasVoted).length.toString()}
            subValue="Proposals voted on"
            icon={Award}
            color="purple"
          />
          <StatCard
            label="Total Proposals"
            value={proposals.length.toString()}
            subValue="All time"
            icon={FileText}
            color="amber"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-2">
          {[
            { id: 'active', label: 'Active', icon: Vote, badge: activeProposals.length },
            { id: 'passed', label: 'Passed', icon: CheckCircle2 },
            { id: 'create', label: 'Create Proposal', icon: PlusCircle },
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
        <div className="mt-6">
          {/* Active Proposals Tab */}
          {activeTab === 'active' && (
            <div className="space-y-6">
              {activeProposals.length > 0 ? (
                activeProposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onVote={(voteType) => handleVote(proposal.id, voteType)}
                    isLoading={votingId === proposal.id}
                  />
                ))
              ) : (
                <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                  <Vote className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No active proposals</p>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="mt-4 px-4 py-2 bg-[#F8B032] text-black rounded-lg font-medium"
                  >
                    Create a Proposal
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Passed Proposals Tab */}
          {activeTab === 'passed' && (
            <div className="space-y-6">
              {passedProposals.length > 0 ? (
                passedProposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onVote={() => {}}
                    isLoading={false}
                  />
                ))
              ) : (
                <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                  <CheckCircle2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No passed proposals yet</p>
                </div>
              )}
            </div>
          )}

          {/* Create Proposal Tab */}
          {activeTab === 'create' && (
            <CreateProposalForm
              onSubmit={handleCreateProposal}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}
