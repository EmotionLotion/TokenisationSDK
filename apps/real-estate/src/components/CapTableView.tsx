import { useCallback } from 'react';
import { Users, PieChart } from 'lucide-react';
import { useCapTable } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../hooks/useSDKWithFallback';

interface CapTableViewProps {
  propertyId: string;
  propertyName: string;
  totalTokens: number;
  tokenId?: string;
}

interface TokenHolder {
  id: string;
  name: string;
  walletAddress: string;
  tokensHeld: number;
  jurisdiction: string;
  kycStatus: 'verified' | 'pending' | 'expired';
  investorType: 'institutional' | 'accredited' | 'retail';
}

function generateHolders(totalTokens: number): TokenHolder[] {
  const distributionPercents = [32, 22, 15, 12, 8, 6, 5];
  const holders: TokenHolder[] = [
    {
      id: 'holder-001',
      name: 'AHOY Capital PJSC',
      walletAddress: '0x1a2b...9f8e',
      tokensHeld: Math.round(totalTokens * distributionPercents[0] / 100),
      jurisdiction: 'UAE - DIFC',
      kycStatus: 'verified',
      investorType: 'institutional',
    },
    {
      id: 'holder-002',
      name: 'Emirates NBD Custody (Escrow)',
      walletAddress: '0x3c4d...7b6a',
      tokensHeld: Math.round(totalTokens * distributionPercents[1] / 100),
      jurisdiction: 'UAE',
      kycStatus: 'verified',
      investorType: 'institutional',
    },
    {
      id: 'holder-003',
      name: 'Gulf Sovereign Wealth Fund',
      walletAddress: '0x5e6f...5d4c',
      tokensHeld: Math.round(totalTokens * distributionPercents[2] / 100),
      jurisdiction: 'Kuwait',
      kycStatus: 'verified',
      investorType: 'institutional',
    },
    {
      id: 'holder-004',
      name: 'Al Rashid Family Office',
      walletAddress: '0x7a8b...3b2a',
      tokensHeld: Math.round(totalTokens * distributionPercents[3] / 100),
      jurisdiction: 'UAE',
      kycStatus: 'verified',
      investorType: 'accredited',
    },
    {
      id: 'holder-005',
      name: 'Singapore RE Token Fund',
      walletAddress: '0x9c0d...1f0e',
      tokensHeld: Math.round(totalTokens * distributionPercents[4] / 100),
      jurisdiction: 'Singapore',
      kycStatus: 'verified',
      investorType: 'institutional',
    },
    {
      id: 'holder-006',
      name: 'Swiss Digital Assets AG',
      walletAddress: '0xb2e3...9d8c',
      tokensHeld: Math.round(totalTokens * distributionPercents[5] / 100),
      jurisdiction: 'Switzerland',
      kycStatus: 'pending',
      investorType: 'accredited',
    },
    {
      id: 'holder-007',
      name: 'Retail Pool (Aggregated)',
      walletAddress: '0xd4f5...7b6a',
      tokensHeld: Math.round(totalTokens * distributionPercents[6] / 100),
      jurisdiction: 'Various',
      kycStatus: 'verified',
      investorType: 'retail',
    },
  ];

  return holders;
}

function getKycBadge(status: TokenHolder['kycStatus']) {
  switch (status) {
    case 'verified':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs">
          Verified
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 text-xs">
          Pending
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs">
          Expired
        </span>
      );
  }
}

function getInvestorTypeBadge(type: TokenHolder['investorType']) {
  switch (type) {
    case 'institutional':
      return <span className="text-purple-400 text-xs">Institutional</span>;
    case 'accredited':
      return <span className="text-blue-400 text-xs">Accredited</span>;
    case 'retail':
      return <span className="text-gray-400 text-xs">Retail</span>;
  }
}

