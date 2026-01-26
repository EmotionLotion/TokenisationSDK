import { useState } from 'react';
import {
  Play, CheckCircle, ArrowRight, RotateCcw, Sparkles, Terminal,
  Building2, Vote, DollarSign, TrendingUp, Lock, Layers,
  ChevronDown
} from 'lucide-react';
import { sdkStore } from '../store';
import { LifecycleState, RightType, PartyType, PartyRole, STATE_COLORS } from '../types';

interface DemoStep {
  id: number;
  title: string;
  description: string;
  action: () => Promise<void> | void;
  completed: boolean;
}

type DemoScenario = 'real_estate' | 'governance' | 'revenue_share' | 'yield_vault' | 'escrow' | 'partitioned';

interface ScenarioConfig {
  id: DemoScenario;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  features: string[];
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'real_estate',
    name: 'Real Estate Token',
    description: 'Tokenize property with compliance and transfers',
    icon: <Building2 className="w-5 h-5" />,
    color: 'blue',
    features: ['ERC-3643', 'KYC', 'Compliance'],
  },
  {
    id: 'governance',
    name: 'DAO Governance Token',
    description: 'Create voting token with proposals and delegation',
    icon: <Vote className="w-5 h-5" />,
    color: 'violet',
    features: ['Quadratic Voting', 'Delegation', 'Proposals'],
  },
  {
    id: 'revenue_share',
    name: 'Revenue Share Token',
    description: 'Automatic dividend distribution to holders',
    icon: <DollarSign className="w-5 h-5" />,
    color: 'teal',
    features: ['Cash Flow', 'Pro-Rata', 'Dividends'],
  },
  {
    id: 'yield_vault',
    name: 'Yield Vault Token',
    description: 'Auto-compounding yield-bearing vault',
    icon: <TrendingUp className="w-5 h-5" />,
    color: 'emerald',
    features: ['ERC-4626', 'Deposits', 'Yield'],
  },
  {
    id: 'escrow',
    name: 'Escrowed Purchase',
    description: 'Milestone-based escrow with conditions',
    icon: <Lock className="w-5 h-5" />,
    color: 'rose',
    features: ['Milestones', 'Conditions', 'Release'],
  },
  {
    id: 'partitioned',
    name: 'Partitioned Security',
    description: 'Multi-class shares with lock-up periods',
    icon: <Layers className="w-5 h-5" />,
    color: 'indigo',
    features: ['ERC-1410', 'Tranches', 'Lock-ups'],
  },
];

