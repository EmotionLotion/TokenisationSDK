/**
 * x402 Agentic Monetization Gateway Middleware
 *
 * Implements the HTTP 402 Payment Required protocol for AI agent discovery
 * and autonomous payment of SDK workflow executions.
 *
 * Flow:
 * 1. Agent discovers endpoints via /.well-known/x402-manifest.json
 * 2. Agent calls a protected endpoint without payment → receives 402 + payment terms
 * 3. Agent constructs payment (EVM tx, Lightning, or stablecoin transfer)
 * 4. Agent retries with X-Payment header containing signed payment proof
 * 5. Middleware verifies payment on-chain and allows the request through
 *
 * Supports:
 * - EVM native token payments (ETH, MATIC)
 * - ERC-20 stablecoin payments (USDC, USDT)
 * - Per-call and subscription pricing models
 * - AI agent identification via X-Agent-Id header
 *
 * @packageDocumentation
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ethers } from 'ethers';

// ============================================================================
// Types
// ============================================================================

/**
 * Pricing model for an x402-protected endpoint
 */
export interface X402PricingRule {
  /** Route pattern (Express route syntax) */
  route: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | '*';
  /** Price in the smallest unit of the payment token (e.g., wei, USDC micro-units) */
  price: string;
  /** Payment token address (address(0) for native token) */
  paymentToken: string;
  /** Human-readable description for agent discovery */
  description: string;
  /** Human-readable token symbol */
  tokenSymbol: string;
  /** Token decimals for display */
  tokenDecimals: number;
  /** Maximum age of payment proof in seconds */
  maxPaymentAge?: number;
  /** Whether this endpoint requires a subscription instead of per-call payment */
  subscriptionOnly?: boolean;
}

/**
 * Payment proof submitted by an agent
 */
export interface X402PaymentProof {
  /** Payment transaction hash */
  txHash: string;
  /** Chain ID where payment was made */
  chainId: number;
  /** Payer address */
  payer: string;
  /** Amount paid (in token smallest units) */
  amount: string;
  /** Payment token address */
  paymentToken: string;
  /** Timestamp of payment */
  timestamp: number;
  /** EIP-712 signature of the payment intent */
  signature: string;
  /** Nonce for replay protection */
  nonce: string;
}

/**
 * x402 manifest entry for agent discovery
 */
export interface X402ManifestEntry {
  endpoint: string;
  method: string;
  description: string;
  pricing: {
    amount: string;
    token: string;
    tokenSymbol: string;
    tokenDecimals: number;
    chainId: number;
    receiverAddress: string;
  };
  authentication: 'x402-payment' | 'x402-subscription';
}

/**
 * x402 gateway configuration
 */
export interface X402GatewayConfig {
  /** Whether the gateway is enabled */
  enabled: boolean;
  /** Chain ID for payment verification */
  chainId: number;
  /** RPC URL for payment verification */
  rpcUrl: string;
  /** Address that receives payments */
  receiverAddress: string;
  /** Pricing rules for protected endpoints */
  pricingRules: X402PricingRule[];
  /** Maximum age of payment proof in seconds (default: 300) */
  maxPaymentAge?: number;
  /** Whether to verify payments on-chain (default: true, set false for testing) */
  verifyOnChain?: boolean;
  /** Grace period for subscription payments in seconds */
  subscriptionGracePeriod?: number;
}

// ============================================================================
// Payment Verification
// ============================================================================

const ERC20_TRANSFER_EVENT = ethers.id('Transfer(address,address,uint256)');

/**
 * Verify an on-chain payment transaction
 */
