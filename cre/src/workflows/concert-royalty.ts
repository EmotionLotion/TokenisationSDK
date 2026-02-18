/**
 * CRE Workflow: Concert Ticket Royalty Enforcement
 *
 * EVM Log-triggered workflow that intercepts secondary market Transfer events
 * for concert ticket tokens, calculates the royalty split between
 * Promoter and Artist, and executes atomic settlement before the transfer
 * is finalized.
 *
 * Architecture:
 * - Triggered by Transfer events on concert ticket token contracts
 * - Reads royalty configuration from on-chain RoyaltyRegistry
 * - Calculates split amounts with DON consensus
 * - Executes atomic multi-send: royalties to artist + promoter, remainder to seller
 * - Reports royalty payment on-chain for audit trail
 *
 * @packageDocumentation
 */

import {
  Workflow,
  EVMLogTrigger,
  EVMCapability,
  HttpCapability,
  ConsensusCapability,
  type WorkflowSpec,
  type TriggerEvent,
  type EVMLogEvent,
} from '@chainlink/cre-sdk';

// ============================================================================
// Types
// ============================================================================

interface RoyaltyConfig {
  tokenAddress: string;
  eventId: string;
  eventName: string;
  /** Artist royalty percentage (basis points, e.g., 500 = 5%) */
  artistBps: number;
  /** Promoter royalty percentage (basis points) */
  promoterBps: number;
  /** Artist payment address */
  artistAddress: string;
  /** Promoter payment address */
  promoterAddress: string;
  /** Minimum sale price for royalty to apply (wei) */
  minimumSalePrice: string;
  /** Maximum royalty cap per transaction (wei), 0 = no cap */
  royaltyCap: string;
  /** Whether primary sales are exempt from royalties */
  primarySaleExempt: boolean;
  /** Original minter address (for primary sale detection) */
  minterAddress: string;
}

interface RoyaltyCalculation {
  salePrice: string;        // wei
  totalRoyaltyBps: number;
  artistAmount: string;     // wei
  promoterAmount: string;   // wei
  sellerProceeds: string;   // wei
  capped: boolean;
}

interface RoyaltySettlementResult {
  transferTxHash: string;
  tokenId: string;
  seller: string;
  buyer: string;
  salePrice: string;
  royalty: RoyaltyCalculation;
  artistPaymentTxHash?: string;
  promoterPaymentTxHash?: string;
  settlementTxHash?: string;
  timestamp: string;
  status: 'settled' | 'exempt' | 'below_minimum' | 'failed';
}

// ============================================================================
// Contract ABIs
// ============================================================================

const ROYALTY_REGISTRY_ABI = [
  {
    name: 'getRoyaltyConfig',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenAddress', type: 'address' }],
    outputs: [
      { name: 'artistBps', type: 'uint256' },
      { name: 'promoterBps', type: 'uint256' },
      { name: 'artistAddress', type: 'address' },
      { name: 'promoterAddress', type: 'address' },
      { name: 'minimumSalePrice', type: 'uint256' },
      { name: 'royaltyCap', type: 'uint256' },
      { name: 'primarySaleExempt', type: 'bool' },
      { name: 'minterAddress', type: 'address' },
    ],
  },
  {
    name: 'getLastSalePrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenAddress', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ name: 'price', type: 'uint256' }],
  },
] as const;

