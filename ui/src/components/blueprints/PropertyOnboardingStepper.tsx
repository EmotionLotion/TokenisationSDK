/**
 * PropertyOnboardingStepper -- 18-step progress tracker that syncs with the
 * Backend Asset Module to move a property from "Due Diligence" through
 * "Tokenized" and into "Active Management".
 *
 * Each step maps to an SDK action (lifecycle transition, KYC, valuation, etc.)
 * and auto-advances on successful completion.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Building2,
  FileCheck,
  DollarSign,
  Scale,
  Globe,
  ShieldCheck,
  Users,
  Lock,
  Layers,
  Code2,
  Link2,
  Coins,
  UserCheck,
  ShoppingCart,
  Receipt,
  BookOpen,
  ArrowLeftRight,
  Banknote,
  CheckCircle,
  Circle,
  Loader2,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { sdkStore } from '../../store';
import { LifecycleState } from '@tokenisation/sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = 'pending' | 'active' | 'completed';

interface StepDef {
  title: string;
  description: string;
  icon: LucideIcon;
  action: (assetId: string) => Promise<void>;
}

interface SectionDef {
  label: string;
  steps: StepDef[];
}

export interface PropertyOnboardingStepperProps {
  assetId?: string;
  onStepComplete?: (stepIndex: number) => void;
  onComplete?: () => void;
  initialStep?: number;
}

// ---------------------------------------------------------------------------
// Step / Section Definitions
// ---------------------------------------------------------------------------

const SECTIONS: SectionDef[] = [
  {
    label: 'Due Diligence',
    steps: [
      {
        title: 'Property Identification',
        description: 'Select or create the property asset in the registry.',
        icon: Building2,
        action: async (assetId: string) => {
          const assets = sdkStore.getAssets();
          if (!assets.find(a => a.id === assetId)) {
            await sdkStore.createAsset({
              name: `Property ${assetId.slice(0, 8)}`,
              rightType: 'OWNERSHIP',
              jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
              issuerId: sdkStore.getParties()[0]?.id ?? 'system',
            });
          }
          sdkStore.logSdkCall('getAssets', { assetId });
        },
      },
      {
        title: 'Title Verification',
        description: 'Verify the property deed and ownership chain.',
        icon: FileCheck,
        action: async (assetId: string) => {
          const actor = sdkStore.getParties()[0]?.id ?? 'system';
          await sdkStore.transition(assetId, LifecycleState.PENDING_VERIFICATION, actor);
          sdkStore.logSdkCall('transition', { assetId, state: 'PENDING_VERIFICATION' });
        },
      },
      {
        title: 'Valuation Assessment',
        description: 'Submit oracle or third-party appraisal valuation.',
        icon: DollarSign,
        action: async (assetId: string) => {
          sdkStore.updateAssetValuation(assetId, 2_500_000);
          sdkStore.logSdkCall('updateAssetValuation', { assetId, value: 2_500_000 });
        },
      },
      {
        title: 'Legal Review',
        description: 'Review SPV structure and legal documentation.',
        icon: Scale,
        action: async (assetId: string) => {
          const actor = sdkStore.getParties()[0]?.id ?? 'system';
          await sdkStore.transition(assetId, LifecycleState.VERIFIED, actor);
          sdkStore.logSdkCall('transition', { assetId, state: 'VERIFIED' });
        },
      },
    ],
  },
  {
    label: 'Compliance Setup',
    steps: [
      {
        title: 'Jurisdiction Configuration',
        description: 'Set the regulatory framework and allowed jurisdictions.',
        icon: Globe,
        action: async (assetId: string) => {
          sdkStore.setAssetMetadata(assetId, 'jurisdiction', {
            primary: 'AE',
            framework: 'DFSA',
            allowed: ['AE', 'SG', 'GB', 'US'],
          });
          sdkStore.logSdkCall('setAssetMetadata', { assetId, key: 'jurisdiction' });
        },
      },
      {
        title: 'KYC Requirements',
        description: 'Define investor verification levels and thresholds.',
        icon: ShieldCheck,
        action: async (assetId: string) => {
          sdkStore.setAssetMetadata(assetId, 'kycRequirements', {
            minLevel: 'ENHANCED',
            accreditedOnly: true,
            amlCheck: true,
          });
          sdkStore.logSdkCall('setAssetMetadata', { assetId, key: 'kycRequirements' });
        },
      },
      {
        title: 'Whitelist Setup',
        description: 'Configure allowed investor whitelist.',
        icon: Users,
        action: async (assetId: string) => {
          const parties = sdkStore.getParties();
          sdkStore.setAssetMetadata(assetId, 'whitelist', parties.map(p => p.id));
          sdkStore.logSdkCall('setAssetMetadata', { assetId, key: 'whitelist' });
        },
      },
      {
        title: 'Transfer Rules',
        description: 'Set transfer restrictions, lock-up periods, and limits.',
        icon: Lock,
        action: async (assetId: string) => {
          sdkStore.setAssetMetadata(assetId, 'transferRules', {
            lockUpDays: 365,
            maxHoldersPerJurisdiction: 99,
            minTransferAmount: '1',
          });
          sdkStore.logSdkCall('setAssetMetadata', { assetId, key: 'transferRules' });
        },
      },
    ],
  },
  {
    label: 'Tokenization',
    steps: [
      {
        title: 'Token Structure',
        description: 'Define share count, price per share, and denomination.',
        icon: Layers,
        action: async (assetId: string) => {
          sdkStore.createOffering(assetId, {
            totalSupply: 10_000,
            pricePerToken: 250,
            minInvestment: 1_000,
            maxInvestment: 500_000,
            currency: 'USD',
          });
          sdkStore.logSdkCall('createOffering', { assetId, totalSupply: 10_000 });
        },
      },
      {
        title: 'Smart Contract Deployment',
        description: 'Deploy ERC-3643 compliant token contract.',
        icon: Code2,
        action: async (assetId: string) => {
          const actor = sdkStore.getParties()[0]?.id ?? 'system';
          await sdkStore.transition(assetId, LifecycleState.ACTIVE, actor);
          sdkStore.logSdkCall('transition', { assetId, state: 'ACTIVE' });
        },
      },
      {
        title: 'Compliance Module Binding',
        description: 'Attach on-chain compliance modules to the token.',
        icon: Link2,
        action: async (assetId: string) => {
          sdkStore.setAssetMetadata(assetId, 'complianceModules', [
            'KYC_VERIFICATION',
            'JURISDICTION_CHECK',
            'TRANSFER_LIMIT',
            'HOLDING_PERIOD',
          ]);
          sdkStore.logSdkCall('setAssetMetadata', { assetId, key: 'complianceModules' });
        },
      },
      {
        title: 'Token Minting',
        description: 'Mint the initial token supply to the issuer.',
        icon: Coins,
        action: async (assetId: string) => {
          const issuer = sdkStore.getParties()[0]?.id ?? 'system';
          await sdkStore.mint(assetId, issuer, '10000');
          sdkStore.logSdkCall('mint', { assetId, to: issuer, amount: '10000' });
        },
      },
    ],
  },
  {
    label: 'Distribution',
    steps: [
      {
        title: 'Investor Onboarding',
        description: 'Verify KYC for incoming investors.',
        icon: UserCheck,
        action: async () => {
          const parties = sdkStore.getParties();
          for (const party of parties) {
            sdkStore.verifyKyc(party.id);
          }
          sdkStore.logSdkCall('verifyKyc', { parties: parties.map(p => p.id) });
        },
      },
      {
        title: 'Primary Offering',
        description: 'Open the initial token sale to whitelisted investors.',
        icon: ShoppingCart,
        action: async (assetId: string) => {
          sdkStore.updateOfferingSold(assetId, 2_500);
          sdkStore.logSdkCall('updateOfferingSold', { assetId, amount: 2_500 });
        },
      },
      {
        title: 'Settlement Processing',
        description: 'Process purchases and settle fiat-to-token conversions.',
        icon: Receipt,
        action: async (assetId: string) => {
          const investor = sdkStore.getParties().find(p =>
            p.roles?.some((r: string) => r === 'INVESTOR'),
          ) ?? sdkStore.getParties()[1];
          if (investor) {
            sdkStore.createSettlement({
              assetId,
              partyId: investor.id,
              amount: 625_000,
              type: 'PRIMARY_PURCHASE',
            });
          }
          sdkStore.logSdkCall('createSettlement', { assetId, type: 'PRIMARY_PURCHASE' });
        },
      },
      {
        title: 'Registry Update',
        description: 'Update the on-chain holder registry.',
        icon: BookOpen,
        action: async (assetId: string) => {
          sdkStore.setAssetMetadata(assetId, 'registryUpdated', new Date().toISOString());
          sdkStore.logSdkCall('setAssetMetadata', { assetId, key: 'registryUpdated' });
        },
      },
    ],
  },
  {
    label: 'Active Management',
    steps: [
      {
        title: 'Secondary Trading',
        description: 'Enable peer-to-peer transfers on the secondary market.',
        icon: ArrowLeftRight,
        action: async (assetId: string) => {
          sdkStore.setAssetMetadata(assetId, 'secondaryTradingEnabled', true);
          sdkStore.logSdkCall('setAssetMetadata', { assetId, key: 'secondaryTradingEnabled' });
        },
      },
      {
        title: 'Dividend Distribution',
        description: 'Configure and initiate income distributions to holders.',
        icon: Banknote,
        action: async (assetId: string) => {
          sdkStore.setAssetMetadata(assetId, 'dividendConfig', {
            frequency: 'QUARTERLY',
            nextDistribution: new Date(Date.now() + 90 * 86_400_000).toISOString(),
            yieldBps: 650,
          });
          sdkStore.logSdkCall('setAssetMetadata', { assetId, key: 'dividendConfig' });
        },
      },
    ],
  },
];

// Flatten for index calculations
const ALL_STEPS = SECTIONS.flatMap(s => s.steps);
const TOTAL_STEPS = ALL_STEPS.length;

// Build section range map: sectionIndex -> [startGlobal, endGlobal)
const SECTION_RANGES: { start: number; end: number }[] = [];
{
  let cursor = 0;
  for (const section of SECTIONS) {
    SECTION_RANGES.push({ start: cursor, end: cursor + section.steps.length });
    cursor += section.steps.length;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PropertyOnboardingStepper({
  assetId = 'property-demo',
  onStepComplete,
  onComplete,
  initialStep = 0,
}: PropertyOnboardingStepperProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>(
    () => Array.from({ length: TOTAL_STEPS }, (_, i) => i < initialStep),
  );
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());

  const completedCount = useMemo(
    () => completedSteps.filter(Boolean).length,
    [completedSteps],
  );
  const progressPct = Math.round((completedCount / TOTAL_STEPS) * 100);

  const getStepStatus = useCallback(
    (globalIndex: number): StepStatus => {
      if (completedSteps[globalIndex]) return 'completed';
      if (globalIndex === currentStep) return 'active';
      return 'pending';
    },
    [completedSteps, currentStep],
  );

  const toggleSection = (sectionIndex: number) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionIndex)) next.delete(sectionIndex);
      else next.add(sectionIndex);
      return next;
    });
  };

  const handleAction = async (globalIndex: number) => {
    if (processing) return;
    setProcessing(true);
    setError(null);

    try {
      await ALL_STEPS[globalIndex].action(assetId);

      setCompletedSteps(prev => {
        const next = [...prev];
        next[globalIndex] = true;
        return next;
      });

      onStepComplete?.(globalIndex);

      // Auto-advance
      if (globalIndex + 1 < TOTAL_STEPS) {
        setCurrentStep(globalIndex + 1);
      } else {
        onComplete?.();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Step action failed';
      setError(msg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* ---- Progress Header ---- */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">Property Onboarding</h2>
          <span className="text-sm font-semibold text-gray-300">
            {completedCount}/{TOTAL_STEPS} steps
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <p className="mt-1.5 text-xs text-gray-500 text-right">{progressPct}% complete</p>
      </div>

      {/* ---- Error Banner ---- */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ---- Sections & Steps ---- */}
      <div className="space-y-4">
        {SECTIONS.map((section, sectionIdx) => {
          const range = SECTION_RANGES[sectionIdx];
          const isCollapsed = collapsedSections.has(sectionIdx);
          const sectionCompleted = completedSteps
            .slice(range.start, range.end)
            .every(Boolean);
          const sectionHasActive =
            currentStep >= range.start && currentStep < range.end;

          return (
            <div key={section.label} className="rounded-xl border border-white/10 overflow-hidden">
              {/* Section header */}
              <button
                onClick={() => toggleSection(sectionIdx)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="text-xs uppercase tracking-widest font-semibold text-gray-400">
                    {section.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {sectionCompleted ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : sectionHasActive ? (
                    <Circle className="w-4 h-4 text-blue-400 animate-pulse" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-600" />
                  )}
                  <span className="text-[10px] text-gray-500">
                    {completedSteps.slice(range.start, range.end).filter(Boolean).length}/
                    {range.end - range.start}
                  </span>
                </div>
              </button>

              {/* Steps */}
              {!isCollapsed && (
                <div className="divide-y divide-white/5">
                  {section.steps.map((step, stepIdx) => {
                    const globalIndex = range.start + stepIdx;
                    const status = getStepStatus(globalIndex);
                    const Icon = step.icon;

                    return (
                      <div
                        key={step.title}
                        className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                          status === 'active'
                            ? 'bg-blue-500/5'
                            : status === 'completed'
                              ? 'bg-green-500/[0.03]'
                              : 'bg-transparent'
                        }`}
                      >
                        {/* Step number / icon */}
                        <div
                          className={`mt-0.5 w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                            status === 'completed'
                              ? 'bg-green-500 text-white'
                              : status === 'active'
                                ? 'bg-blue-500 text-white'
                                : 'bg-white/10 text-gray-500'
                          }`}
                        >
                          {status === 'completed' ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <Icon className="w-4 h-4" />
                          )}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-medium ${
                              status === 'completed'
                                ? 'text-green-400'
                                : status === 'active'
                                  ? 'text-white'
                                  : 'text-gray-400'
                            }`}
                          >
                            {globalIndex + 1}. {step.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                            {step.description}
                          </p>
                        </div>

                        {/* Action button */}
                        <div className="shrink-0 mt-0.5">
                          {status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-green-400 font-medium">
                              <CheckCircle className="w-3.5 h-3.5" /> Done
                            </span>
                          ) : status === 'active' ? (
                            <button
                              disabled={processing}
                              onClick={() => handleAction(globalIndex)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed
                                text-white transition-colors"
                            >
                              {processing ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running...
                                </>
                              ) : (
                                'Execute'
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-600 font-medium">Pending</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- Completion Banner ---- */}
      {completedCount === TOTAL_STEPS && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-emerald-300">
            Property fully onboarded and active
          </p>
          <p className="text-xs text-gray-400 mt-1">
            All 18 steps completed. The asset is now tokenized with active secondary trading and
            dividend distribution configured.
          </p>
        </div>
      )}
    </div>
  );
}
