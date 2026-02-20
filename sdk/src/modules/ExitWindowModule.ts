/**
 * ExitWindowModule - SDK module for scheduler-driven exit windows.
 *
 * Provides exit window scheduling, current/next window lookup,
 * and redemption request handling within open windows.
 */

import type { HttpClient } from '../utils/http.js';
import { parseOrThrow, createScheduleInputSchema, redemptionRequestInputSchema } from '../validation/real-estate.js';

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

export class ExitWindowModule {
  constructor(private http: HttpClient) {}

  async setSchedule(assetId: string, schedule: Omit<ExitWindowSchedule, 'id' | 'assetId' | 'nextWindowOpens' | 'active'>): Promise<ExitWindowSchedule> {
    const validated = parseOrThrow(createScheduleInputSchema, schedule, 'SetSchedule');
    const response = await this.http.put<{ data: ExitWindowSchedule }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/exit-schedule`,
      validated,
    );
    return response.data.data;
  }

  async getWindows(assetId: string): Promise<ExitWindow[]> {
    const response = await this.http.get<{ data: ExitWindow[] }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/exit-windows`,
    );
    return response.data.data;
  }

  async getCurrentWindow(assetId: string): Promise<ExitWindow | null> {
    const response = await this.http.get<{ data: ExitWindow | null }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/exit-windows/current`,
    );
    return response.data.data;
  }

  async getNextWindow(assetId: string): Promise<ExitWindow | null> {
    const response = await this.http.get<{ data: ExitWindow | null }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/exit-windows/next`,
    );
    return response.data.data;
  }

  async requestRedemption(assetId: string, input: { investorId: string; amount: number }): Promise<RedemptionRequest> {
    const validated = parseOrThrow(redemptionRequestInputSchema, input, 'RedemptionRequest');
    const response = await this.http.post<{ data: RedemptionRequest }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/exit-windows/redeem`,
      validated,
    );
    return response.data.data;
  }
}
