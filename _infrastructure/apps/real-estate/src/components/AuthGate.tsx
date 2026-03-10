import { Outlet } from 'react-router-dom';
import { ShieldAlert, Wallet } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

export function AuthGate() {
  const { isConnected, connectDemo } = useAuthStore();

  if (isConnected) {
    return <Outlet />;
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Wallet Required</h2>
        <p className="text-gray-400 mb-6 leading-relaxed">
          Connect your wallet to access this area. In demo mode, one click grants instant access with a simulated wallet.
        </p>
        <button
          onClick={connectDemo}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-primary-dark transition-colors text-sm shadow-lg shadow-primary/20"
        >
          <Wallet className="w-4 h-4" />
          Connect Wallet
        </button>
      </div>
    </div>
  );
}
