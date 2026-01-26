/**
 * AssetClassWizard - Visual Asset Factory
 *
 * A visual tool to define new Asset Types without coding.
 * Flow: Select Template → Define Metadata → Attach Policy → Deploy
 */

import { useState } from 'react';
import {
  Box, Coins, Ticket, Award, Shield, FileText, ChevronRight,
  ChevronLeft, Check, Loader2, Sparkles, Lock, Users, Globe
} from 'lucide-react';
import { useSDK } from '../contexts/SDKContext';
import { RightType, TransferabilityMode, LifecycleState } from '@tokenisation/sdk';

// ============================================================================
// TYPES
// ============================================================================

interface AssetTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  rightType: RightType;
  color: string;
  bgColor: string;
  defaultTransferability: TransferabilityMode;
  examples: string[];
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
}

interface AssetFormData {
  template: AssetTemplate | null;
  name: string;
  symbol: string;
  description: string;
  supplyCap: string;
  jurisdiction: string;
  transferability: TransferabilityMode;
  requireKyc: boolean;
  lockupPeriod: number;
  policyId: string | null;
  metadata: Record<string, string>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TEMPLATES: AssetTemplate[] = [
  {
    id: 'loyalty-point',
    name: 'Loyalty Point',
    description: 'Fungible points for rewards programs',
    icon: Coins,
    rightType: RightType.BEHAVIOR,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    defaultTransferability: TransferabilityMode.UNRESTRICTED,
    examples: ['$AHOY Points', 'Airline Miles', 'Store Credits'],
  },
  {
    id: 'nft-pass',
    name: 'NFT Access Pass',
    description: 'Non-fungible tickets or memberships',
    icon: Ticket,
    rightType: RightType.ACCESS,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    defaultTransferability: TransferabilityMode.COMPLIANCE_GATED,
    examples: ['Event Tickets', 'VIP Passes', 'Memberships'],
  },
  {
    id: 'soulbound',
    name: 'Soulbound Credential',
    description: 'Non-transferable identity or achievement',
    icon: Award,
    rightType: RightType.VERIFICATION,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    defaultTransferability: TransferabilityMode.NON_TRANSFERABLE,
    examples: ['KYC Badge', 'Driver License', 'Certifications'],
  },
  {
    id: 'security-token',
    name: 'Security Token',
    description: 'Compliant ownership of real assets',
    icon: Shield,
    rightType: RightType.OWNERSHIP,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    defaultTransferability: TransferabilityMode.WHITELIST_ONLY,
    examples: ['Real Estate', 'Equity Shares', 'Revenue Rights'],
  },
  {
    id: 'utility-credit',
    name: 'Utility Credit',
    description: 'Verified utility or carbon credits',
    icon: Globe,
    rightType: RightType.VERIFICATION,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    defaultTransferability: TransferabilityMode.COMPLIANCE_GATED,
    examples: ['Water Credits', 'Carbon Offsets', 'Energy Certificates'],
  },
];

const STEPS: WizardStep[] = [
  { id: 'template', title: 'Select Template', description: 'Choose an asset type' },
  { id: 'metadata', title: 'Define Metadata', description: 'Name and configure' },
  { id: 'rules', title: 'Set Rules', description: 'Transfer & compliance' },
  { id: 'review', title: 'Review & Deploy', description: 'Confirm and create' },
];

const JURISDICTIONS = [
  { code: 'AE', name: 'UAE (VARA)' },
  { code: 'US', name: 'United States (SEC)' },
  { code: 'EU', name: 'European Union (MiFID)' },
  { code: 'SG', name: 'Singapore (MAS)' },
  { code: 'CH', name: 'Switzerland (FINMA)' },
];

// ============================================================================
// COMPONENT
// ============================================================================

interface AssetClassWizardProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: (asset: any) => void;
}

