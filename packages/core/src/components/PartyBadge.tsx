/**
 * Party Badge Component
 *
 * Displays party information with avatar, name, and KYC status.
 *
 * @example
 * ```tsx
 * <PartyBadge party={myParty} />
 * <PartyBadge party={myParty} showRoles showKyc />
 * ```
 */

import React from 'react';
import { type Party } from '../models/Party.js';
import { KYCBadge } from './KYCBadge.js';
import { defaultTheme, type TokenisationTheme } from './theme.js';

export interface PartyBadgeProps {
  party: Party;
  showRoles?: boolean;
  showKyc?: boolean;
  showJurisdiction?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  theme?: TokenisationTheme;
}

const sizeStyles = {
  sm: { avatar: 24, fontSize: '12px', gap: '6px' },
  md: { avatar: 32, fontSize: '14px', gap: '8px' },
  lg: { avatar: 40, fontSize: '16px', gap: '10px' },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(id: string): string {
  const colors = [
    '#F8B032',
    '#6366F1',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#EC4899',
    '#14B8A6',
  ];
  const index = id.charCodeAt(0) % colors.length;
  return colors[index];
}

export function PartyBadge({
  party,
  showRoles = false,
  showKyc = true,
  showJurisdiction = false,
  size = 'md',
  onClick,
  theme = defaultTheme,
}: PartyBadgeProps) {
  const styles = sizeStyles[size];
  const isVerified = party.verificationLevel !== 'NONE';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: styles.gap,
        padding: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: theme.fonts.family,
        transition: 'border-color 0.2s',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = theme.colors.primary;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border;
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: styles.avatar,
          height: styles.avatar,
          borderRadius: '50%',
          backgroundColor: getAvatarColor(party.id),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: `${styles.avatar * 0.4}px`,
          fontWeight: 600,
          color: '#000000',
        }}
      >
        {getInitials(party.name)}
      </div>

      {/* Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <span
            style={{
              fontSize: styles.fontSize,
              fontWeight: 500,
              color: theme.colors.text,
            }}
          >
            {party.name}
          </span>
          {showJurisdiction && (
            <span
              style={{
                fontSize: '10px',
                color: theme.colors.textMuted,
                padding: '1px 4px',
                backgroundColor: `${theme.colors.textMuted}20`,
                borderRadius: theme.borderRadius.sm,
              }}
            >
              {party.jurisdiction}
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            flexWrap: 'wrap',
          }}
        >
          {showKyc && (
            <KYCBadge
              verified={isVerified}
              level={party.verificationLevel}
              theme={theme}
            />
          )}
          {showRoles &&
            party.roles.map((role) => (
              <span
                key={role}
                style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: theme.borderRadius.sm,
                  backgroundColor: `${theme.colors.secondary}20`,
                  color: theme.colors.secondary,
                }}
              >
                {role}
              </span>
            ))}
        </div>
      </div>

      {/* Frozen indicator */}
      {party.isFrozen && (
        <span
          style={{
            fontSize: '14px',
            marginLeft: 'auto',
          }}
          title={party.freezeReason || 'Account frozen'}
        >
          🔒
        </span>
      )}
    </div>
  );
}
