import { useState } from 'react';
import {
  Building2, Ticket, Leaf, Coins, Award, FileText,
  Plus, ChevronRight, Settings, Shield, Clock, Users,
  Check, X, Edit2, Trash2, Copy, Eye,
  Layers, TrendingUp, Vote, DollarSign, Lock
} from 'lucide-react';

// Asset Profile Types (from StripeSDKPlan)
export type AssetProfile = 'regulated_fungible' | 'semi_fungible' | 'unique' | 'simple_fungible' | 'partitioned' | 'vault';

export interface AssetTemplate {
  id: string;
  name: string;
  description: string;
  profile: AssetProfile;
  icon: string;
  color: string;
  schema: {
    required: string[];
    optional: string[];
  };
  defaultPolicies: string[];
  lifecycleActions: string[];
  tokenStandard: 'ERC20' | 'ERC721' | 'ERC1155' | 'ERC3643' | 'ERC1410' | 'ERC4626';
  jurisdiction?: string;
  createdAt: string;
  usageCount: number;
  /** New SDK features this template showcases */
  features?: ('governance' | 'cashflow' | 'escrow' | 'hooks' | 'partitions' | 'vault')[];
}

// Pre-built templates
const DEFAULT_TEMPLATES: AssetTemplate[] = [
  {
    id: 'tpl_real_estate',
    name: 'Real Estate',
    description: 'Tokenized property ownership with compliance and distributions',
    profile: 'regulated_fungible',
    icon: 'building',
    color: 'blue',
    schema: {
      required: ['propertyType', 'address', 'valuationAmount', 'deedNumber'],
      optional: ['area', 'yearBuilt', 'zoning', 'tenantInfo']
    },
    defaultPolicies: ['kyc_required', 'accredited_investor', 'jurisdiction_whitelist', 'lockup_90d'],
    lifecycleActions: ['issue', 'transfer', 'distribute', 'redeem', 'freeze'],
    tokenStandard: 'ERC3643',
    jurisdiction: 'AE',
    createdAt: '2024-01-15',
    usageCount: 24
  },
  {
    id: 'tpl_carbon_credit',
    name: 'Carbon Credit',
    description: 'Verified carbon offset certificates with retirement tracking',
    profile: 'semi_fungible',
    icon: 'leaf',
    color: 'green',
    schema: {
      required: ['projectId', 'vintage', 'standard', 'tonnes'],
      optional: ['registry', 'serialNumber', 'verifier']
    },
    defaultPolicies: ['kyc_required', 'retirement_burn'],
    lifecycleActions: ['issue', 'transfer', 'retire'],
    tokenStandard: 'ERC1155',
    createdAt: '2024-02-01',
    usageCount: 156
  },
  {
    id: 'tpl_event_ticket',
    name: 'Event Ticket',
    description: 'Transferable event access with resale controls',
    profile: 'unique',
    icon: 'ticket',
    color: 'purple',
    schema: {
      required: ['eventName', 'eventDate', 'venue', 'seatInfo'],
      optional: ['tier', 'resalePriceCap', 'transferable']
    },
    defaultPolicies: ['resale_cap', 'event_expiry'],
    lifecycleActions: ['issue', 'transfer', 'scan', 'expire'],
    tokenStandard: 'ERC721',
    createdAt: '2024-01-20',
    usageCount: 89
  },
  {
    id: 'tpl_loyalty_points',
    name: 'Loyalty Points',
    description: 'Fungible reward tokens with earn and burn mechanics',
    profile: 'simple_fungible',
    icon: 'coins',
    color: 'yellow',
    schema: {
      required: ['programName', 'pointsPerUnit'],
      optional: ['expiryMonths', 'tierMultiplier']
    },
    defaultPolicies: ['no_kyc', 'expiry_12m'],
    lifecycleActions: ['issue', 'transfer', 'redeem', 'expire'],
    tokenStandard: 'ERC20',
    createdAt: '2024-01-10',
    usageCount: 312
  },
  {
    id: 'tpl_invoice',
    name: 'Invoice / Receivable',
    description: 'Tokenized invoices for trade finance and factoring',
    profile: 'unique',
    icon: 'file',
    color: 'cyan',
    schema: {
      required: ['invoiceNumber', 'amount', 'currency', 'dueDate', 'debtor'],
      optional: ['purchaseOrder', 'terms', 'discountRate']
    },
    defaultPolicies: ['kyc_required', 'accredited_investor', 'single_transfer'],
    lifecycleActions: ['issue', 'transfer', 'redeem'],
    tokenStandard: 'ERC721',
    createdAt: '2024-03-01',
    usageCount: 45
  },
  {
    id: 'tpl_certificate',
    name: 'Certificate / Credential',
    description: 'Non-transferable credentials and certifications (SBT)',
    profile: 'unique',
    icon: 'award',
    color: 'orange',
    schema: {
      required: ['certificateType', 'issuer', 'issuedTo', 'validFrom'],
      optional: ['validUntil', 'score', 'level']
    },
    defaultPolicies: ['non_transferable', 'issuer_revocable'],
    lifecycleActions: ['issue', 'revoke', 'expire'],
    tokenStandard: 'ERC721',
    createdAt: '2024-02-15',
    usageCount: 78
  },
  // ============================================================================
  // NEW SDK CAPABILITIES - Advanced Templates
  // ============================================================================
  {
    id: 'tpl_security_partitioned',
    name: 'Partitioned Security',
    description: 'Multi-class shares with lock-up periods and transfer restrictions per tranche',
    profile: 'partitioned',
    icon: 'layers',
    color: 'indigo',
    schema: {
      required: ['issuerName', 'securityType', 'totalShares', 'shareClasses'],
      optional: ['vestingSchedule', 'lockupPeriods', 'accreditedOnly']
    },
    defaultPolicies: ['kyc_required', 'accredited_investor', 'partition_lockup', 'class_transfer_rules'],
    lifecycleActions: ['issue_by_partition', 'transfer_by_partition', 'unlock', 'redeem'],
    tokenStandard: 'ERC1410',
    jurisdiction: 'US',
    createdAt: '2025-01-01',
    usageCount: 18,
    features: ['partitions', 'hooks']
  },
  {
    id: 'tpl_yield_vault',
    name: 'Yield-Bearing Vault',
    description: 'Auto-compounding yield tokens for staking, lending, or revenue pools',
    profile: 'vault',
    icon: 'trending',
    color: 'emerald',
    schema: {
      required: ['vaultName', 'underlyingAsset', 'yieldStrategy', 'minimumDeposit'],
      optional: ['withdrawalDelay', 'performanceFee', 'managementFee']
    },
    defaultPolicies: ['kyc_optional', 'withdrawal_cooldown', 'fee_structure'],
    lifecycleActions: ['deposit', 'withdraw', 'compound', 'harvest'],
    tokenStandard: 'ERC4626',
    createdAt: '2025-01-01',
    usageCount: 42,
    features: ['vault', 'cashflow']
  },
  {
    id: 'tpl_governance_token',
    name: 'DAO Governance Token',
    description: 'Voting tokens with delegation, proposals, and quadratic voting support',
    profile: 'simple_fungible',
    icon: 'vote',
    color: 'violet',
    schema: {
      required: ['daoName', 'votingStrategy', 'proposalThreshold', 'quorumPercent'],
      optional: ['delegationEnabled', 'votingPeriod', 'timelockDelay']
    },
    defaultPolicies: ['no_kyc', 'delegation_enabled', 'snapshot_voting'],
    lifecycleActions: ['propose', 'vote', 'delegate', 'execute', 'cancel'],
    tokenStandard: 'ERC20',
    createdAt: '2025-01-01',
    usageCount: 67,
    features: ['governance', 'hooks']
  },
  {
    id: 'tpl_revenue_share',
    name: 'Revenue Share Token',
    description: 'Automatic dividend/royalty distribution with pro-rata allocation',
    profile: 'regulated_fungible',
    icon: 'dollar',
    color: 'teal',
    schema: {
      required: ['projectName', 'revenueSource', 'distributionFrequency', 'paymentCurrency'],
      optional: ['minimumPayout', 'holdingPeriod', 'tierMultipliers']
    },
    defaultPolicies: ['kyc_required', 'holding_period_30d', 'auto_distribution'],
    lifecycleActions: ['issue', 'transfer', 'distribute', 'claim', 'reinvest'],
    tokenStandard: 'ERC3643',
    createdAt: '2025-01-01',
    usageCount: 34,
    features: ['cashflow', 'hooks']
  },
  {
    id: 'tpl_escrowed_purchase',
    name: 'Escrowed Purchase',
    description: 'Milestone-based escrow for high-value transactions with dispute resolution',
    profile: 'unique',
    icon: 'lock',
    color: 'rose',
    schema: {
      required: ['assetDescription', 'totalPrice', 'milestones', 'beneficiary'],
      optional: ['arbiter', 'disputeWindow', 'autoRelease']
    },
    defaultPolicies: ['kyc_required', 'milestone_release', 'dispute_resolution'],
    lifecycleActions: ['fund', 'approve_milestone', 'release', 'dispute', 'refund'],
    tokenStandard: 'ERC721',
    createdAt: '2025-01-01',
    usageCount: 23,
    features: ['escrow', 'hooks']
  }
];

