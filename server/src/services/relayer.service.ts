import { db, schema } from '../config/database.js';
import { eq, and, desc } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';

const { eventBusQueue } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isTestnet: boolean;
}

export interface TransactionRequest {
  to: string | null;
  from: string;
  data: string;
  value: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
  chainId: number;
}

export interface SignedTransaction {
  rawTransaction: string;
  hash: string;
  from: string;
  to: string | null;
  nonce: number;
  gasLimit: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  value: string;
  chainId: number;
}

export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  status: 'success' | 'failed';
  gasUsed: string;
  effectiveGasPrice: string;
  contractAddress?: string;
  logs: any[];
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  estimatedCost: string;
  estimatedCostUSD?: string;
}

// ============================================================================
// Chain Configuration
// ============================================================================

const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: process.env.ETH_MAINNET_RPC || 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: false,
  },
  {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: process.env.ETH_SEPOLIA_RPC || 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: true,
  },
  {
    chainId: 137,
    name: 'Polygon Mainnet',
    rpcUrl: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    isTestnet: false,
  },
  {
    chainId: 80001,
    name: 'Polygon Mumbai',
    rpcUrl: process.env.POLYGON_MUMBAI_RPC || 'https://rpc-mumbai.maticvigil.com',
    explorerUrl: 'https://mumbai.polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    isTestnet: true,
  },
  {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    rpcUrl: process.env.AVAX_RPC || 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    isTestnet: false,
  },
];

export function getChainConfig(chainId: number): ChainConfig {
  const config = SUPPORTED_CHAINS.find(c => c.chainId === chainId);
  if (!config) {
    throw new ValidationError(`Unsupported chain ID: ${chainId}`);
  }
  return config;
}

export function listSupportedChains(): ChainConfig[] {
  return SUPPORTED_CHAINS;
}

// ============================================================================
// JSON-RPC Client
// ============================================================================

async function jsonRpcCall(rpcUrl: string, method: string, params: any[]): Promise<any> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  const result = await response.json() as { error?: { message: string }; result?: unknown };

  if (result.error) {
    throw new Error(`RPC Error: ${result.error.message}`);
  }

  return result.result;
}

// ============================================================================
// Gas Estimation
// ============================================================================

export async function estimateGas(tx: TransactionRequest): Promise<GasEstimate> {
  const chain = getChainConfig(tx.chainId);

  // Get gas limit estimate
  const gasLimit = await jsonRpcCall(chain.rpcUrl, 'eth_estimateGas', [{
    from: tx.from,
    to: tx.to,
    data: tx.data,
    value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : '0x0',
  }]);

  // Get current gas prices
  const gasPrice = await jsonRpcCall(chain.rpcUrl, 'eth_gasPrice', []);

  // Get fee history for EIP-1559 chains
  let maxFeePerGas = gasPrice;
  let maxPriorityFeePerGas = '0x59682f00'; // 1.5 gwei default

  try {
    const feeHistory = await jsonRpcCall(chain.rpcUrl, 'eth_feeHistory', [4, 'latest', [25, 50, 75]]);
    if (feeHistory && feeHistory.baseFeePerGas) {
      const baseFee = BigInt(feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1]);
      maxFeePerGas = `0x${(baseFee * 2n).toString(16)}`;
      maxPriorityFeePerGas = `0x${(baseFee / 4n).toString(16)}`;
    }
  } catch {
    // Chain might not support EIP-1559
  }

  // Calculate estimated cost
  const gasLimitBn = BigInt(gasLimit);
  const gasPriceBn = BigInt(gasPrice);
  const estimatedCost = (gasLimitBn * gasPriceBn).toString();

  return {
    gasLimit: BigInt(gasLimit).toString(),
    gasPrice: BigInt(gasPrice).toString(),
    maxFeePerGas: BigInt(maxFeePerGas).toString(),
    maxPriorityFeePerGas: BigInt(maxPriorityFeePerGas).toString(),
    estimatedCost,
  };
}

// ============================================================================
// Nonce Management
// ============================================================================

// In-memory nonce tracking (in production, use Redis)
const nonceCache = new Map<string, number>();

