/**
 * HeadlessDocsPage — Demonstrates useTokens, useCompliance hooks
 * driving plain HTML. Includes editable Sandpack instances.
 */

import { useState } from 'react';
import { Code2, Terminal, Copy, Check } from 'lucide-react';

// ============================================================================
// HOOK EXAMPLES
// ============================================================================

interface HookExample {
  name: string;
  description: string;
  hook: string;
  code: string;
  output: string;
}

const HOOK_EXAMPLES: HookExample[] = [
  {
    name: 'useTokens',
    description: 'Mint, transfer, burn tokens and query balances with zero UI dependencies.',
    hook: '@tokenisation/sdk-react/hooks',
    code: `import { useTokens } from '@tokenisation/sdk-react/hooks';

function PlainTokenManager({ assetId }: { assetId: string }) {
  const { mint, transfer, getBalance, totalSupply, loading } = useTokens(assetId);

  const handleMint = async () => {
    const result = await mint('0xRecipient...', '1000');
    if (result.success) {
      document.getElementById('status')!.textContent = 'Minted 1000 tokens';
    }
  };

  return (
    <div>
      <h3>Token Manager (Headless)</h3>
      <p>Total Supply: {totalSupply}</p>
      <button onClick={handleMint} disabled={loading}>
        {loading ? 'Processing...' : 'Mint 1000 Tokens'}
      </button>
      <span id="status"></span>
    </div>
  );
}`,
    output: `// Output:
// Token Manager (Headless)
// Total Supply: 10000
// [Mint 1000 Tokens]
// > Minted 1000 tokens`,
  },
  {
    name: 'useCompliance',
    description: 'Evaluate compliance policies before executing transfers. Pure logic, no styled components.',
    hook: '@tokenisation/sdk-react/hooks',
    code: `import { useCompliance } from '@tokenisation/sdk-react/hooks';

function ComplianceChecker({ assetId }: { assetId: string }) {
  const { evaluateTransfer, loading } = useCompliance(assetId);

  const checkTransfer = async () => {
    const result = await evaluateTransfer({
      from: '0xSeller...',
      to: '0xBuyer...',
      amount: '500',
    });

    const el = document.getElementById('result')!;
    if (result.decision.result === 'ALLOW') {
      el.textContent = 'Transfer ALLOWED';
      el.style.color = 'green';
    } else {
      el.textContent = 'Transfer DENIED: ' + result.decision.violations.map(v => v.message).join(', ');
      el.style.color = 'red';
    }
  };

  return (
    <div>
      <h3>Compliance Check (Headless)</h3>
      <button onClick={checkTransfer} disabled={loading}>
        Evaluate Transfer
      </button>
      <div id="result"></div>
    </div>
  );
}`,
    output: `// Output:
// Compliance Check (Headless)
// [Evaluate Transfer]
// > Transfer ALLOWED
// Decision: ALLOW | Violations: 0 | Warnings: 0`,
  },
  {
    name: 'useKYC',
    description: 'Start KYC flows, check verification status, and handle document uploads without any UI framework.',
    hook: '@tokenisation/sdk-react/hooks',
    code: `import { useKYC } from '@tokenisation/sdk-react/hooks';

function KYCChecker() {
  const { startVerification, status, level } = useKYC();

  const handleStart = async () => {
    await startVerification({
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      nationality: 'US',
    });
  };

  return (
    <div>
      <h3>KYC Verification (Headless)</h3>
      <p>Status: <strong>{status}</strong></p>
      <p>Level: {level}</p>
      <button onClick={handleStart}>
        Start KYC
      </button>
    </div>
  );
}`,
    output: `// Output:
// KYC Verification (Headless)
// Status: approved
// Level: standard
// [Start KYC]`,
  },
  {
    name: 'useAsset',
    description: 'Create, fetch, and transition assets through lifecycle states using raw HTML.',
    hook: '@tokenisation/sdk-react/hooks',
    code: `import { useAsset } from '@tokenisation/sdk-react/hooks';

function AssetCreator() {
  const { createAsset, transitionAsset, loading } = useAsset();

  const handleCreate = async () => {
    const result = await createAsset({
      name: 'My Property Token',
      symbol: 'MPT',
      rightType: 'OWNERSHIP',
      jurisdiction: 'AE',
      documents: [],
    });

    if (result.success) {
      console.log('Asset ID:', result.asset?.id);
      // Transition to ACTIVE
      await transitionAsset(result.asset!.id, 'ACTIVE');
    }
  };

  return (
    <div>
      <h3>Asset Creator (Headless)</h3>
      <button onClick={handleCreate} disabled={loading}>
        Create & Activate Asset
      </button>
    </div>
  );
}`,
    output: `// Output:
// Asset Creator (Headless)
// [Create & Activate Asset]
// > Asset ID: asset_abc123
// > State: DRAFT → ACTIVE`,
  },
  {
    name: 'useTokenBalance',
    description: 'Auto-polling token balance with human-readable decimal conversion and staleness detection.',
    hook: '@tokenisation/sdk-react/hooks',
    code: `import { useTokenBalance } from '@tokenisation/sdk-react/hooks';

function WalletBalance({ assetId }: { assetId: string }) {
  const { balance, rawBalance, loading, isStale, refresh } = useTokenBalance(assetId, {
    pollInterval: 15000,
    decimals: 18,
  });

  return (
    <div>
      <h3>Token Balance (Headless)</h3>
      <p>Balance: <strong>{balance ?? '0.00'}</strong></p>
      <p>Raw: {rawBalance ?? '0'}</p>
      {isStale && <p style={{ color: 'orange' }}>Balance may be outdated</p>}
      <button onClick={refresh} disabled={loading}>
        {loading ? 'Refreshing...' : 'Refresh Balance'}
      </button>
    </div>
  );
}`,
    output: `// Output:
// Token Balance (Headless)
// Balance: 1500.00
// Raw: 1500000000000000000000
// [Refresh Balance]
// > Balance updated: 1500.00`,
  },
  {
    name: 'useAuthExpiring',
    description: 'Session expiry monitoring with silent refresh, warning buffers, and expiry callbacks.',
    hook: '@tokenisation/sdk-react/hooks',
    code: `import { useAuthExpiring } from '@tokenisation/sdk-react/hooks';

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { isExpiring, isExpired, timeRemaining, refresh } = useAuthExpiring({
    warningBufferMs: 300000, // 5 min
    checkIntervalMs: 30000,
    onExpiring: () => console.log('Session expiring soon!'),
    onExpired: () => window.location.href = '/login',
    onRefreshed: () => console.log('Session refreshed'),
  });

  if (isExpired) {
    return <p>Session expired. Redirecting...</p>;
  }

  return (
    <div>
      {isExpiring && (
        <div style={{ background: '#fef3c7', padding: 8 }}>
          Session expires in {Math.round((timeRemaining ?? 0) / 1000)}s
          <button onClick={refresh}>Extend</button>
        </div>
      )}
      {children}
    </div>
  );
}`,
    output: `// Output:
// [Session active - no warnings]
// ...after 25 minutes...
// Session expires in 293s
// [Extend]
// > Session refreshed
// [Session active - no warnings]`,
  },
];

