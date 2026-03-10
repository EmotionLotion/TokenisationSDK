import { useState } from 'react';
import { Wallet, LogOut, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { isConnected, walletAddress, connectDemo, disconnect } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);

  if (!isConnected) {
    return (
      <button
        onClick={connectDemo}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary-dark transition-colors text-sm"
      >
        <Wallet className="w-4 h-4" />
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center">
          <Wallet className="w-3 h-3 text-black" />
        </div>
        <span className="font-mono text-xs">{truncateAddress(walletAddress!)}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-48 bg-background border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Connected</p>
              <p className="text-xs font-mono text-gray-300 mt-0.5">
                {truncateAddress(walletAddress!)}
              </p>
            </div>
            <button
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
