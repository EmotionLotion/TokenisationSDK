import { useState } from 'react';
import {
  Radio, Search, Plus, CheckCircle, XCircle, Clock, RefreshCw,
  ExternalLink, Activity, AlertTriangle, Zap, Database, Globe,
  TrendingUp, Calendar, Settings, Play, Pause, GitBranch, Cpu, Layers
} from 'lucide-react';
import { useSDKStore, type WorkflowStatus } from '../core/store';
import { WorkflowExecutionTimeline } from './shared/WorkflowExecutionTimeline';

type OracleStatus = 'active' | 'paused' | 'error' | 'stale';
type OracleType = 'valuation' | 'price' | 'attestation' | 'registry' | 'revenue';

interface OracleFeed {
  id: string;
  name: string;
  type: OracleType;
  provider: string;
  status: OracleStatus;
  lastUpdate: string;
  updateFrequency: string;
  value?: string;
  unit?: string;
  assetId?: string;
  assetName?: string;
  confidence?: number;
  source?: string;
}

const SAMPLE_ORACLES: OracleFeed[] = [
  {
    id: 'oracle_valuation_001',
    name: 'Marina Tower Valuation',
    type: 'valuation',
    provider: 'Jones Lang LaSalle',
    status: 'active',
    lastUpdate: '2024-01-15T09:00:00Z',
    updateFrequency: 'Monthly',
    value: '$10,250,000',
    unit: 'USD',
    assetId: 'asset_marina_tower',
    assetName: 'Marina Tower Unit 1204',
    confidence: 95,
    source: 'Professional Appraisal'
  },
  {
    id: 'oracle_carbon_001',
    name: 'Verra Registry Attestation',
    type: 'registry',
    provider: 'Verra',
    status: 'active',
    lastUpdate: '2024-01-14T12:00:00Z',
    updateFrequency: 'On-demand',
    value: 'Verified',
    assetId: 'asset_carbon_batch',
    assetName: 'Carbon Credit Batch #2024-01',
    confidence: 100,
    source: 'Verra Registry API'
  },
  {
    id: 'oracle_price_001',
    name: 'MATIC/USD Price Feed',
    type: 'price',
    provider: 'Chainlink',
    status: 'active',
    lastUpdate: '2024-01-15T11:45:00Z',
    updateFrequency: '1 minute',
    value: '$0.89',
    unit: 'USD',
    confidence: 99,
    source: 'Chainlink Price Feed'
  },
  {
    id: 'oracle_revenue_001',
    name: 'Rental Income Statement',
    type: 'revenue',
    provider: 'Property Manager',
    status: 'stale',
    lastUpdate: '2024-01-01T00:00:00Z',
    updateFrequency: 'Quarterly',
    value: '$45,000',
    unit: 'USD/quarter',
    assetId: 'asset_marina_tower',
    assetName: 'Marina Tower Unit 1204',
    confidence: 90,
    source: 'Property Management Report'
  },
  {
    id: 'oracle_ticket_001',
    name: 'Event Status Attestation',
    type: 'attestation',
    provider: 'Event Organizer',
    status: 'paused',
    lastUpdate: '2024-01-10T18:00:00Z',
    updateFrequency: 'On-demand',
    value: 'Scheduled',
    assetId: 'asset_event_ticket',
    assetName: 'Tech Summit 2024',
    confidence: 100,
    source: 'Event Management System'
  }
];

const TRIGGER_BADGE_COLORS: Record<string, string> = {
  cron: 'bg-blue-500/10 text-blue-400',
  http: 'bg-green-500/10 text-green-400',
  evm_log: 'bg-purple-500/10 text-purple-400',
  evm_cron: 'bg-orange-500/10 text-orange-400',
  http_cron: 'bg-cyan-500/10 text-cyan-400',
};

