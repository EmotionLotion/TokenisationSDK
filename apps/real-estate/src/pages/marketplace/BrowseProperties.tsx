import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin, TrendingUp, Filter } from 'lucide-react';
import { useAsset } from '@tokenisation/sdk-react';
import { StatusBadge } from '@tokenisation/ui-kit';
import {
  DUBAI_PROPERTIES,
  formatAED,
  type DubaiProperty,
} from '../../data/dubai-properties';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';
import { assetToDubaiProperty, toStatusBadgeVariant } from '../../utils/mappers';

const PROPERTY_TYPES: { value: DubaiProperty['propertyType'] | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed-use', label: 'Mixed-Use' },
  { value: 'hospitality', label: 'Hospitality' },
];

const STATUS_OPTIONS: { value: DubaiProperty['status'] | 'all'; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'live', label: 'Live' },
  { value: 'distributing', label: 'Distributing' },
  { value: 'token-issuance', label: 'Token Issuance' },
  { value: 'regulatory-approval', label: 'Regulatory Approval' },
  { value: 'due-diligence', label: 'Due Diligence' },
  { value: 'legal-structuring', label: 'Legal Structuring' },
  { value: 'sourcing', label: 'Sourcing' },
];

function PropertyCard({ property }: { property: DubaiProperty }) {
  const statusLabel = property.status.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Link
      to={`/property/${property.id}`}
      className="group block bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-primary/30 hover:bg-white/[0.07] transition-all duration-300"
    >
      {/* Image placeholder */}
      <div className="relative h-48 bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center overflow-hidden">
        <Building2 className="w-12 h-12 text-white/10 group-hover:text-primary/20 transition-colors" />
        <div className="absolute top-3 right-3">
          <StatusBadge
            status={statusLabel}
            variant={toStatusBadgeVariant(property.status)}
            size="sm"
          />
        </div>
        <div className="absolute bottom-3 left-3">
          <span className="px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-lg text-[11px] font-medium text-gray-300 uppercase tracking-wider">
            {property.propertyType}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {/* Name & Location */}
        <div>
          <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors line-clamp-1">
            {property.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            <MapPin className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-sm text-gray-400">{property.district}</span>
          </div>
        </div>

        {/* Valuation */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Valuation</p>
          <p className="text-xl font-bold text-white">{formatAED(property.valuationAED)}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/5">
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Net Yield</p>
            <div className="flex items-center gap-1 mt-0.5">
              <TrendingUp className="w-3.5 h-3.5 text-accent" />
              <span className="text-sm font-semibold text-accent">{property.netYield}%</span>
            </div>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Occupancy</p>
            <p className="text-sm font-semibold text-white mt-0.5">{property.occupancyRate}%</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Token</p>
            <p className="text-sm font-semibold text-primary mt-0.5">
              {formatAED(property.tokenPriceAED)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function BrowseProperties() {
  const { listAssets } = useAsset();
  const [typeFilter, setTypeFilter] = useState<DubaiProperty['propertyType'] | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DubaiProperty['status'] | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const { data: properties, isLive } = useSDKWithFallback(
    async () => {
      const assets = await listAssets();
      return assets.map(assetToDubaiProperty);
    },
    DUBAI_PROPERTIES,
  );

  const filteredProperties = useMemo(() => {
    return properties.filter((prop) => {
      if (typeFilter !== 'all' && prop.propertyType !== typeFilter) return false;
      if (statusFilter !== 'all' && prop.status !== statusFilter) return false;
      return true;
    });
  }, [properties, typeFilter, statusFilter]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Hero */}
      <div className="mb-10">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl md:text-4xl font-bold text-white font-display">
            Dubai Real Estate Tokens
          </h1>
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-medium text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Live
            </span>
          )}
        </div>
        <p className="text-gray-400 mt-2 text-lg max-w-2xl">
          Invest in tokenized institutional-grade properties across Dubai's prime districts.
          Fully regulated, ERC-3643 compliant.
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 hover:text-white hover:border-white/20 transition-colors sm:hidden"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>

          <div
            className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full ${showFilters ? '' : 'hidden sm:flex'}`}
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500 hidden sm:block" />
              <span className="text-sm text-gray-400 hidden sm:block">Filter:</span>
            </div>

            {/* Property Type */}
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setTypeFilter(type.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    typeFilter === type.value
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:border-white/20'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>

            <div className="hidden sm:block w-px h-6 bg-white/10" />

            {/* Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DubaiProperty['status'] | 'all')}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-primary/50 appearance-none cursor-pointer"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-background text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto text-sm text-gray-500">
            {filteredProperties.length} {filteredProperties.length === 1 ? 'property' : 'properties'}
          </div>
        </div>
      </div>

      {/* Property grid */}
      {filteredProperties.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProperties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <Building2 className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <p className="text-gray-400">No properties match your current filters.</p>
          <button
            onClick={() => {
              setTypeFilter('all');
              setStatusFilter('all');
            }}
            className="mt-3 text-primary text-sm hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
