import { db, schema } from '../config/database.js';
import { eq, and, desc, gte, lt, isNull } from 'drizzle-orm';
import { createHash } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as relayerService from './relayer.service.js';
import * as auditService from './audit.service.js';
import { logger } from '../middleware/logger.js';

const { tokens, transfers, ledgerPositions, ledgerEvents, eventBusQueue } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface IndexerConfig {
  chainId: number;
  startBlock: number;
  pollingInterval: number; // milliseconds
  confirmations: number;
  batchSize: number;
}

export interface ChainEvent {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  address: string;
  topics: string[];
  data: string;
  removed: boolean;
}

export interface ParsedTransferEvent {
  tokenAddress: string;
  from: string;
  to: string;
  amount: string;
  blockNumber: number;
  txHash: string;
}

export interface IndexerState {
  chainId: number;
  lastIndexedBlock: number;
  isRunning: boolean;
  lastError?: string;
  lastErrorAt?: Date;
}

// ============================================================================
// Event Signatures (keccak256 hashes)
// ============================================================================

const EVENT_SIGNATURES = {
  // ERC20/ERC3643 Transfer(address,address,uint256)
  TRANSFER: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  // ERC3643 TokensFrozen(address,uint256)
  TOKENS_FROZEN: '0x9e5c4f9f4e46b8629e5c8e8a1c8f0c9b4d3e7a6f2b8c9d0e1f2a3b4c5d6e7f8a',
  // ERC3643 IdentityAdded(address,address)
  IDENTITY_ADDED: '0x0a5c5e2f3d9f5b7d3c8e9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d',
  // ERC3643 ComplianceAdded(address)
  COMPLIANCE_ADDED: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
};

// ============================================================================
// Indexer State Management
// ============================================================================

// In-memory state (in production, use Redis or DB)
const indexerState = new Map<number, IndexerState>();

function getIndexerState(chainId: number): IndexerState {
  let state = indexerState.get(chainId);
  if (!state) {
    state = {
      chainId,
      lastIndexedBlock: 0,
      isRunning: false,
    };
    indexerState.set(chainId, state);
  }
  return state;
}

function updateIndexerState(chainId: number, updates: Partial<IndexerState>): void {
  const state = getIndexerState(chainId);
  Object.assign(state, updates);
  indexerState.set(chainId, state);
}

// ============================================================================
// Event Fetching
// ============================================================================

async function getLogs(
  chainId: number,
  fromBlock: number,
  toBlock: number,
  addresses: string[],
  topics?: string[]
): Promise<ChainEvent[]> {
  const chain = relayerService.getChainConfig(chainId);

  const params: any = {
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
  };

  if (addresses.length > 0) {
    params.address = addresses;
  }

  if (topics && topics.length > 0) {
    params.topics = topics;
  }

  const response = await fetch(chain.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'eth_getLogs',
      params: [params],
    }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(`RPC Error: ${result.error.message}`);
  }

  return (result.result || []).map((log: any) => ({
    chainId,
    blockNumber: parseInt(log.blockNumber, 16),
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    transactionIndex: parseInt(log.transactionIndex, 16),
    logIndex: parseInt(log.logIndex, 16),
    address: log.address.toLowerCase(),
    topics: log.topics,
    data: log.data,
    removed: log.removed || false,
  }));
}

// ============================================================================
// Event Parsing
// ============================================================================

function parseTransferEvent(event: ChainEvent): ParsedTransferEvent | null {
  if (event.topics[0] !== EVENT_SIGNATURES.TRANSFER) {
    return null;
  }

  if (event.topics.length < 3) {
    return null;
  }

  // topics[1] = from address (padded to 32 bytes)
  // topics[2] = to address (padded to 32 bytes)
  // data = amount (uint256)
  const from = '0x' + event.topics[1].slice(26).toLowerCase();
  const to = '0x' + event.topics[2].slice(26).toLowerCase();
  const amount = BigInt(event.data).toString();

  return {
    tokenAddress: event.address,
    from,
    to,
    amount,
    blockNumber: event.blockNumber,
    txHash: event.transactionHash,
  };
}

// ============================================================================
// Event Processing
// ============================================================================

