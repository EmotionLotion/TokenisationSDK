/**
 * LoyaltyOperatorPanel — minimal operator UI for the loyalty reference module (T9e).
 *
 * Covers the acceptance-checklist UI surface: account detail (balance + tier),
 * issue (earn) points, redeem points, and a recent-activity list. It is
 * props-driven (no SDK context) so it works directly against `client.loyalty`:
 *
 *   <LoyaltyOperatorPanel
 *     accountId={id}
 *     api={{
 *       balance: (id) => client.loyalty.points.balance(id),
 *       earn:    (id, action) => client.loyalty.points.earn(id, { action }),
 *       redeem:  (id, amount, action, key) =>
 *                  client.loyalty.points.redeem(id, { amount, action, redemptionRate: 100 }, key),
 *       history: (id) => client.loyalty.transactions.list(id, { limit: 10 }),
 *     }}
 *   />
 *
 * Lives in src/ui/* which is excluded from the logic build (this package stays
 * framework-agnostic; react + lucide-react are not runtime deps). See tsconfig.json.
 */
import { useCallback, useEffect, useState } from 'react';
import { Coins, Gift, PlusCircle, History, TrendingUp, TrendingDown } from 'lucide-react';

interface BalanceInfo {
  balance: number;
  currentTier: string;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

interface Txn {
  id: string;
  type: 'earn' | 'spend' | 'expire' | 'adjust';
  amount: number;
  action: string;
  createdAt: string;
}

interface SpendResult {
  balanceAfter: number;
  redeemedValue?: string;
  receipt: { kind: string; status: string };
}

export interface LoyaltyOperatorApi {
  balance: (accountId: string) => Promise<BalanceInfo>;
  earn: (accountId: string, action: string) => Promise<unknown>;
  redeem: (accountId: string, amount: number, action: string, idempotencyKey: string) => Promise<SpendResult>;
  history: (accountId: string) => Promise<{ data: Txn[]; total: number }>;
}

export interface LoyaltyOperatorPanelProps {
  accountId: string;
  api: LoyaltyOperatorApi;
  /** Earn-rule action to credit when "Earn" is pressed. */
  earnAction?: string;
  /** Default redeem action label. */
  redeemAction?: string;
}

export function LoyaltyOperatorPanel({
  accountId,
  api,
  earnAction = 'manual_grant',
  redeemAction = 'gift_card',
}: LoyaltyOperatorPanelProps) {
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [redeemAmount, setRedeemAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [b, h] = await Promise.all([api.balance(accountId), api.history(accountId)]);
      setBalance(b);
      setTxns(h.data);
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to load account');
    }
  }, [accountId, api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError((e as Error)?.message ?? 'Operation failed');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  // A unique key per click keeps each operator action idempotency-safe.
  const idemKey = (op: string) => `op-${op}-${accountId}-${redeemAmount}-${txns.length}`;

  return (
    <div className="max-w-md rounded-xl border border-white/10 bg-gradient-to-br from-gray-800/50 to-gray-900/50 p-4 text-white">
      <div className="mb-3 flex items-center gap-2 text-sm uppercase tracking-wide text-gray-400">
        <Coins className="h-4 w-4 text-amber-400" /> Loyalty Operator
      </div>

      {/* Account detail */}
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-xs text-gray-400">Balance</div>
          <div className="text-3xl font-bold">{balance?.balance?.toLocaleString() ?? '—'}</div>
          <div className="mt-1 text-xs text-gray-500">
            earned {balance?.lifetimeEarned?.toLocaleString() ?? 0} · spent{' '}
            {balance?.lifetimeSpent?.toLocaleString() ?? 0}
          </div>
        </div>
        {balance?.currentTier ? (
          <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-300">
            {balance.currentTier}
          </span>
        ) : null}
      </div>

      {/* Actions: issue (earn) + redeem */}
      <div className="mb-4 space-y-2">
        <button
          disabled={busy}
          onClick={() => void run(() => api.earn(accountId, earnAction))}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/20 px-4 py-2 font-medium text-green-300 disabled:opacity-50"
        >
          <PlusCircle className="h-4 w-4" /> Earn ({earnAction})
        </button>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={redeemAmount}
            onChange={(e) => setRedeemAmount(Math.max(1, parseInt(e.target.value || '0', 10)))}
            className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
          />
          <button
            disabled={busy || !balance || balance.balance < redeemAmount}
            onClick={() => void run(() => api.redeem(accountId, redeemAmount, redeemAction, idemKey('redeem')))}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2 font-medium text-red-300 disabled:opacity-50"
          >
            <Gift className="h-4 w-4" /> Redeem
          </button>
        </div>
      </div>

      {error ? <div className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">{error}</div> : null}

      {/* Recent activity (list) */}
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
        <History className="h-3.5 w-3.5" /> Recent activity
      </div>
      <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {txns.length === 0 ? (
          <div className="py-2 text-xs text-gray-500">No transactions yet.</div>
        ) : (
          txns.map((tx) => {
            const credit = tx.type === 'earn';
            return (
              <div key={tx.id} className="flex items-center justify-between border-b border-white/5 py-1 text-xs last:border-0">
                <span className="flex items-center gap-2 text-gray-300">
                  {credit ? (
                    <TrendingUp className="h-3 w-3 text-green-400" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-400" />
                  )}
                  {tx.action.replace(/_/g, ' ')}
                </span>
                <span className={credit ? 'text-green-400' : 'text-red-400'}>
                  {credit ? '+' : '-'}
                  {tx.amount}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default LoyaltyOperatorPanel;
