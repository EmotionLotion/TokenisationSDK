import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Layers, Box, Shield, Radio, Lock, Cpu, Banknote,
    ChevronDown, ChevronRight, ArrowRight, Coins, Vote,
    Award, Wallet, Flame, Key, Globe, FileText, Zap,
    Database, Link2, Settings, BarChart3,
} from 'lucide-react';
import { Breadcrumb } from '../../components/shared/Breadcrumb';
import { CodeBlock } from '../../components/shared/CodeBlock';
import type { LucideIcon } from 'lucide-react';

interface LayerItem {
    name: string;
    description: string;
    link?: string;
}

interface ArchLayer {
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
    color: string;
    items: LayerItem[];
    link?: string;
}

const LAYERS: ArchLayer[] = [
    {
        id: 'asset-packs',
        icon: Box,
        title: 'Asset Packs',
        description: 'Pre-configured tokenisation blueprints for 6 industry verticals',
        color: '#F8B032',
        link: '/',
        items: [
            { name: 'Real Estate', description: 'Fractional ownership, rental yield, RERA compliance', link: '/app/real-estate' },
            { name: 'Airline (Fly+)', description: 'Loyalty miles, upgrades, flight credits', link: '/app/flyplus' },
            { name: 'Hotel', description: 'Room-night tokens, loyalty programs', link: '/app/hotel' },
            { name: 'Concert', description: 'Event tickets, VIP passes, royalty splits', link: '/app/concert' },
            { name: 'Car Rental', description: 'Fleet tokens, usage-based access', link: '/app/car-rental' },
            { name: 'Institutional', description: 'Bonds, equities, structured products', link: '/demo/institutional' },
        ],
    },
    {
        id: 'compliance',
        icon: Shield,
        title: 'Compliance Engine',
        description: 'Regulatory layer ensuring every token operation meets jurisdictional requirements',
        color: '#3B82F6',
        link: '/policies',
        items: [
            { name: 'KYC / AML', description: 'Identity verification with pluggable providers', link: '/identities' },
            { name: 'Policy Studio', description: 'Visual rule builder for transfer restrictions', link: '/policies' },
            { name: 'Jurisdiction Manager', description: 'Per-region compliance rule sets (UAE, EU, US)', link: '/policies' },
            { name: 'Transfer Restrictions', description: 'Lock-up periods, whitelist/blacklist enforcement', link: '/policies' },
        ],
    },
    {
        id: 'chainlink',
        icon: Radio,
        title: 'Chainlink Integrations',
        description: '9 Chainlink services deeply integrated for oracle-powered tokenisation',
        color: '#375BD2',
        link: '/dev/chainlink',
        items: [
            { name: 'Data Feeds', description: 'Real-time price and asset valuation oracles', link: '/dev/chainlink' },
            { name: 'CCIP', description: 'Cross-chain token transfers and messaging', link: '/dev/chainlink' },
            { name: 'Functions', description: 'Serverless compute for off-chain data', link: '/dev/chainlink' },
            { name: 'Automation', description: 'Time/condition-based contract execution', link: '/dev/chainlink' },
            { name: 'Proof of Reserve', description: 'On-chain reserve attestation', link: '/dev/chainlink' },
            { name: 'VRF', description: 'Verifiable random number generation', link: '/dev/chainlink' },
            { name: 'CRE', description: 'Chainlink Runtime Environment for custom logic', link: '/dev/chainlink' },
            { name: 'DECO', description: 'Privacy-preserving data attestation (zkTLS)', link: '/dev/chainlink' },
            { name: 'CCID', description: 'Cross-chain identity verification', link: '/dev/chainlink' },
        ],
    },
    {
        id: 'custody',
        icon: Lock,
        title: 'Custody & Wallets',
        description: 'Enterprise-grade key management with pluggable custody adapters',
        color: '#8B5CF6',
        link: '/settings',
        items: [
            { name: 'Fireblocks', description: 'Institutional MPC custody integration', link: '/settings' },
            { name: 'Multi-Sig', description: 'Gnosis Safe / multi-signature wallet support', link: '/settings' },
            { name: 'Hot Wallet', description: 'Browser wallet (MetaMask) for development', link: '/settings' },
            { name: 'Vault Config', description: 'Per-asset vault and signer configuration', link: '/settings' },
        ],
    },
    {
        id: 'modules',
        icon: Cpu,
        title: 'SDK Modules',
        description: 'Composable on-chain modules for asset lifecycle management',
        color: '#10B981',
        items: [
            { name: 'Staking', description: 'Lock tokens for yield and governance weight', link: '/staking' },
            { name: 'CashFlow', description: 'Automated dividend and rental yield distribution', link: '/cashflow' },
            { name: 'Governance', description: 'On-chain voting for token holder decisions', link: '/governance' },
            { name: 'Escrow', description: 'Conditional release of funds on milestones', link: '/escrow' },
            { name: 'Soulbound', description: 'Non-transferable credential and compliance tokens', link: '/soulbound' },
        ],
    },
    {
        id: 'payments',
        icon: Banknote,
        title: 'Payments',
        description: 'Fiat on/off ramps and token payment infrastructure',
        color: '#EC4899',
        items: [
            { name: 'x402 Protocol', description: 'HTTP 402 payment-required API monetisation', link: '/dev/api' },
            { name: 'Fiat Bridge', description: 'Stripe/bank transfer to stablecoin conversion', link: '/payouts' },
            { name: 'Royalty Engine', description: 'Automatic creator/issuer royalty on secondary sales', link: '/dev/guides' },
        ],
    },
];

