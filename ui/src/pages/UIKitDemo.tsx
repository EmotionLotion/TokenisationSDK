/**
 * UI Kit Demo Page - Generic "Stripe Elements for Assets"
 *
 * Showcases all generic SDK components that work with ANY asset type.
 * Same components, different data - Real Estate, Carbon Credits, Tickets, etc.
 */

import React, { useState } from 'react';
import {
  // Atoms
  StatusBadge,
  ComplianceBadge,
  TokenAmount,
  PriceDisplay,
  BalanceDisplay,
  AddressAvatar,
  ContractAddress,
  // Components
  GenericAssetCard,
  AssetGrid,
  ActionStation,
  InvestmentFlow,
  // Templates
  getAllTemplates,
  getTemplate,
  getActionLabel,
  // Types
  type AssetInstance,
  type TemplateType,
} from '../../../ui-kit/src/generic';

// ============================================================================
// MOCK DATA - Same structure works for ALL asset types
// ============================================================================

const mockAssets: AssetInstance[] = [
  // Real Estate
  {
    id: 'asset_re_001',
    templateId: 'tmpl_real_estate_v1',
    template: getTemplate('real_estate'),
    metadata: {
      name: 'Marina View Tower A - Unit 1204',
      description: 'Luxury waterfront apartment in Dubai Marina with stunning views',
      image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400',
      propertyAddress: 'Marina Walk, Dubai Marina, UAE',
      propertyType: 'Residential',
      appraisalValue: 2500000,
      annualYield: 7.5,
    },
    supply: { model: 'fixed', total: '10000000', decimals: 6 },
    status: 'active',
    issuerId: 'issuer_001',
    jurisdiction: 'UAE',
    policies: [],
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    currentPrice: '250',
    holdersCount: 156,
  },
  // Carbon Credit
  {
    id: 'asset_cc_001',
    templateId: 'tmpl_carbon_credit_v1',
    template: getTemplate('carbon_credit'),
    metadata: {
      name: 'Amazon Rainforest REDD+ Credits',
      description: 'Verified carbon credits from forest conservation project in Brazil',
      image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400',
      registryId: 'VCS-1234',
      registryName: 'Verra',
      projectType: 'Forestry',
      vintage: 2023,
      co2Tonnes: 1,
      projectLocation: 'Brazil',
    },
    supply: { model: 'capped', total: '500000', decimals: 0 },
    status: 'active',
    issuerId: 'issuer_002',
    jurisdiction: 'BR',
    policies: [],
    createdAt: '2024-02-01T10:00:00Z',
    updatedAt: '2024-02-01T10:00:00Z',
    currentPrice: '15',
    holdersCount: 89,
  },
  // Event Ticket
  {
    id: 'asset_tk_001',
    templateId: 'tmpl_ticket_v1',
    template: getTemplate('ticket'),
    metadata: {
      name: 'Web3 Summit 2024 - VIP Pass',
      description: 'Full access VIP ticket with backstage access and exclusive networking',
      image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400',
      eventName: 'Web3 Summit 2024',
      eventDate: '2024-06-15',
      venue: 'Dubai World Trade Centre',
      ticketType: 'VIP',
    },
    supply: { model: 'fixed', total: '500', decimals: 0 },
    status: 'active',
    issuerId: 'issuer_003',
    jurisdiction: 'UAE',
    policies: [],
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: '2024-03-01T10:00:00Z',
    currentPrice: '500',
    holdersCount: 245,
  },
  // Royalty Stream
  {
    id: 'asset_ry_001',
    templateId: 'tmpl_royalty_v1',
    template: getTemplate('royalty'),
    metadata: {
      name: 'Indie Album - "Electric Dreams"',
      description: 'Share in streaming royalties from hit indie album',
      image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400',
      assetTitle: 'Electric Dreams',
      assetType: 'Music',
      royaltyPercentage: 25,
      distributionFrequency: 'Monthly',
    },
    supply: { model: 'fixed', total: '100000', decimals: 2 },
    status: 'active',
    issuerId: 'issuer_004',
    jurisdiction: 'US',
    policies: [],
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
    currentPrice: '10',
    holdersCount: 412,
  },
  // Commodity
  {
    id: 'asset_gd_001',
    templateId: 'tmpl_commodity_v1',
    template: getTemplate('commodity'),
    metadata: {
      name: 'Gold Bullion Token',
      description: 'Each token backed by 1 troy oz of LBMA gold',
      image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=400',
      commodityType: 'Gold',
      unitWeight: '1 troy oz',
      custodian: 'Brinks Vault Singapore',
      purityGrade: '99.99% pure',
    },
    supply: { model: 'elastic', total: '50000', decimals: 6 },
    status: 'active',
    issuerId: 'issuer_005',
    jurisdiction: 'SG',
    policies: [],
    createdAt: '2024-02-15T10:00:00Z',
    updatedAt: '2024-02-15T10:00:00Z',
    currentPrice: '2050',
    holdersCount: 1250,
  },
  // Loyalty Points (non-transferable)
  {
    id: 'asset_lp_001',
    templateId: 'tmpl_loyalty_v1',
    template: getTemplate('loyalty'),
    metadata: {
      name: 'Ahoy Rewards Points',
      description: 'Earn and redeem for exclusive benefits',
      programName: 'Ahoy Rewards',
      pointValue: 0.01,
      expiryMonths: 24,
    },
    supply: { model: 'elastic', total: '1000000000', decimals: 0 },
    status: 'active',
    issuerId: 'issuer_006',
    jurisdiction: 'UAE',
    policies: [],
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T10:00:00Z',
    holdersCount: 5420,
  },
];

