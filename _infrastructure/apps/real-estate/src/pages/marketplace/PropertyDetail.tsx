import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Building2,
  MapPin,
  FileText,
  Shield,
  Coins,
  TrendingUp,
  ChevronLeft,
  BarChart3,
  FolderOpen,
  Users,
  ArrowLeftRight,
  Landmark,
  ClipboardList,
  MapPinned,
  Eye,
} from 'lucide-react';
import { useAsset } from '@tokenisation/sdk-react';
import { StatusBadge } from '@tokenisation/ui-kit';
import {
  DUBAI_PROPERTIES,
  formatAED,
  formatUSD,
  type DubaiProperty,
} from '../../data/dubai-properties';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';
import { assetToDubaiProperty, toStatusBadgeVariant } from '../../utils/mappers';

// Tab components
import { RentalYieldChart } from '../../components/RentalYieldChart';
import { NAVHistory } from '../../components/NAVHistory';
import { DocumentViewer } from '../../components/DocumentViewer';
import { CapTableView } from '../../components/CapTableView';
import { SecondaryMarket } from '../../components/SecondaryMarket';
import { SPVDetails } from '../../components/SPVDetails';
import { AuditTimeline } from '../../components/AuditTimeline';
import { PropertyMap } from '../../components/PropertyMap';
import { AnimatedTabContent } from '../../components/AnimatedTabContent';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Eye },
  { id: 'financials', label: 'Financials', icon: BarChart3 },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'cap-table', label: 'Cap Table', icon: Users },
  { id: 'secondary', label: 'Secondary Market', icon: ArrowLeftRight },
  { id: 'spv', label: 'SPV Structure', icon: Landmark },
  { id: 'audit', label: 'Audit Trail', icon: ClipboardList },
  { id: 'location', label: 'Location', icon: MapPinned },
] as const;

