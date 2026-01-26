import { useState, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, Check, X, Building2, Leaf, Ticket, Coins,
  Award, FileText, Shield, Clock, Users, AlertTriangle, Eye, Loader2,
  ChevronDown, Plus, Trash2, Info, Zap, Lock, Globe, Calendar
} from 'lucide-react';
import { AssetTemplate, AssetProfile, DEFAULT_TEMPLATES, PROFILE_INFO } from './AssetTemplates';

// Step definitions
type WizardStep = 'template' | 'metadata' | 'rights' | 'rules' | 'preview';

const STEPS: { id: WizardStep; label: string; description: string }[] = [
  { id: 'template', label: 'Choose Template', description: 'Select an asset type' },
  { id: 'metadata', label: 'Asset Details', description: 'Fill in metadata' },
  { id: 'rights', label: 'Rights & Supply', description: 'Configure ownership' },
  { id: 'rules', label: 'Policy Rules', description: 'Set compliance rules' },
  { id: 'preview', label: 'Review & Issue', description: 'Confirm and deploy' },
];

// Available policy rules
const AVAILABLE_POLICIES = [
  { id: 'kyc_required', label: 'KYC Required', description: 'Recipients must complete identity verification', icon: Shield, category: 'compliance' },
  { id: 'accredited_investor', label: 'Accredited Investors Only', description: 'Restrict to accredited/qualified investors', icon: Award, category: 'compliance' },
  { id: 'jurisdiction_whitelist', label: 'Jurisdiction Whitelist', description: 'Only allow transfers to approved regions', icon: Globe, category: 'compliance' },
  { id: 'lockup_30d', label: '30-Day Lockup', description: 'Tokens cannot be transferred for 30 days', icon: Lock, category: 'transfer' },
  { id: 'lockup_90d', label: '90-Day Lockup', description: 'Tokens cannot be transferred for 90 days', icon: Lock, category: 'transfer' },
  { id: 'lockup_180d', label: '180-Day Lockup', description: 'Tokens cannot be transferred for 180 days', icon: Lock, category: 'transfer' },
  { id: 'max_holders', label: 'Max Holder Limit', description: 'Limit total number of token holders', icon: Users, category: 'transfer' },
  { id: 'resale_cap', label: 'Resale Price Cap', description: 'Cap the maximum resale price', icon: Coins, category: 'transfer' },
  { id: 'single_transfer', label: 'Single Transfer Only', description: 'Token can only be transferred once', icon: ArrowRight, category: 'transfer' },
  { id: 'non_transferable', label: 'Non-Transferable (SBT)', description: 'Token cannot be transferred after issuance', icon: Lock, category: 'transfer' },
  { id: 'issuer_revocable', label: 'Issuer Can Revoke', description: 'Issuer retains ability to revoke tokens', icon: X, category: 'lifecycle' },
  { id: 'expiry_12m', label: '12-Month Expiry', description: 'Tokens expire after 12 months', icon: Calendar, category: 'lifecycle' },
  { id: 'retirement_burn', label: 'Retirement = Burn', description: 'Retiring the asset burns the token', icon: Zap, category: 'lifecycle' },
  { id: 'event_expiry', label: 'Event-Based Expiry', description: 'Token expires after event date', icon: Clock, category: 'lifecycle' },
];

// Rights configuration
const AVAILABLE_RIGHTS = [
  { id: 'ownership', label: 'Ownership Rights', description: 'Token represents legal ownership of underlying asset' },
  { id: 'dividends', label: 'Dividend/Distribution Rights', description: 'Holder receives share of income/profits' },
  { id: 'voting', label: 'Voting Rights', description: 'Holder can vote on governance decisions' },
  { id: 'redemption', label: 'Redemption Rights', description: 'Token can be redeemed for underlying asset' },
  { id: 'access', label: 'Access Rights', description: 'Token grants access to service/event/content' },
  { id: 'royalties', label: 'Royalty Rights', description: 'Holder receives royalty payments' },
];

interface CreateAssetWizardProps {
  onClose: () => void;
  onComplete: (assetData: AssetCreationData) => void;
  initialTemplate?: AssetTemplate;
}