// ============================================================================
// DEMO CARD COMPONENT
// ============================================================================

function DemoCard({
  title,
  description,
  children,
  className = '',
  codeExample,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
  codeExample?: string;
}) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div className={`p-6 bg-white/5 rounded-xl border border-white/10 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        {codeExample && (
          <button
            onClick={() => setShowCode(!showCode)}
            className="px-2 py-1 text-xs rounded bg-white/10 text-gray-400 hover:text-white"
          >
            {showCode ? 'Hide Code' : 'Show Code'}
          </button>
        )}
      </div>
      <div className="mb-4">{children}</div>
      {showCode && codeExample && (
        <pre className="mt-4 p-3 rounded-lg bg-gray-900 border border-white/10 overflow-x-auto text-xs text-gray-300">
          <code>{codeExample}</code>
        </pre>
      )}
    </div>
  );
}

// ============================================================================
// MAIN DEMO PAGE
// ============================================================================

export function UIKitDemo() {
  const [selectedAsset, setSelectedAsset] = useState<AssetInstance | null>(null);
  const [showInvestFlow, setShowInvestFlow] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('overview');

  const templates = getAllTemplates();

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'templates', label: 'Templates' },
    { id: 'atoms', label: 'Atoms' },
    { id: 'cards', label: 'Asset Cards' },
    { id: 'grid', label: 'Asset Grid' },
    { id: 'actions', label: 'Actions' },
    { id: 'flow', label: 'Investment Flow' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-gray-900/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold mb-1">
            Generic UI Kit Demo
          </h1>
          <p className="text-gray-400 text-sm">
            "Stripe Elements for Assets" - Same components work for Real Estate, Carbon, Tickets, and more
          </p>
        </div>
        {/* Section Nav */}
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
        {/* Overview Section */}
        {activeSection === 'overview' && (
          <div className="space-y-8">
            <div className="p-6 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-white/10">
              <h2 className="text-xl font-semibold mb-2">The Philosophy</h2>
              <p className="text-gray-300 mb-4">
                One codebase, infinite asset types. These components automatically adapt based on the
                asset's template - showing different fields, actions, and UI for each type.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['real_estate', 'carbon_credit', 'ticket', 'royalty'].map((type) => {
                  const template = getTemplate(type as TemplateType);
                  return (
                    <div
                      key={type}
                      className="p-3 rounded-lg bg-white/5 border border-white/10"
                      style={{ borderLeftColor: template?.color, borderLeftWidth: 3 }}
                    >
                      <div className="font-medium text-white text-sm">{template?.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {template?.availableActions.slice(0, 3).join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {mockAssets.slice(0, 3).map((asset) => (
                <GenericAssetCard
                  key={asset.id}
                  asset={asset}
                  variant="detailed"
                  onClick={setSelectedAsset}
                  onPrimaryAction={(a) => {
                    setSelectedAsset(a);
                    setShowInvestFlow(true);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Templates Section */}
        {activeSection === 'templates' && (
          <div className="space-y-6">
            <p className="text-gray-400">
              Pre-defined templates for common asset types. Each defines schema, actions, and policies.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all"
                  style={{ borderTopColor: template.color, borderTopWidth: 3 }}
                >
                  <h3 className="font-semibold text-white mb-1">{template.name}</h3>
                  <p className="text-xs text-gray-500 mb-3">{template.description}</p>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs text-gray-600">Profile:</span>
                      <span className="text-xs text-gray-400 ml-2">{template.profile}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-600">Actions:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.availableActions.map((action) => (
                          <span
                            key={action}
                            className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-gray-400"
                          >
                            {getActionLabel(action)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-600">Rights:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.rights.transferable && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                            Transferable
                          </span>
                        )}
                        {template.rights.redeemable && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
                            Redeemable
                          </span>
                        )}
                        {template.rights.retirable && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
                            Retirable
                          </span>
                        )}
                        {template.rights.payoutEnabled && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                            Payouts
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Atoms Section */}
        {activeSection === 'atoms' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DemoCard
              title="StatusBadge"
              description="Visual indicators for asset and identity status"
              codeExample={`<StatusBadge status="active" showDot pulse />
<StatusBadge status="pending_verification" />
<ComplianceBadge status="compliant" />`}
            >
              <div className="flex flex-wrap gap-3 mb-4">
                <StatusBadge status="active" showDot pulse />
                <StatusBadge status="pending_verification" showDot />
                <StatusBadge status="frozen" />
                <StatusBadge status="expired" />
                <StatusBadge status="draft" />
              </div>
              <div className="flex flex-wrap gap-3">
                <ComplianceBadge status="compliant" />
                <ComplianceBadge status="action_required" message="KYC needs refresh" />
                <ComplianceBadge status="pending" />
              </div>
            </DemoCard>

            <DemoCard
              title="TokenAmount"
              description="Formatted display of token amounts and prices"
              codeExample={`<TokenAmount amount="1234567890" decimals={18} symbol="ETH" />
<PriceDisplay price={2500000} change={5.2} />
<BalanceDisplay balance="1000" symbol="USDC" />`}
            >
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <TokenAmount amount="1234567890123456789" decimals={18} symbol="ETH" size="lg" />
                </div>
                <div className="flex items-center gap-4">
                  <PriceDisplay price={2500000} currency="USD" change={5.2} size="md" />
                  <PriceDisplay price={15.50} currency="USD" change={-2.3} size="md" />
                </div>
                <div className="flex items-center gap-6">
                  <BalanceDisplay balance="1000000" decimals={6} symbol="USDC" label="Available" />
                  <BalanceDisplay balance="50000" decimals={6} symbol="USDC" label="Locked" />
                </div>
              </div>
            </DemoCard>

            <DemoCard
              title="AddressAvatar"
              description="Wallet address display with copy and explorer links"
              codeExample={`<AddressAvatar address="0x1234..." />
<AddressAvatar address="0xabcd..." label="Treasury" />
<ContractAddress address="0x9876..." verified />`}
            >
              <div className="space-y-3">
                <AddressAvatar address="0x1234567890abcdef1234567890abcdef12345678" />
                <AddressAvatar
                  address="0xabcdef1234567890abcdef1234567890abcdef12"
                  label="Treasury Wallet"
                  size="lg"
                />
                <ContractAddress
                  address="0x9876543210fedcba9876543210fedcba98765432"
                  chainId={137}
                  verified
                />
              </div>
            </DemoCard>

            <DemoCard
              title="Usage Example"
              description="How these atoms compose into larger UIs"
            >
              <div className="p-4 rounded-lg bg-gray-900 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <AddressAvatar
                    address="0x1234567890abcdef1234567890abcdef12345678"
                    label="Your Wallet"
                    size="sm"
                  />
                  <ComplianceBadge status="compliant" />
                </div>
                <div className="flex items-center justify-between">
                  <BalanceDisplay balance="25000" decimals={6} symbol="PROP" label="Holdings" />
                  <PriceDisplay price={625000} currency="USD" change={12.5} />
                </div>
              </div>
            </DemoCard>
          </div>
        )}

        {/* Cards Section */}
        {activeSection === 'cards' && (
          <div className="space-y-8">
            <DemoCard
              title="Detailed Variant"
              description="Full card with image, metadata, and actions - same component for all asset types"
              codeExample={`<GenericAssetCard
  asset={realEstateAsset}
  variant="detailed"
  onClick={(a) => navigate(\`/assets/\${a.id}\`)}
  onPrimaryAction={(a) => openInvestFlow(a)}
/>`}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {mockAssets.slice(0, 3).map((asset) => (
                  <GenericAssetCard
                    key={asset.id}
                    asset={asset}
                    variant="detailed"
                    onClick={setSelectedAsset}
                    onPrimaryAction={(a) => {
                      setSelectedAsset(a);
                      setShowInvestFlow(true);
                    }}
                  />
                ))}
              </div>
            </DemoCard>

            <DemoCard
              title="Compact Variant"
              description="Condensed row format for lists and tables"
              codeExample={`<GenericAssetCard asset={asset} variant="compact" />`}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {mockAssets.slice(0, 4).map((asset) => (
                  <GenericAssetCard
                    key={asset.id}
                    asset={asset}
                    variant="compact"
                    onClick={setSelectedAsset}
                  />
                ))}
              </div>
            </DemoCard>

            <DemoCard
              title="Mini Variant"
              description="Minimal chip format for quick selection"
              codeExample={`<GenericAssetCard asset={asset} variant="mini" />`}
            >
              <div className="flex flex-wrap gap-2">
                {mockAssets.map((asset) => (
                  <GenericAssetCard
                    key={asset.id}
                    asset={asset}
                    variant="mini"
                    onClick={setSelectedAsset}
                  />
                ))}
              </div>
            </DemoCard>
          </div>
        )}

        {/* Grid Section */}
        {activeSection === 'grid' && (
          <div className="space-y-6">
            <DemoCard
              title="AssetGrid"
              description="Responsive grid with built-in search and filtering"
              codeExample={`<AssetGrid
  assets={myAssets}
  showSearch
  showFilters
  showViewToggle
  onAssetClick={(asset) => selectAsset(asset)}
  onAssetAction={(asset) => openInvestFlow(asset)}
/>`}
              className="col-span-full"
            >
              <AssetGrid
                assets={mockAssets}
                showSearch
                showFilters
                showViewToggle
                columns={3}
                cardVariant="detailed"
                onAssetClick={setSelectedAsset}
                onAssetAction={(a) => {
                  setSelectedAsset(a);
                  setShowInvestFlow(true);
                }}
              />
            </DemoCard>
          </div>
        )}

        {/* Actions Section */}
        {activeSection === 'actions' && (
          <div className="space-y-6">
            <p className="text-gray-400">
              ActionStation dynamically renders available actions based on the asset's template.
              Different asset types show different actions.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DemoCard
                title="Real Estate Actions"
                description="Transfer, Distribute (payouts), Redeem"
                codeExample={`<ActionStation assetId={realEstateAsset.id} variant="buttons" />`}
              >
                <div className="p-4 rounded-lg bg-gray-900 border border-white/10 mb-4">
                  <GenericAssetCard asset={mockAssets[0]} variant="compact" showActions={false} />
                </div>
                <ActionStation assetId={mockAssets[0].id} asset={mockAssets[0]} variant="full" />
              </DemoCard>

              <DemoCard
                title="Carbon Credit Actions"
                description="Transfer, Retire (burn with proof)"
                codeExample={`<ActionStation assetId={carbonAsset.id} variant="full" />`}
              >
                <div className="p-4 rounded-lg bg-gray-900 border border-white/10 mb-4">
                  <GenericAssetCard asset={mockAssets[1]} variant="compact" showActions={false} />
                </div>
                <ActionStation assetId={mockAssets[1].id} asset={mockAssets[1]} variant="full" />
              </DemoCard>

              <DemoCard
                title="Ticket Actions"
                description="Transfer, Expire"
                codeExample={`<ActionStation assetId={ticketAsset.id} variant="dropdown" />`}
              >
                <div className="p-4 rounded-lg bg-gray-900 border border-white/10 mb-4">
                  <GenericAssetCard asset={mockAssets[2]} variant="compact" showActions={false} />
                </div>
                <ActionStation assetId={mockAssets[2].id} asset={mockAssets[2]} variant="buttons" />
              </DemoCard>

              <DemoCard
                title="Loyalty Points Actions"
                description="Non-transferable - only Issue and Redeem"
                codeExample={`<ActionStation assetId={loyaltyAsset.id} />`}
              >
                <div className="p-4 rounded-lg bg-gray-900 border border-white/10 mb-4">
                  <GenericAssetCard asset={mockAssets[5]} variant="compact" showActions={false} />
                </div>
                <ActionStation assetId={mockAssets[5].id} asset={mockAssets[5]} variant="buttons" />
              </DemoCard>
            </div>
          </div>
        )}

        {/* Investment Flow Section */}
        {activeSection === 'flow' && (
          <div className="space-y-6">
            <DemoCard
              title="InvestmentFlow"
              description="Multi-step wizard like Stripe Checkout - works for any asset type"
              codeExample={`<InvestmentFlow
  assetId={selectedAsset.id}
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onSuccess={(result) => {
    console.log('Invested:', result);
    toast.success('Investment complete!');
  }}
/>`}
              className="col-span-full"
            >
              <div className="text-center py-8">
                <p className="text-gray-400 mb-6">
                  Click any asset below to open the investment flow wizard
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                  {mockAssets.slice(0, 3).map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => {
                        setSelectedAsset(asset);
                        setShowInvestFlow(true);
                      }}
                      className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 transition-all text-left"
                    >
                      <div className="font-medium text-white">{asset.metadata.name}</div>
                      <div className="text-sm text-gray-500">{asset.template?.name}</div>
                      <div className="mt-2">
                        <PriceDisplay price={asset.currentPrice || 0} size="sm" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </DemoCard>

            <div className="p-6 rounded-xl bg-gray-900 border border-white/10">
              <h3 className="text-lg font-semibold mb-4">Investment Flow Steps</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {[
                  { step: 1, title: 'Quantity', desc: 'Select amount to invest' },
                  { step: 2, title: 'Compliance', desc: 'KYC verification check' },
                  { step: 3, title: 'Payment', desc: 'Choose payment method' },
                  { step: 4, title: 'Signing', desc: 'Wallet signature' },
                  { step: 5, title: 'Success', desc: 'Confirmation receipt' },
                ].map((s) => (
                  <div key={s.step} className="text-center">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-2 font-semibold">
                      {s.step}
                    </div>
                    <div className="font-medium text-white text-sm">{s.title}</div>
                    <div className="text-xs text-gray-500">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick Start Code */}
        <div className="mt-12 p-6 bg-gray-900 rounded-xl border border-white/10">
          <h3 className="text-xl font-semibold mb-4">Quick Start</h3>
          <pre className="text-sm text-gray-300 overflow-x-auto">
            {`import {
  TokenisationProvider,
  AssetProvider,
  AssetGrid,
  InvestmentFlow,
} from '@tokenisation/ui-kit';

function Marketplace() {
  const [selectedAsset, setSelectedAsset] = useState(null);

  return (
    <TokenisationProvider client={client}>
      <AssetProvider autoFetch>
        <h1>Featured Assets</h1>

        {/* Same grid component works for ALL asset types */}
        <AssetGrid
          filter={{ type: 'real_estate' }}  // or 'carbon_credit', 'ticket', etc.
          onAssetAction={setSelectedAsset}
        />

        {selectedAsset && (
          <InvestmentFlow
            assetId={selectedAsset.id}
            isOpen={!!selectedAsset}
            onClose={() => setSelectedAsset(null)}
            onSuccess={(result) => {
              toast.success('Investment complete!');
              setSelectedAsset(null);
            }}
          />
        )}
      </AssetProvider>
    </TokenisationProvider>
  );
}`}
          </pre>
        </div>
      </div>

      {/* Investment Flow Modal */}
      {showInvestFlow && selectedAsset && (
        <InvestmentFlow
          assetId={selectedAsset.id}
          isOpen={showInvestFlow}
          onClose={() => {
            setShowInvestFlow(false);
            setSelectedAsset(null);
          }}
          onSuccess={(result) => {
            console.log('Investment complete:', result);
            setShowInvestFlow(false);
            setSelectedAsset(null);
          }}
        />
      )}
    </div>
  );
}

export default UIKitDemo;
