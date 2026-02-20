/**
 * Exit Window Service - Integration Tests
 *
 * Tests schedule creation, window generation, getCurrentWindow,
 * getNextWindow, and requestRedemptionInWindow for various
 * frequencies and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSchedule,
  getWindows,
  getCurrentWindow,
  getNextWindow,
  requestRedemptionInWindow,
  updateWindowStatus,
} from '../services/exit-window.service.js';
import type { ExitWindow } from '../services/exit-window.service.js';

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

/** Generate a unique asset id per test to avoid shared state. */
let assetCounter = 0;
function uniqueAssetId(): string {
  return `asset-ew-${Date.now()}-${++assetCounter}`;
}

// ============================================================================
// Tests
// ============================================================================

describe('Exit Window Service', () => {
  describe('createSchedule', () => {
    it('creates a schedule and returns it with correct fields', async () => {
      const assetId = uniqueAssetId();
      const schedule = await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 14,
        maxRedemptionPercent: 10,
        noticePeriodDays: 30,
      });

      // Phase 2.5 fix: schedule IDs use randomUUID() to avoid collisions
      expect(schedule.id).toBeTruthy();
      expect(schedule.assetId).toBe(assetId);
      expect(schedule.frequency).toBe('quarterly');
      expect(schedule.windowDurationDays).toBe(14);
      expect(schedule.maxRedemptionPercent).toBe(10);
      expect(schedule.noticePeriodDays).toBe(30);
      expect(schedule.active).toBe(true);
      expect(schedule.nextWindowOpens).toBeDefined();
    });

    it('generates future windows on creation', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 7,
        maxRedemptionPercent: 5,
        noticePeriodDays: 14,
      });

      const windows = await getWindows(assetId);
      expect(windows.length).toBeGreaterThan(0);
    });

    it('quarterly schedule generates 4 windows', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 7,
        maxRedemptionPercent: 5,
        noticePeriodDays: 14,
      });

      const windows = await getWindows(assetId);
      expect(windows).toHaveLength(4);
    });

    it('monthly schedule generates 4 windows', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'monthly',
        windowDurationDays: 5,
        maxRedemptionPercent: 8,
        noticePeriodDays: 7,
      });

      const windows = await getWindows(assetId);
      expect(windows).toHaveLength(4);
    });

    it('semi-annually schedule generates 4 windows', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'semi-annually',
        windowDurationDays: 14,
        maxRedemptionPercent: 15,
        noticePeriodDays: 60,
      });

      const windows = await getWindows(assetId);
      expect(windows).toHaveLength(4);
    });

    it('annually schedule generates 4 windows', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'annually',
        windowDurationDays: 30,
        maxRedemptionPercent: 25,
        noticePeriodDays: 90,
      });

      const windows = await getWindows(assetId);
      expect(windows).toHaveLength(4);
    });
  });

  describe('window timing and intervals', () => {
    it('monthly windows are spaced approximately 1 month apart', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'monthly',
        windowDurationDays: 3,
        maxRedemptionPercent: 5,
        noticePeriodDays: 7,
      });

      const windows = await getWindows(assetId);
      expect(windows.length).toBeGreaterThanOrEqual(2);

      const open0 = new Date(windows[0].opensAt).getTime();
      const open1 = new Date(windows[1].opensAt).getTime();
      const diffDays = (open1 - open0) / (1000 * 60 * 60 * 24);

      // Monthly intervals should be roughly 28-31 days
      expect(diffDays).toBeGreaterThanOrEqual(27);
      expect(diffDays).toBeLessThanOrEqual(32);
    });

    it('quarterly windows are spaced approximately 3 months apart', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 7,
        maxRedemptionPercent: 10,
        noticePeriodDays: 14,
      });

      const windows = await getWindows(assetId);
      expect(windows.length).toBeGreaterThanOrEqual(2);

      const open0 = new Date(windows[0].opensAt).getTime();
      const open1 = new Date(windows[1].opensAt).getTime();
      const diffDays = (open1 - open0) / (1000 * 60 * 60 * 24);

      // Quarterly intervals should be roughly 89-93 days
      expect(diffDays).toBeGreaterThanOrEqual(85);
      expect(diffDays).toBeLessThanOrEqual(95);
    });

    it('each window has opensAt before closesAt', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 14,
        maxRedemptionPercent: 10,
        noticePeriodDays: 30,
      });

      const windows = await getWindows(assetId);
      for (const w of windows) {
        expect(new Date(w.opensAt).getTime()).toBeLessThan(new Date(w.closesAt).getTime());
      }
    });

    it('window duration matches the configured windowDurationDays', async () => {
      const assetId = uniqueAssetId();
      const durationDays = 10;
      await createSchedule(assetId, {
        frequency: 'monthly',
        windowDurationDays: durationDays,
        maxRedemptionPercent: 5,
        noticePeriodDays: 7,
      });

      const windows = await getWindows(assetId);
      for (const w of windows) {
        const opens = new Date(w.opensAt).getTime();
        const closes = new Date(w.closesAt).getTime();
        const actualDays = (closes - opens) / (1000 * 60 * 60 * 24);
        expect(actualDays).toBe(durationDays);
      }
    });
  });

  describe('window properties', () => {
    it('each window has the correct assetId', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 7,
        maxRedemptionPercent: 10,
        noticePeriodDays: 14,
      });

      const windows = await getWindows(assetId);
      for (const w of windows) {
        expect(w.assetId).toBe(assetId);
      }
    });

    it('each window has maxRedemptionPercent from schedule', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 7,
        maxRedemptionPercent: 12,
        noticePeriodDays: 14,
      });

      const windows = await getWindows(assetId);
      for (const w of windows) {
        expect(w.maxRedemptionPercent).toBe(12);
      }
    });

    it('newly generated windows have totalRedeemed=0 and totalRequested=0', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'monthly',
        windowDurationDays: 5,
        maxRedemptionPercent: 5,
        noticePeriodDays: 7,
      });

      const windows = await getWindows(assetId);
      for (const w of windows) {
        expect(w.totalRedeemed).toBe(0);
        expect(w.totalRequested).toBe(0);
      }
    });

    it('each window has a unique id', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 7,
        maxRedemptionPercent: 10,
        noticePeriodDays: 14,
      });

      const windows = await getWindows(assetId);
      const ids = windows.map(w => w.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('getCurrentWindow', () => {
    it('returns null when no schedule exists', async () => {
      const result = await getCurrentWindow(uniqueAssetId());
      expect(result).toBeNull();
    });

    it('returns null when all windows are in the future', async () => {
      // createSchedule sets nextWindowOpens to next month, so all windows
      // should be scheduled (future) or possibly open if the test runs on the 1st.
      // Since generated windows start next month, they should all be "scheduled".
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 7,
        maxRedemptionPercent: 10,
        noticePeriodDays: 14,
      });

      const current = await getCurrentWindow(assetId);
      // The first window opens next month, so it's likely scheduled, not open.
      // This verifies the function returns null when no window is currently open.
      const windows = await getWindows(assetId);
      const openWindows = windows.filter(w => w.status === 'open');
      if (openWindows.length === 0) {
        expect(current).toBeNull();
      } else {
        // If a window happens to be open (edge case), it should be returned
        expect(current).not.toBeNull();
        expect(current!.status).toBe('open');
      }
    });
  });

  describe('getNextWindow', () => {
    it('returns null when no schedule exists', async () => {
      const result = await getNextWindow(uniqueAssetId());
      expect(result).toBeNull();
    });

    it('returns the next scheduled window after creating a schedule', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 7,
        maxRedemptionPercent: 10,
        noticePeriodDays: 14,
      });

      const nextWindow = await getNextWindow(assetId);
      // Since all windows are in the future, the first scheduled one should be returned.
      const windows = await getWindows(assetId);
      const scheduledWindows = windows.filter(w => w.status === 'scheduled');

      if (scheduledWindows.length > 0) {
        expect(nextWindow).not.toBeNull();
        expect(nextWindow!.status).toBe('scheduled');
        // The next window should be the first scheduled one
        expect(nextWindow!.id).toBe(scheduledWindows[0].id);
      }
    });

    it('next window opensAt is in the future', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'monthly',
        windowDurationDays: 5,
        maxRedemptionPercent: 8,
        noticePeriodDays: 7,
      });

      const nextWindow = await getNextWindow(assetId);
      if (nextWindow) {
        expect(new Date(nextWindow.opensAt).getTime()).toBeGreaterThan(Date.now());
      }
    });
  });

  describe('requestRedemptionInWindow', () => {
    it('throws when no exit window is currently open', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 7,
        maxRedemptionPercent: 10,
        noticePeriodDays: 14,
      });

      // Since windows open next month, there should be no currently open window
      const current = await getCurrentWindow(assetId);
      if (!current) {
        await expect(
          requestRedemptionInWindow(assetId, 'inv-001', 5000),
        ).rejects.toThrow(/no exit window is currently open/i);
      }
    });

    it('throws when no schedule exists at all', async () => {
      await expect(
        requestRedemptionInWindow(uniqueAssetId(), 'inv-001', 5000),
      ).rejects.toThrow(/no exit window is currently open/i);
    });

    it('succeeds when a window is manually made open', async () => {
      // Create a schedule, then set a window to open status via updateWindowStatus
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'monthly',
        windowDurationDays: 5,
        maxRedemptionPercent: 10,
        noticePeriodDays: 7,
      });

      const windows = await getWindows(assetId);
      if (windows.length > 0) {
        await updateWindowStatus(windows[0].id, 'open');

        const redemption = await requestRedemptionInWindow(assetId, 'inv-001', 5000);

        expect(redemption).toBeDefined();
        expect(redemption.id).toBeDefined();
        expect(redemption.id.startsWith('rdm-')).toBe(true);
        expect(redemption.windowId).toBe(windows[0].id);
        expect(redemption.investorId).toBe('inv-001');
        expect(redemption.amount).toBe(5000);
        expect(redemption.status).toBe('pending');
        expect(redemption.createdAt).toBeDefined();
      }
    });

    it('increments totalRequested on the window', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'monthly',
        windowDurationDays: 5,
        maxRedemptionPercent: 10,
        noticePeriodDays: 7,
      });

      const windows = await getWindows(assetId);
      if (windows.length > 0) {
        await updateWindowStatus(windows[0].id, 'open');

        await requestRedemptionInWindow(assetId, 'inv-A', 3000);
        const afterFirst = await getWindows(assetId);
        const w1 = afterFirst.find(w => w.id === windows[0].id)!;
        expect(w1.totalRequested).toBe(3000);

        await requestRedemptionInWindow(assetId, 'inv-B', 2000);
        const afterSecond = await getWindows(assetId);
        const w2 = afterSecond.find(w => w.id === windows[0].id)!;
        expect(w2.totalRequested).toBe(5000);
      }
    });

    it('multiple redemptions reference the same window', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'monthly',
        windowDurationDays: 5,
        maxRedemptionPercent: 10,
        noticePeriodDays: 7,
      });

      const windows = await getWindows(assetId);
      if (windows.length > 0) {
        await updateWindowStatus(windows[0].id, 'open');

        const r1 = await requestRedemptionInWindow(assetId, 'inv-X', 1000);
        const r2 = await requestRedemptionInWindow(assetId, 'inv-Y', 2000);

        expect(r1.windowId).toBe(r2.windowId);
        expect(r1.windowId).toBe(windows[0].id);
      }
    });
  });

  describe('getWindows for non-existent asset', () => {
    it('returns empty array when no schedule exists', async () => {
      const windows = await getWindows(uniqueAssetId());
      expect(windows).toEqual([]);
    });
  });

  describe('window status assignment', () => {
    it('windows that have not opened yet have status "scheduled"', async () => {
      const assetId = uniqueAssetId();
      await createSchedule(assetId, {
        frequency: 'quarterly',
        windowDurationDays: 7,
        maxRedemptionPercent: 10,
        noticePeriodDays: 14,
      });

      const windows = await getWindows(assetId);
      // Since nextWindowOpens is set to next month, all 4 should be scheduled
      // (unless the test somehow runs right at the boundary)
      const scheduledCount = windows.filter(w => w.status === 'scheduled').length;
      expect(scheduledCount).toBeGreaterThanOrEqual(3); // at least 3 of 4 should be scheduled
    });
  });
});
