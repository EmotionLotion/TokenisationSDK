import { useState, useCallback } from 'react';
import { Tag, DollarSign, ArrowLeftRight, ShieldCheck, Clock, CalendarCheck } from 'lucide-react';
import { useSecondaryMarket, useExitWindow } from '@tokenisation/sdk-react';
import { useSDKWithFallback, useSDKMutationWithFallback } from '../hooks/useSDKWithFallback';

interface SecondaryMarketProps {
  propertyId: string;
  propertyName: string;
}

interface Listing {
  id: string;
  seller: string;
  sellerAddress: string;
  tokens: number;
  askPriceAED: number;
  royaltyPercent: number;
  listedDate: string;
  verified: boolean;
}

const MOCK_LISTINGS: Record<string, Listing[]> = {
  default: [
    {
      id: 'lst-001',
      seller: 'Al Maktoum Capital',
      sellerAddress: '0x1a2b...8f9e',
      tokens: 25000,
      askPriceAED: 39.75,
      royaltyPercent: 1.5,
      listedDate: '2024-02-10',
      verified: true,
    },
    {
      id: 'lst-002',
      seller: 'Gulf Investment Fund',
      sellerAddress: '0x3c4d...2a1b',
      tokens: 50000,
      askPriceAED: 40.20,
      royaltyPercent: 1.5,
      listedDate: '2024-02-08',
      verified: true,
    },
    {
      id: 'lst-003',
      seller: 'Private Investor',
      sellerAddress: '0x5e6f...4c3d',
      tokens: 10000,
      askPriceAED: 38.90,
      royaltyPercent: 1.5,
      listedDate: '2024-02-12',
      verified: false,
    },
    {
      id: 'lst-004',
      seller: 'Emirates Wealth Partners',
      sellerAddress: '0x7a8b...6e5f',
      tokens: 75000,
      askPriceAED: 39.50,
      royaltyPercent: 1.5,
      listedDate: '2024-02-05',
      verified: true,
    },
    {
      id: 'lst-005',
      seller: 'Dubai RE Holdings',
      sellerAddress: '0x9c0d...8a7b',
      tokens: 15000,
      askPriceAED: 41.00,
      royaltyPercent: 1.5,
      listedDate: '2024-02-11',
      verified: true,
    },
  ],
};

function getDefaultListings(): Listing[] {
  return MOCK_LISTINGS['default'];
}

