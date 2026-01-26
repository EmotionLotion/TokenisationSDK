/**
 * Institutional Demo - Dubai Real Estate Tokenization Showcase
 *
 * Reference implementation demonstrating institutional-grade tokenization
 * with real Dubai market data, UAE regulatory compliance, and full lifecycle.
 */

import { useState } from 'react';
import {
  Building2, TrendingUp, Shield, Users, FileCheck, Coins,
  ArrowRight, CheckCircle, Clock, AlertCircle, ChevronRight,
  DollarSign, Percent, Calendar, MapPin, Award, ExternalLink,
  BarChart3, PieChart, Activity, Briefcase, Scale, Building,
  Landmark, Globe, Lock, Wallet
} from 'lucide-react';

import {
  DUBAI_PROPERTIES,
  INSTITUTIONAL_PARTIES,
  COMPLIANCE_CHECKPOINTS,
  TOKENIZATION_LIFECYCLE,
  PORTFOLIO_PROJECTIONS,
  formatAED,
  formatUSD,
  getPropertyStatusColor,
  getPortfolioTotals,
  type DubaiProperty,
  type LifecycleStage,
} from '../data/dubai-properties';

type TabType = 'portfolio' | 'lifecycle' | 'compliance' | 'stakeholders' | 'projections';

export function InstitutionalDemo() {
  const [activeTab, setActiveTab] = useState<TabType>('portfolio');
  const [selectedProperty, setSelectedProperty] = useState<DubaiProperty | null>(null);

  const portfolioTotals = getPortfolioTotals();

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'portfolio', label: 'Property Portfolio', icon: <Building2 className="w-4 h-4" /> },
    { id: 'lifecycle', label: 'Tokenization Lifecycle', icon: <Activity className="w-4 h-4" /> },
    { id: 'compliance', label: 'Regulatory Compliance', icon: <Shield className="w-4 h-4" /> },
    { id: 'stakeholders', label: 'Institutional Parties', icon: <Users className="w-4 h-4" /> },
    { id: 'projections', label: 'Financial Projections', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 rounded-xl p-8 border border-blue-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-blue-500/20 rounded-xl">
            <Landmark className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Dubai Real Estate Tokenization</h1>
            <p className="text-blue-200">Institutional Reference Implementation</p>
          </div>
        </div>

        {/* Portfolio Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
            <div className="text-blue-300 text-sm mb-1">Portfolio Value</div>
            <div className="text-xl font-bold text-white">{formatAED(portfolioTotals.valuationAED)}</div>
            <div className="text-blue-400 text-xs">{formatUSD(portfolioTotals.valuationUSD)}</div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
            <div className="text-blue-300 text-sm mb-1">Annual Income</div>
            <div className="text-xl font-bold text-white">{formatAED(portfolioTotals.annualIncomeAED)}</div>
            <div className="text-emerald-400 text-xs">+5% YoY growth</div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
            <div className="text-blue-300 text-sm mb-1">Avg. Net Yield</div>
            <div className="text-xl font-bold text-white">{portfolioTotals.avgYield.toFixed(1)}%</div>
            <div className="text-blue-400 text-xs">After expenses</div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
            <div className="text-blue-300 text-sm mb-1">Total Tokens</div>
            <div className="text-xl font-bold text-white">{(portfolioTotals.totalTokens / 1000000).toFixed(0)}M</div>
            <div className="text-blue-400 text-xs">Across 5 properties</div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
            <div className="text-blue-300 text-sm mb-1">Total Area</div>
            <div className="text-xl font-bold text-white">{(portfolioTotals.totalArea / 1000).toFixed(0)}K sqft</div>
            <div className="text-blue-400 text-xs">{portfolioTotals.propertyCount} properties</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700">
        {activeTab === 'portfolio' && (
          <PortfolioTab
            properties={DUBAI_PROPERTIES}
            selectedProperty={selectedProperty}
            onSelectProperty={setSelectedProperty}
          />
        )}
        {activeTab === 'lifecycle' && <LifecycleTab stages={TOKENIZATION_LIFECYCLE} />}
        {activeTab === 'compliance' && <ComplianceTab checkpoints={COMPLIANCE_CHECKPOINTS} />}
        {activeTab === 'stakeholders' && <StakeholdersTab parties={INSTITUTIONAL_PARTIES} />}
        {activeTab === 'projections' && <ProjectionsTab projections={PORTFOLIO_PROJECTIONS} totals={portfolioTotals} />}
      </div>

      {/* SDK Integration Note */}
      <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-violet-500/20 rounded-lg">
            <Coins className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white mb-1">Powered by AHOY TokenisationSDK</h3>
            <p className="text-slate-400 text-sm">
              This institutional demo is built using the same SDK available to developers. All compliance checks,
              token operations, and lifecycle management are handled by the SDK's plugin architecture.
            </p>
            <div className="flex gap-4 mt-3">
              <code className="text-xs bg-slate-900 px-2 py-1 rounded text-emerald-400">ERC-3643 Compliant</code>
              <code className="text-xs bg-slate-900 px-2 py-1 rounded text-blue-400">Multi-Chain Ready</code>
              <code className="text-xs bg-slate-900 px-2 py-1 rounded text-violet-400">Chainlink Oracles</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PORTFOLIO TAB
// ============================================================================

function PortfolioTab({
  properties,
  selectedProperty,
  onSelectProperty,
}: {
  properties: DubaiProperty[];
  selectedProperty: DubaiProperty | null;
  onSelectProperty: (p: DubaiProperty | null) => void;
}) {
  const statusLabels: Record<DubaiProperty['status'], string> = {
    'sourcing': 'Sourcing',
    'due-diligence': 'Due Diligence',
    'legal-structuring': 'Legal Structuring',
    'regulatory-approval': 'Regulatory Approval',
    'token-issuance': 'Token Issuance',
    'live': 'Live',
    'distributing': 'Distributing',
  };

  const statusColors: Record<DubaiProperty['status'], string> = {
    'sourcing': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    'due-diligence': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'legal-structuring': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'regulatory-approval': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'token-issuance': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'live': 'bg-green-500/20 text-green-400 border-green-500/30',
    'distributing': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };

  if (selectedProperty) {
    return (
      <div className="p-6">
        <button
          onClick={() => onSelectProperty(null)}
          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          Back to Portfolio
        </button>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Property Details */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[selectedProperty.status]}`}>
                  {statusLabels[selectedProperty.status]}
                </span>
                <span className="text-slate-500 text-sm">{selectedProperty.tokenSymbol}</span>
              </div>
              <h2 className="text-2xl font-bold text-white">{selectedProperty.name}</h2>
              <div className="flex items-center gap-2 text-slate-400 mt-1">
                <MapPin className="w-4 h-4" />
                {selectedProperty.location}
              </div>
            </div>

            <p className="text-slate-300">{selectedProperty.description}</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm">Valuation</div>
                <div className="text-xl font-bold text-white">{formatAED(selectedProperty.valuationAED)}</div>
                <div className="text-slate-500 text-sm">{formatUSD(selectedProperty.valuationUSD)}</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm">Annual Income</div>
                <div className="text-xl font-bold text-white">{formatAED(selectedProperty.annualRentalIncomeAED)}</div>
                <div className="text-emerald-400 text-sm">{selectedProperty.netYield}% net yield</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm">Token Price</div>
                <div className="text-xl font-bold text-white">AED {selectedProperty.tokenPriceAED}</div>
                <div className="text-slate-500 text-sm">USD {selectedProperty.tokenPriceUSD}</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm">Occupancy</div>
                <div className="text-xl font-bold text-white">{selectedProperty.occupancyRate}%</div>
                <div className="text-slate-500 text-sm">{selectedProperty.units} units</div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-3">Investment Highlights</h3>
              <ul className="space-y-2">
                {selectedProperty.highlights.map((highlight, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300">
                    <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Property Info */}
          <div className="space-y-6">
            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-4">Property Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-500">Developer</div>
                  <div className="text-white">{selectedProperty.developer}</div>
                </div>
                <div>
                  <div className="text-slate-500">Property Type</div>
                  <div className="text-white capitalize">{selectedProperty.propertyType}</div>
                </div>
                <div>
                  <div className="text-slate-500">Total Area</div>
                  <div className="text-white">{selectedProperty.totalArea.toLocaleString()} sqft</div>
                </div>
                <div>
                  <div className="text-slate-500">Year Built</div>
                  <div className="text-white">{selectedProperty.yearBuilt}</div>
                </div>
                <div>
                  <div className="text-slate-500">Floors</div>
                  <div className="text-white">{selectedProperty.floors}</div>
                </div>
                <div>
                  <div className="text-slate-500">Units</div>
                  <div className="text-white">{selectedProperty.units}</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-4">Regulatory Information</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">RERA Permit</span>
                  <span className="text-white font-mono">{selectedProperty.reraPermitNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Title Deed</span>
                  <span className="text-white font-mono">{selectedProperty.titleDeedNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Makani No.</span>
                  <span className="text-white font-mono">{selectedProperty.makaniNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valued By</span>
                  <span className="text-white">{selectedProperty.valuedBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valuation Date</span>
                  <span className="text-white">{selectedProperty.valuationDate}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-4">Token Information</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Token Symbol</span>
                  <span className="text-white font-mono">{selectedProperty.tokenSymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Supply</span>
                  <span className="text-white">{selectedProperty.totalTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Min Investment</span>
                  <span className="text-white">{formatAED(selectedProperty.minInvestmentAED)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="grid gap-4">
        {properties.map((property) => (
          <div
            key={property.id}
            onClick={() => onSelectProperty(property)}
            className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/50 hover:border-blue-500/50 cursor-pointer transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[property.status]}`}>
                    {statusLabels[property.status]}
                  </span>
                  <span className="text-slate-500 text-sm font-mono">{property.tokenSymbol}</span>
                </div>
                <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                  {property.name}
                </h3>
                <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
                  <MapPin className="w-3 h-3" />
                  {property.district} | {property.developer}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
            </div>

            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-600/50">
              <div>
                <div className="text-slate-500 text-xs">Valuation</div>
                <div className="text-white font-semibold">{formatAED(property.valuationAED)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Net Yield</div>
                <div className="text-emerald-400 font-semibold">{property.netYield}%</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Occupancy</div>
                <div className="text-white font-semibold">{property.occupancyRate}%</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Token Price</div>
                <div className="text-white font-semibold">AED {property.tokenPriceAED}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// LIFECYCLE TAB
// ============================================================================

function LifecycleTab({ stages }: { stages: LifecycleStage[] }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Tokenization Lifecycle</h2>
        <p className="text-slate-400 mt-1">Complete journey from property sourcing to income distribution</p>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-700" />

        <div className="space-y-6">
          {stages.map((stage, index) => (
            <div key={stage.id} className="relative pl-16">
              {/* Status indicator */}
              <div className={`absolute left-4 w-5 h-5 rounded-full border-2 ${
                stage.status === 'completed'
                  ? 'bg-emerald-500 border-emerald-500'
                  : stage.status === 'current'
                  ? 'bg-blue-500 border-blue-500 animate-pulse'
                  : 'bg-slate-800 border-slate-600'
              }`}>
                {stage.status === 'completed' && (
                  <CheckCircle className="w-4 h-4 text-white" />
                )}
                {stage.status === 'current' && (
                  <Clock className="w-3 h-3 text-white m-0.5" />
                )}
              </div>

              <div className={`bg-slate-700/30 rounded-lg p-4 border ${
                stage.status === 'current'
                  ? 'border-blue-500/50'
                  : 'border-slate-600/30'
              }`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-white">{stage.name}</h3>
                    <p className="text-slate-400 text-sm">{stage.description}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    stage.status === 'completed'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : stage.status === 'current'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-slate-600/50 text-slate-400'
                  }`}>
                    {stage.duration}
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <h4 className="text-slate-500 text-xs uppercase tracking-wider mb-2">Tasks</h4>
                    <ul className="space-y-1">
                      {stage.tasks.map((task, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                          <CheckCircle className={`w-3 h-3 mt-0.5 shrink-0 ${
                            stage.status === 'completed' ? 'text-emerald-400' : 'text-slate-600'
                          }`} />
                          {task}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {stage.documents && (
                    <div>
                      <h4 className="text-slate-500 text-xs uppercase tracking-wider mb-2">Documents</h4>
                      <ul className="space-y-1">
                        {stage.documents.map((doc, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                            <FileCheck className="w-3 h-3 text-blue-400 shrink-0" />
                            {doc}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPLIANCE TAB
// ============================================================================

function ComplianceTab({ checkpoints }: { checkpoints: typeof COMPLIANCE_CHECKPOINTS }) {
  const statusConfig = {
    'pending': { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/20' },
    'in-progress': { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
    'approved': { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    'conditional': { icon: AlertCircle, color: 'text-orange-400', bg: 'bg-orange-500/20' },
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">UAE Regulatory Compliance</h2>
        <p className="text-slate-400 mt-1">All required regulatory approvals and certifications</p>
      </div>

      <div className="grid gap-4">
        {checkpoints.map((checkpoint) => {
          const config = statusConfig[checkpoint.status];
          const StatusIcon = config.icon;

          return (
            <div
              key={checkpoint.id}
              className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${config.bg}`}>
                    <StatusIcon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{checkpoint.name}</h3>
                    <p className="text-slate-400 text-sm">{checkpoint.authority}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs capitalize ${config.bg} ${config.color}`}>
                  {checkpoint.status}
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-slate-500 text-xs uppercase tracking-wider mb-2">Required Documents</h4>
                  <ul className="space-y-1">
                    {checkpoint.requiredDocuments.map((doc, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                        <FileCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                        {doc}
                      </li>
                    ))}
                  </ul>
                </div>

                {(checkpoint.completedDate || checkpoint.expiryDate) && (
                  <div className="space-y-2">
                    {checkpoint.completedDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        <span className="text-slate-400">Completed:</span>
                        <span className="text-white">{checkpoint.completedDate}</span>
                      </div>
                    )}
                    {checkpoint.expiryDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        <span className="text-slate-400">Expires:</span>
                        <span className="text-yellow-400">{checkpoint.expiryDate}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// STAKEHOLDERS TAB
// ============================================================================

function StakeholdersTab({ parties }: { parties: typeof INSTITUTIONAL_PARTIES }) {
  const roleConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    'issuer': { icon: <Building2 className="w-5 h-5" />, color: 'blue' },
    'custodian': { icon: <Lock className="w-5 h-5" />, color: 'emerald' },
    'legal': { icon: <Scale className="w-5 h-5" />, color: 'violet' },
    'auditor': { icon: <FileCheck className="w-5 h-5" />, color: 'orange' },
    'transfer-agent': { icon: <Coins className="w-5 h-5" />, color: 'teal' },
    'regulator': { icon: <Shield className="w-5 h-5" />, color: 'rose' },
    'bank': { icon: <Landmark className="w-5 h-5" />, color: 'amber' },
    'investor': { icon: <Wallet className="w-5 h-5" />, color: 'cyan' },
  };

  const getColorClasses = (color: string) => ({
    bg: `bg-${color}-500/20`,
    text: `text-${color}-400`,
    border: `border-${color}-500/30`,
  });

  // Use static classes for Tailwind
  const colorClasses: Record<string, { bg: string; text: string }> = {
    'blue': { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    'emerald': { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
    'violet': { bg: 'bg-violet-500/20', text: 'text-violet-400' },
    'orange': { bg: 'bg-orange-500/20', text: 'text-orange-400' },
    'teal': { bg: 'bg-teal-500/20', text: 'text-teal-400' },
    'rose': { bg: 'bg-rose-500/20', text: 'text-rose-400' },
    'amber': { bg: 'bg-amber-500/20', text: 'text-amber-400' },
    'cyan': { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Institutional Stakeholders</h2>
        <p className="text-slate-400 mt-1">Licensed and regulated parties involved in the tokenization</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {parties.map((party) => {
          const config = roleConfig[party.role] || { icon: <Users className="w-5 h-5" />, color: 'gray' };
          const colors = colorClasses[config.color] || colorClasses['blue'];

          return (
            <div
              key={party.id}
              className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30"
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${colors.bg}`}>
                  <div className={colors.text}>{config.icon}</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white">{party.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs capitalize ${colors.bg} ${colors.text}`}>
                      {party.role.replace('-', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
                    <Globe className="w-3 h-3" />
                    {party.jurisdiction}
                  </div>
                  {party.licenseNo && (
                    <div className="text-slate-500 text-xs mt-1 font-mono">
                      License: {party.licenseNo}
                    </div>
                  )}
                  <p className="text-slate-300 text-sm mt-2">{party.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// PROJECTIONS TAB
// ============================================================================

function ProjectionsTab({
  projections,
  totals,
}: {
  projections: typeof PORTFOLIO_PROJECTIONS;
  totals: ReturnType<typeof getPortfolioTotals>;
}) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">5-Year Financial Projections</h2>
        <p className="text-slate-400 mt-1">Projected returns based on current portfolio performance</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 rounded-lg p-4 border border-emerald-500/30">
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <TrendingUp className="w-5 h-5" />
            <span className="text-sm">5-Year Total Return</span>
          </div>
          <div className="text-3xl font-bold text-white">55.4%</div>
          <div className="text-emerald-400 text-sm">~11.1% annualized</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-lg p-4 border border-blue-500/30">
          <div className="flex items-center gap-2 text-blue-400 mb-2">
            <DollarSign className="w-5 h-5" />
            <span className="text-sm">Cumulative Distributions</span>
          </div>
          <div className="text-3xl font-bold text-white">AED 12.61</div>
          <div className="text-blue-400 text-sm">Per token over 5 years</div>
        </div>
        <div className="bg-gradient-to-br from-violet-500/20 to-violet-600/10 rounded-lg p-4 border border-violet-500/30">
          <div className="flex items-center gap-2 text-violet-400 mb-2">
            <Percent className="w-5 h-5" />
            <span className="text-sm">Avg. Appreciation</span>
          </div>
          <div className="text-3xl font-bold text-white">4.5%</div>
          <div className="text-violet-400 text-sm">Annual property value growth</div>
        </div>
      </div>

      {/* Projections Table */}
      <div className="bg-slate-700/30 rounded-lg border border-slate-600/30 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-600/50">
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Year</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Gross Income</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Operating Exp.</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">NOI</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Dist/Token</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Appreciation</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Total Return</th>
            </tr>
          </thead>
          <tbody>
            {projections.map((proj) => (
              <tr key={proj.year} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                <td className="px-4 py-3 text-white font-medium">{proj.year}</td>
                <td className="px-4 py-3 text-right text-slate-300">{formatAED(proj.grossRentalIncome)}</td>
                <td className="px-4 py-3 text-right text-slate-400">{formatAED(proj.operatingExpenses)}</td>
                <td className="px-4 py-3 text-right text-white font-medium">{formatAED(proj.netOperatingIncome)}</td>
                <td className="px-4 py-3 text-right text-emerald-400">AED {proj.distributionPerToken.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-blue-400">{proj.propertyAppreciation}%</td>
                <td className="px-4 py-3 text-right text-white font-bold">{proj.totalReturn}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Disclaimer */}
      <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
        <p className="text-yellow-400 text-xs">
          <strong>Disclaimer:</strong> These projections are based on current market conditions and historical performance.
          Actual results may vary. Past performance is not indicative of future results. Investment in real estate tokens
          involves risk including potential loss of principal.
        </p>
      </div>
    </div>
  );
}

export default InstitutionalDemo;
