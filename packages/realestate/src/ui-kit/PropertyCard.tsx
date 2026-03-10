import React from 'react';
import { Building2, MapPin, TrendingUp, Users, LayoutGrid, BadgeCheck } from 'lucide-react';

export interface PropertyCardProps {
  name: string;
  location: string;
  type: 'residential' | 'commercial' | 'industrial' | 'land';
  valuationAED?: number;
  valuationUSD?: number;
  area?: number;
  areaUnit?: string;
  yield?: number;
  occupancy?: number;
  tokenized?: boolean;
  status?: string;
  imageUrl?: string;
  onClick?: () => void;
  className?: string;
}

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  residential: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400' },
  commercial: { bg: 'bg-purple-500/10 border-purple-500/20', text: 'text-purple-400' },
  industrial: { bg: 'bg-orange-500/10 border-orange-500/20', text: 'text-orange-400' },
  land: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400' },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function PropertyCard({
  name,
  location,
  type,
  valuationAED,
  valuationUSD,
  area,
  areaUnit = 'sq ft',
  yield: yieldPct,
  occupancy,
  tokenized = false,
  status,
  imageUrl,
  onClick,
  className = '',
}: PropertyCardProps) {
  const typeStyle = TYPE_STYLES[type] || TYPE_STYLES.residential;

  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${onClick ? 'cursor-pointer hover:border-white/20 transition-colors' : ''} ${className}`}
      onClick={onClick}
    >
      {/* Image / Placeholder */}
      <div className="relative h-40 overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
            <Building2 className="w-12 h-12 text-slate-500" />
          </div>
        )}
        {tokenized && (
          <span className="absolute top-3 right-3 flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400">
            <BadgeCheck className="w-3 h-3" />
            Tokenized
          </span>
        )}
        {status && (
          <span className="absolute top-3 left-3 text-xs font-medium px-2 py-1 rounded-full bg-white/10 border border-white/10 text-gray-300">
            {status}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white truncate">{name}</h3>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeStyle.bg} ${typeStyle.text} capitalize`}>
            {type}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="truncate">{location}</span>
        </div>

        {/* Valuation */}
        {(valuationAED !== undefined || valuationUSD !== undefined) && (
          <div className="pt-1">
            {valuationAED !== undefined && (
              <p className="text-white font-semibold text-base">AED {formatNumber(valuationAED)}</p>
            )}
            {valuationUSD !== undefined && (
              <p className="text-gray-500 text-xs">USD {formatNumber(valuationUSD)}</p>
            )}
          </div>
        )}
      </div>

      {/* Stats Row */}
      {(area !== undefined || yieldPct !== undefined || occupancy !== undefined) && (
        <div className="px-5 py-3 border-t border-white/5 flex items-center gap-4">
          {area !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{area.toLocaleString()} {areaUnit}</span>
            </div>
          )}
          {yieldPct !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{yieldPct}% yield</span>
            </div>
          )}
          {occupancy !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Users className="w-3.5 h-3.5" />
              <span>{occupancy}% occupied</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
