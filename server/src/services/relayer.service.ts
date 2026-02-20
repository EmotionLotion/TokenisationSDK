import { db, schema, rawQuery } from '../config/database.js';
import { eq, and, desc } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { Wallet, keccak256, toBeHex } from 'ethers';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../middleware/logger.js';
import * as auditService from './audit.service.js';
import { SUPPORTED_CHAINS as CHAIN_REGISTRY, getRpcUrl } from '../config/chains.js';

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

/** EVM log entry from transaction receipt */
export interface TransactionLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
}

export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  status: 'success' | 'failed';
  gasUsed: string;
  effectiveGasPrice: string;
  contractAddress?: string;
  logs: TransactionLog[];
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  estimatedCost: string;
  estimatedCostUSD?: string;
}

/** RPC response types for proper typing */
interface EthFeeHistory {
  baseFeePerGas: string[];
  gasUsedRatio: number[];
  oldestBlock: string;
  reward?: string[][];
}

interface EthTransactionReceipt {
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  status: string;
  gasUsed: string;
  effectiveGasPrice?: string;
  contractAddress?: string;
  logs: TransactionLog[];
}

// ============================================================================
// Chain Configuration
// ============================================================================

// Derive relayer chain configs from the canonical chain registry in config/chains.ts
const SUPPORTED_CHAINS: ChainConfig[] = Object.values(CHAIN_REGISTRY)
  .filter(c => c.isActive)
  .map(c => ({
    chainId: c.chainId,
    name: c.name,
    rpcUrl: c.rpcUrls[0],
    explorerUrl: c.blockExplorerUrl,
    nativeCurrency: c.nativeCurrency,
    isTestnet: c.isTestnet,
  }));

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

/** Generic JSON-RPC parameter types */
type RpcParam = string | number | boolean | null | Record<string, unknown> | RpcParam[];

async function jsonRpcCall<T = unknown>(rpcUrl: string, method: string, params: RpcParam[]): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000); // 15-second timeout

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
      signal: controller.signal,
    });

    const result = await response.json() as { error?: { message: string }; result?: T };

    if (result.error) {
      throw new Error(`RPC Error: ${result.error.message}`);
    }

    return result.result as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Gas Estimation
// ============================================================================

export async function estimateGas(tx: TransactionRequest): Promise<GasEstimate> {
  const chain = getChainConfig(tx.chainId);

  // Get gas limit estimate
  const gasLimit = await jsonRpcCall<string>(chain.rpcUrl, 'eth_estimateGas', [{
    from: tx.from,
    to: tx.to,
    data: tx.data,
    value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : '0x0',
  }]);

  // Get current gas prices
  const gasPrice = await jsonRpcCall<string>(chain.rpcUrl, 'eth_gasPrice', []);

  // Get fee history for EIP-1559 chains
  let maxFeePerGas = gasPrice;
  let maxPriorityFeePerGas = '0x59682f00'; // 1.5 gwei default

  try {
    const feeHistory = await jsonRpcCall<EthFeeHistory>(chain.rpcUrl, 'eth_feeHistory', [4, 'latest', [25, 50, 75]]);
    if (feeHistory && feeHistory.baseFeePerGas) {
      const baseFee = BigInt(feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1]);
      maxFeePerGas = `0x${(baseFee * 2n).toString(16)}`;
      maxPriorityFeePerGas = `0x${(baseFee / 4n).toString(16)}`;
    }
  } catch {
    // Chain might not support EIP-1559
  }

  // Calculate estimated cost
  const gasLimitBn = BigInt(gasLimit as string);
  const gasPriceBn = BigInt(gasPrice);
  const estimatedCost = (gasLimitBn * gasPriceBn).toString();

  return {
    gasLimit: BigInt(gasLimit as string).toString(),
    gasPrice: BigInt(gasPrice).toString(),
    maxFeePerGas: BigInt(maxFeePerGas).toString(),
    maxPriorityFeePerGas: BigInt(maxPriorityFeePerGas).toString(),
    estimatedCost,
  };
}

// ============================================================================
// Nonce Management (DB-backed)
// ============================================================================

