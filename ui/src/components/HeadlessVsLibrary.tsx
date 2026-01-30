/**
 * HeadlessVsLibrary — Side-by-side comparison of styled ui-kit
 * component vs headless hook + raw HTML.
 */

import { useState } from 'react';
import { Columns, Code2, Palette } from 'lucide-react';

interface ComparisonExample {
  title: string;
  description: string;
  libraryCode: string;
  headlessCode: string;
  libraryPreview: () => React.ReactNode;
  headlessPreview: () => React.ReactNode;
}

const EXAMPLES: ComparisonExample[] = [
  {
    title: 'Token Balance Display',
    description: 'Show a token balance with formatting',
    libraryCode: `import { BalanceDisplay } from '@tokenisation/ui-kit';

<BalanceDisplay
  amount="1500.00"
  symbol="TKN"
  showFiat={true}
  fiatValue="$15,000"
/>`,
    headlessCode: `import { useTokens } from '@tokenisation/sdk-react/hooks';

function MyBalance({ assetId }) {
  const { getBalance } = useTokens(assetId);
  const [bal, setBal] = useState('0');

  useEffect(() => {
    getBalance('0xMyAddr').then(b => setBal(b?.balance || '0'));
  }, []);

  return <span>{parseFloat(bal).toLocaleString()} TKN</span>;
}`,
    libraryPreview: () => (
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <p className="text-xs text-gray-500 mb-1">Balance</p>
        <p className="text-2xl font-bold text-white">1,500.00 <span className="text-primary text-sm">TKN</span></p>
        <p className="text-xs text-gray-400 mt-1">~ $15,000 USD</p>
      </div>
    ),
    headlessPreview: () => (
      <div className="p-4">
        <span className="text-2xl font-mono text-white">1,500 TKN</span>
      </div>
    ),
  },
  {
    title: 'Compliance Status',
    description: 'Display compliance check results',
    libraryCode: `import { ComplianceBadge } from '@tokenisation/ui-kit';

<ComplianceBadge status="passed" label="KYC" />
<ComplianceBadge status="passed" label="AML" />
<ComplianceBadge status="failed" label="Jurisdiction" />`,
    headlessCode: `import { useCompliance } from '@tokenisation/sdk-react/hooks';

function MyCompliance({ assetId }) {
  const { evaluate } = useCompliance(assetId);
  const [result, setResult] = useState(null);

  const check = async () => {
    const r = await evaluate({ action: 'token:transfer' });
    setResult(r);
  };

  return (
    <div>
      <button onClick={check}>Check</button>
      {result && <p>{result.decision.result}</p>}
    </div>
  );
}`,
    libraryPreview: () => (
      <div className="flex gap-2 p-4">
        <span className="px-2 py-1 rounded text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">KYC PASSED</span>
        <span className="px-2 py-1 rounded text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">AML PASSED</span>
        <span className="px-2 py-1 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">JURISDICTION FAILED</span>
      </div>
    ),
    headlessPreview: () => (
      <div className="p-4 font-mono text-sm">
        <button className="underline text-blue-400">Check</button>
        <p className="mt-2 text-green-400">ALLOW</p>
      </div>
    ),
  },
  {
    title: 'Transfer Form',
    description: 'Execute a token transfer',
    libraryCode: `import { TransferForm } from '@tokenisation/sdk/components';

<TransferForm
  assetId="asset_001"
  onSuccess={(tx) => console.log(tx.hash)}
  onError={(err) => alert(err.message)}
/>`,
    headlessCode: `import { useTokens } from '@tokenisation/sdk-react/hooks';

function MyTransfer({ assetId }) {
  const { transfer, loading } = useTokens(assetId);
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');

  const submit = async () => {
    const r = await transfer('0xMe', to, amt);
    alert(r.success ? 'Done!' : r.error);
  };

  return (
    <form onSubmit={e => { e.preventDefault(); submit(); }}>
      <input value={to} onChange={e => setTo(e.target.value)} placeholder="To" />
      <input value={amt} onChange={e => setAmt(e.target.value)} placeholder="Amount" />
      <button disabled={loading}>Send</button>
    </form>
  );
}`,
    libraryPreview: () => (
      <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3 max-w-xs">
        <div><p className="text-xs text-gray-500 mb-1">To Address</p><div className="h-8 bg-white/10 rounded border border-white/10" /></div>
        <div><p className="text-xs text-gray-500 mb-1">Amount</p><div className="h-8 bg-white/10 rounded border border-white/10" /></div>
        <button className="w-full py-2 bg-primary text-white rounded-lg text-sm font-bold">Transfer Tokens</button>
      </div>
    ),
    headlessPreview: () => (
      <div className="p-4 space-y-2 font-mono text-sm">
        <input className="block w-full bg-transparent border-b border-gray-600 text-white py-1 text-sm" placeholder="To: 0x..." readOnly />
        <input className="block w-full bg-transparent border-b border-gray-600 text-white py-1 text-sm" placeholder="Amount: 100" readOnly />
        <button className="underline text-blue-400 mt-2">Send</button>
      </div>
    ),
  },
];

export function HeadlessVsLibrary() {
  const [activeExample, setActiveExample] = useState(0);
  const example = EXAMPLES[activeExample];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
          <Columns className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Headless vs Library</h1>
          <p className="text-sm text-gray-400">Side-by-side: styled ui-kit components vs headless hooks</p>
        </div>
      </div>

      {/* Example selector */}
      <div className="flex gap-1 flex-wrap">
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex.title}
            onClick={() => setActiveExample(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              i === activeExample
                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                : 'bg-transparent text-gray-400 border-transparent hover:bg-white/5'
            }`}
          >
            {ex.title}
          </button>
        ))}
      </div>

      {/* Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Library side */}
        <div className="glass-card rounded-xl border border-purple-500/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 bg-purple-500/5">
            <Palette className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-bold text-purple-400">UI-Kit (Styled)</span>
          </div>
          <div className="p-4 border-b border-white/5 min-h-[100px] flex items-center justify-center">
            {example.libraryPreview()}
          </div>
          <div className="p-4">
            <pre className="bg-[#0d1117] rounded-lg p-3 text-[10px] text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-[250px] border border-white/5">
              {example.libraryCode}
            </pre>
          </div>
        </div>

        {/* Headless side */}
        <div className="glass-card rounded-xl border border-green-500/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 bg-green-500/5">
            <Code2 className="w-4 h-4 text-green-400" />
            <span className="text-sm font-bold text-green-400">Headless (Raw HTML)</span>
          </div>
          <div className="p-4 border-b border-white/5 min-h-[100px] flex items-center justify-center">
            {example.headlessPreview()}
          </div>
          <div className="p-4">
            <pre className="bg-[#0d1117] rounded-lg p-3 text-[10px] text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-[250px] border border-white/5">
              {example.headlessCode}
            </pre>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="glass-card rounded-xl border border-white/10 p-4">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <h4 className="font-bold text-purple-400 mb-2">UI-Kit Library</h4>
            <ul className="space-y-1 text-gray-400">
              <li>Pre-styled, themed components</li>
              <li>Consistent design language</li>
              <li>Faster development time</li>
              <li>Best for: branded partner apps</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-green-400 mb-2">Headless Hooks</h4>
            <ul className="space-y-1 text-gray-400">
              <li>Zero UI dependencies</li>
              <li>Full styling control</li>
              <li>Framework-agnostic logic</li>
              <li>Best for: custom UI, native apps</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
