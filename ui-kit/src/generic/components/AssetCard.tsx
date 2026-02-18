/**
 * AssetCard - Generic asset card that adapts to any template type
 *
 * This is the "Stripe Elements" version of an asset card:
 * - Drop-in: <AssetCard assetId="123" /> works instantly
 * - Template-aware: Renders appropriate fields and actions based on asset type
 * - Themable: Uses CSS variables for styling
 */

import React, { useMemo } from 'react';
import {
  Building2,
  Sparkles,
  Globe,
  Clock,
  Users,
  TrendingUp,
} from 'lucide-react';
import type { AssetInstance, AssetTemplate, TemplateType, AssetStatus } from '../types';
import { StatusBadge } from '../atoms/StatusBadge';
import { TokenAmount, PriceDisplay } from '../atoms/TokenAmount';
import { useAsset } from '../context/AssetContext';

// ============================================
// Types
// ============================================

export interface GenericAssetCardProps {
  /** Asset ID to fetch and display */
  assetId?: string;
  /** Or pass asset directly */
  asset?: AssetInstance;
  /** Card variant */
  variant?: 'compact' | 'detailed' | 'mini';
  /** Show action buttons */
  showActions?: boolean;
  /** Callback when card is clicked */
  onClick?: (asset: AssetInstance) => void;
  /** Callback for primary action */
  onPrimaryAction?: (asset: AssetInstance) => void;
  /** Primary action label override */
  primaryActionLabel?: string;
  /** Show status badge */
  showStatus?: boolean;
  /** Show template icon */
  showIcon?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// Icon Mapping
// ============================================

const templateIcons: Record<TemplateType, React.ElementType> = {
  real_estate: Building2,
  custom: Sparkles,
};

function getTemplateIcon(type: TemplateType): React.ElementType {
  return templateIcons[type] || Sparkles;
}

// ============================================
// Template Colors
// ============================================

const templateColors: Record<TemplateType, string> = {
  real_estate: '#3B82F6',
  custom: '#64748B',
};

// ============================================
// Status Indicators
// ============================================

function shouldShowPulse(status: AssetStatus): boolean {
  return status === 'active' || status === 'pending_verification';
}

// ============================================
// Helper Functions
// ============================================

function getTemplateType(asset: AssetInstance): TemplateType {
  if (asset.template?.type) return asset.template.type;
  return (asset.metadata.templateType as TemplateType) || 'custom';
}

function getPrimaryActionLabel(template: AssetTemplate): string {
  if (template.rights.payoutEnabled) return 'Invest';
  if (template.rights.retirable) return 'Retire';
  if (template.rights.redeemable) return 'Redeem';
  return 'View';
}

// ============================================
// Component
// ============================================

export function GenericAssetCard({
  assetId,
  asset: propAsset,
  variant = 'detailed',
  showActions = true,
  onClick,
  onPrimaryAction,
  primaryActionLabel,
  showStatus = true,
  showIcon = true,
  className = '',
}: GenericAssetCardProps) {
  // Fetch asset if only ID provided
  const { asset: fetchedAsset, template: fetchedTemplate, loading } = useAsset(assetId);

  // Use prop asset or fetched asset
  const asset = propAsset || fetchedAsset;
  const template = propAsset?.template || fetchedTemplate;

  // Loading state
  if (loading || !asset) {
    return <AssetCardSkeleton variant={variant} className={className} />;
  }

  const templateType = getTemplateType(asset);
  const Icon = getTemplateIcon(templateType);
  const color = template?.color || templateColors[templateType];
  const actionLabel = primaryActionLabel || (template ? getPrimaryActionLabel(template) : 'View');

  // Mini variant
  if (variant === 'mini') {
    return (
      <MiniAssetCard
        asset={asset}
        icon={Icon}
        color={color}
        onClick={onClick}
        className={className}
      />
    );
  }

  // Compact variant
  if (variant === 'compact') {
    return (
      <CompactAssetCard
        asset={asset}
        template={template}
        icon={Icon}
        color={color}
        showStatus={showStatus}
        showIcon={showIcon}
        onClick={onClick}
        className={className}
      />
    );
  }

  // Detailed variant (default)
  return (
    <DetailedAssetCard
      asset={asset}
      template={template}
      icon={Icon}
      color={color}
      showStatus={showStatus}
      showIcon={showIcon}
      showActions={showActions}
      actionLabel={actionLabel}
      onClick={onClick}
      onPrimaryAction={onPrimaryAction}
      className={className}
    />
  );
}

// ============================================
// Mini Variant
// ============================================

interface MiniAssetCardProps {
  asset: AssetInstance;
  icon: React.ElementType;
  color: string;
  onClick?: (asset: AssetInstance) => void;
  className?: string;
}

function MiniAssetCard({ asset, icon: Icon, color, onClick, className }: MiniAssetCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(asset)}
      className={`
        flex items-center gap-2 p-2 rounded-lg
        bg-white/5 border border-white/10
        hover:border-white/20 transition-all
        ${className}
      `}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center"
        style={{ backgroundColor: color + '20' }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <span className="text-sm text-white font-medium truncate max-w-[120px]">
        {asset.metadata.name}
      </span>
    </button>
  );
}

