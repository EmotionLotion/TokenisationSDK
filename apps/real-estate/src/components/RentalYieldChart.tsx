import { useCallback } from 'react';
import { DollarSign, TrendingUp, Calendar } from 'lucide-react';
import { useCashFlow } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../hooks/useSDKWithFallback';

interface RentalYieldChartProps {
  propertyId: string;
  propertyName: string;
  grossYield: number;
  netYield: number;
}

interface QuarterlyDistribution {
  quarter: string;
  label: string;
  grossIncomeAED: number;
  expensesAED: number;
  netDistributionAED: number;
  perTokenAED: number;
}

function generateQuarterlyDistributions(grossYield: number, netYield: number): QuarterlyDistribution[] {
  const baseGrossQuarterly = 8500000;
  const expenseRatio = 1 - (netYield / grossYield);

  return [
    {
      quarter: 'Q1 2024',
      label: 'Q1',
      grossIncomeAED: Math.round(baseGrossQuarterly * 0.95),
      expensesAED: Math.round(baseGrossQuarterly * 0.95 * expenseRatio),
      netDistributionAED: Math.round(baseGrossQuarterly * 0.95 * (1 - expenseRatio)),
      perTokenAED: 0.52,
    },
    {
      quarter: 'Q2 2024',
      label: 'Q2',
      grossIncomeAED: Math.round(baseGrossQuarterly * 0.98),
      expensesAED: Math.round(baseGrossQuarterly * 0.98 * expenseRatio),
      netDistributionAED: Math.round(baseGrossQuarterly * 0.98 * (1 - expenseRatio)),
      perTokenAED: 0.55,
    },
    {
      quarter: 'Q3 2024',
      label: 'Q3',
      grossIncomeAED: Math.round(baseGrossQuarterly * 1.02),
      expensesAED: Math.round(baseGrossQuarterly * 1.02 * expenseRatio),
      netDistributionAED: Math.round(baseGrossQuarterly * 1.02 * (1 - expenseRatio)),
      perTokenAED: 0.57,
    },
    {
      quarter: 'Q4 2024',
      label: 'Q4',
      grossIncomeAED: baseGrossQuarterly,
      expensesAED: Math.round(baseGrossQuarterly * expenseRatio),
      netDistributionAED: Math.round(baseGrossQuarterly * (1 - expenseRatio)),
      perTokenAED: 0.56,
    },
  ];
}

