import { Coins, ExternalLink } from 'lucide-react';

interface InvestorAllocation {
  name: string;
  address: string;
  tokens: number;
  percentage: number;
}

interface MintAndDistributeProps {
  assetName: string;
  totalSupply: number;
  distributed: number;
  txHash?: string;
  investors: InvestorAllocation[];
}

export function MintAndDistribute({
  assetName,
  totalSupply,
  distributed,
  txHash,
  investors,
}: MintAndDistributeProps) {
  const pct = totalSupply > 0 ? Math.round((distributed / totalSupply) * 100) : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
      <h3 className="text-lg font-semibold text-white mb-1">Mint &amp; Distribute</h3>
      <p className="text-sm text-gray-500 mb-4">{assetName}</p>

      {/* Supply bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{distributed.toLocaleString()} distributed</span>
          <span>{totalSupply.toLocaleString()} total</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {txHash && (
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-4 font-mono">
          <ExternalLink className="w-3 h-3" />
          <span className="truncate">{txHash}</span>
        </div>
      )}

      {/* Mini cap table */}
      <div className="space-y-2">
        {investors.map((inv, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-gray-300">{inv.name}</span>
            </div>
            <div className="text-right">
              <span className="text-white font-medium">{inv.tokens.toLocaleString()}</span>
              <span className="text-gray-500 ml-1 text-xs">({inv.percentage}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