export function OraclesPage() {
  const store = useSDKStore();

  const [oracles, setOracles] = useState<OracleFeed[]>(SAMPLE_ORACLES);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<OracleType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<OracleStatus | 'all'>('all');
  const [selectedOracle, setSelectedOracle] = useState<OracleFeed | null>(null);

  const [activeTab, setActiveTab] = useState<'feeds' | 'cre'>('feeds');
  const [workflowInputDialog, setWorkflowInputDialog] = useState<{ open: boolean; workflowName: string; inputJson: string }>({
    open: false,
    workflowName: '',
    inputJson: '{}',
  });

  const filteredOracles = oracles.filter(oracle => {
    const matchesSearch = oracle.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          oracle.provider.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || oracle.type === filterType;
    const matchesStatus = filterStatus === 'all' || oracle.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const stats = {
    total: oracles.length,
    active: oracles.filter(o => o.status === 'active').length,
    stale: oracles.filter(o => o.status === 'stale').length,
    error: oracles.filter(o => o.status === 'error').length,
  };

  const getStatusBadge = (status: OracleStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Active
          </span>
        );
      case 'paused':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-gray-500/10 text-gray-400 rounded text-xs font-medium">
            <Pause className="w-3 h-3" />
            Paused
          </span>
        );
      case 'stale':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded text-xs font-medium">
            <AlertTriangle className="w-3 h-3" />
            Stale
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-400 rounded text-xs font-medium">
            <XCircle className="w-3 h-3" />
            Error
          </span>
        );
    }
  };

  const getTypeIcon = (type: OracleType) => {
    switch (type) {
      case 'valuation': return <TrendingUp className="w-4 h-4" />;
      case 'price': return <Activity className="w-4 h-4" />;
      case 'attestation': return <CheckCircle className="w-4 h-4" />;
      case 'registry': return <Database className="w-4 h-4" />;
      case 'revenue': return <Zap className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: OracleType) => {
    switch (type) {
      case 'valuation': return 'bg-blue-500/20 text-blue-400';
      case 'price': return 'bg-green-500/20 text-green-400';
      case 'attestation': return 'bg-purple-500/20 text-purple-400';
      case 'registry': return 'bg-cyan-500/20 text-cyan-400';
      case 'revenue': return 'bg-orange-500/20 text-orange-400';
    }
  };

  const handleRefresh = (id: string) => {
    setOracles(oracles.map(o =>
      o.id === id ? { ...o, lastUpdate: new Date().toISOString(), status: 'active' as OracleStatus } : o
    ));
  };

  const handleTogglePause = (id: string) => {
    setOracles(oracles.map(o =>
      o.id === id ? { ...o, status: o.status === 'paused' ? 'active' as OracleStatus : 'paused' as OracleStatus } : o
    ));
  };

  const getWorkflowStatusBadge = (status: WorkflowStatus['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Active
          </span>
        );
      case 'paused':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-gray-500/10 text-gray-400 rounded text-xs font-medium">
            <Pause className="w-3 h-3" />
            Paused
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-400 rounded text-xs font-medium">
            <XCircle className="w-3 h-3" />
            Error
          </span>
        );
    }
  };

  const handleExecuteWorkflow = () => {
    try {
      const input = JSON.parse(workflowInputDialog.inputJson);
      store.executeWorkflow(workflowInputDialog.workflowName, input);
      setWorkflowInputDialog({ open: false, workflowName: '', inputJson: '{}' });
    } catch {
      // Invalid JSON -- keep dialog open
    }
  };

  const workflows = store.getWorkflows();
  const workflowExecutions = store.getWorkflowExecutions();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>
            Oracles & Evidence
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage oracle feeds and attach verified data to assets
          </p>
        </div>
        {activeTab === 'feeds' && (
          <button className="flex items-center gap-2 px-4 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-xl font-medium transition-all hover:scale-105">
            <Plus className="w-4 h-4" />
            Add Oracle Feed
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
        <button
          onClick={() => setActiveTab('feeds')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'feeds'
              ? 'bg-[#F8B032] text-black'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Radio className="w-4 h-4" />
          Oracle Feeds
        </button>
        <button
          onClick={() => setActiveTab('cre')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'cre'
              ? 'bg-[#F8B032] text-black'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          CRE Workflows
        </button>
      </div>

      {/* ==================== FEEDS TAB ==================== */}
      {activeTab === 'feeds' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 rounded-xl border border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Feeds</p>
                  <p className="text-xl font-bold text-white">{stats.total}</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-4 rounded-xl border border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Active</p>
                  <p className="text-xl font-bold text-green-400">{stats.active}</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-4 rounded-xl border border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Stale</p>
                  <p className="text-xl font-bold text-yellow-400">{stats.stale}</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-4 rounded-xl border border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Errors</p>
                  <p className="text-xl font-bold text-red-400">{stats.error}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search oracle feeds..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as OracleType | 'all')}
              className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-4 text-gray-300 focus:outline-none focus:border-[#F8B032]/50"
            >
              <option value="all">All Types</option>
              <option value="valuation">Valuation</option>
              <option value="price">Price</option>
              <option value="attestation">Attestation</option>
              <option value="registry">Registry</option>
              <option value="revenue">Revenue</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as OracleStatus | 'all')}
              className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-4 text-gray-300 focus:outline-none focus:border-[#F8B032]/50"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="stale">Stale</option>
              <option value="error">Error</option>
            </select>
          </div>

          {/* Oracle Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOracles.map(oracle => (
              <div
                key={oracle.id}
                onClick={() => setSelectedOracle(oracle)}
                className="glass-card p-5 rounded-xl border border-white/10 hover:border-[#F8B032]/30 cursor-pointer transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2 rounded-lg ${getTypeColor(oracle.type)}`}>
                    {getTypeIcon(oracle.type)}
                  </div>
                  {getStatusBadge(oracle.status)}
                </div>

                <h3 className="font-medium text-white mb-1 group-hover:text-[#F8B032] transition-colors">
                  {oracle.name}
                </h3>
                <p className="text-xs text-gray-500 mb-3">{oracle.provider}</p>

                {oracle.value && (
                  <div className="bg-white/5 rounded-lg p-3 mb-3">
                    <p className="text-xs text-gray-500 mb-1">Current Value</p>
                    <p className="text-lg font-mono font-bold text-white">{oracle.value}</p>
                    {oracle.confidence && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${oracle.confidence}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500">{oracle.confidence}%</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(oracle.lastUpdate).toLocaleDateString()}
                  </span>
                  <span>{oracle.updateFrequency}</span>
                </div>

                {oracle.assetName && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-[10px] text-gray-500">Linked Asset</p>
                    <p className="text-xs text-white truncate">{oracle.assetName}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredOracles.length === 0 && (
            <div className="glass-card p-12 rounded-xl border border-white/10 text-center text-gray-500">
              <Radio className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No oracle feeds found</p>
            </div>
          )}
        </>
      )}

      {/* ==================== CRE WORKFLOWS TAB ==================== */}
      {activeTab === 'cre' && (
        <>
          {/* DON Configuration Card */}
          <div className="glass-card p-6 rounded-xl border border-[#F8B032]/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#F8B032]/20 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-[#F8B032]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">DON Configuration</h3>
                <p className="text-xs text-gray-500">Decentralized Oracle Network</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">DON ID</p>
                <p className="text-sm font-mono text-white mt-1">don-sepolia-1</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Nodes</p>
                <p className="text-sm font-mono text-white mt-1">5</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Threshold</p>
                <p className="text-sm font-mono text-white mt-1">3 / 5</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Network</p>
                <p className="text-sm font-mono text-white mt-1">Sepolia</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Capabilities</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {['HTTP', 'EVM', 'Cron'].map(cap => (
                    <span key={cap} className="px-2 py-0.5 bg-[#F8B032]/10 text-[#F8B032] rounded text-[10px] font-medium">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Workflow Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map(wf => (
              <div
                key={wf.name}
                className="glass-card p-5 rounded-xl border border-white/10 hover:border-[#F8B032]/30 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-medium ${TRIGGER_BADGE_COLORS[wf.triggerType] || 'bg-gray-500/10 text-gray-400'}`}>
                      {wf.triggerType.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  {getWorkflowStatusBadge(wf.status)}
                </div>

                <h3 className="font-medium text-white mb-1 group-hover:text-[#F8B032] transition-colors">
                  {wf.name}
                </h3>
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{wf.description}</p>

                {/* Capabilities */}
                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  {wf.capabilities.map(cap => (
                    <span key={cap} className="px-2 py-0.5 bg-white/5 text-gray-400 rounded text-[10px] font-medium border border-white/5">
                      {cap}
                    </span>
                  ))}
                </div>

                {/* Linked vertical */}
                {wf.linkedVertical && (
                  <div className="mb-3">
                    <span className="text-[10px] text-gray-500">Vertical: </span>
                    <span className="text-[10px] text-[#F8B032]">{wf.linkedVertical}</span>
                  </div>
                )}

                {/* Last execution */}
                <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {wf.lastExecution
                      ? new Date(wf.lastExecution).toLocaleDateString()
                      : 'Never executed'}
                  </span>
                </div>

                {/* Execute button */}
                <button
                  onClick={() =>
                    setWorkflowInputDialog({ open: true, workflowName: wf.name, inputJson: '{}' })
                  }
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#F8B032]/10 hover:bg-[#F8B032]/20 text-[#F8B032] rounded-lg text-sm font-medium transition-colors border border-[#F8B032]/20 hover:border-[#F8B032]/40"
                >
                  <Play className="w-3.5 h-3.5" />
                  Execute Workflow
                </button>
              </div>
            ))}
          </div>

          {workflows.length === 0 && (
            <div className="glass-card p-12 rounded-xl border border-white/10 text-center text-gray-500">
              <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No CRE workflows configured</p>
            </div>
          )}

          {/* Workflow Execution Timeline */}
          <WorkflowExecutionTimeline
            executions={workflowExecutions}
            accentColor="text-[#F8B032]"
            maxItems={5}
          />
        </>
      )}

      {/* Oracle Detail Modal */}
      {selectedOracle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-2xl w-full max-w-lg">
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${getTypeColor(selectedOracle.type)}`}>
                    {getTypeIcon(selectedOracle.type)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{selectedOracle.name}</h2>
                    <p className="text-sm text-gray-500">{selectedOracle.provider}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOracle(null)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                {getStatusBadge(selectedOracle.status)}
                <span className="text-xs text-gray-500 capitalize">{selectedOracle.type} Oracle</span>
              </div>

              {selectedOracle.value && (
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Current Value</p>
                  <p className="text-2xl font-mono font-bold text-white">{selectedOracle.value}</p>
                  {selectedOracle.unit && (
                    <p className="text-xs text-gray-500 mt-1">{selectedOracle.unit}</p>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Source</span>
                  <span className="text-sm text-white">{selectedOracle.source}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Update Frequency</span>
                  <span className="text-sm text-white">{selectedOracle.updateFrequency}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Last Update</span>
                  <span className="text-sm text-white">{new Date(selectedOracle.lastUpdate).toLocaleString()}</span>
                </div>
                {selectedOracle.confidence && (
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">Confidence</span>
                    <span className="text-sm text-white">{selectedOracle.confidence}%</span>
                  </div>
                )}
                {selectedOracle.assetName && (
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-gray-400">Linked Asset</span>
                    <span className="text-sm text-white">{selectedOracle.assetName}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={() => handleRefresh(selectedOracle.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-xl font-medium transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Now
                </button>
                <button
                  onClick={() => handleTogglePause(selectedOracle.id)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
                >
                  {selectedOracle.status === 'paused' ? (
                    <><Play className="w-4 h-4" /> Resume</>
                  ) : (
                    <><Pause className="w-4 h-4" /> Pause</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workflow Input Dialog */}
      {workflowInputDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#F8B032]/20">
                    <Play className="w-4 h-4 text-[#F8B032]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Execute Workflow</h2>
                    <p className="text-sm text-gray-500">{workflowInputDialog.workflowName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setWorkflowInputDialog({ open: false, workflowName: '', inputJson: '{}' })}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-2">Input (JSON)</label>
                <textarea
                  value={workflowInputDialog.inputJson}
                  onChange={(e) =>
                    setWorkflowInputDialog({ ...workflowInputDialog, inputJson: e.target.value })
                  }
                  rows={5}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 resize-none"
                  placeholder='{ "key": "value" }'
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleExecuteWorkflow}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-xl font-medium transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Execute
                </button>
                <button
                  onClick={() => setWorkflowInputDialog({ open: false, workflowName: '', inputJson: '{}' })}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
