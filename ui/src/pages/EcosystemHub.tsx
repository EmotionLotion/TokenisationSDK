import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity, ChevronRight, ArrowUpRight, ArrowDownRight, Database, Plane,
    Droplets, Truck, Share2, TrendingUp, Zap, ShieldCheck, Award, Code2, Brain, Users, Building2, Map, Cpu,
    Presentation
} from 'lucide-react';
import { sdkStore } from '../store';
import { QuickActionDemo, InlineDemoCard, scenarios } from '../components/QuickActionDemo';
import { AhoyLogo, AhoyTokenSymbol } from '../components/AhoyLogo';

interface ServiceCard {
    id: string;
    name: string;
    description: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    route: string;
    metrics: {
        label: string;
        value: string;
        change?: string;
        positive?: boolean;
    }[];
    features: string[];
}

const services: ServiceCard[] = [
    {
        id: 'comet',
        name: 'COMET',
        description: 'Driver Reputation & Fleet Management',
        icon: Truck,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        route: '/app/comet',
        metrics: [
            { label: 'Active Drivers', value: '2,847', change: '+12%', positive: true },
            { label: 'Avg Safety Score', value: '94.2', change: '+2.1', positive: true },
            { label: 'Deliveries Today', value: '15,432' },
        ],
        features: ['Soulbound Reputation SBT', 'Telematics Integration', 'XP-Based Tiers'],
    },
    {
        id: 'equity',
        name: 'Equity & Governance',
        description: 'Stakeholder & Cap Table Management',
        icon: Users,
        color: 'text-indigo-400',
        bgColor: 'bg-indigo-500/10',
        route: '/app/equity',
        metrics: [
            { label: 'Total Equity', value: '100%', change: '0%', positive: true },
            { label: 'Vested', value: '45%', change: '+12%', positive: true },
        ],
        features: ['Cap Table', 'Vesting Schedules', 'Voting Power'],
    },
    {
        id: 'flyplus',
        name: 'Fly+',
        description: 'Premium Travel Experience',
        icon: Plane,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        route: '/app/flyplus',
        metrics: [
            { label: 'Active Passes', value: '45,230', change: '+8%', positive: true },
            { label: 'Tier Distribution', value: '15% Gold+' },
            { label: 'Monthly Usage', value: '12,847' },
        ],
        features: ['Access NFT Pass', 'Remote Check-in', 'Door-to-Door Luggage'],
    },
    {
        id: 'h2o',
        name: 'H2O2TO',
        description: 'IoT-Verified Utility Credits',
        icon: Droplets,
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-500/10',
        route: '/app/h2o',
        metrics: [
            { label: 'Credits Issued', value: '1.2M', change: '+23%', positive: true },
            { label: 'IoT Devices', value: '8,432' },
            { label: 'Carbon Offset', value: '456 tons' },
        ],
        features: ['Smart Meter Integration', 'Real-time Verification', 'Carbon Tracking'],
    },
    {
        id: 'gts',
        name: 'GTS',
        description: 'Geospatial Tracking System',
        icon: Map,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        route: '/app/gts',
        metrics: [
            { label: 'Data Contributors', value: '1,247', change: '+18%', positive: true },
            { label: 'Routes/Day', value: '45.2K' },
            { label: 'AHOY Earned', value: '12.4K' },
        ],
        features: ['Earn AHOY for Data', 'Isochrone Analysis', 'Traffic Oracle'],
    },
    {
        id: 'ams',
        name: 'AMS',
        description: 'Developer APIs & SDKs',
        icon: Code2,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        route: '/app/ams',
        metrics: [
            { label: 'API Developers', value: '234', change: '+15%', positive: true },
            { label: 'API Calls/Day', value: '89.2K' },
            { label: 'AHOY Revenue', value: '8.9K' },
        ],
        features: ['Pay-per-Call', 'Stake for Discounts', 'SDK Libraries'],
    },
    {
        id: 'trouve',
        name: 'Trouve Labs',
        description: 'Federated ML & Graph RAG',
        icon: Brain,
        color: 'text-pink-400',
        bgColor: 'bg-pink-500/10',
        route: '/app/trouve',
        metrics: [
            { label: 'Active Models', value: '412', change: '+18%', positive: true },
            { label: 'Compute Power', value: '840 PetaFLOPS', change: '+5%', positive: true },
        ],
        features: ['Federated Training', 'Graph RAG', 'Compute Sharing'],
    },
    {
        id: 'iits',
        name: 'IITS',
        description: 'Smart City Infrastructure',
        icon: Building2,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/10',
        route: '/app/iits',
        metrics: [
            { label: 'Infrastructure Nodes', value: '4,767', change: '+8%', positive: true },
            { label: 'City Proposals', value: '23 Active' },
        ],
        features: ['City DAO Voting', 'Emergency Multi-Sig', 'Infrastructure Tokens'],
    },
    {
        id: 'nexus',
        name: 'Nexus',
        description: 'AI Orchestration Platform',
        icon: Cpu,
        color: 'text-indigo-400',
        bgColor: 'bg-indigo-500/10',
        route: '/app/nexus',
        metrics: [
            { label: 'Active Agents', value: '142', change: '+12%', positive: true },
            { label: 'Queries/Day', value: '8.9K', change: '+15%', positive: true },
        ],
        features: ['Tree-of-Thought', 'AI Agents', 'Local-First'],
    },
];

