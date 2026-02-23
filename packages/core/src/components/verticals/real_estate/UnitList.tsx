import React from 'react';
import { defaultTheme, type TokenisationTheme } from '../../theme.js';

export type UnitType = 'studio' | 'apartment' | '1bed' | '2bed' | '3bed' | 'penthouse' | 'retail' | 'office' | 'warehouse' | 'other';
export type UnitStatus = 'vacant' | 'occupied' | 'maintenance' | 'reserved';

export interface PropertyUnit {
  id: string;
  unitNumber: string;
  type: UnitType;
  area: number;
  tenantName: string | null;
  tenantEmail: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  monthlyRent: string | null;
  currency: string;
  status: UnitStatus;
}

export interface UnitListProps {
  units: PropertyUnit[];
  onSelectUnit?: (unit: PropertyUnit) => void;
  onEditUnit?: (unit: PropertyUnit) => void;
  theme?: TokenisationTheme;
  loading?: boolean;
  emptyMessage?: string;
}

const statusColors: Record<UnitStatus, { bg: string; text: string }> = {
  vacant: { bg: '#10B98120', text: '#10B981' },
  occupied: { bg: '#3B82F620', text: '#3B82F6' },
  maintenance: { bg: '#F59E0B20', text: '#F59E0B' },
  reserved: { bg: '#8B5CF620', text: '#8B5CF6' },
};

const unitTypeLabels: Record<UnitType, string> = {
  studio: 'Studio',
  apartment: 'Apartment',
  '1bed': '1 Bedroom',
  '2bed': '2 Bedroom',
  '3bed': '3 Bedroom',
  penthouse: 'Penthouse',
  retail: 'Retail',
  office: 'Office',
  warehouse: 'Warehouse',
  other: 'Other',
};

export function UnitList({
  units,
  onSelectUnit,
  onEditUnit,
  theme = defaultTheme,
  loading = false,
  emptyMessage = 'No units found',
}: UnitListProps) {
  if (loading) {
    return (
      <div style={{
        padding: theme.spacing.lg,
        textAlign: 'center',
        color: theme.colors.textMuted,
      }}>
        Loading units...
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div style={{
        padding: theme.spacing.lg,
        textAlign: 'center',
        color: theme.colors.textMuted,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.border}`,
      }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      border: `1px solid ${theme.colors.border}`,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 100px 120px 100px 80px',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background,
        borderBottom: `1px solid ${theme.colors.border}`,
        fontSize: '12px',
        fontWeight: 600,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
      }}>
        <div>Unit</div>
        <div>Type</div>
        <div>Area</div>
        <div>Rent</div>
        <div>Status</div>
        <div></div>
      </div>

      {units.map((unit) => (
        <div
          key={unit.id}
          onClick={() => onSelectUnit?.(unit)}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 120px 100px 120px 100px 80px',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderBottom: `1px solid ${theme.colors.border}`,
            cursor: onSelectUnit ? 'pointer' : 'default',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (onSelectUnit) {
              e.currentTarget.style.backgroundColor = theme.colors.background;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: theme.colors.text }}>
              {unit.unitNumber}
            </div>
            {unit.tenantName && (
              <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginTop: '2px' }}>
                {unit.tenantName}
              </div>
            )}
          </div>

          <div style={{ color: theme.colors.textSecondary, fontSize: '14px' }}>
            {unitTypeLabels[unit.type]}
          </div>

          <div style={{ color: theme.colors.textSecondary, fontSize: '14px' }}>
            {unit.area.toLocaleString()} sqft
          </div>

          <div style={{ color: theme.colors.text, fontSize: '14px' }}>
            {unit.monthlyRent ? (
              <span>
                {unit.currency} {parseFloat(unit.monthlyRent).toLocaleString()}
              </span>
            ) : (
              <span style={{ color: theme.colors.textMuted }}>-</span>
            )}
          </div>

          <div>
            <span style={{
              display: 'inline-block',
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              borderRadius: theme.borderRadius.full,
              fontSize: '12px',
              fontWeight: 500,
              backgroundColor: statusColors[unit.status].bg,
              color: statusColors[unit.status].text,
              textTransform: 'capitalize',
            }}>
              {unit.status}
            </span>
          </div>

          <div>
            {onEditUnit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditUnit(unit);
                }}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                  color: theme.colors.textSecondary,
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Edit
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