export async function processTransferEvent(
  event: ParsedTransferEvent,
  orgId: string
): Promise<void> {
  // Find the token by contract address
  const token = await db.query.tokens.findFirst({
    where: and(
      eq(tokens.address, event.tokenAddress),
      eq(tokens.orgId, orgId)
    ),
  });

  if (!token) {
    // Token not tracked by us, skip
    return;
  }

  // Check if we already processed this event (idempotency)
  const existingEvent = await db.query.ledgerEvents.findFirst({
    where: and(
      eq(ledgerEvents.txHash, event.txHash),
      eq(ledgerEvents.fromWallet, event.from) // Use 'from' as unique identifier
    ),
  });

  if (existingEvent) {
    return; // Already processed
  }

  // Update sender's position (decrease)
  if (event.from !== '0x0000000000000000000000000000000000000000') {
    await updatePositionFromChain(
      orgId,
      token.id,
      event.from,
      `-${event.amount}`,
      event.txHash,
      event.blockNumber
    );
  }

  // Update receiver's position (increase)
  if (event.to !== '0x0000000000000000000000000000000000000000') {
    await updatePositionFromChain(
      orgId,
      token.id,
      event.to,
      event.amount,
      event.txHash,
      event.blockNumber
    );
  }

  // Check if this matches a pending transfer in our system
  const pendingTransfer = await db.query.transfers.findFirst({
    where: and(
      eq(transfers.tokenId, token.id),
      eq(transfers.txHash, event.txHash),
      eq(transfers.status, 'submitted')
    ),
  });

  if (pendingTransfer) {
    // Update transfer status to confirmed
    await db.update(transfers)
      .set({
        status: 'confirmed',
        txBlock: event.blockNumber,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transfers.id, pendingTransfer.id));

    // Emit event
    await db.insert(eventBusQueue).values({
      orgId,
      topic: 'transfer.confirmed',
      payload: {
        transferId: pendingTransfer.id,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
      },
    });
  }
}

async function updatePositionFromChain(
  orgId: string,
  tokenId: string,
  walletAddress: string,
  amount: string,
  txHash: string,
  blockNumber: number
): Promise<void> {
  const normalizedWallet = walletAddress.toLowerCase();

  // Find existing position
  const existing = await db.query.ledgerPositions.findFirst({
    where: and(
      eq(ledgerPositions.tokenId, tokenId),
      eq(ledgerPositions.walletAddress, normalizedWallet)
    ),
  });

  const amountBn = BigInt(amount);

  if (existing) {
    const currentBalance = BigInt(existing.balance);
    const newBalance = currentBalance + amountBn;

    await db.update(ledgerPositions)
      .set({
        balance: newBalance.toString(),
        lastEventAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ledgerPositions.id, existing.id));
  } else if (amountBn > 0n) {
    // Create new position
    await db.insert(ledgerPositions).values({
      orgId,
      tokenId,
      investorId: null as any, // Will need to be linked to investor later
      walletAddress: normalizedWallet,
      balance: amount,
      lastEventAt: new Date(),
    });
  }

  // Record ledger event
  await db.insert(ledgerEvents).values({
    orgId,
    tokenId,
    eventType: 'transfer',
    walletAddress: normalizedWallet,
    amount,
    txHash,
    txBlock: event.blockNumber,
    metadata: { source: 'indexer' },
  });
}

// ============================================================================
// Indexer Loop
// ============================================================================

export async function indexBlocks(
  chainId: number,
  fromBlock: number,
  toBlock: number
): Promise<{ processed: number; events: number }> {
  // Get all deployed tokens for this chain
  const deployedTokens = await db.select()
    .from(tokens)
    .where(and(
      eq(tokens.chainId, chainId),
      eq(tokens.status, 'deployed')
    ));

  if (deployedTokens.length === 0) {
    return { processed: toBlock - fromBlock + 1, events: 0 };
  }

  const contractAddresses = deployedTokens
    .filter(t => t.address)
    .map(t => t.address!);

  // Fetch transfer events
  const events = await getLogs(
    chainId,
    fromBlock,
    toBlock,
    contractAddresses,
    [EVENT_SIGNATURES.TRANSFER]
  );

  let processedEvents = 0;

  for (const event of events) {
    if (event.removed) continue; // Skip removed/reorged events

    const parsed = parseTransferEvent(event);
    if (!parsed) continue;

    // Find the token's org
    const token = deployedTokens.find(
      t => t.address?.toLowerCase() === parsed.tokenAddress
    );

    if (token) {
      await processTransferEvent(parsed, token.orgId);
      processedEvents++;
    }
  }

  return { processed: toBlock - fromBlock + 1, events: processedEvents };
}

export async function startIndexer(config: IndexerConfig): Promise<void> {
  const state = getIndexerState(config.chainId);

  if (state.isRunning) {
    throw new ValidationError(`Indexer for chain ${config.chainId} is already running`);
  }

  updateIndexerState(config.chainId, {
    isRunning: true,
    lastIndexedBlock: config.startBlock,
  });

  logger.info(`Starting indexer for chain ${config.chainId} from block ${config.startBlock}`);

  // Start indexing loop
  indexLoop(config);
}

