import React from 'react';
import { defaultTheme, type TokenisationTheme } from '../../theme.js';

export interface PropertySummary {
  assetId: string;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  maintenanceUnits: number;
  reservedUnits: number;
  occupancyRate: number;
  totalMonthlyRent: number;
  maintenanceOpen: number;
  maintenanceInProgress: number;
  maintenanceCompleted: number;
  totalExpenses: number;
  expenseCurrency: string;
}

export interface OccupancyDashboardProps {
  summary: PropertySummary | null;
  currency?: string;
  theme?: TokenisationTheme;
  loading?: boolean;
  propertyName?: string;
}

export function OccupancyDashboard({
  summary,
  currency = 'USD',
  theme = defaultTheme,
  loading = false,
  propertyName,
}: OccupancyDashboardProps) {
  if (loading) {
    return (
      <div style={{
        padding: theme.spacing.xl,
        textAlign: 'center',
        color: theme.colors.textMuted,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.border}`,
      }}>
        Loading property summary...
      </div>
    );
  }

  if (!summary) {
    return (
      <div style={{
        padding: theme.spacing.xl,
        textAlign: 'center',
        color: theme.colors.textMuted,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.border}`,
      }}>
        No property data available
      </div>
    );
  }

  const occupancyPercent = summary.occupancyRate;
  const occupancyColor = occupancyPercent >= 90 ? theme.colors.success
    : occupancyPercent >= 70 ? theme.colors.warning
    : theme.colors.error;

  // Unit breakdown for pie-like visualization
  const unitBreakdown = [
    { label: 'Occupied', value: summary.occupiedUnits, color: '#3B82F6' },
    { label: 'Vacant', value: summary.vacantUnits, color: '#10B981' },
    { label: 'Maintenance', value: summary.maintenanceUnits, color: '#F59E0B' },
    { label: 'Reserved', value: summary.reservedUnits, color: '#8B5CF6' },
  ].filter(u => u.value > 0);

  return (
    <div style={{
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      border: `1px solid ${theme.colors.border}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      {propertyName && (
        <div style={{
          padding: theme.spacing.md,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}>
          <h3 style={{ margin: 0, color: theme.colors.text, fontSize: '16px' }}>
            {propertyName}
          </h3>
        </div>
      )}

      {/* Main Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1px',
        backgroundColor: theme.colors.border,
      }}>
        {/* Occupancy Rate */}
        <div style={{
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.surface,
          textAlign: 'center',
        }}>
          <div style={{
            position: 'relative',
            width: '120px',
            height: '120px',
            margin: '0 auto',
          }}>
            {/* Background circle */}
            <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke={theme.colors.background}
                strokeWidth="10"
              />
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke={occupancyColor}
                strokeWidth="10"
                strokeDasharray={`${(occupancyPercent / 100) * 314} 314`}
                strokeLinecap="round"
              />
            </svg>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: theme.colors.text }}>
                {occupancyPercent}%
              </div>
              <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>
                Occupancy
              </div>
            </div>
          </div>
        </div>

        {/* Units Summary */}
        <div style={{
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.surface,
        }}>
          <div style={{
            fontSize: '12px',
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.md,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}>
            Units Overview
          </div>

          <div style={{ display: 'flex', gap: theme.spacing.xs, marginBottom: theme.spacing.md }}>
            {unitBreakdown.map((unit) => (
              <div
                key={unit.label}
                style={{
                  flex: unit.value,
                  height: '8px',
                  backgroundColor: unit.color,
                  borderRadius: theme.borderRadius.full,
                }}
                title={`${unit.label}: ${unit.value}`}
              />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.sm }}>
            {unitBreakdown.map((unit) => (
              <div key={unit.label} style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  backgroundColor: unit.color,
                }} />
                <span style={{ fontSize: '13px', color: theme.colors.textSecondary }}>
                  {unit.label}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.text, marginLeft: 'auto' }}>
                  {unit.value}
                </span>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: theme.spacing.md,
            paddingTop: theme.spacing.sm,
            borderTop: `1px solid ${theme.colors.border}`,
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '13px', color: theme.colors.textSecondary }}>Total Units</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: theme.colors.text }}>{summary.totalUnits}</span>
          </div>
        </div>

        {/* Financial Summary */}
        <div style={{
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.surface,
        }}>
          <div style={{
            fontSize: '12px',
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.md,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}>
            Financial Summary
          </div>

          <div style={{ marginBottom: theme.spacing.md }}>
            <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '4px' }}>
              Monthly Rental Income
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: theme.colors.success }}>
              {currency} {summary.totalMonthlyRent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '4px' }}>
              Total Expenses
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: theme.colors.error }}>
              {summary.expenseCurrency} {summary.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* Maintenance Summary */}
        <div style={{
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.surface,
        }}>
          <div style={{
            fontSize: '12px',
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.md,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}>
            Maintenance Status
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: theme.spacing.sm,
              backgroundColor: '#3B82F620',
              borderRadius: theme.borderRadius.md,
            }}>
              <span style={{ fontSize: '13px', color: '#3B82F6' }}>Open</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#3B82F6' }}>{summary.maintenanceOpen}</span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: theme.spacing.sm,
              backgroundColor: '#F59E0B20',
              borderRadius: theme.borderRadius.md,
            }}>
              <span style={{ fontSize: '13px', color: '#F59E0B' }}>In Progress</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#F59E0B' }}>{summary.maintenanceInProgress}</span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: theme.spacing.sm,
              backgroundColor: '#10B98120',
              borderRadius: theme.borderRadius.md,
            }}>
              <span style={{ fontSize: '13px', color: '#10B981' }}>Completed</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#10B981' }}>{summary.maintenanceCompleted}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
