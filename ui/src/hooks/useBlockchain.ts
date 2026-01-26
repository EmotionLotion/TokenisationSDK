/**
 * useBlockchain - Blockchain Integration Hooks
 *
 * Provides React hooks for interacting with token adapters and smart contracts.
 * Integrates with wagmi for wallet connection and the SDK's token adapters.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';

// ============================================================================
// TYPES
// ============================================================================

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  formatted: string;
}

export interface TransactionResult {
  hash: string;
  status: 'pending' | 'success' | 'error';
  blockNumber?: number;
  error?: string;
}

export interface TokenAdapterConfig {
  address: string;
  type: 'ERC20' | 'ERC721' | 'SOULBOUND' | 'ERC1410' | 'ERC4626';
  chainId: number;
}

// Standard ERC20 ABI for basic operations
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
] as const;

// ERC721 ABI
const ERC721_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function approve(address to, uint256 tokenId)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
] as const;

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to get basic wallet connection status
 * Note: For full wallet functionality, use useWallet from './useWallet'
 */
export function useWalletConnection() {
  const { address, isConnected, isConnecting, chain } = useAccount();

  return {
    address: address ?? null,
    isConnected,
    isConnecting,
    chainId: chain?.id ?? null,
    chainName: chain?.name ?? null,
  };
}

/**
 * Hook to fetch ERC20 token balance
 */
export function useTokenBalance(tokenAddress: string | null) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!tokenAddress || !address || !publicClient) {
      setBalance(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Read token info
      const [name, symbol, decimals, rawBalance] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'name',
        }) as Promise<string>,
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }) as Promise<string>,
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }) as Promise<number>,
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }) as Promise<bigint>,
      ]);

      const formatted = (Number(rawBalance) / Math.pow(10, decimals)).toLocaleString(undefined, {
        maximumFractionDigits: decimals,
      });

      setBalance({
        address: tokenAddress,
        name,
        symbol,
        decimals,
        balance: rawBalance.toString(),
        formatted,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [tokenAddress, address, publicClient]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return { balance, isLoading, error, refetch: fetchBalance };
}

/**
 * Hook to transfer ERC20 tokens
 */
export function useTokenTransfer() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<TransactionResult | null>(null);

  const transfer = useCallback(
    async (tokenAddress: string, to: string, amount: string, decimals: number = 18) => {
      if (!walletClient || !publicClient) {
        setResult({ hash: '', status: 'error', error: 'Wallet not connected' });
        return null;
      }

      setIsPending(true);
      setResult({ hash: '', status: 'pending' });

      try {
        // Convert amount to wei
        const amountWei = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));

        // Send transaction
        const hash = await walletClient.writeContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [to as `0x${string}`, amountWei],
        });

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        const txResult: TransactionResult = {
          hash,
          status: receipt.status === 'success' ? 'success' : 'error',
          blockNumber: Number(receipt.blockNumber),
        };

        setResult(txResult);
        return txResult;
      } catch (err) {
        const txResult: TransactionResult = {
          hash: '',
          status: 'error',
          error: err instanceof Error ? err.message : 'Transfer failed',
        };
        setResult(txResult);
        return txResult;
      } finally {
        setIsPending(false);
      }
    },
    [walletClient, publicClient]
  );

  return { transfer, isPending, result };
}

/**
 * Hook to approve ERC20 token spending
 */
export function useTokenApproval() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [isPending, setIsPending] = useState(false);

  const approve = useCallback(
    async (tokenAddress: string, spender: string, amount: string, decimals: number = 18) => {
      if (!walletClient || !publicClient) {
        return { success: false, error: 'Wallet not connected' };
      }

      setIsPending(true);

      try {
        const amountWei = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));

        const hash = await walletClient.writeContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [spender as `0x${string}`, amountWei],
        });

        await publicClient.waitForTransactionReceipt({ hash });

        return { success: true, hash };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Approval failed' };
      } finally {
        setIsPending(false);
      }
    },
    [walletClient, publicClient]
  );

  return { approve, isPending };
}

/**
 * Hook for NFT (ERC721) operations
 */
export function useNFT(contractAddress: string | null) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [ownedTokens, setOwnedTokens] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchOwnedTokens = useCallback(async () => {
    if (!contractAddress || !address || !publicClient) {
      setOwnedTokens([]);
      return;
    }

    setIsLoading(true);
    try {
      const balance = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: ERC721_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;

      // For simplicity, we'll store the count - in production you'd enumerate token IDs
      setOwnedTokens(Array.from({ length: Number(balance) }, (_, i) => i.toString()));
    } catch (err) {
      console.error('Failed to fetch NFTs:', err);
      setOwnedTokens([]);
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress, address, publicClient]);

  const transferNFT = useCallback(
    async (tokenId: string, to: string) => {
      if (!walletClient || !publicClient || !contractAddress || !address) {
        return { success: false, error: 'Not connected' };
      }

      try {
        const hash = await walletClient.writeContract({
          address: contractAddress as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'safeTransferFrom',
          args: [address, to as `0x${string}`, BigInt(tokenId)],
        });

        await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, hash };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Transfer failed' };
      }
    },
    [walletClient, publicClient, contractAddress, address]
  );

  useEffect(() => {
    fetchOwnedTokens();
  }, [fetchOwnedTokens]);

  return { ownedTokens, isLoading, refetch: fetchOwnedTokens, transferNFT };
}

/**
 * Hook for contract event listening
 */
export function useContractEvents(
  contractAddress: string | null,
  eventName: string,
  abi: readonly unknown[]
) {
  const publicClient = usePublicClient();
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!contractAddress || !publicClient) return;

    const unwatch = publicClient.watchContractEvent({
      address: contractAddress as `0x${string}`,
      abi,
      eventName,
      onLogs: (logs) => {
        setEvents((prev) => [...logs, ...prev].slice(0, 100)); // Keep last 100
      },
    });

    return () => unwatch();
  }, [contractAddress, publicClient, eventName, abi]);

  return events;
}
