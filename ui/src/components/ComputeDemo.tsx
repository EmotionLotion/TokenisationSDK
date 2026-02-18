import { useState, useEffect } from 'react';
import {
    Cpu, Server, TrendingUp, Wallet, BarChart3,
    Shield, Zap, Activity, DollarSign, CheckCircle2,
    Clock, ArrowRight, ChevronRight, Layers,
    CircuitBoard, HardDrive, Globe, ThermometerSun,
} from 'lucide-react';
import { sdkStore } from '../store';
import { motion } from 'framer-motion';

// ============================================================================
// API Helper
// ============================================================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_KEY = import.meta.env.VITE_API_KEY || 'sk_test_demo';

async function fetchWithFallback<T>(url: string, fallback: T): Promise<T> {
    try {
        const res = await fetch(`${API_BASE}${url}`, {
            headers: {
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) return fallback;
        const json = await res.json();
        return (json.data ?? json) as T;
    } catch {
        return fallback;
    }
}

async function postWithFallback<T>(url: string, body: unknown, fallback: T): Promise<T> {
    try {
        const res = await fetch(`${API_BASE}${url}`, {
            method: 'POST',
            headers: {
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) return fallback;
        const json = await res.json();
        return (json.data ?? json) as T;
    } catch {
        return fallback;
    }
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_NODES = [
    {
        id: 'node-001', gpuModel: 'H100', gpuCount: 8, vramPerGpu: 80,
        interconnect: 'NVLink', datacenter: 'Equinix SV5', tier: 4,
        location: 'Santa Clara, CA', status: 'active' as const,
        utilization: 94, temperature: 62, spotPrice: 3.12,
        monthlyRevenue: 18420, acquisitionCost: 320000,
        tokenSymbol: 'cH100-SV5', tokenPrice: 32.00, totalSupply: 10000,
        annualYield: 11.2, verified: true,
    },
    {
        id: 'node-002', gpuModel: 'A100', gpuCount: 4, vramPerGpu: 80,
        interconnect: 'NVLink', datacenter: 'CoreSite LA1', tier: 3,
        location: 'Los Angeles, CA', status: 'active' as const,
        utilization: 87, temperature: 58, spotPrice: 1.84,
        monthlyRevenue: 8640, acquisitionCost: 120000,
        tokenSymbol: 'cA100-LA1', tokenPrice: 12.00, totalSupply: 10000,
        annualYield: 9.8, verified: true,
    },
    {
        id: 'node-003', gpuModel: 'L40S', gpuCount: 8, vramPerGpu: 48,
        interconnect: 'PCIe', datacenter: 'Hetzner FIN1', tier: 3,
        location: 'Helsinki, FI', status: 'verified' as const,
        utilization: 0, temperature: 0, spotPrice: 0.92,
        monthlyRevenue: 0, acquisitionCost: 96000,
        tokenSymbol: '', tokenPrice: 0, totalSupply: 0,
        annualYield: 0, verified: true,
    },
    {
        id: 'node-004', gpuModel: 'RTX_4090', gpuCount: 4, vramPerGpu: 24,
        interconnect: 'PCIe', datacenter: 'Hivelocity MIA', tier: 2,
        location: 'Miami, FL', status: 'pending_verification' as const,
        utilization: 0, temperature: 0, spotPrice: 0.44,
        monthlyRevenue: 0, acquisitionCost: 9600,
        tokenSymbol: '', tokenPrice: 0, totalSupply: 0,
        annualYield: 0, verified: false,
    },
];

const MOCK_PORTFOLIO = [
    { symbol: 'cH100-SV5', tokens: 250, avgCost: 30.50, currentPrice: 32.00, pendingYield: 115.50 },
    { symbol: 'cA100-LA1', tokens: 500, avgCost: 11.20, currentPrice: 12.00, pendingYield: 67.20 },
];

const MOCK_MARKET_LISTINGS = [
    { id: 'l-001', symbol: 'cH100-SV5', name: '8x H100 SV5 Cluster', gpuModel: 'H100', gpuCount: 8, price: 32.00, yield: 11.2, datacenter: 'Equinix SV5', tier: 4, investors: 47, raised: 198400, totalRaise: 320000, utilization: 94 },
    { id: 'l-002', symbol: 'cA100-LA1', name: '4x A100 LA1 Node', gpuModel: 'A100', gpuCount: 4, price: 12.00, yield: 9.8, datacenter: 'CoreSite LA1', tier: 3, investors: 23, raised: 84000, totalRaise: 120000, utilization: 87 },
    { id: 'l-003', symbol: 'cH100-NY2', name: '8x H100 NY2 Cluster', gpuModel: 'H100', gpuCount: 8, price: 34.50, yield: 10.5, datacenter: 'Equinix NY2', tier: 4, investors: 62, raised: 310000, totalRaise: 345000, utilization: 91 },
    { id: 'l-004', symbol: 'cA6K-CHI', name: '4x A6000 Chicago', gpuModel: 'A6000', gpuCount: 4, price: 6.50, yield: 8.2, datacenter: 'QTS Chicago', tier: 3, investors: 15, raised: 32500, totalRaise: 65000, utilization: 78 },
];

const MOCK_REVENUE_HISTORY = [
    { period: 'Jan 2026', gross: 18420, net: 15297, utilization: 94, distributed: true },
    { period: 'Dec 2025', gross: 17890, net: 14857, utilization: 91, distributed: true },
    { period: 'Nov 2025', gross: 16240, net: 13479, utilization: 88, distributed: true },
    { period: 'Oct 2025', gross: 15800, net: 13114, utilization: 86, distributed: true },
];

type Tab = 'overview' | 'marketplace' | 'nodes' | 'portfolio' | 'analytics';

const STATUS_COLORS: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    verified: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    pending_verification: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    registered: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    decommissioned: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
    active: 'Active',
    verified: 'Verified',
    pending_verification: 'Pending Verification',
    registered: 'Registered',
    decommissioned: 'Decommissioned',
};

// ============================================================================
// Component
// ============================================================================

export function ComputeDemo() {
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [isTokenizing, setIsTokenizing] = useState(false);

    const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'marketplace', label: 'Marketplace', icon: Globe },
        { id: 'nodes', label: 'My Nodes', icon: Server },
        { id: 'portfolio', label: 'Portfolio', icon: Wallet },
        { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    ];

    const simulateTokenize = async (nodeId: string) => {
        setIsTokenizing(true);
        const tokenizePayload = {
            tokenSymbol: 'cL40S-FIN',
            tokenName: 'L40S Helsinki Cluster',
            totalSupply: '10000',
            pricePerToken: '9.60',
        };
        sdkStore.logSdkCall('ahoy.gpu.tokenize', { nodeId, ...tokenizePayload });
        const result = await postWithFallback(
            `/api/v1/gpu-nodes/${nodeId}/tokenize`,
            tokenizePayload,
            null,
        );
        if (!result) {
            // Fallback: simulate delay
            await new Promise(r => setTimeout(r, 2000));
        }
        sdkStore.simulateAhoyAction('ALGORITHM_PUBLISHED', 'CONNECT');
        setIsTokenizing(false);
    };

    return (
        <div className="max-w-7xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                        <Cpu className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">GPU Compute Marketplace</h1>
                        <p className="text-sm text-emerald-400 font-medium">Tokenized GPU Infrastructure</p>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                                activeTab === tab.id ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-gray-300'
                            }`}
                        >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && <OverviewTab />}
            {activeTab === 'marketplace' && <MarketplaceTab />}
            {activeTab === 'nodes' && <NodesTab onTokenize={simulateTokenize} isTokenizing={isTokenizing} />}
            {activeTab === 'portfolio' && <PortfolioTab />}
            {activeTab === 'analytics' && <AnalyticsTab />}
        </div>
    );
}

// ============================================================================
// Overview Tab
// ============================================================================

function OverviewTab() {
    const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
    const [revenueHistory, setRevenueHistory] = useState(MOCK_REVENUE_HISTORY);

    useEffect(() => {
        fetchWithFallback<Record<string, unknown>>('/api/v1/compute-market/analytics', {}).then(data => {
            if (data && Object.keys(data).length > 0) setAnalytics(data);
        });
        // Try to fetch revenue from the first mock node
        fetchWithFallback<Array<Record<string, unknown>>>('/api/v1/gpu-nodes/node-001/revenue', []).then(data => {
            if (Array.isArray(data) && data.length > 0) {
                setRevenueHistory(data.map(r => ({
                    period: r.periodStart ? new Date(r.periodStart as string).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '',
                    gross: Number(r.grossRevenueUsd) || 0,
                    net: Number(r.netRevenueUsd) || 0,
                    utilization: Number(r.avgUtilizationPercent) || 0,
                    distributed: !!r.distributed,
                })));
            }
        });
    }, []);

    const totalNodes = analytics ? Number(analytics.totalNodes) || MOCK_NODES.length : MOCK_NODES.length;
    const activeNodes = analytics ? Number(analytics.totalNodes) || MOCK_NODES.filter(n => n.status === 'active').length : MOCK_NODES.filter(n => n.status === 'active').length;
    const totalGPUs = analytics ? Number(analytics.totalGpus) || MOCK_NODES.reduce((sum, n) => sum + n.gpuCount, 0) : MOCK_NODES.reduce((sum, n) => sum + n.gpuCount, 0);
    const totalRevenue = MOCK_NODES.reduce((sum, n) => sum + n.monthlyRevenue, 0);
    const portfolioValue = MOCK_PORTFOLIO.reduce((sum, p) => sum + p.tokens * p.currentPrice, 0);

    return (
        <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-5 gap-4">
                {[
                    { label: 'Total Nodes', value: totalNodes.toString(), icon: Server, color: 'text-emerald-400' },
                    { label: 'Active Nodes', value: activeNodes.toString(), icon: Activity, color: 'text-green-400' },
                    { label: 'Total GPUs', value: totalGPUs.toString(), icon: Cpu, color: 'text-blue-400' },
                    { label: 'Monthly Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'text-amber-400' },
                    { label: 'Portfolio Value', value: `$${portfolioValue.toLocaleString()}`, icon: Wallet, color: 'text-purple-400' },
                ].map(stat => (
                    <div key={stat.label} className="glass-card p-4 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                            <stat.icon className={`w-4 h-4 ${stat.color}`} />
                            <span className="text-xs text-gray-400">{stat.label}</span>
                        </div>
                        <p className="text-xl font-bold text-white">{stat.value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* How It Works */}
                <div className="col-span-7 glass-card p-6 rounded-2xl border border-emerald-500/20 bg-emerald-900/5">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Layers className="w-5 h-5 text-emerald-400" /> Tokenization Flow
                    </h2>
                    <div className="space-y-3">
                        {[
                            { step: 1, title: 'Register Node', desc: 'Register GPU hardware specs, datacenter, and acquisition cost', icon: Server },
                            { step: 2, title: 'Verify Hardware', desc: 'Third-party audit confirms GPU model, count, and VRAM', icon: Shield },
                            { step: 3, title: 'Tokenize', desc: 'Mint ERC-20 tokens representing fractional ownership', icon: CircuitBoard },
                            { step: 4, title: 'Earn Revenue', desc: 'Node earns from GPU rentals on vast.ai marketplace', icon: DollarSign },
                            { step: 5, title: 'Distribute Yield', desc: 'Net revenue distributed pro-rata to token holders', icon: TrendingUp },
                        ].map(({ step, title, desc, icon: Icon }) => (
                            <div key={step} className="flex items-start gap-3 p-3 rounded-xl bg-black/20 border border-white/5">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                    <span className="text-sm font-bold text-emerald-400">{step}</span>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <Icon className="w-4 h-4 text-gray-400" />
                                        <span className="font-medium text-white text-sm">{title}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                                </div>
                                {step < 5 && <ChevronRight className="w-4 h-4 text-gray-600 mt-2" />}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Revenue Waterfall */}
                <div className="col-span-5 glass-card p-6 rounded-2xl border border-amber-500/20 bg-amber-900/5">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-amber-400" /> Revenue Waterfall
                    </h2>
                    <p className="text-xs text-gray-400 mb-4">How gross rental revenue becomes token holder yield</p>

                    <div className="space-y-2">
                        {[
                            { label: 'Gross Rental Revenue', value: '$18,420', pct: '100%', color: 'bg-amber-500' },
                            { label: '- Electricity Cost', value: '-$2,210', pct: '12%', color: 'bg-red-500/60' },
                            { label: '- Platform Fee (10%)', value: '-$1,621', pct: '10%', color: 'bg-orange-500/60' },
                            { label: '- Maintenance Reserve (5%)', value: '-$811', pct: '5%', color: 'bg-yellow-500/60' },
                            { label: '- Insurance (2%)', value: '-$324', pct: '2%', color: 'bg-gray-500/60' },
                            { label: 'Net Revenue to Holders', value: '$13,454', pct: '73%', color: 'bg-emerald-500' },
                        ].map(item => (
                            <div key={item.label} className="flex items-center gap-3">
                                <div className="flex-1">
                                    <div className="flex justify-between text-xs mb-0.5">
                                        <span className={item.label.startsWith('-') ? 'text-gray-500' : 'text-white font-medium'}>{item.label}</span>
                                        <span className={item.label === 'Net Revenue to Holders' ? 'text-emerald-400 font-bold' : 'text-gray-400'}>{item.value}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={`h-full ${item.color} rounded-full`} style={{ width: item.pct }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-emerald-400 font-medium">Annualized Yield</span>
                            <span className="text-lg font-bold text-emerald-300">11.2% APY</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="glass-card p-6 rounded-2xl border border-white/10">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-400" /> Recent Revenue Periods
                </h2>
                <div className="overflow-hidden rounded-xl border border-white/5">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-white/5 text-gray-400 text-xs uppercase">
                                <th className="text-left p-3">Period</th>
                                <th className="text-right p-3">Gross Revenue</th>
                                <th className="text-right p-3">Net Revenue</th>
                                <th className="text-right p-3">Utilization</th>
                                <th className="text-right p-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {revenueHistory.map(row => (
                                <tr key={row.period} className="border-t border-white/5 hover:bg-white/[0.02]">
                                    <td className="p-3 text-white font-medium">{row.period}</td>
                                    <td className="p-3 text-right text-gray-300">${row.gross.toLocaleString()}</td>
                                    <td className="p-3 text-right text-emerald-400 font-medium">${row.net.toLocaleString()}</td>
                                    <td className="p-3 text-right text-gray-300">{row.utilization}%</td>
                                    <td className="p-3 text-right">
                                        {row.distributed ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                                                <CheckCircle2 className="w-3 h-3" /> Distributed
                                            </span>
                                        ) : (
                                            <span className="text-xs text-amber-400">Pending</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Marketplace Tab
// ============================================================================

function MarketplaceTab() {
    const [listings, setListings] = useState(MOCK_MARKET_LISTINGS);
    const [marketStats, setMarketStats] = useState({ totalNodes: '127', totalGpus: '1,847', avgYield: '9.6%', tvl: '$48.2M' });

    useEffect(() => {
        fetchWithFallback<{ data?: Array<Record<string, unknown>>; total?: number }>('/api/v1/compute-market', { data: [] }).then(result => {
            const data = Array.isArray(result) ? result : (result as Record<string, unknown>).data as Array<Record<string, unknown>> | undefined;
            if (data && data.length > 0) {
                setListings(data.map((l: Record<string, unknown>) => {
                    const node = (l.node || {}) as Record<string, unknown>;
                    return {
                        id: (l.id || l.nodeId || '') as string,
                        symbol: (l.tokenSymbol || '') as string,
                        name: (l.tokenName || '') as string,
                        gpuModel: (node.gpuModel || '') as string,
                        gpuCount: Number(node.gpuCount) || 0,
                        price: Number(l.pricePerToken) || 0,
                        yield: Number(l.annualizedYieldPercent) || 0,
                        datacenter: (node.datacenterName || '') as string,
                        tier: Number(node.datacenterTier) || 0,
                        investors: Number(l.investorCount) || 0,
                        raised: Number(l.totalRaisedUsd) || 0,
                        totalRaise: Number(node.acquisitionCostUsd) || 1,
                        utilization: 0,
                    };
                }));
            }
        });
        fetchWithFallback<Record<string, unknown>>('/api/v1/compute-market/analytics', {}).then(data => {
            if (data && Object.keys(data).length > 0) {
                setMarketStats({
                    totalNodes: String(data.totalNodes || '127'),
                    totalGpus: String(data.totalGpus || '1,847'),
                    avgYield: '9.6%',
                    tvl: '$48.2M',
                });
            }
        });
    }, []);

    return (
        <div className="space-y-6">
            {/* Market Stats */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Total Listed Nodes', value: marketStats.totalNodes, change: '+8 this week' },
                    { label: 'Total GPUs', value: marketStats.totalGpus, change: '82% H100/A100' },
                    { label: 'Avg Annualized Yield', value: marketStats.avgYield, change: '+0.3% MoM' },
                    { label: 'Total Value Locked', value: marketStats.tvl, change: '+$4.1M this month' },
                ].map(stat => (
                    <div key={stat.label} className="glass-card p-4 rounded-xl border border-white/5">
                        <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                        <p className="text-xl font-bold text-white">{stat.value}</p>
                        <p className="text-xs text-emerald-400 mt-1">{stat.change}</p>
                    </div>
                ))}
            </div>

            {/* Listings */}
            <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Globe className="w-5 h-5 text-emerald-400" /> Available Offerings
                    </h2>
                    <div className="flex gap-2">
                        {['All', 'H100', 'A100', 'A6000'].map(filter => (
                            <button key={filter} className="px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10 transition-all">
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="divide-y divide-white/5">
                    {listings.map(listing => (
                        <div key={listing.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                        <Cpu className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-white">{listing.symbol}</span>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                {listing.gpuModel}
                                            </span>
                                            <span className="text-xs text-gray-500">{listing.gpuCount}x GPU</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-0.5">{listing.datacenter} (Tier {listing.tier})</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400">Price</p>
                                        <p className="font-bold text-white">${listing.price.toFixed(2)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400">Yield</p>
                                        <p className="font-bold text-emerald-400">{listing.yield}%</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400">Utilization</p>
                                        <p className="font-medium text-gray-300">{listing.utilization}%</p>
                                    </div>
                                    <div className="text-right min-w-[100px]">
                                        <p className="text-xs text-gray-400">Fundraise</p>
                                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1 mb-0.5">
                                            <div
                                                className="h-full bg-emerald-500 rounded-full"
                                                style={{ width: `${(listing.raised / listing.totalRaise) * 100}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500">{listing.investors} investors</p>
                                    </div>
                                    <button className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors">
                                        Invest
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// My Nodes Tab
// ============================================================================

function NodesTab({ onTokenize, isTokenizing }: { onTokenize: (id: string) => void; isTokenizing: boolean }) {
    const [nodes, setNodes] = useState(MOCK_NODES);

    useEffect(() => {
        fetchWithFallback<{ data?: Array<Record<string, unknown>> }>('/api/v1/gpu-nodes', { data: [] }).then(result => {
            const data = Array.isArray(result) ? result : (result as Record<string, unknown>).data as Array<Record<string, unknown>> | undefined;
            if (data && data.length > 0) {
                setNodes(data.map((n: Record<string, unknown>) => ({
                    id: (n.id || '') as string,
                    gpuModel: (n.gpuModel || '') as string,
                    gpuCount: Number(n.gpuCount) || 0,
                    vramPerGpu: Number(n.vramPerGpuGB) || 0,
                    interconnect: (n.interconnect || '') as string,
                    datacenter: (n.datacenterName || '') as string,
                    tier: Number(n.datacenterTier) || 0,
                    location: (n.datacenterLocation || '') as string,
                    status: (n.status || 'registered') as 'active' | 'verified' | 'pending_verification' | 'registered',
                    utilization: 0,
                    temperature: 0,
                    spotPrice: 0,
                    monthlyRevenue: 0,
                    acquisitionCost: Number(n.acquisitionCostUsd) || 0,
                    tokenSymbol: '',
                    tokenPrice: 0,
                    totalSupply: 0,
                    annualYield: 0,
                    verified: !!n.verified,
                })));
            }
        });
    }, []);

    return (
        <div className="space-y-6">
            {/* Register CTA */}
            <div className="glass-card p-4 rounded-2xl border border-emerald-500/20 bg-emerald-900/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                        <Server className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <p className="font-medium text-white">Register a GPU Node</p>
                        <p className="text-xs text-gray-400">Add your vast.ai host machine for tokenization</p>
                    </div>
                </div>
                <button className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Register Node
                </button>
            </div>

            {/* Node Cards */}
            <div className="grid grid-cols-2 gap-4">
                {nodes.map(node => (
                    <motion.div
                        key={node.id}
                        className="glass-card p-5 rounded-2xl border border-white/10 hover:border-emerald-500/30 transition-colors"
                        whileHover={{ y: -2 }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                                    <Cpu className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                    <span className="font-bold text-white">{node.gpuCount}x {node.gpuModel}</span>
                                    <p className="text-xs text-gray-400">{node.datacenter} ({node.location})</p>
                                </div>
                            </div>
                            <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[node.status]}`}>
                                {STATUS_LABELS[node.status]}
                            </span>
                        </div>

                        {/* Specs */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="p-2 rounded-lg bg-black/20 border border-white/5 text-center">
                                <p className="text-[10px] text-gray-500 uppercase">VRAM</p>
                                <p className="text-sm font-bold text-white">{node.gpuCount * node.vramPerGpu}GB</p>
                            </div>
                            <div className="p-2 rounded-lg bg-black/20 border border-white/5 text-center">
                                <p className="text-[10px] text-gray-500 uppercase">Interconnect</p>
                                <p className="text-sm font-bold text-white">{node.interconnect}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-black/20 border border-white/5 text-center">
                                <p className="text-[10px] text-gray-500 uppercase">Tier</p>
                                <p className="text-sm font-bold text-white">{node.tier}</p>
                            </div>
                        </div>

                        {/* Metrics (active nodes only) */}
                        {node.status === 'active' && (
                            <div className="space-y-2 mb-4">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-400 flex items-center gap-1">
                                        <Activity className="w-3 h-3" /> Utilization
                                    </span>
                                    <span className="text-white font-medium">{node.utilization}%</span>
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${node.utilization > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                        style={{ width: `${node.utilization}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-400 flex items-center gap-1">
                                        <ThermometerSun className="w-3 h-3" /> {node.temperature}°C
                                    </span>
                                    <span className="text-gray-400 flex items-center gap-1">
                                        <DollarSign className="w-3 h-3" /> ${node.spotPrice}/hr
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Token Info (tokenized nodes) */}
                        {node.tokenSymbol && (
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-emerald-400 font-mono font-bold">{node.tokenSymbol}</span>
                                    <span className="text-white font-bold">${node.tokenPrice.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs mt-1">
                                    <span className="text-gray-400">{node.totalSupply.toLocaleString()} supply</span>
                                    <span className="text-emerald-300">{node.annualYield}% APY</span>
                                </div>
                            </div>
                        )}

                        {/* Revenue (active) */}
                        {node.status === 'active' && (
                            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                                <div>
                                    <p className="text-xs text-gray-400">Monthly Revenue</p>
                                    <p className="text-lg font-bold text-white">${node.monthlyRevenue.toLocaleString()}</p>
                                </div>
                                <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors">
                                    View Details <ArrowRight className="w-3 h-3 inline ml-1" />
                                </button>
                            </div>
                        )}

                        {/* Action Buttons */}
                        {node.status === 'verified' && !node.tokenSymbol && (
                            <button
                                onClick={() => onTokenize(node.id)}
                                disabled={isTokenizing}
                                className="w-full mt-3 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                {isTokenizing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Tokenizing...
                                    </>
                                ) : (
                                    <>
                                        <CircuitBoard className="w-4 h-4" /> Tokenize Node
                                    </>
                                )}
                            </button>
                        )}

                        {node.status === 'pending_verification' && (
                            <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                                <p className="text-xs text-amber-400 flex items-center justify-center gap-1">
                                    <Clock className="w-3 h-3" /> Hardware verification in progress
                                </p>
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

// ============================================================================
// Portfolio Tab
// ============================================================================

function PortfolioTab() {
    const totalValue = MOCK_PORTFOLIO.reduce((sum, p) => sum + p.tokens * p.currentPrice, 0);
    const totalCost = MOCK_PORTFOLIO.reduce((sum, p) => sum + p.tokens * p.avgCost, 0);
    const totalPnL = totalValue - totalCost;
    const pendingYield = MOCK_PORTFOLIO.reduce((sum, p) => sum + p.pendingYield, 0);

    return (
        <div className="space-y-6">
            {/* Portfolio Summary */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Portfolio Value', value: `$${totalValue.toLocaleString()}`, color: 'text-white' },
                    { label: 'Unrealized P&L', value: `+$${totalPnL.toLocaleString()}`, color: 'text-emerald-400' },
                    { label: 'Pending Yield', value: `$${pendingYield.toFixed(2)}`, color: 'text-amber-400' },
                    { label: 'Positions', value: MOCK_PORTFOLIO.length.toString(), color: 'text-blue-400' },
                ].map(stat => (
                    <div key={stat.label} className="glass-card p-4 rounded-xl border border-white/5">
                        <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                        <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Holdings */}
            <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-purple-400" /> Holdings
                    </h2>
                </div>

                <div className="divide-y divide-white/5">
                    {MOCK_PORTFOLIO.map(position => {
                        const value = position.tokens * position.currentPrice;
                        const cost = position.tokens * position.avgCost;
                        const pnl = value - cost;
                        const pnlPct = ((pnl / cost) * 100).toFixed(1);

                        return (
                            <div key={position.symbol} className="p-4 hover:bg-white/[0.02] transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                            <Cpu className="w-5 h-5 text-emerald-400" />
                                        </div>
                                        <div>
                                            <span className="font-bold text-white font-mono">{position.symbol}</span>
                                            <p className="text-xs text-gray-400">{position.tokens.toLocaleString()} tokens</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-8">
                                        <div className="text-right">
                                            <p className="text-xs text-gray-400">Avg Cost</p>
                                            <p className="text-sm text-gray-300">${position.avgCost.toFixed(2)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-400">Current</p>
                                            <p className="text-sm font-medium text-white">${position.currentPrice.toFixed(2)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-400">Value</p>
                                            <p className="text-sm font-bold text-white">${value.toLocaleString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-400">P&L</p>
                                            <p className="text-sm font-medium text-emerald-400">+${pnl.toLocaleString()} ({pnlPct}%)</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-400">Pending Yield</p>
                                            <p className="text-sm font-medium text-amber-400">${position.pendingYield.toFixed(2)}</p>
                                        </div>
                                        <button className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-medium border border-emerald-500/30 transition-colors">
                                            Claim Yield
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Yield History */}
            <div className="glass-card p-6 rounded-2xl border border-white/10">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" /> Distribution History
                </h2>
                <div className="space-y-3">
                    {[
                        { date: 'Feb 1, 2026', amount: 182.70, method: 'Pro Rata', status: 'completed' },
                        { date: 'Jan 1, 2026', amount: 176.30, method: 'Pro Rata', status: 'completed' },
                        { date: 'Dec 1, 2025', amount: 168.40, method: 'Pro Rata', status: 'completed' },
                    ].map((dist, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                <div>
                                    <p className="text-sm text-white">{dist.date}</p>
                                    <p className="text-xs text-gray-400">{dist.method}</p>
                                </div>
                            </div>
                            <span className="text-sm font-bold text-emerald-400">${dist.amount.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Analytics Tab
// ============================================================================

function AnalyticsTab() {
    const FALLBACK_MODELS = [
        { model: 'H100', count: 64, nodes: 8, vram: 5120, avgYield: 11.0, color: 'bg-emerald-500' },
        { model: 'A100', count: 48, nodes: 12, vram: 3840, avgYield: 9.5, color: 'bg-blue-500' },
        { model: 'L40S', count: 32, nodes: 4, vram: 1536, avgYield: 8.8, color: 'bg-purple-500' },
        { model: 'A6000', count: 24, nodes: 6, vram: 1152, avgYield: 8.2, color: 'bg-amber-500' },
        { model: 'RTX 4090', count: 16, nodes: 4, vram: 384, avgYield: 7.5, color: 'bg-red-500' },
    ];
    const MODEL_COLORS: Record<string, string> = { H100: 'bg-emerald-500', A100: 'bg-blue-500', L40S: 'bg-purple-500', A6000: 'bg-amber-500', RTX_4090: 'bg-red-500', V100: 'bg-cyan-500', RTX_3090: 'bg-pink-500', OTHER: 'bg-gray-500' };

    const [gpuModels, setGpuModels] = useState(FALLBACK_MODELS);

    useEffect(() => {
        fetchWithFallback<Record<string, unknown>>('/api/v1/compute-market/analytics', {}).then(data => {
            const breakdown = (data?.modelBreakdown || data?.model_breakdown) as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(breakdown) && breakdown.length > 0) {
                const maxCount = Math.max(...breakdown.map(b => Number(b.totalGpus) || 1));
                setGpuModels(breakdown.map(b => ({
                    model: (b.gpuModel || b.gpu_model || '') as string,
                    count: Number(b.totalGpus) || 0,
                    nodes: Number(b.count) || 0,
                    vram: Number(b.totalVram) || 0,
                    avgYield: 0,
                    color: MODEL_COLORS[(b.gpuModel || '') as string] || 'bg-gray-500',
                })));
            }
        });
    }, []);

    const maxGpuCount = Math.max(...gpuModels.map(g => g.count), 1);

    return (
        <div className="space-y-6">
            {/* Market Analytics */}
            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-8 glass-card p-6 rounded-2xl border border-white/10">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-400" /> GPU Model Breakdown
                    </h2>
                    <div className="space-y-4">
                        {gpuModels.map(gpu => (
                            <div key={gpu.model} className="flex items-center gap-4">
                                <span className="text-sm font-mono text-white w-20">{gpu.model}</span>
                                <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${gpu.color} rounded-full flex items-center pl-2`}
                                        style={{ width: `${(gpu.count / maxGpuCount) * 100}%` }}
                                    >
                                        <span className="text-[10px] font-bold text-white">{gpu.count} GPUs</span>
                                    </div>
                                </div>
                                <div className="text-right w-24">
                                    <span className="text-xs text-emerald-400 font-medium">{gpu.avgYield}% APY</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="col-span-4 space-y-4">
                    {/* Market Rates */}
                    <div className="glass-card p-6 rounded-2xl border border-white/10">
                        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-amber-400" /> Spot Rates ($/hr)
                        </h3>
                        <div className="space-y-2">
                            {[
                                { model: 'H100', price: '$3.12', change: '+$0.08' },
                                { model: 'A100', price: '$1.84', change: '-$0.02' },
                                { model: 'L40S', price: '$0.92', change: '+$0.05' },
                                { model: 'A6000', price: '$0.68', change: '+$0.01' },
                                { model: 'RTX 4090', price: '$0.44', change: '-$0.01' },
                            ].map(rate => (
                                <div key={rate.model} className="flex items-center justify-between p-2 rounded-lg bg-black/20">
                                    <span className="text-xs font-mono text-gray-300">{rate.model}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-white">{rate.price}</span>
                                        <span className={`text-[10px] ${rate.change.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {rate.change}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Network Health */}
                    <div className="glass-card p-6 rounded-2xl border border-white/10">
                        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-400" /> Network Health
                        </h3>
                        <div className="space-y-3">
                            {[
                                { label: 'Avg Utilization', value: '89%' },
                                { label: 'Uptime (30d)', value: '99.7%' },
                                { label: 'Active Nodes', value: '112' },
                                { label: 'Total VRAM', value: '12.4 TB' },
                            ].map(metric => (
                                <div key={metric.label} className="flex justify-between text-xs">
                                    <span className="text-gray-400">{metric.label}</span>
                                    <span className="text-white font-medium">{metric.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Datacenter Distribution */}
            <div className="glass-card p-6 rounded-2xl border border-white/10">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-purple-400" /> Datacenter Distribution
                </h2>
                <div className="grid grid-cols-4 gap-4">
                    {[
                        { name: 'Equinix SV5', location: 'Santa Clara, CA', tier: 4, nodes: 3, gpus: 24 },
                        { name: 'CoreSite LA1', location: 'Los Angeles, CA', tier: 3, nodes: 2, gpus: 8 },
                        { name: 'Equinix NY2', location: 'New York, NY', tier: 4, nodes: 4, gpus: 32 },
                        { name: 'Hetzner FIN1', location: 'Helsinki, FI', tier: 3, nodes: 2, gpus: 16 },
                    ].map(dc => (
                        <div key={dc.name} className="p-4 rounded-xl bg-black/20 border border-white/5">
                            <div className="flex items-center gap-2 mb-2">
                                <Globe className="w-4 h-4 text-blue-400" />
                                <span className="text-sm font-medium text-white">{dc.name}</span>
                            </div>
                            <p className="text-xs text-gray-400 mb-2">{dc.location}</p>
                            <div className="flex items-center gap-3 text-xs">
                                <span className="text-gray-300">Tier {dc.tier}</span>
                                <span className="text-gray-500">|</span>
                                <span className="text-gray-300">{dc.nodes} nodes</span>
                                <span className="text-gray-500">|</span>
                                <span className="text-emerald-400">{dc.gpus} GPUs</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
