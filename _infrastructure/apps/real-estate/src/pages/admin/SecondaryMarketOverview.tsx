import { BarChart3, XCircle, TrendingUp, ArrowUpDown } from 'lucide-react';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Listing {
  id: string;
  assetId: string;
  sellerId: string;
  sellerWallet: string;
  tokenAmount: number;
  pricePerToken: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface Transaction {
  id: string;
  listingId: string;
  buyerWallet: string;
  sellerWallet: string;
  tokenAmount: number;
  totalPrice: number;
  platformFee: number;
  currency: string;
  status: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_LISTINGS: Listing[] = [
  {
    id: 'lst-001',
    assetId: 'marina-gate-tower',
    sellerId: 'inv-101',
    sellerWallet: '0xA1b2...c3d4',
    tokenAmount: 500,
    pricePerToken: 1050,
    currency: 'AED',
    status: 'active',
    createdAt: '2026-02-10T08:30:00Z',
  },
  {
    id: 'lst-002',
    assetId: 'downtown-residences',
    sellerId: 'inv-204',
    sellerWallet: '0xE5f6...g7h8',
    tokenAmount: 200,
    pricePerToken: 980,
    currency: 'AED',
    status: 'active',
    createdAt: '2026-02-12T14:00:00Z',
  },
  {
    id: 'lst-003',
    assetId: 'marina-gate-tower',
    sellerId: 'inv-305',
    sellerWallet: '0xI9j0...k1l2',
    tokenAmount: 1000,
    pricePerToken: 1100,
    currency: 'AED',
    status: 'sold',
    createdAt: '2026-02-05T10:00:00Z',
  },
  {
    id: 'lst-004',
    assetId: 'palm-jumeirah-villa',
    sellerId: 'inv-102',
    sellerWallet: '0xM3n4...o5p6',
    tokenAmount: 150,
    pricePerToken: 2500,
    currency: 'AED',
    status: 'active',
    createdAt: '2026-02-15T09:15:00Z',
  },
];

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'txn-001',
    listingId: 'lst-003',
    buyerWallet: '0xQ7r8...s9t0',
    sellerWallet: '0xI9j0...k1l2',
    tokenAmount: 1000,
    totalPrice: 1100000,
    platformFee: 16500,
    currency: 'AED',
    status: 'completed',
    createdAt: '2026-02-08T11:30:00Z',
  },
  {
    id: 'txn-002',
    listingId: 'lst-prev-001',
    buyerWallet: '0xU1v2...w3x4',
    sellerWallet: '0xY5z6...a7b8',
    tokenAmount: 300,
    totalPrice: 315000,
    platformFee: 4725,
    currency: 'AED',
    status: 'completed',
    createdAt: '2026-02-01T16:00:00Z',
  },
];

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-gray-400 font-medium">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
          <Icon className="w-4 h-4 text-gray-400" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function SecondaryMarketOverview() {
  const { data: listings, isLive } = useSDKWithFallback<Listing[]>(
    async () => null,
    MOCK_LISTINGS,
  );

  const { data: transactions } = useSDKWithFallback<Transaction[]>(
    async () => null,
    MOCK_TRANSACTIONS,
  );

  const activeListings = listings.filter((l) => l.status === 'active');
  const totalVolume = transactions.reduce((sum, t) => sum + t.totalPrice, 0);
  const totalFees = transactions.reduce((sum, t) => sum + t.platformFee, 0);
  const avgPrice = activeListings.length > 0
    ? activeListings.reduce((sum, l) => sum + l.pricePerToken, 0) / activeListings.length
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Secondary Market</h1>
            {isLive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
                </span>
                LIVE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/10 border border-gray-500/20 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                DEMO
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">P2P token trading overview and management</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={ArrowUpDown}
          label="Active Listings"
          value={String(activeListings.length)}
          sub={`${listings.length} total`}
        />
        <StatCard
          icon={TrendingUp}
          label="Total Volume"
          value={`${(totalVolume / 1000).toFixed(0)}K AED`}
          sub={`${transactions.length} transactions`}
        />
        <StatCard
          icon={BarChart3}
          label="Avg Token Price"
          value={`${avgPrice.toFixed(0)} AED`}
          sub="Across active listings"
        />
        <StatCard
          icon={BarChart3}
          label="Platform Fees"
          value={`${totalFees.toLocaleString()} AED`}
          sub="1.5% per transaction"
        />
      </div>

      {/* Active Listings */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-white">Active Listings</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Listing ID</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Asset</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Seller</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Tokens</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Price/Token</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Status</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {listings.map((l) => (
                <tr key={l.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-white font-mono text-xs">{l.id}</td>
                  <td className="px-6 py-4 text-white">{l.assetId}</td>
                  <td className="px-6 py-4 text-gray-400 font-mono text-xs">{l.sellerWallet}</td>
                  <td className="px-6 py-4 text-right text-white font-mono">{l.tokenAmount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-white font-mono">{l.pricePerToken.toLocaleString()} {l.currency}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      l.status === 'active'
                        ? 'text-green-400 bg-green-500/10 border-green-500/20'
                        : l.status === 'sold'
                          ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                          : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
                    }`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {l.status === 'active' && (
                      <button className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors">
                        <XCircle className="w-3 h-3" />
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction History */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Transaction History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Transaction</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Buyer</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Tokens</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Total Price</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Fee</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-white font-mono text-xs">{t.id}</td>
                  <td className="px-6 py-4 text-gray-400 font-mono text-xs">{t.buyerWallet}</td>
                  <td className="px-6 py-4 text-right text-white font-mono">{t.tokenAmount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-white font-mono">{t.totalPrice.toLocaleString()} {t.currency}</td>
                  <td className="px-6 py-4 text-right text-primary font-mono">{t.platformFee.toLocaleString()}</td>
                  <td className="px-6 py-4 text-gray-400">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
