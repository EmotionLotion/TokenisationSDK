/**
 * LibraryPage — Catalog of all ui-kit components with live preview,
 * props table, and View Code + Copy buttons.
 */

import { useState } from 'react';
import { Library, Eye, Code2, Copy, Check } from 'lucide-react';

// ============================================================================
// COMPONENT CATALOG
// ============================================================================

interface CatalogEntry {
  name: string;
  category: 'atom' | 'component' | 'template';
  description: string;
  props: { name: string; type: string; required: boolean; description: string }[];
  preview: () => React.ReactNode;
  code: string;
}

const CATALOG: CatalogEntry[] = [
  {
    name: 'StatusBadge',
    category: 'atom',
    description: 'Displays asset lifecycle status with color coding.',
    props: [
      { name: 'status', type: 'LifecycleState', required: true, description: 'Current lifecycle state' },
      { name: 'size', type: '"sm" | "md" | "lg"', required: false, description: 'Badge size variant' },
    ],
    preview: () => (
      <div className="flex gap-2 flex-wrap">
        {['DRAFT', 'ACTIVE', 'VERIFIED', 'FROZEN'].map(s => (
          <span key={s} className={`px-2 py-1 rounded-full text-xs font-bold ${
            s === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
            s === 'VERIFIED' ? 'bg-blue-500/20 text-blue-400' :
            s === 'FROZEN' ? 'bg-cyan-500/20 text-cyan-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>{s}</span>
        ))}
      </div>
    ),
    code: `import { StatusBadge } from '@tokenisation/ui-kit';

<StatusBadge status="ACTIVE" size="md" />`,
  },
  {
    name: 'TokenAmount',
    category: 'atom',
    description: 'Renders a formatted token amount with symbol.',
    props: [
      { name: 'amount', type: 'string', required: true, description: 'Raw token amount' },
      { name: 'symbol', type: 'string', required: false, description: 'Token symbol (default: "TKN")' },
      { name: 'decimals', type: 'number', required: false, description: 'Decimal places (default: 2)' },
    ],
    preview: () => (
      <div className="flex gap-4">
        <span className="text-2xl font-bold text-white">1,500 <span className="text-primary text-sm">TKN</span></span>
        <span className="text-2xl font-bold text-white">0.05 <span className="text-green-400 text-sm">ETH</span></span>
      </div>
    ),
    code: `import { TokenAmount } from '@tokenisation/ui-kit';

<TokenAmount amount="1500" symbol="TKN" />`,
  },
  {
    name: 'ComplianceBadge',
    category: 'atom',
    description: 'Shows compliance check result (passed/failed/pending).',
    props: [
      { name: 'status', type: '"passed" | "failed" | "pending"', required: true, description: 'Compliance status' },
      { name: 'label', type: 'string', required: false, description: 'Custom label text' },
    ],
    preview: () => (
      <div className="flex gap-2">
        <span className="px-2 py-1 rounded text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">KYC PASSED</span>
        <span className="px-2 py-1 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">AML FAILED</span>
        <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">PENDING</span>
      </div>
    ),
    code: `import { ComplianceBadge } from '@tokenisation/ui-kit';

<ComplianceBadge status="passed" label="KYC" />`,
  },
  {
    name: 'GenericAssetCard',
    category: 'component',
    description: 'Universal asset card supporting any asset type via templates.',
    props: [
      { name: 'asset', type: 'AssetInstance', required: true, description: 'Asset data with template' },
      { name: 'onClick', type: '() => void', required: false, description: 'Card click handler' },
      { name: 'compact', type: 'boolean', required: false, description: 'Compact display mode' },
    ],
    preview: () => (
      <div className="max-w-sm p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold">RE</div>
          <div>
            <p className="text-sm font-bold text-white">Marina Tower Unit 1204</p>
            <p className="text-xs text-gray-400">Real Estate</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white/5 p-2 rounded"><span className="text-gray-500">Value</span><br/><span className="text-white font-bold">$2.5M</span></div>
          <div className="bg-white/5 p-2 rounded"><span className="text-gray-500">Yield</span><br/><span className="text-green-400 font-bold">7.5%</span></div>
        </div>
      </div>
    ),
    code: `import { GenericAssetCard } from '@tokenisation/ui-kit';

<GenericAssetCard
  asset={myAsset}
  onClick={() => console.log('clicked')}
/>`,
  },
  {
    name: 'ActionStation',
    category: 'component',
    description: 'Action buttons panel that adapts to asset state and user permissions.',
    props: [
      { name: 'asset', type: 'AssetInstance', required: true, description: 'Target asset' },
      { name: 'onAction', type: '(action: string) => void', required: true, description: 'Action handler' },
      { name: 'disabled', type: 'boolean', required: false, description: 'Disable all actions' },
    ],
    preview: () => (
      <div className="flex gap-2">
        <button className="px-3 py-2 bg-primary/20 text-primary rounded-lg text-xs font-bold border border-primary/30">Mint</button>
        <button className="px-3 py-2 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold border border-green-500/30">Transfer</button>
        <button className="px-3 py-2 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold border border-purple-500/30">Burn</button>
      </div>
    ),
    code: `import { ActionStation } from '@tokenisation/ui-kit';

<ActionStation
  asset={myAsset}
  onAction={(action) => console.log(action)}
/>`,
  },
  {
    name: 'InvestmentFlow',
    category: 'template',
    description: 'Full investment wizard flow: KYC check, amount selection, confirmation, settlement.',
    props: [
      { name: 'asset', type: 'AssetInstance', required: true, description: 'Asset to invest in' },
      { name: 'onComplete', type: '(result) => void', required: true, description: 'Completion callback' },
    ],
    preview: () => (
      <div className="p-4 bg-white/5 rounded-xl border border-white/10 max-w-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">1</div>
          <span className="text-sm text-white font-medium">Select Investment Amount</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full mb-3"><div className="h-full w-1/3 bg-primary rounded-full" /></div>
        <p className="text-xs text-gray-500">Step 1 of 4 — KYC verification required</p>
      </div>
    ),
    code: `import { InvestmentFlow } from '@tokenisation/ui-kit';

<InvestmentFlow
  asset={myAsset}
  onComplete={(result) => console.log(result)}
/>`,
  },
];

// ============================================================================
// COPY BUTTON
// ============================================================================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'atom', label: 'Atoms' },
  { id: 'component', label: 'Components' },
  { id: 'template', label: 'Templates' },
];

export function LibraryPage() {
  const [category, setCategory] = useState<string>('all');
  const [showCode, setShowCode] = useState<Set<string>>(new Set());

  const filtered = category === 'all' ? CATALOG : CATALOG.filter(c => c.category === category);

  const toggleCode = (name: string) => {
    setShowCode(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
          <Library className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Component Library</h1>
          <p className="text-sm text-gray-400">All ui-kit components with live preview and code snippets</p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              category === cat.id
                ? 'bg-primary/20 text-primary border-primary/30'
                : 'bg-transparent text-gray-400 border-transparent hover:bg-white/5'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Component grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map(entry => (
          <div key={entry.name} className="glass-card rounded-xl border border-white/10 overflow-hidden">
            {/* Component header */}
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">{entry.name}</h3>
                <p className="text-xs text-gray-500">{entry.description}</p>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                entry.category === 'atom' ? 'bg-blue-500/20 text-blue-400' :
                entry.category === 'component' ? 'bg-green-500/20 text-green-400' :
                'bg-purple-500/20 text-purple-400'
              }`}>
                {entry.category}
              </span>
            </div>

            {/* Preview */}
            <div className="p-4 bg-[#0a0a1a]/50 min-h-[80px] flex items-center">
              {entry.preview()}
            </div>

            {/* Props table */}
            <div className="px-4 py-2 border-t border-white/5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-1 font-medium">Prop</th>
                    <th className="text-left py-1 font-medium">Type</th>
                    <th className="text-left py-1 font-medium">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.props.map(p => (
                    <tr key={p.name} className="border-t border-white/5">
                      <td className="py-1 text-primary font-mono">{p.name}</td>
                      <td className="py-1 text-gray-400 font-mono">{p.type}</td>
                      <td className="py-1">
                        {p.required ? <span className="text-red-400">*</span> : <span className="text-gray-600">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="px-4 py-2 border-t border-white/10 flex items-center gap-2">
              <button
                onClick={() => toggleCode(entry.name)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
              >
                <Code2 className="w-3.5 h-3.5" />
                {showCode.has(entry.name) ? 'Hide Code' : 'View Code'}
              </button>
              <CopyButton text={entry.code} />
            </div>

            {/* Code */}
            {showCode.has(entry.name) && (
              <div className="px-4 pb-3">
                <pre className="bg-[#0d1117] rounded p-3 text-[10px] text-gray-400 font-mono whitespace-pre-wrap border border-white/5">
                  {entry.code}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
