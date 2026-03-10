import { useMemo, useCallback } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { useAsset, useInvestor } from '@tokenisation/sdk-react';
import { StatusBadge } from '@tokenisation/ui-kit';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';
import { assetToDubaiProperty, toStatusBadgeVariant } from '../../utils/mappers';
import {
  DUBAI_PROPERTIES,
  formatAED,
} from '../../data/dubai-properties';
import type { DubaiProperty } from '../../data/dubai-properties';

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-gray-400 font-medium">
          {label}
        </span>
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            accent ? 'bg-primary/20' : 'bg-white/5'
          }`}
        >
          <Icon className={`w-4 h-4 ${accent ? 'text-primary' : 'text-gray-400'}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */

export function Dashboard() {
  const { listAssets } = useAsset();
  const investor = useInvestor();

  // Fetch properties from SDK, fall back to static mock data
  const { data: properties, isLive } = useSDKWithFallback<DubaiProperty[]>(
    async () => {
      const assets = await listAssets();
      if (assets.length === 0) return null;
      return assets.map(assetToDubaiProperty);
    },
    DUBAI_PROPERTIES,
  );

  // Fetch pending KYC count from SDK, fall back to 5
  const fetchPendingKyc = useCallback(async (): Promise<number | null> => {
    const pending = await investor.list({ kycStatus: 'pending' } as any);
    if (!pending) return null;
    return pending.length;
  }, [investor]);

  const { data: pendingKycCount } = useSDKWithFallback<number>(fetchPendingKyc, 5, []);

  // Compute portfolio totals from resolved data
  const totals = useMemo(() => {
    const raw = properties.reduce(
      (acc, prop) => ({
        valuationAED: acc.valuationAED + prop.valuationAED,
        valuationUSD: acc.valuationUSD + prop.valuationUSD,
        annualIncomeAED: acc.annualIncomeAED + prop.annualRentalIncomeAED,
        totalTokens: acc.totalTokens + prop.totalTokens,
        totalArea: acc.totalArea + prop.totalArea,
      }),
      { valuationAED: 0, valuationUSD: 0, annualIncomeAED: 0, totalTokens: 0, totalArea: 0 },
    );
    return {
      ...raw,
      avgYield: raw.valuationAED > 0 ? (raw.annualIncomeAED / raw.valuationAED) * 100 : 0,
      propertyCount: properties.length,
    };
  }, [properties]);

  const activeCount = properties.filter(
    (p) => p.status === 'live' || p.status === 'distributing',
  ).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <LayoutDashboard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            {isLive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
                </span>
                LIVE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/10 border border-gray-500/20 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                DEMO
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">Portfolio overview and key metrics</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Total AUM"
          value={formatAED(totals.valuationAED)}
          sub={`${totals.propertyCount} properties`}
          accent
        />
        <StatCard
          icon={Building2}
          label="Active Listings"
          value={String(activeCount)}
          sub="Live or distributing"
        />
        <StatCard
          icon={Users}
          label="Pending KYC"
          value={String(pendingKycCount)}
          sub="Awaiting review"
        />
        <StatCard
          icon={TrendingUp}
          label="Distributions (Q)"
          value={formatAED(Math.round(totals.annualIncomeAED / 4))}
          sub="This quarter"
        />
      </div>

      {/* Portfolio Summary Table */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Portfolio Summary</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">
                  Property
                </th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">
                  Status
                </th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">
                  Valuation
                </th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">
                  Occupancy
                </th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">
                  Yield (Net)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {properties.map((prop) => (
                <tr
                  key={prop.id}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-6 py-4">
                    <p className="text-white font-medium">{prop.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{prop.district}</p>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge
                      status={prop.status.replace(/-/g, ' ')}
                      variant={toStatusBadgeVariant(prop.status)}
                      size="sm"
                      showDot
                    />
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-white">
                    {formatAED(prop.valuationAED)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-white">{prop.occupancyRate}%</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-primary font-medium">{prop.netYield}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer totals */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Total Portfolio
          </span>
          <div className="flex items-center gap-8 text-sm">
            <span className="text-gray-400">
              AUM: <span className="text-white font-semibold">{formatAED(totals.valuationAED)}</span>
            </span>
            <span className="text-gray-400">
              Avg Yield: <span className="text-primary font-semibold">{totals.avgYield.toFixed(2)}%</span>
            </span>
            <span className="text-gray-400">
              Tokens: <span className="text-white font-semibold">{totals.totalTokens.toLocaleString()}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
