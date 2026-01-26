/**
 * Showcase - Component documentation and demo
 *
 * Displays all generic components with different configurations
 * to demonstrate the "same component, different data" philosophy.
 */

import React, { useState } from 'react';
import type { AssetInstance, TemplateType } from '../types';
import { getAllTemplates, getTemplate } from '../templates/registry';
import { GenericAssetCard } from './AssetCard';
import { AssetGrid } from './AssetGrid';
import { ActionStation } from './ActionStation';
import { InvestmentFlow } from './InvestmentFlow';
import { StatusBadge, ComplianceBadge } from '../atoms/StatusBadge';
import { TokenAmount, PriceDisplay, BalanceDisplay } from '../atoms/TokenAmount';
import { AddressAvatar, ContractAddress } from '../atoms/AddressAvatar';

// ============================================
// Mock Data
// ============================================

const mockAssets: AssetInstance[] = [
  {
    id: 'asset_re_001',
    templateId: 'tmpl_real_estate_v1',
    template: getTemplate('real_estate'),
    metadata: {
      name: 'Marina View Tower A - Unit 1204',
      description: 'Luxury waterfront apartment in Dubai Marina',
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
  {
    id: 'asset_cc_001',
    templateId: 'tmpl_carbon_credit_v1',
    template: getTemplate('carbon_credit'),
    metadata: {
      name: 'Amazon Rainforest REDD+ Credits',
      description: 'Verified carbon credits from forest conservation project',
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
  {
    id: 'asset_tk_001',
    templateId: 'tmpl_ticket_v1',
    template: getTemplate('ticket'),
    metadata: {
      name: 'Web3 Summit 2024 - VIP Pass',
      description: 'Full access VIP ticket with backstage access',
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
  {
    id: 'asset_ry_001',
    templateId: 'tmpl_royalty_v1',
    template: getTemplate('royalty'),
    metadata: {
      name: 'Indie Album Royalties - "Electric Dreams"',
      description: 'Share in streaming royalties from hit album',
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
];

// ============================================
// Section Component
// ============================================

interface SectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

function Section({ title, description, children }: SectionProps) {
  return (
    <div className="mb-12">
      <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
      <p className="text-gray-400 text-sm mb-6">{description}</p>
      {children}
    </div>
  );
}

// ============================================
// Code Block Component
// ============================================

interface CodeBlockProps {
  code: string;
}

function CodeBlock({ code }: CodeBlockProps) {
  return (
    <pre className="mt-4 p-4 rounded-lg bg-gray-900 border border-white/10 overflow-x-auto">
      <code className="text-sm text-gray-300 font-mono">{code}</code>
    </pre>
  );
}

// ============================================
// Main Showcase Component
// ============================================

export function Showcase() {
  const [selectedAsset, setSelectedAsset] = useState<AssetInstance | null>(null);
  const [showInvestFlow, setShowInvestFlow] = useState(false);

  const templates = getAllTemplates();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-4">
            Tokenisation UI Kit - Component Showcase
          </h1>
          <p className="text-gray-400 max-w-2xl">
            "Stripe Elements for Assets" - Generic, template-aware components that work
            with any asset type. Same code, different data.
          </p>
        </div>

        {/* Templates Overview */}
        <Section
          title="Asset Templates"
          description="Pre-defined templates for common asset types. Each template defines schema, actions, and policies."
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="p-4 rounded-lg bg-white/5 border border-white/10"
                style={{ borderLeftColor: template.color, borderLeftWidth: 4 }}
              >
                <h3 className="font-medium text-white mb-1">{template.name}</h3>
                <p className="text-xs text-gray-500 mb-2">{template.type}</p>
                <div className="flex flex-wrap gap-1">
                  {template.availableActions.slice(0, 3).map((action) => (
                    <span
                      key={action}
                      className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-gray-400"
                    >
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <CodeBlock
            code={`import { getTemplate, getAllTemplates } from '@tokenisation/ui-kit';

const template = getTemplate('real_estate');
console.log(template.availableActions); // ['issue', 'transfer', 'distribute', ...]`}
          />
        </Section>

        {/* Status Badges */}
        <Section
          title="Status Badges"
          description="Visual indicators for asset and identity status states."
        >
          <div className="flex flex-wrap gap-4 mb-4">
            <StatusBadge status="active" showDot pulse />
            <StatusBadge status="pending_verification" showDot />
            <StatusBadge status="frozen" />
            <StatusBadge status="expired" />
            <StatusBadge status="draft" />
          </div>
          <div className="flex flex-wrap gap-4">
            <ComplianceBadge status="compliant" />
            <ComplianceBadge status="action_required" message="KYC needs refresh" />
            <ComplianceBadge status="pending" />
          </div>
          <CodeBlock
            code={`<StatusBadge status="active" showDot pulse />
<ComplianceBadge status="compliant" onClick={() => openKYC()} />`}
          />
        </Section>

        {/* Token Amounts */}
        <Section
          title="Token Amount Display"
          description="Formatted display of token amounts, prices, and balances."
        >
          <div className="flex flex-wrap items-center gap-8">
            <TokenAmount amount="1234567890123456789" decimals={18} symbol="ETH" />
            <PriceDisplay price={2500000} currency="USD" change={5.2} />
            <BalanceDisplay balance="1000000" decimals={6} symbol="USDC" />
          </div>
          <CodeBlock
            code={`<TokenAmount amount="1234567890123456789" decimals={18} symbol="ETH" />
<PriceDisplay price={2500000} currency="USD" change={5.2} />
<BalanceDisplay balance="1000000" decimals={6} symbol="USDC" />`}
          />
        </Section>

        {/* Address Avatar */}
        <Section
          title="Address Display"
          description="Wallet address visualization with copy and explorer links."
        >
          <div className="flex flex-wrap gap-8">
            <AddressAvatar address="0x1234567890abcdef1234567890abcdef12345678" />
            <AddressAvatar
              address="0xabcdef1234567890abcdef1234567890abcdef12"
              label="Treasury"
              size="lg"
            />
            <ContractAddress
              address="0x9876543210fedcba9876543210fedcba98765432"
              chainId={137}
              verified
            />
          </div>
          <CodeBlock
            code={`<AddressAvatar address="0x1234..." />
<ContractAddress address="0x9876..." chainId={137} verified />`}
          />
        </Section>

        {/* Asset Cards */}
        <Section
          title="Asset Cards"
          description="Generic asset cards that adapt to any template type. Three variants: mini, compact, detailed."
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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

          <h4 className="text-sm font-medium text-gray-400 mb-3">Compact Variant</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {mockAssets.slice(0, 2).map((asset) => (
              <GenericAssetCard key={asset.id} asset={asset} variant="compact" />
            ))}
          </div>

          <h4 className="text-sm font-medium text-gray-400 mb-3">Mini Variant</h4>
          <div className="flex flex-wrap gap-2">
            {mockAssets.map((asset) => (
              <GenericAssetCard key={asset.id} asset={asset} variant="mini" />
            ))}
          </div>

          <CodeBlock
            code={`// Same component, different asset types!
<GenericAssetCard assetId="asset_re_001" />  // Real Estate
<GenericAssetCard assetId="asset_cc_001" />  // Carbon Credit
<GenericAssetCard assetId="asset_tk_001" />  // Ticket

// Or with direct asset data
<GenericAssetCard asset={asset} variant="compact" />`}
          />
        </Section>

        {/* Asset Grid */}
        <Section
          title="Asset Grid"
          description="Responsive grid with built-in search and filtering."
        >
          <AssetGrid
            assets={mockAssets}
            showSearch
            showFilters
            showViewToggle
            columns={4}
            onAssetClick={setSelectedAsset}
            onAssetAction={(a) => {
              setSelectedAsset(a);
              setShowInvestFlow(true);
            }}
          />
          <CodeBlock
            code={`// Simple usage with auto-fetch
<AssetGrid filter={{ type: 'real_estate' }} />

// With custom data and handlers
<AssetGrid
  assets={myAssets}
  showSearch
  showFilters
  onAssetClick={(asset) => navigate(\`/assets/\${asset.id}\`)}
/>`}
          />
        </Section>

        {/* Action Station */}
        <Section
          title="Action Station"
          description="Dynamic action buttons based on asset template and user permissions."
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500 mb-2">Buttons Variant (Default)</p>
              <ActionStation assetId="asset_re_001" asset={mockAssets[0]} variant="buttons" />
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">Dropdown Variant</p>
              <ActionStation assetId="asset_cc_001" asset={mockAssets[1]} variant="dropdown" />
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">Full Panel Variant</p>
              <div className="max-w-md">
                <ActionStation assetId="asset_ry_001" asset={mockAssets[3]} variant="full" />
              </div>
            </div>
          </div>
          <CodeBlock
            code={`// Actions are determined by asset template
<ActionStation assetId="asset_123" />

// Different templates = different actions
// Real Estate: issue, transfer, distribute, redeem
// Carbon Credit: issue, transfer, retire
// Ticket: issue, transfer, expire`}
          />
        </Section>

        {/* Developer Usage */}
        <Section
          title="Developer Integration"
          description="How to integrate the UI kit in 10 lines of code."
        >
          <CodeBlock
            code={`import {
  TokenisationProvider,
  AssetProvider,
  AssetGrid,
  InvestmentFlow,
} from '@tokenisation/ui-kit';

export default function Marketplace() {
  const [selectedAsset, setSelectedAsset] = useState(null);

  return (
    <TokenisationProvider client={client}>
      <AssetProvider autoFetch>
        <h1>Featured Assets</h1>
        <AssetGrid
          filter={{ type: 'real_estate' }}
          onAssetAction={setSelectedAsset}
        />
        {selectedAsset && (
          <InvestmentFlow
            assetId={selectedAsset.id}
            isOpen={!!selectedAsset}
            onClose={() => setSelectedAsset(null)}
          />
        )}
      </AssetProvider>
    </TokenisationProvider>
  );
}`}
          />
        </Section>

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
            }}
          />
        )}
      </div>
    </div>
  );
}

export default Showcase;
