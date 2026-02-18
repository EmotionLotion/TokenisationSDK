import { useState } from 'react';
import { Users, Shield, Plus, Search } from 'lucide-react';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TierPlan {
  id: string;
  assetId: string;
  tier: string;
  name: string;
  minInvestment: number;
  maxInvestment: number;
  maxHoldingPercent: number;
  managementFeePercent: number;
  performanceFeePercent: number;
  lockupDays: number;
  accreditationRequired: boolean;
  currency: string;
  active: boolean;
}

interface EligibilityResult {
  eligible: boolean;
  tier: string;
  violations: Array<{ rule: string; severity: string; message: string }>;
  maxAllowedAmount: number;
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_PLANS: TierPlan[] = [
  {
    id: 'plan-marina-retail',
    assetId: 'marina-gate-tower',
    tier: 'retail',
    name: 'Retail Investor',
    minInvestment: 1000,
    maxInvestment: 500000,
    maxHoldingPercent: 10,
    managementFeePercent: 1.5,
    performanceFeePercent: 0,
    lockupDays: 90,
    accreditationRequired: false,
    currency: 'AED',
    active: true,
  },
  {
    id: 'plan-marina-qualified',
    assetId: 'marina-gate-tower',
    tier: 'qualified',
    name: 'Qualified Investor',
    minInvestment: 500000,
    maxInvestment: 5000000,
    maxHoldingPercent: 25,
    managementFeePercent: 1.0,
    performanceFeePercent: 10,
    lockupDays: 90,
    accreditationRequired: true,
    currency: 'AED',
    active: true,
  },
  {
    id: 'plan-marina-professional',
    assetId: 'marina-gate-tower',
    tier: 'professional',
    name: 'Professional Investor',
    minInvestment: 1000000,
    maxInvestment: 25000000,
    maxHoldingPercent: 50,
    managementFeePercent: 0.75,
    performanceFeePercent: 15,
    lockupDays: 60,
    accreditationRequired: true,
    currency: 'AED',
    active: true,
  },
  {
    id: 'plan-marina-institutional',
    assetId: 'marina-gate-tower',
    tier: 'institutional',
    name: 'Institutional Investor',
    minInvestment: 5000000,
    maxInvestment: 100000000,
    maxHoldingPercent: 100,
    managementFeePercent: 0.5,
    performanceFeePercent: 20,
    lockupDays: 30,
    accreditationRequired: true,
    currency: 'AED',
    active: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Tier colors                                                        */
/* ------------------------------------------------------------------ */

const TIER_COLORS: Record<string, string> = {
  retail: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  qualified: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  professional: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  institutional: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

/* ------------------------------------------------------------------ */
/*  Plan Card                                                          */
/* ------------------------------------------------------------------ */

function PlanCard({ plan }: { plan: TierPlan }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border ${TIER_COLORS[plan.tier] || TIER_COLORS.retail}`}>
            {plan.tier}
          </span>
          <h3 className="text-white font-medium text-sm">{plan.name}</h3>
        </div>
        {plan.accreditationRequired && (
          <Shield className="w-4 h-4 text-yellow-400" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-gray-500">Min Investment</span>
          <p className="text-white font-mono">{plan.minInvestment.toLocaleString()} {plan.currency}</p>
        </div>
        <div>
          <span className="text-gray-500">Max Investment</span>
          <p className="text-white font-mono">{plan.maxInvestment.toLocaleString()} {plan.currency}</p>
        </div>
        <div>
          <span className="text-gray-500">Max Holding</span>
          <p className="text-white">{plan.maxHoldingPercent}%</p>
        </div>
        <div>
          <span className="text-gray-500">Lockup</span>
          <p className="text-white">{plan.lockupDays} days</p>
        </div>
        <div>
          <span className="text-gray-500">Mgmt Fee</span>
          <p className="text-white">{plan.managementFeePercent}%</p>
        </div>
        <div>
          <span className="text-gray-500">Perf Fee</span>
          <p className="text-white">{plan.performanceFeePercent}%</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function InvestorTierManager() {
  const { data: plans, isLive } = useSDKWithFallback<TierPlan[]>(
    async () => null,
    MOCK_PLANS,
  );

  const [showForm, setShowForm] = useState(false);
  const [eligibilityCheck, setEligibilityCheck] = useState<EligibilityResult | null>(null);
  const [checkInvestorId, setCheckInvestorId] = useState('');
  const [checkAmount, setCheckAmount] = useState('');

  const handleCheckEligibility = () => {
    // Mock eligibility check
    const amount = parseFloat(checkAmount);
    if (!checkInvestorId || isNaN(amount)) return;

    const eligible = amount >= 1000 && amount <= 500000;
    setEligibilityCheck({
      eligible,
      tier: 'retail',
      violations: eligible
        ? []
        : [{ rule: 'VARA_MIN_INVESTMENT', severity: 'BLOCK', message: `Amount ${amount} is outside allowed range` }],
      maxAllowedAmount: eligible ? 500000 - amount : 0,
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Investor Tiers</h1>
              {isLive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
                  </span>
                  LIVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/10 border border-gray-500/20 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                  DEMO
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">VARA-compliant tier plans per property</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Plan
        </button>
      </div>

      {/* Create Plan Form */}
      {showForm && (
        <div className="rounded-xl border border-primary/20 bg-white/5 backdrop-blur-sm p-6">
          <h3 className="text-white font-medium mb-4">New Tier Plan</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tier</label>
              <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/40">
                <option value="retail">Retail</option>
                <option value="qualified">Qualified</option>
                <option value="professional">Professional</option>
                <option value="institutional">Institutional</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Plan Name</label>
              <input type="text" placeholder="e.g. Custom Retail Plan" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/40" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Min Investment (AED)</label>
              <input type="number" placeholder="1000" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/40" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Max Investment (AED)</label>
              <input type="number" placeholder="500000" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/40" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="px-4 py-2 bg-primary text-black rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              Save Plan
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tier Plans Grid */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">VARA Tier Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
      </div>

      {/* Eligibility Checker */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Eligibility Checker</h2>
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Investor ID</label>
            <input
              type="text"
              value={checkInvestorId}
              onChange={(e) => setCheckInvestorId(e.target.value)}
              placeholder="e.g. inv-101"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/40"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Amount (AED)</label>
            <input
              type="number"
              value={checkAmount}
              onChange={(e) => setCheckAmount(e.target.value)}
              placeholder="50000"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/40"
            />
          </div>
          <button
            onClick={handleCheckEligibility}
            className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 rounded-lg text-sm transition-colors whitespace-nowrap"
          >
            Check
          </button>
        </div>

        {eligibilityCheck && (
          <div className={`mt-4 p-4 rounded-lg border ${
            eligibilityCheck.eligible
              ? 'bg-green-500/5 border-green-500/20'
              : 'bg-red-500/5 border-red-500/20'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-semibold ${
                eligibilityCheck.eligible ? 'text-green-400' : 'text-red-400'
              }`}>
                {eligibilityCheck.eligible ? 'Eligible' : 'Not Eligible'}
              </span>
              <span className="text-xs text-gray-500">Tier: {eligibilityCheck.tier}</span>
            </div>
            {eligibilityCheck.violations.length > 0 && (
              <ul className="text-xs text-red-400 space-y-1">
                {eligibilityCheck.violations.map((v, i) => (
                  <li key={i}>[{v.severity}] {v.message}</li>
                ))}
              </ul>
            )}
            {eligibilityCheck.eligible && (
              <p className="text-xs text-gray-400">
                Max allowed: {eligibilityCheck.maxAllowedAmount.toLocaleString()} AED
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
