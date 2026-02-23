/**
 * Asset Card Component
 *
 * Displays asset information in a card format.
 *
 * @example
 * ```tsx
 * <AssetCard asset={myAsset} />
 * <AssetCard asset={myAsset} showMetadata onAction={(action) => ...} />
 * ```
 */

import React from 'react';
import { type Asset } from '../models/Asset.js';
import { LifecycleStatus } from './LifecycleStatus.js';
import { defaultTheme, type TokenisationTheme } from './theme.js';

export interface AssetCardProps {
  asset: Asset;
  showMetadata?: boolean;
  showDescription?: boolean;
  compact?: boolean;
  onAction?: (action: 'view' | 'transfer' | 'mint') => void;
  theme?: TokenisationTheme;
}

const rightTypeIcons: Record<string, string> = {
  OWNERSHIP: '🏠',
  ACCESS: '🎫',
  BEHAVIOR: '⭐',
  VERIFICATION: '✅',
};

const rightTypeLabels: Record<string, string> = {
  OWNERSHIP: 'Ownership',
  ACCESS: 'Access',
  BEHAVIOR: 'Behavior',
  VERIFICATION: 'Verification',
};

export function AssetCard({
  asset,
  showMetadata = false,
  showDescription = true,
  compact = false,
  onAction,
  theme = defaultTheme,
}: AssetCardProps) {
  const icon = rightTypeIcons[asset.rightType] || '📄';
  const typeLabel = rightTypeLabels[asset.rightType] || asset.rightType;

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          padding: theme.spacing.sm,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          fontFamily: theme.fonts.family,
          cursor: onAction ? 'pointer' : 'default',
        }}
        onClick={() => onAction?.('view')}
      >
        <span style={{ fontSize: '20px' }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: theme.colors.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {asset.name}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: theme.colors.textMuted,
            }}
          >
            {typeLabel} • {asset.jurisdiction.countryCode}
          </div>
        </div>
        <LifecycleStatus state={asset.state} size="sm" theme={theme} />
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: theme.borderRadius.lg,
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        overflow: 'hidden',
        fontFamily: theme.fonts.family,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: theme.spacing.md,
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: theme.spacing.md,
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: theme.borderRadius.md,
            backgroundColor: `${theme.colors.primary}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: theme.colors.text,
              marginBottom: '4px',
            }}
          >
            {asset.name}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: theme.borderRadius.sm,
                backgroundColor: `${theme.colors.secondary}20`,
                color: theme.colors.secondary,
              }}
            >
              {typeLabel}
            </span>
            <span
              style={{
                fontSize: '12px',
                color: theme.colors.textMuted,
              }}
            >
              {asset.jurisdiction.countryCode}
            </span>
            <LifecycleStatus state={asset.state} size="sm" theme={theme} />
          </div>
        </div>
      </div>

      {/* Description */}
      {showDescription && asset.description && (
        <div
          style={{
            padding: theme.spacing.md,
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: theme.colors.textSecondary,
              lineHeight: 1.5,
            }}
          >
            {asset.description}
          </p>
        </div>
      )}

      {/* Metadata */}
      {showMetadata && asset.metadata && Object.keys(asset.metadata).length > 0 && (
        <div
          style={{
            padding: theme.spacing.md,
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.colors.textMuted,
              marginBottom: theme.spacing.sm,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Metadata
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: theme.spacing.sm,
            }}
          >
            {Object.entries(asset.metadata)
              .slice(0, 6)
              .map(([key, value]) => (
                <div key={key}>
                  <div
                    style={{
                      fontSize: '11px',
                      color: theme.colors.textMuted,
                      marginBottom: '2px',
                    }}
                  >
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: theme.colors.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {onAction && (
        <div
          style={{
            padding: theme.spacing.md,
            display: 'flex',
            gap: theme.spacing.sm,
          }}
        >
          <button
            style={{
              flex: 1,
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border}`,
              backgroundColor: 'transparent',
              color: theme.colors.text,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              fontFamily: theme.fonts.family,
            }}
            onClick={() => onAction('view')}
          >
            View Details
          </button>
          {asset.state === 'ACTIVE' && (
            <>
              <button
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  borderRadius: theme.borderRadius.md,
                  border: 'none',
                  backgroundColor: theme.colors.primary,
                  color: '#000000',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: theme.fonts.family,
                }}
                onClick={() => onAction('transfer')}
              >
                Transfer
              </button>
              <button
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  borderRadius: theme.borderRadius.md,
                  border: 'none',
                  backgroundColor: theme.colors.secondary,
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: theme.fonts.family,
                }}
                onClick={() => onAction('mint')}
              >
                Mint
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
