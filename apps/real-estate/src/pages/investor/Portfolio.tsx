import { useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, TrendingUp, Coins, Building2, Wifi } from 'lucide-react';
import {
  DUBAI_PROPERTIES,
  formatAED,
  type DubaiProperty,
} from '../../data/dubai-properties';
import { useInvestor, useCashFlow } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';

interface Holding {
  property: DubaiProperty;
  tokenBalance: number;
  purchasePrice: number; // per token in AED
  yieldEarned: number; // total AED
}

// Simulated holdings - investor holds tokens in 3 properties
const SIMULATED_HOLDINGS: Holding[] = [
  {
    property: DUBAI_PROPERTIES[0], // Marina Gate
    tokenBalance: 15000,
    purchasePrice: 36.0,
    yieldEarned: 41250,
  },
  {
    property: DUBAI_PROPERTIES[1], // Downtown Views
    tokenBalance: 25000,
    purchasePrice: 32.5,
    yieldEarned: 62500,
  },
  {
    property: DUBAI_PROPERTIES[2], // Palm Villas
    tokenBalance: 8000,
    purchasePrice: 33.0,
    yieldEarned: 27200,
  },
];

const MOCK_MONTHLY_RETURNS = [
  { month: 'Sep 2024', return: 0.48 },
  { month: 'Oct 2024', return: 0.52 },
  { month: 'Nov 2024', return: 0.49 },
  { month: 'Dec 2024', return: 0.55 },
  { month: 'Jan 2025', return: 0.51 },
  { month: 'Feb 2025', return: 0.53 },
];

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  iconColor = 'text-primary',
  iconBg = 'bg-primary/10',
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ElementType;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subValue && <p className="text-sm text-gray-500 mt-1">{subValue}</p>}
    </div>
  );
}

