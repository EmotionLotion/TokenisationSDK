/**
 * Exit Window Service
 *
 * Manages scheduler-driven exit windows for real estate token redemptions.
 * Data persisted in DB (exit_window_schedules, exit_windows, exit_redemptions).
 */

import crypto from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db, exitWindowSchedules, exitWindows, exitRedemptions } from '../config/database.js';
import { logger } from '../middleware/logger.js';

export interface ExitWindow {
  id: string;
  assetId: string;
  opensAt: string;
  closesAt: string;
  status: 'scheduled' | 'open' | 'closed';
  maxRedemptionPercent: number;
  totalRedeemed: number;
  totalRequested: number;
}

export interface ExitWindowSchedule {
  id: string;
  assetId: string;
  frequency: 'monthly' | 'quarterly' | 'semi-annually' | 'annually';
  windowDurationDays: number;
  maxRedemptionPercent: number;
  noticePeriodDays: number;
  nextWindowOpens: string;
  active: boolean;
}

export interface RedemptionRequest {
  id: string;
  windowId: string;
  investorId: string;
  amount: number;
  status: 'pending' | 'approved' | 'executed' | 'rejected';
  createdAt: string;
}

// ============================================================================
// Helpers
// ============================================================================

function rowToSchedule(row: any): ExitWindowSchedule {
  return {
    id: row.id,
    assetId: row.assetId ?? row.asset_id,
    frequency: row.frequency,
    windowDurationDays: Number(row.windowDurationDays ?? row.window_duration_days),
    maxRedemptionPercent: Number(row.maxRedemptionPercent ?? row.max_redemption_percent),
    noticePeriodDays: Number(row.noticePeriodDays ?? row.notice_period_days),
    nextWindowOpens: row.nextWindowOpens ?? row.next_window_opens,
    active: Boolean(row.active),
  };
}

function rowToWindow(row: any): ExitWindow {
  return {
    id: row.id,
    assetId: row.assetId ?? row.asset_id,
    opensAt: row.opensAt ?? row.opens_at,
    closesAt: row.closesAt ?? row.closes_at,
    status: row.status,
    maxRedemptionPercent: Number(row.maxRedemptionPercent ?? row.max_redemption_percent),
    totalRedeemed: Number(row.totalRedeemed ?? row.total_redeemed),
    totalRequested: Number(row.totalRequested ?? row.total_requested),
  };
}

function generateWindowRecords(schedule: ExitWindowSchedule): ExitWindow[] {
  const windows: ExitWindow[] = [];
  const now = new Date();
  const frequencyMonths = { monthly: 1, quarterly: 3, 'semi-annually': 6, annually: 12 }[schedule.frequency];

  for (let i = 0; i < 4; i++) {
    const openDate = new Date(schedule.nextWindowOpens);
    openDate.setMonth(openDate.getMonth() + i * frequencyMonths);
    const closeDate = new Date(openDate);
    closeDate.setDate(closeDate.getDate() + schedule.windowDurationDays);

    let status: ExitWindow['status'] = 'scheduled';
    if (now >= openDate && now <= closeDate) status = 'open';
    else if (now > closeDate) status = 'closed';

    windows.push({
      id: `ew-${schedule.assetId}-${i}`,
      assetId: schedule.assetId,
      opensAt: openDate.toISOString(),
      closesAt: closeDate.toISOString(),
      status,
      maxRedemptionPercent: schedule.maxRedemptionPercent,
      totalRedeemed: 0,
      totalRequested: 0,
    });
  }
  return windows;
}

// ============================================================================
// Service Functions
// ============================================================================

export async function createSchedule(
  assetId: string,
  input: { frequency: ExitWindowSchedule['frequency']; windowDurationDays: number; maxRedemptionPercent: number; noticePeriodDays: number },
): Promise<ExitWindowSchedule> {
  const nextOpen = new Date();
  nextOpen.setMonth(nextOpen.getMonth() + 1);
  nextOpen.setDate(1);

  const schedule: ExitWindowSchedule = {
    id: crypto.randomUUID(),
    assetId,
    ...input,
    nextWindowOpens: nextOpen.toISOString(),
    active: true,
  };

  await (db as any).insert(exitWindowSchedules).values({
    id: schedule.id,
    assetId: schedule.assetId,
    frequency: schedule.frequency,
    windowDurationDays: schedule.windowDurationDays,
    maxRedemptionPercent: String(schedule.maxRedemptionPercent),
    noticePeriodDays: schedule.noticePeriodDays,
    nextWindowOpens: schedule.nextWindowOpens,
    active: schedule.active ? 1 : 0,
  });

  // Generate and persist window records
  const windows = generateWindowRecords(schedule);
  for (const w of windows) {
    await (db as any).insert(exitWindows).values({
      id: w.id,
      scheduleId: schedule.id,
      assetId: w.assetId,
      opensAt: w.opensAt,
      closesAt: w.closesAt,
      status: w.status,
      maxRedemptionPercent: String(w.maxRedemptionPercent),
      totalRedeemed: String(w.totalRedeemed),
      totalRequested: String(w.totalRequested),
    });
  }

  logger.info('Created exit window schedule', { assetId, frequency: input.frequency });
  return schedule;
}

