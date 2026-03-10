import { useState, useCallback } from 'react';
import {
  CheckSquare,
  XCircle,
  Lock,
  Unlock,
  ArrowLeftRight,
} from 'lucide-react';
import { useTransfer, useCompliance, useAsset } from '@tokenisation/sdk-react';
import { useSDKWithFallback, useSDKMutationWithFallback } from '../../hooks/useSDKWithFallback';
import { DUBAI_PROPERTIES, formatAED } from '../../data/dubai-properties';

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

interface PendingTransfer {
  id: string;
  from: string;
  to: string;
  tokenSymbol: string;
  amount: number;
  amountAED: number;
  submittedDate: string;
  complianceStatus: 'passed' | 'pending-review' | 'flagged';
}

interface TransferHistoryItem {
  id: string;
  from: string;
  to: string;
  tokenSymbol: string;
  amount: number;
  date: string;
  result: 'approved' | 'rejected';
}

const MOCK_PENDING_TRANSFERS: PendingTransfer[] = [
  {
    id: 'txn-1',
    from: 'Al Habtoor Family Office',
    to: 'Kuwait Investment Authority',
    tokenSymbol: 'MGATE1',
    amount: 250000,
    amountAED: 9625000,
    submittedDate: '2024-02-14',
    complianceStatus: 'passed',
  },
  {
    id: 'txn-2',
    from: 'Mashreq Capital Markets',
    to: 'Bravo Capital Partners',
    tokenSymbol: 'DVIEW',
    amount: 180000,
    amountAED: 6240600,
    submittedDate: '2024-02-13',
    complianceStatus: 'pending-review',
  },
  {
    id: 'txn-3',
    from: 'ADIA Segregated Portfolio',
    to: 'Olayan Financing Company',
    tokenSymbol: 'PALMV',
    amount: 400000,
    amountAED: 14000000,
    submittedDate: '2024-02-12',
    complianceStatus: 'flagged',
  },
];

