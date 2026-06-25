/**
 * LoyaltyConsole — operator dashboard for the certified loyalty reference module (T15).
 *
 * Talks to the REAL loyalty API (`/api/v1/loyalty/*`) through the SDK
 * (`createApiClient(...).loyalty.*`). It is NOT a mock: point it at a running
 * server with a loyalty-scoped `sk_` key and it drives the live flow —
 * create program → open account → earn → balance → redeem/consume/revoke —
 * surfacing the audited, idempotent RightAction receipt for each spend.
 *
 * Demo-focused and narrow (the T15 scope is the loyalty surface only). The
 * client is injected via `makeClient` so the page is unit-testable with a fake.
 *
 * Known surface gap: loyalty has no programs/accounts list/get routes yet
 * (fix_queue T9d-FOLLOWUP-1), so this console manages the program/account
 * created (or entered) in the current session rather than listing them.
 */
import { useCallback, useState, type ComponentType, type ReactNode } from 'react';
import { v4 as uuid } from 'uuid';
import {
  Coins, PlusCircle, Gift, Flame, ShieldX, RefreshCw, Receipt, Code2,
  History, TrendingUp, TrendingDown, Plug, CheckCircle2, AlertTriangle, ScrollText,
} from 'lucide-react';
import type {
  ApiClient,
  LoyaltyProgram, LoyaltyAccount, LoyaltyTransaction,
  LoyaltyBalanceInfo, LoyaltySpendResult, RightActionReceipt,
} from '@tokenisation/sdk';
import { CodeBlock } from '../components/shared/CodeBlock';

/** The slice of the SDK client this page uses. */
type LoyaltyClient = Pick<ApiClient, 'loyalty'>;

export interface LoyaltyConsoleProps {
  /** Build the SDK client (injectable for tests). Defaults to the real client. */
  makeClient?: (cfg: { apiKey: string; baseUrl: string }) => LoyaltyClient | Promise<LoyaltyClient>;
}

/**
 * Default client factory — lazily imports the SDK only when the operator
 * connects, so the page (and its tests) don't eagerly load the umbrella.
 */
async function defaultMakeClient(cfg: { apiKey: string; baseUrl: string }): Promise<LoyaltyClient> {
  const { createApiClient } = await import('@tokenisation/sdk');
  return createApiClient(cfg);
}

const errMsg = (e: unknown): string =>
  (e as { message?: string })?.message ?? 'Operation failed';