export async function getSchedule(assetId: string): Promise<ExitWindowSchedule | null> {
  const rows = await (db as any).select().from(exitWindowSchedules).where(eq(exitWindowSchedules.assetId, assetId));
  return rows.length > 0 ? rowToSchedule(rows[0]) : null;
}

export async function getWindows(assetId: string): Promise<ExitWindow[]> {
  const schedule = await getSchedule(assetId);
  if (!schedule) return [];

  const rows = await (db as any).select().from(exitWindows).where(eq(exitWindows.assetId, assetId));
  return rows.map(rowToWindow);
}

export async function getCurrentWindow(assetId: string): Promise<ExitWindow | null> {
  const windows = await getWindows(assetId);
  return windows.find(w => w.status === 'open') || null;
}

export async function getNextWindow(assetId: string): Promise<ExitWindow | null> {
  const windows = await getWindows(assetId);
  return windows.find(w => w.status === 'scheduled') || null;
}

export async function requestRedemptionInWindow(
  assetId: string,
  investorId: string,
  amount: number,
): Promise<RedemptionRequest> {
  const current = await getCurrentWindow(assetId);
  if (!current) {
    throw new Error('No exit window is currently open');
  }

  const request: RedemptionRequest = {
    id: `rdm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    windowId: current.id,
    investorId,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await (db as any).insert(exitRedemptions).values({
    id: request.id,
    windowId: request.windowId,
    investorId: request.investorId,
    amount: String(request.amount),
    status: request.status,
  });

  // Update totalRequested on the window
  const newTotal = current.totalRequested + amount;
  await (db as any).update(exitWindows)
    .set({ totalRequested: String(newTotal) })
    .where(eq(exitWindows.id, current.id));

  logger.info('Redemption requested in exit window', { assetId, windowId: current.id, investorId, amount });
  return request;
}

/**
 * Update window status — used by tests and by scheduled jobs to open/close windows.
 */
export async function updateWindowStatus(windowId: string, status: ExitWindow['status']): Promise<void> {
  await (db as any).update(exitWindows)
    .set({ status })
    .where(eq(exitWindows.id, windowId));
}

/**
 * Process time-based window transitions:
 * - scheduled -> open  when current time >= opensAt
 * - open     -> closed when current time >= closesAt
 *
 * Optionally scoped to a single assetId.
 */
export async function processWindowTransitions(assetId?: string): Promise<{ opened: number; closed: number }> {
  const now = new Date();
  let opened = 0;
  let closed = 0;

  // Get schedules (all active, or filtered by assetId)
  let scheduleRows: any[];
  if (assetId) {
    scheduleRows = await (db as any).select().from(exitWindowSchedules)
      .where(and(eq(exitWindowSchedules.assetId, assetId), eq(exitWindowSchedules.active, 1)));
  } else {
    scheduleRows = await (db as any).select().from(exitWindowSchedules)
      .where(eq(exitWindowSchedules.active, 1));
  }

  for (const schedule of scheduleRows) {
    // Get all windows for this schedule
    const windowRows = await (db as any).select().from(exitWindows)
      .where(eq(exitWindows.scheduleId, schedule.id));

    for (const row of windowRows) {
      const w = rowToWindow(row);
      const opensAt = new Date(w.opensAt);
      const closesAt = new Date(w.closesAt);

      if (w.status === 'scheduled' && now >= opensAt) {
        await updateWindowStatus(w.id, 'open');
        opened++;
        logger.info('Exit window opened', { windowId: w.id, assetId: w.assetId, opensAt: w.opensAt });
      } else if (w.status === 'open' && now >= closesAt) {
        await updateWindowStatus(w.id, 'closed');
        closed++;
        logger.info('Exit window closed', { windowId: w.id, assetId: w.assetId, closesAt: w.closesAt });
      }
    }
  }

  if (opened > 0 || closed > 0) {
    logger.info('Exit window transitions processed', { opened, closed });
  }

  return { opened, closed };
}

/**
 * Register the exit-window transition handler with the scheduler.
 * Call this once at application startup.
 */
export function registerExitWindowSchedulerJob(): void {
  // Dynamic import to avoid circular dependencies at module load time
  import('./scheduler.service.js').then(({ registerJobHandler }) => {
    registerJobHandler('exit-window.transitions', async (_job) => {
      const result = await processWindowTransitions();
      return result as unknown as Record<string, unknown>;
    });
  });
}
