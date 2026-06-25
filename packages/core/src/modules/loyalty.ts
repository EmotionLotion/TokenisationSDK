/**
 * Loyalty Module (T9d) — developer-facing SDK surface for the loyalty reference module.
 *
 * Mirrors the T9c server routes under /api/v1/loyalty. Mutating point operations
 * (redeem/consume/revoke) require an idempotency key and flow through the server's
 * audited RightAction primitive (T9b). Nested shape:
 *   client.loyalty.programs.create()
 *   client.loyalty.accounts.create()
 *   client.loyalty.points.earn() / balance() / redeem() / consume() / revoke()
 *   client.loyalty.transactions.list()
 *
 * Note: programs/accounts list+get are not yet exposed (no server routes — see fix_queue T9d-FOLLOWUP-1).
 */
import type { HttpClient } from '../utils/http.js';

// ── Types (mirror server shapes) ─────────────────────────────────────────────
export interface LoyaltyEarnRule { action: string; points: number; multiplier?: number; }
export interface LoyaltyTier { name: string; minPoints: number; multiplier: number; benefits: string[]; }

export interface LoyaltyProgram {
  id: string; orgId: string; name: string; description: string; currency: string;
  tiers: LoyaltyTier[]; earnRules: LoyaltyEarnRule[]; redeemRules: Record<string, unknown>;
  status: 'active' | 'paused'; createdAt: string; updatedAt: string;
}

export interface LoyaltyAccount {
  id: string; orgId: string; programId: string; investorId: string;
  balance: number; lifetimeEarned: number; lifetimeSpent: number;
  currentTier: string; tierQualifyingPoints: number; streakDays: number;
  lastActivityAt: string | null; createdAt: string;
}

export interface LoyaltyTransaction {
  id: string; orgId: string; accountId: string; programId: string;
  type: 'earn' | 'spend' | 'expire' | 'adjust'; amount: number;
  balanceBefore: number; balanceAfter: number; action: string;
  referenceId: string | null; referenceType: string | null;
  description: string; metadata: Record<string, unknown>; createdAt: string;
}

export interface LoyaltyBalanceInfo {
  balance: number; currentTier: string; lifetimeEarned: number; lifetimeSpent: number;
}

/** A receipt from the unified Right Action primitive (server T6a). */
export interface RightActionReceipt {
  id: string; kind: 'REDEEM' | 'CONSUME' | 'REVOKE' | 'EXPIRE' | 'VERIFY_ACCESS';
  status: string; subjectId: string; quantity: string | null; unit: string | null;
  auditEntryId: string | null; metadata: Record<string, unknown>; createdAt: string;
}

export interface LoyaltySpendResult {
  receipt: RightActionReceipt;
  transactionId: string | null;
  balanceBefore: number;
  balanceAfter: number;
  redeemedValue?: string;
}

export interface CreateLoyaltyProgramInput {
  name: string; description?: string; currency?: string; earnRules?: LoyaltyEarnRule[];
}
export interface CreateLoyaltyAccountInput { programId: string; investorId: string; }
export interface EarnPointsInput { action: string; referenceId?: string; description?: string; }
export interface SpendPointsInput {
  amount: number; action: string; reason?: string;
  redemptionRate?: number; minRedemptionAmount?: number;
}

// ── Sub-modules ──────────────────────────────────────────────────────────────
class LoyaltyProgramsApi {
  constructor(private http: HttpClient) {}
  /** Create a loyalty program. */
  async create(input: CreateLoyaltyProgramInput, idempotencyKey?: string): Promise<LoyaltyProgram> {
    const res = await this.http.post<{ program: LoyaltyProgram }>('/api/v1/loyalty/programs', input, { idempotencyKey });
    return res.data.program;
  }
}

class LoyaltyAccountsApi {
  constructor(private http: HttpClient) {}
  /** Open (or fetch) a loyalty account for an investor in a program. */
  async create(input: CreateLoyaltyAccountInput, idempotencyKey?: string): Promise<LoyaltyAccount> {
    const res = await this.http.post<{ account: LoyaltyAccount }>('/api/v1/loyalty/accounts', input, { idempotencyKey });
    return res.data.account;
  }
}

class LoyaltyPointsApi {
  constructor(private http: HttpClient) {}

  /** Earn points for an account (per the program's earn rule). */
  async earn(accountId: string, input: EarnPointsInput, idempotencyKey?: string): Promise<LoyaltyTransaction> {
    const res = await this.http.post<{ transaction: LoyaltyTransaction }>(`/api/v1/loyalty/accounts/${accountId}/earn`, input, { idempotencyKey });
    return res.data.transaction;
  }

  /** Get current balance and tier for an account. */
  async balance(accountId: string): Promise<LoyaltyBalanceInfo> {
    const res = await this.http.get<{ balance: LoyaltyBalanceInfo }>(`/api/v1/loyalty/accounts/${accountId}/balance`);
    return res.data.balance;
  }

  /** Redeem points for value (RightAction REDEEM). Idempotency key required. */
  async redeem(accountId: string, input: SpendPointsInput, idempotencyKey: string): Promise<LoyaltySpendResult> {
    const res = await this.http.post<LoyaltySpendResult>(`/api/v1/loyalty/accounts/${accountId}/redeem`, input, { idempotencyKey });
    return res.data;
  }

  /** Consume points (RightAction CONSUME). Idempotency key required. */
  async consume(accountId: string, input: SpendPointsInput, idempotencyKey: string): Promise<LoyaltySpendResult> {
    const res = await this.http.post<LoyaltySpendResult>(`/api/v1/loyalty/accounts/${accountId}/consume`, input, { idempotencyKey });
    return res.data;
  }

  /** Admin clawback (RightAction REVOKE). Idempotency key required. */
  async revoke(accountId: string, reason: string, idempotencyKey: string): Promise<{ receipt: RightActionReceipt; revoked: number }> {
    const res = await this.http.post<{ receipt: RightActionReceipt; revoked: number }>(`/api/v1/loyalty/accounts/${accountId}/revoke`, { reason }, { idempotencyKey });
    return res.data;
  }
}

class LoyaltyTransactionsApi {
  constructor(private http: HttpClient) {}
  /** List an account's transaction history. */
  async list(accountId: string, params?: { limit?: number; offset?: number }): Promise<{ data: LoyaltyTransaction[]; total: number }> {
    const res = await this.http.get<{ data: LoyaltyTransaction[]; total: number }>(`/api/v1/loyalty/accounts/${accountId}/transactions`, params as Record<string, number | undefined>);
    return res.data;
  }
}

/** Loyalty module — the reference programmable-rights vertical. */
export class LoyaltyModule {
  public readonly programs: LoyaltyProgramsApi;
  public readonly accounts: LoyaltyAccountsApi;
  public readonly points: LoyaltyPointsApi;
  public readonly transactions: LoyaltyTransactionsApi;

  constructor(http: HttpClient) {
    this.programs = new LoyaltyProgramsApi(http);
    this.accounts = new LoyaltyAccountsApi(http);
    this.points = new LoyaltyPointsApi(http);
    this.transactions = new LoyaltyTransactionsApi(http);
  }
}
