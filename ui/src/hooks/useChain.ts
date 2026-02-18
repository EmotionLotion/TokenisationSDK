/**
 * Chain Hook
 *
 * Provides chain-related utilities and switching functionality.
 */

import { useSwitchChain, useChainId } from 'wagmi';
import { supportedChains, chainMetadata, type SupportedChainId } from '../config/wagmi';

interface ChainMeta {
  name: string;
  icon: string;
  isDefault: boolean;
  isTestnet: boolean;
}

interface UseChainReturn {
  currentChainId: number;
  currentChain: (typeof supportedChains)[number] | null;
  currentChainMeta: ChainMeta | null;
  isSwitching: boolean;
  switchError: Error | null;
  supportedChains: typeof supportedChains;
  mainnets: (typeof supportedChains)[number][];
  testnets: (typeof supportedChains)[number][];
  chainMetadata: typeof chainMetadata;
  switchTo: (chainId: number) => void;
  switchToDefault: () => void;
  switchChain: ReturnType<typeof useSwitchChain>['switchChain'];
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useChain(): UseChainReturn {
  const currentChainId = useChainId();
  const { switchChain, isPending, error } = useSwitchChain();

  // Get current chain info
  const currentChain = currentChainId
    ? supportedChains.find(c => c.id === currentChainId) ?? null
    : null;

  const currentChainMeta = currentChainId
    ? chainMetadata[currentChainId as SupportedChainId] ?? null
    : null;

  // Get mainnets only
  const mainnets = supportedChains.filter(
    c => !chainMetadata[c.id as SupportedChainId]?.isTestnet
  );

  // Get testnets only
  const testnets = supportedChains.filter(
    c => chainMetadata[c.id as SupportedChainId]?.isTestnet
  );

  // Switch to a specific chain
  const switchTo = (chainId: number) => {
    if (chainId !== currentChainId) {
      switchChain({ chainId });
    }
  };

  // Switch to default chain (Base)
  const switchToDefault = () => {
    const defaultChain = supportedChains.find(
      c => chainMetadata[c.id as SupportedChainId]?.isDefault
    );
    if (defaultChain && defaultChain.id !== currentChainId) {
      switchChain({ chainId: defaultChain.id });
    }
  };

  return {
    // State
    currentChainId,
    currentChain,
    currentChainMeta,
    isSwitching: isPending,
    switchError: error,

    // Available chains
    supportedChains,
    mainnets,
    testnets,
    chainMetadata,

    // Actions
    switchTo,
    switchToDefault,
    switchChain,
  };
}

export default useChain;
