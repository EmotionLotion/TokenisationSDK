/**
 * useInvestmentCart - Client-side investment cart using Zustand store.
 */

import { create } from 'zustand';

export interface CartItem {
  propertyId: string;
  propertyName: string;
  tokenSymbol: string;
  tokenAmount: number;
  pricePerToken: number;
  currency: string;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (propertyId: string) => void;
  updateAmount: (propertyId: string, amount: number) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.propertyId === item.propertyId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.propertyId === item.propertyId
              ? { ...i, tokenAmount: i.tokenAmount + item.tokenAmount }
              : i,
          ),
        };
      }
      return { items: [...state.items, item] };
    }),
  removeItem: (propertyId) =>
    set((state) => ({
      items: state.items.filter((i) => i.propertyId !== propertyId),
    })),
  updateAmount: (propertyId, amount) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.propertyId === propertyId ? { ...i, tokenAmount: amount } : i,
      ),
    })),
  clearCart: () => set({ items: [] }),
}));

export function useInvestmentCart() {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateAmount = useCartStore((s) => s.updateAmount);
  const clearCart = useCartStore((s) => s.clearCart);

  const totalCost = items.reduce((sum, i) => sum + i.tokenAmount * i.pricePerToken, 0);
  const itemCount = items.length;

  return { items, addItem, removeItem, updateAmount, clearCart, totalCost, itemCount };
}
