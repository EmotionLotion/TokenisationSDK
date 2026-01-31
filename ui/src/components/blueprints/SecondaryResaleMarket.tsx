/**
 * SecondaryResaleMarket — Blueprint component for listing tokenized
 * tickets/assets on a secondary resale market with automatic royalty calculation.
 *
 * Features:
 *  - Market overview stats (total listings, floor price, avg price, volume)
 *  - Active listings grid with royalty breakdown and Buy button
 *  - Create listing form with real-time royalty/fee calculator
 *  - Purchase flow with compliance check and confirmation modal
 *  - CRE-enforced royalty settlement flow animation
 *  - My Listings tab with cancel option
 *  - All actions logged via sdkStore.logSdkCall()
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Tag,
  Percent,
  ArrowLeftRight,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { sdkStore } from '../../store';
import { RoyaltySplitVisualizer } from '../shared/RoyaltySplitVisualizer';
import { useSDKStore } from '../../core/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResaleListing {
  id: string;
  assetId: string;
  sellerId: string;
  sellerName: string;
  askPrice: number;
  originalPrice: number;
  royaltyPercent: number;
  royaltyAmount: number;
  netToSeller: number;
  platformFee: number;
  status: 'listed' | 'pending' | 'sold' | 'cancelled' | 'expired';
  listedAt: string;
  expiresAt?: string;
}

interface SecondaryResaleMarketProps {
  assetId: string;
  assetName: string;
  royaltyPercent?: number;
  platformFeePercent?: number;
  currency?: string;
  onPurchase?: (listing: ResaleListing) => void;
  onList?: (listing: ResaleListing) => void;
}

// ---------------------------------------------------------------------------
// Constants — CRE Royalty Config
// ---------------------------------------------------------------------------

const ARTIST_BPS = 500;   // 5%
const PROMOTER_BPS = 300;  // 3%

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENT_USER_ID = 'demo-user-1';
const CURRENT_USER_NAME = 'You';

function generateId(): string {
  return `RSL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function buildListing(
  assetId: string,
  sellerId: string,
  sellerName: string,
  askPrice: number,
  originalPrice: number,
  royaltyPct: number,
  platformFeePct: number,
  overrides?: Partial<ResaleListing>,
): ResaleListing {
  const royaltyAmount = +(askPrice * (royaltyPct / 100)).toFixed(2);
  const platformFee = +(askPrice * (platformFeePct / 100)).toFixed(2);
  const netToSeller = +(askPrice - royaltyAmount - platformFee).toFixed(2);
  return {
    id: generateId(),
    assetId,
    sellerId,
    sellerName,
    askPrice,
    originalPrice,
    royaltyPercent: royaltyPct,
    royaltyAmount,
    netToSeller,
    platformFee,
    status: 'listed',
    listedAt: new Date().toISOString(),
    ...overrides,
  };
}

function generateMockListings(
  assetId: string,
  royaltyPct: number,
  platformFeePct: number,
): ResaleListing[] {
  const sellers = [
    { id: 'seller-1', name: 'Alice W.' },
    { id: 'seller-2', name: 'Bob M.' },
    { id: 'seller-3', name: 'Charlie K.' },
    { id: 'seller-4', name: 'Diana R.' },
  ];
  const originalPrice = 150;
  const prices = [175, 200, 165, 220];

  return sellers.map((s, i) =>
    buildListing(assetId, s.id, s.name, prices[i], originalPrice, royaltyPct, platformFeePct, {
      listedAt: new Date(Date.now() - (i + 1) * 3600000 * (i + 1)).toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    }),
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type Tab = 'market' | 'create' | 'my';

function StatusBadge({ status }: { status: ResaleListing['status'] }) {
  const map: Record<ResaleListing['status'], { label: string; cls: string }> = {
    listed: { label: 'Listed', cls: 'bg-blue-500/20 text-blue-400' },
    pending: { label: 'Pending', cls: 'bg-yellow-500/20 text-yellow-400' },
    sold: { label: 'Sold', cls: 'bg-green-500/20 text-green-400' },
    cancelled: { label: 'Cancelled', cls: 'bg-gray-500/20 text-gray-400' },
    expired: { label: 'Expired', cls: 'bg-red-500/20 text-red-400' },
  };
  const { label, cls } = map[status];
  return <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Settlement Flow Steps
// ---------------------------------------------------------------------------

const SETTLEMENT_STEPS = [
  'Transfer event detected by CRE',
  'RoyaltyRegistry.getRoyaltyConfig() called',
  'DON consensus on split amounts',
  'Atomic settlement complete',
];

function SettlementFlowAnimation() {
  const [visibleSteps, setVisibleSteps] = useState(0);

  useEffect(() => {
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      setVisibleSteps(step);
      if (step >= SETTLEMENT_STEPS.length) clearInterval(interval);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 bg-[#F8B032]/5 border border-[#F8B032]/20 rounded-xl space-y-2">
      <p className="text-[11px] uppercase tracking-widest text-[#F8B032] font-medium mb-2">
        CRE Settlement Flow
      </p>
      {SETTLEMENT_STEPS.map((label, i) => (
        <div
          key={label}
          className={`flex items-center gap-2 p-2 rounded-lg text-xs transition-all duration-300 ${
            i < visibleSteps
              ? 'bg-green-500/10 border border-green-500/20'
              : 'bg-white/5 border border-white/5 opacity-40'
          }`}
        >
          {i < visibleSteps ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
          ) : (
            <div className="w-3.5 h-3.5 border border-gray-600 rounded-full shrink-0" />
          )}
          <span className={i < visibleSteps ? 'text-green-300' : 'text-gray-500'}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SecondaryResaleMarket({
  assetId,
  assetName,
  royaltyPercent = 2.5,
  platformFeePercent = 1.0,
  currency = 'USD',
  onPurchase,
  onList,
}: SecondaryResaleMarketProps) {
  // ---- state ----
  const [listings, setListings] = useState<ResaleListing[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('market');
  const [newPrice, setNewPrice] = useState<string>('');
  const [listingSuccess, setListingSuccess] = useState(false);

  // purchase flow
  const [purchaseTarget, setPurchaseTarget] = useState<ResaleListing | null>(null);
  const [complianceChecking, setComplianceChecking] = useState(false);
  const [compliancePassed, setCompliancePassed] = useState<boolean | null>(null);
  const [complianceChecks, setComplianceChecks] = useState<{ name: string; passed: boolean }[]>([]);
  const [purchaseComplete, setPurchaseComplete] = useState(false);

  // seed mock listings
  useEffect(() => {
    setListings(generateMockListings(assetId, royaltyPercent, platformFeePercent));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  // ---- derived ----
  const activeListings = listings.filter(l => l.status === 'listed');
  const myListings = listings.filter(l => l.sellerId === CURRENT_USER_ID);
  const soldListings = listings.filter(l => l.status === 'sold');

  const floorPrice = activeListings.length > 0 ? Math.min(...activeListings.map(l => l.askPrice)) : 0;
  const avgPrice =
    activeListings.length > 0
      ? +(activeListings.reduce((s, l) => s + l.askPrice, 0) / activeListings.length).toFixed(2)
      : 0;
  const totalVolume = soldListings.reduce((s, l) => s + l.askPrice, 0);

  // ---- new listing price derived ----
  const parsedPrice = parseFloat(newPrice) || 0;
  const calcRoyalty = +(parsedPrice * (royaltyPercent / 100)).toFixed(2);
  const calcPlatformFee = +(parsedPrice * (platformFeePercent / 100)).toFixed(2);
  const calcNet = +(parsedPrice - calcRoyalty - calcPlatformFee).toFixed(2);

  // ---- handlers ----
  const handleCreateListing = useCallback(() => {
    if (parsedPrice <= 0) return;
    const listing = buildListing(
      assetId,
      CURRENT_USER_ID,
      CURRENT_USER_NAME,
      parsedPrice,
      150,
      royaltyPercent,
      platformFeePercent,
      { expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() },
    );
    setListings(prev => [listing, ...prev]);
    setNewPrice('');
    setListingSuccess(true);
    setTimeout(() => setListingSuccess(false), 3000);

    sdkStore.logSdkCall('resale.createListing', {
      assetId,
      askPrice: parsedPrice,
      royaltyPercent,
      platformFeePercent,
      netToSeller: listing.netToSeller,
    });

    onList?.(listing);
  }, [assetId, parsedPrice, royaltyPercent, platformFeePercent, onList]);

  const handleCancelListing = useCallback((listingId: string) => {
    setListings(prev =>
      prev.map(l => (l.id === listingId ? { ...l, status: 'cancelled' as const } : l)),
    );
    sdkStore.logSdkCall('resale.cancelListing', { listingId });
  }, []);

  const openPurchaseFlow = useCallback((listing: ResaleListing) => {
    setPurchaseTarget(listing);
    setCompliancePassed(null);
    setComplianceChecks([]);
    setPurchaseComplete(false);
    setComplianceChecking(false);
  }, []);

  const closePurchaseFlow = useCallback(() => {
    setPurchaseTarget(null);
    setCompliancePassed(null);
    setComplianceChecks([]);
    setPurchaseComplete(false);
  }, []);

  const runComplianceCheck = useCallback(() => {
    setComplianceChecking(true);
    setTimeout(() => {
      const checks = [
        { name: 'KYC / Identity Verified', passed: true },
        { name: 'AML Screening Clear', passed: true },
        { name: 'Jurisdiction Allowed', passed: true },
        { name: 'Holding Period Satisfied', passed: true },
        { name: 'Sanctions Check', passed: true },
      ];
      setComplianceChecks(checks);
      setCompliancePassed(checks.every(c => c.passed));
      setComplianceChecking(false);
    }, 1200);
  }, []);

  const confirmPurchase = useCallback(() => {
    if (!purchaseTarget) return;

    // Trigger CRE royalty settlement via store
    const zustand = useSDKStore.getState();
    zustand.simulateRoyaltySettlement(
      purchaseTarget.assetId,
      purchaseTarget.sellerId,
      'buyer-' + Date.now(),
      purchaseTarget.askPrice,
    );

    setListings(prev =>
      prev.map(l => (l.id === purchaseTarget.id ? { ...l, status: 'sold' as const } : l)),
    );
    setPurchaseComplete(true);

    sdkStore.logSdkCall('resale.purchase', {
      listingId: purchaseTarget.id,
      assetId: purchaseTarget.assetId,
      askPrice: purchaseTarget.askPrice,
      royaltyAmount: purchaseTarget.royaltyAmount,
      platformFee: purchaseTarget.platformFee,
      netToSeller: purchaseTarget.netToSeller,
    });

    onPurchase?.(purchaseTarget);
  }, [purchaseTarget, onPurchase]);

  // ---- render helpers ----
  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === t
        ? 'bg-white/10 text-white'
        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
    }`;

  // ============================= JSX =============================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-blue-400" />
            Secondary Resale Market
            <span className="px-2 py-1 bg-[#F8B032]/10 text-[#F8B032] rounded text-[10px] font-medium border border-[#F8B032]/20">CRE Enforced</span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {assetName} &mdash; {royaltyPercent}% royalty &middot; {platformFeePercent}% platform fee
          </p>
        </div>
      </div>

      {/* Market Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Listings', value: String(activeListings.length), icon: Tag, color: 'text-blue-400' },
          { label: 'Floor Price', value: formatCurrency(floorPrice, currency), icon: DollarSign, color: 'text-green-400' },
          { label: 'Avg Price', value: formatCurrency(avgPrice, currency), icon: Percent, color: 'text-yellow-400' },
          { label: 'Volume (Sold)', value: formatCurrency(totalVolume, currency), icon: ArrowLeftRight, color: 'text-purple-400' },
        ].map(stat => (
          <div
            key={stat.label}
            className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-1"
          >
            <div className="flex items-center gap-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-[11px] uppercase tracking-widest text-gray-500 font-medium">
                {stat.label}
              </span>
            </div>
            <p className="text-lg font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Royalty Configuration Panel */}
      <div className="p-4 bg-white/5 rounded-xl border border-[#F8B032]/20 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#F8B032]" />
          <span className="text-[11px] uppercase tracking-widest text-[#F8B032] font-medium">
            Royalty Configuration
          </span>
          <span className="px-2 py-0.5 bg-[#F8B032]/10 text-[#F8B032] rounded text-[9px] font-medium border border-[#F8B032]/20 ml-auto">
            ON-CHAIN ENFORCED
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Artist Royalty</p>
            <p className="text-lg font-bold text-purple-400">
              {ARTIST_BPS} <span className="text-xs font-normal text-gray-500">BPS</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{(ARTIST_BPS / 100).toFixed(1)}% of sale price</p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Promoter Royalty</p>
            <p className="text-lg font-bold text-blue-400">
              {PROMOTER_BPS} <span className="text-xs font-normal text-gray-500">BPS</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{(PROMOTER_BPS / 100).toFixed(1)}% of sale price</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button className={tabClass('market')} onClick={() => setActiveTab('market')}>
          Marketplace
        </button>
        <button className={tabClass('create')} onClick={() => setActiveTab('create')}>
          Create Listing
        </button>
        <button className={tabClass('my')} onClick={() => setActiveTab('my')}>
          My Listings{myListings.length > 0 ? ` (${myListings.length})` : ''}
        </button>
      </div>

      {/* ===================== TAB: MARKET ===================== */}
      {activeTab === 'market' && (
        <div className="space-y-3">
          {activeListings.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No active listings right now.</p>
          )}
          {activeListings.map(listing => (
            <div
              key={listing.id}
              className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Seller info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white">{listing.sellerName}</span>
                    <StatusBadge status={listing.status} />
                  </div>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Listed {timeAgo(listing.listedAt)}
                  </p>
                </div>

                {/* Price breakdown */}
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
                  <span>
                    <span className="text-gray-500">Ask:</span>{' '}
                    <span className="text-white font-bold">{formatCurrency(listing.askPrice, currency)}</span>
                  </span>
                  <span>
                    <span className="text-gray-500">Royalty:</span>{' '}
                    <span className="text-yellow-400">{formatCurrency(listing.royaltyAmount, currency)}</span>
                  </span>
                  <span>
                    <span className="text-gray-500">Fee:</span>{' '}
                    <span className="text-gray-300">{formatCurrency(listing.platformFee, currency)}</span>
                  </span>
                  <span>
                    <span className="text-gray-500">Net:</span>{' '}
                    <span className="text-green-400">{formatCurrency(listing.netToSeller, currency)}</span>
                  </span>
                </div>

                {/* Buy */}
                <button
                  onClick={() => openPurchaseFlow(listing)}
                  className="shrink-0 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Buy
                </button>
              </div>

              {/* Royalty Split Visualizer */}
              <RoyaltySplitVisualizer
                salePrice={listing.askPrice}
                artistBps={ARTIST_BPS}
                promoterBps={PROMOTER_BPS}
              />
            </div>
          ))}
        </div>
      )}

      {/* ===================== TAB: CREATE LISTING ===================== */}
      {activeTab === 'create' && (
        <div className="max-w-md space-y-5">
          {/* Price input */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Ask Price ({currency})</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
              />
            </div>
          </div>

          {/* Real-time breakdown */}
          {parsedPrice > 0 && (
            <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
              <p className="text-xs uppercase tracking-widest text-gray-500 font-medium">Fee Breakdown</p>

              <div className="space-y-2">
                {[
                  { label: 'Ask Price', value: formatCurrency(parsedPrice, currency), color: 'text-white' },
                  {
                    label: `Royalty to Issuer (${royaltyPercent}%)`,
                    value: `- ${formatCurrency(calcRoyalty, currency)}`,
                    color: 'text-yellow-400',
                  },
                  {
                    label: `Platform Fee (${platformFeePercent}%)`,
                    value: `- ${formatCurrency(calcPlatformFee, currency)}`,
                    color: 'text-gray-400',
                  },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{row.label}</span>
                    <span className={`font-medium ${row.color}`}>{row.value}</span>
                  </div>
                ))}
                <div className="border-t border-white/10 pt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-300 font-medium">Net to You</span>
                  <span className="text-green-400 font-bold text-base">
                    {formatCurrency(calcNet, currency)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Success message */}
          {listingSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 font-medium">
              <CheckCircle className="w-4 h-4" />
              Listing created successfully!
            </div>
          )}

          {/* Submit */}
          <button
            disabled={parsedPrice <= 0}
            onClick={handleCreateListing}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Tag className="w-4 h-4" />
            List for Resale
          </button>
        </div>
      )}

      {/* ===================== TAB: MY LISTINGS ===================== */}
      {activeTab === 'my' && (
        <div className="space-y-3">
          {myListings.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">
              You have no listings yet. Create one from the &quot;Create Listing&quot; tab.
            </p>
          )}
          {myListings.map(listing => (
            <div
              key={listing.id}
              className="p-4 bg-white/5 rounded-xl border border-white/10 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    {formatCurrency(listing.askPrice, currency)}
                  </span>
                  <StatusBadge status={listing.status} />
                </div>
                <p className="text-xs text-gray-500">
                  Net: {formatCurrency(listing.netToSeller, currency)} &middot; Royalty:{' '}
                  {formatCurrency(listing.royaltyAmount, currency)} &middot; Fee:{' '}
                  {formatCurrency(listing.platformFee, currency)}
                </p>
                <p className="text-xs text-gray-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Listed {timeAgo(listing.listedAt)}
                </p>
              </div>

              {listing.status === 'listed' && (
                <button
                  onClick={() => handleCancelListing(listing.id)}
                  className="shrink-0 px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===================== PURCHASE CONFIRMATION MODAL ===================== */}
      {purchaseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#111827] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Confirm Purchase</h3>
              <p className="text-sm text-gray-400 mt-0.5">{assetName}</p>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Price summary */}
              <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-2">
                {[
                  { label: 'Ask Price', value: formatCurrency(purchaseTarget.askPrice, currency), color: 'text-white' },
                  { label: 'Seller', value: purchaseTarget.sellerName, color: 'text-gray-300' },
                  {
                    label: `Royalty (${purchaseTarget.royaltyPercent}%)`,
                    value: formatCurrency(purchaseTarget.royaltyAmount, currency),
                    color: 'text-yellow-400',
                  },
                  {
                    label: `Platform Fee`,
                    value: formatCurrency(purchaseTarget.platformFee, currency),
                    color: 'text-gray-400',
                  },
                ].map(r => (
                  <div key={r.label} className="flex justify-between text-sm">
                    <span className="text-gray-400">{r.label}</span>
                    <span className={`font-medium ${r.color}`}>{r.value}</span>
                  </div>
                ))}
              </div>

              {/* Compliance check */}
              {compliancePassed === null && !complianceChecking && (
                <button
                  onClick={runComplianceCheck}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 hover:bg-white/10 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  Run Compliance Check
                </button>
              )}

              {complianceChecking && (
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Running compliance checks...
                </div>
              )}

              {complianceChecks.length > 0 && (
                <div className="space-y-1.5">
                  {complianceChecks.map(c => (
                    <div
                      key={c.name}
                      className="flex items-center gap-2 p-2 bg-white/5 rounded-lg text-xs"
                    >
                      {c.passed ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      )}
                      <span className={c.passed ? 'text-gray-300' : 'text-red-400'}>{c.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {compliancePassed === false && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Compliance check failed. Purchase blocked.
                </div>
              )}

              {/* Purchase complete */}
              {purchaseComplete && (
                <>
                  <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 font-medium">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    Purchase completed! Ownership transferred on-chain.
                  </div>

                  {/* Settlement Flow Animation */}
                  <SettlementFlowAnimation />
                </>
              )}
            </div>

            {/* Modal footer */}
            <div className="p-5 border-t border-white/10 flex gap-3">
              <button
                onClick={closePurchaseFlow}
                className="flex-1 py-2.5 border border-white/10 text-gray-300 hover:bg-white/5 text-sm rounded-lg transition-colors"
              >
                {purchaseComplete ? 'Close' : 'Cancel'}
              </button>
              {!purchaseComplete && (
                <button
                  disabled={!compliancePassed}
                  onClick={confirmPurchase}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <DollarSign className="w-4 h-4" />
                  Confirm Purchase
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
