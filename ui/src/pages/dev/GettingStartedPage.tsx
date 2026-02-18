import { Link } from 'react-router-dom';
import {
    Rocket, Package, Settings, Box, Search, Building2, Plane,
    Hotel, Music, Car, ArrowRight, Bug, Code2, BookOpen, FileText
} from 'lucide-react';
import { Breadcrumb } from '../../components/shared/Breadcrumb';
import { CodeBlock } from '../../components/shared/CodeBlock';

const USE_CASES = [
    { label: 'Real Estate', icon: Building2, path: '/app/real-estate', color: 'text-blue-400 bg-blue-400/10' },
    { label: 'Airline', icon: Plane, path: '/app/flyplus', color: 'text-sky-400 bg-sky-400/10' },
    { label: 'Hotel', icon: Hotel, path: '/app/hotel', color: 'text-amber-400 bg-amber-400/10' },
    { label: 'Concert', icon: Music, path: '/app/concert', color: 'text-purple-400 bg-purple-400/10' },
    { label: 'Car Rental', icon: Car, path: '/app/car-rental', color: 'text-green-400 bg-green-400/10' },
];

const NEXT_STEPS = [
    { label: 'API Reference', description: 'Explore all endpoints', icon: FileText, path: '/dev/api' },
    { label: 'Playground', description: 'Try live code editing', icon: Code2, path: '/dev/playground' },
    { label: 'Debugger', description: 'Inspect state changes', icon: Bug, path: '/dev/debugger' },
    { label: 'SDK Guides', description: 'In-depth component docs', icon: BookOpen, path: '/dev/guides' },
];

export function GettingStartedPage() {
    return (
        <div className="space-y-8 animate-fadeIn max-w-4xl">
            <Breadcrumb items={[
                { label: 'Develop', path: '/dev/getting-started' },
                { label: 'Getting Started' }
            ]} />

            {/* Hero */}
            <div className="glass-card p-8 border border-[#F8B032]/20 bg-gradient-to-br from-[#F8B032]/5 to-transparent">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-[#F8B032]/10 rounded-xl">
                        <Rocket className="w-8 h-8 text-[#F8B032]" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white">Welcome to TokenisationSDK</h1>
                        <p className="text-gray-400 mt-1">Get started with tokenising real-world assets in minutes.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                    <span className="px-3 py-1 bg-yellow-500/10 text-yellow-400 text-xs font-medium rounded-full flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        Sandbox Environment
                    </span>
                </div>
            </div>

            {/* Step 1: Install */}
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#F8B032] text-black flex items-center justify-center text-sm font-bold">1</div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Package className="w-5 h-5 text-gray-400" />
                        Install the SDK
                    </h2>
                </div>
                <CodeBlock
                    tabs={[
                        { label: 'npm', code: 'npm install @ahoy/tokenisation-sdk' },
                        { label: 'yarn', code: 'yarn add @ahoy/tokenisation-sdk' },
                        { label: 'pnpm', code: 'pnpm add @ahoy/tokenisation-sdk' },
                    ]}
                />
            </div>

            {/* Step 2: Initialize */}
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#F8B032] text-black flex items-center justify-center text-sm font-bold">2</div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Settings className="w-5 h-5 text-gray-400" />
                        Initialize the SDK
                    </h2>
                </div>
                <CodeBlock
                    language="typescript"
                    code={`import { TokenisationSDK } from '@ahoy/tokenisation-sdk';

const sdk = new TokenisationSDK({
  apiKey: 'pk_live_ahoy_your_publishable_key',
  environment: 'sandbox',
  jurisdiction: 'AE',
});

await sdk.init();
console.log('SDK ready:', sdk.isInitialized());`}
                />
            </div>

            {/* Step 3: Create First Asset */}
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#F8B032] text-black flex items-center justify-center text-sm font-bold">3</div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Box className="w-5 h-5 text-gray-400" />
                        Create Your First Asset
                    </h2>
                </div>
                <CodeBlock
                    language="typescript"
                    code={`const asset = await sdk.assets.create({
  name: 'Marina Tower Unit 2501',
  rightType: 'OWNERSHIP',
  jurisdiction: 'AE',
  metadata: {
    propertyType: 'residential',
    location: 'Dubai Marina',
    valuation: 2_500_000,
  },
});

console.log('Asset created:', asset.id);
// asset_01HQXYZ...`}
                />
                <Link
                    to="/dev/playground"
                    className="inline-flex items-center gap-2 text-sm text-[#F8B032] hover:text-[#E8A633] transition-colors"
                >
                    <Code2 className="w-4 h-4" />
                    Try in Playground
                    <ArrowRight className="w-3 h-3" />
                </Link>
            </div>

            {/* Step 4: Verify */}
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#F8B032] text-black flex items-center justify-center text-sm font-bold">4</div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Search className="w-5 h-5 text-gray-400" />
                        Verify with Debugger
                    </h2>
                </div>
                <p className="text-gray-400 text-sm">
                    Use the Time-Travel Debugger to inspect state snapshots and verify your asset was created correctly.
                </p>
                <Link
                    to="/dev/debugger"
                    className="inline-flex items-center gap-2 text-sm text-[#F8B032] hover:text-[#E8A633] transition-colors"
                >
                    <Bug className="w-4 h-4" />
                    Open Debugger
                    <ArrowRight className="w-3 h-3" />
                </Link>
            </div>

            {/* Use Case Quick Links */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Explore Use Cases</h2>
                <div className="grid grid-cols-5 gap-3">
                    {USE_CASES.map((uc) => {
                        const Icon = uc.icon;
                        return (
                            <Link
                                key={uc.label}
                                to={uc.path}
                                className="glass-card p-4 text-center hover:border-white/20 transition-all group"
                            >
                                <div className={`w-10 h-10 rounded-lg ${uc.color} flex items-center justify-center mx-auto mb-2`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{uc.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Next Steps */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Next Steps</h2>
                <div className="grid grid-cols-2 gap-4">
                    {NEXT_STEPS.map((step) => {
                        const Icon = step.icon;
                        return (
                            <Link
                                key={step.label}
                                to={step.path}
                                className="glass-card p-4 flex items-center gap-4 hover:border-[#F8B032]/20 transition-all group"
                            >
                                <div className="p-2 bg-white/5 rounded-lg">
                                    <Icon className="w-5 h-5 text-gray-400 group-hover:text-[#F8B032] transition-colors" />
                                </div>
                                <div>
                                    <h3 className="font-medium text-white">{step.label}</h3>
                                    <p className="text-xs text-gray-500">{step.description}</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-gray-600 ml-auto group-hover:text-[#F8B032] transition-colors" />
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