export interface AssetCreationData {
  template: AssetTemplate;
  metadata: Record<string, string>;
  supply: {
    type: 'fixed' | 'capped' | 'unlimited';
    total?: number;
    initial?: number;
  };
  rights: string[];
  policies: string[];
  jurisdiction?: string;
}

export function CreateAssetWizard({ onClose, onComplete, initialTemplate }: CreateAssetWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(initialTemplate ? 'metadata' : 'template');
  const [selectedTemplate, setSelectedTemplate] = useState<AssetTemplate | null>(initialTemplate || null);
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [supplyType, setSupplyType] = useState<'fixed' | 'capped' | 'unlimited'>('fixed');
  const [totalSupply, setTotalSupply] = useState<string>('1000000');
  const [initialSupply, setInitialSupply] = useState<string>('100000');
  const [selectedRights, setSelectedRights] = useState<string[]>(['ownership']);
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [jurisdiction, setJurisdiction] = useState<string>('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<AssetProfile | 'all'>('all');

  // Initialize policies from template
  useEffect(() => {
    if (selectedTemplate) {
      setSelectedPolicies(selectedTemplate.defaultPolicies);
      if (selectedTemplate.jurisdiction) {
        setJurisdiction(selectedTemplate.jurisdiction);
      }
    }
  }, [selectedTemplate]);

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  const canProceed = () => {
    switch (currentStep) {
      case 'template':
        return selectedTemplate !== null;
      case 'metadata':
        if (!selectedTemplate) return false;
        return selectedTemplate.schema.required.every(field => metadata[field]?.trim());
      case 'rights':
        return selectedRights.length > 0;
      case 'rules':
        return true; // Policies are optional
      case 'preview':
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  const handleDeploy = async () => {
    if (!selectedTemplate) return;

    setIsDeploying(true);

    // Simulate deployment
    await new Promise(resolve => setTimeout(resolve, 2000));

    const assetData: AssetCreationData = {
      template: selectedTemplate,
      metadata,
      supply: {
        type: supplyType,
        total: supplyType !== 'unlimited' ? parseInt(totalSupply) : undefined,
        initial: parseInt(initialSupply),
      },
      rights: selectedRights,
      policies: selectedPolicies,
      jurisdiction: jurisdiction || undefined,
    };

    onComplete(assetData);
  };

  const getIcon = (iconName: string, className: string) => {
    switch (iconName) {
      case 'building': return <Building2 className={className} />;
      case 'leaf': return <Leaf className={className} />;
      case 'ticket': return <Ticket className={className} />;
      case 'coins': return <Coins className={className} />;
      case 'file': return <FileText className={className} />;
      case 'award': return <Award className={className} />;
      default: return <FileText className={className} />;
    }
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      green: 'bg-green-500/10 text-green-400 border-green-500/20',
      purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    };
    return colors[color] || colors.blue;
  };

  const filteredTemplates = DEFAULT_TEMPLATES.filter(t => {
    const matchesProfile = selectedProfile === 'all' || t.profile === selectedProfile;
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesProfile && matchesSearch;
  });

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'template':
        return (
          <div className="space-y-6">
            {/* Profile Filter */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedProfile('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedProfile === 'all'
                    ? 'bg-[#F8B032]/20 text-[#F8B032] border border-[#F8B032]/30'
                    : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                }`}
              >
                All
              </button>
              {Object.entries(PROFILE_INFO).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => setSelectedProfile(key as AssetProfile)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedProfile === key
                      ? 'bg-[#F8B032]/20 text-[#F8B032] border border-[#F8B032]/30'
                      : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {info.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
            />

            {/* Templates Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedTemplate?.id === template.id
                      ? 'border-[#F8B032] bg-[#F8B032]/10'
                      : 'border-white/10 hover:border-white/20 bg-white/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${getColorClasses(template.color)}`}>
                      {getIcon(template.icon, 'w-5 h-5')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white">{template.name}</h4>
                      <p className="text-xs text-gray-400 line-clamp-1">{template.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-gray-500">
                          {template.tokenStandard}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {PROFILE_INFO[template.profile].label}
                        </span>
                      </div>
                    </div>
                    {selectedTemplate?.id === template.id && (
                      <Check className="w-5 h-5 text-[#F8B032]" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Custom Template Option */}
            <div
              onClick={() => {
                // Create a custom template
                const customTemplate: AssetTemplate = {
                  id: 'custom',
                  name: 'Custom Asset',
                  description: 'Create a custom asset with your own schema',
                  profile: 'simple_fungible',
                  icon: 'file',
                  color: 'cyan',
                  schema: { required: ['name', 'symbol'], optional: ['description'] },
                  defaultPolicies: [],
                  lifecycleActions: ['issue', 'transfer'],
                  tokenStandard: 'ERC20',
                  createdAt: new Date().toISOString(),
                  usageCount: 0,
                };
                setSelectedTemplate(customTemplate);
              }}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedTemplate?.id === 'custom'
                  ? 'border-[#F8B032] bg-[#F8B032]/10'
                  : 'border-dashed border-white/20 hover:border-white/40 bg-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center border border-dashed border-white/30">
                  <Plus className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <h4 className="font-medium text-white">Custom Template</h4>
                  <p className="text-xs text-gray-400">Start from scratch with your own schema</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'metadata':
        if (!selectedTemplate) return null;
        return (
          <div className="space-y-6">
            {/* Template Info */}
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${getColorClasses(selectedTemplate.color)}`}>
                {getIcon(selectedTemplate.icon, 'w-5 h-5')}
              </div>
              <div>
                <h4 className="font-medium text-white">{selectedTemplate.name}</h4>
                <p className="text-xs text-gray-400">{PROFILE_INFO[selectedTemplate.profile].label}</p>
              </div>
            </div>

            {/* Required Fields */}
            <div>
              <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <span className="text-red-400">*</span> Required Fields
              </h4>
              <div className="space-y-3">
                {selectedTemplate.schema.required.map((field) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-400 mb-1.5 capitalize">
                      {field.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                    <input
                      type="text"
                      value={metadata[field] || ''}
                      onChange={(e) => setMetadata({ ...metadata, [field]: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
                      placeholder={`Enter ${field.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Optional Fields */}
            {selectedTemplate.schema.optional.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-white mb-3">Optional Fields</h4>
                <div className="space-y-3">
                  {selectedTemplate.schema.optional.map((field) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-400 mb-1.5 capitalize">
                        {field.replace(/([A-Z])/g, ' $1').trim()}
                      </label>
                      <input
                        type="text"
                        value={metadata[field] || ''}
                        onChange={(e) => setMetadata({ ...metadata, [field]: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
                        placeholder={`Enter ${field.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'rights':
        return (
          <div className="space-y-6">
            {/* Supply Configuration */}
            <div className="glass-card p-4 rounded-xl border border-white/10">
              <h4 className="text-sm font-medium text-white mb-4">Token Supply</h4>

              <div className="space-y-4">
                {/* Supply Type */}
                <div className="flex gap-2">
                  {(['fixed', 'capped', 'unlimited'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setSupplyType(type)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        supplyType === type
                          ? 'bg-[#F8B032]/20 text-[#F8B032] border border-[#F8B032]/30'
                          : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Supply Inputs */}
                {supplyType !== 'unlimited' && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">
                      {supplyType === 'fixed' ? 'Total Supply' : 'Max Supply Cap'}
                    </label>
                    <input
                      type="number"
                      value={totalSupply}
                      onChange={(e) => setTotalSupply(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 text-white focus:outline-none focus:border-[#F8B032]/50 transition-colors"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Initial Issuance</label>
                  <input
                    type="number"
                    value={initialSupply}
                    onChange={(e) => setInitialSupply(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 text-white focus:outline-none focus:border-[#F8B032]/50 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Rights Selection */}
            <div>
              <h4 className="text-sm font-medium text-white mb-4">Token Rights</h4>
              <div className="space-y-2">
                {AVAILABLE_RIGHTS.map((right) => (
                  <div
                    key={right.id}
                    onClick={() => {
                      if (selectedRights.includes(right.id)) {
                        setSelectedRights(selectedRights.filter(r => r !== right.id));
                      } else {
                        setSelectedRights([...selectedRights, right.id]);
                      }
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedRights.includes(right.id)
                        ? 'border-[#F8B032]/50 bg-[#F8B032]/10'
                        : 'border-white/10 hover:border-white/20 bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                        selectedRights.includes(right.id)
                          ? 'border-[#F8B032] bg-[#F8B032]'
                          : 'border-white/30'
                      }`}>
                        {selectedRights.includes(right.id) && <Check className="w-3 h-3 text-black" />}
                      </div>
                      <div className="flex-1">
                        <h5 className="text-sm font-medium text-white">{right.label}</h5>
                        <p className="text-xs text-gray-400">{right.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'rules':
        const groupedPolicies = AVAILABLE_POLICIES.reduce((acc, policy) => {
          if (!acc[policy.category]) acc[policy.category] = [];
          acc[policy.category].push(policy);
          return acc;
        }, {} as Record<string, typeof AVAILABLE_POLICIES>);

        return (
          <div className="space-y-6">
            {/* Jurisdiction */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Jurisdiction (Optional)</label>
              <select
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 text-white focus:outline-none focus:border-[#F8B032]/50 transition-colors"
              >
                <option value="">No jurisdiction restriction</option>
                <option value="US">United States</option>
                <option value="AE">United Arab Emirates</option>
                <option value="UK">United Kingdom</option>
                <option value="SG">Singapore</option>
                <option value="EU">European Union</option>
                <option value="CH">Switzerland</option>
              </select>
            </div>

            {/* Policy Rules by Category */}
            {Object.entries(groupedPolicies).map(([category, policies]) => (
              <div key={category}>
                <h4 className="text-sm font-medium text-white mb-3 capitalize">
                  {category} Rules
                </h4>
                <div className="space-y-2">
                  {policies.map((policy) => {
                    const Icon = policy.icon;
                    return (
                      <div
                        key={policy.id}
                        onClick={() => {
                          if (selectedPolicies.includes(policy.id)) {
                            setSelectedPolicies(selectedPolicies.filter(p => p !== policy.id));
                          } else {
                            setSelectedPolicies([...selectedPolicies, policy.id]);
                          }
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedPolicies.includes(policy.id)
                            ? 'border-[#F8B032]/50 bg-[#F8B032]/10'
                            : 'border-white/10 hover:border-white/20 bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            selectedPolicies.includes(policy.id)
                              ? 'bg-[#F8B032]/20 text-[#F8B032]'
                              : 'bg-white/5 text-gray-400'
                          }`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <h5 className="text-sm font-medium text-white">{policy.label}</h5>
                            <p className="text-xs text-gray-400">{policy.description}</p>
                          </div>
                          <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                            selectedPolicies.includes(policy.id)
                              ? 'border-[#F8B032] bg-[#F8B032]'
                              : 'border-white/30'
                          }`}>
                            {selectedPolicies.includes(policy.id) && <Check className="w-3 h-3 text-black" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Selected Policies Summary */}
            {selectedPolicies.length > 0 && (
              <div className="bg-[#F8B032]/5 border border-[#F8B032]/20 rounded-xl p-4">
                <h4 className="text-sm font-medium text-[#F8B032] mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  {selectedPolicies.length} Rules Active
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedPolicies.map(policyId => {
                    const policy = AVAILABLE_POLICIES.find(p => p.id === policyId);
                    return policy ? (
                      <span key={policyId} className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300">
                        {policy.label}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        );

      case 'preview':
        if (!selectedTemplate) return null;
        return (
          <div className="space-y-6">
            {/* Asset Overview */}
            <div className="glass-card p-5 rounded-xl border border-white/10">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${getColorClasses(selectedTemplate.color)}`}>
                  {getIcon(selectedTemplate.icon, 'w-7 h-7')}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">
                    {metadata.name || metadata.propertyType || metadata.eventName || selectedTemplate.name}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">{selectedTemplate.description}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-xs bg-white/10 px-2 py-1 rounded text-gray-400">
                      {selectedTemplate.tokenStandard}
                    </span>
                    <span className="text-xs bg-white/10 px-2 py-1 rounded text-gray-400">
                      {PROFILE_INFO[selectedTemplate.profile].label}
                    </span>
                    {jurisdiction && (
                      <span className="text-xs bg-white/10 px-2 py-1 rounded text-gray-400">
                        {jurisdiction}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Metadata Summary */}
            <div className="glass-card p-4 rounded-xl border border-white/10">
              <h4 className="text-sm font-medium text-white mb-3">Asset Metadata</h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(metadata).filter(([_, v]) => v).map(([key, value]) => (
                  <div key={key} className="bg-white/5 rounded-lg p-2">
                    <p className="text-[10px] text-gray-500 uppercase">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-sm text-white truncate">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Supply & Rights */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-card p-4 rounded-xl border border-white/10">
                <h4 className="text-sm font-medium text-white mb-3">Token Supply</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Type</span>
                    <span className="text-sm text-white capitalize">{supplyType}</span>
                  </div>
                  {supplyType !== 'unlimited' && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-400">{supplyType === 'fixed' ? 'Total' : 'Max'}</span>
                      <span className="text-sm text-white">{parseInt(totalSupply).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Initial</span>
                    <span className="text-sm text-white">{parseInt(initialSupply).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl border border-white/10">
                <h4 className="text-sm font-medium text-white mb-3">Rights ({selectedRights.length})</h4>
                <div className="space-y-1">
                  {selectedRights.slice(0, 3).map(rightId => {
                    const right = AVAILABLE_RIGHTS.find(r => r.id === rightId);
                    return right ? (
                      <div key={rightId} className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-green-400" />
                        <span className="text-xs text-gray-300">{right.label}</span>
                      </div>
                    ) : null;
                  })}
                  {selectedRights.length > 3 && (
                    <p className="text-xs text-gray-500">+{selectedRights.length - 3} more</p>
                  )}
                </div>
              </div>
            </div>

            {/* Policies */}
            <div className="glass-card p-4 rounded-xl border border-white/10">
              <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#F8B032]" />
                Policy Rules ({selectedPolicies.length})
              </h4>
              {selectedPolicies.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedPolicies.map(policyId => {
                    const policy = AVAILABLE_POLICIES.find(p => p.id === policyId);
                    return policy ? (
                      <span key={policyId} className="text-xs bg-[#F8B032]/10 text-[#F8B032] px-2 py-1 rounded">
                        {policy.label}
                      </span>
                    ) : null;
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No policy rules configured</p>
              )}
            </div>

            {/* Lifecycle Actions */}
            <div className="glass-card p-4 rounded-xl border border-white/10">
              <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400" />
                Available Actions
              </h4>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.lifecycleActions.map(action => (
                  <span key={action} className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded capitalize">
                    {action}
                  </span>
                ))}
              </div>
            </div>

            {/* Warning */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-yellow-500">Review Carefully</h4>
                <p className="text-xs text-gray-400 mt-1">
                  Once deployed, the token contract and core rules cannot be changed. Make sure all details are correct.
                </p>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0A0E1A] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>
              Create New Asset
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {STEPS[currentStepIndex].description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                    index < currentStepIndex
                      ? 'bg-green-500 text-white'
                      : index === currentStepIndex
                        ? 'bg-[#F8B032] text-black'
                        : 'bg-white/10 text-gray-500'
                  }`}>
                    {index < currentStepIndex ? <Check className="w-4 h-4" /> : index + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${
                    index <= currentStepIndex ? 'text-white' : 'text-gray-500'
                  }`}>
                    {step.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`h-px flex-1 mx-2 ${
                    index < currentStepIndex ? 'bg-green-500' : 'bg-white/10'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {renderStepContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-white/10">
          <button
            onClick={currentStepIndex === 0 ? onClose : goBack}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {currentStepIndex === 0 ? 'Cancel' : 'Back'}
          </button>

          {currentStep === 'preview' ? (
            <button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] disabled:opacity-50 text-black rounded-xl font-medium transition-all"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Deploy Asset
                </>
              )}
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] disabled:opacity-50 disabled:cursor-not-allowed text-black rounded-xl font-medium transition-all"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { AVAILABLE_POLICIES, AVAILABLE_RIGHTS };
