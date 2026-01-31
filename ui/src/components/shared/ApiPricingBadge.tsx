import { useState } from 'react';
import { useSDKStore } from '../../core/store';

interface ApiPricingBadgeProps {
  operation: string;
  showOnHover?: boolean;
}

export function ApiPricingBadge({ operation, showOnHover = false }: ApiPricingBadgeProps) {
  const [hovered, setHovered] = useState(false);
  const cost = useSDKStore(s => s.getOperationCost(operation));

  if (!cost) return null;

  const badge = (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#F8B032]/10 text-[#F8B032] border border-[#F8B032]/20 transition-opacity ${
        showOnHover && !hovered ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {cost.price} {cost.tokenSymbol}
    </span>
  );

  if (!showOnHover) return badge;

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {badge}
      {hovered && (
        <span className="absolute left-full ml-2 z-10 px-3 py-2 bg-[#0A0E1A] border border-white/10 rounded-lg shadow-xl whitespace-nowrap">
          <span className="text-[10px] text-gray-400">
            x402 cost: <span className="text-white font-mono">{cost.price} {cost.tokenSymbol}</span>
          </span>
        </span>
      )}
    </span>
  );
}