async function verifyPaymentOnChain(
  provider: ethers.JsonRpcProvider,
  proof: X402PaymentProof,
  rule: X402PricingRule,
  receiverAddress: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const receipt = await provider.getTransactionReceipt(proof.txHash);
    if (!receipt) {
      return { valid: false, reason: 'Transaction not found or not yet confirmed' };
    }

    if (receipt.status !== 1) {
      return { valid: false, reason: 'Transaction reverted' };
    }

    const requiredAmount = BigInt(rule.price);

    if (proof.paymentToken === ethers.ZeroAddress) {
      // Native token payment — check tx value
      const tx = await provider.getTransaction(proof.txHash);
      if (!tx) return { valid: false, reason: 'Transaction not found' };

      if (tx.to?.toLowerCase() !== receiverAddress.toLowerCase()) {
        return { valid: false, reason: 'Payment not sent to correct receiver' };
      }
      if (tx.value < requiredAmount) {
        return { valid: false, reason: `Insufficient payment: ${tx.value} < ${requiredAmount}` };
      }
    } else {
      // ERC-20 payment — check Transfer event logs
      const transferLog = receipt.logs.find(
        (log) =>
          log.topics[0] === ERC20_TRANSFER_EVENT &&
          log.address.toLowerCase() === proof.paymentToken.toLowerCase()
      );

      if (!transferLog) {
        return { valid: false, reason: 'ERC-20 Transfer event not found' };
      }

      const toAddress = '0x' + (transferLog.topics[2]?.slice(26) || '');
      if (toAddress.toLowerCase() !== receiverAddress.toLowerCase()) {
        return { valid: false, reason: 'ERC-20 transfer not to correct receiver' };
      }

      const transferAmount = BigInt(transferLog.data);
      if (transferAmount < requiredAmount) {
        return {
          valid: false,
          reason: `Insufficient ERC-20 payment: ${transferAmount} < ${requiredAmount}`,
        };
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      reason: `Verification error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

// ============================================================================
// Nonce Tracking (replay protection)
// ============================================================================

const usedNonces: Set<string> = new Set();
const NONCE_EXPIRY_MS = 600_000; // 10 minutes

function isNonceUsed(nonce: string): boolean {
  return usedNonces.has(nonce);
}

function markNonceUsed(nonce: string): void {
  usedNonces.add(nonce);
  // Auto-cleanup after expiry
  setTimeout(() => usedNonces.delete(nonce), NONCE_EXPIRY_MS);
}

// ============================================================================
// Route Matching
// ============================================================================

function matchRoute(
  requestPath: string,
  requestMethod: string,
  rule: X402PricingRule
): boolean {
  if (rule.method !== '*' && rule.method !== requestMethod.toUpperCase()) {
    return false;
  }

  // Convert Express route pattern to regex
  const pattern = rule.route
    .replace(/:[^/]+/g, '[^/]+')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${pattern}$`);
  return regex.test(requestPath);
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create the x402 payment gateway middleware
 */
export function createX402Gateway(config: X402GatewayConfig): RequestHandler {
  const maxPaymentAge = config.maxPaymentAge || 300;
  const verifyOnChain = config.verifyOnChain !== false;

  let provider: ethers.JsonRpcProvider | null = null;
  if (verifyOnChain) {
    provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  }

  const middleware: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!config.enabled) {
      next();
      return;
    }

    // Find matching pricing rule
    const rule = config.pricingRules.find((r) =>
      matchRoute(req.path, req.method, r)
    );

    // No pricing rule → pass through
    if (!rule) {
      next();
      return;
    }

    // Check for payment header
    const paymentHeader = req.headers['x-payment'] as string | undefined;

    if (!paymentHeader) {
      // Return 402 with payment terms
      res.status(402).json({
        type: 'x402-payment-required',
        version: '1.0',
        description: rule.description,
        pricing: {
          amount: rule.price,
          token: rule.paymentToken,
          tokenSymbol: rule.tokenSymbol,
          tokenDecimals: rule.tokenDecimals,
          chainId: config.chainId,
          receiverAddress: config.receiverAddress,
        },
        paymentMethods: [
          {
            type: 'evm-transfer',
            chainId: config.chainId,
            receiver: config.receiverAddress,
            token: rule.paymentToken,
            amount: rule.price,
          },
        ],
        headers: {
          required: ['X-Payment'],
          format:
            'JSON-encoded X402PaymentProof: { txHash, chainId, payer, amount, paymentToken, timestamp, signature, nonce }',
        },
        maxPaymentAge,
        endpoint: req.originalUrl,
        method: req.method,
      });
      return;
    }

    // Parse and validate payment proof
    let proof: X402PaymentProof;
    try {
      proof = JSON.parse(
        Buffer.from(paymentHeader, 'base64').toString('utf-8')
      );
    } catch {
      res.status(400).json({
        error: 'Invalid X-Payment header: must be base64-encoded JSON',
      });
      return;
    }

    // Replay protection
    if (isNonceUsed(proof.nonce)) {
      res.status(402).json({
        error: 'Payment nonce already used',
        type: 'x402-replay-detected',
      });
      return;
    }

    // Check payment age
    const paymentAge = Math.floor(Date.now() / 1000) - proof.timestamp;
    if (paymentAge > maxPaymentAge) {
      res.status(402).json({
        error: `Payment proof expired: ${paymentAge}s > ${maxPaymentAge}s`,
        type: 'x402-payment-expired',
      });
      return;
    }

    // Verify signature (EIP-712 typed data)
    try {
      const domain = {
        name: 'TokenisationSDK-x402',
        version: '1',
        chainId: config.chainId,
        verifyingContract: config.receiverAddress,
      };

      const types = {
        Payment: [
          { name: 'payer', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'paymentToken', type: 'address' },
          { name: 'nonce', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
        ],
      };

      const value = {
        payer: proof.payer,
        amount: proof.amount,
        paymentToken: proof.paymentToken,
        nonce: proof.nonce,
        timestamp: proof.timestamp,
      };

      const recoveredAddress = ethers.verifyTypedData(
        domain,
        types,
        value,
        proof.signature
      );

      if (recoveredAddress.toLowerCase() !== proof.payer.toLowerCase()) {
        res.status(402).json({
          error: 'Invalid payment signature',
          type: 'x402-invalid-signature',
        });
        return;
      }
    } catch {
      res.status(402).json({
        error: 'Payment signature verification failed',
        type: 'x402-signature-error',
      });
      return;
    }

    // On-chain verification
    if (verifyOnChain && provider) {
      const verification = await verifyPaymentOnChain(
        provider,
        proof,
        rule,
        config.receiverAddress
      );

      if (!verification.valid) {
        res.status(402).json({
          error: verification.reason,
          type: 'x402-payment-invalid',
        });
        return;
      }
    }

    // Mark nonce as used
    markNonceUsed(proof.nonce);

    // Attach payment info to request for downstream handlers
    (req as unknown as Record<string, unknown>).x402Payment = {
      payer: proof.payer,
      amount: proof.amount,
      txHash: proof.txHash,
      verified: true,
    };

    // Add agent identification
    const agentId = req.headers['x-agent-id'] as string | undefined;
    if (agentId) {
      (req as unknown as Record<string, unknown>).x402AgentId = agentId;
    }

    next();
  };

  return middleware;
}

// ============================================================================
// Manifest Handler
// ============================================================================

/**
 * Create the /.well-known/x402-manifest.json route handler
 */
export function createX402ManifestHandler(
  config: X402GatewayConfig
): RequestHandler {
  const manifest: X402ManifestEntry[] = config.pricingRules.map((rule) => ({
    endpoint: rule.route,
    method: rule.method,
    description: rule.description,
    pricing: {
      amount: rule.price,
      token: rule.paymentToken,
      tokenSymbol: rule.tokenSymbol,
      tokenDecimals: rule.tokenDecimals,
      chainId: config.chainId,
      receiverAddress: config.receiverAddress,
    },
    authentication: rule.subscriptionOnly
      ? 'x402-subscription'
      : 'x402-payment',
  }));

  return (_req: Request, res: Response) => {
    res.json({
      version: '1.0',
      name: 'TokenisationSDK x402 Gateway',
      description:
        'Monetized API endpoints for tokenized real-world asset workflows',
      baseUrl: process.env.API_BASE_URL || 'https://api.tokenisation.sdk',
      endpoints: manifest,
      capabilities: [
        'real-estate-tokenization',
        'airline-ticket-booking',
        'hotel-reservation',
        'car-rental',
        'concert-ticket',
      ],
      paymentChains: [
        {
          chainId: config.chainId,
          name: 'Primary',
          tokens: [
            ...new Set(
              config.pricingRules.map((r) => ({
                address: r.paymentToken,
                symbol: r.tokenSymbol,
                decimals: r.tokenDecimals,
              }))
            ),
          ],
        },
      ],
    });
  };
}

// ============================================================================
// Default Pricing Rules
// ============================================================================

/**
 * Default pricing rules for the tokenisation SDK endpoints.
 * USDC on Base (6 decimals). Prices in micro-USDC.
 */
export const DEFAULT_PRICING_RULES: X402PricingRule[] = [
  {
    route: '/api/v1/assets',
    method: 'POST',
    price: '1000000', // 1 USDC
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    description: 'Create a new tokenized asset',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
  {
    route: '/api/v1/assets/:id/mint',
    method: 'POST',
    price: '500000', // 0.50 USDC
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    description: 'Mint tokens for an asset',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
  {
    route: '/api/v1/transfers',
    method: 'POST',
    price: '250000', // 0.25 USDC
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    description: 'Execute a compliant token transfer',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
  {
    route: '/api/v1/hotels/search',
    method: 'GET',
    price: '100000', // 0.10 USDC
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    description: 'Search available hotel rooms',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
  {
    route: '/api/v1/hotels/:id/book',
    method: 'POST',
    price: '500000', // 0.50 USDC
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    description: 'Book a hotel room and mint reservation token',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
  {
    route: '/api/v1/flights/search',
    method: 'GET',
    price: '100000', // 0.10 USDC
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    description: 'Search available flights',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
  {
    route: '/api/v1/flights/:id/book',
    method: 'POST',
    price: '750000', // 0.75 USDC
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    description: 'Book a flight and mint ticket token',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
  {
    route: '/api/v1/car-rentals/search',
    method: 'GET',
    price: '100000', // 0.10 USDC
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    description: 'Search available rental vehicles',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
  {
    route: '/api/v1/concerts/search',
    method: 'GET',
    price: '50000', // 0.05 USDC
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    description: 'Search available concert tickets',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
  {
    route: '/api/v1/compliance/check',
    method: 'POST',
    price: '200000', // 0.20 USDC
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    description: 'Run compliance check on a wallet address',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
];

export default createX402Gateway;
