import { db, schema } from '../config/database.js';
import { eq, and, desc, gte, lt, isNull } from 'drizzle-orm';
import { createHash } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as relayerService from './relayer.service.js';
import * as auditService from './audit.service.js';
import { logger } from '../middleware/logger.js';

const { tokens, transfers, ledgerPositions, ledgerEvents, eventBusQueue, airlineTickets } = schema;

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

  // AirlineTicketNFT lifecycle events
  // TicketExpired(uint256 indexed tokenId)
  TICKET_EXPIRED: '0x789bbe0feb4e78ac089e2aacb83e1b48c4e5e15a0e4b47d6fabc9eeb8d1e35f7',
  // TicketBurned(uint256 indexed tokenId)
  TICKET_BURNED: '0x3a3348fbc29cadaab4c01f66fb9bed58f2e2c2c39d9a0d4e68ed3cf29b4e9a15',
  // TicketCheckedIn(uint256 indexed tokenId, address indexed passenger)
  TICKET_CHECKED_IN: '0xaa7bc62b2e6e18cf7c3db0b3f9d3fcd19e8a0e5cb1f25d6a02aee7eed0c25da4',
  // TicketBoarded(uint256 indexed tokenId, address indexed passenger)
  TICKET_BOARDED: '0x5b0e1cf4d2b9c1a3e8f7d6c5b4a3928170f6e5d4c3b2a19087f6e5d4c3b2a190',
  // AutoExpiryTriggered(uint256 indexed tokenId, uint256 timestamp)
  AUTO_EXPIRY_TRIGGERED: '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
};

// ============================================================================
// Ticket Event Types
// ============================================================================

export interface ParsedTicketEvent {
  type: 'expired' | 'burned' | 'checked_in' | 'boarded' | 'auto_expiry';
  contractAddress: string;
  chainTokenId: string;
  passenger?: string;
  timestamp?: string;
  blockNumber: number;
  txHash: string;
}

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
  topics?: (string | string[])[]
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

  const result = await response.json() as { error?: { message: string }; result?: any[] };

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
    toWallet: normalizedWallet,
    delta: amount,
    txHash,
    txBlock: blockNumber,
    metadata: { source: 'indexer' },
  });
}

// ============================================================================
// Ticket Event Parsing
// ============================================================================

function parseTicketEvent(event: ChainEvent): ParsedTicketEvent | null {
  const topic0 = event.topics[0];
  const contractAddress = event.address;

  switch (topic0) {
    case EVENT_SIGNATURES.TICKET_EXPIRED:
    case EVENT_SIGNATURES.AUTO_EXPIRY_TRIGGERED: {
      if (event.topics.length < 2) return null;
      const chainTokenId = BigInt(event.topics[1]).toString();
      return {
        type: topic0 === EVENT_SIGNATURES.AUTO_EXPIRY_TRIGGERED ? 'auto_expiry' : 'expired',
        contractAddress,
        chainTokenId,
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
      };
    }
    case EVENT_SIGNATURES.TICKET_BURNED: {
      if (event.topics.length < 2) return null;
      const chainTokenId = BigInt(event.topics[1]).toString();
      return {
        type: 'burned',
        contractAddress,
        chainTokenId,
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
      };
    }
    case EVENT_SIGNATURES.TICKET_CHECKED_IN: {
      if (event.topics.length < 3) return null;
      const chainTokenId = BigInt(event.topics[1]).toString();
      const passenger = '0x' + event.topics[2].slice(26).toLowerCase();
      return {
        type: 'checked_in',
        contractAddress,
        chainTokenId,
        passenger,
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
      };
    }
    case EVENT_SIGNATURES.TICKET_BOARDED: {
      if (event.topics.length < 3) return null;
      const chainTokenId = BigInt(event.topics[1]).toString();
      const passenger = '0x' + event.topics[2].slice(26).toLowerCase();
      return {
        type: 'boarded',
        contractAddress,
        chainTokenId,
        passenger,
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
      };
    }
    default:
      return null;
  }
}