interface LoyaltyTransaction {
    id: string;
    userId: string;
    userName: string;
    action: string;
    points: number;
    source: string;
    timestamp: string;
}

export function EcosystemHub() {
    const navigate = useNavigate();
    const [ahoyBalance, setAhoyBalance] = useState('0');
    const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
    const [userTier, setUserTier] = useState('BRONZE');
    const [demoOpen, setDemoOpen] = useState(false);
    const [selectedDemoId, setSelectedDemoId] = useState<string | undefined>();
    const [expandedService, setExpandedService] = useState<string | null>(null);

    const openDemo = (scenarioId?: string) => {
        setSelectedDemoId(scenarioId);
        setDemoOpen(true);
    };

    useEffect(() => {
        const loadAhoyData = () => {
            const ahoyState = sdkStore.getAhoyState();
            if (ahoyState) {
                setAhoyBalance(ahoyState.balance);
                setTransactions(ahoyState.transactions);
                setUserTier(ahoyState.tier);
            }
        };

        loadAhoyData();
        const unsubscribe = sdkStore.subscribe(loadAhoyData);
        return () => unsubscribe();
    }, []);

    const tierColors: Record<string, string> = {
        BRONZE: 'from-amber-700 to-amber-900',
        SILVER: 'from-gray-400 to-gray-600',
        GOLD: 'from-yellow-400 to-yellow-600',
        PLATINUM: 'from-slate-300 to-slate-500',
        DIAMOND: 'from-cyan-300 to-blue-500',
    };

    const handleServiceClick = (service: ServiceCard) => {
        navigate(service.route);
    };

    const toggleServiceExpand = (serviceId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedService(expandedService === serviceId ? null : serviceId);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Hero Section - Institutional Grade */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] p-8 text-white border border-[#F8B032]/20 shadow-2xl">
                {/* Background Elements */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#F8B032]/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#F8B032]/5 rounded-full blur-[100px] pointer-events-none" />

                {/* Grid Pattern Overlay */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: `linear-gradient(rgba(248,176,50,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(248,176,50,0.3) 1px, transparent 1px)`,
                    backgroundSize: '60px 60px'
                }} />

                <div className="relative z-10">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-5">
                            <AhoyLogo size="lg" animated />
                            <div className="h-12 w-px bg-gradient-to-b from-transparent via-[#F8B032]/30 to-transparent" />
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-[#F8B032]/70 font-medium mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Unified Tokenisation Platform
                                </p>
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1.5 text-sm text-gray-400">
                                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                        Live
                                    </span>
                                    <span className="text-gray-600">|</span>
                                    <span className="text-sm text-gray-500 font-mono">SDK v2.0</span>
                                </div>
                            </div>
                        </div>

                        {/* Guided Showcase CTA + Tier Badge */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate('/showcase')}
                                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#F8B032] to-[#D69A31] text-black rounded-xl font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-[#F8B032]/20"
                            >
                                <Presentation className="w-4 h-4" />
                                Guided Showcase
                            </button>
                        </div>

                        {/* Tier Badge - Institutional Style */}
                        <div className="flex items-center gap-3">
                            <div className="text-right mr-2">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500">Member Status</p>
                                <p className="text-sm font-semibold text-white">{userTier}</p>
                            </div>
                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tierColors[userTier]} flex items-center justify-center shadow-lg border border-white/10`}>
                                <Award className="w-6 h-6 text-white" />
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* $AHOY Balance Card - Premium Style */}
                        <div className="relative group">
                            <div className="absolute inset-0 bg-gradient-to-r from-[#F8B032]/20 to-[#D69A31]/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <div className="relative glass-card rounded-xl p-5 border border-[#F8B032]/20 hover:border-[#F8B032]/40 transition-all duration-300">
                                <div className="flex justify-between items-start mb-3">
                                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">$AHOY Balance</p>
                                    <AhoyTokenSymbol size={18} />
                                </div>
                                <p className="text-3xl font-light text-white tracking-tight group-hover:text-[#F8B032] transition-colors" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>
                                    {parseInt(ahoyBalance).toLocaleString()}
                                </p>
                                <div className="mt-3 flex items-center justify-between">
                                    <span className="text-xs text-gray-500 font-mono">
                                        ≈ ${(parseInt(ahoyBalance) * 0.05).toLocaleString()} USD
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 bg-green-500/10 text-green-400 rounded border border-green-500/20">
                                        +12.5%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Connected Services */}
                        <div className="glass-card rounded-xl p-5 border border-white/10 hover:border-white/20 transition-all duration-300">
                            <div className="flex justify-between items-start mb-3">
                                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Ecosystem</p>
                                <Share2 className="w-4 h-4 text-gray-500" />
                            </div>
                            <p className="text-3xl font-light text-white tracking-tight" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>8</p>
                            <div className="mt-3 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                <span className="text-xs text-gray-500">All Systems Operational</span>
                            </div>
                        </div>

                        {/* Lifetime Earned */}
                        <div className="glass-card rounded-xl p-5 border border-white/10 hover:border-white/20 transition-all duration-300">
                            <div className="flex justify-between items-start mb-3">
                                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Lifetime Earned</p>
                                <TrendingUp className="w-4 h-4 text-gray-500" />
                            </div>
                            <p className="text-3xl font-light text-white tracking-tight" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>24,580</p>
                            <div className="mt-3 flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3 text-green-400" />
                                <span className="text-xs text-green-400 font-medium">+12.5% MTD</span>
                            </div>
                        </div>

                        {/* Active Streak */}
                        <div className="glass-card rounded-xl p-5 border border-white/10 hover:border-white/20 transition-all duration-300">
                            <div className="flex justify-between items-start mb-3">
                                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Active Streak</p>
                                <Zap className="w-4 h-4 text-[#F8B032]" />
                            </div>
                            <p className="text-3xl font-light text-white tracking-tight" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>12<span className="text-lg text-gray-500 ml-1">days</span></p>
                            <div className="mt-3 flex items-center gap-2">
                                <span className="text-xs px-2 py-0.5 bg-[#F8B032]/10 text-[#F8B032] rounded border border-[#F8B032]/20 font-medium">
                                    1.2x Multiplier
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Governance Section */}
            <div className="mb-8">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-500" />
                    Organizational Governance
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-1 gap-5">
                    {/* Equity Card - Special Full Width Treatment */}
                    {services.filter(s => s.id === 'equity').map((service) => (
                        <div
                            key={service.id}
                            onClick={() => handleServiceClick(service)}
                            className="glass-card rounded-xl p-6 cursor-pointer transition-all duration-300 group hover:-translate-y-1 relative overflow-hidden border border-white/5 hover:border-white/10 hover:bg-white/5"
                        >
                            {/* Background gradient for premium feel */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className={`w-14 h-14 ${service.bgColor} rounded-xl flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-indigo-900/20`}>
                                        <service.icon className={`w-7 h-7 ${service.color}`} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">{service.name}</h3>
                                        <p className="text-sm text-gray-400 mt-1">{service.description}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-8 w-full md:w-auto">
                                    {service.metrics.map((metric, idx) => (
                                        <div key={idx} className="flex flex-col">
                                            <span className="text-xs text-gray-500 uppercase tracking-widest">{metric.label}</span>
                                            <span className="text-lg font-mono font-bold text-white">{metric.value}</span>
                                        </div>
                                    ))}
                                    <div className="ml-auto md:ml-0 bg-white/5 p-2 rounded-full border border-white/10 group-hover:border-indigo-500/50 transition-colors">
                                        <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                                    </div>
                                </div>
                            </div>

                            {/* Features */}
                            <div className="mt-6 pt-6 border-t border-white/10">
                                <div className="flex flex-wrap gap-2">
                                    {service.features.map((feature, idx) => (
                                        <span key={idx} className="px-3 py-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs font-medium rounded-lg">
                                            {feature}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Services Grid (Remaining Services) */}
            <div>
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Database className="w-5 h-5 text-primary" />
                    Ecosystem Product Services
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {services.filter(s => s.id !== 'equity').map((service) => (
                        <div
                            key={service.id}
                            onClick={() => handleServiceClick(service)}
                            className="glass-card rounded-xl p-6 cursor-pointer transition-all duration-300 group hover:-translate-y-1 border border-white/5 hover:border-white/10 hover:bg-white/5"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className={`w-12 h-12 ${service.bgColor} rounded-xl flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform duration-300`}>
                                    <service.icon className={`w-6 h-6 ${service.color}`} />
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                            </div>

                            <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">{service.name}</h3>
                            <p className="text-sm text-gray-400 mt-1 line-clamp-2">{service.description}</p>

                            {/* Metrics */}
                            <div className="mt-5 space-y-3">
                                {service.metrics.slice(0, 2).map((metric, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                        <span className="text-gray-500">{metric.label}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-gray-200">{metric.value}</span>
                                            {metric.change && (
                                                <span className={`flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${metric.positive
                                                    ? 'text-green-400 bg-green-400/10'
                                                    : 'text-red-400 bg-red-400/10'
                                                    }`}>
                                                    {metric.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                                    {metric.change}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Features (shown on hover) */}
                            <div className="mt-4 pt-4 border-t border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div className="flex flex-wrap gap-2">
                                    {service.features.map((feature, idx) => (
                                        <span key={idx} className={`px-2.5 py-1 ${service.bgColor} ${service.color} border border-white/5 text-xs font-medium rounded-lg`}>
                                            {feature}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Earn & Burn Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Transactions */}
                <div className="glass-card rounded-xl p-6 border border-white/5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-white">Recent Activity</h3>
                        <Activity className="w-5 h-5 text-gray-400" />
                    </div>

                    <div className="space-y-1">
                        {transactions.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>No transactions yet</p>
                                <p className="text-sm mt-1 opacity-50">Start earning $AHOY by using ecosystem services</p>
                            </div>
                        ) : (
                            transactions.slice(0, 5).map((tx) => (
                                <div key={tx.id} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-xl transition-colors group border border-transparent hover:border-white/5">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${tx.points > 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                            {tx.points > 0 ? (
                                                <ArrowUpRight className="w-5 h-5 text-green-500" />
                                            ) : (
                                                <ArrowDownRight className="w-5 h-5 text-red-500" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-200 group-hover:text-white transition-colors">{tx.action.replace(/_/g, ' ')}</p>
                                            <p className="text-xs text-gray-500">{tx.source}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-bold font-mono ${tx.points > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {tx.points > 0 ? '+' : ''}{tx.points}
                                        </p>
                                        <p className="text-xs text-gray-500">{new Date(tx.timestamp).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Quick Actions - Live Demos */}
                <div className="glass-card rounded-xl p-6 border border-white/5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-lg font-bold text-white">Try $AHOY Live Demos</h3>
                            <p className="text-xs text-gray-500 mt-1">Interactive walkthroughs showing token utility</p>
                        </div>
                        <button
                            onClick={() => openDemo()}
                            className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-primary text-xs font-medium hover:bg-primary/20 transition-colors flex items-center gap-1.5"
                        >
                            <Zap className="w-3.5 h-3.5" />
                            View All Demos
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                        {scenarios.map((scenario) => (
                            <InlineDemoCard
                                key={scenario.id}
                                scenario={scenario}
                                onOpenFullDemo={() => openDemo(scenario.id)}
                            />
                        ))}
                    </div>

                    {/* Redemption Options */}
                    <div className="pt-6 border-t border-white/10">
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Redeem $AHOY</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => sdkStore.simulateAhoyAction('DISCOUNT_REDEMPTION', 'FLYPLUS')}
                                className="p-3 border border-white/10 bg-white/5 rounded-xl hover:border-red-500/30 hover:bg-red-500/5 transition-all text-left group"
                            >
                                <p className="text-sm font-medium text-gray-200 group-hover:text-white">Flight Discount</p>
                                <p className="text-xs text-red-400 font-mono mt-1">-500 $AHOY</p>
                            </button>

                            <button
                                onClick={() => sdkStore.simulateAhoyAction('PRIORITY_QUEUE', 'COMET')}
                                className="p-3 border border-white/10 bg-white/5 rounded-xl hover:border-red-500/30 hover:bg-red-500/5 transition-all text-left group"
                            >
                                <p className="text-sm font-medium text-gray-200 group-hover:text-white">Priority Queue</p>
                                <p className="text-xs text-red-400 font-mono mt-1">-200 $AHOY</p>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Live Demo Modal */}
            <QuickActionDemo
                isOpen={demoOpen}
                onClose={() => {
                    setDemoOpen(false);
                    setSelectedDemoId(undefined);
                }}
                scenarioId={selectedDemoId}
            />

            {/* Tier Progress */}
            <div className="glass-card rounded-xl border border-white/10 p-6">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold text-white">Tier Progress</h3>
                    <Award className="w-5 h-5 text-gray-400" />
                </div>

                <div className="relative pt-2">
                    {/* Progress Bar Background */}
                    <div className="absolute top-1/2 left-0 w-full h-1 bg-white/10 rounded-full -translate-y-1/2" />

                    <div className="flex justify-between relative z-10">
                        {['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'].map((tier, idx) => {
                            const thresholds = [0, 5000, 15000, 50000, 100000];
                            const currentIdx = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'].indexOf(userTier);
                            const isActive = idx <= currentIdx;
                            const isCurrent = tier === userTier;

                            return (
                                <div key={tier} className="flex flex-col items-center gap-3 w-1/5">
                                    <div className={`w-4 h-4 rounded-full border-2 transition-all duration-500 ${isActive
                                        ? 'bg-primary border-primary shadow-[0_0_10px_rgba(var(--primary),0.5)] scale-110'
                                        : 'bg-[#0f172a] border-gray-600'
                                        }`} />

                                    <div className="text-center">
                                        <p className={`text-xs font-bold transition-colors ${isCurrent ? 'text-primary' : isActive ? 'text-gray-300' : 'text-gray-600'}`}>
                                            {tier}
                                        </p>
                                        <p className="text-[10px] text-gray-500 font-mono mt-1">{thresholds[idx].toLocaleString()}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Active Progress Bar Overlay */}
                    <div
                        className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full -translate-y-1/2 transition-all duration-1000"
                        style={{ width: `${(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'].indexOf(userTier) / 4) * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