const ROYALTY_SETTLEMENT_ABI = [
  {
    name: 'settleRoyalty',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenAddress', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'seller', type: 'address' },
      { name: 'buyer', type: 'address' },
      { name: 'salePrice', type: 'uint256' },
      { name: 'artistAmount', type: 'uint256' },
      { name: 'promoterAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'settlementId', type: 'bytes32' }],
  },
  {
    name: 'recordRoyaltyPayment',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenAddress', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'artistAmount', type: 'uint256' },
      { name: 'promoterAmount', type: 'uint256' },
      { name: 'salePrice', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

// Transfer(address,address,uint256) topic
const TRANSFER_EVENT_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const CHAIN_ID = process.env.CRE_CHAIN_ID || '11155111';
const ROYALTY_REGISTRY_ADDRESS =
  process.env.ROYALTY_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000000000';
const ROYALTY_SETTLEMENT_ADDRESS =
  process.env.ROYALTY_SETTLEMENT_ADDRESS || '0x0000000000000000000000000000000000000000';

// ============================================================================
// Royalty Calculation
// ============================================================================

function calculateRoyalty(
  salePrice: bigint,
  config: RoyaltyConfig,
): RoyaltyCalculation {
  const totalBps = config.artistBps + config.promoterBps;
  let totalRoyalty = (salePrice * BigInt(totalBps)) / 10000n;

  // Apply royalty cap
  let capped = false;
  const cap = BigInt(config.royaltyCap);
  if (cap > 0n && totalRoyalty > cap) {
    totalRoyalty = cap;
    capped = true;
  }

  // Split between artist and promoter proportionally
  const totalBpsBig = BigInt(totalBps);
  const artistAmount =
    totalBpsBig > 0n
      ? (totalRoyalty * BigInt(config.artistBps)) / totalBpsBig
      : 0n;
  const promoterAmount = totalRoyalty - artistAmount;

  const sellerProceeds = salePrice - totalRoyalty;

  return {
    salePrice: salePrice.toString(),
    totalRoyaltyBps: totalBps,
    artistAmount: artistAmount.toString(),
    promoterAmount: promoterAmount.toString(),
    sellerProceeds: sellerProceeds.toString(),
    capped,
  };
}

// ============================================================================
// Workflow Definition
// ============================================================================

const monitoredTokens = (process.env.CONCERT_TOKEN_ADDRESSES || '')
  .split(',')
  .filter(Boolean);

const concertRoyaltyWorkflow: WorkflowSpec = {
  name: 'concert-royalty-enforcement',
  owner: 'tokenisation-sdk',
  version: '1.0.0',

  triggers: [
    {
      type: 'evm_log',
      id: 'concert-transfer-trigger',
      config: {
        chainId: parseInt(CHAIN_ID, 10),
        addresses: monitoredTokens,
        topics: [TRANSFER_EVENT_TOPIC],
      },
    } as EVMLogTrigger,
  ],

  capabilities: {
    evm: {
      type: 'evm',
      config: {
        chainId: CHAIN_ID,
        actions: ['read', 'write'],
      },
    } as EVMCapability,

    consensus: {
      type: 'consensus',
      config: {
        method: 'median',
        minResponses: 3,
        maxDeviation: 0, // Royalty calculations must be exact
      },
    } as ConsensusCapability,

    http: {
      type: 'http',
      config: {
        allowedDomains: ['*'],
        maxConcurrent: 2,
        timeoutMs: 10_000,
      },
    } as HttpCapability,
  },

  async execute(event: TriggerEvent, capabilities) {
    const { evm, consensus, http } = capabilities;
    const logEvent = event as unknown as EVMLogEvent;

    if (!logEvent || !logEvent.topics || logEvent.topics.length < 4) {
      return { status: 'skipped', reason: 'Invalid Transfer event' };
    }

    // Decode Transfer event
    const tokenAddress = logEvent.address;
    const from = '0x' + (logEvent.topics[1]?.slice(26) || '');
    const to = '0x' + (logEvent.topics[2]?.slice(26) || '');
    const tokenId = logEvent.topics[3] || '0'; // For ERC-721

    const transferTxHash = logEvent.transactionHash || '';

    // ---- 1. Fetch royalty config ----
    let config: RoyaltyConfig;
    try {
      const raw = await evm.readContract({
        address: ROYALTY_REGISTRY_ADDRESS,
        abi: ROYALTY_REGISTRY_ABI,
        functionName: 'getRoyaltyConfig',
        args: [tokenAddress],
        chainId: parseInt(CHAIN_ID, 10),
      });

      const [
        artistBps, promoterBps, artistAddress, promoterAddress,
        minimumSalePrice, royaltyCap, primarySaleExempt, minterAddress,
      ] = raw.value as [bigint, bigint, string, string, bigint, bigint, boolean, string];

      config = {
        tokenAddress,
        eventId: '',
        eventName: '',
        artistBps: Number(artistBps),
        promoterBps: Number(promoterBps),
        artistAddress,
        promoterAddress,
        minimumSalePrice: minimumSalePrice.toString(),
        royaltyCap: royaltyCap.toString(),
        primarySaleExempt,
        minterAddress,
      };
    } catch (error) {
      return { status: 'error', reason: `Failed to read royalty config: ${error}` };
    }

    // ---- 2. Check primary sale exemption ----
    if (config.primarySaleExempt && from.toLowerCase() === config.minterAddress.toLowerCase()) {
      const result: RoyaltySettlementResult = {
        transferTxHash,
        tokenId,
        seller: from,
        buyer: to,
        salePrice: '0',
        royalty: {
          salePrice: '0',
          totalRoyaltyBps: 0,
          artistAmount: '0',
          promoterAmount: '0',
          sellerProceeds: '0',
          capped: false,
        },
        timestamp: new Date().toISOString(),
        status: 'exempt',
      };

      return result;
    }

    // ---- 3. Get sale price ----
    let salePrice: bigint;
    try {
      const priceResult = await evm.readContract({
        address: ROYALTY_REGISTRY_ADDRESS,
        abi: ROYALTY_REGISTRY_ABI,
        functionName: 'getLastSalePrice',
        args: [tokenAddress, BigInt(tokenId)],
        chainId: parseInt(CHAIN_ID, 10),
      });
      salePrice = BigInt(priceResult.value as string);
    } catch {
      // If no sale price recorded, use tx value or skip
      salePrice = BigInt(logEvent.data || '0');
    }

    // ---- 4. Check minimum sale price ----
    if (salePrice < BigInt(config.minimumSalePrice)) {
      return {
        status: 'below_minimum',
        salePrice: salePrice.toString(),
        minimum: config.minimumSalePrice,
        tokenId,
      };
    }

    // ---- 5. Calculate royalty ----
    const royalty = calculateRoyalty(salePrice, config);

    // ---- 6. DON consensus on royalty amounts ----
    const consensusInput = {
      salePrice: salePrice.toString(),
      artistAmount: royalty.artistAmount,
      promoterAmount: royalty.promoterAmount,
      sellerProceeds: royalty.sellerProceeds,
      artistBps: config.artistBps,
      promoterBps: config.promoterBps,
    };

    const agreed = await consensus.reach(consensusInput);

    // Verify consensus matches our calculation
    if (
      (agreed.artistAmount as string) !== royalty.artistAmount ||
      (agreed.promoterAmount as string) !== royalty.promoterAmount
    ) {
      return {
        status: 'error',
        reason: 'DON consensus disagrees on royalty amounts',
        local: royalty,
        consensus: agreed,
      };
    }

    // ---- 7. Execute atomic royalty settlement on-chain ----
    let settlementTxHash: string | undefined;
    try {
      const settlementResult = await evm.writeContract({
        address: ROYALTY_SETTLEMENT_ADDRESS,
        abi: ROYALTY_SETTLEMENT_ABI,
        functionName: 'settleRoyalty',
        args: [
          tokenAddress,
          BigInt(tokenId),
          from,
          to,
          salePrice,
          BigInt(royalty.artistAmount),
          BigInt(royalty.promoterAmount),
        ],
        chainId: parseInt(CHAIN_ID, 10),
      });

      settlementTxHash = settlementResult.transactionHash;
    } catch (error) {
      console.error('Royalty settlement failed:', error);

      // Still record the royalty even if settlement fails
      try {
        await evm.writeContract({
          address: ROYALTY_SETTLEMENT_ADDRESS,
          abi: ROYALTY_SETTLEMENT_ABI,
          functionName: 'recordRoyaltyPayment',
          args: [
            tokenAddress,
            BigInt(tokenId),
            BigInt(royalty.artistAmount),
            BigInt(royalty.promoterAmount),
            salePrice,
            BigInt(Math.floor(Date.now() / 1000)),
          ],
          chainId: parseInt(CHAIN_ID, 10),
        });
      } catch {
        console.error('Failed to record royalty payment');
      }
    }

    // ---- 8. POST callback ----
    const callbackUrl =
      process.env.ROYALTY_CALLBACK_URL ||
      'http://localhost:3000/api/v1/concerts/royalty-callback';

    const result: RoyaltySettlementResult = {
      transferTxHash,
      tokenId,
      seller: from,
      buyer: to,
      salePrice: salePrice.toString(),
      royalty,
      settlementTxHash,
      timestamp: new Date().toISOString(),
      status: settlementTxHash ? 'settled' : 'failed',
    };

    try {
      await http.fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'royalty_settlement',
          data: result,
        }),
        timeout: 5_000,
      });
    } catch {
      console.error(`Royalty callback to ${callbackUrl} failed`);
    }

    return result;
  },
};

export default Workflow.create(concertRoyaltyWorkflow);
export type { RoyaltyConfig, RoyaltyCalculation, RoyaltySettlementResult };