/** Abbreviate a wallet address for display */
function abbreviateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function SecondaryMarket({ propertyId, propertyName }: SecondaryMarketProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formTokens, setFormTokens] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [submittingListing, setSubmittingListing] = useState(false);

  const secondaryMarket = useSecondaryMarket(propertyId);
  const exitWindow = useExitWindow(propertyId);

  // --- Fetch listings via SDK with fallback ---
  const sdkCall = useCallback(async () => {
    if (!secondaryMarket.listings || secondaryMarket.listings.length === 0) return null;
    return secondaryMarket.listings.map((listing, index): Listing => ({
      id: listing.id ?? `lst-${index}`,
      seller: listing.sellerId ?? 'Unknown',
      sellerAddress: abbreviateAddress(listing.sellerWallet ?? '0x0000...0000'),
      tokens: listing.tokenAmount ?? 0,
      askPriceAED: listing.pricePerToken ?? 0,
      royaltyPercent: 1.5,
      listedDate: listing.createdAt ? listing.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
      verified: listing.status === 'active',
    }));
  }, [secondaryMarket.listings]);

  const { data: listings, refresh: refreshListings } = useSDKWithFallback<Listing[]>(
    sdkCall,
    getDefaultListings(),
    [sdkCall],
  );

  // --- Buy mutation ---
  const buyMutation = useSDKMutationWithFallback(
    useCallback(async (listingId: string) => {
      return await secondaryMarket.purchase(listingId, 'investor-wallet');
    }, [secondaryMarket]),
    useCallback(async (_listingId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { success: true, simulated: true };
    }, []),
  );

  // --- List-for-sale mutation ---
  const listForSaleMutation = useSDKMutationWithFallback(
    useCallback(async (params: { ticketId: string; tokens: number; askPriceAED: number }) => {
      return await secondaryMarket.createListing({
        tokenAmount: params.tokens,
        pricePerToken: params.askPriceAED,
        sellerWallet: 'seller-wallet',
      });
    }, [secondaryMarket]),
    useCallback(async (_params: { ticketId: string; tokens: number; askPriceAED: number }) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { success: true, simulated: true };
    }, []),
  );

  const handleBuy = async (listingId: string) => {
    setBuyingId(listingId);
    try {
      await buyMutation.execute(listingId);
      refreshListings();
    } catch {
      // Error is captured in buyMutation.error
    } finally {
      setBuyingId(null);
    }
  };

  const handleSubmitListing = async () => {
    const tokens = parseInt(formTokens, 10);
    const price = parseFloat(formPrice);
    if (!tokens || !price) return;

    setSubmittingListing(true);
    try {
      await listForSaleMutation.execute({
        ticketId: propertyId,
        tokens,
        askPriceAED: price,
      });
      setFormTokens('');
      setFormPrice('');
      setShowCreateForm(false);
      refreshListings();
    } catch {
      // Error is captured in listForSaleMutation.error
    } finally {
      setSubmittingListing(false);
    }
  };

  const totalListings = listings.length;
  const prices = listings.map((l) => l.askPriceAED);
  const floorPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const avgPrice = prices.length > 0 ? prices.reduce((sum, p) => sum + p, 0) / prices.length : 0;
  const totalVolume = listings.reduce((sum, l) => sum + l.tokens * l.askPriceAED, 0);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#F8B032]/10 flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-[#F8B032]" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Secondary Market</h3>
              <p className="text-gray-400 text-xs">{propertyName} &middot; P2P Token Resale</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-[#F8B032] text-black text-sm font-semibold rounded-lg hover:bg-[#F8B032]/90 transition-colors"
          >
            {showCreateForm ? 'Cancel' : 'Create Listing'}
          </button>
        </div>
      </div>

      {/* Market Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-white/10">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Tag className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-400 text-xs">Total Listings</span>
          </div>
          <p className="text-white text-xl font-bold">{totalListings}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-400 text-xs">Floor Price</span>
          </div>
          <p className="text-white text-xl font-bold">AED {floorPrice.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-400 text-xs">Avg Price</span>
          </div>
          <p className="text-white text-xl font-bold">AED {avgPrice.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <ArrowLeftRight className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-400 text-xs">Listed Volume</span>
          </div>
          <p className="text-white text-xl font-bold">AED {(totalVolume / 1000000).toFixed(1)}M</p>
        </div>
      </div>

      {/* Create Listing Form */}
      {showCreateForm && (
        <div className="p-6 border-b border-white/10 bg-white/[0.02]">
          <h4 className="text-white font-medium mb-4">Create New Listing</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">Tokens to Sell</label>
              <input
                type="number"
                value={formTokens}
                onChange={(e) => setFormTokens(e.target.value)}
                placeholder="e.g. 10000"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#F8B032]/50"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">Ask Price (AED per token)</label>
              <input
                type="number"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                placeholder="e.g. 39.50"
                step="0.01"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#F8B032]/50"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleSubmitListing}
                disabled={submittingListing || listForSaleMutation.loading}
                className="w-full px-4 py-2 bg-[#F8B032] text-black text-sm font-semibold rounded-lg hover:bg-[#F8B032]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingListing ? 'Submitting...' : 'Submit Listing'}
              </button>
            </div>
          </div>
          <p className="text-gray-500 text-xs mt-3">
            Royalty: 1.5% on secondary sales. Listings require KYC verification and token lock-up.
          </p>
        </div>
      )}

      {/* Active Listings */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-6 py-3 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Seller</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Tokens</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Ask Price</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Total Value</th>
              <th className="px-6 py-3 text-center text-gray-400 text-xs font-medium uppercase tracking-wider">Royalty</th>
              <th className="px-6 py-3 text-center text-gray-400 text-xs font-medium uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {listings.map((listing) => (
              <tr key={listing.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <p className="text-white text-sm font-medium">{listing.seller}</p>
                    <p className="text-gray-500 text-xs font-mono">{listing.sellerAddress}</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="text-white text-sm">{listing.tokens.toLocaleString()}</p>
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="text-white text-sm font-medium">AED {listing.askPriceAED.toFixed(2)}</p>
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="text-white text-sm">
                    AED {((listing.tokens * listing.askPriceAED) / 1000).toFixed(0)}K
                  </p>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="text-gray-400 text-sm">{listing.royaltyPercent}%</span>
                </td>
                <td className="px-6 py-4 text-center">
                  {listing.verified ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs">
                      <ShieldCheck className="w-3 h-3" />
                      Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 text-xs">
                      Pending
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleBuy(listing.id)}
                    disabled={buyingId === listing.id || buyMutation.loading}
                    className="px-3 py-1.5 bg-[#F8B032]/10 border border-[#F8B032]/20 text-[#F8B032] text-xs font-semibold rounded-lg hover:bg-[#F8B032]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {buyingId === listing.id ? 'Buying...' : 'Buy'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Exit Windows */}
      <div className="px-6 py-5 border-t border-white/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm">Exit Windows</h4>
            <p className="text-gray-500 text-xs">Scheduled redemption periods for token holders</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white/[0.02] border border-white/5 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-400 text-xs">Current Window</span>
            </div>
            <p className="text-white text-sm font-medium">
              {exitWindow.currentWindow ? 'Open' : 'Closed'}
            </p>
            {exitWindow.currentWindow && (
              <p className="text-gray-500 text-xs mt-0.5">
                Closes: {new Date(exitWindow.currentWindow.closesAt).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="bg-white/[0.02] border border-white/5 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-400 text-xs">Next Window</span>
            </div>
            <p className="text-white text-sm font-medium">
              {exitWindow.nextWindow
                ? new Date(exitWindow.nextWindow.opensAt).toLocaleDateString()
                : 'Q2 2026'}
            </p>
          </div>
          <div className="bg-white/[0.02] border border-white/5 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-400 text-xs">Frequency</span>
            </div>
            <p className="text-white text-sm font-medium">
              {exitWindow.schedule?.frequency ?? 'Quarterly'}
            </p>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02]">
        <p className="text-gray-500 text-xs text-center">
          All trades are settled on-chain with ERC-3643 compliance checks. Buyer must pass KYC/AML verification.
        </p>
      </div>
    </div>
  );
}
