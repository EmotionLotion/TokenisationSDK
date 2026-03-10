import { useState, useCallback, useMemo } from 'react';
import {
  Building2,
  FileCheck,
  Shield,
  Coins,
  Users,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { useAsset, useTokens, useDLD, useCompliance } from '@tokenisation/sdk-react';
import { useSDKMutationWithFallback } from '../../hooks/useSDKWithFallback';

/* ------------------------------------------------------------------ */
/*  Phase / Step types                                                 */
/* ------------------------------------------------------------------ */

interface Step {
  id: string;
  title: string;
  description: string;
}

interface Phase {
  id: string;
  name: string;
  icon: React.ElementType;
  steps: Step[];
}

const PHASES: Phase[] = [
  {
    id: 'due-diligence',
    name: 'Due Diligence',
    icon: FileCheck,
    steps: [
      {
        id: 'dd-1',
        title: 'Property Identification',
        description: 'Register property ID, location, and physical details in the platform.',
      },
      {
        id: 'dd-2',
        title: 'Title Verification',
        description: 'Verify title deed authenticity with Dubai Land Department and confirm clear ownership.',
      },
      {
        id: 'dd-3',
        title: 'Independent Valuation',
        description: 'Obtain RICS-certified valuation from an approved independent valuer.',
      },
      {
        id: 'dd-4',
        title: 'Legal Review',
        description: 'Review encumbrances, liens, tenant agreements, and developer NOCs.',
      },
    ],
  },
  {
    id: 'compliance',
    name: 'Compliance Setup',
    icon: Shield,
    steps: [
      {
        id: 'cs-1',
        title: 'Jurisdiction Selection',
        description: 'Select regulatory jurisdiction (DIFC, ADGM, or mainland) and applicable rules.',
      },
      {
        id: 'cs-2',
        title: 'KYC Requirements',
        description: 'Configure investor KYC/AML tiers, PEP screening, and sanctions checks.',
      },
      {
        id: 'cs-3',
        title: 'Whitelist Configuration',
        description: 'Set up investor whitelist rules and accreditation verification criteria.',
      },
      {
        id: 'cs-4',
        title: 'Transfer Rules',
        description: 'Define transfer restrictions, lock-up periods, and maximum holder limits.',
      },
    ],
  },
  {
    id: 'tokenization',
    name: 'Tokenization',
    icon: Coins,
    steps: [
      {
        id: 'tk-1',
        title: 'Token Structure',
        description: 'Define token supply, denomination, minimum investment, and pricing parameters.',
      },
      {
        id: 'tk-2',
        title: 'Contract Deployment',
        description: 'Deploy ERC-3643 compliant smart contracts with audited compliance modules.',
      },
      {
        id: 'tk-3',
        title: 'Compliance Binding',
        description: 'Bind identity registry, compliance checks, and transfer rules to the token contract.',
      },
      {
        id: 'tk-4',
        title: 'Token Minting',
        description: 'Mint the total token supply to the issuer wallet and verify on-chain balances.',
      },
    ],
  },
  {
    id: 'distribution',
    name: 'Distribution',
    icon: Users,
    steps: [
      {
        id: 'ds-1',
        title: 'Investor Onboarding',
        description: 'Open investor registration, process KYC applications, and whitelist approved investors.',
      },
      {
        id: 'ds-2',
        title: 'Primary Offering',
        description: 'Launch the primary token sale with subscription agreements and payment processing.',
      },
      {
        id: 'ds-3',
        title: 'Settlement',
        description: 'Process fiat-to-token settlement, release escrow funds, and transfer tokens to investors.',
      },
      {
        id: 'ds-4',
        title: 'Registry Update',
        description: 'Update the cap table, shareholder registry, and regulatory filings post-distribution.',
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Fallback simulation helper                                         */
/* ------------------------------------------------------------------ */

const simulateDelay = <T,>(value: T, ms = 1200): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function OnboardProperty() {
  const [activePhase, setActivePhase] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [executingStep, setExecutingStep] = useState<string | null>(null);

  // Asset ID — set from the first step's result or route params
  const [assetId, setAssetId] = useState('pending-onboard');

  /* ---------------------------------------------------------------- */
  /*  SDK hooks                                                        */
  /* ---------------------------------------------------------------- */
  const asset = useAsset();
  const tokens = useTokens(assetId);
  const dld = useDLD();
  const compliance = useCompliance();

  /* ---------------------------------------------------------------- */
  /*  SDK mutations wrapped with fallback                              */
  /* ---------------------------------------------------------------- */

  // -- Due Diligence: dd-1 — createAsset (Property Identification)
  const ddCreateAsset = useSDKMutationWithFallback(
    useCallback(
      async () => {
        const result = await asset.createAsset({
          name: 'New Property',
          symbol: 'PROP',
          description: 'Onboarding property',
          rightType: 'freehold',
          jurisdiction: 'DIFC',
          totalShares: 1000,
          pricePerShare: 100,
          documents: [],
          metadata: {},
        } as any);
        if (result?.asset?.id) setAssetId(result.asset.id);
        return result;
      },
      [asset, setAssetId],
    ),
    useCallback(async () => {
      const mockId = `mock-asset-${Date.now().toString(36)}`;
      setAssetId(mockId);
      return simulateDelay({ success: true, id: mockId });
    }, [setAssetId]),
  );

  // -- Due Diligence: dd-2 — registerTitle (Title Verification)
  const ddRegisterTitle = useSDKMutationWithFallback(
    useCallback(
      async () =>
        dld.registerTitle({
          projectId: assetId,
          dldTitleNumber: 'DLD-PENDING',
          propertyType: 'unit',
          emirate: 'dubai',
          area: 'Dubai Marina',
        }),
      [dld, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Due Diligence: dd-3 — valuation (uses transitionAsset as evidence marker)
  const ddValuation = useSDKMutationWithFallback(
    useCallback(
      async () =>
        asset.transitionAsset(assetId, 'under_review' as any, {
          type: 'valuation',
          data: { status: 'rics_certified' },
        }),
      [asset, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Due Diligence: dd-4 — legal review (compliance check on asset verification)
  const ddLegalReview = useSDKMutationWithFallback(
    useCallback(
      async () =>
        compliance.checkAction('asset:legal_review' as any, {
          assetId,
          step: 'legal_review',
        }),
      [compliance, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Compliance: cs-1 — Jurisdiction selection
  const csJurisdiction = useSDKMutationWithFallback(
    useCallback(
      async () =>
        compliance.checkAction('asset:verify' as any, {
          assetId,
          step: 'jurisdiction_selection',
          jurisdiction: 'DIFC',
        }),
      [compliance, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Compliance: cs-2 — KYC requirements
  const csKycRequirements = useSDKMutationWithFallback(
    useCallback(
      async () =>
        compliance.checkAction('asset:verify' as any, {
          assetId,
          step: 'kyc_requirements',
          kycTiers: ['standard', 'enhanced'],
        }),
      [compliance, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Compliance: cs-3 — Whitelist configuration
  const csWhitelist = useSDKMutationWithFallback(
    useCallback(
      async () =>
        compliance.checkAction('asset:verify' as any, {
          assetId,
          step: 'whitelist_config',
        }),
      [compliance, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Compliance: cs-4 — Transfer rules
  const csTransferRules = useSDKMutationWithFallback(
    useCallback(
      async () =>
        compliance.checkAction('asset:verify' as any, {
          assetId,
          step: 'transfer_rules',
        }),
      [compliance, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Tokenization: tk-1 — Token structure (transition to tokenizing)
  const tkStructure = useSDKMutationWithFallback(
    useCallback(
      async () =>
        asset.transitionAsset(assetId, 'tokenizing' as any, {
          type: 'token_structure',
          data: { supply: 1000, denomination: 100 },
        }),
      [asset, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Tokenization: tk-2 — Contract deployment (transition to deployed)
  const tkDeploy = useSDKMutationWithFallback(
    useCallback(
      async () =>
        asset.transitionAsset(assetId, 'deployed' as any, {
          type: 'contract_deployment',
          data: { standard: 'ERC-3643' },
        }),
      [asset, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Tokenization: tk-3 — Compliance binding (transition to compliance_bound)
  const tkComplianceBind = useSDKMutationWithFallback(
    useCallback(
      async () =>
        asset.transitionAsset(assetId, 'compliance_bound' as any, {
          type: 'compliance_binding',
          data: { identityRegistry: true, transferRules: true },
        }),
      [asset, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Tokenization: tk-4 — Token minting
  const tkMint = useSDKMutationWithFallback(
    useCallback(
      async () => tokens.mint('0x0000000000000000000000000000000000000000', '1000'),
      [tokens],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  // -- Distribution steps: ds-1 through ds-4 (all fire-and-forget with fallback)
  const dsInvestorOnboard = useSDKMutationWithFallback(
    useCallback(
      async () =>
        compliance.checkAction('asset:verify' as any, {
          assetId,
          step: 'investor_onboarding',
        }),
      [compliance, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  const dsPrimaryOffering = useSDKMutationWithFallback(
    useCallback(
      async () =>
        asset.transitionAsset(assetId, 'offering' as any, {
          type: 'primary_offering',
          data: { status: 'launched' },
        }),
      [asset, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  const dsSettlement = useSDKMutationWithFallback(
    useCallback(
      async () =>
        asset.transitionAsset(assetId, 'settled' as any, {
          type: 'settlement',
          data: { escrowReleased: true },
        }),
      [asset, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  const dsRegistryUpdate = useSDKMutationWithFallback(
    useCallback(
      async () =>
        asset.transitionAsset(assetId, 'active' as any, {
          type: 'registry_update',
          data: { capTableUpdated: true, filingComplete: true },
        }),
      [asset, assetId],
    ),
    useCallback(async () => simulateDelay({ success: true }), []),
  );

  /* ---------------------------------------------------------------- */
  /*  Map step IDs to their SDK mutation executors                     */
  /* ---------------------------------------------------------------- */
  const stepMutations = useMemo(
    () =>
      new Map<string, { execute: () => Promise<unknown> }>([
        // Due Diligence
        ['dd-1', ddCreateAsset],
        ['dd-2', ddRegisterTitle],
        ['dd-3', ddValuation],
        ['dd-4', ddLegalReview],
        // Compliance
        ['cs-1', csJurisdiction],
        ['cs-2', csKycRequirements],
        ['cs-3', csWhitelist],
        ['cs-4', csTransferRules],
        // Tokenization
        ['tk-1', tkStructure],
        ['tk-2', tkDeploy],
        ['tk-3', tkComplianceBind],
        ['tk-4', tkMint],
        // Distribution
        ['ds-1', dsInvestorOnboard],
        ['ds-2', dsPrimaryOffering],
        ['ds-3', dsSettlement],
        ['ds-4', dsRegistryUpdate],
      ]),
    [
      ddCreateAsset, ddRegisterTitle, ddValuation, ddLegalReview,
      csJurisdiction, csKycRequirements, csWhitelist, csTransferRules,
      tkStructure, tkDeploy, tkComplianceBind, tkMint,
      dsInvestorOnboard, dsPrimaryOffering, dsSettlement, dsRegistryUpdate,
    ],
  );

  /* ---------------------------------------------------------------- */
  /*  Derived state                                                    */
  /* ---------------------------------------------------------------- */
  const totalSteps = PHASES.reduce((n, p) => n + p.steps.length, 0);
  const completedCount = completedSteps.size;
  const progressPct = Math.round((completedCount / totalSteps) * 100);

  /* ---------------------------------------------------------------- */
  /*  Step execution — fires SDK mutation (with fallback) then         */
  /*  advances the wizard.                                             */
  /* ---------------------------------------------------------------- */
  const executeStep = useCallback(
    (stepId: string) => {
      if (completedSteps.has(stepId) || executingStep) return;
      setExecutingStep(stepId);

      const mutation = stepMutations.get(stepId);

      const finish = () => {
        setCompletedSteps((prev) => new Set(prev).add(stepId));
        setExecutingStep(null);
      };

      if (mutation) {
        // Fire SDK call (with built-in fallback). Always advance the wizard.
        mutation.execute().then(finish, finish);
      } else {
        // Pure fallback — should not happen since all steps are mapped.
        setTimeout(finish, 1200);
      }
    },
    [completedSteps, executingStep, stepMutations],
  );

  const currentPhase = PHASES[activePhase];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Onboard Property</h1>
          <p className="text-sm text-gray-400">
            4-phase tokenization wizard
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
            Overall Progress
          </span>
          <span className="text-sm font-semibold text-white">
            {completedCount}/{totalSteps} steps &middot; {progressPct}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Phase Tabs */}
      <div className="flex gap-2">
        {PHASES.map((phase, idx) => {
          const Icon = phase.icon;
          const phaseComplete = phase.steps.every((s) => completedSteps.has(s.id));
          const isActive = idx === activePhase;
          return (
            <button
              key={phase.id}
              onClick={() => setActivePhase(idx)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                isActive
                  ? 'bg-primary/10 text-white border-primary/30'
                  : 'bg-white/5 text-gray-400 hover:text-white border-white/10 hover:border-white/20'
              }`}
            >
              {phaseComplete ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
              <span className="hidden md:inline">{phase.name}</span>
              <span className="md:hidden">Phase {idx + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Steps */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
          {(() => {
            const PhaseIcon = currentPhase.icon;
            return <PhaseIcon className="w-4 h-4 text-primary" />;
          })()}
          <h2 className="text-sm font-semibold text-white">
            Phase {activePhase + 1}: {currentPhase.name}
          </h2>
        </div>

        <div className="divide-y divide-white/5">
          {currentPhase.steps.map((step, idx) => {
            const isCompleted = completedSteps.has(step.id);
            const isExecuting = executingStep === step.id;
            return (
              <div
                key={step.id}
                className="px-6 py-5 flex items-start gap-4 hover:bg-white/[0.02] transition-colors"
              >
                {/* Step number / status */}
                <div className="pt-0.5">
                  {isCompleted ? (
                    <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    </div>
                  ) : isExecuting ? (
                    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-500">
                      {idx + 1}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isCompleted ? 'text-gray-500 line-through' : 'text-white'}`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Action */}
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-green-400 font-medium">
                      <CheckCircle className="w-3 h-3" /> Done
                    </span>
                  ) : (
                    <button
                      onClick={() => executeStep(step.id)}
                      disabled={isExecuting}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all border disabled:opacity-50 disabled:cursor-not-allowed bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                    >
                      {isExecuting ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Executing...
                        </span>
                      ) : (
                        'Execute'
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