export function LoyaltyConsole({ makeClient }: LoyaltyConsoleProps) {
  const build = makeClient ?? defaultMakeClient;

  // ── Connection ────────────────────────────────────────────────────────────
  const [baseUrl, setBaseUrl] = useState('http://localhost:3001');
  const [apiKey, setApiKey] = useState('');
  const [client, setClient] = useState<LoyaltyClient | null>(null);

  // ── Session entities ────────────────────────────────────────────────────────
  const [program, setProgram] = useState<LoyaltyProgram | null>(null);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [balance, setBalance] = useState<LoyaltyBalanceInfo | null>(null);
  const [txns, setTxns] = useState<LoyaltyTransaction[]>([]);
  const [lastResult, setLastResult] = useState<LoyaltySpendResult | null>(null);
  const [lastReceipt, setLastReceipt] = useState<RightActionReceipt | null>(null);

  // ── Form inputs ───────────────────────────────────────────────────────────
  const [programName, setProgramName] = useState('Cafe Rewards');
  const [currency, setCurrency] = useState('POINTS');
  const [earnAction, setEarnAction] = useState('purchase_reward');
  const [earnPoints, setEarnPoints] = useState(100);
  const [investorId, setInvestorId] = useState('customer_123');
  const [loadAccountId, setLoadAccountId] = useState('');
  const [spendAmount, setSpendAmount] = useState(50);
  const [spendAction, setSpendAction] = useState('free_coffee');
  const [revokeReason, setRevokeReason] = useState('fraud_clawback');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const c = await build({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim().replace(/\/$/, '') });
      setClient(c);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [apiKey, baseUrl, build]);

  const refresh = useCallback(
    async (acctId: string) => {
      if (!client) return;
      const [b, h] = await Promise.all([
        client.loyalty.points.balance(acctId),
        client.loyalty.transactions.list(acctId, { limit: 25 }),
      ]);
      setBalance(b);
      setTxns(h.data);
    },
    [client],
  );

  /** Run a mutating action, then refresh balance + ledger. */
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        if (account) await refresh(account.id);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [account, refresh],
  );

  const createProgram = () =>
    run(async () => {
      const p = await client!.loyalty.programs.create(
        { name: programName, currency, earnRules: [{ action: earnAction, points: earnPoints }] },
        `program-${uuid()}`,
      );
      setProgram(p);
    });

  const openAccount = () =>
    run(async () => {
      const a = await client!.loyalty.accounts.create({ programId: program!.id, investorId }, `acct-${uuid()}`);
      setAccount(a);
      await refresh(a.id);
    });

  const loadAccount = () =>
    run(async () => {
      // No get-account route yet (T9d-FOLLOWUP-1); hydrate from balance + ledger by id.
      const id = loadAccountId.trim();
      const b = await client!.loyalty.points.balance(id);
      setAccount({ id } as LoyaltyAccount);
      setBalance(b);
      const h = await client!.loyalty.transactions.list(id, { limit: 25 });
      setTxns(h.data);
    });

  const earn = () =>
    run(async () => {
      await client!.loyalty.points.earn(account!.id, { action: earnAction }, `earn-${uuid()}`);
    });

  const spend = (kind: 'redeem' | 'consume') =>
    run(async () => {
      const input = { amount: spendAmount, action: spendAction, redemptionRate: 100 };
      const res =
        kind === 'redeem'
          ? await client!.loyalty.points.redeem(account!.id, input, `redeem-${uuid()}`)
          : await client!.loyalty.points.consume(account!.id, input, `consume-${uuid()}`);
      setLastResult(res);
      setLastReceipt(res.receipt);
    });

  const revoke = () =>
    run(async () => {
      const res = await client!.loyalty.points.revoke(account!.id, revokeReason, `revoke-${uuid()}`);
      setLastResult(null);
      setLastReceipt(res.receipt);
    });

  const connected = client !== null;
  const insufficient = !!balance && balance.balance < spendAmount;

  return (
    <div className="animate-in fade-in duration-500 max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <Coins className="h-7 w-7 text-[#F8B032]" /> Loyalty Operator Console
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            The certified reference programmable-right module — live{' '}
            <code className="text-gray-300">client.loyalty.*</code> against{' '}
            <code className="text-gray-300">/api/v1/loyalty</code>. Redeem / consume / revoke flow
            through the audited, idempotent RightAction primitive.
          </p>
        </div>
        <span
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
            connected ? 'bg-green-500/15 text-green-300' : 'bg-white/5 text-gray-400'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-500'}`} />
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      ) : null}

      {/* Connect panel */}
      {!connected ? (
        <Panel icon={Plug} title="Connect">
          <p className="mb-3 text-xs text-gray-400">
            Enter a loyalty-scoped API key. Seed one with{' '}
            <code className="text-gray-300">cd server &amp;&amp; pnpm db:seed --org-only</code>.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Base URL">
              <input className={inputCls} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:3001" />
            </Field>
            <Field label="API key">
              <input className={inputCls} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk_test_..." type="password" />
            </Field>
          </div>
          <button onClick={() => void connect()} disabled={!apiKey.trim()} className={primaryBtn}>
            <Plug className="h-4 w-4" /> Connect
          </button>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LEFT column: setup + actions */}
          <div className="space-y-6 lg:col-span-1">
            {/* Setup: program + account (programs/accounts summary) */}
            <Panel icon={PlusCircle} title="Setup">
              {!program ? (
                <>
                  <Field label="Program name"><input className={inputCls} value={programName} onChange={(e) => setProgramName(e.target.value)} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Currency"><input className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)} /></Field>
                    <Field label="Earn points"><input type="number" className={inputCls} value={earnPoints} onChange={(e) => setEarnPoints(Math.max(1, parseInt(e.target.value || '0', 10)))} /></Field>
                  </div>
                  <Field label="Earn-rule action"><input className={inputCls} value={earnAction} onChange={(e) => setEarnAction(e.target.value)} /></Field>
                  <button onClick={createProgram} disabled={busy} className={primaryBtn}>Create program</button>
                </>
              ) : (
                <Summary rows={[['Program', program.name], ['Program ID', program.id], ['Currency', program.currency]]} />
              )}

              {program && !account ? (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <Field label="Customer / investor ID"><input className={inputCls} value={investorId} onChange={(e) => setInvestorId(e.target.value)} /></Field>
                  <button onClick={openAccount} disabled={busy} className={primaryBtn}>Open account</button>
                </div>
              ) : null}

              {account ? <div className="mt-3 border-t border-white/10 pt-3"><Summary rows={[['Account ID', account.id]]} /></div> : null}

              {!program ? (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <Field label="…or load an existing account by ID"><input className={inputCls} value={loadAccountId} onChange={(e) => setLoadAccountId(e.target.value)} placeholder="account uuid" /></Field>
                  <button onClick={loadAccount} disabled={busy || !loadAccountId.trim()} className={secondaryBtn}>Load account</button>
                </div>
              ) : null}
            </Panel>

            {/* Actions: earn / redeem / consume / revoke */}
            {account ? (
              <Panel icon={Gift} title="Actions">
                <button onClick={earn} disabled={busy} className={`${actionBtn} border-green-500/30 bg-green-500/15 text-green-300`}>
                  <PlusCircle className="h-4 w-4" /> Earn ({earnAction})
                </button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Field label="Amount"><input type="number" className={inputCls} value={spendAmount} onChange={(e) => setSpendAmount(Math.max(1, parseInt(e.target.value || '0', 10)))} /></Field>
                  <Field label="Action"><input className={inputCls} value={spendAction} onChange={(e) => setSpendAction(e.target.value)} /></Field>
                </div>
                {insufficient ? <p className="mb-2 text-xs text-amber-300">Balance below amount — server will reject (INSUFFICIENT_BALANCE).</p> : null}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => spend('redeem')} disabled={busy} className={`${actionBtn} border-red-500/30 bg-red-500/15 text-red-300`}>
                    <Gift className="h-4 w-4" /> Redeem
                  </button>
                  <button onClick={() => spend('consume')} disabled={busy} className={`${actionBtn} border-orange-500/30 bg-orange-500/15 text-orange-300`}>
                    <Flame className="h-4 w-4" /> Consume
                  </button>
                </div>
                <div className="mt-3 border-t border-white/10 pt-3">
                  <Field label="Revoke reason (admin clawback)"><input className={inputCls} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} /></Field>
                  <button onClick={revoke} disabled={busy} className={`${actionBtn} border-purple-500/30 bg-purple-500/15 text-purple-300`}>
                    <ShieldX className="h-4 w-4" /> Revoke (zero balance)
                  </button>
                </div>
              </Panel>
            ) : null}
          </div>

          {/* RIGHT column: overview, receipt, ledger */}
          <div className="space-y-6 lg:col-span-2">
            {/* Overview cards (balance + tier) */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Balance" value={balance ? balance.balance.toLocaleString() : '—'} accent />
              <Stat label="Tier" value={balance?.currentTier || '—'} />
              <Stat label="Lifetime earned" value={balance ? balance.lifetimeEarned.toLocaleString() : '—'} />
              <Stat label="Lifetime spent" value={balance ? balance.lifetimeSpent.toLocaleString() : '—'} />
            </div>
            {account ? (
              <button onClick={() => void run(async () => {})} disabled={busy} className={secondaryBtn}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            ) : null}

            {/* RightAction receipt */}
            {lastReceipt ? (
              <Panel icon={Receipt} title="RightAction receipt">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-[#F8B032]/15 px-2 py-0.5 text-xs font-semibold text-[#F8B032]">{lastReceipt.kind}</span>
                  <span className="flex items-center gap-1 text-xs text-green-300"><CheckCircle2 className="h-3.5 w-3.5" /> {lastReceipt.status}</span>
                </div>
                <Summary
                  rows={[
                    ['Receipt ID', lastReceipt.id],
                    ['Subject', lastReceipt.subjectId],
                    ...(lastReceipt.quantity ? [['Quantity', `${lastReceipt.quantity}${lastReceipt.unit ? ' ' + lastReceipt.unit : ''}`] as [string, string]] : []),
                    ...(lastResult?.redeemedValue ? [['Redeemed value', lastResult.redeemedValue] as [string, string]] : []),
                    ...(lastResult ? [['Balance', `${lastResult.balanceBefore} → ${lastResult.balanceAfter}`] as [string, string]] : []),
                  ]}
                />
                {/* Audit evidence link */}
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2 text-xs text-gray-400">
                  <ScrollText className="h-3.5 w-3.5 text-gray-500" />
                  Audit entry:{' '}
                  <code className="text-gray-300">{lastReceipt.auditEntryId ?? '(none)'}</code>
                  <span className="ml-auto text-gray-600">hash-chained · right.{lastReceipt.kind.toLowerCase()}.{lastReceipt.status.toLowerCase()}</span>
                </div>
              </Panel>
            ) : null}

            {/* Transactions / ledger evidence */}
            <Panel icon={History} title="Transaction ledger (audit evidence)">
              {txns.length === 0 ? (
                <p className="py-2 text-xs text-gray-500">No transactions yet.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-gray-500">
                      <tr><th className="py-1">Type</th><th>Action</th><th className="text-right">Amount</th><th className="text-right">Before → After</th><th className="text-right">When</th></tr>
                    </thead>
                    <tbody>
                      {txns.map((tx) => {
                        const credit = tx.type === 'earn';
                        return (
                          <tr key={tx.id} className="border-t border-white/5">
                            <td className="py-1.5">
                              <span className="flex items-center gap-1 text-gray-300">
                                {credit ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                                {tx.type}
                              </span>
                            </td>
                            <td className="text-gray-400">{tx.action?.replace(/_/g, ' ')}</td>
                            <td className={`text-right ${credit ? 'text-green-400' : 'text-red-400'}`}>{credit ? '+' : '-'}{tx.amount}</td>
                            <td className="text-right text-gray-500">{tx.balanceBefore} → {tx.balanceAfter}</td>
                            <td className="text-right text-gray-600">{new Date(tx.createdAt).toLocaleTimeString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* Developer snippet (always visible) */}
      <div className="mt-6">
        <Panel icon={Code2} title="Developer — client.loyalty.*">
          <CodeBlock
            language="typescript"
            tabs={[
              { label: 'SDK', code: SDK_SNIPPET },
              { label: 'curl', code: CURL_SNIPPET },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

// ── Small presentational helpers (console glass theme) ────────────────────────
const inputCls = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-[#F8B032]/50 focus:outline-none';
const primaryBtn = 'mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#F8B032]/90 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#F8B032] disabled:opacity-50';
const secondaryBtn = 'mt-2 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-white/10 disabled:opacity-50';
const actionBtn = 'flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';

function Panel({ icon: Icon, title, children }: { icon: ComponentType<{ className?: string }>; title: string; children: ReactNode }) {
  return (
    <section className="glass rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        <Icon className="h-4 w-4 text-[#F8B032]" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-2 block">
      <span className="mb-1 block text-[11px] text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 truncate text-2xl font-bold ${accent ? 'text-[#F8B032]' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function Summary({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">{k}</dt>
          <dd className="truncate font-mono text-gray-300" title={v}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const SDK_SNIPPET = `import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({ apiKey: process.env.AHOY_API_KEY!, baseUrl: 'http://localhost:3001' });

const program = await client.loyalty.programs.create({
  name: 'Cafe Rewards', currency: 'POINTS',
  earnRules: [{ action: 'purchase_reward', points: 100 }],
});
const account = await client.loyalty.accounts.create({ programId: program.id, investorId: 'customer_123' });

await client.loyalty.points.earn(account.id, { action: 'purchase_reward' });
const balance = await client.loyalty.points.balance(account.id);

// Idempotency key is REQUIRED on spend ops (RightAction; safe to retry).
const { receipt, balanceAfter, redeemedValue } = await client.loyalty.points.redeem(
  account.id, { amount: 50, action: 'free_coffee', redemptionRate: 100 }, 'redeem-001',
);
console.log(receipt.kind, receipt.status, balanceAfter, redeemedValue);`;

const CURL_SNIPPET = `# Redeem (Idempotency-Key REQUIRED on mutations)
curl -X POST http://localhost:3001/api/v1/loyalty/accounts/<id>/redeem \\
  -H "Authorization: Bearer $AHOY_API_KEY" \\
  -H "Idempotency-Key: redeem-001" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":50,"action":"free_coffee","redemptionRate":100}'`;

export default LoyaltyConsole;