export async function getNextNonce(chainId: number, address: string): Promise<number> {
  const chain = getChainConfig(chainId);
  const key = `${chainId}:${address.toLowerCase()}`;

  // Get on-chain nonce
  const onChainNonce = await jsonRpcCall(
    chain.rpcUrl,
    'eth_getTransactionCount',
    [address, 'pending']
  );

  const onChainNonceNum = parseInt(onChainNonce, 16);

  // Check cached nonce
  const cachedNonce = nonceCache.get(key);

  // Use the higher of cached or on-chain nonce
  const nextNonce = cachedNonce !== undefined
    ? Math.max(cachedNonce, onChainNonceNum)
    : onChainNonceNum;

  // Update cache
  nonceCache.set(key, nextNonce + 1);

  return nextNonce;
}

export function resetNonceCache(chainId: number, address: string): void {
  const key = `${chainId}:${address.toLowerCase()}`;
  nonceCache.delete(key);
}

// ============================================================================
// Transaction Building
// ============================================================================

export async function buildTransaction(params: {
  to: string | null;
  from: string;
  data: string;
  value?: string;
  chainId: number;
  gasLimit?: string;
  useEip1559?: boolean;
}): Promise<TransactionRequest> {
  const { to, from, data, value = '0', chainId, gasLimit, useEip1559 = true } = params;

  // Estimate gas if not provided
  const estimate = await estimateGas({
    to,
    from,
    data,
    value,
    chainId,
  });

  // Get next nonce
  const nonce = await getNextNonce(chainId, from);

  const tx: TransactionRequest = {
    to,
    from,
    data,
    value,
    chainId,
    nonce,
    gasLimit: gasLimit || estimate.gasLimit,
  };

  if (useEip1559) {
    tx.maxFeePerGas = estimate.maxFeePerGas;
    tx.maxPriorityFeePerGas = estimate.maxPriorityFeePerGas;
  } else {
    tx.gasPrice = estimate.gasPrice;
  }

  return tx;
}

// ============================================================================
// Transaction Signing (Custodial Mode)
// ============================================================================

// In production, this would use HSM or secure key management
// For MVP, we use environment-configured keys

interface SignerKey {
  address: string;
  privateKey: string;
}

function getSignerKey(address: string): SignerKey | null {
  // Check for configured signer keys
  const signerKeys = process.env.SIGNER_KEYS;
  if (!signerKeys) return null;

  try {
    const keys: SignerKey[] = JSON.parse(signerKeys);
    return keys.find(k => k.address.toLowerCase() === address.toLowerCase()) || null;
  } catch {
    return null;
  }
}

export async function signTransaction(
  tx: TransactionRequest,
  orgId: string
): Promise<{ signedTx: string; hash: string }> {
  // Check if we have the signer key for this address
  const signerKey = getSignerKey(tx.from);

  if (!signerKey) {
    throw new ValidationError(
      `No signer key configured for address ${tx.from}. Use non-custodial mode.`
    );
  }

  // In production, would use ethers.js or viem to sign
  // For MVP, return a mock signed transaction
  const mockTxHash = `0x${createHash('sha256')
    .update(JSON.stringify(tx) + Date.now())
    .digest('hex')}`;

  const mockSignedTx = `0x${randomBytes(200).toString('hex')}`;

  // Audit log
  await auditService.logSystemAction(
    orgId,
    'update',
    'transfer',
    mockTxHash,
    'Transaction signed in custodial mode',
    { from: tx.from, to: tx.to, chainId: tx.chainId }
  );

  return {
    signedTx: mockSignedTx,
    hash: mockTxHash,
  };
}

// ============================================================================
// Transaction Submission
// ============================================================================

export async function submitTransaction(
  chainId: number,
  signedTx: string,
  orgId: string
): Promise<{ txHash: string }> {
  const chain = getChainConfig(chainId);

  // Submit to RPC
  const txHash = await jsonRpcCall(chain.rpcUrl, 'eth_sendRawTransaction', [signedTx]);

  // Emit event for indexer
  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'chain.tx_submitted',
    payload: { chainId, txHash },
  });

  return { txHash };
}

export async function getTransactionReceipt(
  chainId: number,
  txHash: string
): Promise<TransactionReceipt | null> {
  const chain = getChainConfig(chainId);

  const receipt = await jsonRpcCall(chain.rpcUrl, 'eth_getTransactionReceipt', [txHash]);

  if (!receipt) return null;

  return {
    transactionHash: receipt.transactionHash,
    blockNumber: parseInt(receipt.txBlock, 16),
    blockHash: receipt.blockHash,
    status: receipt.status === '0x1' ? 'success' : 'failed',
    gasUsed: BigInt(receipt.gasUsed).toString(),
    effectiveGasPrice: BigInt(receipt.effectiveGasPrice || '0x0').toString(),
    contractAddress: receipt.contractAddress,
    logs: receipt.logs,
  };
}