type TabId = (typeof TABS)[number]['id'];

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-b-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const { getAsset } = useAsset();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const mockProperty = DUBAI_PROPERTIES.find((p) => p.id === id) || null;

  const { data: property, isLive } = useSDKWithFallback(
    async () => {
      if (!id) return null;
      const asset = await getAsset(id);
      return asset ? assetToDubaiProperty(asset) : null;
    },
    mockProperty,
    [id],
  );

  if (!property) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <Building2 className="w-16 h-16 text-white/10 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Property Not Found</h1>
        <p className="text-gray-400 mb-6">
          The property you are looking for does not exist or has been removed.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-primary hover:underline text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Properties
        </Link>
      </div>
    );
  }

  const isInvestable = property.status === 'live' || property.status === 'distributing';
  const statusLabel = property.status.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const fundingPct = property.tokensSold != null && property.totalTokens > 0
    ? Math.min(100, Math.round((property.tokensSold / property.totalTokens) * 100))
    : null;
  const fundedAED = property.tokensSold != null ? property.tokensSold * property.tokenPriceAED : 0;
  const goalAED = property.fundingGoalAED ?? property.valuationAED;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Properties
      </Link>

      {/* Hero Section */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mb-8">
        {/* Image placeholder */}
        <div className="relative h-64 md:h-80 bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center">
          <Building2 className="w-20 h-20 text-white/10" />
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <StatusBadge
              status={statusLabel}
              variant={toStatusBadgeVariant(property.status)}
            />
            <span className="px-3 py-1 bg-black/60 backdrop-blur-sm rounded-lg text-xs font-medium text-gray-300 uppercase tracking-wider">
              {property.propertyType}
            </span>
          </div>
          {isLive && (
            <div className="absolute top-4 right-4">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-medium text-accent">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Live Data
              </span>
            </div>
          )}
        </div>

        {/* Header info */}
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white font-display">
                {property.name}
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">{property.location}</span>
              </div>
              <p className="text-gray-400 mt-4 max-w-2xl leading-relaxed">
                {property.description}
              </p>

              {/* Funding progress bar */}
              {fundingPct !== null && (
                <div className="mt-5 max-w-xl">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-white">{fundingPct}% Funded</span>
                    <span className="text-xs text-gray-400">
                      {formatAED(fundedAED)} of {formatAED(goalAED)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400 transition-all duration-1000 ease-out"
                      style={{ width: `${fundingPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="shrink-0">
              {isInvestable ? (
                <Link
                  to={`/investor/invest/${property.id}`}
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary text-black font-bold rounded-xl hover:bg-primary-dark transition-colors text-base shadow-lg shadow-primary/20"
                >
                  <Coins className="w-5 h-5" />
                  Invest Now
                </Link>
              ) : (
                <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-center">
                  <p className="text-sm text-gray-400">Coming Soon</p>
                  <p className="text-xs text-gray-500 mt-1">Not yet available for investment</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-2 mb-8">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                isActive
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Tab Content */}
        <div className="lg:col-span-2">
          <AnimatedTabContent activeTab={activeTab}>
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Investment Highlights */}
                <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Investment Highlights</h2>
                  </div>
                  <div className="space-y-3">
                    {property.highlights.map((highlight, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                        <span className="text-gray-300 text-sm leading-relaxed">{highlight}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Financial Details */}
                <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 bg-accent/10 rounded-lg flex items-center justify-center">
                      <Coins className="w-5 h-5 text-accent" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Financial Details</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Valuation */}
                    <div className="space-y-1">
                      <DetailRow label="Valuation (AED)" value={formatAED(property.valuationAED)} />
                      <DetailRow label="Valuation (USD)" value={formatUSD(property.valuationUSD)} />
                      <DetailRow label="Valuation Date" value={property.valuationDate} />
                      <DetailRow label="Valued By" value={property.valuedBy} />
                    </div>

                    {/* Income */}
                    <div className="space-y-1">
                      <DetailRow
                        label="Annual Rental Income"
                        value={formatAED(property.annualRentalIncomeAED)}
                      />
                      <DetailRow label="Gross Yield" value={`${property.grossYield}%`} />
                      <DetailRow label="Net Yield" value={`${property.netYield}%`} />
                      <DetailRow label="Occupancy Rate" value={`${property.occupancyRate}%`} />
                    </div>
                  </div>
                </section>

                {/* Developer & Property Info */}
                <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 bg-secondary/10 rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-secondary" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Property Details</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <DetailRow label="Developer" value={property.developer} />
                      <DetailRow label="Year Built" value={property.yearBuilt} />
                      <DetailRow label="Total Area" value={`${property.totalArea.toLocaleString()} sqft`} />
                      {property.floors && <DetailRow label="Floors" value={property.floors} />}
                    </div>
                    <div className="space-y-1">
                      {property.units && <DetailRow label="Units" value={property.units} />}
                      <DetailRow label="District" value={property.district} />
                      <DetailRow label="Property Type" value={property.propertyType.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'financials' && (
              <div className="space-y-8">
                <RentalYieldChart
                  propertyId={property.id}
                  propertyName={property.name}
                  grossYield={property.grossYield}
                  netYield={property.netYield}
                />
                <NAVHistory
                  propertyId={property.id}
                  propertyName={property.name}
                  currentNAV={property.valuationAED}
                />
              </div>
            )}

            {activeTab === 'documents' && (
              <DocumentViewer
                propertyId={property.id}
                propertyName={property.name}
              />
            )}

            {activeTab === 'cap-table' && (
              <CapTableView
                propertyId={property.id}
                propertyName={property.name}
                totalTokens={property.totalTokens}
              />
            )}

            {activeTab === 'secondary' && (
              <SecondaryMarket
                propertyId={property.id}
                propertyName={property.name}
              />
            )}

            {activeTab === 'spv' && (
              <SPVDetails
                propertyName={property.name}
                propertyId={property.id}
              />
            )}

            {activeTab === 'audit' && (
              <AuditTimeline propertyId={property.id} />
            )}

            {activeTab === 'location' && (
              <PropertyMap
                address={property.location}
                district={property.district}
              />
            )}
          </AnimatedTabContent>
        </div>

        {/* Right Column - Sidebar (always visible) */}
        <div className="space-y-6">
          {/* Token Info */}
          <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                <Coins className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-white">Token Information</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Token Symbol</p>
                <p className="text-2xl font-bold text-primary font-mono">{property.tokenSymbol}</p>
              </div>

              <div className="space-y-1">
                <DetailRow label="Token Price (AED)" value={formatAED(property.tokenPriceAED)} />
                <DetailRow label="Token Price (USD)" value={formatUSD(property.tokenPriceUSD)} />
                <DetailRow
                  label="Total Supply"
                  value={property.totalTokens.toLocaleString()}
                />
                <DetailRow
                  label="Min Investment"
                  value={formatAED(property.minInvestmentAED)}
                />
              </div>
            </div>

            {isInvestable && (
              <Link
                to={`/investor/invest/${property.id}`}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-primary-dark transition-colors text-sm"
              >
                <Coins className="w-4 h-4" />
                Invest Now
              </Link>
            )}
          </section>

          {/* Regulatory Info */}
          <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Regulatory</h2>
            </div>

            <div className="space-y-1">
              <DetailRow label="RERA Permit" value={property.reraPermitNo} />
              <DetailRow label="Title Deed" value={property.titleDeedNo} />
              <DetailRow label="Makani No." value={property.makaniNo} />
            </div>

            <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-accent/5 border border-accent/20 rounded-lg">
              <FileText className="w-4 h-4 text-accent shrink-0" />
              <span className="text-xs text-accent">ERC-3643 Compliant Security Token</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