/** Abbreviate a wallet address for display */
function abbreviateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Simple pie chart visual using conic-gradient
function PieChartVisual({ holders, totalTokens }: { holders: TokenHolder[]; totalTokens: number }) {
  const colors = [
    '#F8B032',
    '#3B82F6',
    '#8B5CF6',
    '#10B981',
    '#EC4899',
    '#6366F1',
    '#6B7280',
  ];

  let cumulativePercent = 0;
  const gradientParts = holders.map((holder, i) => {
    const percent = (holder.tokensHeld / totalTokens) * 100;
    const start = cumulativePercent;
    cumulativePercent += percent;
    return `${colors[i]} ${start}% ${cumulativePercent}%`;
  });

  const gradientStyle = {
    background: `conic-gradient(${gradientParts.join(', ')})`,
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className="w-24 h-24 rounded-full flex-shrink-0"
        style={gradientStyle}
      >
        <div className="w-full h-full rounded-full flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-[#0B0E14] flex items-center justify-center">
            <span className="text-white text-xs font-bold">{holders.length}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {holders.map((holder, i) => (
          <div key={holder.id} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i] }} />
            <span className="text-gray-400 text-[10px] truncate max-w-[140px]">{holder.name}</span>
            <span className="text-white text-[10px] font-medium">
              {((holder.tokensHeld / totalTokens) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CapTableView({ propertyId, propertyName, totalTokens, tokenId: tokenIdProp }: CapTableViewProps) {
  const resolvedTokenId = tokenIdProp ?? `token-${propertyId}`;
  const capTable = useCapTable(resolvedTokenId);

  const sdkCall = useCallback(async () => {
    const { data } = capTable;
    if (!data || !data.holders || data.holders.length === 0) return null;
    return data.holders.map((holder, index): TokenHolder => ({
      id: holder.investorId ?? `holder-${index}`,
      name: holder.name ?? abbreviateAddress(holder.address),
      walletAddress: abbreviateAddress(holder.address),
      tokensHeld: typeof holder.balance === 'number' ? holder.balance : Number(holder.balance),
      jurisdiction: 'N/A',
      kycStatus: 'verified',
      investorType: 'institutional',
    }));
  }, [capTable]);

  const fallbackHolders = generateHolders(totalTokens);

  const { data: holders } = useSDKWithFallback<TokenHolder[]>(
    sdkCall,
    fallbackHolders,
    [sdkCall],
  );

  const totalHeld = holders.reduce((sum, h) => sum + h.tokensHeld, 0);
  const verifiedCount = holders.filter((h) => h.kycStatus === 'verified').length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#F8B032]/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-[#F8B032]" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Cap Table</h3>
              <p className="text-gray-400 text-xs">{propertyName} &middot; {holders.length} holders</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-gray-400" />
            <span className="text-gray-400 text-xs">{totalTokens.toLocaleString()} total tokens</span>
          </div>
        </div>
      </div>

      {/* Pie Chart */}
      <div className="px-6 py-4 border-b border-white/10 flex justify-center">
        <PieChartVisual holders={holders} totalTokens={totalTokens} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-6 py-3 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Holder</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Tokens</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Ownership</th>
              <th className="px-6 py-3 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Jurisdiction</th>
              <th className="px-6 py-3 text-center text-gray-400 text-xs font-medium uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-center text-gray-400 text-xs font-medium uppercase tracking-wider">KYC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {holders.map((holder) => (
              <tr key={holder.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-3">
                  <div>
                    <p className="text-white text-sm font-medium">{holder.name}</p>
                    <p className="text-gray-500 text-xs font-mono">{holder.walletAddress}</p>
                  </div>
                </td>
                <td className="px-6 py-3 text-right">
                  <p className="text-white text-sm">{holder.tokensHeld.toLocaleString()}</p>
                </td>
                <td className="px-6 py-3 text-right">
                  <p className="text-[#F8B032] text-sm font-medium">
                    {((holder.tokensHeld / totalTokens) * 100).toFixed(1)}%
                  </p>
                </td>
                <td className="px-6 py-3">
                  <p className="text-gray-300 text-sm">{holder.jurisdiction}</p>
                </td>
                <td className="px-6 py-3 text-center">
                  {getInvestorTypeBadge(holder.investorType)}
                </td>
                <td className="px-6 py-3 text-center">
                  {getKycBadge(holder.kycStatus)}
                </td>
              </tr>
            ))}
          </tbody>
          {/* Summary Row */}
          <tfoot>
            <tr className="border-t border-white/10 bg-white/[0.03]">
              <td className="px-6 py-3">
                <p className="text-gray-400 text-sm font-semibold">Total</p>
              </td>
              <td className="px-6 py-3 text-right">
                <p className="text-white text-sm font-bold">{totalHeld.toLocaleString()}</p>
              </td>
              <td className="px-6 py-3 text-right">
                <p className="text-[#F8B032] text-sm font-bold">
                  {((totalHeld / totalTokens) * 100).toFixed(1)}%
                </p>
              </td>
              <td className="px-6 py-3">
                <p className="text-gray-400 text-xs">{holders.length} jurisdictions</p>
              </td>
              <td className="px-6 py-3 text-center">
                <p className="text-gray-400 text-xs">{holders.length} holders</p>
              </td>
              <td className="px-6 py-3 text-center">
                <p className="text-green-400 text-xs">{verifiedCount}/{holders.length} verified</p>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
