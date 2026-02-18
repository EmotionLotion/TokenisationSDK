import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Settings, Bell, Search, Box, Shield,
    ArrowLeftRight, Radio, Wallet, Code2, UserCheck, ChevronDown,
    Bug,
    Rocket, FileText, BookOpen, BarChart3, Key, Webhook, Terminal,
    Layers, ExternalLink,
} from 'lucide-react';
import { AhoyLogo } from '../components/AhoyLogo';
import { SdkInsightPanel } from '../components/SdkInsightPanel';
import { WalletButton } from '../components/WalletButton';
import { ChainSelector } from '../components/ChainSelector';
import { PersonaSwitcher } from '../components/PersonaSwitcher';

// Navigation structure following StripeSDKPlan Section 9.1
const MAIN_NAV = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { path: '/assets', icon: Box, label: 'Assets' },
    { path: '/identities', icon: UserCheck, label: 'Identities' },
    { path: '/policies', icon: Shield, label: 'Policy Studio' },
    { path: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
    { path: '/oracles', icon: Radio, label: 'Oracles' },
    { path: '/payouts', icon: Wallet, label: 'Payouts' },
];

const DEVELOP_NAV = [
    { path: '/dev/getting-started', icon: Rocket, label: 'Getting Started' },
    { path: '/dev/architecture', icon: Layers, label: 'Architecture' },
    { path: '/dev/chainlink', icon: Radio, label: 'Chainlink Guide' },
    { path: '/dev/api', icon: FileText, label: 'API Reference' },
    { path: '/dev/playground', icon: Code2, label: 'Playground' },
    { path: '/dev/debugger', icon: Bug, label: 'Debugger' },
    { path: '/dev/guides', icon: BookOpen, label: 'SDK Guides' },
];

const INTEGRATE_NAV = [
    { path: '/integrate', icon: BarChart3, label: 'Overview', end: true },
    { path: '/integrate/keys', icon: Key, label: 'API Keys' },
    { path: '/integrate/webhooks', icon: Webhook, label: 'Webhooks' },
    { path: '/integrate/logs', icon: Terminal, label: 'Logs & Monitoring' },
    { path: '/integrate/partner', icon: Shield, label: 'Partner Admin' },
];


export function PlatformLayout() {
    const navigate = useNavigate();

    const renderNavLink = (item: typeof MAIN_NAV[0]) => {
        const Icon = item.icon;

        return (
            <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) => `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 group ${
                    isActive
                        ? 'bg-[#F8B032]/10 text-white border border-[#F8B032]/20'
                        : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
            >
                {({ isActive }) => (
                    <>
                        <Icon className={`w-5 h-5 transition-colors ${
                            isActive ? 'text-[#F8B032]' : 'group-hover:text-[#F8B032]/70'
                        }`} />
                        <span className={`font-medium tracking-wide text-sm ${isActive ? 'text-white' : ''}`}>
                            {item.label}
                        </span>
                    </>
                )}
            </NavLink>
        );
    };

    return (
        <div className="flex h-screen bg-background text-white overflow-hidden selection:bg-primary/30">
            <SdkInsightPanel />

            {/* Ambient Background Glow */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-secondary/20 blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '7s' }} />
                <div className="absolute top-[30%] left-[30%] w-[30%] h-[30%] bg-accent/10 blur-[100px] rounded-full mix-blend-screen" />
            </div>

            {/* Glass Sidebar */}
            <aside className="relative z-20 w-64 glass border-r border-white/5 flex flex-col backdrop-blur-xl">
                {/* Logo Area - Institutional */}
                <div className="h-20 flex items-center px-5 border-b border-[#F8B032]/10 bg-gradient-to-r from-[#0F172A] to-transparent">
                    <button onClick={() => navigate('/')}>
                        <AhoyLogo size="md" animated />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-4 px-3 overflow-y-auto">
                    {/* Main Navigation */}
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600 font-medium mb-3 px-3">Platform</p>
                    <div className="space-y-1 mb-6">
                        {MAIN_NAV.map(renderNavLink)}
                    </div>

                    {/* Reference Apps */}
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600 font-medium mb-3 px-3">Reference Apps</p>
                    <div className="space-y-1 mb-6">
                        <a
                            href="http://localhost:5174"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 group text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
                        >
                            <ExternalLink className="w-5 h-5 group-hover:text-[#F8B032]/70" />
                            <span className="font-medium tracking-wide text-sm">Real Estate Platform</span>
                        </a>
                    </div>

                    {/* Develop Navigation */}
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600 font-medium mb-3 px-3">Develop</p>
                    <div className="space-y-1 mb-6">
                        {DEVELOP_NAV.map(renderNavLink)}
                    </div>

                    {/* Integrate Navigation */}
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600 font-medium mb-3 px-3">Integrate</p>
                    <div className="space-y-1 mb-6">
                        {INTEGRATE_NAV.map(renderNavLink)}
                    </div>

                </nav>

                {/* Settings - Pinned at bottom */}
                <div className="px-3 py-2 border-t border-white/5">
                    {renderNavLink({ path: '/settings', icon: Settings, label: 'Settings' })}
                </div>

                {/* Environment Selector */}
                <div className="px-4 py-3 border-t border-white/5">
                    <button className="w-full flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-500" />
                            <span className="text-xs text-gray-300">Test Mode</span>
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* User Profile Snippet */}
                <div className="p-4 border-t border-white/5 bg-black/20">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#F8B032] to-[#D69A31] flex items-center justify-center">
                            <span className="text-xs font-bold text-black">EL</span>
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-white">EmotionLotion</p>
                            <p className="text-xs text-gray-500">Platform Admin</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="relative z-10 flex-1 flex flex-col min-w-0 bg-transparent">
                {/* Glass Header */}
                <header className="h-16 glass border-b border-white/5 flex items-center justify-between px-8 backdrop-blur-md sticky top-0 z-30">
                    {/* Search Bar */}
                    <div className="relative w-96 group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2 border border-white/10 rounded-lg leading-5 bg-white/5 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 sm:text-sm transition-all"
                            placeholder="Search assets, identities, transactions..."
                        />
                    </div>

                    {/* Right Actions */}
                    <div className="flex items-center gap-4">
                        {/* Persona Switcher */}
                        <PersonaSwitcher />

                        {/* Chain Selector - show testnets in dev mode */}
                        <ChainSelector showTestnets={true} />

                        {/* Notifications */}
                        <button className="relative p-2 text-gray-400 hover:text-white transition-colors">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-black" />
                        </button>

                        {/* Wallet Connection */}
                        <WalletButton />
                    </div>
                </header>

                {/* Scrollable Content - Outlet renders child routes */}
                <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
