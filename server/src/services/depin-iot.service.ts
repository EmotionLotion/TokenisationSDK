/**
 * DePIN IoT Service — "UseYield"
 *
 * IoT data ingestion proving real-world asset utilization.
 * Registers IoT devices to assets, ingests telemetry data, and
 * calculates utilization scores for yield distribution.
 *
 * Uses rawQuery pattern consistent with disruption.service.ts.
 *
 * @packageDocumentation
 */

import { rawQuery, execStatement } from '../config/database.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type DeviceType = 'occupancy_sensor' | 'power_meter' | 'flow_meter' | 'gps_tracker' | 'environmental' | 'access_control';
export type DeviceStatus = 'active' | 'inactive' | 'maintenance' | 'deregistered';

export interface IoTDevice {
  id: string;
  orgId: string;
  assetId: string;
  deviceId: string;
  deviceType: DeviceType;
  location: string;
  status: DeviceStatus;
  lastSeenAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TelemetryPoint {
  id: string;
  orgId: string;
  deviceId: string;
  assetId: string;
  metrics: Record<string, number>;
  timestamp: string;
  createdAt: string;
}

export interface UtilizationScore {
  assetId: string;
  period: string;
  score: number;
  dataPoints: number;
  breakdown: Record<string, number>;
  calculatedAt: string;
}

export interface RegisterDeviceInput {
  assetId: string;
  deviceId: string;
  deviceType: DeviceType;
  location: string;
  metadata?: Record<string, unknown>;
}

export interface IngestTelemetryInput {
  deviceId: string;
  metrics: Record<string, number>;
  timestamp?: string;
}

// ============================================================================
// Initialisation
// ============================================================================

let _initialised = false;

export async function ensureTables(): Promise<void> {
  if (_initialised) return;

  logger.info('DePINIoTService: initialising tables');

  await execStatement(`
    CREATE TABLE IF NOT EXISTS iot_devices (
      id            TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL,
      asset_id      TEXT NOT NULL,
      device_id     TEXT NOT NULL,
      device_type   TEXT NOT NULL,
      location      TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'active',
      last_seen_at  TEXT,
      metadata      TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await execStatement(`
    CREATE TABLE IF NOT EXISTS device_telemetry (
      id          TEXT PRIMARY KEY,
      org_id      TEXT NOT NULL,
      device_id   TEXT NOT NULL,
      asset_id    TEXT NOT NULL,
      metrics     TEXT NOT NULL DEFAULT '{}',
      timestamp   TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await execStatement(`CREATE INDEX IF NOT EXISTS idx_iot_org ON iot_devices (org_id, asset_id)`);
  await execStatement(`CREATE INDEX IF NOT EXISTS idx_iot_device ON iot_devices (device_id)`);
  await execStatement(`CREATE INDEX IF NOT EXISTS idx_dt_device ON device_telemetry (device_id, timestamp)`);
  await execStatement(`CREATE INDEX IF NOT EXISTS idx_dt_asset ON device_telemetry (asset_id, timestamp)`);

  _initialised = true;
  logger.info('DePINIoTService: tables ready');
}

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Register an IoT device to a tokenized asset.
 */
export async function registerDevice(
  orgId: string,
  input: RegisterDeviceInput,
): Promise<IoTDevice> {
  await ensureTables();

  const id = randomUUID();
  const now = new Date().toISOString();

  await execStatement(
    `INSERT INTO iot_devices
       (id, org_id, asset_id, device_id, device_type, location, status, last_seen_at, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', NULL, $7, $8)`,
    [id, orgId, input.assetId, input.deviceId, input.deviceType, input.location, JSON.stringify(input.metadata ?? {}), now],
  );

  logger.info('DePINIoTService: device registered', { id, deviceId: input.deviceId, assetId: input.assetId });

  return {
    id, orgId, assetId: input.assetId, deviceId: input.deviceId,
    deviceType: input.deviceType, location: input.location,
    status: 'active', lastSeenAt: null, metadata: input.metadata ?? {},
    createdAt: now,
  };
}

/**
 * Ingest a telemetry data point from an IoT device.
 */
export async function ingestTelemetry(
  orgId: string,
  input: IngestTelemetryInput,
): Promise<TelemetryPoint> {
  await ensureTables();

  // Look up device to get asset mapping
  const devices = await rawQuery<any>(
    `SELECT * FROM iot_devices WHERE device_id = $1 AND org_id = $2 AND status = 'active' LIMIT 1`,
    [input.deviceId, orgId],
  );
  if (devices.length === 0) throw new Error(`Device ${input.deviceId} not found or not active`);

  const device = devices[0];
  const assetId = device.asset_id ?? device.assetId;
  const id = randomUUID();
  const timestamp = input.timestamp ?? new Date().toISOString();
  const now = new Date().toISOString();

  await execStatement(
    `INSERT INTO device_telemetry (id, org_id, device_id, asset_id, metrics, timestamp, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, orgId, input.deviceId, assetId, JSON.stringify(input.metrics), timestamp, now],
  );

  // Update device last_seen_at
  await execStatement(
    `UPDATE iot_devices SET last_seen_at = $1 WHERE device_id = $2 AND org_id = $3`,
    [now, input.deviceId, orgId],
  );

  return { id, orgId, deviceId: input.deviceId, assetId, metrics: input.metrics, timestamp, createdAt: now };
}

/**
 * Calculate utilization score (0-100) for an asset in a given period.
 * Aggregates telemetry data from all devices linked to the asset.
 */
export async function calculateUtilization(
  orgId: string,
  assetId: string,
  period: string, // e.g., '2025-01' for January 2025
): Promise<UtilizationScore> {
  await ensureTables();

  // Compute correct last day of the period month
  const [periodYear, periodMonth] = period.split('-').map(Number);
  const lastDay = new Date(periodYear, periodMonth, 0).getDate();
  const periodStart = `${period}-01`;
  const periodEnd = `${period}-${String(lastDay).padStart(2, '0')}`;

  // Get all telemetry for this asset in the period
  const telemetry = await rawQuery<any>(
    `SELECT * FROM device_telemetry
     WHERE asset_id = $1 AND org_id = $2 AND timestamp >= $3 AND timestamp <= $4
     ORDER BY timestamp`,
    [assetId, orgId, periodStart, periodEnd],
  );

  if (telemetry.length === 0) {
    return { assetId, period, score: 0, dataPoints: 0, breakdown: {}, calculatedAt: new Date().toISOString() };
  }

  // Whitelist of allowed metric names (prevents injection if metric keys are ever used in SQL)
  const ALLOWED_METRIC_NAMES = new Set([
    'occupancy', 'power_kwh', 'flow_rate', 'temperature', 'humidity',
    'co2_ppm', 'noise_db', 'light_lux', 'access_count', 'utilization',
    'speed', 'latitude', 'longitude', 'battery_percent', 'signal_strength',
    'uptime', 'throughput', 'latency', 'error_rate', 'pressure',
  ]);

  // Aggregate metrics across all data points
  const metricSums: Record<string, number> = {};
  const metricCounts: Record<string, number> = {};

  for (const point of telemetry) {
    let metrics: Record<string, number>;
    try {
      const raw = point.metrics ?? '{}';
      metrics = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { continue; }

    for (const [key, value] of Object.entries(metrics)) {
      if (!ALLOWED_METRIC_NAMES.has(key)) {
        logger.warn('DePINIoTService: skipping unknown metric key', { key, assetId });
        continue;
      }
      metricSums[key] = (metricSums[key] ?? 0) + value;
      metricCounts[key] = (metricCounts[key] ?? 0) + 1;
    }
  }

  // Calculate average for each metric, normalize to 0-100
  const breakdown: Record<string, number> = {};
  let totalScore = 0;
  let metricCount = 0;

  for (const [key, sum] of Object.entries(metricSums)) {
    const avg = sum / (metricCounts[key] || 1);
    // Normalize: assume metrics are 0-100 or percentage-based
    const normalized = Math.min(100, Math.max(0, avg));
    breakdown[key] = Math.round(normalized * 100) / 100;
    totalScore += normalized;
    metricCount++;
  }

  const score = metricCount > 0 ? Math.round((totalScore / metricCount) * 100) / 100 : 0;

  return {
    assetId,
    period,
    score,
    dataPoints: telemetry.length,
    breakdown,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * List devices for an organisation.
 */
export async function listDevices(
  orgId: string,
  filters?: { assetId?: string; deviceType?: DeviceType; status?: DeviceStatus; limit?: number; offset?: number },
): Promise<{ data: IoTDevice[]; count: number }> {
  await ensureTables();

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  let paramIdx = 1;
  const conditions: string[] = [`org_id = $${paramIdx++}`];
  const params: unknown[] = [orgId];

  if (filters?.assetId) { conditions.push(`asset_id = $${paramIdx++}`); params.push(filters.assetId); }
  if (filters?.deviceType) { conditions.push(`device_type = $${paramIdx++}`); params.push(filters.deviceType); }
  if (filters?.status) { conditions.push(`status = $${paramIdx++}`); params.push(filters.status); }

  const where = conditions.join(' AND ');

  const rows = await rawQuery<any>(
    `SELECT * FROM iot_devices WHERE ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset],
  );

  const countRows = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM iot_devices WHERE ${where}`,
    params,
  );

  return {
    data: rows.map(mapDeviceRow),
    count: countRows[0]?.cnt ?? 0,
  };
}

/**
 * Get telemetry for a device.
 */
export async function getDeviceTelemetry(
  orgId: string,
  deviceId: string,
  filters?: { limit?: number; since?: string },
): Promise<TelemetryPoint[]> {
  await ensureTables();

  const limit = filters?.limit ?? 100;
  let paramIdx = 1;
  const conditions: string[] = [`device_id = $${paramIdx++}`, `org_id = $${paramIdx++}`];
  const params: unknown[] = [deviceId, orgId];

  if (filters?.since) {
    conditions.push(`timestamp >= $${paramIdx++}`);
    params.push(filters.since);
  }

  const where = conditions.join(' AND ');

  const rows = await rawQuery<any>(
    `SELECT * FROM device_telemetry WHERE ${where} ORDER BY timestamp DESC LIMIT $${paramIdx++}`,
    [...params, limit],
  );

  return rows.map(mapTelemetryRow);
}

// ============================================================================
// Internal Helpers
// ============================================================================

function mapDeviceRow(row: any): IoTDevice {
  let metadata: Record<string, unknown> = {};
  try {
    const raw = row.metadata ?? '{}';
    metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { /* ignore */ }

  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    assetId: row.asset_id ?? row.assetId,
    deviceId: row.device_id ?? row.deviceId,
    deviceType: (row.device_type ?? row.deviceType) as DeviceType,
    location: row.location ?? '',
    status: (row.status as DeviceStatus) ?? 'active',
    lastSeenAt: row.last_seen_at ?? row.lastSeenAt ?? null,
    metadata,
    createdAt: row.created_at ?? row.createdAt,
  };
}

function mapTelemetryRow(row: any): TelemetryPoint {
  let metrics: Record<string, number> = {};
  try {
    const raw = row.metrics ?? '{}';
    metrics = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { /* ignore */ }

  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    deviceId: row.device_id ?? row.deviceId,
    assetId: row.asset_id ?? row.assetId,
    metrics,
    timestamp: row.timestamp,
    createdAt: row.created_at ?? row.createdAt,
  };
}
