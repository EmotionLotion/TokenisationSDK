import {
  SandpackProvider,
  SandpackCodeEditor,
  SandpackPreview,
  SandpackLayout,
} from '@codesandbox/sandpack-react';

const DARK_THEME = {
  colors: {
    surface1: '#0d1117',
    surface2: '#161b22',
    surface3: '#1c2128',
    clickable: '#8b949e',
    base: '#c9d1d9',
    disabled: '#484f58',
    hover: '#58a6ff',
    accent: '#F8B032',
    error: '#f85149',
    errorSurface: '#3d1e20',
  },
  syntax: {
    plain: '#c9d1d9',
    comment: { color: '#8b949e', fontStyle: 'italic' as const },
    keyword: '#ff7b72',
    tag: '#7ee787',
    punctuation: '#c9d1d9',
    definition: '#d2a8ff',
    property: '#79c0ff',
    static: '#F8B032',
    string: '#a5d6ff',
  },
  font: {
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    mono: '"Fira Code", "Fira Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
    size: '13px',
    lineHeight: '1.6',
  },
};

// Realistic mock SDK that mirrors the real @tokenisation/sdk API surface.
// Sandpack runs in an isolated iframe so it cannot call the live store directly.
// This mock faithfully simulates the SDK behavior including state tracking and logging.
const SDK_SETUP = `// @tokenisation/sdk — Sandbox Simulation
// This mock mirrors the real SDK's API. In production, import from '@tokenisation/sdk'.

type LifecycleState = 'DRAFT' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'ACTIVE' | 'FROZEN' | 'REDEEMED';

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_VERIFICATION'],
  PENDING_VERIFICATION: ['VERIFIED', 'DRAFT'],
  VERIFIED: ['ACTIVE'],
  ACTIVE: ['FROZEN', 'REDEEMED'],
  FROZEN: ['ACTIVE', 'REDEEMED'],
};

// In-memory state for this sandbox session
const _assets: any[] = [];
const _parties: any[] = [];
const _balances: Record<string, Record<string, number>> = {};
const _log: string[] = [];

function log(msg: string) {
  const ts = new Date().toLocaleTimeString();
  const line = \`[\${ts}] \${msg}\`;
  _log.push(line);
  console.log(line);
}

const sdk = {
  LifecycleState: { DRAFT: 'DRAFT', PENDING_VERIFICATION: 'PENDING_VERIFICATION', VERIFIED: 'VERIFIED', ACTIVE: 'ACTIVE', FROZEN: 'FROZEN', REDEEMED: 'REDEEMED' } as Record<string, LifecycleState>,

  assets: {
    create: async (data: any) => {
      const asset = { id: 'AST-' + Date.now(), ...data, state: 'DRAFT' as LifecycleState, createdAt: new Date().toISOString() };
      _assets.push(asset);
      log(\`✓ Asset created: \${asset.name} [id=\${asset.id}, state=DRAFT]\`);
      return asset;
    },
    getAll: () => [..._assets],
    get: (id: string) => _assets.find(a => a.id === id) || null,
    transition: async (assetId: string, newState: LifecycleState, actorId?: string) => {
      const asset = _assets.find(a => a.id === assetId);
      if (!asset) return { success: false, error: 'Asset not found' };
      const allowed = VALID_TRANSITIONS[asset.state] || [];
      if (!allowed.includes(newState)) return { success: false, error: \`Cannot transition from \${asset.state} to \${newState}\` };
      const prev = asset.state;
      asset.state = newState;
      log(\`✓ Lifecycle: \${asset.name} \${prev} → \${newState}\`);
      return { success: true };
    },
  },

  parties: {
    create: (data: any) => {
      const party = { id: 'PTY-' + Date.now(), ...data, kycVerified: false, createdAt: new Date().toISOString() };
      _parties.push(party);
      log(\`✓ Party created: \${party.name} [type=\${party.type}, jurisdiction=\${party.jurisdiction}]\`);
      return party;
    },
    getAll: () => [..._parties],
    get: (id: string) => _parties.find(p => p.id === id),
    setKyc: (partyId: string, verified: boolean) => {
      const party = _parties.find(p => p.id === partyId);
      if (party) {
        party.kycVerified = verified;
        log(\`✓ KYC \${verified ? 'verified' : 'revoked'}: \${party.name}\`);
      }
    },
  },

  tokens: {
    mint: async (assetId: string, toPartyId: string, amount: string) => {
      const asset = _assets.find(a => a.id === assetId);
      const party = _parties.find(p => p.id === toPartyId);
      if (!asset) return { success: false, error: 'Asset not found' };
      if (asset.state !== 'ACTIVE') return { success: false, error: 'Asset must be ACTIVE to mint' };
      if (!_balances[assetId]) _balances[assetId] = {};
      _balances[assetId][toPartyId] = (_balances[assetId][toPartyId] || 0) + Number(amount);
      log(\`✓ Minted \${amount} tokens of \${asset.name} → \${party?.name || toPartyId}\`);
      return { success: true };
    },
    transfer: async (assetId: string, from: string, to: string, amount: string) => {
      if (!_balances[assetId]?.[from] || _balances[assetId][from] < Number(amount)) {
        return { success: false, error: 'Insufficient balance' };
      }
      _balances[assetId][from] -= Number(amount);
      _balances[assetId][to] = (_balances[assetId][to] || 0) + Number(amount);
      log(\`✓ Transferred \${amount} tokens: \${from} → \${to}\`);
      return { success: true };
    },
    getBalance: async (assetId: string, partyId: string) => {
      return String(_balances[assetId]?.[partyId] || 0);
    },
  },

  // Utility: get all log entries for display
  getLogs: () => [..._log],
};

export default sdk;
export type { LifecycleState };
`;

interface SandpackPlaygroundProps {
  initialCode: string;
  showcaseId?: string;
  dependencies?: Record<string, string>;
}

export function SandpackPlayground({
  initialCode,
  showcaseId,
  dependencies = {},
}: SandpackPlaygroundProps) {
  const files: Record<string, string> = {
    '/App.tsx': initialCode,
    '/sdk-setup.ts': SDK_SETUP,
  };

  return (
    <div className="rounded-xl overflow-hidden border border-white/10">
      <SandpackProvider
        template="react-ts"
        theme={DARK_THEME}
        files={files}
        customSetup={{
          dependencies: {
            'lucide-react': 'latest',
            ...dependencies,
          },
        }}
        options={{
          visibleFiles: ['/App.tsx', '/sdk-setup.ts'],
          activeFile: '/App.tsx',
          recompileMode: 'delayed',
          recompileDelay: 500,
        }}
      >
        <SandpackLayout>
          <SandpackCodeEditor
            showLineNumbers
            showTabs
            closableTabs
            style={{ height: '500px' }}
          />
          <SandpackPreview
            showOpenInCodeSandbox={false}
            showRefreshButton
            style={{ height: '500px' }}
          />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
