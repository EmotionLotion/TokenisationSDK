import React, { useState } from 'react';
import {
  Layers,
  FileText,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  Download,
  File,
  Calendar,
  Globe,
  Hash,
  Tag,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  jurisdiction?: string;
  description?: string;
  createdAt: string;
}

export interface AssetDocument {
  name: string;
  type: string;
  url?: string;
  uploadedAt: string;
  verified: boolean;
}

export interface AssetRestriction {
  code: string;
  title: string;
  severity: 'error' | 'warning' | 'info';
}

export interface AssetDetailViewProps {
  asset: AssetInfo;
  metadata?: Record<string, string | number | boolean>;
  documents?: AssetDocument[];
  restrictions?: AssetRestriction[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = ['Overview', 'Documents', 'Restrictions'] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, React.ElementType> = {
  Overview: Layers,
  Documents: FileText,
  Restrictions: ShieldAlert,
};

const SEVERITY_CONFIG: Record<
  AssetRestriction['severity'],
  { icon: React.ElementType; color: string; bullet: string }
> = {
  error: { icon: AlertCircle, color: 'text-red-400', bullet: 'bg-red-400' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bullet: 'bg-amber-400' },
  info: { icon: Info, color: 'text-blue-400', bullet: 'bg-blue-400' },
};

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-400 bg-green-500/10 border-green-500/20',
  inactive: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  pending: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  frozen: 'text-red-400 bg-red-500/10 border-red-500/20',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AssetDetailView({
  asset,
  metadata,
  documents = [],
  restrictions = [],
  className = '',
}: AssetDetailViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const statusStyle = STATUS_COLORS[asset.status.toLowerCase()] ?? STATUS_COLORS.active;

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">{asset.type}</span>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusStyle}`}>
            {asset.status}
          </span>
        </div>
        <h3 className="text-lg font-semibold text-white mt-2">{asset.name}</h3>
        {asset.description && (
          <p className="text-sm text-gray-400 mt-1">{asset.description}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5">
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          const isActive = activeTab === tab;
          const count = tab === 'Documents' ? documents.length : tab === 'Restrictions' ? restrictions.length : undefined;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-amber-400 border-b-2 border-amber-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab}
              {count !== undefined && (
                <span className={`text-xs ml-1 px-1.5 py-0.5 rounded-full ${isActive ? 'bg-amber-400/10 text-amber-400' : 'bg-white/5 text-gray-500'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="px-5 py-4">
        {activeTab === 'Overview' && (
          <div className="space-y-4">
            {/* Asset info grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Hash className="w-4 h-4 text-gray-500" />
                <span className="text-gray-500">ID</span>
                <span className="text-slate-200 ml-auto font-mono text-xs">{asset.id}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Tag className="w-4 h-4 text-gray-500" />
                <span className="text-gray-500">Type</span>
                <span className="text-slate-200 ml-auto">{asset.type}</span>
              </div>
              {asset.jurisdiction && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500">Jurisdiction</span>
                  <span className="text-slate-200 ml-auto">{asset.jurisdiction}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-gray-500">Created</span>
                <span className="text-slate-200 ml-auto">{formatDate(asset.createdAt)}</span>
              </div>
            </div>

            {/* Metadata */}
            {metadata && Object.keys(metadata).length > 0 && (
              <div>
                <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Metadata</h4>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] divide-y divide-white/5">
                  {Object.entries(metadata).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-gray-400">{key}</span>
                      <span className="text-slate-200 font-mono text-xs">
                        {typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Documents' && (
          <div>
            {documents.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">No documents uploaded.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {documents.map((doc, i) => (
                  <li key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <File className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-200 truncate">{doc.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-gray-400 flex-shrink-0">
                          {doc.type}
                        </span>
                        {doc.verified && (
                          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{formatDate(doc.uploadedAt)}</span>
                    </div>
                    {doc.url && (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-400 hover:text-amber-300 transition-colors flex-shrink-0"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'Restrictions' && (
          <div>
            {restrictions.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">No restrictions.</p>
            ) : (
              <ul className="space-y-2">
                {restrictions.map((r, i) => {
                  const cfg = SEVERITY_CONFIG[r.severity];
                  const Icon = cfg.icon;
                  return (
                    <li
                      key={r.code || i}
                      className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.bullet}`} />
                      <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200">{r.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{r.code}</p>
                      </div>
                      <span className={`text-xs font-medium ${cfg.color}`}>
                        {r.severity.charAt(0).toUpperCase() + r.severity.slice(1)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