let nonceTableReady = false;

async function ensureNonceTable(): Promise<void> {
  if (nonceTableReady) return;
  await rawQuery(`
    CREATE TABLE IF NOT EXISTS nonce_cache (
      chain_address TEXT PRIMARY KEY,
      nonce INTEGER NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  nonceTableReady = true;
}

export async function getNextNonce(chainId: number, address: string): Promise<number> {
  const chain = getChainConfig(chainId);
  const key = `${chainId}:${address.toLowerCase()}`;

  await ensureNonceTable();

  // Get on-chain nonce
  const onChainNonce = await jsonRpcCall<string>(
    chain.rpcUrl,
    'eth_getTransactionCount',
    [address, 'pending']
  );

  const onChainNonceNum = parseInt(onChainNonce, 16);

  // Read cached nonce from DB
  const rows = await rawQuery<{ nonce: number }>(
    'SELECT nonce FROM nonce_cache WHERE chain_address = $1',
    [key]
  );
  const cachedNonce = rows.length > 0 ? rows[0].nonce : undefined;

  // Use the higher of cached or on-chain nonce
  const nextNonce = cachedNonce !== undefined
    ? Math.max(cachedNonce, onChainNonceNum)
    : onChainNonceNum;

  // Write back to DB (upsert)
  // Use $3 for the duplicate nonce value so that SQLite ? positional binding works correctly
  await rawQuery(
    `INSERT INTO nonce_cache (chain_address, nonce, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (chain_address) DO UPDATE SET nonce = $3, updated_at = CURRENT_TIMESTAMP`,
    [key, nextNonce + 1, nextNonce + 1]
  );

  return nextNonce;
}

export async function resetNonceCache(chainId: number, address: string): Promise<void> {
  const key = `${chainId}:${address.toLowerCase()}`;
  await ensureNonceTable();
  await rawQuery('DELETE FROM nonce_cache WHERE chain_address = $1', [key]);
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

// ============================================================================
// Signing Provider Abstraction (HSM/KMS/Local)
// ============================================================================

type SigningMode = 'local' | 'aws-kms' | 'gcp-kms';

const SIGNING_MODE: SigningMode = (process.env.TX_SIGNING_MODE as SigningMode) || 'local';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * AWS KMS signing support.
 * Uses AWS KMS to sign transaction hashes — private key never leaves the HSM.
 */
async function signWithKMS(txHash: string, kmsKeyId: string): Promise<string> {
  const { KMSClient, SignCommand } = await import('@aws-sdk/client-kms');

  const client = new KMSClient({
    region: process.env.AWS_KMS_REGION || process.env.AWS_REGION || 'us-east-1',
    ...(process.env.AWS_ACCESS_KEY_ID && {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    }),
  });

  const command = new SignCommand({
    KeyId: kmsKeyId,
    Message: Buffer.from(txHash.slice(2), 'hex'),
    MessageType: 'DIGEST',
    SigningAlgorithm: 'ECDSA_SHA_256',
  });

  const response = await client.send(command);
  if (!response.Signature) {
    throw new Error('KMS signing returned no signature');
  }

  // Convert DER-encoded signature to Ethereum-compatible r,s,v format
  // Need the expected signer address to trial-recover v
  const expectedAddress = process.env.KMS_SIGNER_ADDRESS || '';
  return derToEthSignature(Buffer.from(response.Signature), txHash, expectedAddress);
}

/**
 * Convert DER-encoded ECDSA signature to Ethereum's r+s+v format (65 bytes).
 * Trial-recovers v=27 and v=28 to find the correct recovery ID.
 */
function derToEthSignature(derSig: Buffer, digest: string, expectedAddress: string): string {
  // DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  let offset = 2; // skip 0x30 and total length

  // Parse r
  if (derSig[offset] !== 0x02) throw new Error('Invalid DER signature: expected 0x02 for r');
  offset++;
  const rLen = derSig[offset++];
  let r = derSig.subarray(offset, offset + rLen);
  offset += rLen;

  // Parse s
  if (derSig[offset] !== 0x02) throw new Error('Invalid DER signature: expected 0x02 for s');
  offset++;
  const sLen = derSig[offset++];
  let s = derSig.subarray(offset, offset + sLen);

  // Remove leading zeros and pad to 32 bytes
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (s.length > 32) s = s.subarray(s.length - 32);

  const rHex = r.toString('hex').padStart(64, '0');
  const sHex = s.toString('hex').padStart(64, '0');

  // secp256k1 curve order half — enforce low-s for EIP-2
  const secp256k1N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
  const secp256k1HalfN = secp256k1N / 2n;
  let sBig = BigInt('0x' + sHex);
  let sHexFinal = sHex;
  if (sBig > secp256k1HalfN) {
    sBig = secp256k1N - sBig;
    sHexFinal = sBig.toString(16).padStart(64, '0');
  }

  // Trial-recover the correct v (27 or 28)
  if (expectedAddress) {
    const { ethers } = require('ethers') as typeof import('ethers');
    for (const v of [27, 28]) {
      const vHex = v.toString(16).padStart(2, '0');
      const sig = `0x${rHex}${sHexFinal}${vHex}`;
      try {
        const recovered = ethers.recoverAddress(digest, sig);
        if (recovered.toLowerCase() === expectedAddress.toLowerCase()) {
          return sig;
        }
      } catch {
        continue;
      }
    }
    logger.warn('KMS signature recovery: could not match expected signer address, defaulting to v=27');
  }

  // Default to v=27 if no expected address or no match
  return `0x${rHex}${sHexFinal}1b`;
}

function getSignerKey(address: string): SignerKey | null {
  // Check for configured signer keys
  const signerKeys = process.env.SIGNER_KEYS;
  if (!signerKeys) return null;

  try {
    const keys: SignerKey[] = JSON.parse(signerKeys);
    const key = keys.find(k => k.address.toLowerCase() === address.toLowerCase()) || null;

    if (key && IS_PRODUCTION) {
      logger.warn(
        'SECURITY WARNING: Using local private keys for transaction signing in production. ' +
        'Set TX_SIGNING_MODE=aws-kms with KMS_SIGNER_KEY_IDS for HSM-backed signing.'
      );
    }

    return key;
  } catch {
    return null;
  }
}

export async function signTransaction(
  tx: TransactionRequest,
  orgId: string
): Promise<{ signedTx: string; hash: string }> {
  const signerKey = getSignerKey(tx.from);
  if (!signerKey) {
    throw new ValidationError(
      `No signer key configured for address ${tx.from}. Use non-custodial mode.`
    );
  }

  const wallet = new Wallet(signerKey.privateKey);

  // Fetch nonce if not provided
  const chain = getChainConfig(tx.chainId);
  const nonce = tx.nonce ?? await jsonRpcCall<string>(
    chain.rpcUrl, 'eth_getTransactionCount', [tx.from, 'pending']
  ).then(hex => parseInt(hex, 16));

  // Build ethers-compatible tx object
  const ethTx: Record<string, unknown> = {
    to: tx.to,
    data: tx.data,
    value: tx.value ? BigInt(tx.value) : 0n,
    nonce,
    chainId: tx.chainId,
  };

  // Use EIP-1559 if maxFeePerGas provided, otherwise legacy
  if (tx.maxFeePerGas) {
    ethTx.maxFeePerGas = BigInt(tx.maxFeePerGas);
    ethTx.maxPriorityFeePerGas = tx.maxPriorityFeePerGas
      ? BigInt(tx.maxPriorityFeePerGas)
      : 1_500_000_000n; // 1.5 gwei default
    ethTx.type = 2;
  } else if (tx.gasPrice) {
    ethTx.gasPrice = BigInt(tx.gasPrice);
    ethTx.type = 0;
  } else {
    // Fetch current gas price
    const gasPriceHex = await jsonRpcCall<string>(chain.rpcUrl, 'eth_gasPrice', []);
    ethTx.gasPrice = BigInt(gasPriceHex);
    ethTx.type = 0;
  }

  // Gas limit
  if (tx.gasLimit) {
    ethTx.gasLimit = BigInt(tx.gasLimit);
  } else {
    const estimateHex = await jsonRpcCall<string>(chain.rpcUrl, 'eth_estimateGas', [{
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: tx.value ? toBeHex(BigInt(tx.value)) : '0x0',
    }]);
    ethTx.gasLimit = BigInt(estimateHex) * 120n / 100n; // 20% buffer
  }

  const signedTx = await wallet.signTransaction(ethTx);
  const hash = keccak256(signedTx);

  await auditService.logSystemAction(
    orgId, 'update', 'transfer', hash,
    'Transaction signed in custodial mode',
    { from: tx.from, to: tx.to, chainId: tx.chainId }
  );

  return { signedTx, hash };
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
  const txHash = await jsonRpcCall<string>(chain.rpcUrl, 'eth_sendRawTransaction', [signedTx]);

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

  const receipt = await jsonRpcCall<EthTransactionReceipt | null>(chain.rpcUrl, 'eth_getTransactionReceipt', [txHash]);

  if (!receipt) return null;

  return {
    transactionHash: receipt.transactionHash,
    blockNumber: parseInt(receipt.blockNumber, 16),
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
      const currentBlock = await jsonRpcCall<string>(chain.rpcUrl, 'eth_blockNumber', []);
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
  const balance = await jsonRpcCall<string>(chain.rpcUrl, 'eth_getBalance', [address, 'latest']);
  return BigInt(balance).toString();
}

export async function getCode(chainId: number, address: string): Promise<string> {
  const chain = getChainConfig(chainId);
  return jsonRpcCall<string>(chain.rpcUrl, 'eth_getCode', [address, 'latest']);
}

export async function call(chainId: number, to: string, data: string): Promise<string> {
  const chain = getChainConfig(chainId);
  return jsonRpcCall<string>(chain.rpcUrl, 'eth_call', [{ to, data }, 'latest']);
}

export async function getBlockNumber(chainId: number): Promise<number> {
  const chain = getChainConfig(chainId);
  const blockNumber = await jsonRpcCall<string>(chain.rpcUrl, 'eth_blockNumber', []);
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
// Generic Contract View Call
// ============================================================================

/**
 * Calls a read-only (view/pure) contract function via `eth_call`.
 *
 * @param chainId       - Target chain ID
 * @param contractAddress - Contract to call
 * @param functionSignature - 4-byte selector, e.g. '0x12345678'
 * @param params        - ABI-encoded parameters (already hex-encoded, without 0x prefix)
 * @returns Raw hex-encoded return data from the contract
 */
export async function callContractView(
  chainId: number,
  contractAddress: string,
  functionSignature: string,
  params: string[] = [],
): Promise<string> {
  // Build calldata: function selector + ABI-encoded params
  const encodedParams = params
    .map(p => p.replace(/^0x/, '').padStart(64, '0'))
    .join('');
  const data = `${functionSignature}${encodedParams}`;

  return call(chainId, contractAddress, data);
}

/**
 * Calls `canTransfer(address,address,uint256)` on an ERC3643 / compliance token.
 * Returns true if the on-chain compliance module allows the transfer.
 *
 * canTransfer selector: 0x8b477adb (keccak256('canTransfer(address,address,uint256)')[:8])
 */
export async function canTransfer(
  chainId: number,
  contractAddress: string,
  from: string,
  to: string,
  amount: string,
): Promise<boolean> {
  const functionSignature = '0x8b477adb';
  const params = [
    from.toLowerCase(),
    to.toLowerCase(),
    `0x${BigInt(amount).toString(16)}`,
  ];

  try {
    const result = await callContractView(chainId, contractAddress, functionSignature, params);
    // bool is ABI-encoded as 32 bytes; last byte = 0x01 means true
    return BigInt(result) === 1n;
  } catch {
    // If the contract doesn't implement canTransfer, or RPC fails, we
    // don't want to block — the off-chain compliance engine already passed.
    return true;
  }
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
      jsonRpcCall<string>(chain.rpcUrl, 'eth_blockNumber', []),
      jsonRpcCall<string>(chain.rpcUrl, 'eth_gasPrice', []),
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