const PROFILE_INFO: Record<AssetProfile, { label: string; description: string; standard: string }> = {
  regulated_fungible: {
    label: 'Regulated Fungible',
    description: 'Divisible tokens with compliance controls (real estate, securities)',
    standard: 'ERC-20 / ERC-3643'
  },
  semi_fungible: {
    label: 'Semi-Fungible',
    description: 'Batched tokens with shared properties (carbon credits, commodities)',
    standard: 'ERC-1155'
  },
  unique: {
    label: 'Unique / NFT',
    description: 'One-of-a-kind tokens (tickets, certificates, invoices)',
    standard: 'ERC-721'
  },
  simple_fungible: {
    label: 'Simple Fungible',
    description: 'Basic divisible tokens without restrictions (loyalty, utility)',
    standard: 'ERC-20'
  },
  partitioned: {
    label: 'Partitioned Securities',
    description: 'Multi-class tokens with share tranches and lock-ups (securities, vesting)',
    standard: 'ERC-1410'
  },
  vault: {
    label: 'Yield Vault',
    description: 'Auto-compounding yield-bearing tokens (staking, lending pools)',
    standard: 'ERC-4626'
  }
};

interface AssetTemplatesProps {
  onSelectTemplate: (template: AssetTemplate) => void;
  onCreateCustom: () => void;
}

