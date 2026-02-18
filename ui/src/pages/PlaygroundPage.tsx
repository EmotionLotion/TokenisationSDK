import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Code2, Bug, ArrowRight, Box, Shield, Repeat, Coins, FileCheck } from 'lucide-react';
import { Breadcrumb } from '../components/shared/Breadcrumb';
import { SandpackPlayground } from '../components/playground/SandpackPlayground';
import { ShowcaseConfigEditor } from '../components/playground/ShowcaseConfigEditor';
import { CodeSnippetGenerator } from '../components/playground/CodeSnippetGenerator';
import type { ShowcaseConfig } from '../components/showcases/types';

const SDK_SHOWCASES: ShowcaseConfig[] = [
  {
    id: 'assets',
    name: 'Asset Management',
    shortName: 'Assets',
    description: 'Create, configure, and manage tokenised assets',
    color: 'amber',
    icon: <Box className="w-4 h-4" />,
    steps: [
      {
        id: '1',
        title: 'Create Asset',
        description: 'Register a new tokenised asset with metadata',
        code: `const asset = await sdk.assets.create({
  name: 'My Tokenised Asset',
  rightType: 'OWNERSHIP',
  jurisdiction: 'AE',
  metadata: { category: 'equity' },
});
console.log('Created:', asset.id);`,
      },
      {
        id: '2',
        title: 'Configure Asset Pack',
        description: 'Apply an asset pack template for compliance rules',
        code: `const pack = await sdk.assets.applyPack(asset.id, {
  packId: 'erc3643-equity',
  params: { maxHolders: 500, lockupDays: 90 },
});
console.log('Pack applied:', pack.name);`,
      },
      {
        id: '3',
        title: 'Mint Tokens',
        description: 'Mint tokens for the asset and assign to an identity',
        code: `const mint = await sdk.tokens.mint({
  assetId: asset.id,
  to: investorIdentity.address,
  amount: '1000',
});
console.log('Minted:', mint.txHash);`,
      },
    ],
  },
  {
    id: 'compliance',
    name: 'Compliance Engine',
    shortName: 'Compliance',
    description: 'KYC, AML, and regulatory compliance workflows',
    color: 'sky',
    icon: <Shield className="w-4 h-4" />,
    steps: [
      {
        id: '1',
        title: 'Create Identity',
        description: 'Register an on-chain identity for KYC',
        code: `const identity = await sdk.identities.create({
  type: 'INDIVIDUAL',
  country: 'AE',
  claims: [{ topic: 'KYC', data: '0x...' }],
});
console.log('Identity:', identity.address);`,
      },
      {
        id: '2',
        title: 'Run Compliance Check',
        description: 'Pre-flight compliance check before a transfer',
        code: `const check = await sdk.compliance.preflight({
  assetId: asset.id,
  from: sender.address,
  to: receiver.address,
  amount: '100',
});
console.log('Eligible:', check.eligible);
console.log('Rules:', check.rules);`,
      },
      {
        id: '3',
        title: 'Manage Allowlist',
        description: 'Add or remove addresses from compliance allowlist',
        code: `await sdk.compliance.allowlist.add({
  assetId: asset.id,
  addresses: [investor1, investor2],
  reason: 'Accredited investor verification',
});
console.log('Allowlist updated');`,
      },
    ],
  },
  {
    id: 'transfers',
    name: 'Token Transfers',
    shortName: 'Transfers',
    description: 'Transfer tokens with compliance enforcement',
    color: 'purple',
    icon: <Repeat className="w-4 h-4" />,
    steps: [
      {
        id: '1',
        title: 'Transfer Tokens',
        description: 'Execute a compliant token transfer',
        code: `const transfer = await sdk.transfers.execute({
  assetId: asset.id,
  from: sender.address,
  to: receiver.address,
  amount: '50',
});
console.log('Transfer:', transfer.txHash);
console.log('Status:', transfer.status);`,
      },
      {
        id: '2',
        title: 'Freeze Tokens',
        description: 'Regulatory hold on an address',
        code: `await sdk.transfers.freeze({
  assetId: asset.id,
  address: suspectAddress,
  reason: 'Pending investigation',
});
console.log('Address frozen');`,
      },
    ],
  },
  {
    id: 'distributions',
    name: 'Yield & Distributions',
    shortName: 'Distributions',
    description: 'Schedule and execute dividend distributions',
    color: 'rose',
    icon: <Coins className="w-4 h-4" />,
    steps: [
      {
        id: '1',
        title: 'Schedule Distribution',
        description: 'Create a dividend distribution schedule',
        code: `const dist = await sdk.distributions.schedule({
  assetId: asset.id,
  amount: '50000',
  currency: 'USDC',
  snapshotDate: '2025-03-01',
  paymentDate: '2025-03-15',
});
console.log('Distribution:', dist.id);`,
      },
      {
        id: '2',
        title: 'Execute Distribution',
        description: 'Process payments to all token holders',
        code: `const result = await sdk.distributions.execute(dist.id);
console.log('Paid:', result.recipientCount, 'holders');
console.log('Total:', result.totalPaid, 'USDC');`,
      },
    ],
  },
  {
    id: 'audit',
    name: 'Audit & Events',
    shortName: 'Audit',
    description: 'Query audit trails and event streams',
    color: 'emerald',
    icon: <FileCheck className="w-4 h-4" />,
    steps: [
      {
        id: '1',
        title: 'Query Audit Trail',
        description: 'Retrieve immutable audit history for an asset',
        code: `const trail = await sdk.audit.query({
  assetId: asset.id,
  from: '2025-01-01',
  limit: 50,
});
trail.events.forEach(e =>
  console.log(e.timestamp, e.action, e.actor)
);`,
      },
      {
        id: '2',
        title: 'Subscribe to Events',
        description: 'Real-time event stream for compliance monitoring',
        code: `const unsub = sdk.events.subscribe({
  assetId: asset.id,
  types: ['TRANSFER', 'MINT', 'FREEZE'],
}, (event) => {
  console.log('Event:', event.type, event.data);
});

// Later: unsub();`,
      },
    ],
  },
];