export function Portfolio() {
  const investor = useInvestor();
  const cashFlow = useCashFlow();

  // Try to fetch real investor holdings from the API
  const fetchHoldings = useCallback(async (): Promise<Holding[] | null> => {
    const investors = await investor.list({ status: 'active', limit: 1 });
    if (!investors || investors.length === 0) return null;

    // Attempt to get token balances for each known property
    const holdings: Holding[] = [];
    for (const prop of DUBAI_PROPERTIES) {
      try {
        const balances = await investor.getBalances?.({ assetId: prop.id } as any);
        if (balances && Array.isArray(balances) && balances.length > 0) {
          const bal = balances[0];
          holdings.push({
            property: prop,
            tokenBalance: parseFloat(bal.balance || '0'),
            purchasePrice: prop.tokenPriceAED,
            yieldEarned: parseFloat(bal.yieldEarned || '0'),
          });
        }
      } catch {
        // Skip properties where balance fetch fails
      }
    }

    return holdings.length > 0 ? holdings : null;
  }, [investor]);

  const {
    data: holdings,
    isLive: isHoldingsLive,
  } = useSDKWithFallback<Holding[]>(fetchHoldings, SIMULATED_HOLDINGS, []);

  // Try to fetch real distributions for monthly returns, falling back to mock
  const fetchMonthlyReturns = useCallback(async (): Promise<
    { month: string; return: number }[] | null
  > => {
    const distributions = await cashFlow.listDistributions({ limit: 50 });
    if (!distributions || distributions.length === 0) return null;

    // Group distributions by month and compute return percentages
    const byMonth: Record<string, number> = {};
    for (const dist of distributions) {
      const date = dist.scheduledAt || dist.executedAt;
      if (!date) continue;
      const d = new Date(date);
      const key = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      byMonth[key] = (byMonth[key] || 0) + parseFloat(dist.amount || '0');
    }

    const entries = Object.entries(byMonth).map(([month, amount]) => ({
      month,
      return: parseFloat((amount * 0.01).toFixed(2)), // Normalize to percentage
    }));

    return entries.length > 0 ? entries : null;
  }, [cashFlow]);

  const {
    data: monthlyReturns,
    isLive: isReturnsLive,
  } = useSDKWithFallback<{ month: string; return: number }[]>(
    fetchMonthlyReturns,
    MOCK_MONTHLY_RETURNS,
    [],
  );

  const isLive = isHoldingsLive || isReturnsLive;

  const stats = useMemo(() => {
    let totalValue = 0;
    let totalYield = 0;
    let totalCost = 0;

    holdings.forEach((h) => {
      const currentValue = h.tokenBalance * h.property.tokenPriceAED;
      totalValue += currentValue;
      totalYield += h.yieldEarned;
      totalCost += h.tokenBalance * h.purchasePrice;
    });

    const avgYield =
      holdings.reduce((sum, h) => sum + h.property.netYield, 0) /
      holdings.length;

    return {
      totalValue,
      totalYield,
      totalCost,
      holdings: holdings.length,
      avgYield: avgYield.toFixed(2),
      unrealizedGain: totalValue - totalCost,
    };
  }, [holdings]);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl md:text-3xl font-bold text-white font-display">
            My Portfolio
          </h1>
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-accent/20 text-accent border border-accent/30">
              <Wifi className="w-3 h-3" />
              Live
            </span>
          )}
        </div>
        <p className="text-gray-400 mt-1">Track your tokenized real estate investments</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Value"
          value={formatAED(stats.totalValue)}
          subValue={`Cost basis: ${formatAED(stats.totalCost)}`}
          icon={Coins}
        />
        <StatCard
          label="Total Yield Earned"
          value={formatAED(stats.totalYield)}
          subValue="Cumulative dividends"
          icon={TrendingUp}
          iconColor="text-accent"
          iconBg="bg-accent/10"
        />
        <StatCard
          label="Holdings"
          value={String(stats.holdings)}
          subValue={`${DUBAI_PROPERTIES.length} properties available`}
          icon={Building2}
          iconColor="text-secondary"
          iconBg="bg-secondary/10"
        />
        <StatCard
          label="Avg Net Yield"
          value={`${stats.avgYield}%`}
          subValue="Across all holdings"
          icon={PieChart}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
      </div>

      {/* Holdings Table */}
      <section className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white">Holdings</h2>
        </div>

        {/* Desktop Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-6 py-3 text-left text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                  Property
                </th>
                <th className="px-6 py-3 text-right text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                  Token Balance
                </th>
                <th className="px-6 py-3 text-right text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                  Current Value
                </th>
                <th className="px-6 py-3 text-right text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                  Unrealized P&L
                </th>
                <th className="px-6 py-3 text-right text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                  Yield Earned
                </th>
                <th className="px-6 py-3 text-right text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {holdings.map((holding) => {
                const currentValue =
                  holding.tokenBalance * holding.property.tokenPriceAED;
                const costBasis = holding.tokenBalance * holding.purchasePrice;
                const pnl = currentValue - costBasis;
                const pnlPercent = ((pnl / costBasis) * 100).toFixed(1);
                const statusLabel = holding.property.status
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase());

                return (
                  <tr
                    key={holding.property.id}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={`/property/${holding.property.id}`}
                        className="hover:text-primary transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-white/5 rounded-lg flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-gray-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {holding.property.name}
                            </p>
                            <p className="text-xs text-gray-500 font-mono">
                              {holding.property.tokenSymbol}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-sm font-semibold text-white">
                        {holding.tokenBalance.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        @ {formatAED(holding.purchasePrice)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-sm font-semibold text-white">
                        {formatAED(currentValue)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p
                        className={`text-sm font-semibold ${
                          pnl >= 0 ? 'text-accent' : 'text-red-400'
                        }`}
                      >
                        {pnl >= 0 ? '+' : ''}
                        {formatAED(pnl)}
                      </p>
                      <p
                        className={`text-xs ${
                          pnl >= 0 ? 'text-accent/70' : 'text-red-400/70'
                        }`}
                      >
                        {pnl >= 0 ? '+' : ''}
                        {pnlPercent}%
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-sm font-semibold text-primary">
                        {formatAED(holding.yieldEarned)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-accent/20 text-accent border border-accent/30">
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Monthly Performance */}
      <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Monthly Performance</h2>
            <p className="text-xs text-gray-500">Net yield distribution per month</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {monthlyReturns.map((m) => (
            <div
              key={m.month}
              className="bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center"
            >
              <p className="text-xs text-gray-500 mb-2">{m.month}</p>
              <p className="text-lg font-bold text-accent">+{m.return}%</p>
              <p className="text-xs text-gray-500 mt-1">
                {formatAED(stats.totalValue * (m.return / 100))}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
          <span className="text-sm text-gray-400">6-Month Cumulative Return</span>
          <span className="text-lg font-bold text-accent">
            +{monthlyReturns.reduce((s, m) => s + m.return, 0).toFixed(2)}%
          </span>
        </div>
      </section>
    </div>
  );
}