export function RentalYieldChart({
  propertyId: _propertyId,
  propertyName,
  grossYield,
  netYield,
}: RentalYieldChartProps) {
  const cashFlow = useCashFlow();

  const sdkCall = useCallback(async () => {
    const distributions = await cashFlow.listDistributions();
    if (!distributions || distributions.length === 0) return null;

    return distributions.map((dist: Record<string, unknown>, i: number): QuarterlyDistribution => {
      const quarter = (dist.quarter as string) ?? `Q${(i % 4) + 1} 2024`;
      const label = (dist.label as string) ?? `Q${(i % 4) + 1}`;
      const grossIncomeAED = (dist.grossIncomeAED as number) ?? (dist.grossIncome as number) ?? (dist.amount as number) ?? 0;
      const expensesAED = (dist.expensesAED as number) ?? (dist.expenses as number) ?? Math.round(grossIncomeAED * 0.3);
      const netDistributionAED = (dist.netDistributionAED as number) ?? (dist.netDistribution as number) ?? (grossIncomeAED - expensesAED);
      const perTokenAED = (dist.perTokenAED as number) ?? (dist.perToken as number) ?? 0;

      return {
        quarter,
        label,
        grossIncomeAED,
        expensesAED,
        netDistributionAED,
        perTokenAED,
      };
    });
  }, [cashFlow]);

  const fallbackQuarters = generateQuarterlyDistributions(grossYield, netYield);

  const { data: quarters } = useSDKWithFallback<QuarterlyDistribution[]>(
    sdkCall,
    fallbackQuarters,
    [sdkCall],
  );

  const totalAnnualNet = quarters.reduce((sum, q) => sum + q.netDistributionAED, 0);
  const totalPerToken = quarters.reduce((sum, q) => sum + q.perTokenAED, 0);
  const projectedAnnualReturn = netYield + 4.5; // net yield + estimated capital appreciation

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
              <h3 className="text-white font-semibold">Rental Yield & Distributions</h3>
              <p className="text-gray-400 text-xs">{propertyName}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Yield Comparison */}
      <div className="p-6 border-b border-white/10">
        <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-4">Yield Overview</h4>

        <div className="space-y-4">
          {/* Gross Yield */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-gray-400 text-sm">Gross Yield</span>
              <span className="text-white text-sm font-bold">{grossYield.toFixed(2)}%</span>
            </div>
            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#F8B032]/60 to-[#F8B032]"
                style={{ width: `${(grossYield / 12) * 100}%` }}
              />
            </div>
          </div>

          {/* Net Yield */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-gray-400 text-sm">Net Yield</span>
              <span className="text-white text-sm font-bold">{netYield.toFixed(2)}%</span>
            </div>
            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-600/60 to-green-500"
                style={{ width: `${(netYield / 12) * 100}%` }}
              />
            </div>
          </div>

          {/* Expense Ratio Callout */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
            <span className="text-gray-500 text-xs">Operating Expense Ratio</span>
            <span className="text-gray-300 text-xs font-medium">
              {((1 - netYield / grossYield) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Quarterly Distribution History */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-gray-400" />
          <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider">
            Quarterly Distributions (2024)
          </h4>
        </div>

        {/* Visual Bars */}
        <div className="flex items-end gap-3 h-28 mb-4">
          {quarters.map((q) => {
            const maxNet = Math.max(...quarters.map((qu) => qu.grossIncomeAED));
            const grossHeight = (q.grossIncomeAED / maxNet) * 100;
            const netHeight = (q.netDistributionAED / maxNet) * 100;

            return (
              <div key={q.quarter} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center gap-1 h-20">
                  <div
                    className="w-5 rounded-t bg-white/10"
                    style={{ height: `${grossHeight}%` }}
                    title={`Gross: AED ${(q.grossIncomeAED / 1000000).toFixed(1)}M`}
                  />
                  <div
                    className="w-5 rounded-t bg-[#F8B032]"
                    style={{ height: `${netHeight}%` }}
                    title={`Net: AED ${(q.netDistributionAED / 1000000).toFixed(1)}M`}
                  />
                </div>
                <span className="text-gray-500 text-xs">{q.label}</span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-white/10" />
            <span className="text-gray-500 text-xs">Gross Income</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[#F8B032]" />
            <span className="text-gray-500 text-xs">Net Distribution</span>
          </div>
        </div>
      </div>

      {/* Quarterly Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-6 py-3 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Quarter</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Gross Income</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Expenses</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Net Dist.</th>
              <th className="px-6 py-3 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Per Token</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {quarters.map((q) => (
              <tr key={q.quarter} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-3 text-white text-sm">{q.quarter}</td>
                <td className="px-6 py-3 text-right text-gray-300 text-sm">
                  AED {(q.grossIncomeAED / 1000000).toFixed(2)}M
                </td>
                <td className="px-6 py-3 text-right text-red-400/70 text-sm">
                  -AED {(q.expensesAED / 1000000).toFixed(2)}M
                </td>
                <td className="px-6 py-3 text-right text-green-400 text-sm font-medium">
                  AED {(q.netDistributionAED / 1000000).toFixed(2)}M
                </td>
                <td className="px-6 py-3 text-right text-[#F8B032] text-sm font-medium">
                  AED {q.perTokenAED.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 bg-white/[0.03]">
              <td className="px-6 py-3 text-gray-400 text-sm font-semibold">Annual Total</td>
              <td className="px-6 py-3 text-right text-gray-300 text-sm font-bold">
                AED {(quarters.reduce((s, q) => s + q.grossIncomeAED, 0) / 1000000).toFixed(2)}M
              </td>
              <td className="px-6 py-3 text-right text-red-400/70 text-sm font-bold">
                -AED {(quarters.reduce((s, q) => s + q.expensesAED, 0) / 1000000).toFixed(2)}M
              </td>
              <td className="px-6 py-3 text-right text-green-400 text-sm font-bold">
                AED {(totalAnnualNet / 1000000).toFixed(2)}M
              </td>
              <td className="px-6 py-3 text-right text-[#F8B032] text-sm font-bold">
                AED {totalPerToken.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Projected Annual Return */}
      <div className="p-6 border-t border-white/10">
        <div className="rounded-lg border border-[#F8B032]/20 bg-[#F8B032]/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-[#F8B032]" />
            <h4 className="text-[#F8B032] font-semibold text-sm">Projected Annual Return</h4>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-gray-400 text-xs mb-1">Net Rental Yield</p>
              <p className="text-white text-xl font-bold">{netYield.toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-xs mb-1">Est. Capital Appreciation</p>
              <p className="text-white text-xl font-bold">+4.5%</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-xs mb-1">Total Projected Return</p>
              <p className="text-[#F8B032] text-xl font-bold">{projectedAnnualReturn.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02]">
        <p className="text-gray-500 text-xs text-center">
          Past performance is not indicative of future results. Projections based on current market conditions and occupancy rates.
        </p>
      </div>
    </div>
  );
}
