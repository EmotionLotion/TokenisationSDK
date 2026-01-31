import { Shield } from 'lucide-react';

interface RoyaltySplitVisualizerProps {
  salePrice: number;
  artistBps: number;
  promoterBps: number;
  royaltyCap?: number;
  capped?: boolean;
}

export function RoyaltySplitVisualizer({
  salePrice,
  artistBps,
  promoterBps,
  royaltyCap,
  capped,
}: RoyaltySplitVisualizerProps) {
  let artistAmount = (salePrice * artistBps) / 10000;
  let promoterAmount = (salePrice * promoterBps) / 10000;

  if (capped && royaltyCap && (artistAmount + promoterAmount) > royaltyCap) {
    const ratio = artistBps / (artistBps + promoterBps);
    artistAmount = royaltyCap * ratio;
    promoterAmount = royaltyCap * (1 - ratio);
  }

  const sellerProceeds = salePrice - artistAmount - promoterAmount;

  const artistPct = (artistAmount / salePrice) * 100;
  const promoterPct = (promoterAmount / salePrice) * 100;
  const sellerPct = (sellerProceeds / salePrice) * 100;

  const segments = [
    { label: 'Artist', amount: artistAmount, pct: artistPct, color: 'bg-purple-500', textColor: 'text-purple-400' },
    { label: 'Promoter', amount: promoterAmount, pct: promoterPct, color: 'bg-blue-500', textColor: 'text-blue-400' },
    { label: 'Seller', amount: sellerProceeds, pct: sellerPct, color: 'bg-green-500', textColor: 'text-green-400' },
  ];

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="flex items-center gap-1">
        <div className="flex-1 h-6 rounded-lg overflow-hidden flex">
          {segments.map(seg => (
            <div
              key={seg.label}
              className={`${seg.color} h-full transition-all duration-500 relative group`}
              style={{ width: `${seg.pct}%`, minWidth: seg.pct > 0 ? '24px' : '0' }}
            >
              {seg.pct > 12 && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">
                  {seg.pct.toFixed(1)}%
                </span>
              )}
            </div>
          ))}
        </div>
        {capped && (
          <span className="shrink-0 px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded text-[10px] font-medium border border-yellow-500/20">
            CAPPED
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px]">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${seg.color}`} />
            <span className="text-gray-400">{seg.label}</span>
            <span className={`font-mono font-medium ${seg.textColor}`}>
              ${seg.amount.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* CRE Badge */}
      <div className="flex items-center gap-1.5">
        <Shield className="w-3 h-3 text-[#F8B032]" />
        <span className="text-[10px] text-[#F8B032] font-medium">CRE Enforced</span>
      </div>
    </div>
  );
}
