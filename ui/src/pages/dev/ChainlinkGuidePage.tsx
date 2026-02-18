import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Radio, BarChart3, ArrowLeftRight, Zap, Clock, Shield,
    Dice6, Cpu, Lock, UserCheck, ExternalLink,
} from 'lucide-react';
import { Breadcrumb } from '../../components/shared/Breadcrumb';
import { CodeBlock } from '../../components/shared/CodeBlock';
import type { LucideIcon } from 'lucide-react';

interface UsedByApp {
    name: string;
    path: string;
    color: string;
}

interface ChainlinkTab {
    id: string;
    label: string;
    icon: LucideIcon;
    description: string;
    useCases: string[];
    configCode: string;
    usageCode: string;
    usedBy: UsedByApp[];
}

const TABS: ChainlinkTab[] = [
    {
        id: 'data-feeds',
        label: 'Data Feeds',
        icon: BarChart3,
        description: 'Real-time price and asset valuation oracles providing on-chain data for NAV calculations, collateral pricing, and settlement values.',
        useCases: [
            'Real-time asset valuation for tokenised real estate',
            'Collateral pricing for DeFi lending against RWAs',
            'Settlement price for prediction market resolution',
            'Automated NAV updates for fund tokens',
        ],
        configCode: `sdk.chainlink.dataFeeds.configure({
  feeds: [
    { pair: 'ETH/USD', heartbeat: 3600 },
    { pair: 'MATIC/USD', heartbeat: 60 },
    { pair: 'DUBAI-RE-INDEX/USD', custom: true },
  ],
  staleness: 3600, // max age in seconds
  fallbackOracle: '0x...backup',
});`,
        usageCode: `// Get latest price
const ethPrice = await sdk.chainlink.dataFeeds.getPrice('ETH/USD');
console.log('ETH:', ethPrice.answer, 'at', ethPrice.updatedAt);

// Use in asset valuation
const nav = await sdk.assets.calculateNAV('asset-001', {
  priceFeed: 'DUBAI-RE-INDEX/USD',
  shares: 1000,
});`,
        usedBy: [
            { name: 'FlightBet', path: '/app/predictions', color: '#F59E0B' },
            { name: 'UseYield', path: '/app/depin', color: '#10B981' },
            { name: 'TravelShield', path: '/app/travelshield', color: '#06B6D4' },
            { name: 'Real Estate', path: '/app/real-estate', color: '#F8B032' },
        ],
    },
    {
        id: 'ccip',
        label: 'CCIP',
        icon: ArrowLeftRight,
        description: 'Cross-Chain Interoperability Protocol enabling secure token transfers and arbitrary messaging between blockchains.',
        useCases: [
            'Cross-chain token transfers (e.g. Polygon → Ethereum)',
            'Multi-chain compliance state synchronisation',
            'Cross-chain governance voting aggregation',
            'Bridge hotel/airline tokens between L2s',
        ],
        configCode: `sdk.chainlink.ccip.configure({
  sourceChain: 'polygon-amoy',
  supportedDestinations: [
    'ethereum-sepolia',
    'avalanche-fuji',
    'arbitrum-sepolia',
  ],
  feeToken: 'LINK', // or 'native'
  gasLimit: 200_000,
});`,
        usageCode: `// Transfer tokens cross-chain
const tx = await sdk.chainlink.ccip.transferToken({
  token: 'asset-001',
  amount: '100',
  to: '0x...recipient',
  destinationChain: 'ethereum-sepolia',
  data: sdk.compliance.encodeTransferCheck(),
});

console.log('CCIP Message ID:', tx.messageId);
const status = await sdk.chainlink.ccip.waitForFinality(tx.messageId);`,
        usedBy: [
            { name: 'TravelShield', path: '/app/travelshield', color: '#06B6D4' },
            { name: 'FlyPlus', path: '/app/flyplus', color: '#0EA5E9' },
        ],
    },
    {
        id: 'functions',
        label: 'Functions',
        icon: Zap,
        description: 'Serverless compute for fetching and processing off-chain data on-chain. Execute custom JavaScript in a decentralised oracle network.',
        useCases: [
            'Fetch flight delay data from aviation APIs',
            'Pull hotel occupancy rates for yield calculation',
            'Verify real estate deed documents off-chain',
            'Process KYC verification results',
        ],
        configCode: `sdk.chainlink.functions.configure({
  subscriptionId: 42,
  donId: 'fun-polygon-amoy-1',
  gasLimit: 300_000,
  secretsUrl: 'https://secrets.example.com/enc',
});`,
        usageCode: `// Execute a Chainlink Function
const result = await sdk.chainlink.functions.execute({
  source: \`
    const flightId = args[0];
    const resp = await Functions.makeHttpRequest({
      url: \\\`https://api.aviation.com/flights/\\\${flightId}\\\`,
    });
    return Functions.encodeString(
      resp.data.status === 'delayed' ? 'DELAYED' : 'ON_TIME'
    );
  \`,
  args: ['EK507'],
  secretsLocation: 'remote',
});

console.log('Flight status:', result.decoded);`,
        usedBy: [
            { name: 'FlightBet', path: '/app/predictions', color: '#F59E0B' },
            { name: 'TravelShield', path: '/app/travelshield', color: '#06B6D4' },
        ],
    },
    {
        id: 'automation',
        label: 'Automation',
        icon: Clock,
        description: 'Time-based and condition-based smart contract automation. Trigger yield distributions, compliance checks, and settlement without manual intervention.',
        useCases: [
            'Automated monthly rental yield distribution',
            'Time-locked escrow release on milestones',
            'Periodic compliance re-verification',
            'Auto-settle prediction markets at expiry',
        ],
        configCode: `sdk.chainlink.automation.configure({
  registryAddress: '0x...registry',
  linkToken: '0x...link',
  minBalance: '5', // LINK
});`,
        usageCode: `// Register an upkeep
const upkeep = await sdk.chainlink.automation.register({
  name: 'Monthly Yield Distribution',
  target: sdk.cashflow.contractAddress,
  checkFunction: 'checkUpkeep',
  performFunction: 'distributeYield',
  interval: 30 * 24 * 60 * 60, // 30 days
  gasLimit: 500_000,
  fundAmount: '10', // LINK
});

console.log('Upkeep ID:', upkeep.id);

// Monitor upkeep
const history = await sdk.chainlink.automation.getHistory(upkeep.id);`,
        usedBy: [
            { name: 'TravelShield', path: '/app/travelshield', color: '#06B6D4' },
            { name: 'UseYield', path: '/app/depin', color: '#10B981' },
            { name: 'Real Estate', path: '/app/real-estate', color: '#F8B032' },
        ],
    },
    {
        id: 'por',
        label: 'PoR',
        icon: Shield,
        description: 'Proof of Reserve provides on-chain verification that tokenised assets are fully backed by their real-world counterparts.',
        useCases: [
            'Verify real estate deed backing property tokens',
            'Attest gold reserves for commodity tokens',
            'Prove stablecoin reserves on-chain',
            'Institutional fund NAV attestation',
        ],
        configCode: `sdk.chainlink.proofOfReserve.configure({
  feedAddress: '0x...porFeed',
  reserveAsset: 'DUBAI-PROPERTY-001',
  updateInterval: 86400, // daily
  threshold: '0.98', // 98% collateralisation ratio
});`,
        usageCode: `// Check reserve status
const reserve = await sdk.chainlink.proofOfReserve.verify('asset-001');
console.log('Backed:', reserve.isFullyBacked);
console.log('Ratio:', reserve.collateralRatio);
console.log('Last verified:', reserve.timestamp);

// Use in compliance check
const canTransfer = await sdk.compliance.checkTransfer({
  asset: 'asset-001',
  requireReserveProof: true,
});`,
        usedBy: [
            { name: 'VaultProof', path: '/app/vaultproof', color: '#8B5CF6' },
            { name: 'Real Estate', path: '/app/real-estate', color: '#F8B032' },
        ],
    },
    {
        id: 'vrf',
        label: 'VRF',
        icon: Dice6,
        description: 'Verifiable Random Function generates provably fair random numbers on-chain, useful for fair allocation, lottery, and selection processes.',
        useCases: [
            'Fair allocation of oversubscribed token offerings',
            'Random audit selection for compliance checks',
            'Lottery-based ticket upgrades for concerts/flights',
            'Random validator selection for governance',
        ],
        configCode: `sdk.chainlink.vrf.configure({
  subscriptionId: 99,
  keyHash: '0x...keyHash',
  callbackGasLimit: 100_000,
  confirmations: 3,
  numWords: 1,
});`,
        usageCode: `// Request random number
const request = await sdk.chainlink.vrf.requestRandom({
  numWords: 1,
  callbackContract: sdk.governance.contractAddress,
});

// Wait for fulfilment
const result = await sdk.chainlink.vrf.waitForFulfilment(request.requestId);
console.log('Random:', result.randomWords[0]);`,
        usedBy: [
            { name: 'Concert', path: '/app/concert', color: '#A855F7' },
            { name: 'FlightBet', path: '/app/predictions', color: '#F59E0B' },
        ],
    },
    {
        id: 'cre',
        label: 'CRE',
        icon: Cpu,
        description: 'Chainlink Runtime Environment allows running custom business logic within the Chainlink DON, enabling complex multi-step oracle workflows.',
        useCases: [
            'Multi-source price aggregation with custom logic',
            'Complex prediction market settlement workflows',
            'Cross-chain compliance verification pipelines',
            'IoT data aggregation and anomaly detection',
        ],
        configCode: `sdk.chainlink.cre.configure({
  workflowId: 'wf-prediction-settle',
  donId: 'cre-polygon-amoy-1',
  triggers: ['cron', 'on-chain-event'],
  capabilities: ['fetch', 'compute', 'consensus', 'write'],
});`,
        usageCode: `// Deploy a CRE workflow
const workflow = await sdk.chainlink.cre.deploy({
  name: 'Flight Delay Settlement',
  steps: [
    { action: 'fetch', config: { url: 'https://api.aviation.com/...' } },
    { action: 'compute', config: { transform: 'parseDelayMinutes' } },
    { action: 'consensus', config: { threshold: '2/3' } },
    { action: 'write', config: { target: 'PredictionMarket.settle()' } },
  ],
});

console.log('Workflow deployed:', workflow.id);`,
        usedBy: [
            { name: 'FlightBet', path: '/app/predictions', color: '#F59E0B' },
        ],
    },
    {
        id: 'deco',
        label: 'DECO',
        icon: Lock,
        description: 'DECO (zkTLS) enables privacy-preserving proofs about off-chain data. Prove facts about bank balances, identity, or documents without revealing the underlying data.',
        useCases: [
            'Prove bank balance exceeds threshold without revealing amount',
            'Verify accredited investor status privately',
            'Attest document authenticity without exposing content',
            'Privacy-preserving KYC verification',
        ],
        configCode: `sdk.chainlink.deco.configure({
  notaryUrl: 'https://deco-notary.chainlink.io',
  supportedSources: [
    'bank-api',
    'identity-provider',
    'document-registry',
  ],
  proofType: 'zk-snark',
});`,
        usageCode: `// Create a privacy-preserving proof
const proof = await sdk.chainlink.deco.proveStatement({
  source: 'bank-api',
  claim: 'balance >= 100000 USD',
  session: await sdk.chainlink.deco.createTLSSession({
    url: 'https://bank.example.com/api/balance',
    headers: { Authorization: 'Bearer ...' },
  }),
});

// Verify on-chain
const verified = await sdk.chainlink.deco.verifyProof(proof);
console.log('Proof valid:', verified.isValid);`,
        usedBy: [
            { name: 'VaultProof', path: '/app/vaultproof', color: '#8B5CF6' },
        ],
    },
    {
        id: 'ccid',
        label: 'CCID',
        icon: UserCheck,
        description: 'Cross-Chain Identity allows portable, verified identities across chains. KYC once, use everywhere across the multi-chain ecosystem.',
        useCases: [
            'Portable KYC across Polygon, Ethereum, Avalanche',
            'Cross-chain whitelist synchronisation',
            'Unified accredited investor status',
            'Multi-chain soulbound credential issuance',
        ],
        configCode: `sdk.chainlink.ccid.configure({
  identityHub: 'polygon-amoy',
  syncChains: ['ethereum-sepolia', 'avalanche-fuji'],
  credentialTypes: ['kyc', 'accredited', 'jurisdiction'],
  autoSync: true,
});`,
        usageCode: `// Issue cross-chain identity
const identity = await sdk.chainlink.ccid.issueCredential({
  subject: '0x...userAddress',
  type: 'kyc-verified',
  jurisdiction: 'UAE',
  expiry: '2026-12-31',
});

// Check identity on another chain
const check = await sdk.chainlink.ccid.verifyCredential({
  subject: '0x...userAddress',
  type: 'kyc-verified',
  chain: 'ethereum-sepolia',
});
console.log('Verified on ETH:', check.isValid);`,
        usedBy: [
            { name: 'VaultProof', path: '/app/vaultproof', color: '#8B5CF6' },
            { name: 'Real Estate', path: '/app/real-estate', color: '#F8B032' },
        ],
    },
];

