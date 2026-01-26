import { useEffect, useState } from 'react';
import {
  Building2, Ticket, Award, Users, Activity, Coins, ArrowUpRight, ShieldCheck, Zap,
  Plus, LayoutGrid, List, Filter, Search, ChevronDown, FileText, Leaf
} from 'lucide-react';
import { sdkStore } from '../store';
import { Asset, Party, RightType, LifecycleState, STATE_COLORS, TransferabilityMode } from '../types';
import { AssetTemplates, AssetTemplate, PROFILE_INFO } from './AssetTemplates';
import { CreateAssetWizard, AssetCreationData } from './CreateAssetWizard';

interface DashboardProps {
  onSelectAsset: (asset: Asset) => void;
}

type ViewMode = 'table' | 'grid' | 'templates';

export function Dashboard({ onSelectAsset }: DashboardProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AssetTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState<LifecycleState | 'all'>('all');

  useEffect(() => {
    const update = () => {
      setAssets(sdkStore.getAssets());
      setParties(sdkStore.getParties());
    };
    update();
    return sdkStore.subscribe(update);
  }, []);

  const stats = {
    totalAssets: assets.length,
    activeAssets: assets.filter(a => a.state === LifecycleState.ACTIVE).length,
    totalParties: parties.length,
    verifiedParties: parties.filter(p => (p as any).verificationLevel === 2).length,
  };

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = filterState === 'all' || asset.state === filterState;
    return matchesSearch && matchesState;
  });

  const getStatusColor = (state: LifecycleState) => {
    switch (state) {
      case LifecycleState.ACTIVE: return 'text-accent bg-accent/10 border-accent/20';
      case LifecycleState.VERIFIED: return 'text-primary bg-primary/10 border-primary/20';
      case LifecycleState.DRAFT: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
      case LifecycleState.PENDING_VERIFICATION: return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      default: return 'text-gray-400 bg-gray-500/10';
    }
  };

  const getTypeIcon = (type: RightType) => {
    switch (type) {
      case RightType.OWNERSHIP: return <Building2 className="w-5 h-5 text-blue-400" />;
      case RightType.ACCESS: return <Ticket className="w-5 h-5 text-purple-400" />;
      case RightType.VERIFICATION: return <ShieldCheck className="w-5 h-5 text-green-400" />;
      case RightType.BEHAVIOR: return <Activity className="w-5 h-5 text-orange-400" />;
    }
  };

  const formatBalance = (balance: string) => {
    const num = BigInt(balance);
    if (num >= BigInt(10 ** 18)) {
      return (Number(num) / 10 ** 18).toFixed(0);
    }
    return balance;
  };

  const handleSelectTemplate = (template: AssetTemplate) => {
    setSelectedTemplate(template);
    setShowWizard(true);
  };

  const handleCreateCustom = () => {
    setSelectedTemplate(null);
    setShowWizard(true);
  };

  const handleWizardComplete = (assetData: AssetCreationData) => {
    // Get the first available party as default issuer, or create a placeholder ID
    const parties = sdkStore.getParties();
    const defaultIssuerId = parties.length > 0 ? parties[0].id : 'default-issuer';

    // Create the asset from wizard data
    const newAsset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'> = {
      name: assetData.metadata.name || assetData.metadata.propertyType || assetData.template.name,
      rightType: mapProfileToRightType(assetData.template.profile),
      state: LifecycleState.DRAFT,
      jurisdiction: {
        countryCode: assetData.jurisdiction || 'Global',
        accreditedOnly: false,
        blockedJurisdictions: []
      },
      tokenInfo: {
        totalSupply: assetData.supply.initial?.toString() || '0',
        decimals: 18,
        tokenStandard: 'ERC20',
        contractAddress: '0x0000000000000000000000000000000000000000',
        chainId: 1
      },
      metadata: assetData.metadata,
      version: 1,
      validityPeriod: { isPerpetual: true, startTime: new Date().toISOString() },
      transferabilityRules: {
        mode: TransferabilityMode.UNRESTRICTED,
        lockupPeriodSeconds: 0,
        requireKyc: false
      },
      evidenceIds: [],
      issuerId: defaultIssuerId,
      currentHolders: [],
    };

    sdkStore.createAsset(newAsset);
    setShowWizard(false);
    setSelectedTemplate(null);
    setViewMode('table'); // Switch to table view to see the new asset
  };

  const mapProfileToRightType = (profile: string): RightType => {
    switch (profile) {
      case 'regulated_fungible': return RightType.OWNERSHIP;
      case 'semi_fungible': return RightType.BEHAVIOR;
      case 'unique': return RightType.ACCESS;
      case 'simple_fungible': return RightType.BEHAVIOR;
      default: return RightType.OWNERSHIP;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Platform Overview - Stripe-like Stats */}
      <div className="glass-card rounded-2xl p-6 border border-white/5 bg-gradient-to-br from-[#0F172A]/50 to-transparent">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-white">Platform Overview</h2>
            <p className="text-xs text-gray-500 mt-0.5">Real-time tokenization metrics</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-green-400 font-medium">Live</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* AUM */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-[#F8B032]/20 transition-colors">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">AUM</p>
            <p className="text-2xl font-bold text-white">$24.8M</p>
            <div className="flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3 h-3 text-green-400" />
              <span className="text-xs text-green-400">+8.2%</span>
              <span className="text-xs text-gray-600">vs last month</span>
            </div>
          </div>

          {/* TVL */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-[#F8B032]/20 transition-colors">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">TVL</p>
            <p className="text-2xl font-bold text-white">$12.4M</p>
            <div className="flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3 h-3 text-green-400" />
              <span className="text-xs text-green-400">+15.3%</span>
              <span className="text-xs text-gray-600">7d</span>
            </div>
          </div>

          {/* Transaction Volume */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-[#F8B032]/20 transition-colors">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">24h Volume</p>
            <p className="text-2xl font-bold text-white">$1.2M</p>
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-gray-400">1,247 txns</span>
            </div>
          </div>

          {/* Total Assets */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-[#F8B032]/20 transition-colors">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Total Assets</p>
            <p className="text-2xl font-bold text-white">{stats.totalAssets}</p>
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-[#F8B032]">{stats.activeAssets} active</span>
            </div>
          </div>

          {/* Active Identities */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-[#F8B032]/20 transition-colors">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Identities</p>
            <p className="text-2xl font-bold text-white">{stats.totalParties}</p>
            <div className="flex items-center gap-1 mt-2">
              <ShieldCheck className="w-3 h-3 text-green-400" />
              <span className="text-xs text-green-400">{stats.verifiedParties} verified</span>
            </div>
          </div>

          {/* Success Rate */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-[#F8B032]/20 transition-colors">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Success Rate</p>
            <p className="text-2xl font-bold text-white">99.8%</p>
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-gray-400">Last 30 days</span>
            </div>
          </div>
        </div>
      </div>

      {/* View Mode Tabs & Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'table'
              ? 'bg-[#F8B032]/20 text-[#F8B032]'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            <List className="w-4 h-4" />
            Assets
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'grid'
              ? 'bg-[#F8B032]/20 text-[#F8B032]'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Grid
          </button>
          <button
            onClick={() => setViewMode('templates')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'templates'
              ? 'bg-[#F8B032]/20 text-[#F8B032]'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            <FileText className="w-4 h-4" />
            Templates
          </button>
        </div>

        <button
          onClick={handleCreateCustom}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-xl font-medium transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          Create Asset
        </button>
      </div>

      {/* Templates View */}
      {viewMode === 'templates' && (
        <AssetTemplates
          onSelectTemplate={handleSelectTemplate}
          onCreateCustom={handleCreateCustom}
        />
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="glass-card rounded-2xl overflow-hidden p-1">
          {/* Search & Filter */}
          <div className="p-4 border-b border-white/5 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 transition-colors"
              />
            </div>
            <div className="relative">
              <select
                value={filterState}
                onChange={(e) => setFilterState(e.target.value as LifecycleState | 'all')}
                className="bg-white/5 border border-white/10 rounded-lg py-2 px-4 pr-8 text-gray-300 appearance-none focus:outline-none focus:border-[#F8B032]/50 transition-colors"
              >
                <option value="all">All States</option>
                <option value={LifecycleState.DRAFT}>Draft</option>
                <option value={LifecycleState.PENDING_VERIFICATION}>Pending</option>
                <option value={LifecycleState.VERIFIED}>Verified</option>
                <option value={LifecycleState.ACTIVE}>Active</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </div>

          {filteredAssets.length === 0 ? (
            <div className="p-16 text-center text-gray-500">
              <Coins className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg mb-2">No assets found</p>
              <p className="text-sm text-gray-600 mb-6">Create your first asset using a template</p>
              <button
                onClick={() => setViewMode('templates')}
                className="px-4 py-2 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-lg font-medium transition-colors"
              >
                Browse Templates
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Asset Name</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">State</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Supply</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Jurisdiction</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAssets.map(asset => (
                    <tr
                      key={asset.id}
                      onClick={() => onSelectAsset(asset)}
                      className="hover:bg-white/5 cursor-pointer transition-all duration-200 group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 bg-gray-800 rounded-xl border border-white/10 group-hover:border-primary/50 transition-colors">
                            {getTypeIcon(asset.rightType)}
                          </div>
                          <div>
                            <p className="font-semibold text-white group-hover:text-primary transition-colors">{asset.name}</p>
                            <p className="text-xs text-gray-500 font-mono">{asset.id.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-white/5 rounded-md text-xs font-medium text-gray-300 border border-white/10">{asset.rightType}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center w-fit gap-1.5 ${getStatusColor(asset.state)}`}>
                          <div className={`w-1.5 h-1.5 rounded-full bg-current animate-pulse`} />
                          {asset.state}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-gray-300">
                        {formatBalance(asset.tokenInfo?.totalSupply?.toString() || '0')}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-xs font-medium">
                          {typeof asset.jurisdiction === 'string' ? asset.jurisdiction : asset.jurisdiction.countryCode}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(asset.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssets.length === 0 ? (
            <div className="col-span-full text-center py-16 text-gray-500">
              <Coins className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg mb-2">No assets found</p>
              <button
                onClick={() => setViewMode('templates')}
                className="mt-4 px-4 py-2 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-lg font-medium transition-colors"
              >
                Browse Templates
              </button>
            </div>
          ) : (
            filteredAssets.map(asset => (
              <div
                key={asset.id}
                onClick={() => onSelectAsset(asset)}
                className="glass-card p-5 rounded-xl border border-white/10 hover:border-[#F8B032]/30 cursor-pointer transition-all group hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-gray-800 rounded-xl border border-white/10 group-hover:border-primary/50 transition-colors">
                    {getTypeIcon(asset.rightType)}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(asset.state)}`}>
                    {asset.state}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white group-hover:text-[#F8B032] transition-colors">
                  {asset.name}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-1">{asset.id.slice(0, 16)}...</p>

                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    <span className="block">Supply</span>
                    <span className="font-mono text-white">{formatBalance(asset.tokenInfo?.totalSupply?.toString() || '0')}</span>
                  </div>
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-xs">
                    {typeof asset.jurisdiction === 'string' ? asset.jurisdiction : asset.jurisdiction.countryCode}
                  </span>
                </div>
              </div>
            ))
          )}

          {/* Add New Asset Card */}
          <div
            onClick={handleCreateCustom}
            className="glass-card p-5 rounded-xl border border-dashed border-white/20 hover:border-[#F8B032]/30 cursor-pointer transition-all flex flex-col items-center justify-center min-h-[200px] group"
          >
            <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-[#F8B032]/20 transition-colors">
              <Plus className="w-7 h-7 text-gray-500 group-hover:text-[#F8B032]" />
            </div>
            <p className="mt-4 text-gray-400 font-medium group-hover:text-white transition-colors">Create New Asset</p>
            <p className="text-xs text-gray-600 mt-1">Use a template or start custom</p>
          </div>
        </div>
      )}

      {/* Create Asset Wizard Modal */}
      {showWizard && (
        <CreateAssetWizard
          onClose={() => {
            setShowWizard(false);
            setSelectedTemplate(null);
          }}
          onComplete={handleWizardComplete}
          initialTemplate={selectedTemplate || undefined}
        />
      )}
    </div>
  );
}