// ============================================================================
// COPY BUTTON
// ============================================================================

function CopyBtn({ text }: { text: string }) {
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

export function HeadlessDocsPage() {
  const [activeHook, setActiveHook] = useState(0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center justify-center">
          <Terminal className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Headless Hooks</h1>
          <p className="text-sm text-gray-400">Use SDK hooks with plain HTML — no UI framework required</p>
        </div>
      </div>

      {/* Intro */}
      <div className="glass-card rounded-xl border border-white/10 p-4">
        <p className="text-sm text-gray-300">
          Every SDK hook works headlessly. Import from <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs">@tokenisation/sdk-react/hooks</code> and
          drive your own HTML/DOM directly. The hooks handle all state management, API calls, and compliance checks.
        </p>
      </div>

      {/* Hook selector */}
      <div className="flex gap-1 flex-wrap">
        {HOOK_EXAMPLES.map((hook, index) => (
          <button
            key={hook.name}
            onClick={() => setActiveHook(index)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              index === activeHook
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : 'bg-transparent text-gray-400 border-transparent hover:bg-white/5'
            }`}
          >
            {hook.name}
          </button>
        ))}
      </div>

      {/* Active hook display */}
      {HOOK_EXAMPLES[activeHook] && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Code */}
          <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-green-400" />
                <span className="text-sm font-bold text-white">{HOOK_EXAMPLES[activeHook].name}</span>
              </div>
              <CopyBtn text={HOOK_EXAMPLES[activeHook].code} />
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-400 mb-3">{HOOK_EXAMPLES[activeHook].description}</p>
              <pre className="bg-[#0d1117] rounded-lg p-4 text-[11px] text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-[400px] border border-white/5">
                {HOOK_EXAMPLES[activeHook].code}
              </pre>
            </div>
          </div>

          {/* Simulated output */}
          <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-bold text-white">Preview Output</span>
            </div>
            <div className="p-4">
              <div className="bg-[#0d1117] rounded-lg p-4 border border-white/5 min-h-[200px]">
                <pre className="text-[11px] text-gray-400 font-mono whitespace-pre-wrap">
                  {HOOK_EXAMPLES[activeHook].output}
                </pre>
              </div>
              <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-xs text-green-400">
                  This hook is framework-agnostic. The same <code className="font-bold">{HOOK_EXAMPLES[activeHook].name}</code> works
                  with React, plain DOM, or any renderer that supports React hooks.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
