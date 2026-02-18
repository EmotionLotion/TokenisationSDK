import React, { useState } from 'react';
import {
  Settings,
  Edit3,
  Snowflake,
  Sun,
  ChevronDown,
  Globe,
  Clock,
  Users,
  Coins,
  Shield,
} from 'lucide-react';

/**
 * Asset data for the admin panel
 */
export interface AssetAdminData {
  id: string;
  name: string;
  status: string;
  type: string;
  jurisdiction?: string;
  totalSupply?: string;
  holders?: number;
  createdAt: string;
}

/**
 * Props for the AssetAdmin component
 */
export interface AssetAdminProps {
  /** Asset data to display and manage */
  asset: AssetAdminData;
  /** Callback when a state transition is requested */
  onTransition?: (newState: string) => void;
  /** Callback when freeze is requested */
  onFreeze?: () => void;
  /** Callback when unfreeze is requested */
  onUnfreeze?: () => void;
  /** Callback when edit is requested */
  onEdit?: () => void;
  /** Custom class name */
  className?: string;
}

const TRANSITION_OPTIONS = [
  'PENDING_VERIFICATION',
  'VERIFIED',
  'ACTIVE',
  'FROZEN',
  'SUSPENDED',
] as const;

const getStatusColor = (status: string): string => {
  const normalized = status.toUpperCase();
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    PENDING_VERIFICATION: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    VERIFIED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/30',
    FROZEN: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    SUSPENDED: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return colors[normalized] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
};

/**
 * Admin panel card for managing a single tokenized asset.
 * Provides edit, freeze/unfreeze, and state transition controls.
 *
 * @example
 * ```tsx
 * <AssetAdmin
 *   asset={assetData}
 *   onTransition={(state) => updateAssetState(state)}
 *   onFreeze={() => freezeAsset()}
 *   onEdit={() => openEditor()}
 * />
 * ```
 */
export function AssetAdmin({
  asset,
  onTransition,
  onFreeze,
  onUnfreeze,
  onEdit,
  className = '',
}: AssetAdminProps) {
  const [showTransitions, setShowTransitions] = useState(false);

  const isFrozen = asset.status.toUpperCase() === 'FROZEN';
  const isSuspended = asset.status.toUpperCase() === 'SUSPENDED';

  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden ${className}`} role="region" aria-label={`Admin panel for ${asset.name}`}>
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
              <Settings className="w-5 h-5 text-[#F8B032]" />
            </div>
            <div>
              <h3 className="font-semibold text-white">{asset.name}</h3>
              <p className="text-xs text-gray-500">{asset.type} &middot; {asset.id.slice(0, 12)}...</p>
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(asset.status)}`} role="status">
            {asset.status}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="p-4 space-y-3 border-b border-white/5">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-400">
            <Globe className="w-4 h-4" />
            <span>{asset.jurisdiction || 'Global'}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <Clock className="w-4 h-4" />
            <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-white/5 rounded-lg">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Coins className="w-3.5 h-3.5" />
              <span>Total Supply</span>
            </div>
            <p className="font-mono text-sm text-white">
              {asset.totalSupply ? Number(asset.totalSupply).toLocaleString() : '0'}
            </p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Users className="w-3.5 h-3.5" />
              <span>Holders</span>
            </div>
            <p className="font-mono text-sm text-white">
              {asset.holders?.toLocaleString() ?? '0'}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 space-y-3">
        {/* Primary Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            disabled={isFrozen || isSuspended}
            className="flex-1 py-2 bg-white/5 text-white text-sm rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Edit ${asset.name}`}
          >
            <Edit3 className="w-4 h-4" />
            Edit
          </button>
          {isFrozen ? (
            <button
              onClick={onUnfreeze}
              className="flex-1 py-2 bg-cyan-500/20 text-cyan-400 text-sm rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-2"
              aria-label={`Unfreeze ${asset.name}`}
            >
              <Sun className="w-4 h-4" />
              Unfreeze
            </button>
          ) : (
            <button
              onClick={onFreeze}
              disabled={isSuspended}
              className="flex-1 py-2 bg-white/5 text-white text-sm rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={`Freeze ${asset.name}`}
            >
              <Snowflake className="w-4 h-4" />
              Freeze
            </button>
          )}
        </div>

        {/* State Transition Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowTransitions(!showTransitions)}
            disabled={isSuspended}
            className="w-full py-2 bg-white/5 text-white text-sm rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-expanded={showTransitions}
            aria-haspopup="listbox"
          >
            <Shield className="w-4 h-4" />
            Transition State
            <ChevronDown className={`w-4 h-4 transition-transform ${showTransitions ? 'rotate-180' : ''}`} />
          </button>
          {showTransitions && (
            <div className="absolute left-0 right-0 mt-1 bg-slate-800 border border-white/10 rounded-lg shadow-lg z-10 overflow-hidden" role="listbox" aria-label="State transitions">
              {TRANSITION_OPTIONS.filter((opt) => opt !== asset.status.toUpperCase()).map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    onTransition?.(option);
                    setShowTransitions(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                  role="option"
                  aria-selected={false}
                >
                  {option.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