export function AssetTemplates({ onSelectTemplate, onCreateCustom }: AssetTemplatesProps) {
  const [templates] = useState<AssetTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedProfile, setSelectedProfile] = useState<AssetProfile | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTemplates = templates.filter(t => {
    const matchesProfile = selectedProfile === 'all' || t.profile === selectedProfile;
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesProfile && matchesSearch;
  });

  const getIcon = (iconName: string, className: string) => {
    switch (iconName) {
      case 'building': return <Building2 className={className} />;
      case 'leaf': return <Leaf className={className} />;
      case 'ticket': return <Ticket className={className} />;
      case 'coins': return <Coins className={className} />;
      case 'file': return <FileText className={className} />;
      case 'award': return <Award className={className} />;
      case 'layers': return <Layers className={className} />;
      case 'trending': return <TrendingUp className={className} />;
      case 'vote': return <Vote className={className} />;
      case 'dollar': return <DollarSign className={className} />;
      case 'lock': return <Lock className={className} />;
      default: return <FileText className={className} />;
    }
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      green: 'bg-green-500/10 text-green-400 border-green-500/20',
      purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
      teal: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
      rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };
    return colors[color] || colors.blue;
  };

  const getFeatureBadgeClasses = (feature: string) => {
    const badges: Record<string, { label: string; classes: string }> = {
      governance: { label: 'Governance', classes: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
      cashflow: { label: 'Cash Flow', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      escrow: { label: 'Escrow', classes: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
      hooks: { label: 'Hooks', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      partitions: { label: 'Partitions', classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
      vault: { label: 'Vault', classes: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
    };
    return badges[feature] || { label: feature, classes: 'bg-gray-500/10 text-gray-400 border-gray-500/20' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>
            Asset Templates
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Choose a template or create a custom asset class
          </p>
        </div>
        <button
          onClick={onCreateCustom}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-xl font-medium transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          Create Custom
        </button>
      </div>

      {/* Profile Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedProfile('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            selectedProfile === 'all'
              ? 'bg-[#F8B032]/20 text-[#F8B032] border border-[#F8B032]/30'
              : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
          }`}
        >
          All Templates
        </button>
        {Object.entries(PROFILE_INFO).map(([key, info]) => (
          <button
            key={key}
            onClick={() => setSelectedProfile(key as AssetProfile)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedProfile === key
                ? 'bg-[#F8B032]/20 text-[#F8B032] border border-[#F8B032]/30'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            {info.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
        />
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            onClick={() => onSelectTemplate(template)}
            className="glass-card p-5 rounded-xl border border-white/10 hover:border-[#F8B032]/30 cursor-pointer transition-all group hover:-translate-y-1"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${getColorClasses(template.color)}`}>
                {getIcon(template.icon, 'w-6 h-6')}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-gray-500 bg-white/5 px-2 py-1 rounded">
                {PROFILE_INFO[template.profile].label}
              </span>
            </div>

            {/* Content */}
            <h3 className="text-lg font-bold text-white group-hover:text-[#F8B032] transition-colors">
              {template.name}
            </h3>
            <p className="text-sm text-gray-400 mt-1 line-clamp-2">
              {template.description}
            </p>

            {/* Feature Badges (for new SDK capabilities) */}
            {template.features && template.features.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {template.features.map((feature) => {
                  const badge = getFeatureBadgeClasses(feature);
                  return (
                    <span
                      key={feature}
                      className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.classes}`}
                    >
                      {badge.label}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Meta */}
            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  {template.defaultPolicies.length} rules
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {template.lifecycleActions.length} actions
                </span>
              </div>
              <span className="text-xs text-gray-500">
                {template.usageCount} uses
              </span>
            </div>

            {/* Token Standard Badge */}
            <div className="mt-3">
              <span className="text-[10px] font-mono text-gray-500 bg-white/5 px-2 py-1 rounded">
                {template.tokenStandard}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredTemplates.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>No templates match your criteria</p>
        </div>
      )}

      {/* Profile Legend */}
      <div className="glass-card p-5 rounded-xl border border-white/10">
        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
          Asset Profile Guide
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(PROFILE_INFO).map(([key, info]) => (
            <div key={key} className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-[#F8B032] mt-1.5" />
              <div>
                <p className="text-sm font-medium text-white">{info.label}</p>
                <p className="text-xs text-gray-500">{info.description}</p>
                <p className="text-[10px] font-mono text-gray-600 mt-1">{info.standard}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_TEMPLATES, PROFILE_INFO };
