import { useState, useEffect } from 'react';
import {
    Code, Terminal, Book, Cpu, Key, Zap,
    Coins, Lock, CheckCircle2, Copy, ExternalLink,
    Package, Globe, Shield, Sparkles, BarChart3,
    Play, ArrowRight, FileJson, Layers, TrendingUp, TrendingDown
} from 'lucide-react';
import { useAhoyState } from '../contexts/SDKContext';
import { AhoyBalanceWidget, AhoyActionButton } from './AhoyBalanceWidget';

type TabType = 'apis' | 'sdks' | 'tokenization' | 'playground';

interface APIEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    description: string;
    cost: number;
    category: string;
}

interface SDK {
    name: string;
    language: string;
    icon: string;
    version: string;
    downloads: string;
    stakingTier: string;
}

export function AMSDemo() {
    const [activeTab, setActiveTab] = useState<TabType>('apis');
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [recentAction, setRecentAction] = useState<string | null>(null);
    const { ahoyState, simulateAhoyAction } = useAhoyState();

    // Auto-hide toast
    useEffect(() => {
        if (recentAction) {
            const timer = setTimeout(() => setRecentAction(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recentAction]);

    const showToast = (message: string) => setRecentAction(message);

    const apiEndpoints: APIEndpoint[] = [
        { method: 'GET', path: '/v1/routing/optimize', description: 'Get optimized route between points', cost: 0.01, category: 'GTS Routing' },
        { method: 'GET', path: '/v1/isochrone/calculate', description: 'Calculate reachability zones', cost: 0.02, category: 'GTS Isochrone' },
        { method: 'GET', path: '/v1/traffic/live', description: 'Real-time traffic data feed', cost: 0.005, category: 'GTS Traffic' },
        { method: 'POST', path: '/v1/traffic/contribute', description: 'Submit traffic data (earn AHOY)', cost: -5, category: 'GTS Traffic' },
        { method: 'GET', path: '/v1/analytics/historical', description: 'Historical traffic analytics', cost: 0.05, category: 'GTS Analytics' },
        { method: 'POST', path: '/v1/tokens/mint', description: 'Mint new asset tokens', cost: 0.1, category: 'Tokenisation' },
        { method: 'POST', path: '/v1/tokens/transfer', description: 'Transfer tokens between parties', cost: 0.02, category: 'Tokenisation' },
        { method: 'GET', path: '/v1/compliance/check', description: 'Check transfer compliance', cost: 0.01, category: 'Compliance' },
    ];

    const sdks: SDK[] = [
        { name: 'TypeScript SDK', language: 'TypeScript', icon: '🟦', version: '1.2.0', downloads: '12.4k', stakingTier: 'Free' },
        { name: 'Python SDK', language: 'Python', icon: '🐍', version: '1.1.0', downloads: '8.2k', stakingTier: 'Free' },
        { name: 'Go SDK', language: 'Go', icon: '🔵', version: '1.0.0', downloads: '3.1k', stakingTier: 'Silver' },
        { name: 'Rust SDK', language: 'Rust', icon: '🦀', version: '0.9.0', downloads: '1.8k', stakingTier: 'Gold' },
        { name: 'iOS SDK', language: 'Swift', icon: '🍎', version: '1.0.0', downloads: '2.4k', stakingTier: 'Silver' },
        { name: 'Android SDK', language: 'Kotlin', icon: '🤖', version: '1.0.0', downloads: '2.9k', stakingTier: 'Silver' },
    ];

    const stakingTiers = [
        { name: 'Free', required: 0, rateLimit: '100/day', discount: '0%' },
        { name: 'Bronze', required: 100, rateLimit: '1,000/day', discount: '10%' },
        { name: 'Silver', required: 500, rateLimit: '10,000/day', discount: '25%' },
        { name: 'Gold', required: 2000, rateLimit: '100,000/day', discount: '40%' },
        { name: 'Platinum', required: 10000, rateLimit: 'Unlimited', discount: '60%' },
    ];

    const codeExamples = {
        typescript: `import { AhoySDK } from '@ahoy/sdk';

const sdk = new AhoySDK({
  apiKey: 'your-api-key',
  network: 'polygon'
});

// Get optimized route (costs 0.01 AHOY)
const route = await sdk.gts.routing.optimize({
  origin: { lat: 25.2048, lng: 55.2708 },
  destination: { lat: 25.2532, lng: 55.3657 },
  mode: 'car',
  optimize: 'fuel'
});

// Contribute traffic data (earns 5 AHOY)
await sdk.gts.traffic.contribute({
  location: { lat: 25.2048, lng: 55.2708 },
  speed: 45,
  timestamp: Date.now()
});`,
        python: `from ahoy import AhoySDK

sdk = AhoySDK(
    api_key="your-api-key",
    network="polygon"
)

# Get optimized route (costs 0.01 AHOY)
route = sdk.gts.routing.optimize(
    origin={"lat": 25.2048, "lng": 55.2708},
    destination={"lat": 25.2532, "lng": 55.3657},
    mode="car",
    optimize="fuel"
)

# Mint asset token (costs 0.1 AHOY)
token = sdk.tokens.mint(
    asset_id="asset-123",
    to_address="0x...",
    amount="1000"
)`,
    };

    const [selectedLanguage, setSelectedLanguage] = useState<'typescript' | 'python'>('typescript');

    const handleCopyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const handleRunPlayground = () => {
        simulateAhoyAction('DATA_CONTRIBUTION', 'AMS');
        showToast('+5 AHOY - Code Executed & Data Contributed!');
    };

    const handlePurchaseLicense = () => {
        simulateAhoyAction('API_LICENSE_PURCHASED', 'AMS');
        showToast('-200 AHOY - Algorithm License Purchased');
    };

    const getMethodColor = (method: string) => {
        switch (method) {
            case 'GET': return 'text-green-400 bg-green-500/10';
            case 'POST': return 'text-blue-400 bg-blue-500/10';
            case 'PUT': return 'text-yellow-400 bg-yellow-500/10';
            case 'DELETE': return 'text-red-400 bg-red-500/10';
            default: return 'text-gray-400 bg-gray-500/10';
        }
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toast notification */}
            {recentAction && (
                <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right fade-in duration-300">
                    <div className={`px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg ${
                        recentAction.startsWith('+')
                            ? 'bg-green-500/20 border-green-500/30 text-green-400'
                            : 'bg-red-500/20 border-red-500/30 text-red-400'
                    }`}>
                        <div className="flex items-center gap-2">
                            <Coins className="w-4 h-4" />
                            <span className="font-medium">{recentAction}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <Code className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">AMS - AHOY Movement Studio</h1>
                        <p className="text-sm text-purple-400 font-medium">Developer APIs, SDKs & Libraries</p>
                    </div>
                </div>

                <AhoyBalanceWidget vertical="AMS" compact />
            </div>

            {/* Token Economics Banner */}
            <div className="glass-card p-4 rounded-xl border border-purple-500/20 bg-purple-900/5 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            <span className="text-sm text-gray-400">Pay-per-call:</span>
                            <span className="text-sm font-bold text-yellow-400">0.005-0.1 AHOY</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-green-400" />
                            <span className="text-sm text-gray-400">Stake for discounts:</span>
                            <span className="text-sm font-bold text-green-400">Up to 60% off</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-cyan-400" />
                            <span className="text-sm text-gray-400">Earn by contributing:</span>
                            <span className="text-sm font-bold text-cyan-400">+5 AHOY/data</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
                {[
                    { id: 'apis', label: 'API Reference', icon: FileJson },
                    { id: 'sdks', label: 'SDKs & Libraries', icon: Package },
                    { id: 'tokenization', label: 'Tokenization', icon: Layers },
                    { id: 'playground', label: 'Playground', icon: Play },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.id
                                ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* APIs Tab */}
                {activeTab === 'apis' && (
                    <>
                        <div className="lg:col-span-2 space-y-4">
                            <div className="glass-card rounded-xl border border-white/5 overflow-hidden">
                                <div className="p-4 border-b border-white/5">
                                    <h3 className="font-bold text-white flex items-center gap-2">
                                        <Globe className="w-5 h-5 text-purple-400" />
                                        REST API Endpoints
                                    </h3>
                                    <p className="text-sm text-gray-400 mt-1">Base URL: https://api.ahoyams.com</p>
                                </div>
                                <div className="divide-y divide-white/5">
                                    {apiEndpoints.map((endpoint, i) => (
                                        <div key={i} className="p-4 hover:bg-white/5 transition-colors">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${getMethodColor(endpoint.method)}`}>
                                                        {endpoint.method}
                                                    </span>
                                                    <code className="text-sm text-white font-mono">{endpoint.path}</code>
                                                </div>
                                                <span className={`text-xs font-mono ${endpoint.cost < 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                    {endpoint.cost < 0 ? `+${Math.abs(endpoint.cost)}` : endpoint.cost} AHOY
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm text-gray-400">{endpoint.description}</p>
                                                <span className="text-xs bg-white/5 px-2 py-0.5 rounded text-gray-500">{endpoint.category}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Quick Start */}
                        <div className="space-y-4">
                            <div className="glass-card p-4 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                    <Terminal className="w-4 h-4 text-green-400" />
                                    Quick Start
                                </h3>
                                <div className="bg-black/40 rounded-lg p-3 font-mono text-xs">
                                    <p className="text-gray-500"># Install SDK</p>
                                    <p className="text-green-400">npm install @ahoy/sdk</p>
                                    <p className="text-gray-500 mt-2"># Set API key</p>
                                    <p className="text-yellow-400">export AHOY_API_KEY="..."</p>
                                </div>
                            </div>

                            <div className="glass-card p-4 rounded-xl border border-yellow-500/20 bg-yellow-900/5">
                                <h3 className="font-bold text-yellow-400 mb-2 flex items-center gap-2">
                                    <Coins className="w-4 h-4" />
                                    Token Economics
                                </h3>
                                <ul className="text-sm text-gray-400 space-y-2">
                                    <li className="flex items-start gap-2">
                                        <ArrowRight className="w-4 h-4 text-yellow-400 mt-0.5" />
                                        Pay AHOY for API calls
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <ArrowRight className="w-4 h-4 text-green-400 mt-0.5" />
                                        Earn AHOY by contributing data
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <ArrowRight className="w-4 h-4 text-purple-400 mt-0.5" />
                                        Stake AHOY for rate limits & discounts
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </>
                )}

                {/* SDKs Tab */}
                {activeTab === 'sdks' && (
                    <>
                        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                            {sdks.map((sdk, i) => (
                                <div key={i} className="glass-card p-4 rounded-xl border border-white/5 hover:border-purple-500/30 transition-all group">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{sdk.icon}</span>
                                            <div>
                                                <h3 className="font-bold text-white">{sdk.name}</h3>
                                                <p className="text-xs text-gray-500">{sdk.language}</p>
                                            </div>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                            sdk.stakingTier === 'Free' ? 'bg-green-500/20 text-green-400' :
                                            sdk.stakingTier === 'Silver' ? 'bg-gray-500/20 text-gray-400' :
                                            'bg-yellow-500/20 text-yellow-400'
                                        }`}>
                                            {sdk.stakingTier}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">v{sdk.version}</span>
                                        <span className="text-gray-400">{sdk.downloads} downloads</span>
                                    </div>
                                    <button className="mt-3 w-full py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-purple-500/50 transition-all flex items-center justify-center gap-2">
                                        <Package className="w-4 h-4" />
                                        Install
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Staking Tiers */}
                        <div className="glass-card p-4 rounded-xl border border-white/5">
                            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-purple-400" />
                                Staking Tiers
                            </h3>
                            <div className="space-y-3">
                                {stakingTiers.map((tier, i) => (
                                    <div key={i} className={`p-3 rounded-lg border ${
                                        tier.name === ahoyState.tier ? 'border-purple-500/50 bg-purple-900/10' : 'border-white/5 bg-black/20'
                                    }`}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-white">{tier.name}</span>
                                            <span className="text-xs text-gray-400">{tier.required} AHOY</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500">
                                            <span>{tier.rateLimit}</span>
                                            <span className="text-green-400">{tier.discount} off</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* Playground Tab */}
                {activeTab === 'playground' && (
                    <>
                        <div className="lg:col-span-2 glass-card rounded-xl border border-white/5 overflow-hidden">
                            <div className="flex border-b border-white/5">
                                <button
                                    onClick={() => setSelectedLanguage('typescript')}
                                    className={`px-4 py-2 text-sm font-medium ${selectedLanguage === 'typescript' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400'}`}
                                >
                                    TypeScript
                                </button>
                                <button
                                    onClick={() => setSelectedLanguage('python')}
                                    className={`px-4 py-2 text-sm font-medium ${selectedLanguage === 'python' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400'}`}
                                >
                                    Python
                                </button>
                            </div>
                            <div className="relative">
                                <pre className="p-4 text-sm font-mono text-gray-300 overflow-x-auto bg-black/40">
                                    <code>{codeExamples[selectedLanguage]}</code>
                                </pre>
                                <button
                                    onClick={() => handleCopyCode(codeExamples[selectedLanguage])}
                                    className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all"
                                >
                                    {copiedCode === codeExamples[selectedLanguage] ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-gray-400" />
                                    )}
                                </button>
                            </div>
                            <div className="p-4 border-t border-white/5 flex justify-between items-center">
                                <p className="text-sm text-gray-400">
                                    Estimated cost: <span className="text-yellow-400 font-mono">0.11 AHOY</span>
                                </p>
                                <button
                                    onClick={handleRunPlayground}
                                    className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-lg transition-all flex items-center gap-2"
                                >
                                    <Play className="w-4 h-4" />
                                    Run Code
                                </button>
                            </div>
                        </div>

                        {/* Output Panel */}
                        <div className="glass-card p-4 rounded-xl border border-white/5">
                            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                <Terminal className="w-4 h-4 text-green-400" />
                                Console Output
                            </h3>
                            <div className="bg-black/40 rounded-lg p-3 font-mono text-xs h-64 overflow-y-auto">
                                <p className="text-gray-500">&gt; Initializing SDK...</p>
                                <p className="text-green-400">&gt; Connected to Polygon network</p>
                                <p className="text-gray-500">&gt; Calling /v1/routing/optimize...</p>
                                <p className="text-cyan-400">&gt; Route calculated: 42km, 35min</p>
                                <p className="text-yellow-400">&gt; Cost: 0.01 AHOY deducted</p>
                                <p className="text-gray-500">&gt; Contributing traffic data...</p>
                                <p className="text-green-400">&gt; Earned: +5 AHOY</p>
                            </div>
                        </div>
                    </>
                )}

                {/* Tokenization Tab */}
                {activeTab === 'tokenization' && (
                    <>
                        <div className="lg:col-span-2 space-y-4">
                            {/* AMS Tokenization Model */}
                            <div className="glass-card p-6 rounded-xl border border-purple-500/20">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-purple-400" />
                                    AMS Tokenization Model
                                </h3>
                                <p className="text-sm text-gray-400 mb-6">
                                    AMS tokenizes APIs, algorithms, and developer contributions. All access is metered in AHOY tokens with transparent on-chain pricing.
                                </p>

                                {/* Token Types */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div className="p-4 bg-pink-500/10 rounded-xl border border-pink-500/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Sparkles className="w-5 h-5 text-pink-400" />
                                            <span className="font-bold text-pink-400">Algorithm NFT</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">ML models and algorithms as tradeable IP assets</p>
                                        <div className="text-xs text-green-400">Earn +100 AHOY per mint</div>
                                    </div>
                                    <div className="p-4 bg-yellow-500/10 rounded-xl border border-yellow-500/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Key className="w-5 h-5 text-yellow-400" />
                                            <span className="font-bold text-yellow-400">License Token</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">Tiered API access licenses with rate limits</p>
                                        <div className="text-xs text-yellow-400">Unlock premium APIs</div>
                                    </div>
                                    <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Globe className="w-5 h-5 text-green-400" />
                                            <span className="font-bold text-green-400">Data Credit</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">Earn by contributing data through playground</p>
                                        <div className="text-xs text-green-400">Earn +5 AHOY per contribution</div>
                                    </div>
                                </div>

                                {/* Tokenization Flow */}
                                <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                                    <h4 className="font-medium text-white mb-3">Algorithm NFT Creation Flow</h4>
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-purple-500/20 rounded-lg flex items-center justify-center">
                                                <Code className="w-5 h-5 text-purple-400" />
                                            </div>
                                            <p className="text-gray-400">Algorithm</p>
                                            <p className="text-gray-500">Development</p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-600" />
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                                <Shield className="w-5 h-5 text-blue-400" />
                                            </div>
                                            <p className="text-gray-400">Verification</p>
                                            <p className="text-gray-500">Testing</p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-600" />
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-pink-500/20 rounded-lg flex items-center justify-center">
                                                <Sparkles className="w-5 h-5 text-pink-400" />
                                            </div>
                                            <p className="text-gray-400">NFT Mint</p>
                                            <p className="text-green-400">+100 AHOY</p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-600" />
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                                                <Coins className="w-5 h-5 text-yellow-400" />
                                            </div>
                                            <p className="text-gray-400">Royalties</p>
                                            <p className="text-yellow-400">Per Use</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* API Usage Stats */}
                            <div className="grid grid-cols-4 gap-4">
                                {[
                                    { label: 'Total Calls', value: '12,847', color: 'purple' },
                                    { label: 'AHOY Spent', value: '128.4', color: 'yellow' },
                                    { label: 'AHOY Earned', value: '245', color: 'green' },
                                    { label: 'Net Cost', value: '-116.6', color: 'green' },
                                ].map((stat, i) => (
                                    <div key={i} className="glass-card p-4 rounded-xl border border-white/5 text-center">
                                        <p className={`text-xl font-bold text-${stat.color}-400`}>{stat.value}</p>
                                        <p className="text-xs text-gray-400">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* AHOY Utility */}
                        <div className="space-y-4">
                            <div className="glass-card p-4 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-3">AHOY Utility in AMS</h3>
                                <div className="space-y-3">
                                    <div className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                                        <p className="text-xs text-gray-400 mb-1">EARN Actions</p>
                                        <ul className="space-y-1 text-sm">
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Mint Algorithm NFT</span>
                                                <span className="text-green-400">+100</span>
                                            </li>
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Data Contribution</span>
                                                <span className="text-green-400">+5</span>
                                            </li>
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">API Royalties</span>
                                                <span className="text-green-400">variable</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                                        <p className="text-xs text-gray-400 mb-1">BURN Actions</p>
                                        <ul className="space-y-1 text-sm">
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">API Call</span>
                                                <span className="text-red-400">-0.01+</span>
                                            </li>
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">License Purchase</span>
                                                <span className="text-red-400">-200</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <AhoyBalanceWidget vertical="AMS" />

                            <AhoyActionButton
                                label="Purchase Algorithm License"
                                points={200}
                                isEarn={false}
                                onClick={handlePurchaseLicense}
                                icon={<Key className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