async function indexLoop(config: IndexerConfig): Promise<void> {
  const state = getIndexerState(config.chainId);

  while (state.isRunning) {
    try {
      // Get current block
      const currentBlock = await relayerService.getBlockNumber(config.chainId);
      const safeBlock = currentBlock - config.confirmations;

      if (state.lastIndexedBlock < safeBlock) {
        const fromBlock = state.lastIndexedBlock + 1;
        const toBlock = Math.min(fromBlock + config.batchSize - 1, safeBlock);

        const result = await indexBlocks(config.chainId, fromBlock, toBlock);

        updateIndexerState(config.chainId, {
          lastIndexedBlock: toBlock,
        });

        if (result.events > 0) {
          logger.info(
            `Chain ${config.chainId}: Indexed blocks ${fromBlock}-${toBlock}, found ${result.events} events`
          );
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, config.pollingInterval));
    } catch (error) {
      logger.error(`Indexer error for chain ${config.chainId}:`, { error: error as Error });

      updateIndexerState(config.chainId, {
        lastError: error instanceof Error ? error.message : 'Unknown error',
        lastErrorAt: new Date(),
      });

      // Wait longer on error
      await new Promise(resolve => setTimeout(resolve, config.pollingInterval * 3));
    }
  }
}

export function stopIndexer(chainId: number): void {
  updateIndexerState(chainId, { isRunning: false });
  logger.info(`Stopping indexer for chain ${chainId}`);
}

export function getIndexerStatus(chainId: number): IndexerState {
  return getIndexerState(chainId);
}

export function getAllIndexerStatuses(): IndexerState[] {
  return Array.from(indexerState.values());
}

// ============================================================================
// Reconciliation
// ============================================================================

export async function reconcileToken(tokenId: string, orgId: string): Promise<{
  tokenId: string;
  positionsChecked: number;
  discrepancies: number;
  updated: number;
}> {
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  if (!token.address) {
    throw new ValidationError('Token not deployed');
  }

  // Get all positions for this token
  const positions = await db.select()
    .from(ledgerPositions)
    .where(eq(ledgerPositions.tokenId, tokenId));

  let discrepancies = 0;
  let updated = 0;

  for (const position of positions) {
    // Get on-chain balance
    const onChainBalance = await relayerService.getERC20Balance(
      token.chainId,
      token.address,
      position.walletAddress
    );

    const offChainBalance = position.balance;

    if (onChainBalance !== offChainBalance) {
      discrepancies++;

      // Update to match on-chain
      await db.update(ledgerPositions)
        .set({
          balance: onChainBalance,
          updatedAt: new Date(),
        })
        .where(eq(ledgerPositions.id, position.id));

      // Log discrepancy
      await db.insert(ledgerEvents).values({
        orgId,
        tokenId,
        eventType: 'reconciliation',
        walletAddress: position.walletAddress,
        amount: (BigInt(onChainBalance) - BigInt(offChainBalance)).toString(),
        metadata: {
          previousBalance: offChainBalance,
          newBalance: onChainBalance,
          source: 'reconciliation',
        },
      });

      updated++;

      // Audit log
      await auditService.logSystemAction(
        orgId,
        'update',
        'ledger_position',
        position.id,
        `Balance reconciled: ${offChainBalance} -> ${onChainBalance}`,
        { walletAddress: position.walletAddress, tokenId }
      );
    }
  }

  return {
    tokenId,
    positionsChecked: positions.length,
    discrepancies,
    updated,
  };
}

export async function reconcileAllTokens(orgId: string): Promise<{
  tokensReconciled: number;
  totalDiscrepancies: number;
  totalUpdated: number;
}> {
  const deployedTokens = await db.select()
    .from(tokens)
    .where(and(
      eq(tokens.orgId, orgId),
      eq(tokens.status, 'deployed')
    ));

  let totalDiscrepancies = 0;
  let totalUpdated = 0;

  for (const token of deployedTokens) {
    const result = await reconcileToken(token.id, orgId);
    totalDiscrepancies += result.discrepancies;
    totalUpdated += result.updated;
  }

  return {
    tokensReconciled: deployedTokens.length,
    totalDiscrepancies,
    totalUpdated,
  };
}

// ============================================================================
// Manual Reindex
// ============================================================================

export async function reindexToken(
  tokenId: string,
  orgId: string,
  fromBlock?: number
): Promise<{ eventsProcessed: number }> {
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  if (!token.address) {
    throw new ValidationError('Token not deployed');
  }

  const startBlock = fromBlock || token.deploymentBlockNumber || 0;
  const currentBlock = await relayerService.getBlockNumber(token.chainId);

  let eventsProcessed = 0;
  const batchSize = 10000;

  for (let block = startBlock; block <= currentBlock; block += batchSize) {
    const toBlock = Math.min(block + batchSize - 1, currentBlock);

    const events = await getLogs(
      token.chainId,
      block,
      toBlock,
      [token.address],
      [EVENT_SIGNATURES.TRANSFER]
    );

    for (const event of events) {
      if (event.removed) continue;

      const parsed = parseTransferEvent(event);
      if (parsed) {
        await processTransferEvent(parsed, orgId);
        eventsProcessed++;
      }
    }
  }

  return { eventsProcessed };
}
