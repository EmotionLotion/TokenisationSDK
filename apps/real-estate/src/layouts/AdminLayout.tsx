import { NavLink, Outlet } from 'react-router-dom';
import {
  Building2, LayoutDashboard, Plus, Shield, DollarSign,
  List, CheckSquare, ArrowLeft,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { path: '/admin/onboard', icon: Plus, label: 'Onboard Property' },
  { path: '/admin/listings', icon: List, label: 'Listings' },
  { path: '/admin/compliance', icon: Shield, label: 'Compliance' },
  { path: '/admin/dividends', icon: DollarSign, label: 'Dividends' },
  { path: '/admin/approvals', icon: CheckSquare, label: 'Approvals' },
];

export function AdminLayout() {
  return (
    <div className="flex h-screen bg-background text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 flex flex-col bg-black/30 backdrop-blur-xl">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-white/5">
          <NavLink to="/admin" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-white">Issuer Admin</span>
          </NavLink>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600 font-medium mb-3 px-3">
            Management
          </p>
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                      isActive
                        ? 'bg-primary/10 text-white border border-primary/20'
                        : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        {/* Back to marketplace */}
        <div className="px-3 py-3 border-t border-white/5">
          <NavLink
            to="/"
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Marketplace
          </NavLink>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