const MOCK_TRANSFER_HISTORY: TransferHistoryItem[] = [
  { id: 'hist-1', from: 'NBAD Custody Wallet', to: 'Al Habtoor Family Office', tokenSymbol: 'MGATE1', amount: 500000, date: '2024-02-10', result: 'approved' },
  { id: 'hist-2', from: 'Kuwait Investment Authority', to: 'Mashreq Capital Markets', tokenSymbol: 'DVIEW', amount: 300000, date: '2024-02-08', result: 'approved' },
  { id: 'hist-3', from: 'Unknown Wallet', to: 'ADIA Segregated Portfolio', tokenSymbol: 'PALMV', amount: 100000, date: '2024-02-05', result: 'rejected' },
  { id: 'hist-4', from: 'Mashreq Capital Markets', to: 'NBAD Custody Wallet', tokenSymbol: 'BBTOW', amount: 200000, date: '2024-01-30', result: 'approved' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function ComplianceBadge({ status }: { status: PendingTransfer['complianceStatus'] }) {
  const styles: Record<PendingTransfer['complianceStatus'], string> = {
    passed: 'bg-green-500/10 text-green-400 border-green-500/20',
    'pending-review': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    flagged: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const labels: Record<PendingTransfer['complianceStatus'], string> = {
    passed: 'Passed',
    'pending-review': 'Pending Review',
    flagged: 'Flagged',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function ResultBadge({ result }: { result: TransferHistoryItem['result'] }) {
  const styles: Record<TransferHistoryItem['result'], string> = {
    approved: 'bg-green-500/10 text-green-400 border-green-500/20',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${styles[result]}`}>
      {result}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Approvals                                                          */
/* ------------------------------------------------------------------ */

export function Approvals() {
  // SDK hooks
  const transfer = useTransfer();
  const compliance = useCompliance();
  const asset = useAsset();

  // Fetch pending transfers from SDK, fall back to mock
  const { data: pendingTransfers, refresh: refreshPending } = useSDKWithFallback<PendingTransfer[]>(
    async () => {
      const transfers = await transfer.list({ status: 'pending' });
      return transfers.map((t) => ({
        id: t.id,
        from: (t as any).fromLabel || t.fromWallet,
        to: (t as any).toLabel || t.toWallet,
        tokenSymbol: (t as any).tokenSymbol || t.tokenId,
        amount: parseFloat(t.amount) || 0,
        amountAED: (t as any).amountAED || parseFloat(t.amount) || 0,
        submittedDate: t.createdAt?.slice(0, 10) || '',
        complianceStatus: ((t as any).complianceStatus || 'pending-review') as PendingTransfer['complianceStatus'],
      }));
    },
    MOCK_PENDING_TRANSFERS,
    [],
  );

  // Fetch transfer history from SDK, fall back to mock
  const { data: transferHistory, refresh: refreshHistory } = useSDKWithFallback<TransferHistoryItem[]>(
    async () => {
      const transfers = await transfer.list({ status: 'completed' });
      return transfers.map((t) => ({
        id: t.id,
        from: (t as any).fromLabel || t.fromWallet,
        to: (t as any).toLabel || t.toWallet,
        tokenSymbol: (t as any).tokenSymbol || t.tokenId,
        amount: parseFloat(t.amount) || 0,
        date: t.createdAt?.slice(0, 10) || '',
        result: (t.status === 'completed' ? 'approved' : 'rejected') as TransferHistoryItem['result'],
      }));
    },
    MOCK_TRANSFER_HISTORY,
    [],
  );

  // Hold states for regulatory freeze/unfreeze
  const [holdStates, setHoldStates] = useState<Record<string, boolean>>(
    () => Object.fromEntries(DUBAI_PROPERTIES.map((p) => [p.id, false])),
  );

  // Approve transfer mutation
  const approveTransferMutation = useSDKMutationWithFallback(
    useCallback(
      async (transferId: string) => {
        return await transfer.retry(transferId);
      },
      [transfer],
    ),
    useCallback(
      async (_transferId: string) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { id: _transferId, status: 'approved' } as any;
      },
      [],
    ),
  );

  // Reject transfer mutation
  const rejectTransferMutation = useSDKMutationWithFallback(
    useCallback(
      async (transferId: string) => {
        await transfer.cancel(transferId);
        return { id: transferId, status: 'rejected' };
      },
      [transfer],
    ),
    useCallback(
      async (_transferId: string) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { id: _transferId, status: 'rejected' } as any;
      },
      [],
    ),
  );

  // Freeze/Unfreeze asset mutation
  const freezeMutation = useSDKMutationWithFallback(
    useCallback(
      async (params: { id: string; freeze: boolean }) => {
        const toState = params.freeze ? 'FROZEN' : 'ACTIVE';
        return await asset.transitionAsset(params.id, toState as any);
      },
      [asset],
    ),
    useCallback(
      async (params: { id: string; freeze: boolean }) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { success: true, newState: params.freeze ? 'FROZEN' : 'ACTIVE' } as any;
      },
      [],
    ),
  );

  const handleApproveTransfer = async (transferId: string) => {
    await approveTransferMutation.execute(transferId);
    refreshPending();
    refreshHistory();
  };

  const handleRejectTransfer = async (transferId: string) => {
    await rejectTransferMutation.execute(transferId);
    refreshPending();
    refreshHistory();
  };

  const toggleHold = async (id: string) => {
    const currentlyFrozen = holdStates[id];
    await freezeMutation.execute({ id, freeze: !currentlyFrozen });
    setHoldStates((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <CheckSquare className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Transfer Approvals</h1>
          <p className="text-sm text-gray-400">Review transfers and manage regulatory holds</p>
        </div>
      </div>

      {/* Pending Transfer Approvals */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-white">Pending Transfer Approvals</h2>
          </div>
          <span className="inline-flex items-center rounded-full bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-0.5 text-[11px] font-medium text-yellow-400">
            {pendingTransfers.length} Pending
          </span>
        </div>

        <div className="divide-y divide-white/5">
          {pendingTransfers.map((txn) => (
            <div
              key={txn.id}
              className="px-6 py-5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Transfer parties */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white font-medium">{txn.from}</span>
                    <ArrowLeftRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                    <span className="text-white font-medium">{txn.to}</span>
                  </div>
                  {/* Details */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] text-gray-500 font-mono">{txn.tokenSymbol}</span>
                    <span className="text-[10px] text-gray-600">&middot;</span>
                    <span className="text-[11px] text-gray-400">
                      {txn.amount.toLocaleString()} tokens
                    </span>
                    <span className="text-[10px] text-gray-600">&middot;</span>
                    <span className="text-[11px] text-white font-mono">{formatAED(txn.amountAED)}</span>
                    <span className="text-[10px] text-gray-600">&middot;</span>
                    <span className="text-[10px] text-gray-500">{txn.submittedDate}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <ComplianceBadge status={txn.complianceStatus} />
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleApproveTransfer(txn.id)}
                      disabled={approveTransferMutation.loading}
                      className="p-1.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                      title="Approve"
                    >
                      <CheckSquare className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRejectTransfer(txn.id)}
                      disabled={rejectTransferMutation.loading}
                      className="p-1.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      title="Reject"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Regulatory Holds */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Regulatory Hold Actions</h2>
        </div>

        <div className="divide-y divide-white/5">
          {DUBAI_PROPERTIES.map((prop) => {
            const isFrozen = holdStates[prop.id];
            return (
              <div
                key={prop.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${isFrozen ? 'bg-red-400' : 'bg-green-400'}`}
                  />
                  <div>
                    <p className="text-sm text-white font-medium">{prop.name}</p>
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">{prop.tokenSymbol}</p>
                  </div>
                </div>

                <button
                  onClick={() => toggleHold(prop.id)}
                  disabled={freezeMutation.loading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border disabled:opacity-50 ${
                    isFrozen
                      ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                      : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {isFrozen ? (
                    <>
                      <Unlock className="w-3 h-3" /> Unfreeze
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" /> Freeze
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transfer History */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Transfer History</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">From</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">To</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Token</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Amount</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Date</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {transferHistory.map((h) => (
                <tr key={h.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-white">{h.from}</td>
                  <td className="px-6 py-4 text-white">{h.to}</td>
                  <td className="px-6 py-4 text-gray-400 font-mono text-xs">{h.tokenSymbol}</td>
                  <td className="px-6 py-4 text-right text-white font-mono">{h.amount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-gray-400 font-mono text-xs">{h.date}</td>
                  <td className="px-6 py-4"><ResultBadge result={h.result} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
