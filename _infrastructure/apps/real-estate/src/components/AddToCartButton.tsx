/**
 * AddToCartButton - Button with amount input popover for adding to cart.
 */

import { useState } from 'react';
import { ShoppingCart, Plus } from 'lucide-react';
import { useInvestmentCart } from '../hooks/useInvestmentCart';
import { formatAED } from '../data/dubai-properties';

interface AddToCartButtonProps {
  propertyId: string;
  propertyName: string;
  tokenSymbol: string;
  tokenPriceAED: number;
  minTokens?: number;
}

export function AddToCartButton({
  propertyId,
  propertyName,
  tokenSymbol,
  tokenPriceAED,
  minTokens = 100,
}: AddToCartButtonProps) {
  const { addItem } = useInvestmentCart();
  const [showPopover, setShowPopover] = useState(false);
  const [amount, setAmount] = useState(String(minTokens));
  const [added, setAdded] = useState(false);

  const parsedAmount = parseInt(amount, 10) || 0;

  const handleAdd = () => {
    if (parsedAmount < 1) return;
    addItem({
      propertyId,
      propertyName,
      tokenSymbol,
      tokenAmount: parsedAmount,
      pricePerToken: tokenPriceAED,
      currency: 'AED',
    });
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      setShowPopover(false);
    }, 1500);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPopover(!showPopover)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white text-sm font-medium rounded-lg hover:bg-white/10 transition-colors"
      >
        <ShoppingCart className="w-4 h-4" />
        Add to Cart
      </button>

      {showPopover && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 border border-white/10 rounded-xl p-4 shadow-xl z-50">
          <p className="text-white text-sm font-medium mb-3">{tokenSymbol} Tokens</p>

          <div className="mb-3">
            <label className="block text-gray-400 text-xs mb-1">Token Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-primary/50"
            />
          </div>

          {parsedAmount > 0 && (
            <p className="text-xs text-gray-500 mb-3">
              Total: {formatAED(parsedAmount * tokenPriceAED)}
            </p>
          )}

          <button
            onClick={handleAdd}
            disabled={parsedAmount < 1}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-black text-sm font-bold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-30"
          >
            {added ? (
              <>Added!</>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add to Cart
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
