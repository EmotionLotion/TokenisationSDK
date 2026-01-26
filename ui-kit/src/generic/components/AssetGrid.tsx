/**
 * AssetGrid - Responsive grid of asset cards with filtering
 *
 * Example usage:
 * ```tsx
 * <AssetGrid filter={{ type: 'real_estate' }} />
 * ```
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Search, Filter, Grid, List, Loader2 } from 'lucide-react';
import type { AssetInstance, AssetFilter, TemplateType, AssetStatus } from '../types';
import { GenericAssetCard, AssetCardSkeleton } from './AssetCard';
import { useAssetsOptional } from '../context/AssetContext';
import { getAllTemplates } from '../templates/registry';

// ============================================
// Types
// ============================================

export interface AssetGridProps {
  /** Filter to apply */
  filter?: AssetFilter;
  /** Pass assets directly instead of using context */
  assets?: AssetInstance[];
  /** Card variant */
  cardVariant?: 'compact' | 'detailed' | 'mini';
  /** Grid columns (responsive by default) */
  columns?: 1 | 2 | 3 | 4 | 'auto';
  /** Show search bar */
  showSearch?: boolean;
  /** Show filter controls */
  showFilters?: boolean;
  /** Show view toggle (grid/list) */
  showViewToggle?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Loading state */
  loading?: boolean;
  /** Callback when asset is clicked */
  onAssetClick?: (asset: AssetInstance) => void;
  /** Callback for primary action */
  onAssetAction?: (asset: AssetInstance) => void;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// Filter Controls
// ============================================

interface FilterControlsProps {
  selectedType: TemplateType | 'all';
  selectedStatus: AssetStatus | 'all';
  onTypeChange: (type: TemplateType | 'all') => void;
  onStatusChange: (status: AssetStatus | 'all') => void;
}

