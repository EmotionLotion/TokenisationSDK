/**
 * useWallet Hook - Extended Wallet Utilities
 *
 * Provides additional wallet functionality beyond the basic context.
 *
 * @example
 * ```tsx
 * function WalletInfo() {
 *   const { address, balance, signMessage, isCorrectNetwork } = useWallet();
 *
 *   const handleSign = async () => {
 *     const signature = await signMessage('Please sign to verify your identity');
 *     console.log('Signature:', signature);
 *   };
 *
 *   return (
 *     <div>
 *       <p>Address: {address}</p>
 *       <p>Balance: {balance} ETH</p>
 *       {!isCorrectNetwork && <p>Please switch to the correct network</p>}
 *       <button onClick={handleSign}>Sign Message</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';
import type { WalletProvider } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface TransactionResponse {
  hash: string;
  from: string;
  to: string;
  value: string;
  nonce: number;
  gasLimit: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface UseWalletReturn {
  /** Current wallet address */
  address: string | null;

  /** Current chain ID */
  chainId: number | null;

  /** Whether wallet is connected */
  isConnected: boolean;

  /** Whether on correct network (based on config) */
  isCorrectNetwork: boolean;

  /** Native token balance (ETH, MATIC, etc.) */
  balance: string | null;

  /** ENS name if available */
  ensName: string | null;

  /** Wallet provider name */
  provider: WalletProvider | null;

  /** Connect wallet */
  connect: () => Promise<void>;

  /** Disconnect wallet */
  disconnect: () => Promise<void>;

  /** Switch to specified network */
  switchNetwork: (chainId: number) => Promise<void>;

  /** Sign a message */
  signMessage: (message: string) => Promise<string>;

  /** Sign typed data (EIP-712) */
  signTypedData: (domain: object, types: object, value: object) => Promise<string>;

  /** Send a transaction */
  sendTransaction: (tx: TransactionRequest) => Promise<TransactionResponse>;

  /** Get transaction receipt */
  getTransactionReceipt: (hash: string) => Promise<unknown>;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: Error | null;

  /** Refresh balance */
  refreshBalance: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useWallet(): UseWalletReturn {
  const { config, wallet, connectWallet, disconnectWallet, switchNetwork: ctxSwitchNetwork } =
    useTokenisation();

  const [balance, setBalance] = useState<string | null>(null);
  const [ensName, setEnsName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Derived state
  const address = wallet?.address ?? null;
  const chainId = wallet?.chainId ?? null;
  const isConnected = wallet?.isConnected ?? false;
  const provider = (wallet?.provider as WalletProvider) ?? null;

  // Check if on correct network
  const isCorrectNetwork = useMemo(() => {
    if (!chainId || !config.networks || config.networks.length === 0) return true;

    const defaultNetwork = config.networks.find((n) => n.isDefault);
    if (defaultNetwork) {
      return chainId === defaultNetwork.chainId;
    }

    return config.networks.some((n) => n.chainId === chainId);
  }, [chainId, config.networks]);

  // Fetch balance
  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }

    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) return;

      const balanceHex = await ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });

      // Convert from wei to ETH
      const balanceWei = BigInt(balanceHex);
      const balanceEth = Number(balanceWei) / 1e18;
      setBalance(balanceEth.toFixed(4));
    } catch (err) {
      console.warn('[useWallet] Failed to fetch balance:', err);
    }
  }, [address]);

  // Fetch ENS name
  const fetchEnsName = useCallback(async () => {
    if (!address || chainId !== 1) {
      setEnsName(null);
      return;
    }

    try {
      // Only works on mainnet
      const ethereum = (window as any).ethereum;
      if (!ethereum) return;

      // ENS reverse lookup via provider
      // This is a simplified version - production would use ethers.js or similar
      const response = await fetch(
        `https://api.ensideas.com/ens/resolve/${address}`
      ).catch(() => null);

      if (response?.ok) {
        const data = await response.json();
        if (data.name) {
          setEnsName(data.name);
        }
      }
    } catch {
      // ENS lookup failed, not critical
    }
  }, [address, chainId]);

  // Update balance and ENS on address/chain change
  useEffect(() => {
    refreshBalance();
    fetchEnsName();
  }, [refreshBalance, fetchEnsName]);

  // Connect
  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await connectWallet();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [connectWallet]);

  // Disconnect
  const disconnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await disconnectWallet();
      setBalance(null);
      setEnsName(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [disconnectWallet]);

  // Switch network
  const switchNetwork = useCallback(
    async (targetChainId: number) => {
      setLoading(true);
      setError(null);
      try {
        await ctxSwitchNetwork(targetChainId);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [ctxSwitchNetwork]
  );

  // Sign message
  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      setLoading(true);
      setError(null);

      try {
        if (!address) {
          throw new Error('Wallet not connected');
        }

        const ethereum = (window as any).ethereum;
        if (!ethereum) {
          throw new Error('No wallet provider found');
        }

        const signature = await ethereum.request({
          method: 'personal_sign',
          params: [message, address],
        });

        return signature;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  // Sign typed data (EIP-712)
  const signTypedData = useCallback(
    async (domain: object, types: object, value: object): Promise<string> => {
      setLoading(true);
      setError(null);

      try {
        if (!address) {
          throw new Error('Wallet not connected');
        }

        const ethereum = (window as any).ethereum;
        if (!ethereum) {
          throw new Error('No wallet provider found');
        }

        const typedData = {
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' },
            ],
            ...types,
          },
          primaryType: Object.keys(types)[0],
          domain,
          message: value,
        };

        const signature = await ethereum.request({
          method: 'eth_signTypedData_v4',
          params: [address, JSON.stringify(typedData)],
        });

        return signature;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  // Send transaction
  const sendTransaction = useCallback(
    async (tx: TransactionRequest): Promise<TransactionResponse> => {
      setLoading(true);
      setError(null);

      try {
        if (!address) {
          throw new Error('Wallet not connected');
        }

        const ethereum = (window as any).ethereum;
        if (!ethereum) {
          throw new Error('No wallet provider found');
        }

        const txParams: any = {
          from: address,
          to: tx.to,
        };

        if (tx.value) txParams.value = tx.value;
        if (tx.data) txParams.data = tx.data;
        if (tx.gasLimit) txParams.gas = tx.gasLimit;
        if (tx.gasPrice) txParams.gasPrice = tx.gasPrice;
        if (tx.maxFeePerGas) txParams.maxFeePerGas = tx.maxFeePerGas;
        if (tx.maxPriorityFeePerGas) txParams.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;

        const hash = await ethereum.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        });

        // Return basic response (full details would require waiting for receipt)
        return {
          hash,
          from: address,
          to: tx.to,
          value: tx.value || '0',
          nonce: 0, // Would need to fetch
          gasLimit: tx.gasLimit || '0',
          gasPrice: tx.gasPrice,
          maxFeePerGas: tx.maxFeePerGas,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  // Get transaction receipt
  const getTransactionReceipt = useCallback(
    async (hash: string): Promise<unknown> => {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error('No wallet provider found');
      }

      const receipt = await ethereum.request({
        method: 'eth_getTransactionReceipt',
        params: [hash],
      });

      return receipt;
    },
    []
  );

  return {
    address,
    chainId,
    isConnected,
    isCorrectNetwork,
    balance,
    ensName,
    provider,
    connect,
    disconnect,
    switchNetwork,
    signMessage,
    signTypedData,
    sendTransaction,
    getTransactionReceipt,
    loading,
    error,
    refreshBalance,
  };
}
