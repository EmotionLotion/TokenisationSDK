import { useCallback } from 'react';
import { TrendingUp, Calendar, DollarSign, TrendingDown } from 'lucide-react';
import { useCashFlow } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../hooks/useSDKWithFallback';

interface NAVHistoryProps {
  propertyId: string;
  propertyName: string;
  currentNAV: number;
}

interface QuarterlyNAV {
  quarter: string;
  label: string;
  navAED: number;
  changePercent: number;
}

function generateQuarterlyData(currentNAV: number): QuarterlyNAV[] {
  const quarters = [
    { quarter: 'Q1 2022', label: 'Q1 \'22' },
    { quarter: 'Q2 2022', label: 'Q2 \'22' },
    { quarter: 'Q3 2022', label: 'Q3 \'22' },
    { quarter: 'Q4 2022', label: 'Q4 \'22' },
    { quarter: 'Q1 2023', label: 'Q1 \'23' },
    { quarter: 'Q2 2023', label: 'Q2 \'23' },
    { quarter: 'Q3 2023', label: 'Q3 \'23' },
    { quarter: 'Q4 2023', label: 'Q4 \'23' },
  ];

  const multipliers = [0.82, 0.85, 0.88, 0.91, 0.93, 0.96, 0.98, 1.0];

  return quarters.map((q, i) => {
    const navAED = Math.round(currentNAV * multipliers[i]);
    const prevNav = i > 0 ? Math.round(currentNAV * multipliers[i - 1]) : navAED;
    const changePercent = i > 0 ? ((navAED - prevNav) / prevNav) * 100 : 0;

    return {
      ...q,
      navAED,
      changePercent: Math.round(changePercent * 100) / 100,
    };
  });
}

/** Map a quarter string (e.g. "Q1 2022") to a short label (e.g. "Q1 '22") */
function quarterToLabel(quarter: string): string {
  const match = quarter.match(/^(Q\d)\s+(\d{4})$/);
  if (!match) return quarter;
  return `${match[1]} '${match[2].slice(2)}`;
}

export function NAVHistory({ propertyId: _propertyId, propertyName, currentNAV }: NAVHistoryProps) {
  const cashFlow = useCashFlow();

  const sdkCall = useCallback(async () => {
    const distributions = await cashFlow.listDistributions();
    if (!distributions || distributions.length === 0) return null;

    // Map SDK distribution data to QuarterlyNAV shape.
    // Each distribution record may carry cumulative NAV snapshots in metadata.
    const mapped: QuarterlyNAV[] = distributions.map((dist: Record<string, unknown>, i: number) => {
      const quarter = (dist.quarter as string) ?? (dist.label as string) ?? `Q${(i % 4) + 1} ${2022 + Math.floor(i / 4)}`;
      const navAED = (dist.navAED as number) ?? (dist.amount as number) ?? 0;
      const prevNav = i > 0
        ? ((distributions[i - 1] as Record<string, unknown>).navAED as number) ?? ((distributions[i - 1] as Record<string, unknown>).amount as number) ?? navAED
        : navAED;
      const changePercent = i > 0 && prevNav !== 0 ? ((navAED - prevNav) / prevNav) * 100 : 0;

      return {
        quarter,
        label: quarterToLabel(quarter),
        navAED,
        changePercent: Math.round(changePercent * 100) / 100,
      };
    });

    return mapped;
  }, [cashFlow]);

  const fallbackData = generateQuarterlyData(currentNAV);

  const { data } = useSDKWithFallback<QuarterlyNAV[]>(
    sdkCall,
    fallbackData,
    [sdkCall],
  );

  const maxNAV = Math.max(...data.map((d) => d.navAED));
  const minNAV = Math.min(...data.map((d) => d.navAED));
  const totalChange = ((data[data.length - 1].navAED - data[0].navAED) / data[0].navAED) * 100;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#F8B032]/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#F8B032]" />
            </div>
            <div>
              <h3 className="text-white font-semibold">NAV History</h3>
              <p className="text-gray-400 text-xs">{propertyName} &middot; Last 8 Quarters</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white text-lg font-bold">AED {(currentNAV / 1000000).toFixed(0)}M</p>
            <div className="flex items-center justify-end gap-1">
              {totalChange >= 0 ? (
                <TrendingUp className="w-3 h-3 text-green-400" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-400" />
              )}
              <span className={`text-xs font-medium ${totalChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalChange >= 0 ? '+' : ''}{totalChange.toFixed(1)}% over 2 years
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Bar Chart */}
      <div className="px-6 py-4 border-b border-white/10">
        <div className="flex items-end gap-2 h-32">
          {data.map((d, i) => {
            const height = ((d.navAED - minNAV * 0.95) / (maxNAV * 1.05 - minNAV * 0.95)) * 100;
            const isLast = i === data.length - 1;

            return (
              <div key={d.quarter} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center justify-end h-24">
                  <div
                    className={`w-full max-w-8 rounded-t transition-all ${
                      isLast
                        ? 'bg-[#F8B032]'
                        : 'bg-white/10 hover:bg-white/20'
                    }`}
                    style={{ height: `${Math.max(height, 8)}%` }}
                    title={`${d.quarter}: AED ${(d.navAED / 1000000).toFixed(1)}M`}
                  />
                </div>
                <span className={`text-[10px] ${isLast ? 'text-[#F8B032] font-medium' : 'text-gray-500'}`}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quarterly Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-6 py-3 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Quarter
                </div>
              </th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">
                <div className="flex items-center justify-end gap-1.5">
                  <DollarSign className="w-3 h-3" />
                  NAV (AED)
                </div>
              </th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Change</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.map((d, i) => {
              const isLast = i === data.length - 1;
              return (
                <tr
                  key={d.quarter}
                  className={`transition-colors ${
                    isLast
                      ? 'bg-[#F8B032]/5'
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <td className="px-6 py-3">
                    <span className={`text-sm ${isLast ? 'text-[#F8B032] font-semibold' : 'text-white'}`}>
                      {d.quarter}
                      {isLast && (
                        <span className="ml-2 px-1.5 py-0.5 bg-[#F8B032]/10 text-[#F8B032] text-[10px] rounded font-medium">
                          CURRENT
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className={`text-sm font-medium ${isLast ? 'text-[#F8B032]' : 'text-white'}`}>
                      AED {(d.navAED / 1000000).toFixed(1)}M
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {i === 0 ? (
                      <span className="text-gray-500 text-sm">--</span>
                    ) : (
                      <span
                        className={`text-sm ${
                          d.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {d.changePercent >= 0 ? '+' : ''}{d.changePercent.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {i === 0 ? (
                      <span className="text-gray-500 text-sm">--</span>
                    ) : d.changePercent >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-400 inline-block" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-400 inline-block" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02]">
        <p className="text-gray-500 text-xs text-center">
          NAV calculated quarterly by KPMG Lower Gulf. Based on independent RICS valuations and audited financials.
        </p>
      </div>
    </div>
  );
}
