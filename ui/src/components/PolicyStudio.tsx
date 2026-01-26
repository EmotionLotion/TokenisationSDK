import { useState } from 'react';
import {
  Shield, Plus, Trash2, Play, Check, X, AlertTriangle, ChevronDown,
  ChevronRight, Code, Eye, Copy, Save, History, Search, Filter,
  Users, Globe, Lock, Clock, Zap, ArrowRight, Info, Settings,
  FileText, CheckCircle, XCircle, AlertCircle, RefreshCw
} from 'lucide-react';

// Policy DSL Types
interface PolicyCondition {
  id: string;
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in' | 'not_in';
  value: string | string[];
}

interface Policy {
  id: string;
  name: string;
  description: string;
  trigger: 'issue' | 'transfer' | 'redeem' | 'retire' | 'expire' | 'distribute' | 'freeze';
  conditions: PolicyCondition[];
  effect: 'allow' | 'deny' | 'require';
  message: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Test Scenario Types
interface TestScenario {
  id: string;
  name: string;
  context: {
    action: string;
    identity: {
      kyc_status: 'pending' | 'verified' | 'revoked';
      risk_tier: 'low' | 'medium' | 'high';
      jurisdiction: string;
      type: 'individual' | 'company';
    };
    asset: {
      age_days: number;
      state: string;
      profile: string;
    };
  };
}

// Available fields for conditions
const CONDITION_FIELDS = [
  { id: 'identity.kyc_status', label: 'KYC Status', type: 'select', options: ['pending', 'verified', 'revoked'] },
  { id: 'identity.type', label: 'Identity Type', type: 'select', options: ['individual', 'company'] },
  { id: 'identity.risk_tier', label: 'Risk Tier', type: 'select', options: ['low', 'medium', 'high'] },
  { id: 'identity.jurisdiction', label: 'Jurisdiction', type: 'text' },
  { id: 'asset.age', label: 'Asset Age (days)', type: 'number' },
  { id: 'asset.state', label: 'Asset State', type: 'select', options: ['draft', 'active', 'frozen', 'expired'] },
  { id: 'asset.profile', label: 'Asset Profile', type: 'select', options: ['regulated_fungible', 'semi_fungible', 'unique', 'simple_fungible'] },
  { id: 'transaction.amount', label: 'Transaction Amount', type: 'number' },
  { id: 'holder.count', label: 'Holder Count', type: 'number' },
];

const OPERATORS = [
  { id: 'equals', label: '=', description: 'equals' },
  { id: 'not_equals', label: '!=', description: 'does not equal' },
  { id: 'greater_than', label: '>', description: 'greater than' },
  { id: 'less_than', label: '<', description: 'less than' },
  { id: 'contains', label: 'contains', description: 'contains' },
  { id: 'in', label: 'in', description: 'is one of' },
  { id: 'not_in', label: 'not in', description: 'is not one of' },
];

const TRIGGERS = [
  { id: 'issue', label: 'Issue', icon: Plus, description: 'When tokens are minted' },
  { id: 'transfer', label: 'Transfer', icon: ArrowRight, description: 'When tokens change ownership' },
  { id: 'redeem', label: 'Redeem', icon: RefreshCw, description: 'When tokens are claimed for underlying' },
  { id: 'retire', label: 'Retire', icon: Trash2, description: 'When tokens are burned with proof' },
  { id: 'expire', label: 'Expire', icon: Clock, description: 'When tokens auto-invalidate' },
  { id: 'distribute', label: 'Distribute', icon: Users, description: 'When payouts are made' },
  { id: 'freeze', label: 'Freeze', icon: Lock, description: 'When compliance action is taken' },
];

// Sample policies
const SAMPLE_POLICIES: Policy[] = [
  {
    id: 'pol_kyc_required',
    name: 'KYC Required for Transfer',
    description: 'Recipients must complete identity verification before receiving tokens',
    trigger: 'transfer',
    conditions: [
      { id: 'cond_1', field: 'identity.kyc_status', operator: 'not_equals', value: 'verified' }
    ],
    effect: 'deny',
    message: 'Recipient must be KYC verified',
    isActive: true,
    version: 1,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  },
  {
    id: 'pol_lockup_90d',
    name: '90-Day Lockup Period',
    description: 'Tokens cannot be transferred for 90 days after issuance',
    trigger: 'transfer',
    conditions: [
      { id: 'cond_1', field: 'asset.age', operator: 'less_than', value: '90' }
    ],
    effect: 'deny',
    message: 'Lockup period active - {remaining} days remaining',
    isActive: true,
    version: 2,
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-01-20T14:30:00Z'
  },
  {
    id: 'pol_jurisdiction_whitelist',
    name: 'Jurisdiction Whitelist',
    description: 'Only allow transfers to approved regions',
    trigger: 'transfer',
    conditions: [
      { id: 'cond_1', field: 'identity.jurisdiction', operator: 'not_in', value: ['US', 'AE', 'UK', 'SG', 'EU'] as unknown as string }
    ],
    effect: 'deny',
    message: 'Jurisdiction not approved for this asset',
    isActive: false,
    version: 1,
    createdAt: '2024-02-01T12:00:00Z',
    updatedAt: '2024-02-01T12:00:00Z'
  }
];

// Sample test scenarios
const SAMPLE_SCENARIOS: TestScenario[] = [
  {
    id: 'scenario_verified_user',
    name: 'Verified Individual (US)',
    context: {
      action: 'transfer',
      identity: { kyc_status: 'verified', risk_tier: 'low', jurisdiction: 'US', type: 'individual' },
      asset: { age_days: 120, state: 'active', profile: 'regulated_fungible' }
    }
  },
  {
    id: 'scenario_unverified_user',
    name: 'Unverified User',
    context: {
      action: 'transfer',
      identity: { kyc_status: 'pending', risk_tier: 'medium', jurisdiction: 'AE', type: 'individual' },
      asset: { age_days: 30, state: 'active', profile: 'regulated_fungible' }
    }
  },
  {
    id: 'scenario_lockup_active',
    name: 'During Lockup Period',
    context: {
      action: 'transfer',
      identity: { kyc_status: 'verified', risk_tier: 'low', jurisdiction: 'UK', type: 'company' },
      asset: { age_days: 45, state: 'active', profile: 'regulated_fungible' }
    }
  }
];

interface PolicyStudioProps {
  embedded?: boolean;
}

export function PolicyStudio({ embedded = false }: PolicyStudioProps) {
  const [policies, setPolicies] = useState<Policy[]>(SAMPLE_POLICIES);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDSLView, setShowDSLView] = useState(false);
  const [testResults, setTestResults] = useState<Map<string, { passed: boolean; reason?: string }>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTrigger, setFilterTrigger] = useState<string>('all');

  const filteredPolicies = policies.filter(policy => {
    const matchesSearch = policy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          policy.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTrigger = filterTrigger === 'all' || policy.trigger === filterTrigger;
    return matchesSearch && matchesTrigger;
  });

  const createNewPolicy = () => {
    const newPolicy: Policy = {
      id: `pol_${Date.now()}`,
      name: 'New Policy',
      description: 'Describe what this policy does',
      trigger: 'transfer',
      conditions: [],
      effect: 'deny',
      message: 'Action not allowed',
      isActive: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setPolicies([...policies, newPolicy]);
    setSelectedPolicy(newPolicy);
    setIsEditing(true);
  };

  const updatePolicy = (updates: Partial<Policy>) => {
    if (!selectedPolicy) return;
    const updated = { ...selectedPolicy, ...updates, updatedAt: new Date().toISOString() };
    setPolicies(policies.map(p => p.id === updated.id ? updated : p));
    setSelectedPolicy(updated);
  };

  const addCondition = () => {
    if (!selectedPolicy) return;
    const newCondition: PolicyCondition = {
      id: `cond_${Date.now()}`,
      field: 'identity.kyc_status',
      operator: 'equals',
      value: 'verified'
    };
    updatePolicy({ conditions: [...selectedPolicy.conditions, newCondition] });
  };

  const removeCondition = (conditionId: string) => {
    if (!selectedPolicy) return;
    updatePolicy({ conditions: selectedPolicy.conditions.filter(c => c.id !== conditionId) });
  };

  const updateCondition = (conditionId: string, updates: Partial<PolicyCondition>) => {
    if (!selectedPolicy) return;
    updatePolicy({
      conditions: selectedPolicy.conditions.map(c =>
        c.id === conditionId ? { ...c, ...updates } : c
      )
    });
  };

  const evaluatePolicy = (policy: Policy, scenario: TestScenario): { passed: boolean; reason?: string } => {
    // Simple policy evaluation logic
    if (policy.trigger !== scenario.context.action) {
      return { passed: true, reason: 'Policy trigger does not match action' };
    }

    for (const condition of policy.conditions) {
      const fieldParts = condition.field.split('.');
      let value: any = scenario.context;
      for (const part of fieldParts) {
        value = value?.[part];
      }

      let conditionMet = false;
      switch (condition.operator) {
        case 'equals':
          conditionMet = value === condition.value;
          break;
        case 'not_equals':
          conditionMet = value !== condition.value;
          break;
        case 'greater_than':
          conditionMet = Number(value) > Number(condition.value);
          break;
        case 'less_than':
          conditionMet = Number(value) < Number(condition.value);
          break;
        case 'in':
          conditionMet = Array.isArray(condition.value) && condition.value.includes(value);
          break;
        case 'not_in':
          conditionMet = Array.isArray(condition.value) && !condition.value.includes(value);
          break;
        default:
          conditionMet = false;
      }

      if (conditionMet && policy.effect === 'deny') {
        return { passed: false, reason: policy.message };
      }
    }

    return { passed: true };
  };

  const runTests = () => {
    const results = new Map<string, { passed: boolean; reason?: string }>();

    for (const scenario of SAMPLE_SCENARIOS) {
      // Check against all active policies
      let finalResult: { passed: boolean; reason?: string } = { passed: true };

      for (const policy of policies.filter(p => p.isActive)) {
        const result = evaluatePolicy(policy, scenario);
        if (!result.passed) {
          finalResult = result;
          break;
        }
      }

      results.set(scenario.id, finalResult);
    }

    setTestResults(results);
  };

  const generateDSL = (policy: Policy): string => {
    const conditions = policy.conditions.map(c => {
      const op = c.operator === 'equals' ? '==' :
                 c.operator === 'not_equals' ? '!=' :
                 c.operator === 'greater_than' ? '>' :
                 c.operator === 'less_than' ? '<' :
                 c.operator;
      return `  - ${c.field} ${op} ${Array.isArray(c.value) ? `[${c.value.join(', ')}]` : c.value}`;
    }).join('\n');

    return `when: ${policy.trigger}
if:
${conditions || '  - (no conditions)'}
then:
  ${policy.effect}: "${policy.message}"`;
  };

  const getTriggerIcon = (trigger: string) => {
    const found = TRIGGERS.find(t => t.id === trigger);
    return found ? found.icon : Shield;
  };

  return (
    <div className={`${embedded ? '' : 'space-y-6'}`}>
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>
              Policy Studio
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Create and test compliance rules for asset lifecycle actions
            </p>
          </div>
          <button
            onClick={createNewPolicy}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-xl font-medium transition-all hover:scale-105"
          >
            <Plus className="w-4 h-4" />
            Create Policy
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Policy List */}
        <div className="lg:col-span-1 space-y-4">
          {/* Search & Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search policies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setFilterTrigger('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  filterTrigger === 'all'
                    ? 'bg-[#F8B032]/20 text-[#F8B032]'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                All
              </button>
              {TRIGGERS.slice(0, 4).map(trigger => (
                <button
                  key={trigger.id}
                  onClick={() => setFilterTrigger(trigger.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    filterTrigger === trigger.id
                      ? 'bg-[#F8B032]/20 text-[#F8B032]'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {trigger.label}
                </button>
              ))}
            </div>
          </div>

          {/* Policy Cards */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredPolicies.map(policy => {
              const TriggerIcon = getTriggerIcon(policy.trigger);
              return (
                <div
                  key={policy.id}
                  onClick={() => {
                    setSelectedPolicy(policy);
                    setIsEditing(false);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedPolicy?.id === policy.id
                      ? 'border-[#F8B032]/50 bg-[#F8B032]/10'
                      : 'border-white/10 hover:border-white/20 bg-white/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      policy.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      <TriggerIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-white truncate">{policy.name}</h4>
                        {policy.isActive ? (
                          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Active</span>
                        ) : (
                          <span className="text-[10px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded">Draft</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{policy.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-gray-500">
                          {policy.trigger}
                        </span>
                        <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-gray-500">
                          {policy.conditions.length} conditions
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          policy.effect === 'deny' ? 'bg-red-500/10 text-red-400' :
                          policy.effect === 'allow' ? 'bg-green-500/10 text-green-400' :
                          'bg-yellow-500/10 text-yellow-400'
                        }`}>
                          {policy.effect}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredPolicies.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Shield className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No policies found</p>
              </div>
            )}
          </div>

          {embedded && (
            <button
              onClick={createNewPolicy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-white/20 hover:border-[#F8B032]/30 text-gray-400 hover:text-white rounded-xl font-medium transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Policy
            </button>
          )}
        </div>

        {/* Policy Editor */}
        <div className="lg:col-span-2">
          {selectedPolicy ? (
            <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
              {/* Editor Header */}
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowDSLView(false)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      !showDSLView ? 'bg-[#F8B032]/20 text-[#F8B032]' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Visual
                  </button>
                  <button
                    onClick={() => setShowDSLView(true)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                      showDSLView ? 'bg-[#F8B032]/20 text-[#F8B032]' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Code className="w-4 h-4" />
                    DSL
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generateDSL(selectedPolicy));
                    }}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                    title="Copy DSL"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isEditing ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    {isEditing ? 'Save' : 'Edit'}
                  </button>
                </div>
              </div>

              {/* Editor Content */}
              <div className="p-5 space-y-5">
                {showDSLView ? (
                  <pre className="bg-black/50 rounded-xl p-4 text-sm font-mono text-gray-300 overflow-x-auto">
                    {generateDSL(selectedPolicy)}
                  </pre>
                ) : (
                  <>
                    {/* Policy Name & Description */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Policy Name</label>
                        <input
                          type="text"
                          value={selectedPolicy.name}
                          onChange={(e) => updatePolicy({ name: e.target.value })}
                          disabled={!isEditing}
                          className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white disabled:opacity-50 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Description</label>
                        <textarea
                          value={selectedPolicy.description}
                          onChange={(e) => updatePolicy({ description: e.target.value })}
                          disabled={!isEditing}
                          rows={2}
                          className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white disabled:opacity-50 focus:outline-none focus:border-[#F8B032]/50 transition-colors resize-none"
                        />
                      </div>
                    </div>

                    {/* Trigger & Effect */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Trigger (When)</label>
                        <select
                          value={selectedPolicy.trigger}
                          onChange={(e) => updatePolicy({ trigger: e.target.value as Policy['trigger'] })}
                          disabled={!isEditing}
                          className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white disabled:opacity-50 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
                        >
                          {TRIGGERS.map(trigger => (
                            <option key={trigger.id} value={trigger.id}>{trigger.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Effect (Then)</label>
                        <select
                          value={selectedPolicy.effect}
                          onChange={(e) => updatePolicy({ effect: e.target.value as Policy['effect'] })}
                          disabled={!isEditing}
                          className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white disabled:opacity-50 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
                        >
                          <option value="allow">Allow</option>
                          <option value="deny">Deny</option>
                          <option value="require">Require</option>
                        </select>
                      </div>
                    </div>

                    {/* Conditions */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-xs text-gray-400">Conditions (If)</label>
                        {isEditing && (
                          <button
                            onClick={addCondition}
                            className="text-xs text-[#F8B032] hover:text-[#E8A633] flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Condition
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {selectedPolicy.conditions.map((condition, index) => (
                          <div key={condition.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                            <span className="text-xs text-gray-500 w-5">{index > 0 ? 'AND' : 'IF'}</span>
                            <select
                              value={condition.field}
                              onChange={(e) => updateCondition(condition.id, { field: e.target.value })}
                              disabled={!isEditing}
                              className="flex-1 bg-black/30 border border-white/10 rounded py-1.5 px-2 text-sm text-white disabled:opacity-50 focus:outline-none"
                            >
                              {CONDITION_FIELDS.map(field => (
                                <option key={field.id} value={field.id}>{field.label}</option>
                              ))}
                            </select>
                            <select
                              value={condition.operator}
                              onChange={(e) => updateCondition(condition.id, { operator: e.target.value as PolicyCondition['operator'] })}
                              disabled={!isEditing}
                              className="w-24 bg-black/30 border border-white/10 rounded py-1.5 px-2 text-sm text-white disabled:opacity-50 focus:outline-none"
                            >
                              {OPERATORS.map(op => (
                                <option key={op.id} value={op.id}>{op.label}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={Array.isArray(condition.value) ? condition.value.join(', ') : condition.value}
                              onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                              disabled={!isEditing}
                              className="w-32 bg-black/30 border border-white/10 rounded py-1.5 px-2 text-sm text-white disabled:opacity-50 focus:outline-none"
                              placeholder="value"
                            />
                            {isEditing && (
                              <button
                                onClick={() => removeCondition(condition.id)}
                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        {selectedPolicy.conditions.length === 0 && (
                          <div className="text-center py-4 text-gray-500 text-sm">
                            No conditions - policy will always apply
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Message */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Message (Shown when denied)</label>
                      <input
                        type="text"
                        value={selectedPolicy.message}
                        onChange={(e) => updatePolicy({ message: e.target.value })}
                        disabled={!isEditing}
                        className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white disabled:opacity-50 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
                      />
                    </div>

                    {/* Active Toggle */}
                    <div className="flex items-center justify-between pt-3 border-t border-white/5">
                      <div>
                        <p className="text-sm font-medium text-white">Policy Status</p>
                        <p className="text-xs text-gray-500">Active policies are enforced on-chain</p>
                      </div>
                      <button
                        onClick={() => updatePolicy({ isActive: !selectedPolicy.isActive })}
                        disabled={!isEditing}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          selectedPolicy.isActive
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-white/5 text-gray-400 border border-white/10'
                        } ${!isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {selectedPolicy.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Test Scenarios */}
              <div className="p-5 border-t border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <Play className="w-4 h-4 text-[#F8B032]" />
                    Test Scenarios
                  </h4>
                  <button
                    onClick={runTests}
                    className="px-3 py-1.5 bg-[#F8B032]/20 text-[#F8B032] hover:bg-[#F8B032]/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                  >
                    <Play className="w-4 h-4" />
                    Run Tests
                  </button>
                </div>
                <div className="space-y-2">
                  {SAMPLE_SCENARIOS.map(scenario => {
                    const result = testResults.get(scenario.id);
                    return (
                      <div
                        key={scenario.id}
                        className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {result === undefined ? (
                            <div className="w-6 h-6 rounded-full bg-gray-500/20 flex items-center justify-center">
                              <AlertCircle className="w-4 h-4 text-gray-500" />
                            </div>
                          ) : result.passed ? (
                            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                              <CheckCircle className="w-4 h-4 text-green-400" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                              <XCircle className="w-4 h-4 text-red-400" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm text-white">{scenario.name}</p>
                            <p className="text-[10px] text-gray-500">
                              {scenario.context.identity.type} | {scenario.context.identity.jurisdiction} | {scenario.context.asset.age_days}d old
                            </p>
                          </div>
                        </div>
                        {result && !result.passed && (
                          <span className="text-xs text-red-400 max-w-[200px] truncate">
                            {result.reason}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Version Info */}
              <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
                <span>Version {selectedPolicy.version}</span>
                <span>Last updated: {new Date(selectedPolicy.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-xl border border-white/10 p-12 text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-medium text-white mb-2">Select a Policy</h3>
              <p className="text-sm text-gray-500 mb-6">
                Choose a policy from the list to view and edit, or create a new one
              </p>
              <button
                onClick={createNewPolicy}
                className="px-4 py-2 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-lg font-medium transition-colors"
              >
                Create Policy
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
