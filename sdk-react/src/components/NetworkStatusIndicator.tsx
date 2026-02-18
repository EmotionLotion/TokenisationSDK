/**
 * NetworkStatusIndicator Component - Network Health Monitor
 *
 * Displays real-time network/API health status with configurable
 * ping intervals and three visual variants.
 *
 * @example
 * ```tsx
 * import { NetworkStatusIndicator } from '@tokenisation/sdk-react/components';
 *
 * function Footer() {
 *   return (
 *     <NetworkStatusIndicator
 *       variant="badge"
 *       onStatusChange={(status) => console.log('Network:', status)}
 *     />
 *   );
 * }
 * ```
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// TYPES
// ============================================================================

export type NetworkHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface NetworkStatusIndicatorProps {
  /** Ping interval in milliseconds. Default: 30000 */
  pingInterval?: number;
  /** Display variant. Default: 'dot' */
  variant?: 'dot' | 'badge' | 'detailed';
  /** Health endpoint path. Default: '/api/v1/health' */
  healthEndpoint?: string;
  /** Called when network status changes */
  onStatusChange?: (status: NetworkHealthStatus) => void;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
}

interface ServiceHealth {
  name: string;
  status: NetworkHealthStatus;
  latency: number | null;
}

// ============================================================================
// COLORS
// ============================================================================

const STATUS_COLORS: Record<NetworkHealthStatus, string> = {
  healthy: '#10b981',
  degraded: '#f59e0b',
  unhealthy: '#ef4444',
};

const STATUS_LABELS: Record<NetworkHealthStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unhealthy: 'Unhealthy',
};

// ============================================================================
// DEFAULT STYLES
// ============================================================================

const defaultStyles: Record<string, React.CSSProperties> = {
  dotContainer: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    transition: 'background-color 0.3s',
  },
  badgeContainer: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 500,
    border: '1px solid',
    transition: 'all 0.3s',
  },
  badgeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  detailedContainer: {
    padding: '16px',
    borderRadius: '12px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
  },
  detailedHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  detailedTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  },
  detailedStatus: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 8px',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  serviceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderTop: '1px solid #e5e7eb',
    fontSize: '13px',
  },
  serviceName: {
    color: '#374151',
    fontWeight: 500,
  },
  serviceLatency: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#6b7280',
  },
  serviceStatus: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    marginRight: '8px',
    display: 'inline-block',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function NetworkStatusIndicator({
  pingInterval = 30000,
  variant = 'dot',
  healthEndpoint = '/api/v1/health',
  onStatusChange,
  className,
  style,
}: NetworkStatusIndicatorProps) {
  const { config } = useTokenisation();

  const [status, setStatus] = useState<NetworkHealthStatus>('healthy');
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<NetworkHealthStatus>('healthy');

  // Ping services and determine overall health
  const checkHealth = useCallback(async () => {
    const results: ServiceHealth[] = [];

    // Check API health
    try {
      const start = Date.now();
      const response = await fetch(`${config.apiUrl}${healthEndpoint}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const latency = Date.now() - start;

      results.push({
        name: 'API',
        status: response.ok ? (latency > 2000 ? 'degraded' : 'healthy') : 'unhealthy',
        latency,
      });
    } catch {
      results.push({ name: 'API', status: 'unhealthy', latency: null });
    }

    // Check RPC if networks configured
    if (config.networks && config.networks.length > 0) {
      const network = config.networks.find(n => n.isDefault) || config.networks[0];
      try {
        const start = Date.now();
        const response = await fetch(network.rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_blockNumber',
            params: [],
            id: 1,
          }),
        });
        const latency = Date.now() - start;

        results.push({
          name: 'Blockchain RPC',
          status: response.ok ? (latency > 3000 ? 'degraded' : 'healthy') : 'unhealthy',
          latency,
        });
      } catch {
        results.push({ name: 'Blockchain RPC', status: 'unhealthy', latency: null });
      }
    }

    setServices(results);

    // Determine overall status
    const hasUnhealthy = results.some(s => s.status === 'unhealthy');
    const hasDegraded = results.some(s => s.status === 'degraded');
    const overall: NetworkHealthStatus = hasUnhealthy
      ? 'unhealthy'
      : hasDegraded
        ? 'degraded'
        : 'healthy';

    setStatus(overall);

    // Fire callback on change
    if (overall !== prevStatusRef.current) {
      prevStatusRef.current = overall;
      onStatusChange?.(overall);
    }
  }, [config, healthEndpoint, onStatusChange]);

  // Polling setup
  useEffect(() => {
    checkHealth();

    intervalRef.current = setInterval(checkHealth, pingInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [pingInterval, checkHealth]);

  const color = STATUS_COLORS[status];

  // ---- DOT variant ----
  if (variant === 'dot') {
    return (
      <div
        className={className}
        style={{ ...defaultStyles.dotContainer, ...style }}
        title={`Network: ${STATUS_LABELS[status]}`}
      >
        <span style={{ ...defaultStyles.dot, backgroundColor: color }} />
      </div>
    );
  }

  // ---- BADGE variant ----
  if (variant === 'badge') {
    return (
      <div
        className={className}
        style={{
          ...defaultStyles.badgeContainer,
          backgroundColor: `${color}15`,
          borderColor: `${color}40`,
          color,
          ...style,
        }}
      >
        <span style={{ ...defaultStyles.badgeDot, backgroundColor: color }} />
        {STATUS_LABELS[status]}
      </div>
    );
  }

  // ---- DETAILED variant ----
  return (
    <div
      className={className}
      style={{ ...defaultStyles.detailedContainer, ...style }}
    >
      <div style={defaultStyles.detailedHeader}>
        <h4 style={defaultStyles.detailedTitle}>Network Status</h4>
        <span
          style={{
            ...defaultStyles.detailedStatus,
            backgroundColor: `${color}20`,
            color,
          }}
        >
          <span style={{ ...defaultStyles.badgeDot, backgroundColor: color }} />
          {STATUS_LABELS[status]}
        </span>
      </div>

      {services.map((service) => {
        const sColor = STATUS_COLORS[service.status];
        return (
          <div key={service.name} style={defaultStyles.serviceRow}>
            <span style={defaultStyles.serviceName}>
              <span style={{ ...defaultStyles.serviceStatus, backgroundColor: sColor }} />
              {service.name}
            </span>
            <span style={defaultStyles.serviceLatency}>
              {service.latency !== null ? `${service.latency}ms` : 'timeout'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