const DEFAULT_CODE = `import sdk from './sdk-setup';

export default function App() {
  const handleCreateAsset = async () => {
    const asset = await sdk.assets.create({
      name: 'My Tokenised Asset',
      rightType: 'OWNERSHIP',
      jurisdiction: 'AE',
    });
    console.log('Created:', asset);
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h2>TokenisationSDK Playground</h2>
      <p>Edit this code to experiment with the SDK.</p>
      <button
        onClick={handleCreateAsset}
        style={{
          padding: '10px 20px',
          background: '#F8B032',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 'bold',
          marginTop: 12,
        }}
      >
        Create Asset
      </button>
    </div>
  );
}
`;

export function PlaygroundPage() {
  const [activeShowcase, setActiveShowcase] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  const showcase = SDK_SHOWCASES[activeShowcase];
  const step = showcase.steps[activeStep] || showcase.steps[0];

  const playgroundCode = step
    ? `// ${showcase.name} — Step ${step.id}: ${step.title}
// ${step.description}

import sdk from './sdk-setup';

export default function App() {
  const run = async () => {
    ${step.code.split('\n').map(l => '    ' + l).join('\n')}
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h2>${step.title}</h2>
      <p style={{ color: '#888' }}>${step.description}</p>
      <button
        onClick={run}
        style={{
          padding: '10px 20px',
          background: '#F8B032',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 'bold',
          marginTop: 12,
        }}
      >
        Run Step
      </button>
    </div>
  );
}
`
    : DEFAULT_CODE;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Breadcrumb items={[
        { label: 'Develop', path: '/dev/getting-started' },
        { label: 'Playground' }
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Code2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Interactive Playground</h1>
            <p className="text-sm text-gray-400">Live-edit SDK code with instant preview</p>
          </div>
        </div>
        <Link
          to="/dev/debugger"
          className="flex items-center gap-2 text-sm text-[#F8B032] hover:text-[#E8A633] transition-colors"
        >
          <Bug className="w-4 h-4" />
          Open in Debugger
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* SDK Module Tabs */}
      <div className="glass-card rounded-xl overflow-hidden p-2 flex flex-wrap gap-1">
        {SDK_SHOWCASES.map((sc, idx) => (
          <button
            key={sc.id}
            onClick={() => {
              setActiveShowcase(idx);
              setActiveStep(0);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all text-sm font-medium border ${
              idx === activeShowcase
                ? 'bg-primary/20 text-primary border-primary/30'
                : 'bg-transparent text-gray-400 border-transparent hover:bg-white/5 hover:text-white'
            }`}
          >
            {sc.icon}
            <span className="hidden sm:inline">{sc.shortName || sc.name}</span>
          </button>
        ))}
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Col 1: Showcase Config */}
        <div className="lg:col-span-3 glass-card rounded-xl border border-white/10 p-4">
          <ShowcaseConfigEditor
            config={showcase}
            activeStep={activeStep}
            onStepSelect={setActiveStep}
          />
        </div>

        {/* Col 2: Sandpack Editor + Preview */}
        <div className="lg:col-span-6">
          <SandpackPlayground
            initialCode={playgroundCode}
            showcaseId={showcase.id}
          />
        </div>

        {/* Col 3: Code Snippet */}
        <div className="lg:col-span-3 space-y-4">
          <CodeSnippetGenerator step={step} />
        </div>
      </div>
    </div>
  );
}
