import { useState, useCallback } from 'react';
import { FileText, Download, Calendar, DollarSign } from 'lucide-react';
import { formatAED } from '../../data/dubai-properties';
import { useCashFlow, useAuditLog } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';
import { ExportButton } from '@tokenisation/ui-kit';

const apiKey = import.meta.env.VITE_PUBLISHABLE_KEY || 'demo';

type TransactionType = 'dividend' | 'purchase' | 'transfer';
type TransactionStatus = 'completed' | 'pending' | 'processing';

interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  description: string;
  amountAED: number;
  status: TransactionStatus;
  reference: string;
}

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'txn-001',
    date: '2025-02-01',
    type: 'dividend',
    description: 'Q4 2024 Dividend - MGATE1',
    amountAED: 8775,
    status: 'completed',
    reference: 'DIV-2025-Q4-MGATE1',
  },
  {
    id: 'txn-002',
    date: '2025-02-01',
    type: 'dividend',
    description: 'Q4 2024 Dividend - DVIEW',
    amountAED: 15625,
    status: 'completed',
    reference: 'DIV-2025-Q4-DVIEW',
  },
  {
    id: 'txn-003',
    date: '2025-02-01',
    type: 'dividend',
    description: 'Q4 2024 Dividend - PALMV',
    amountAED: 5440,
    status: 'completed',
    reference: 'DIV-2025-Q4-PALMV',
  },
  {
    id: 'txn-004',
    date: '2025-01-15',
    type: 'purchase',
    description: 'Token Purchase - 8,000 PALMV',
    amountAED: -264000,
    status: 'completed',
    reference: 'PUR-2025-0115-PALMV',
  },
  {
    id: 'txn-005',
    date: '2024-12-20',
    type: 'purchase',
    description: 'Token Purchase - 25,000 DVIEW',
    amountAED: -812500,
    status: 'completed',
    reference: 'PUR-2024-1220-DVIEW',
  },
  {
    id: 'txn-006',
    date: '2024-11-01',
    type: 'dividend',
    description: 'Q3 2024 Dividend - MGATE1',
    amountAED: 8250,
    status: 'completed',
    reference: 'DIV-2024-Q3-MGATE1',
  },
  {
    id: 'txn-007',
    date: '2024-11-01',
    type: 'dividend',
    description: 'Q3 2024 Dividend - DVIEW',
    amountAED: 14375,
    status: 'completed',
    reference: 'DIV-2024-Q3-DVIEW',
  },
  {
    id: 'txn-008',
    date: '2024-10-10',
    type: 'purchase',
    description: 'Token Purchase - 15,000 MGATE1',
    amountAED: -540000,
    status: 'completed',
    reference: 'PUR-2024-1010-MGATE1',
  },
  {
    id: 'txn-009',
    date: '2024-09-15',
    type: 'transfer',
    description: 'Transfer Out - 2,000 MGATE1 to 0x7a3f...b2c1',
    amountAED: -77000,
    status: 'completed',
    reference: 'TRF-2024-0915-MGATE1',
  },
  {
    id: 'txn-010',
    date: '2025-02-10',
    type: 'dividend',
    description: 'Q1 2025 Dividend - MGATE1 (estimated)',
    amountAED: 9100,
    status: 'pending',
    reference: 'DIV-2025-Q1-MGATE1',
  },
];

function getTypeStyles(type: TransactionType) {
  switch (type) {
    case 'dividend':
      return {
        bg: 'bg-accent/10',
        text: 'text-accent',
        label: 'Dividend',
      };
    case 'purchase':
      return {
        bg: 'bg-primary/10',
        text: 'text-primary',
        label: 'Purchase',
      };
    case 'transfer':
      return {
        bg: 'bg-secondary/10',
        text: 'text-secondary',
        label: 'Transfer',
      };
  }
}

function getStatusStyles(status: TransactionStatus) {
  switch (status) {
    case 'completed':
      return 'bg-accent/20 text-accent border-accent/30';
    case 'pending':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'processing':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  }
}

