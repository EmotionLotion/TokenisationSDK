import { NavLink, Outlet } from 'react-router-dom';
import { Building2, Search, Shield } from 'lucide-react';
import { ConnectWalletButton } from '../components/ConnectWalletButton';

export function MarketplaceLayout() {
  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/20 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <span className="text-lg font-bold text-white">AHOY</span>
              <span className="text-lg font-light text-primary ml-1">Real Estate</span>
            </div>
          </NavLink>

          <nav className="hidden md:flex items-center gap-6">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? 'text-primary' : 'text-gray-400 hover:text-white'}`
              }
            >
              Properties
            </NavLink>
            <NavLink
              to="/investor/portfolio"
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? 'text-primary' : 'text-gray-400 hover:text-white'}`
              }
            >
              My Portfolio
            </NavLink>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? 'text-primary' : 'text-gray-400 hover:text-white'}`
              }
            >
              Admin
            </NavLink>
          </nav>

          <div className="flex items-center gap-3">
            <button className="p-2 text-gray-400 hover:text-white transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <ConnectWalletButton />
          </div>
        </div>
      </header>

      {/* Content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>ERC-3643 Compliant | VARA Regulated</span>
          </div>
          <span>Powered by AHOY Tokenisation SDK</span>
        </div>
      </footer>
    </div>
  );
}