const TICKET_EVENT_TOPICS = [
  EVENT_SIGNATURES.TICKET_EXPIRED,
  EVENT_SIGNATURES.TICKET_BURNED,
  EVENT_SIGNATURES.TICKET_CHECKED_IN,
  EVENT_SIGNATURES.TICKET_BOARDED,
  EVENT_SIGNATURES.AUTO_EXPIRY_TRIGGERED,
];

const TICKET_STATUS_MAP: Record<ParsedTicketEvent['type'], string> = {
  expired: 'EXPIRED',
  auto_expiry: 'EXPIRED',
  burned: 'BURNED',
  checked_in: 'CHECKED_IN',
  boarded: 'BOARDED',
};

const TICKET_TOPIC_MAP: Record<ParsedTicketEvent['type'], string> = {
  expired: 'ticket.expired',
  auto_expiry: 'ticket.expired',
  burned: 'ticket.burned',
  checked_in: 'ticket.checked_in',
  boarded: 'ticket.boarded',
};

export async function processTicketEvent(
  event: ParsedTicketEvent,
  orgId: string
): Promise<void> {
  // Find ticket by contract address + chain token ID
  const ticket = await db.query.airlineTickets.findFirst({
    where: and(
      eq(airlineTickets.contractAddress, event.contractAddress),
      eq(airlineTickets.chainTokenId, event.chainTokenId),
      eq(airlineTickets.orgId, orgId)
    ),
  });

  if (!ticket) {
    // Ticket not tracked by us, skip
    return;
  }

  const newStatus = TICKET_STATUS_MAP[event.type];
  if (!newStatus) return;

  // Update ticket status in DB
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (event.type === 'expired' || event.type === 'auto_expiry') {
    updateData.cancelledAt = new Date(); // No expiredAt column; use cancelledAt for the timestamp
  } else if (event.type === 'burned') {
    updateData.burnedAt = new Date();
  } else if (event.type === 'checked_in') {
    updateData.checkedInAt = new Date();
  } else if (event.type === 'boarded') {
    updateData.boardedAt = new Date();
  }

  await db.update(airlineTickets)
    .set(updateData)
    .where(eq(airlineTickets.id, ticket.id));

  // Publish to EventBus
  const topic = TICKET_TOPIC_MAP[event.type];
  await db.insert(eventBusQueue).values({
    orgId,
    topic,
    payload: {
      ticketId: ticket.id,
      chainTokenId: event.chainTokenId,
      contractAddress: event.contractAddress,
      status: newStatus,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      passenger: event.passenger,
    },
  });

  logger.info(`Ticket ${ticket.id} updated to ${newStatus} from on-chain event`, {
    metadata: { txHash: event.txHash, blockNumber: event.blockNumber },
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

  // Fetch ticket lifecycle events from AirlineTicketNFT contracts
  const ticketContracts = await db.select({
    contractAddress: airlineTickets.contractAddress,
    orgId: airlineTickets.orgId,
  })
    .from(airlineTickets)
    .where(and(
      eq(airlineTickets.chainId, chainId),
    ))
    .groupBy(airlineTickets.contractAddress, airlineTickets.orgId);

  const uniqueTicketAddresses = ticketContracts
    .filter(t => t.contractAddress)
    .map(t => t.contractAddress!);

  if (uniqueTicketAddresses.length > 0) {
    const ticketEvents = await getLogs(
      chainId,
      fromBlock,
      toBlock,
      uniqueTicketAddresses,
      [TICKET_EVENT_TOPICS] // topics[0] = array of sigs → matches any
    );

    for (const event of ticketEvents) {
      if (event.removed) continue;

      const parsed = parseTicketEvent(event);
      if (!parsed) continue;

      // Find the org for this contract
      const contract = ticketContracts.find(
        t => t.contractAddress?.toLowerCase() === parsed.contractAddress
      );

      if (contract) {
        await processTicketEvent(parsed, contract.orgId);
        processedEvents++;
      }
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
        toWallet: position.walletAddress,
        delta: (BigInt(onChainBalance) - BigInt(offChainBalance)).toString(),
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

  const startBlock = fromBlock || 0;
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