export async function waitForTransaction(
  chainId: number,
  txHash: string,
  confirmations: number = 1,
  timeout: number = 120000
): Promise<TransactionReceipt> {
  const chain = getChainConfig(chainId);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const receipt = await getTransactionReceipt(chainId, txHash);

    if (receipt) {
      // Check confirmations
      const currentBlock = await jsonRpcCall(chain.rpcUrl, 'eth_blockNumber', []);
      const currentBlockNum = parseInt(currentBlock, 16);
      const txBlockNum = receipt.blockNumber;

      if (currentBlockNum - txBlockNum >= confirmations) {
        return receipt;
      }
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(`Transaction ${txHash} confirmation timeout`);
}

// ============================================================================
// Balance & State Queries
// ============================================================================

export async function getBalance(chainId: number, address: string): Promise<string> {
  const chain = getChainConfig(chainId);
  const balance = await jsonRpcCall(chain.rpcUrl, 'eth_getBalance', [address, 'latest']);
  return BigInt(balance).toString();
}

export async function getCode(chainId: number, address: string): Promise<string> {
  const chain = getChainConfig(chainId);
  return jsonRpcCall(chain.rpcUrl, 'eth_getCode', [address, 'latest']);
}

export async function call(chainId: number, to: string, data: string): Promise<string> {
  const chain = getChainConfig(chainId);
  return jsonRpcCall(chain.rpcUrl, 'eth_call', [{ to, data }, 'latest']);
}

export async function getBlockNumber(chainId: number): Promise<number> {
  const chain = getChainConfig(chainId);
  const blockNumber = await jsonRpcCall(chain.rpcUrl, 'eth_blockNumber', []);
  return parseInt(blockNumber, 16);
}

// ============================================================================
// Contract Interaction Helpers
// ============================================================================

// ERC20 function signatures
const ERC20_TRANSFER = '0xa9059cbb';
const ERC20_BALANCE_OF = '0x70a08231';
const ERC20_APPROVE = '0x095ea7b3';

export function encodeERC20Transfer(to: string, amount: string): string {
  const toHex = to.toLowerCase().slice(2).padStart(64, '0');
  const amountHex = BigInt(amount).toString(16).padStart(64, '0');
  return `${ERC20_TRANSFER}${toHex}${amountHex}`;
}

export function encodeERC20BalanceOf(address: string): string {
  const addressHex = address.toLowerCase().slice(2).padStart(64, '0');
  return `${ERC20_BALANCE_OF}${addressHex}`;
}

export function encodeERC20Approve(spender: string, amount: string): string {
  const spenderHex = spender.toLowerCase().slice(2).padStart(64, '0');
  const amountHex = BigInt(amount).toString(16).padStart(64, '0');
  return `${ERC20_APPROVE}${spenderHex}${amountHex}`;
}

export async function getERC20Balance(
  chainId: number,
  tokenAddress: string,
  walletAddress: string
): Promise<string> {
  const data = encodeERC20BalanceOf(walletAddress);
  const result = await call(chainId, tokenAddress, data);
  return BigInt(result).toString();
}

// ============================================================================
// Relayer Health Check
// ============================================================================

export async function checkChainHealth(chainId: number): Promise<{
  chainId: number;
  healthy: boolean;
  blockNumber?: number;
  gasPrice?: string;
  error?: string;
}> {
  try {
    const chain = getChainConfig(chainId);

    const [blockNumber, gasPrice] = await Promise.all([
      jsonRpcCall(chain.rpcUrl, 'eth_blockNumber', []),
      jsonRpcCall(chain.rpcUrl, 'eth_gasPrice', []),
    ]);

    return {
      chainId,
      healthy: true,
      blockNumber: parseInt(blockNumber, 16),
      gasPrice: BigInt(gasPrice).toString(),
    };
  } catch (error) {
    return {
      chainId,
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function checkAllChainsHealth(): Promise<{
  chainId: number;
  healthy: boolean;
  blockNumber?: number;
  error?: string;
}[]> {
  const results = await Promise.all(
    SUPPORTED_CHAINS.map(chain => checkChainHealth(chain.chainId))
  );
  return results;
}
