/**
 * DePIN IoT Service - Unit Tests
 *
 * Tests registerDevice, ingestTelemetry (happy path + non-existent device),
 * calculateUtilization (empty period, February boundary),
 * listDevices (filters), and getDeviceTelemetry (since filter).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  registerDevice,
  ingestTelemetry,
  calculateUtilization,
  listDevices,
  getDeviceTelemetry,
} from '../services/depin-iot.service.js';
import type { RegisterDeviceInput } from '../services/depin-iot.service.js';

// ============================================================================
// Suppress logger output during tests
// ============================================================================

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// Helpers
// ============================================================================

let orgCounter = 0;
function uniqueOrgId(): string {
  return `org-iot-${Date.now()}-${++orgCounter}`;
}

let assetCounter = 0;
function uniqueAssetId(): string {
  return `asset-iot-${Date.now()}-${++assetCounter}`;
}

let deviceCounter = 0;
function uniqueDeviceId(): string {
  return `dev-iot-${Date.now()}-${++deviceCounter}`;
}

/** Create a device with sensible defaults. */
async function createTestDevice(orgId: string, overrides: Partial<RegisterDeviceInput> = {}) {
  return registerDevice(orgId, {
    assetId: uniqueAssetId(),
    deviceId: uniqueDeviceId(),
    deviceType: 'occupancy_sensor',
    location: 'Floor 3, Room 301',
    ...overrides,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('DePIN IoT Service', () => {
  // --------------------------------------------------------------------------
  // registerDevice
  // --------------------------------------------------------------------------
  describe('registerDevice', () => {
    it('creates device record with correct fields', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();
      const deviceId = uniqueDeviceId();

      const device = await registerDevice(orgId, {
        assetId,
        deviceId,
        deviceType: 'power_meter',
        location: 'Utility Room',
        metadata: { manufacturer: 'Acme', model: 'PM-200' },
      });

      expect(device.id).toBeDefined();
      expect(device.orgId).toBe(orgId);
      expect(device.assetId).toBe(assetId);
      expect(device.deviceId).toBe(deviceId);
      expect(device.deviceType).toBe('power_meter');
      expect(device.location).toBe('Utility Room');
      expect(device.status).toBe('active');
      expect(device.lastSeenAt).toBeNull();
      expect(device.metadata).toEqual({ manufacturer: 'Acme', model: 'PM-200' });
      expect(device.createdAt).toBeDefined();
    });

    it('defaults metadata to empty object when not provided', async () => {
      const orgId = uniqueOrgId();

      const device = await registerDevice(orgId, {
        assetId: uniqueAssetId(),
        deviceId: uniqueDeviceId(),
        deviceType: 'gps_tracker',
        location: 'Vehicle Bay',
      });

      expect(device.metadata).toEqual({});
    });

    it('creates multiple devices for the same asset', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const dev1 = await createTestDevice(orgId, { assetId, deviceType: 'occupancy_sensor' });
      const dev2 = await createTestDevice(orgId, { assetId, deviceType: 'power_meter' });

      expect(dev1.id).not.toBe(dev2.id);
      expect(dev1.assetId).toBe(dev2.assetId);
    });
  });

  // --------------------------------------------------------------------------
  // ingestTelemetry
  // --------------------------------------------------------------------------
  describe('ingestTelemetry', () => {
    it('creates telemetry point and updates last_seen_at', async () => {
      const orgId = uniqueOrgId();
      const device = await createTestDevice(orgId);

      const telemetry = await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 75, temperature: 22.5 },
        timestamp: '2024-06-15T10:00:00Z',
      });

      expect(telemetry.id).toBeDefined();
      expect(telemetry.orgId).toBe(orgId);
      expect(telemetry.deviceId).toBe(device.deviceId);
      expect(telemetry.assetId).toBe(device.assetId);
      expect(telemetry.metrics).toEqual({ occupancy: 75, temperature: 22.5 });
      expect(telemetry.timestamp).toBe('2024-06-15T10:00:00Z');

      // Verify last_seen_at was updated via listDevices
      const { data } = await listDevices(orgId, { assetId: device.assetId });
      const updatedDevice = data.find(d => d.deviceId === device.deviceId);
      expect(updatedDevice).toBeDefined();
      expect(updatedDevice!.lastSeenAt).not.toBeNull();
    });

    it('throws for non-existent device', async () => {
      const orgId = uniqueOrgId();

      await expect(
        ingestTelemetry(orgId, {
          deviceId: 'non-existent-device-xyz',
          metrics: { occupancy: 50 },
        }),
      ).rejects.toThrow(/not found or not active/);
    });

    it('throws for device belonging to different org', async () => {
      const orgA = uniqueOrgId();
      const orgB = uniqueOrgId();
      const device = await createTestDevice(orgA);

      await expect(
        ingestTelemetry(orgB, {
          deviceId: device.deviceId,
          metrics: { occupancy: 50 },
        }),
      ).rejects.toThrow(/not found or not active/);
    });

    it('auto-generates timestamp when not provided', async () => {
      const orgId = uniqueOrgId();
      const device = await createTestDevice(orgId);

      const before = new Date().toISOString();
      const telemetry = await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 60 },
      });
      const after = new Date().toISOString();

      expect(telemetry.timestamp).toBeDefined();
      expect(telemetry.timestamp >= before).toBe(true);
      expect(telemetry.timestamp <= after).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // calculateUtilization
  // --------------------------------------------------------------------------
  describe('calculateUtilization', () => {
    it('returns score 0 for empty period (no telemetry data)', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const result = await calculateUtilization(orgId, assetId, '2024-06');

      expect(result.assetId).toBe(assetId);
      expect(result.period).toBe('2024-06');
      expect(result.score).toBe(0);
      expect(result.dataPoints).toBe(0);
      expect(result.breakdown).toEqual({});
      expect(result.calculatedAt).toBeDefined();
    });

    it('calculates utilization from telemetry data', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();
      const device = await createTestDevice(orgId, { assetId });

      // Ingest telemetry in June 2024
      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 80 },
        timestamp: '2024-06-10T12:00:00Z',
      });
      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 60 },
        timestamp: '2024-06-15T12:00:00Z',
      });

      const result = await calculateUtilization(orgId, assetId, '2024-06');

      expect(result.dataPoints).toBe(2);
      expect(result.score).toBeGreaterThan(0);
      // Average occupancy = (80+60)/2 = 70
      expect(result.breakdown.occupancy).toBe(70);
      expect(result.score).toBe(70);
    });

    it('correctly handles February with 28 days (non-leap year)', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();
      const device = await createTestDevice(orgId, { assetId });

      // 2023 is a non-leap year: February has 28 days
      // Data point on Feb 15 should be included in '2023-02' period
      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 90 },
        timestamp: '2023-02-15',
      });

      // Data point on Mar 1 should NOT be included
      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 10 },
        timestamp: '2023-03-01',
      });

      const result = await calculateUtilization(orgId, assetId, '2023-02');

      // The service uses new Date(year, month, 0).getDate() to compute
      // the last day: for 2023-02, lastDay = 28, periodEnd = '2023-02-28'.
      // Only the Feb 15 point should be captured (not Mar 1).
      expect(result.dataPoints).toBe(1);
      expect(result.score).toBe(90);
    });

    it('correctly handles February with 29 days (leap year)', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();
      const device = await createTestDevice(orgId, { assetId });

      // 2024 is a leap year: February has 29 days
      // Data point on Feb 29 (without time component) should be included
      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 85 },
        timestamp: '2024-02-29',
      });

      // Data point on Mar 1 should NOT be included
      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 10 },
        timestamp: '2024-03-01',
      });

      const result = await calculateUtilization(orgId, assetId, '2024-02');

      // The service computes periodEnd as '2024-02-29' for leap year.
      // '2024-02-29' <= '2024-02-29' is true, so Feb 29 data is included.
      expect(result.dataPoints).toBe(1);
      expect(result.score).toBe(85);
    });

    it('does not include data from outside the period', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();
      const device = await createTestDevice(orgId, { assetId });

      // Data in March
      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 99 },
        timestamp: '2024-03-05T12:00:00Z',
      });

      // Calculate for February (should not see March data)
      const result = await calculateUtilization(orgId, assetId, '2024-02');
      expect(result.dataPoints).toBe(0);
      expect(result.score).toBe(0);
    });

    it('handles multiple metric types in breakdown', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();
      const device = await createTestDevice(orgId, { assetId });

      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 70, power_kwh: 50 },
        timestamp: '2024-07-10T12:00:00Z',
      });

      const result = await calculateUtilization(orgId, assetId, '2024-07');

      expect(result.dataPoints).toBe(1);
      expect(result.breakdown.occupancy).toBe(70);
      expect(result.breakdown.power_kwh).toBe(50);
      // Score is average of all metrics: (70 + 50) / 2 = 60
      expect(result.score).toBe(60);
    });
  });

  // --------------------------------------------------------------------------
  // listDevices
  // --------------------------------------------------------------------------
  describe('listDevices', () => {
    it('returns devices for an org', async () => {
      const orgId = uniqueOrgId();

      await createTestDevice(orgId);
      await createTestDevice(orgId);

      const { data, count } = await listDevices(orgId);
      expect(data).toHaveLength(2);
      expect(count).toBe(2);
    });

    it('filters by assetId', async () => {
      const orgId = uniqueOrgId();
      const assetA = uniqueAssetId();
      const assetB = uniqueAssetId();

      await createTestDevice(orgId, { assetId: assetA });
      await createTestDevice(orgId, { assetId: assetA });
      await createTestDevice(orgId, { assetId: assetB });

      const { data, count } = await listDevices(orgId, { assetId: assetA });
      expect(data).toHaveLength(2);
      expect(count).toBe(2);
      for (const d of data) {
        expect(d.assetId).toBe(assetA);
      }
    });

    it('filters by deviceType', async () => {
      const orgId = uniqueOrgId();

      await createTestDevice(orgId, { deviceType: 'power_meter' });
      await createTestDevice(orgId, { deviceType: 'occupancy_sensor' });
      await createTestDevice(orgId, { deviceType: 'power_meter' });

      const { data, count } = await listDevices(orgId, { deviceType: 'power_meter' });
      expect(data).toHaveLength(2);
      expect(count).toBe(2);
      for (const d of data) {
        expect(d.deviceType).toBe('power_meter');
      }
    });

    it('does not return devices from other orgs', async () => {
      const orgA = uniqueOrgId();
      const orgB = uniqueOrgId();

      await createTestDevice(orgA);
      await createTestDevice(orgB);

      const { data, count } = await listDevices(orgA);
      expect(data).toHaveLength(1);
      expect(count).toBe(1);
    });

    it('returns empty list for org with no devices', async () => {
      const orgId = uniqueOrgId();
      const { data, count } = await listDevices(orgId);
      expect(data).toHaveLength(0);
      expect(count).toBe(0);
    });

    it('respects limit and offset', async () => {
      const orgId = uniqueOrgId();

      for (let i = 0; i < 5; i++) {
        await createTestDevice(orgId);
      }

      const { data } = await listDevices(orgId, { limit: 2, offset: 0 });
      expect(data).toHaveLength(2);

      const { data: page2 } = await listDevices(orgId, { limit: 2, offset: 2 });
      expect(page2).toHaveLength(2);

      // Ensure different devices on different pages
      const ids1 = data.map(d => d.id);
      const ids2 = page2.map(d => d.id);
      for (const id of ids1) {
        expect(ids2).not.toContain(id);
      }
    });
  });

  // --------------------------------------------------------------------------
  // getDeviceTelemetry
  // --------------------------------------------------------------------------
  describe('getDeviceTelemetry', () => {
    it('returns telemetry for a device', async () => {
      const orgId = uniqueOrgId();
      const device = await createTestDevice(orgId);

      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 50 },
        timestamp: '2024-08-01T10:00:00Z',
      });
      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 70 },
        timestamp: '2024-08-02T10:00:00Z',
      });

      const points = await getDeviceTelemetry(orgId, device.deviceId);
      expect(points).toHaveLength(2);

      for (const p of points) {
        expect(p.deviceId).toBe(device.deviceId);
        expect(p.orgId).toBe(orgId);
        expect(p.assetId).toBe(device.assetId);
        expect(p.metrics).toBeDefined();
      }
    });

    it('filters with since parameter', async () => {
      const orgId = uniqueOrgId();
      const device = await createTestDevice(orgId);

      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 40 },
        timestamp: '2024-08-01T10:00:00Z',
      });
      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 60 },
        timestamp: '2024-08-10T10:00:00Z',
      });
      await ingestTelemetry(orgId, {
        deviceId: device.deviceId,
        metrics: { occupancy: 80 },
        timestamp: '2024-08-20T10:00:00Z',
      });

      const filtered = await getDeviceTelemetry(orgId, device.deviceId, {
        since: '2024-08-09T00:00:00Z',
      });

      expect(filtered).toHaveLength(2);
      for (const p of filtered) {
        expect(p.timestamp >= '2024-08-09T00:00:00Z').toBe(true);
      }
    });

    it('returns empty array for device with no telemetry', async () => {
      const orgId = uniqueOrgId();
      const device = await createTestDevice(orgId);

      const points = await getDeviceTelemetry(orgId, device.deviceId);
      expect(points).toHaveLength(0);
    });

    it('does not return telemetry from other orgs', async () => {
      const orgA = uniqueOrgId();
      const orgB = uniqueOrgId();
      const device = await createTestDevice(orgA);

      await ingestTelemetry(orgA, {
        deviceId: device.deviceId,
        metrics: { occupancy: 50 },
        timestamp: '2024-08-15T10:00:00Z',
      });

      const points = await getDeviceTelemetry(orgB, device.deviceId);
      expect(points).toHaveLength(0);
    });

    it('respects limit parameter', async () => {
      const orgId = uniqueOrgId();
      const device = await createTestDevice(orgId);

      for (let i = 0; i < 5; i++) {
        await ingestTelemetry(orgId, {
          deviceId: device.deviceId,
          metrics: { occupancy: 50 + i },
          timestamp: `2024-09-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        });
      }

      const points = await getDeviceTelemetry(orgId, device.deviceId, { limit: 3 });
      expect(points).toHaveLength(3);
    });
  });
});