const FLOW_STEPS = [
    { label: 'Client App', icon: Globe, color: '#F8B032' },
    { label: 'SDK', icon: Layers, color: '#10B981' },
    { label: 'Compliance', icon: Shield, color: '#3B82F6' },
    { label: 'Chainlink', icon: Radio, color: '#375BD2' },
    { label: 'Chain', icon: Database, color: '#8B5CF6' },
];

const SDK_INIT_CODE = `import { TokenisationSDK } from '@ahoy/tokenisation-sdk';

const sdk = new TokenisationSDK({
  environment: 'testnet',
  chain: 'polygon-amoy',
  custody: {
    adapter: 'fireblocks',
    vaultId: 'vault-001',
  },
  compliance: {
    jurisdiction: 'UAE',
    kycProvider: 'sumsub',
    mode: 'strict',
  },
  chainlink: {
    dataFeeds: true,
    ccip: true,
    automation: true,
    functions: true,
  },
});

await sdk.init();
console.log('SDK ready:', sdk.version);`;

export function ArchitecturePage() {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggle = (id: string) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
            <Breadcrumb
                items={[
                    { label: 'Develop', path: '/dev/getting-started' },
                    { label: 'Architecture' },
                ]}
            />

            {/* Header */}
            <div className="mb-10">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F8B032]/10 flex items-center justify-center">
                        <Layers className="w-5 h-5 text-[#F8B032]" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">SDK Architecture</h1>
                </div>
                <p className="text-gray-400 max-w-2xl">
                    The TokenisationSDK is a layered architecture that composes compliance, oracles,
                    custody, and on-chain modules into a unified API for real-world asset tokenisation.
                </p>
            </div>

            {/* Data Flow Diagram */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 mb-10">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-5">Data Flow</p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                    {FLOW_STEPS.map((step, i) => {
                        const Icon = step.icon;
                        return (
                            <div key={step.label} className="flex items-center gap-2">
                                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03]">
                                    <Icon className="w-4 h-4" style={{ color: step.color }} />
                                    <span className="text-sm font-medium text-white">{step.label}</span>
                                </div>
                                {i < FLOW_STEPS.length - 1 && (
                                    <ArrowRight className="w-4 h-4 text-gray-600 shrink-0" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Layer Cards */}
            <div className="space-y-3 mb-10">
                {LAYERS.map((layer) => {
                    const Icon = layer.icon;
                    const isOpen = expanded[layer.id] ?? false;
                    return (
                        <div
                            key={layer.id}
                            className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-all duration-300"
                        >
                            <button
                                onClick={() => toggle(layer.id)}
                                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors"
                            >
                                <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: `${layer.color}15` }}
                                >
                                    <Icon className="w-5 h-5" style={{ color: layer.color }} />
                                </div>
                                <div className="flex-1 text-left">
                                    <p className="text-sm font-medium text-white">{layer.title}</p>
                                    <p className="text-xs text-gray-500">{layer.description}</p>
                                </div>
                                <span className="text-xs text-gray-600 mr-2">{layer.items.length} components</span>
                                {isOpen ? (
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                )}
                            </button>

                            {isOpen && (
                                <div className="border-t border-white/5 px-5 py-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {layer.items.map((item) => (
                                            <Link
                                                key={item.name}
                                                to={item.link || '#'}
                                                className="group flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] hover:border-white/10 transition-all"
                                            >
                                                <div
                                                    className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                                                    style={{ backgroundColor: layer.color }}
                                                />
                                                <div>
                                                    <p className="text-sm text-white font-medium">{item.name}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                    {layer.link && (
                                        <div className="mt-4 pt-3 border-t border-white/5">
                                            <Link
                                                to={layer.link}
                                                className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                                                style={{ color: layer.color }}
                                            >
                                                Explore {layer.title}
                                                <ArrowRight className="w-3 h-3" />
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* SDK Init Example */}
            <div className="mb-10">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-4">Quick Start</p>
                <CodeBlock code={SDK_INIT_CODE} language="typescript" />
            </div>
        </div>
    );
}
