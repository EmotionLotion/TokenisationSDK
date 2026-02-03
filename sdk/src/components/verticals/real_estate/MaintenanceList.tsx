import React from 'react';
import { defaultTheme, type TokenisationTheme } from '../../theme.js';

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';
export type MaintenanceStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export interface MaintenanceRequest {
  id: string;
  unitId: string | null;
  category: string;
  priority: MaintenancePriority;
  description: string;
  status: MaintenanceStatus;
  assignee: string | null;
  estimatedCost: string | null;
  actualCost: string | null;
  currency: string;
  completedAt: string | null;
  createdAt: string;
}

export interface MaintenanceListProps {
  requests: MaintenanceRequest[];
  onSelectRequest?: (request: MaintenanceRequest) => void;
  onUpdateStatus?: (request: MaintenanceRequest, newStatus: MaintenanceStatus) => void;
  theme?: TokenisationTheme;
  loading?: boolean;
  emptyMessage?: string;
}

const priorityColors: Record<MaintenancePriority, { bg: string; text: string }> = {
  low: { bg: '#6B728020', text: '#6B7280' },
  medium: { bg: '#3B82F620', text: '#3B82F6' },
  high: { bg: '#F59E0B20', text: '#F59E0B' },
  urgent: { bg: '#EF444420', text: '#EF4444' },
};

const statusColors: Record<MaintenanceStatus, { bg: string; text: string }> = {
  open: { bg: '#3B82F620', text: '#3B82F6' },
  assigned: { bg: '#8B5CF620', text: '#8B5CF6' },
  in_progress: { bg: '#F59E0B20', text: '#F59E0B' },
  completed: { bg: '#10B98120', text: '#10B981' },
  cancelled: { bg: '#6B728020', text: '#6B7280' },
};

const statusLabels: Record<MaintenanceStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function MaintenanceList({
  requests,
  onSelectRequest,
  onUpdateStatus,
  theme = defaultTheme,
  loading = false,
  emptyMessage = 'No maintenance requests',
}: MaintenanceListProps) {
  if (loading) {
    return (
      <div style={{
        padding: theme.spacing.lg,
        textAlign: 'center',
        color: theme.colors.textMuted,
      }}>
        Loading maintenance requests...
      </div>
    );
  }

  if (requests.length === 0) {
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.md,
    }}>
      {requests.map((request) => (
        <div
          key={request.id}
          onClick={() => onSelectRequest?.(request)}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: theme.borderRadius.lg,
            border: `1px solid ${theme.colors.border}`,
            padding: theme.spacing.md,
            cursor: onSelectRequest ? 'pointer' : 'default',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (onSelectRequest) {
              e.currentTarget.style.borderColor = theme.colors.primary;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = theme.colors.border;
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: theme.spacing.sm,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.sm,
                marginBottom: theme.spacing.xs,
              }}>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: theme.colors.text,
                }}>
                  {request.category}
                </span>
                <span style={{
                  padding: `2px ${theme.spacing.sm}`,
                  borderRadius: theme.borderRadius.full,
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: priorityColors[request.priority].bg,
                  color: priorityColors[request.priority].text,
                  textTransform: 'uppercase',
                }}>
                  {request.priority}
                </span>
              </div>
              <p style={{
                margin: 0,
                fontSize: '14px',
                color: theme.colors.textSecondary,
                lineHeight: 1.5,
              }}>
                {request.description}
              </p>
            </div>

            <span style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              borderRadius: theme.borderRadius.md,
              fontSize: '12px',
              fontWeight: 500,
              backgroundColor: statusColors[request.status].bg,
              color: statusColors[request.status].text,
              whiteSpace: 'nowrap',
            }}>
              {statusLabels[request.status]}
            </span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: theme.spacing.sm,
            borderTop: `1px solid ${theme.colors.border}`,
          }}>
            <div style={{
              display: 'flex',
              gap: theme.spacing.lg,
              fontSize: '12px',
              color: theme.colors.textMuted,
            }}>
              <span>Created: {formatDate(request.createdAt)}</span>
              {request.assignee && <span>Assignee: {request.assignee}</span>}
              {request.estimatedCost && (
                <span>Est: {request.currency} {parseFloat(request.estimatedCost).toLocaleString()}</span>
              )}
              {request.actualCost && (
                <span>Actual: {request.currency} {parseFloat(request.actualCost).toLocaleString()}</span>
              )}
            </div>

            {onUpdateStatus && request.status !== 'completed' && request.status !== 'cancelled' && (
              <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                {request.status === 'open' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateStatus(request, 'assigned');
                    }}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: 'transparent',
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: theme.borderRadius.md,
                      color: theme.colors.textSecondary,
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    Assign
                  </button>
                )}
                {(request.status === 'assigned' || request.status === 'open') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateStatus(request, 'in_progress');
                    }}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: 'transparent',
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: theme.borderRadius.md,
                      color: theme.colors.textSecondary,
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    Start
                  </button>
                )}
                {request.status === 'in_progress' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateStatus(request, 'completed');
                    }}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: theme.colors.success,
                      border: 'none',
                      borderRadius: theme.borderRadius.md,
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    Complete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
