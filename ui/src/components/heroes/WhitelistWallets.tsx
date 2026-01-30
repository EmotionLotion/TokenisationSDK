import { Wallet } from 'lucide-react';

interface WalletEntry {
  address: string;
  chain: string;
  type: string;
  threshold?: number;
}

interface WhitelistWalletsProps {
  wallets: WalletEntry[];
  maxInvestors: number;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WhitelistWallets({ wallets, maxInvestors }: WhitelistWalletsProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Whitelisted Wallets</h3>
        <span className="text-xs text-gray-500">
          {wallets.length} / {maxInvestors}
        </span>
      </div>
      <div className="space-y-2">
        {wallets.map((w, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/5 bg-white/5"
          >
            <Wallet className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono text-gray-300 truncate">
                {truncateAddress(w.address)}
              </p>
              <p className="text-xs text-gray-500">
                {w.chain} &middot; {w.type}
                {w.threshold !== undefined && ` &middot; Threshold: ${w.threshold}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