export function Statements() {
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');

  const cashFlow = useCashFlow();
  const _auditLog = useAuditLog();

  // Try to fetch real distributions from SDK, falling back to mock transactions
  const fetchTransactions = useCallback(async (): Promise<Transaction[] | null> => {
    const distributions = await cashFlow.listDistributions({ limit: 50 });
    if (!distributions || distributions.length === 0) return null;

    // Map SDK distribution data to our Transaction interface
    const transactions: Transaction[] = distributions.map((dist, index) => {
      const date = dist.scheduledAt || dist.executedAt || new Date().toISOString();
      const amount = parseFloat(dist.amount || '0');

      return {
        id: dist.id || `sdk-txn-${index}`,
        date: date.split('T')[0],
        type: (dist.type === 'purchase' ? 'purchase' : dist.type === 'transfer' ? 'transfer' : 'dividend') as TransactionType,
        description: `${dist.type || 'Distribution'} - ${dist.tokenId || 'Unknown'}`,
        amountAED: amount,
        status: (dist.status === 'pending' ? 'pending' : dist.status === 'processing' ? 'processing' : 'completed') as TransactionStatus,
        reference: dist.id || `REF-${index}`,
      };
    });

    return transactions.length > 0 ? transactions : null;
  }, [cashFlow]);

  const { data: transactions } = useSDKWithFallback<Transaction[]>(
    fetchTransactions,
    MOCK_TRANSACTIONS,
    [],
  );

  const filteredTransactions = typeFilter === 'all'
    ? transactions
    : transactions.filter((t) => t.type === typeFilter);

  // Tax summary calculations
  const taxYear = 2024;
  const yearTransactions = transactions.filter(
    (t) => t.date.startsWith(String(taxYear)) && t.status === 'completed'
  );
  const totalDividends = yearTransactions
    .filter((t) => t.type === 'dividend')
    .reduce((s, t) => s + t.amountAED, 0);
  const totalPurchases = yearTransactions
    .filter((t) => t.type === 'purchase')
    .reduce((s, t) => s + Math.abs(t.amountAED), 0);
  const totalTransfers = yearTransactions
    .filter((t) => t.type === 'transfer')
    .reduce((s, t) => s + Math.abs(t.amountAED), 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white font-display">
          Statements & History
        </h1>
        <p className="text-gray-400 mt-1">
          Transaction history, dividends, and tax documents
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main - Transaction History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            {(
              [
                { value: 'all', label: 'All' },
                { value: 'dividend', label: 'Dividends' },
                { value: 'purchase', label: 'Purchases' },
                { value: 'transfer', label: 'Transfers' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTypeFilter(opt.value)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  typeFilter === opt.value
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:border-white/20'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Transaction Table */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-5 py-3 text-left text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                      Date
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                      Type
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                      Description
                    </th>
                    <th className="px-5 py-3 text-right text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                      Amount
                    </th>
                    <th className="px-5 py-3 text-right text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredTransactions.map((txn) => {
                    const typeStyle = getTypeStyles(txn.type);
                    const isPositive = txn.amountAED > 0;

                    return (
                      <tr
                        key={txn.id}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-gray-600" />
                            <span className="text-sm text-gray-300 font-mono">
                              {txn.date}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${typeStyle.bg} ${typeStyle.text}`}
                          >
                            {typeStyle.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-sm text-white">{txn.description}</p>
                          <p className="text-xs text-gray-600 font-mono mt-0.5">
                            {txn.reference}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span
                            className={`text-sm font-semibold ${
                              isPositive ? 'text-accent' : 'text-white'
                            }`}
                          >
                            {isPositive ? '+' : '-'}
                            {formatAED(Math.abs(txn.amountAED))}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${getStatusStyles(txn.status)}`}
                          >
                            {txn.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredTransactions.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No transactions found</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Export Section */}
          <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                <Download className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-white">Export</h2>
            </div>

            <div className="space-y-3">
              <div className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 hover:bg-white/[0.07] transition-all text-left">
                <FileText className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Export CSV</p>
                  <p className="text-xs text-gray-500">Spreadsheet-compatible format</p>
                </div>
                <ExportButton
                  endpoint="/api/v1/statements/export"
                  format="csv"
                  filename="statements"
                  apiKey={apiKey}
                  label="Download"
                />
              </div>

              <div className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 hover:bg-white/[0.07] transition-all text-left">
                <FileText className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Export PDF</p>
                  <p className="text-xs text-gray-500">Printable statement format</p>
                </div>
                <ExportButton
                  endpoint="/api/v1/statements/export"
                  format="pdf"
                  filename="statements"
                  apiKey={apiKey}
                  label="Download"
                />
              </div>
            </div>
          </section>

          {/* Tax Summary */}
          <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-accent/10 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Tax Summary</h2>
                <p className="text-xs text-gray-500">Year {taxYear}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2.5 border-b border-white/5">
                <span className="text-sm text-gray-400">Total Dividends</span>
                <span className="text-sm font-semibold text-accent">
                  +{formatAED(totalDividends)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-white/5">
                <span className="text-sm text-gray-400">Total Purchases</span>
                <span className="text-sm font-semibold text-white">
                  {formatAED(totalPurchases)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-white/5">
                <span className="text-sm text-gray-400">Total Transfers</span>
                <span className="text-sm font-semibold text-white">
                  {formatAED(totalTransfers)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-400">Transactions</span>
                <span className="text-sm font-semibold text-white">
                  {yearTransactions.length}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 px-3 py-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg">
              <FileText className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-300 leading-relaxed">
                UAE residents benefit from 0% personal income tax. International investors
                should consult their local tax advisor for reporting obligations.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
