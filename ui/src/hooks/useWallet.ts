/**
 * Wallet Hook
 *
 * Provides easy access to wallet connection state and actions.
 */

import { useAccount, useConnect, useDisconnect, useSwitchChain, useBalance } from 'wagmi';
import { chainMetadata, type SupportedChainId } from '../config/wagmi';

interface ChainMeta {
  name: string;
  icon: string;
  isDefault: boolean;
  isTestnet: boolean;
}

interface UseWalletReturn {
  address: ReturnType<typeof useAccount>['address'];
  chainId: ReturnType<typeof useAccount>['chainId'];
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  isSwitchingChain: boolean;
  currentChain: ChainMeta | null;
  balance: ReturnType<typeof useBalance>['data'];
  displayAddress: string | null;
  displayBalance: string | null;
  isBalanceLoading: boolean;
  connect: ReturnType<typeof useConnect>['connect'];
  disconnect: ReturnType<typeof useDisconnect>['disconnect'];
  switchChain: ReturnType<typeof useSwitchChain>['switchChain'];
  connectors: ReturnType<typeof useConnect>['connectors'];
  connectError: ReturnType<typeof useConnect>['error'];
  switchError: ReturnType<typeof useSwitchChain>['error'];
}

export function useWallet(): UseWalletReturn {
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount();
  const { connect, connectors, isPending: isConnectPending, error: connectError } = useConnect();
  const { disconnect, isPending: isDisconnectPending } = useDisconnect();
  const { switchChain, isPending: isSwitchPending, error: switchError } = useSwitchChain();
  const { data: balance, isLoading: isBalanceLoading } = useBalance({
    address,
  });

  // Get current chain metadata
  const currentChain = chainId ? chainMetadata[chainId as SupportedChainId] ?? null : null;

  // Format address for display
  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  // Format balance for display
  const displayBalance = balance
    ? `${parseFloat(balance.formatted).toFixed(4)} ${balance.symbol}`
    : null;

  return {
    // State
    address,
    chainId,
    isConnected,
    isConnecting: isConnecting || isReconnecting || isConnectPending,
    isDisconnecting: isDisconnectPending,
    isSwitchingChain: isSwitchPending,
    currentChain,
    balance,
    displayAddress,
    displayBalance,
    isBalanceLoading,

    // Actions
    connect,
    disconnect,
    switchChain,

    // Available connectors
    connectors,

    // Errors
    connectError,
    switchError,
  };
}

export default useWallet;