export function ChainlinkGuidePage() {
    const [activeTab, setActiveTab] = useState('data-feeds');
    const tab = TABS.find(t => t.id === activeTab)!;
    const TabIcon = tab.icon;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
            <Breadcrumb
                items={[
                    { label: 'Develop', path: '/dev/getting-started' },
                    { label: 'Chainlink Integration Guide' },
                ]}
            />

            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#375BD2]/10 flex items-center justify-center">
                        <Radio className="w-5 h-5 text-[#375BD2]" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Chainlink Integration Guide</h1>
                </div>
                <p className="text-gray-400 max-w-2xl">
                    The SDK integrates 9 Chainlink services to power oracle-driven tokenisation.
                    Each service is accessible through a unified API with full TypeScript support.
                </p>
            </div>

            {/* Tab Bar */}
            <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg overflow-x-auto mb-8">
                {TABS.map((t) => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all whitespace-nowrap ${
                                activeTab === t.id
                                    ? 'bg-[#375BD2] text-white font-medium'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            <span className="text-sm">{t.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="space-y-8">
                {/* Description */}
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#375BD2]/10 flex items-center justify-center shrink-0">
                            <TabIcon className="w-6 h-6 text-[#375BD2]" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white mb-2">{tab.label}</h2>
                            <p className="text-gray-400 leading-relaxed">{tab.description}</p>
                        </div>
                    </div>
                </div>

                {/* Use Cases */}
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-4">Use Cases</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {tab.useCases.map((uc, i) => (
                            <div
                                key={i}
                                className="flex items-start gap-3 p-4 rounded-xl border border-white/5 bg-white/[0.02]"
                            >
                                <div className="w-6 h-6 rounded-full bg-[#375BD2]/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="text-xs font-bold text-[#375BD2]">{i + 1}</span>
                                </div>
                                <p className="text-sm text-gray-300">{uc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Code Snippets */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">Configuration</p>
                        <CodeBlock code={tab.configCode} language="typescript" />
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">Usage</p>
                        <CodeBlock code={tab.usageCode} language="typescript" />
                    </div>
                </div>

                {/* Used By */}
                {tab.usedBy.length > 0 && (
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">Used By</p>
                        <div className="flex flex-wrap gap-2">
                            {tab.usedBy.map((app) => (
                                <Link
                                    key={app.name}
                                    to={app.path}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                                >
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: app.color }}
                                    />
                                    <span className="text-sm text-gray-300">{app.name}</span>
                                    <ExternalLink className="w-3 h-3 text-gray-600" />
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