export function AssetClassWizard({ isOpen = true, onClose = () => {}, onSuccess }: AssetClassWizardProps) {
  const { createAsset, transitionAsset } = useSDK();
  const [currentStep, setCurrentStep] = useState(0);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const [formData, setFormData] = useState<AssetFormData>({
    template: null,
    name: '',
    symbol: '',
    description: '',
    supplyCap: '',
    jurisdiction: 'AE',
    transferability: TransferabilityMode.COMPLIANCE_GATED,
    requireKyc: true,
    lockupPeriod: 0,
    policyId: null,
    metadata: {},
  });

  if (!isOpen) return null;

  const handleTemplateSelect = (template: AssetTemplate) => {
    setFormData({
      ...formData,
      template,
      transferability: template.defaultTransferability,
    });
    setCurrentStep(1);
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleDeploy = async () => {
    if (!formData.template) return;

    setIsDeploying(true);
    setDeployError(null);

    try {
      // Create the asset using SDK
      const asset = await createAsset({
        name: formData.name,
        rightType: formData.template.rightType,
        description: formData.description,
        jurisdiction: formData.jurisdiction,
        transferabilityRules: {
          mode: formData.transferability,
          requireKyc: formData.requireKyc,
          lockupPeriodSeconds: formData.lockupPeriod * 86400, // Convert days to seconds
        },
        metadata: {
          symbol: formData.symbol,
          supplyCap: formData.supplyCap,
          templateId: formData.template.id,
          ...formData.metadata,
        },
      });

      // Transition to PENDING_VERIFICATION
      await transitionAsset(asset.id, LifecycleState.PENDING_VERIFICATION, 'wizard');

      onSuccess?.(asset);
      onClose();

      // Reset form
      setFormData({
        template: null,
        name: '',
        symbol: '',
        description: '',
        supplyCap: '',
        jurisdiction: 'AE',
        transferability: TransferabilityMode.COMPLIANCE_GATED,
        requireKyc: true,
        lockupPeriod: 0,
        policyId: null,
        metadata: {},
      });
      setCurrentStep(0);
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : 'Deployment failed');
    } finally {
      setIsDeploying(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.template !== null;
      case 1:
        return formData.name.length > 0 && formData.symbol.length > 0;
      case 2:
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-[#0F172A] border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-[#F8B032]/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F8B032]/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#F8B032]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Asset Factory</h2>
                <p className="text-sm text-gray-400">Create a new tokenized asset class</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-4">
            {STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      idx < currentStep
                        ? 'bg-[#F8B032] text-black'
                        : idx === currentStep
                        ? 'bg-[#F8B032]/20 text-[#F8B032] border border-[#F8B032]'
                        : 'bg-white/5 text-gray-500 border border-white/10'
                    }`}
                  >
                    {idx < currentStep ? <Check className="w-4 h-4" /> : idx + 1}
                  </div>
                  <div className="hidden sm:block">
                    <p className={`text-xs font-medium ${idx <= currentStep ? 'text-white' : 'text-gray-500'}`}>
                      {step.title}
                    </p>
                  </div>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`h-px flex-1 mx-2 ${idx < currentStep ? 'bg-[#F8B032]' : 'bg-white/10'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Step 0: Template Selection */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <p className="text-gray-400 mb-6">
                Select an asset template to get started. Each template comes with pre-configured defaults.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateSelect(template)}
                    className={`p-4 rounded-xl border text-left transition-all hover:-translate-y-1 ${
                      formData.template?.id === template.id
                        ? 'border-[#F8B032] bg-[#F8B032]/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg ${template.bgColor} flex items-center justify-center`}>
                        <template.icon className={`w-5 h-5 ${template.color}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-white">{template.name}</h3>
                        <p className="text-sm text-gray-400 mt-1">{template.description}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {template.examples.map((ex, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 bg-white/5 rounded text-gray-500">
                              {ex}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Metadata */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Asset Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Dubai Marina Property"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Symbol *</label>
                  <input
                    type="text"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    placeholder="e.g., DMP"
                    maxLength={6}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this asset class..."
                  rows={3}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Supply Cap</label>
                  <input
                    type="text"
                    value={formData.supplyCap}
                    onChange={(e) => setFormData({ ...formData, supplyCap: e.target.value })}
                    placeholder="e.g., 1000000 (or leave empty for unlimited)"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Jurisdiction</label>
                  <select
                    value={formData.jurisdiction}
                    onChange={(e) => setFormData({ ...formData, jurisdiction: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#F8B032]/50"
                  >
                    {JURISDICTIONS.map((j) => (
                      <option key={j.code} value={j.code} className="bg-[#0F172A]">
                        {j.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Rules */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">Transferability Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { mode: TransferabilityMode.UNRESTRICTED, label: 'Unrestricted', desc: 'Freely transferable', icon: Globe },
                    { mode: TransferabilityMode.WHITELIST_ONLY, label: 'Whitelist Only', desc: 'Pre-approved addresses', icon: Users },
                    { mode: TransferabilityMode.COMPLIANCE_GATED, label: 'Compliance Gated', desc: 'KYC + rules checked', icon: Shield },
                    { mode: TransferabilityMode.NON_TRANSFERABLE, label: 'Non-Transferable', desc: 'Soulbound token', icon: Lock },
                  ].map(({ mode, label, desc, icon: Icon }) => (
                    <button
                      key={mode}
                      onClick={() => setFormData({ ...formData, transferability: mode })}
                      className={`p-4 rounded-lg border text-left transition-all ${
                        formData.transferability === mode
                          ? 'border-[#F8B032] bg-[#F8B032]/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${formData.transferability === mode ? 'text-[#F8B032]' : 'text-gray-400'}`} />
                        <div>
                          <p className="font-medium text-white">{label}</p>
                          <p className="text-xs text-gray-500">{desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
                <div>
                  <p className="font-medium text-white">Require KYC Verification</p>
                  <p className="text-sm text-gray-500">Holders must pass identity verification</p>
                </div>
                <button
                  onClick={() => setFormData({ ...formData, requireKyc: !formData.requireKyc })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    formData.requireKyc ? 'bg-[#F8B032]' : 'bg-white/20'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    formData.requireKyc ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Lock-up Period (Days)</label>
                <input
                  type="number"
                  value={formData.lockupPeriod}
                  onChange={(e) => setFormData({ ...formData, lockupPeriod: parseInt(e.target.value) || 0 })}
                  min={0}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
                />
                <p className="text-xs text-gray-500 mt-1">Time tokens must be held before transfer (0 = no lock-up)</p>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && formData.template && (
            <div className="space-y-6">
              {deployError && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                  {deployError}
                </div>
              )}

              <div className="p-6 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-14 h-14 rounded-xl ${formData.template.bgColor} flex items-center justify-center`}>
                    <formData.template.icon className={`w-7 h-7 ${formData.template.color}`} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{formData.name}</h3>
                    <p className="text-sm text-gray-400">{formData.symbol} • {formData.template.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-black/20 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Right Type</p>
                    <p className="text-sm font-medium text-white mt-1">{formData.template.rightType}</p>
                  </div>
                  <div className="p-3 bg-black/20 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Jurisdiction</p>
                    <p className="text-sm font-medium text-white mt-1">
                      {JURISDICTIONS.find(j => j.code === formData.jurisdiction)?.name}
                    </p>
                  </div>
                  <div className="p-3 bg-black/20 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Transferability</p>
                    <p className="text-sm font-medium text-white mt-1">{formData.transferability.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="p-3 bg-black/20 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Supply Cap</p>
                    <p className="text-sm font-medium text-white mt-1">{formData.supplyCap || 'Unlimited'}</p>
                  </div>
                </div>

                {formData.description && (
                  <div className="mt-4 p-3 bg-black/20 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Description</p>
                    <p className="text-sm text-gray-300 mt-1">{formData.description}</p>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-4 text-sm">
                  <span className={`px-2 py-1 rounded ${formData.requireKyc ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                    {formData.requireKyc ? 'KYC Required' : 'No KYC'}
                  </span>
                  {formData.lockupPeriod > 0 && (
                    <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400">
                      {formData.lockupPeriod} day lock-up
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 bg-[#F8B032]/10 border border-[#F8B032]/20 rounded-lg">
                <p className="text-sm text-[#F8B032]">
                  <strong>Ready to Deploy:</strong> This will create the asset class and submit it for verification.
                  Once verified, you can mint tokens to this class.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={currentStep === 0 ? onClose : handleBack}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </button>

          {currentStep < STEPS.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="px-6 py-2 bg-[#F8B032] text-black font-bold rounded-lg hover:bg-[#F8B032]/90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="px-6 py-2 bg-[#F8B032] text-black font-bold rounded-lg hover:bg-[#F8B032]/90 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Deploy Asset Class
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
