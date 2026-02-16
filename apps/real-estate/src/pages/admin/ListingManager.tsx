import { useCallback } from 'react';
import {
  List,
  Plus,
  Edit,
  Archive,
  Building2,
} from 'lucide-react';
import { useAsset } from '@tokenisation/sdk-react';
import { StatusBadge } from '@tokenisation/ui-kit';
import {
  useSDKWithFallback,
  useSDKMutationWithFallback,
} from '../../hooks/useSDKWithFallback';
import { assetToDubaiProperty, toStatusBadgeVariant } from '../../utils/mappers';
import {
  DUBAI_PROPERTIES,
  formatAED,
} from '../../data/dubai-properties';
import type { DubaiProperty } from '../../data/dubai-properties';

/* ------------------------------------------------------------------ */
/*  ListingManager                                                     */
/* ------------------------------------------------------------------ */

export function ListingManager() {
  const { listAssets, transitionAsset } = useAsset();

  // Fetch properties from SDK, fall back to static mock data
  const { data: properties, isLive, refresh } = useSDKWithFallback<DubaiProperty[]>(
    async () => {
      const assets = await listAssets();
      if (assets.length === 0) return null;
      return assets.map(assetToDubaiProperty);
    },
    DUBAI_PROPERTIES,
  );

  // Archive mutation: transition asset to SUSPENDED via SDK, with mock fallback
  const archiveMutation = useSDKMutationWithFallback(
    useCallback(
      async (id: string) => {
        const result = await transitionAsset(id, 'SUSPENDED' as any);
        return result;
      },
      [transitionAsset],
    ),
    useCallback(
      async (_id: string) => {
        // Mock simulation: pretend the archive succeeded after a short delay
        await new Promise((resolve) => setTimeout(resolve, 600));
        return { success: true, newState: 'SUSPENDED' as const };
      },
      [],
    ),
  );

  const handleArchive = async (id: string) => {
    try {
      await archiveMutation.execute(id);
      // Refresh the list after successful archive
      refresh();
    } catch {
      // Error is captured in archiveMutation.error
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <List className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Listing Manager</h1>
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
            <p className="text-sm text-gray-400">Manage property listings and status</p>
          </div>
        </div>

        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors">
          <Plus className="w-4 h-4" />
          Add New Listing
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-white">All Properties</h2>
          </div>
          <span className="text-[11px] text-gray-500 font-medium">
            {properties.length} listings
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">
                  Property
                </th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">
                  District
                </th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">
                  Status
                </th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">
                  Valuation
                </th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">
                  Yield
                </th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">
                  Token Price
                </th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">
                  Actions
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
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-white font-medium">{prop.name}</p>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                          {prop.tokenSymbol}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-400">{prop.district}</td>
                  <td className="px-6 py-4">
                    <StatusBadge
                      status={prop.status.replace(/-/g, ' ')}
                      variant={toStatusBadgeVariant(prop.status)}
                      size="sm"
                      showDot
                    />
                  </td>
                  <td className="px-6 py-4 text-right text-white font-mono">
                    {formatAED(prop.valuationAED)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-primary font-medium">{prop.netYield}%</span>
                  </td>
                  <td className="px-6 py-4 text-right text-white font-mono">
                    AED {prop.tokenPriceAED.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/5 border border-transparent hover:border-red-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Archive"
                        disabled={archiveMutation.loading}
                        onClick={() => handleArchive(prop.id)}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
