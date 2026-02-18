'use client';

import React, { useState, useMemo } from 'react';
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface AccreditationResult {
  qualified: boolean;
  category: 'accredited' | 'qualified_purchaser' | 'sophisticated' | 'retail';
  answers: Record<string, string | boolean | number>;
  completedAt: string;
}

export interface AccreditationQuestionnaireProps {
  investorType: 'individual' | 'entity';
  jurisdiction: string;
  onComplete: (result: AccreditationResult) => void;
  onCancel?: () => void;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

type StepId = 'income' | 'experience' | 'suitability' | 'professional' | 'review';

const STEPS: { id: StepId; title: string }[] = [
  { id: 'income', title: 'Income & Net Worth' },
  { id: 'experience', title: 'Investment Experience' },
  { id: 'suitability', title: 'Suitability' },
  { id: 'professional', title: 'Professional Status' },
  { id: 'review', title: 'Review & Submit' },
];

const ASSET_CLASS_OPTIONS = [
  'Public Equities',
  'Fixed Income',
  'Real Estate',
  'Private Equity',
  'Hedge Funds',
  'Venture Capital',
  'Digital Assets',
  'Commodities',
];

// ============================================================================
// Helpers
// ============================================================================

function computeCategory(answers: Record<string, string | boolean | number>): AccreditationResult['category'] {
  const annualIncome = Number(answers.annualIncome || 0);
  const jointIncome = Number(answers.jointIncome || 0);
  const netWorth = Number(answers.netWorth || 0);
  const entityAssets = Number(answers.entityAssets || 0);
  const isLicensedProfessional = answers.licensedProfessional === true;
  const isKnowledgeableEmployee = answers.knowledgeableEmployee === true;
  const investmentExperience = Number(answers.investmentExperience || 0);

  // Qualified purchaser: entity with >$25M or individual with >$5M investments
  if (entityAssets > 25_000_000 || netWorth > 5_000_000) {
    return 'qualified_purchaser';
  }

  // Accredited investor
  if (
    annualIncome >= 200_000 ||
    jointIncome >= 300_000 ||
    netWorth >= 1_000_000 ||
    entityAssets >= 5_000_000 ||
    isLicensedProfessional ||
    isKnowledgeableEmployee
  ) {
    return 'accredited';
  }

  // Sophisticated investor
  if (investmentExperience >= 5) {
    return 'sophisticated';
  }

  return 'retail';
}

// ============================================================================
// Component
// ============================================================================

export function AccreditationQuestionnaire({
  investorType,
  jurisdiction,
  onComplete,
  onCancel,
  className = '',
}: AccreditationQuestionnaireProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | boolean | number>>({});

  const updateAnswer = (key: string, value: string | boolean | number) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const toggleAssetClass = (assetClass: string) => {
    const current = String(answers.assetClasses || '');
    const classes = current ? current.split(',') : [];
    const index = classes.indexOf(assetClass);
    if (index >= 0) {
      classes.splice(index, 1);
    } else {
      classes.push(assetClass);
    }
    updateAnswer('assetClasses', classes.join(','));
  };

  const isAssetClassSelected = (assetClass: string): boolean => {
    const current = String(answers.assetClasses || '');
    return current.split(',').includes(assetClass);
  };

  const category = useMemo(() => computeCategory(answers), [answers]);
  const qualified = category !== 'retail';

  const canProceed = (): boolean => {
    const step = STEPS[currentStep];
    switch (step.id) {
      case 'income':
        if (investorType === 'individual') {
          return answers.annualIncome !== undefined && answers.netWorth !== undefined;
        }
        return answers.entityAssets !== undefined;
      case 'experience':
        return answers.investmentExperience !== undefined && answers.riskTolerance !== undefined;
      case 'suitability':
        return answers.investmentHorizon !== undefined && answers.liquidityNeeds !== undefined && answers.alternativesAllocation !== undefined;
      case 'professional':
        return answers.licensedProfessional !== undefined;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = () => {
    const result: AccreditationResult = {
      qualified,
      category,
      answers,
      completedAt: new Date().toISOString(),
    };
    onComplete(result);
  };

  // --------------------------------------------------------------------------
  // Step renderers
  // --------------------------------------------------------------------------

  const renderIncomeStep = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white mb-1">Income & Net Worth</h3>
        <p className="text-sm text-white/60">
          {investorType === 'individual'
            ? 'Provide your annual income and net worth to determine accreditation status.'
            : 'Provide entity financial details to determine qualification status.'}
        </p>
      </div>

      {investorType === 'individual' ? (
        <>
          <div>
            <label className="block text-xs text-white/60 mb-1">Annual Income (USD) *</label>
            <select
              value={String(answers.annualIncome ?? '')}
              onChange={(e) => updateAnswer('annualIncome', Number(e.target.value))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 transition-colors"
            >
              <option value="">Select range...</option>
              <option value="50000">Under $50,000</option>
              <option value="100000">$50,000 - $99,999</option>
              <option value="150000">$100,000 - $199,999</option>
              <option value="200000">$200,000 - $299,999</option>
              <option value="500000">$300,000 - $499,999</option>
              <option value="1000000">$500,000+</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-white/60 mb-1">Joint Income with Spouse (USD)</label>
            <select
              value={String(answers.jointIncome ?? '')}
              onChange={(e) => updateAnswer('jointIncome', Number(e.target.value))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 transition-colors"
            >
              <option value="">Select range...</option>
              <option value="100000">Under $100,000</option>
              <option value="200000">$100,000 - $299,999</option>
              <option value="300000">$300,000 - $499,999</option>
              <option value="500000">$500,000 - $999,999</option>
              <option value="1000000">$1,000,000+</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-white/60 mb-1">Net Worth (excluding primary residence, USD) *</label>
            <select
              value={String(answers.netWorth ?? '')}
              onChange={(e) => updateAnswer('netWorth', Number(e.target.value))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 transition-colors"
            >
              <option value="">Select range...</option>
              <option value="100000">Under $100,000</option>
              <option value="500000">$100,000 - $499,999</option>
              <option value="750000">$500,000 - $999,999</option>
              <option value="1000000">$1,000,000 - $4,999,999</option>
              <option value="5000000">$5,000,000+</option>
            </select>
          </div>
        </>
      ) : (
        <div>
          <label className="block text-xs text-white/60 mb-1">Total Entity Assets (USD) *</label>
          <select
            value={String(answers.entityAssets ?? '')}
            onChange={(e) => updateAnswer('entityAssets', Number(e.target.value))}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 transition-colors"
          >
            <option value="">Select range...</option>
            <option value="1000000">Under $1,000,000</option>
            <option value="3000000">$1,000,000 - $4,999,999</option>
            <option value="5000000">$5,000,000 - $24,999,999</option>
            <option value="25000000">$25,000,000+</option>
          </select>
        </div>
      )}
    </div>
  );

  const renderExperienceStep = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white mb-1">Investment Experience</h3>
        <p className="text-sm text-white/60">Tell us about your investment background and risk appetite.</p>
      </div>

      <div>
        <label className="block text-xs text-white/60 mb-1">Years of Investment Experience *</label>
        <select
          value={String(answers.investmentExperience ?? '')}
          onChange={(e) => updateAnswer('investmentExperience', Number(e.target.value))}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 transition-colors"
        >
          <option value="">Select...</option>
          <option value="0">None</option>
          <option value="1">1 - 2 years</option>
          <option value="3">3 - 4 years</option>
          <option value="5">5 - 9 years</option>
          <option value="10">10+ years</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-white/60 mb-2">Asset Classes Invested In</label>
        <div className="grid grid-cols-2 gap-2">
          {ASSET_CLASS_OPTIONS.map((ac) => (
            <button
              key={ac}
              type="button"
              onClick={() => toggleAssetClass(ac)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
                isAssetClassSelected(ac)
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                  : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
              }`}
            >
              {ac}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-white/60 mb-1">Risk Tolerance *</label>
        <div className="space-y-2">
          {(['conservative', 'moderate', 'aggressive'] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => updateAnswer('riskTolerance', level)}
              className={`w-full px-3 py-2.5 text-sm rounded-lg border transition-colors text-left ${
                answers.riskTolerance === level
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                  : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
              }`}
            >
              <span className="font-medium capitalize">{level}</span>
              <span className="block text-xs mt-0.5 opacity-70">
                {level === 'conservative' && 'Preserve capital, minimal risk'}
                {level === 'moderate' && 'Balanced growth and risk'}
                {level === 'aggressive' && 'Maximize returns, higher risk tolerance'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSuitabilityStep = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white mb-1">Suitability</h3>
        <p className="text-sm text-white/60">Help us understand your investment objectives and constraints.</p>
      </div>

      <div>
        <label className="block text-xs text-white/60 mb-1">Investment Horizon *</label>
        <select
          value={String(answers.investmentHorizon ?? '')}
          onChange={(e) => updateAnswer('investmentHorizon', e.target.value)}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 transition-colors"
        >
          <option value="">Select...</option>
          <option value="short">Short-term (under 1 year)</option>
          <option value="medium">Medium-term (1 - 5 years)</option>
          <option value="long">Long-term (5 - 10 years)</option>
          <option value="very_long">Very long-term (10+ years)</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-white/60 mb-1">Liquidity Needs *</label>
        <select
          value={String(answers.liquidityNeeds ?? '')}
          onChange={(e) => updateAnswer('liquidityNeeds', e.target.value)}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 transition-colors"
        >
          <option value="">Select...</option>
          <option value="high">High - May need funds at any time</option>
          <option value="moderate">Moderate - Some flexibility needed</option>
          <option value="low">Low - Funds can be locked for extended periods</option>
          <option value="none">None - Fully committed capital</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-white/60 mb-1">Portfolio Allocation to Alternatives (%) *</label>
        <select
          value={String(answers.alternativesAllocation ?? '')}
          onChange={(e) => updateAnswer('alternativesAllocation', Number(e.target.value))}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 transition-colors"
        >
          <option value="">Select...</option>
          <option value="0">0% - None</option>
          <option value="5">1% - 10%</option>
          <option value="15">11% - 25%</option>
          <option value="35">26% - 50%</option>
          <option value="75">Over 50%</option>
        </select>
      </div>
    </div>
  );

  const renderProfessionalStep = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white mb-1">Professional Status</h3>
        <p className="text-sm text-white/60">Certain professional qualifications may confer accredited investor status.</p>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 p-3 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:border-white/20 transition-colors">
          <input
            type="checkbox"
            checked={answers.licensedProfessional === true}
            onChange={(e) => updateAnswer('licensedProfessional', e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 accent-violet-500"
          />
          <div>
            <p className="text-sm text-white font-medium">Licensed Securities Professional</p>
            <p className="text-xs text-white/60 mt-0.5">
              Hold an active Series 7, Series 65, or Series 82 license in good standing.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:border-white/20 transition-colors">
          <input
            type="checkbox"
            checked={answers.knowledgeableEmployee === true}
            onChange={(e) => updateAnswer('knowledgeableEmployee', e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 accent-violet-500"
          />
          <div>
            <p className="text-sm text-white font-medium">Knowledgeable Employee of a Fund</p>
            <p className="text-xs text-white/60 mt-0.5">
              Executive officer, director, trustee, or advisory board member of the issuing fund.
            </p>
          </div>
        </label>

        {investorType === 'entity' && (
          <label className="flex items-start gap-3 p-3 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:border-white/20 transition-colors">
            <input
              type="checkbox"
              checked={answers.entityQualified === true}
              onChange={(e) => updateAnswer('entityQualified', e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 accent-violet-500"
            />
            <div>
              <p className="text-sm text-white font-medium">Entity with Assets Exceeding $5M</p>
              <p className="text-xs text-white/60 mt-0.5">
                Corporation, partnership, LLC, or trust not formed for the specific purpose of this investment.
              </p>
            </div>
          </label>
        )}
      </div>
    </div>
  );

  const renderReviewStep = () => {
    const CATEGORY_LABELS: Record<AccreditationResult['category'], { label: string; color: string; bg: string }> = {
      accredited: { label: 'Accredited Investor', color: 'text-green-400', bg: 'bg-green-500/10' },
      qualified_purchaser: { label: 'Qualified Purchaser', color: 'text-blue-400', bg: 'bg-blue-500/10' },
      sophisticated: { label: 'Sophisticated Investor', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
      retail: { label: 'Retail Investor', color: 'text-red-400', bg: 'bg-red-500/10' },
    };

    const cat = CATEGORY_LABELS[category];

    const summaryItems: { label: string; value: string }[] = [];

    if (investorType === 'individual') {
      if (answers.annualIncome !== undefined) {
        summaryItems.push({ label: 'Annual Income', value: `$${Number(answers.annualIncome).toLocaleString()}+` });
      }
      if (answers.jointIncome) {
        summaryItems.push({ label: 'Joint Income', value: `$${Number(answers.jointIncome).toLocaleString()}+` });
      }
      if (answers.netWorth !== undefined) {
        summaryItems.push({ label: 'Net Worth', value: `$${Number(answers.netWorth).toLocaleString()}+` });
      }
    } else {
      if (answers.entityAssets !== undefined) {
        summaryItems.push({ label: 'Entity Assets', value: `$${Number(answers.entityAssets).toLocaleString()}+` });
      }
    }

    if (answers.investmentExperience !== undefined) {
      summaryItems.push({ label: 'Experience', value: `${answers.investmentExperience} years` });
    }
    if (answers.riskTolerance) {
      summaryItems.push({ label: 'Risk Tolerance', value: String(answers.riskTolerance) });
    }
    if (answers.investmentHorizon) {
      summaryItems.push({ label: 'Investment Horizon', value: String(answers.investmentHorizon) });
    }
    if (answers.liquidityNeeds) {
      summaryItems.push({ label: 'Liquidity Needs', value: String(answers.liquidityNeeds) });
    }
    if (answers.alternativesAllocation !== undefined) {
      summaryItems.push({ label: 'Alternatives Allocation', value: `${answers.alternativesAllocation}%` });
    }
    if (answers.licensedProfessional) {
      summaryItems.push({ label: 'Licensed Professional', value: 'Yes' });
    }
    if (answers.knowledgeableEmployee) {
      summaryItems.push({ label: 'Knowledgeable Employee', value: 'Yes' });
    }
    if (answers.entityQualified) {
      summaryItems.push({ label: 'Entity >$5M Assets', value: 'Yes' });
    }

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white mb-1">Review & Submit</h3>
          <p className="text-sm text-white/60">Review your answers and confirm your accreditation determination.</p>
        </div>

        {/* Qualification result */}
        <div className={`p-4 rounded-lg border ${qualified ? 'border-green-500/20' : 'border-red-500/20'} ${cat.bg}`}>
          <div className="flex items-center gap-3">
            {qualified ? (
              <CheckCircle className="w-6 h-6 text-green-400 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className={`text-sm font-semibold ${cat.color}`}>{cat.label}</p>
              <p className="text-xs text-white/60 mt-0.5">
                {qualified
                  ? 'You meet the requirements to participate in this offering.'
                  : 'Based on your responses, you may not be eligible for certain private offerings.'}
              </p>
            </div>
          </div>
        </div>

        {/* Jurisdiction */}
        <div className="p-3 bg-white/5 rounded-lg flex items-center justify-between">
          <span className="text-xs text-white/60">Jurisdiction</span>
          <span className="text-sm text-white">{jurisdiction}</span>
        </div>

        {/* Summary */}
        <div className="space-y-2">
          {summaryItems.map((item) => (
            <div key={item.label} className="p-3 bg-white/5 rounded-lg flex items-center justify-between">
              <span className="text-xs text-white/60">{item.label}</span>
              <span className="text-sm text-white capitalize">{item.value}</span>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-2">
          <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-blue-400">
            By submitting, you certify that the information provided is accurate and complete. False statements may
            result in disqualification from the offering.
          </p>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // Step content
  // --------------------------------------------------------------------------

  const renderCurrentStep = () => {
    switch (STEPS[currentStep].id) {
      case 'income':
        return renderIncomeStep();
      case 'experience':
        return renderExperienceStep();
      case 'suitability':
        return renderSuitabilityStep();
      case 'professional':
        return renderProfessionalStep();
      case 'review':
        return renderReviewStep();
      default:
        return null;
    }
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <div
      className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden ${className}`}
      role="region"
      aria-label="Accreditation questionnaire"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-3">
        <Shield className="w-5 h-5 text-violet-400" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white">Accreditation Questionnaire</h3>
          <span className="inline-block text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-2 py-0.5 mt-0.5">
            {investorType === 'individual' ? 'Individual' : 'Entity'} &middot; {jurisdiction}
          </span>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider">
            Step {currentStep + 1} of {STEPS.length}
          </h4>
          <span className="text-xs text-white/40">
            {Math.round(((currentStep + 1) / STEPS.length) * 100)}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-1 mt-3">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1 flex-1">
              <div
                className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                  i < currentStep
                    ? 'bg-green-400'
                    : i === currentStep
                      ? 'bg-violet-400'
                      : 'bg-white/20'
                }`}
              />
              <span
                className={`text-xs truncate hidden sm:inline ${
                  i === currentStep ? 'text-white font-medium' : 'text-white/40'
                }`}
              >
                {step.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="p-4" aria-live="polite">
        {renderCurrentStep()}
      </div>

      {/* Footer navigation */}
      <div className="p-4 border-t border-white/10 flex items-center gap-3">
        {onCancel && currentStep === 0 ? (
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            Back
          </button>
        )}

        {isLastStep ? (
          <button
            onClick={handleSubmit}
            className="flex-1 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors text-sm font-bold flex items-center justify-center gap-1.5"
          >
            <CheckCircle className="w-4 h-4" aria-hidden="true" />
            Submit
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex-1 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            Continue
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
