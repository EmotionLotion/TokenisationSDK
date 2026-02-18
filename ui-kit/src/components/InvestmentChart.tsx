import React, { useMemo } from 'react';

export interface InvestmentChartProps {
  /** NAV history data points */
  data: { date: string; nav: number; returnPct?: number }[];
  /** Portfolio allocation breakdown for donut chart */
  allocations?: { label: string; value: number; color: string }[];
  /** Chart title */
  title?: string;
  /** Currency symbol (default: '$') */
  currency?: string;
  /** Line color (default: '#22c55e') */
  color?: string;
}

const SVG_WIDTH = 400;
const SVG_HEIGHT = 160;
const PADDING = { top: 10, right: 10, bottom: 20, left: 10 };

export function InvestmentChart({
  data,
  allocations,
  title = 'Portfolio Performance',
  currency = '$',
  color = '#22c55e',
}: InvestmentChartProps) {
  const { points, minNav, maxNav, currentNav, totalReturn, periodHigh, periodLow } = useMemo(() => {
    if (data.length === 0) {
      return { points: '', minNav: 0, maxNav: 0, currentNav: 0, totalReturn: 0, periodHigh: 0, periodLow: 0 };
    }

    const navValues = data.map(d => d.nav);
    const min = Math.min(...navValues);
    const max = Math.max(...navValues);
    const range = max - min || 1;

    const chartW = SVG_WIDTH - PADDING.left - PADDING.right;
    const chartH = SVG_HEIGHT - PADDING.top - PADDING.bottom;

    const pts = data
      .map((d, i) => {
        const x = PADDING.left + (i / Math.max(data.length - 1, 1)) * chartW;
        const y = PADDING.top + chartH - ((d.nav - min) / range) * chartH;
        return `${x},${y}`;
      })
      .join(' ');

    const first = navValues[0];
    const last = navValues[navValues.length - 1];
    const ret = first > 0 ? ((last - first) / first) * 100 : 0;

    return {
      points: pts,
      minNav: min,
      maxNav: max,
      currentNav: last,
      totalReturn: ret,
      periodHigh: max,
      periodLow: min,
    };
  }, [data]);

  const donutGradient = useMemo(() => {
    if (!allocations || allocations.length === 0) return '';
    const total = allocations.reduce((s, a) => s + a.value, 0);
    if (total === 0) return '';

    let cumulative = 0;
    const stops = allocations.map(a => {
      const start = cumulative;
      cumulative += (a.value / total) * 360;
      return `${a.color} ${start}deg ${cumulative}deg`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [allocations]);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {data.length > 0 && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              totalReturn >= 0
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {totalReturn >= 0 ? '+' : ''}
            {totalReturn.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="flex gap-4">
        {/* NAV Line Chart */}
        <div className="flex-1 min-w-0">
          {data.length > 0 ? (
            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="w-full h-auto"
              preserveAspectRatio="none"
            >
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                const y =
                  PADDING.top +
                  (SVG_HEIGHT - PADDING.top - PADDING.bottom) * (1 - pct);
                return (
                  <line
                    key={pct}
                    x1={PADDING.left}
                    y1={y}
                    x2={SVG_WIDTH - PADDING.right}
                    y2={y}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                  />
                );
              })}
              {/* Area fill */}
              <polygon
                points={`${PADDING.left},${SVG_HEIGHT - PADDING.bottom} ${points} ${SVG_WIDTH - PADDING.right},${SVG_HEIGHT - PADDING.bottom}`}
                fill={`${color}15`}
              />
              {/* Line */}
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Last point dot */}
              {data.length > 0 && (() => {
                const lastParts = points.split(' ').pop()?.split(',');
                if (!lastParts) return null;
                return (
                  <circle
                    cx={lastParts[0]}
                    cy={lastParts[1]}
                    r="3"
                    fill={color}
                    stroke="rgba(0,0,0,0.3)"
                    strokeWidth="1"
                  />
                );
              })()}
            </svg>
          ) : (
            <div className="flex items-center justify-center h-24 text-xs text-gray-500">
              No data available
            </div>
          )}
        </div>

        {/* Allocation Donut */}
        {allocations && allocations.length > 0 && (
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div
              className="w-20 h-20 rounded-full"
              style={{
                background: donutGradient,
                maskImage: 'radial-gradient(circle, transparent 55%, black 56%)',
                WebkitMaskImage: 'radial-gradient(circle, transparent 55%, black 56%)',
              }}
            />
            <div className="space-y-1">
              {allocations.map(a => (
                <div key={a.label} className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: a.color }}
                  />
                  <span className="truncate max-w-[72px]">{a.label}</span>
                  <span className="text-gray-500 ml-auto">{a.value}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {data.length > 0 && (
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/5">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Current NAV</p>
            <p className="text-sm font-semibold text-white">
              {currency}
              {currentNav.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Period High</p>
            <p className="text-sm font-semibold text-green-400">
              {currency}
              {periodHigh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Period Low</p>
            <p className="text-sm font-semibold text-red-400">
              {currency}
              {periodLow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