export function DemoWizard() {
  const [selectedScenario, setSelectedScenario] = useState<DemoScenario>('real_estate');
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [demoData, setDemoData] = useState<Record<string, string>>({});
  const [showScenarioSelect, setShowScenarioSelect] = useState(false);

  const addLog = (message: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // ============================================================================
  // SCENARIO: Real Estate Token
  // ============================================================================
  const realEstateSteps: DemoStep[] = [
    {
      id: 1,
      title: 'Create Issuer',
      description: 'Create real estate company as issuer',
      action: async () => {
        const issuer = await sdkStore.createParty({
          name: 'Acme Real Estate',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(issuer.id);
        setDemoData(prev => ({ ...prev, issuerId: issuer.id }));
        addLog(`✓ Created issuer: Acme Real Estate`);
        addLog(`✓ KYC verified`);
      },
      completed: false,
    },
    {
      id: 2,
      title: 'Create Investor',
      description: 'Create accredited investor',
      action: async () => {
        const investor = await sdkStore.createParty({
          name: 'John Smith',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'US',
        });
        sdkStore.verifyKyc(investor.id);
        setDemoData(prev => ({ ...prev, investorId: investor.id }));
        addLog(`✓ Created investor: John Smith`);
        addLog(`✓ KYC verified (Accredited)`);
      },
      completed: false,
    },
    {
      id: 3,
      title: 'Create Property Asset',
      description: 'Tokenize Dubai office building',
      action: async () => {
        const asset = await sdkStore.createAsset({
          name: 'Downtown Office Building',
          description: 'Premium office space in Dubai',
          rightType: RightType.OWNERSHIP,
          jurisdiction: 'AE',
          issuerId: demoData.issuerId!,
          metadata: { propertyType: 'COMMERCIAL', area: 5000, valuation: '10000000' },
        });
        setDemoData(prev => ({ ...prev, assetId: asset.id }));
        addLog(`✓ Created: Downtown Office Building`);
        addLog(`  Valuation: $10,000,000`);
        addLog(`  State: DRAFT`);
      },
      completed: false,
    },
    {
      id: 4,
      title: 'Verify & Activate',
      description: 'Complete compliance verification',
      action: async () => {
        await sdkStore.transition(demoData.assetId!, LifecycleState.PENDING_VERIFICATION, demoData.issuerId!);
        addLog(`✓ Submitted for verification`);
        await sdkStore.transition(demoData.assetId!, LifecycleState.VERIFIED, demoData.issuerId!);
        addLog(`✓ Compliance verified`);
        await sdkStore.transition(demoData.assetId!, LifecycleState.ACTIVE, demoData.issuerId!);
        addLog(`✓ Asset ACTIVE - ready for minting`);
      },
      completed: false,
    },
    {
      id: 5,
      title: 'Mint & Transfer',
      description: 'Issue tokens to investor',
      action: async () => {
        await sdkStore.mint(demoData.assetId!, demoData.investorId!, '1000');
        addLog(`✓ Minted 1,000 tokens to John Smith`);
        addLog(`  Token Standard: ERC-3643`);
        addLog(`  Transfer Restrictions: KYC Required`);
      },
      completed: false,
    },
  ];

  // ============================================================================
  // SCENARIO: DAO Governance Token
  // ============================================================================
  const governanceSteps: DemoStep[] = [
    {
      id: 1,
      title: 'Create DAO',
      description: 'Set up MetaDAO organization',
      action: async () => {
        const dao = await sdkStore.createParty({
          name: 'MetaDAO',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER],
          jurisdiction: 'CH',
        });
        setDemoData(prev => ({ ...prev, daoId: dao.id }));
        addLog(`✓ Created DAO: MetaDAO`);
        addLog(`  Jurisdiction: Switzerland`);
      },
      completed: false,
    },
    {
      id: 2,
      title: 'Create Governance Token',
      description: 'Issue META governance token',
      action: async () => {
        const asset = await sdkStore.createAsset({
          name: 'META Governance Token',
          description: 'Voting token with quadratic voting',
          rightType: RightType.OWNERSHIP,
          jurisdiction: 'CH',
          issuerId: demoData.daoId!,
          metadata: { symbol: 'META', totalSupply: '100000000', votingStrategy: 'QUADRATIC' },
        });
        setDemoData(prev => ({ ...prev, assetId: asset.id }));
        addLog(`✓ Created: META Governance Token`);
        addLog(`  Supply: 100,000,000 META`);
        addLog(`  Voting: Quadratic (√balance)`);
      },
      completed: false,
    },
    {
      id: 3,
      title: 'Configure Governance',
      description: 'Set voting rules and delegation',
      action: async () => {
        addLog(`✓ Governance configured:`);
        addLog(`  • Quorum: 10%`);
        addLog(`  • Proposal threshold: 1,000 META`);
        addLog(`  • Voting period: 7 days`);
        addLog(`  • Timelock: 2 days`);
        addLog(`  • Delegation: Enabled`);
      },
      completed: false,
    },
    {
      id: 4,
      title: 'Create Voters',
      description: 'Set up token holders',
      action: async () => {
        const alice = await sdkStore.createParty({ name: 'Alice (Whale)', type: PartyType.INDIVIDUAL, roles: [PartyRole.INVESTOR], jurisdiction: 'US' });
        const bob = await sdkStore.createParty({ name: 'Bob (Delegate)', type: PartyType.INDIVIDUAL, roles: [PartyRole.INVESTOR], jurisdiction: 'DE' });
        setDemoData(prev => ({ ...prev, aliceId: alice.id, bobId: bob.id }));
        addLog(`✓ Alice: 50,000 META (whale)`);
        addLog(`✓ Bob: 10,000 META (delegate)`);
        addLog(`✓ Charlie delegated 5,000 META to Bob`);
        addLog(`  Bob's voting power: 15,000 META`);
      },
      completed: false,
    },
    {
      id: 5,
      title: 'Create Proposal',
      description: 'Submit treasury proposal',
      action: async () => {
        addLog(`✓ Proposal Created: "Fund Community Grants"`);
        addLog(`  Type: TREASURY`);
        addLog(`  Amount: 500,000 META`);
        addLog(`  Proposer: Bob`);
        addLog(`  Status: ACTIVE`);
      },
      completed: false,
    },
    {
      id: 6,
      title: 'Cast Votes',
      description: 'Token holders vote on proposal',
      action: async () => {
        addLog(`✓ Alice voted: FOR (50,000 META)`);
        addLog(`✓ Bob voted: FOR (15,000 META)`);
        addLog(`  ─────────────────────`);
        addLog(`  FOR:     65,000 (65%)`);
        addLog(`  AGAINST: 0 (0%)`);
        addLog(`  Quorum:  ✓ Met (65% > 10%)`);
        addLog(`  Result:  PASSED`);
      },
      completed: false,
    },
  ];

  // ============================================================================
  // SCENARIO: Revenue Share Token
  // ============================================================================
  const revenueShareSteps: DemoStep[] = [
    {
      id: 1,
      title: 'Create Project',
      description: 'Set up revenue-generating project',
      action: async () => {
        const issuer = await sdkStore.createParty({
          name: 'StreamFi Media',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER],
          jurisdiction: 'US',
        });
        setDemoData(prev => ({ ...prev, issuerId: issuer.id }));
        addLog(`✓ Created: StreamFi Media`);
        addLog(`  Revenue Source: Streaming Platform`);
      },
      completed: false,
    },
    {
      id: 2,
      title: 'Create Revenue Token',
      description: 'Issue tokens with dividend rights',
      action: async () => {
        const asset = await sdkStore.createAsset({
          name: 'STREAM Revenue Token',
          description: '10% revenue share from platform',
          rightType: RightType.OWNERSHIP,
          jurisdiction: 'US',
          issuerId: demoData.issuerId!,
          metadata: { revenueShare: '10%', distributionFrequency: 'MONTHLY' },
        });
        setDemoData(prev => ({ ...prev, assetId: asset.id }));
        addLog(`✓ Created: STREAM Revenue Token`);
        addLog(`  Revenue Share: 10%`);
        addLog(`  Distribution: Monthly`);
      },
      completed: false,
    },
    {
      id: 3,
      title: 'Configure Cash Flow',
      description: 'Set up distribution schedule',
      action: async () => {
        addLog(`✓ Cash Flow Engine configured:`);
        addLog(`  • Type: REVENUE_SHARE`);
        addLog(`  • Frequency: MONTHLY`);
        addLog(`  • Allocation: PRO_RATA`);
        addLog(`  • Payment: USDC`);
        addLog(`  • Min Payout: $10`);
      },
      completed: false,
    },
    {
      id: 4,
      title: 'Add Investors',
      description: 'Distribute tokens to holders',
      action: async () => {
        addLog(`✓ Token Distribution:`);
        addLog(`  • Investor A: 50,000 STREAM (50%)`);
        addLog(`  • Investor B: 30,000 STREAM (30%)`);
        addLog(`  • Investor C: 20,000 STREAM (20%)`);
      },
      completed: false,
    },
    {
      id: 5,
      title: 'Execute Distribution',
      description: 'Distribute monthly revenue',
      action: async () => {
        addLog(`✓ Revenue Distribution Executed:`);
        addLog(`  Monthly Revenue: $100,000`);
        addLog(`  10% Pool: $10,000`);
        addLog(`  ─────────────────────`);
        addLog(`  • Investor A: $5,000 USDC`);
        addLog(`  • Investor B: $3,000 USDC`);
        addLog(`  • Investor C: $2,000 USDC`);
        addLog(`  Status: COMPLETED`);
      },
      completed: false,
    },
  ];

  // ============================================================================
  // SCENARIO: Yield Vault
  // ============================================================================
  const yieldVaultSteps: DemoStep[] = [
    {
      id: 1,
      title: 'Create Vault Manager',
      description: 'Set up yield fund manager',
      action: async () => {
        const manager = await sdkStore.createParty({
          name: 'DeFi Yield Fund',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER],
          jurisdiction: 'CH',
        });
        setDemoData(prev => ({ ...prev, managerId: manager.id }));
        addLog(`✓ Created: DeFi Yield Fund`);
        addLog(`  Strategy: Multi-protocol Yield`);
      },
      completed: false,
    },
    {
      id: 2,
      title: 'Deploy Vault',
      description: 'Create ERC-4626 vault token',
      action: async () => {
        const asset = await sdkStore.createAsset({
          name: 'yvUSDC Vault',
          description: 'Auto-compounding USDC vault',
          rightType: RightType.OWNERSHIP,
          jurisdiction: 'CH',
          issuerId: demoData.managerId!,
          metadata: { underlying: 'USDC', apy: '8.5%', strategy: 'lending' },
        });
        setDemoData(prev => ({ ...prev, assetId: asset.id }));
        addLog(`✓ Deployed: yvUSDC Vault`);
        addLog(`  Standard: ERC-4626`);
        addLog(`  Underlying: USDC`);
        addLog(`  Target APY: 8.5%`);
      },
      completed: false,
    },
    {
      id: 3,
      title: 'Configure Vault',
      description: 'Set fees and parameters',
      action: async () => {
        addLog(`✓ Vault Configuration:`);
        addLog(`  • Management Fee: 1%`);
        addLog(`  • Performance Fee: 10%`);
        addLog(`  • Min Deposit: 100 USDC`);
        addLog(`  • Withdrawal Delay: None`);
        addLog(`  • Auto-compound: Enabled`);
      },
      completed: false,
    },
    {
      id: 4,
      title: 'Deposit Assets',
      description: 'Users deposit USDC',
      action: async () => {
        addLog(`✓ Deposits Received:`);
        addLog(`  • User A: 10,000 USDC → 9,950 yvUSDC`);
        addLog(`  • User B: 5,000 USDC → 4,975 yvUSDC`);
        addLog(`  Total TVL: $15,000`);
        addLog(`  Share Price: 1.005 USDC`);
      },
      completed: false,
    },
    {
      id: 5,
      title: 'Harvest & Compound',
      description: 'Auto-compound yield',
      action: async () => {
        addLog(`✓ Yield Harvested & Compounded:`);
        addLog(`  Yield Earned: $106.25`);
        addLog(`  New TVL: $15,106.25`);
        addLog(`  New Share Price: 1.0071 USDC`);
        addLog(`  ─────────────────────`);
        addLog(`  User A Value: $10,071 (+0.71%)`);
        addLog(`  User B Value: $5,035 (+0.71%)`);
      },
      completed: false,
    },
  ];

  // ============================================================================
  // SCENARIO: Escrowed Purchase
  // ============================================================================
  const escrowSteps: DemoStep[] = [
    {
      id: 1,
      title: 'Create Parties',
      description: 'Set up buyer, seller, and arbiter',
      action: async () => {
        const buyer = await sdkStore.createParty({ name: 'Tech Startup Inc', type: PartyType.ORGANIZATION, roles: [PartyRole.INVESTOR], jurisdiction: 'US' });
        const seller = await sdkStore.createParty({ name: 'IP Holdings LLC', type: PartyType.ORGANIZATION, roles: [PartyRole.ISSUER], jurisdiction: 'US' });
        setDemoData(prev => ({ ...prev, buyerId: buyer.id, sellerId: seller.id }));
        addLog(`✓ Buyer: Tech Startup Inc`);
        addLog(`✓ Seller: IP Holdings LLC`);
        addLog(`✓ Arbiter: Escrow Services Co`);
      },
      completed: false,
    },
    {
      id: 2,
      title: 'Create Escrow',
      description: 'Set up milestone-based escrow',
      action: async () => {
        addLog(`✓ Escrow Created: Patent Purchase`);
        addLog(`  Type: MILESTONE`);
        addLog(`  Amount: $500,000 USDC`);
        addLog(`  Parties: 3 (Buyer, Seller, Arbiter)`);
      },
      completed: false,
    },
    {
      id: 3,
      title: 'Define Milestones',
      description: 'Set release conditions',
      action: async () => {
        addLog(`✓ Milestones Defined:`);
        addLog(`  1. Due Diligence Complete → $50,000`);
        addLog(`  2. Patent Transfer Filed → $200,000`);
        addLog(`  3. USPTO Approval → $250,000`);
        addLog(`  Release: Requires 2/3 approval`);
      },
      completed: false,
    },
    {
      id: 4,
      title: 'Fund Escrow',
      description: 'Buyer deposits funds',
      action: async () => {
        addLog(`✓ Escrow Funded:`);
        addLog(`  Depositor: Tech Startup Inc`);
        addLog(`  Amount: $500,000 USDC`);
        addLog(`  Status: FUNDED`);
        addLog(`  Funds Locked: Yes`);
      },
      completed: false,
    },
    {
      id: 5,
      title: 'Complete Milestone 1',
      description: 'Due diligence approved',
      action: async () => {
        addLog(`✓ Milestone 1: Due Diligence`);
        addLog(`  Approvals: Buyer ✓, Seller ✓`);
        addLog(`  Released: $50,000 to Seller`);
        addLog(`  Remaining: $450,000`);
      },
      completed: false,
    },
    {
      id: 6,
      title: 'Complete & Release',
      description: 'All milestones complete',
      action: async () => {
        addLog(`✓ Milestone 2: Patent Filed ✓`);
        addLog(`  Released: $200,000`);
        addLog(`✓ Milestone 3: USPTO Approved ✓`);
        addLog(`  Released: $250,000`);
        addLog(`  ─────────────────────`);
        addLog(`  Escrow Status: COMPLETED`);
        addLog(`  Total Released: $500,000`);
      },
      completed: false,
    },
  ];

  // ============================================================================
  // SCENARIO: Partitioned Security
  // ============================================================================
  const partitionedSteps: DemoStep[] = [
    {
      id: 1,
      title: 'Create Issuer',
      description: 'Set up securities issuer',
      action: async () => {
        const issuer = await sdkStore.createParty({
          name: 'TechCorp Inc',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER],
          jurisdiction: 'US',
        });
        setDemoData(prev => ({ ...prev, issuerId: issuer.id }));
        addLog(`✓ Created: TechCorp Inc`);
        addLog(`  Type: Delaware C-Corp`);
      },
      completed: false,
    },
    {
      id: 2,
      title: 'Create Security Token',
      description: 'Issue ERC-1410 partitioned token',
      action: async () => {
        const asset = await sdkStore.createAsset({
          name: 'TECH Series A Preferred',
          description: 'Partitioned security with share classes',
          rightType: RightType.OWNERSHIP,
          jurisdiction: 'US',
          issuerId: demoData.issuerId!,
          metadata: { standard: 'ERC-1410', totalShares: '10000000' },
        });
        setDemoData(prev => ({ ...prev, assetId: asset.id }));
        addLog(`✓ Created: TECH Series A`);
        addLog(`  Standard: ERC-1410`);
        addLog(`  Total Shares: 10,000,000`);
      },
      completed: false,
    },
    {
      id: 3,
      title: 'Define Partitions',
      description: 'Create share class tranches',
      action: async () => {
        addLog(`✓ Partitions Created:`);
        addLog(`  [FOUNDERS] 2,000,000 shares`);
        addLog(`    └─ 4-year cliff, non-transferable`);
        addLog(`  [EMPLOYEES] 1,500,000 shares`);
        addLog(`    └─ 1-year cliff, 4-year vest`);
        addLog(`  [INVESTORS] 3,000,000 shares`);
        addLog(`    └─ 6-month lockup, transferable`);
        addLog(`  [RESERVE] 3,500,000 shares`);
        addLog(`    └─ Treasury, locked`);
      },
      completed: false,
    },
    {
      id: 4,
      title: 'Issue by Partition',
      description: 'Allocate shares to holders',
      action: async () => {
        addLog(`✓ Shares Issued:`);
        addLog(`  [FOUNDERS]`);
        addLog(`    • CEO: 1,000,000 (locked 4yr)`);
        addLog(`    • CTO: 1,000,000 (locked 4yr)`);
        addLog(`  [INVESTORS]`);
        addLog(`    • VC Fund A: 2,000,000`);
        addLog(`    • Angel B: 1,000,000`);
      },
      completed: false,
    },
    {
      id: 5,
      title: 'Partition Transfer',
      description: 'Transfer within partition rules',
      action: async () => {
        addLog(`✓ Transfer Request: VC Fund A → Fund B`);
        addLog(`  Partition: INVESTORS`);
        addLog(`  Amount: 500,000 shares`);
        addLog(`  Lockup Check: ✓ Passed (>6 months)`);
        addLog(`  KYC Check: ✓ Both verified`);
        addLog(`  Transfer: COMPLETED`);
      },
      completed: false,
    },
    {
      id: 6,
      title: 'Unlock & Vest',
      description: 'Employee shares vest',
      action: async () => {
        addLog(`✓ Vesting Event: 1 Year Anniversary`);
        addLog(`  [EMPLOYEES] Cliff Released`);
        addLog(`  • 25% now transferable`);
        addLog(`  • Employee A: 37,500 unlocked`);
        addLog(`  • Employee B: 25,000 unlocked`);
        addLog(`  Remaining: 75% over 3 years`);
      },
      completed: false,
    },
  ];

  // Get steps for current scenario
  const getSteps = (): DemoStep[] => {
    switch (selectedScenario) {
      case 'real_estate': return realEstateSteps;
      case 'governance': return governanceSteps;
      case 'revenue_share': return revenueShareSteps;
      case 'yield_vault': return yieldVaultSteps;
      case 'escrow': return escrowSteps;
      case 'partitioned': return partitionedSteps;
      default: return realEstateSteps;
    }
  };

  const [demoSteps, setDemoSteps] = useState(getSteps());

  const runStep = async (stepIndex: number) => {
    const steps = getSteps();
    if (stepIndex >= steps.length) {
      addLog('');
      addLog('🎉 Demo complete!');
      setIsRunning(false);
      return;
    }

    const step = steps[stepIndex];
    addLog('');
    addLog(`▶ Step ${step.id}: ${step.title}`);

    await step.action();

    setDemoSteps(prev => prev.map((s, i) =>
      i === stepIndex ? { ...s, completed: true } : s
    ));
    setCurrentStep(stepIndex + 1);
  };

  const runAllSteps = async () => {
    setIsRunning(true);
    setLog([]);
    setCurrentStep(0);
    setDemoData({});
    const steps = getSteps();
    setDemoSteps(steps.map(s => ({ ...s, completed: false })));

    const scenario = SCENARIOS.find(s => s.id === selectedScenario);
    addLog(`🚀 Starting ${scenario?.name} demo...`);

    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 800));
      await runStep(i);
    }
  };

  const reset = () => {
    setCurrentStep(0);
    setLog([]);
    setDemoData({});
    setDemoSteps(getSteps().map(s => ({ ...s, completed: false })));
    setIsRunning(false);
  };

  const selectScenario = (id: DemoScenario) => {
    setSelectedScenario(id);
    setShowScenarioSelect(false);
    reset();
    setDemoSteps(
      id === 'real_estate' ? realEstateSteps :
      id === 'governance' ? governanceSteps :
      id === 'revenue_share' ? revenueShareSteps :
      id === 'yield_vault' ? yieldVaultSteps :
      id === 'escrow' ? escrowSteps :
      partitionedSteps
    );
  };

  const currentScenario = SCENARIOS.find(s => s.id === selectedScenario)!;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Scenario Selector */}
      <div className="glass-card p-4 rounded-xl">
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => selectScenario(scenario.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                selectedScenario === scenario.id
                  ? `bg-${scenario.color}-500/20 text-${scenario.color}-400 border border-${scenario.color}-500/30`
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
              }`}
            >
              {scenario.icon}
              <span className="text-sm font-medium">{scenario.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="glass-card p-6 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-${currentScenario.color}-500/20 text-${currentScenario.color}-400`}>
            {currentScenario.icon}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {currentScenario.name}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {currentScenario.description}
            </p>
            <div className="flex gap-2 mt-2">
              {currentScenario.features.map((f) => (
                <span key={f} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-gray-500">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={runAllSteps}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-lg shadow-primary/20"
          >
            <Play className="w-4 h-4" />
            Run Demo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Steps */}
        <div className="glass-card rounded-xl border border-white/10 p-6">
          <h3 className="font-semibold text-white mb-4">Demo Steps</h3>
          <div className="space-y-3">
            {demoSteps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all border ${index === currentStep && isRunning
                  ? 'bg-primary/10 border-primary/30'
                  : step.completed
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-white/5 border-transparent'
                  }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step.completed
                  ? 'bg-green-500 text-white'
                  : index === currentStep && isRunning
                    ? 'bg-primary text-white animate-pulse'
                    : 'bg-white/10 text-gray-500'
                  }`}>
                  {step.completed ? <CheckCircle className="w-5 h-5" /> : step.id}
                </div>
                <div className="flex-1">
                  <p className={`font-medium ${step.completed ? 'text-green-400' : 'text-gray-200'}`}>{step.title}</p>
                  <p className="text-sm text-gray-500">{step.description}</p>
                </div>
                {step.completed && (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Log */}
        <div className="glass-card rounded-xl shadow-lg border border-white/10 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-white/10 bg-black/40 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-gray-400" />
            <h3 className="text-gray-300 font-mono text-sm font-semibold">Console Output</h3>
          </div>
          <div className="flex-1 p-6 bg-black/40 font-mono text-sm overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-white/10">
            <div className="space-y-2">
              {log.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-600">
                  <Play className="w-8 h-8 mb-2 opacity-50" />
                  <p>Click "Run Demo" to start...</p>
                </div>
              ) : (
                log.map((line, i) => (
                  <div key={i} className={`py-0.5 border-l-2 pl-3 ${line.startsWith('✓') ? 'border-green-500 text-green-400' :
                    line.startsWith('▶') ? 'border-primary text-primary font-bold mt-4' :
                      line.startsWith('🎉') ? 'border-yellow-500 text-yellow-400 font-bold text-lg mt-4' :
                        line.startsWith('🚀') ? 'border-blue-500 text-blue-400 font-bold mb-4' :
                          line.startsWith('  •') ? 'border-transparent text-gray-300 ml-4' :
                            line.startsWith('  └') || line.startsWith('  ├') ? 'border-transparent text-gray-400 ml-4' :
                              'border-transparent text-gray-400'
                    }`}>
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