function FilterControls({
  selectedType,
  selectedStatus,
  onTypeChange,
  onStatusChange,
}: FilterControlsProps) {
  const templates = getAllTemplates();

  const statusOptions: Array<{ value: AssetStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending_verification', label: 'Pending' },
    { value: 'frozen', label: 'Frozen' },
    { value: 'expired', label: 'Expired' },
  ];

  return (
    <div className="flex items-center gap-3">
      {/* Type filter */}
      <select
        value={selectedType}
        onChange={(e) => onTypeChange(e.target.value as TemplateType | 'all')}
        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white
          focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        <option value="all">All Types</option>
        {templates.map((t) => (
          <option key={t.type} value={t.type}>
            {t.name}
          </option>
        ))}
      </select>

      {/* Status filter */}
      <select
        value={selectedStatus}
        onChange={(e) => onStatusChange(e.target.value as AssetStatus | 'all')}
        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white
          focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================
// Search Bar
// ============================================

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function SearchBar({ value, onChange, placeholder = 'Search assets...' }: SearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white
          placeholder:text-gray-500
          focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
      />
    </div>
  );
}

// ============================================
// View Toggle
// ============================================

interface ViewToggleProps {
  view: 'grid' | 'list';
  onChange: (view: 'grid' | 'list') => void;
}

function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center bg-white/5 rounded-lg p-1">
      <button
        type="button"
        onClick={() => onChange('grid')}
        className={`p-1.5 rounded transition-colors ${
          view === 'grid'
            ? 'bg-white/10 text-white'
            : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <Grid className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`p-1.5 rounded transition-colors ${
          view === 'list'
            ? 'bg-white/10 text-white'
            : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <List className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============================================
// Empty State
// ============================================

interface EmptyStateProps {
  message: string;
  hasFilters: boolean;
  onClearFilters?: () => void;
}

function EmptyState({ message, hasFilters, onClearFilters }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
        <Filter className="w-8 h-8 text-gray-500" />
      </div>
      <p className="text-gray-400 mb-4">{message}</p>
      {hasFilters && onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="px-4 py-2 rounded-lg bg-white/5 text-white text-sm hover:bg-white/10 transition-colors"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}

// ============================================
// Grid Styles
// ============================================

const gridColumns = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  auto: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
};

// ============================================
// Component
// ============================================

export function AssetGrid({
  filter: propFilter,
  assets: propAssets,
  cardVariant = 'detailed',
  columns = 'auto',
  showSearch = true,
  showFilters = true,
  showViewToggle = true,
  emptyMessage = 'No assets found',
  loading: propLoading,
  onAssetClick,
  onAssetAction,
  className = '',
}: AssetGridProps) {
  const context = useAssetsOptional();

  // Use prop assets or context assets
  const sourceAssets = propAssets || context?.assets || [];
  const isLoading = propLoading ?? context?.isLoading ?? false;

  // Local filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TemplateType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | 'all'>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  // Fetch assets on mount if using context
  useEffect(() => {
    if (!propAssets && propFilter && context?.fetchAssets) {
      context.fetchAssets(propFilter);
    }
  }, [propAssets, propFilter, context]);

  // Apply initial filter from props
  useEffect(() => {
    if (propFilter?.type) {
      setTypeFilter(propFilter.type);
    }
    if (propFilter?.status) {
      setStatusFilter(Array.isArray(propFilter.status) ? propFilter.status[0] : propFilter.status);
    }
  }, [propFilter]);

  // Filter assets
  const filteredAssets = useMemo(() => {
    return sourceAssets.filter((asset) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = asset.metadata.name?.toLowerCase().includes(query);
        const matchesDesc = asset.metadata.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }

      // Type filter
      if (typeFilter !== 'all') {
        const assetType = asset.template?.type || (asset.metadata.templateType as TemplateType);
        if (assetType !== typeFilter) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (asset.status !== statusFilter) return false;
      }

      return true;
    });
  }, [sourceAssets, searchQuery, typeFilter, statusFilter]);

  // Check if any filters are active
  const hasActiveFilters = Boolean(searchQuery) || typeFilter !== 'all' || statusFilter !== 'all';

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  // Determine card variant based on view
  const effectiveCardVariant = view === 'list' ? 'compact' : cardVariant;

  return (
    <div className={className}>
      {/* Toolbar */}
      {(showSearch || showFilters || showViewToggle) && (
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {showSearch && (
            <div className="flex-1 max-w-md">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>
          )}

          <div className="flex items-center gap-3">
            {showFilters && (
              <FilterControls
                selectedType={typeFilter}
                selectedStatus={statusFilter}
                onTypeChange={setTypeFilter}
                onStatusChange={setStatusFilter}
              />
            )}

            {showViewToggle && <ViewToggle view={view} onChange={setView} />}
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className={`grid gap-4 ${gridColumns[columns]}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <AssetCardSkeleton key={i} variant={effectiveCardVariant} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredAssets.length === 0 && (
        <EmptyState
          message={emptyMessage}
          hasFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />
      )}

      {/* Asset grid */}
      {!isLoading && filteredAssets.length > 0 && (
        <div className={`grid gap-4 ${gridColumns[columns]}`}>
          {filteredAssets.map((asset) => (
            <GenericAssetCard
              key={asset.id}
              asset={asset}
              variant={effectiveCardVariant}
              onClick={onAssetClick}
              onPrimaryAction={onAssetAction}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {!isLoading && filteredAssets.length > 0 && hasActiveFilters && (
        <div className="mt-4 text-sm text-gray-500 text-center">
          Showing {filteredAssets.length} of {sourceAssets.length} assets
        </div>
      )}
    </div>
  );
}

// ============================================
// Specialized Grid Variants
// ============================================

export interface FeaturedAssetsProps {
  assets?: AssetInstance[];
  filter?: AssetFilter;
  limit?: number;
  title?: string;
  showViewAll?: boolean;
  onViewAll?: () => void;
  onAssetClick?: (asset: AssetInstance) => void;
  className?: string;
}

export function FeaturedAssets({
  assets,
  filter,
  limit = 4,
  title = 'Featured Assets',
  showViewAll = true,
  onViewAll,
  onAssetClick,
  className = '',
}: FeaturedAssetsProps) {
  const context = useAssetsOptional();
  const sourceAssets = assets || context?.assets || [];
  const isLoading = context?.isLoading ?? false;

  useEffect(() => {
    if (!assets && filter && context?.fetchAssets) {
      context.fetchAssets(filter);
    }
  }, [assets, filter, context]);

  const displayAssets = sourceAssets.slice(0, limit);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {showViewAll && onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View All
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: limit }).map((_, i) => (
            <AssetCardSkeleton key={i} variant="compact" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {displayAssets.map((asset) => (
            <GenericAssetCard
              key={asset.id}
              asset={asset}
              variant="compact"
              onClick={onAssetClick}
              showActions={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