// ============================================
// Compact Variant
// ============================================

interface CompactAssetCardProps {
  asset: AssetInstance;
  template?: AssetTemplate | null;
  icon: React.ElementType;
  color: string;
  showStatus: boolean;
  showIcon: boolean;
  onClick?: (asset: AssetInstance) => void;
  className?: string;
}

function CompactAssetCard({
  asset,
  template,
  icon: Icon,
  color,
  showStatus,
  showIcon,
  onClick,
  className,
}: CompactAssetCardProps) {
  return (
    <div
      onClick={() => onClick?.(asset)}
      className={`
        flex items-center gap-3 p-3 rounded-xl cursor-pointer
        bg-white/5 border border-white/10
        hover:border-white/20 hover:bg-white/[0.07] transition-all
        ${className}
      `}
    >
      {showIcon && (
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color + '20' }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white truncate">{asset.metadata.name}</h3>
          {showStatus && (
            <StatusBadge
              status={asset.status}
              size="sm"
              showDot
              pulse={shouldShowPulse(asset.status)}
            />
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">
          {template?.name || getTemplateType(asset)}
        </p>
      </div>

      {asset.currentPrice && (
        <PriceDisplay price={asset.currentPrice} size="sm" />
      )}
    </div>
  );
}

// ============================================
// Detailed Variant
// ============================================

interface DetailedAssetCardProps {
  asset: AssetInstance;
  template?: AssetTemplate | null;
  icon: React.ElementType;
  color: string;
  showStatus: boolean;
  showIcon: boolean;
  showActions: boolean;
  actionLabel: string;
  onClick?: (asset: AssetInstance) => void;
  onPrimaryAction?: (asset: AssetInstance) => void;
  className?: string;
}

function DetailedAssetCard({
  asset,
  template,
  icon: Icon,
  color,
  showStatus,
  showIcon,
  showActions,
  actionLabel,
  onClick,
  onPrimaryAction,
  className,
}: DetailedAssetCardProps) {
  const templateType = getTemplateType(asset);

  // Get template-specific display fields
  const displayFields = useMemo(() => {
    const fields: Array<{ label: string; value: string }> = [];

    switch (templateType) {
      case 'real_estate':
        if (asset.metadata.appraisalValue) {
          fields.push({
            label: 'Valuation',
            value: `$${Number(asset.metadata.appraisalValue).toLocaleString()}`,
          });
        }
        if (asset.metadata.annualYield) {
          fields.push({
            label: 'Annual Yield',
            value: `${asset.metadata.annualYield}%`,
          });
        }
        break;

      default:
        break;
    }

    return fields;
  }, [asset, templateType]);

  return (
    <div
      className={`
        rounded-xl overflow-hidden cursor-pointer
        bg-white/5 border border-white/10
        hover:border-white/20 transition-all
        ${className}
      `}
      onClick={() => onClick?.(asset)}
    >
      {/* Header with image or gradient */}
      <div
        className="h-32 relative"
        style={{
          background: asset.metadata.image
            ? `url(${asset.metadata.image}) center/cover`
            : `linear-gradient(135deg, ${color}40 0%, ${color}10 100%)`,
        }}
      >
        {showIcon && !asset.metadata.image && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="w-16 h-16 opacity-30" style={{ color }} />
          </div>
        )}

        {showStatus && (
          <div className="absolute top-3 right-3">
            <StatusBadge
              status={asset.status}
              showDot
              pulse={shouldShowPulse(asset.status)}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title row */}
        <div className="flex items-start gap-3 mb-3">
          {showIcon && (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: color + '20' }}
            >
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white truncate">{asset.metadata.name}</h3>
            <p className="text-xs text-gray-500">{template?.name || templateType}</p>
          </div>
        </div>

        {/* Metadata info */}
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
          <div className="flex items-center gap-1">
            <Globe className="w-3.5 h-3.5" />
            <span>{asset.jurisdiction}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
          </div>
          {asset.holdersCount !== undefined && (
            <div className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <span>{asset.holdersCount}</span>
            </div>
          )}
        </div>

        {/* Template-specific fields */}
        {displayFields.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {displayFields.map((field) => (
              <div key={field.label}>
                <span className="text-xs text-gray-500">{field.label}</span>
                <p className="text-sm text-white font-medium">{field.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Supply info */}
        <div className="flex items-center justify-between py-2 border-t border-white/5">
          <span className="text-xs text-gray-500">Total Supply</span>
          <TokenAmount
            amount={asset.supply.total}
            decimals={asset.supply.decimals}
            size="sm"
          />
        </div>

        {/* Price if available */}
        {asset.currentPrice && (
          <div className="flex items-center justify-between py-2 border-t border-white/5">
            <span className="text-xs text-gray-500">Price</span>
            <PriceDisplay price={asset.currentPrice} size="sm" />
          </div>
        )}
      </div>

      {/* Actions */}
      {showActions && (
        <div className="p-4 pt-0 flex gap-2">
          <button
            type="button"
            className="flex-1 py-2 bg-white/5 text-white text-sm rounded-lg hover:bg-white/10 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onClick?.(asset);
            }}
          >
            View Details
          </button>
          {asset.status === 'active' && onPrimaryAction && (
            <button
              type="button"
              className="flex-1 py-2 text-sm font-semibold rounded-lg transition-colors"
              style={{
                backgroundColor: color,
                color: '#000',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onPrimaryAction(asset);
              }}
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Skeleton
// ============================================

interface SkeletonProps {
  variant: 'compact' | 'detailed' | 'mini';
  className?: string;
}

function AssetCardSkeleton({ variant, className = '' }: SkeletonProps) {
  if (variant === 'mini') {
    return (
      <div
        className={`flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10 animate-pulse ${className}`}
      >
        <div className="w-8 h-8 rounded-md bg-white/10" />
        <div className="h-4 w-20 bg-white/10 rounded" />
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={`flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 animate-pulse ${className}`}
      >
        <div className="w-10 h-10 rounded-lg bg-white/10" />
        <div className="flex-1">
          <div className="h-4 w-32 bg-white/10 rounded mb-2" />
          <div className="h-3 w-20 bg-white/10 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl overflow-hidden bg-white/5 border border-white/10 animate-pulse ${className}`}
    >
      <div className="h-32 bg-white/10" />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-white/10 rounded mb-2" />
            <div className="h-3 w-20 bg-white/10 rounded" />
          </div>
        </div>
        <div className="h-3 w-full bg-white/10 rounded" />
        <div className="h-3 w-2/3 bg-white/10 rounded" />
      </div>
    </div>
  );
}

export { AssetCardSkeleton };
