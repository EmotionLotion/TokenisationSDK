import { db, schema } from '../config/database.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';

const { tokens, tokenTranches, issuances, redemptions, ledgerPositions, ledgerEvents, eventBusQueue } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export type TokenStatus = 'draft' | 'deploying' | 'deployed' | 'paused' | 'frozen' | 'deprecated';
export type TokenStandard = 'ERC3643' | 'ERC1400' | 'ERC20';

export interface CreateTokenInput {
  orgId: string;
  projectId?: string;
  assetId?: string;
  name: string;
  symbol: string;
  decimals?: number;
  standard?: TokenStandard;
  totalSupply: string;
  maxSupply?: string;
  chainId: number;
  complianceModules?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateTokenInput {
  name?: string;
  metadata?: Record<string, unknown>;
  complianceModules?: string[];
}

export interface DeployTokenInput {
  deployerAddress: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface CreateTrancheInput {
  orgId: string;
  tokenId: string;
  name: string;
  supply: string;
  restrictions?: Record<string, unknown>;
  vestingSchedule?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface IssueTokensInput {
  orgId: string;
  tokenId: string;
  trancheId?: string;
  investorId: string;
  walletAddress: string;
  amount: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface RedeemTokensInput {
  orgId: string;
  tokenId: string;
  investorId: string;
  walletAddress: string;
  amount: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Token Management
// ============================================================================

export async function createToken(input: CreateTokenInput) {
  // Validate decimals
  const decimals = input.decimals ?? 18;
  if (decimals < 0 || decimals > 18) {
    throw new ValidationError('Decimals must be between 0 and 18');
  }

  // Validate total supply
  if (!/^\d+$/.test(input.totalSupply) || BigInt(input.totalSupply) <= 0n) {
    throw new ValidationError('Total supply must be a positive integer string');
  }

  const [token] = await db.insert(tokens).values({
    orgId: input.orgId,
    projectId: input.projectId,
    name: input.name,
    symbol: input.symbol.toUpperCase(),
    decimals,
    standard: input.standard || 'ERC3643',
    totalSupply: input.totalSupply,
    issuedSupply: '0',
    chainId: input.chainId,
    status: 'draft',
    complianceModules: input.complianceModules || ['identity', 'country', 'investor_type'],
    metadata: input.metadata || {},
  }).returning();

  // Create event bus entry
  await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: 'token.created',
    payload: { tokenId: token.id, symbol: token.symbol },
  });

  // Audit log
  await auditService.logSystemAction(
    input.orgId,
    'token_deployed',
    'token',
    token.id,
    `Token ${token.symbol} created`,
    { name: token.name, standard: token.standard }
  );

  return token;
}

export async function getToken(id: string, orgId: string) {
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, id), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  return token;
}

export async function listTokens(orgId: string, params: {
  projectId?: string;
  status?: string;
  chainId?: number;
  limit?: number;
  offset?: number;
} = {}) {
  const { projectId, status, chainId, limit = 50, offset = 0 } = params;

  const conditions = [eq(tokens.orgId, orgId)];
  if (projectId) conditions.push(eq(tokens.projectId, projectId));
  if (status) conditions.push(eq(tokens.status, status));
  if (chainId) conditions.push(eq(tokens.chainId, chainId));

  return db.select()
    .from(tokens)
    .where(and(...conditions))
    .orderBy(desc(tokens.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateToken(id: string, orgId: string, input: UpdateTokenInput) {
  const token = await getToken(id, orgId);

  if (token.status === 'frozen') {
    throw new ValidationError('Cannot update frozen token');
  }

  const [updated] = await db.update(tokens)
    .set({
      ...input,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(tokens.id, id), eq(tokens.orgId, orgId)))
    .returning();

  return updated;
}

// ============================================================================
// Token Deployment
// ============================================================================

export async function deployToken(id: string, orgId: string, input: DeployTokenInput) {
  const token = await getToken(id, orgId);

  if (token.status !== 'draft') {
    throw new ValidationError(`Cannot deploy token in ${token.status} status`);
  }

  // Update to deploying status
  await db.update(tokens)
    .set({
      status: 'deploying',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tokens.id, id));

  // Build deployment transaction
  const deploymentTx = buildERC3643DeploymentTx(token, input);

  // Create event for chain relayer
  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'token.deploy_requested',
    payload: {
      tokenId: id,
      chainId: token.chainId,
      deployerAddress: input.deployerAddress,
      transaction: deploymentTx,
    },
  });

  return {
    tokenId: id,
    status: 'deploying',
    transaction: deploymentTx,
    message: 'Deployment transaction created. Submit to chain relayer or sign externally.',
  };
}

export async function confirmDeployment(id: string, orgId: string, contractAddress: string, txHash: string, blockNumber: number) {
  const token = await getToken(id, orgId);

  if (token.status !== 'deploying') {
    throw new ValidationError(`Token is not in deploying status`);
  }

  // Validate contract address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    throw new ValidationError('Invalid contract address');
  }

  const [updated] = await db.update(tokens)
    .set({
      status: 'deployed',
      address: contractAddress.toLowerCase(),
      deployedAt: new Date().toISOString(),
      deployTxHash: txHash,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tokens.id, id))
    .returning();

  // Create event
  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'token.deployed',
    payload: {
      tokenId: id,
      contractAddress,
      txHash,
      blockNumber,
    },
  });

  // Audit log
  await auditService.logSystemAction(
    orgId,
    'token_deployed',
    'token',
    id,
    `Token deployed to ${contractAddress}`,
    { txHash, blockNumber }
  );

  return updated;
}

function buildERC3643DeploymentTx(token: any, input: DeployTokenInput) {
  // This would build the actual deployment transaction
  // For MVP, we return a structured payload that the relayer/signer can use

  return {
    to: null, // Contract creation
    from: input.deployerAddress,
    data: buildERC3643Bytecode(token),
    gasLimit: input.gasLimit || '3000000',
    gasPrice: input.gasPrice,
    maxFeePerGas: input.maxFeePerGas,
    maxPriorityFeePerGas: input.maxPriorityFeePerGas,
    chainId: token.chainId,
    value: '0',
    nonce: null, // To be filled by signer
  };
}

function buildERC3643Bytecode(token: any): string {
  // Placeholder for actual ERC-3643 bytecode construction
  // In production, this would use ethers.js or similar to encode constructor args

  const constructorArgs = {
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    totalSupply: token.totalSupply,
    complianceModules: token.complianceModules,
  };

  // Return placeholder bytecode (actual implementation would compile contract)
  return `0x608060405234801561001057600080fd5b50${Buffer.from(JSON.stringify(constructorArgs)).toString('hex')}`;
}

// ============================================================================
// Token Status Management
// ============================================================================

export async function pauseToken(id: string, orgId: string, reason?: string) {
  const token = await getToken(id, orgId);

  if (token.status !== 'deployed') {
    throw new ValidationError('Can only pause deployed tokens');
  }

  const [updated] = await db.update(tokens)
    .set({
      status: 'paused',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tokens.id, id))
    .returning();

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'token.paused',
    payload: { tokenId: id, reason },
  });

  await auditService.logSystemAction(orgId, 'token_frozen', 'token', id, reason);

  return updated;
}

export async function unpauseToken(id: string, orgId: string) {
  const token = await getToken(id, orgId);

  if (token.status !== 'paused') {
    throw new ValidationError('Token is not paused');
  }

  const [updated] = await db.update(tokens)
    .set({
      status: 'deployed',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tokens.id, id))
    .returning();

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'token.unpaused',
    payload: { tokenId: id },
  });

  await auditService.logSystemAction(orgId, 'token_unfrozen', 'token', id);

  return updated;
}

export async function freezeToken(id: string, orgId: string, reason: string) {
  const token = await getToken(id, orgId);

  if (token.status === 'frozen') {
    throw new ValidationError('Token is already frozen');
  }

  const [updated] = await db.update(tokens)
    .set({
      status: 'frozen',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tokens.id, id))
    .returning();

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'token.frozen',
    payload: { tokenId: id, reason },
  });

  await auditService.logSystemAction(orgId, 'token_frozen', 'token', id, reason);

  return updated;
}

// ============================================================================
// Tranche Management
// ============================================================================

export async function createTranche(input: CreateTrancheInput) {
  const token = await getToken(input.tokenId, input.orgId);

  // Validate supply
  if (!/^\d+$/.test(input.supply) || BigInt(input.supply) <= 0n) {
    throw new ValidationError('Supply must be a positive integer string');
  }

  const [tranche] = await db.insert(tokenTranches).values({
    orgId: input.orgId,
    tokenId: input.tokenId,
    name: input.name,
    supply: input.supply,
    issuedSupply: '0',
    restrictions: input.restrictions || {},
    vestingSchedule: input.vestingSchedule,
    metadata: input.metadata || {},
  }).returning();

  return tranche;
}

export async function getTranche(id: string, orgId: string) {
  const tranche = await db.query.tokenTranches.findFirst({
    where: and(eq(tokenTranches.id, id), eq(tokenTranches.orgId, orgId)),
  });

  if (!tranche) {
    throw new NotFoundError('Tranche not found');
  }

  return tranche;
}

export async function listTranches(tokenId: string, orgId: string) {
  return db.select()
    .from(tokenTranches)
    .where(and(eq(tokenTranches.tokenId, tokenId), eq(tokenTranches.orgId, orgId)))
    .orderBy(desc(tokenTranches.createdAt));
}

// ============================================================================
// Token Issuance
// ============================================================================

export async function issueTokens(input: IssueTokensInput) {
  const token = await getToken(input.tokenId, input.orgId);

  if (token.status !== 'deployed') {
    throw new ValidationError(`Cannot issue tokens from ${token.status} token`);
  }

  // Validate amount
  if (!/^\d+$/.test(input.amount) || BigInt(input.amount) <= 0n) {
    throw new ValidationError('Amount must be a positive integer string');
  }

  // Check supply limits
  const newIssuedSupply = BigInt(token.issuedSupply) + BigInt(input.amount);
  if (newIssuedSupply > BigInt(token.totalSupply)) {
    throw new ValidationError('Issuance would exceed total supply');
  }

  // If tranche specified, check tranche limits
  if (input.trancheId) {
    const tranche = await getTranche(input.trancheId, input.orgId);
    const newTrancheIssued = BigInt(tranche.issuedSupply) + BigInt(input.amount);
    if (newTrancheIssued > BigInt(tranche.supply)) {
      throw new ValidationError('Issuance would exceed tranche supply');
    }
  }

  // Create issuance record
  const [issuance] = await db.insert(issuances).values({
    orgId: input.orgId,
    tokenId: input.tokenId,
    trancheId: input.trancheId,
    investorId: input.investorId,
    walletAddress: input.walletAddress.toLowerCase(),
    amount: input.amount,
    status: 'pending',
    reason: input.reason,
    metadata: input.metadata || {},
  }).returning();

  // Update token issued supply
  await db.update(tokens)
    .set({
      issuedSupply: newIssuedSupply.toString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tokens.id, input.tokenId));

  // Update tranche if applicable
  if (input.trancheId) {
    const tranche = await getTranche(input.trancheId, input.orgId);
    await db.update(tokenTranches)
      .set({
        issuedSupply: (BigInt(tranche.issuedSupply) + BigInt(input.amount)).toString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tokenTranches.id, input.trancheId));
  }

  // Update or create ledger position
  await updateLedgerPosition(
    input.orgId,
    input.tokenId,
    input.investorId,
    input.walletAddress,
    input.amount,
    'credit'
  );

  // Create event
  await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: 'token.issued',
    payload: {
      issuanceId: issuance.id,
      tokenId: input.tokenId,
      investorId: input.investorId,
      amount: input.amount,
    },
  });

  // Audit log
  await auditService.logSystemAction(
    input.orgId,
    'token_issued',
    'issuance',
    issuance.id,
    `Issued ${input.amount} tokens to ${input.walletAddress}`,
    { tokenId: input.tokenId, investorId: input.investorId }
  );

  return issuance;
}

export async function confirmIssuance(id: string, orgId: string, txHash: string, blockNumber: number) {
  const issuance = await db.query.issuances.findFirst({
    where: and(eq(issuances.id, id), eq(issuances.orgId, orgId)),
  });

  if (!issuance) {
    throw new NotFoundError('Issuance not found');
  }

  if (issuance.status !== 'pending') {
    throw new ValidationError(`Issuance is in ${issuance.status} status`);
  }

  const [updated] = await db.update(issuances)
    .set({
      status: 'confirmed',
      txHash,
      blockNumber,
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(issuances.id, id))
    .returning();

  // Create ledger event
  await db.insert(ledgerEvents).values({
    orgId,
    tokenId: issuance.tokenId,
    eventType: 'issuance',
    walletAddress: issuance.walletAddress,
    amount: issuance.amount,
    txHash,
    blockNumber,
  });

  return updated;
}

// ============================================================================
// Token Redemption
// ============================================================================

export async function redeemTokens(input: RedeemTokensInput) {
  const token = await getToken(input.tokenId, input.orgId);

  if (token.status !== 'deployed') {
    throw new ValidationError(`Cannot redeem tokens from ${token.status} token`);
  }

  // Validate amount
  if (!/^\d+$/.test(input.amount) || BigInt(input.amount) <= 0n) {
    throw new ValidationError('Amount must be a positive integer string');
  }

  // Check investor has sufficient balance
  const position = await db.query.ledgerPositions.findFirst({
    where: and(
      eq(ledgerPositions.tokenId, input.tokenId),
      eq(ledgerPositions.investorId, input.investorId),
      eq(ledgerPositions.walletAddress, input.walletAddress.toLowerCase())
    ),
  });

  if (!position || BigInt(position.balance) < BigInt(input.amount)) {
    throw new ValidationError('Insufficient balance for redemption');
  }

  // Create redemption record
  const [redemption] = await db.insert(redemptions).values({
    orgId: input.orgId,
    tokenId: input.tokenId,
    investorId: input.investorId,
    walletAddress: input.walletAddress.toLowerCase(),
    amount: input.amount,
    status: 'pending',
    reason: input.reason,
    metadata: input.metadata || {},
  }).returning();

  // Update ledger position (debit)
  await updateLedgerPosition(
    input.orgId,
    input.tokenId,
    input.investorId,
    input.walletAddress,
    input.amount,
    'debit'
  );

  // Update token issued supply
  await db.update(tokens)
    .set({
      issuedSupply: (BigInt(token.issuedSupply) - BigInt(input.amount)).toString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tokens.id, input.tokenId));

  // Create event
  await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: 'token.redeemed',
    payload: {
      redemptionId: redemption.id,
      tokenId: input.tokenId,
      investorId: input.investorId,
      amount: input.amount,
    },
  });

  // Audit log
  await auditService.logSystemAction(
    input.orgId,
    'token_redeemed',
    'redemption',
    redemption.id,
    `Redeemed ${input.amount} tokens from ${input.walletAddress}`,
    { tokenId: input.tokenId, investorId: input.investorId }
  );

  return redemption;
}

export async function confirmRedemption(id: string, orgId: string, txHash: string, blockNumber: number) {
  const redemption = await db.query.redemptions.findFirst({
    where: and(eq(redemptions.id, id), eq(redemptions.orgId, orgId)),
  });

  if (!redemption) {
    throw new NotFoundError('Redemption not found');
  }

  if (redemption.status !== 'pending') {
    throw new ValidationError(`Redemption is in ${redemption.status} status`);
  }

  const [updated] = await db.update(redemptions)
    .set({
      status: 'confirmed',
      txHash,
      blockNumber,
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(redemptions.id, id))
    .returning();

  // Create ledger event
  await db.insert(ledgerEvents).values({
    orgId,
    tokenId: redemption.tokenId,
    eventType: 'redemption',
    walletAddress: redemption.walletAddress,
    amount: `-${redemption.amount}`,
    txHash,
    blockNumber,
  });

  return updated;
}

// ============================================================================
// Ledger Position Management
// ============================================================================

async function updateLedgerPosition(
  orgId: string,
  tokenId: string,
  investorId: string,
  walletAddress: string,
  amount: string,
  type: 'credit' | 'debit'
) {
  const normalizedWallet = walletAddress.toLowerCase();

  // Find existing position
  const existing = await db.query.ledgerPositions.findFirst({
    where: and(
      eq(ledgerPositions.tokenId, tokenId),
      eq(ledgerPositions.investorId, investorId),
      eq(ledgerPositions.walletAddress, normalizedWallet)
    ),
  });

  if (existing) {
    const currentBalance = BigInt(existing.balance);
    const changeAmount = BigInt(amount);
    const newBalance = type === 'credit'
      ? currentBalance + changeAmount
      : currentBalance - changeAmount;

    if (newBalance < 0n) {
      throw new ValidationError('Operation would result in negative balance');
    }

    await db.update(ledgerPositions)
      .set({
        balance: newBalance.toString(),
        lastMovementAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ledgerPositions.id, existing.id));
  } else {
    if (type === 'debit') {
      throw new ValidationError('Cannot debit from non-existent position');
    }

    await db.insert(ledgerPositions).values({
      orgId,
      tokenId,
      investorId,
      walletAddress: normalizedWallet,
      balance: amount,
      lastMovementAt: new Date().toISOString(),
    });
  }
}

export async function getLedgerPosition(tokenId: string, investorId: string, walletAddress: string) {
  return db.query.ledgerPositions.findFirst({
    where: and(
      eq(ledgerPositions.tokenId, tokenId),
      eq(ledgerPositions.investorId, investorId),
      eq(ledgerPositions.walletAddress, walletAddress.toLowerCase())
    ),
  });
}

export async function listLedgerPositions(orgId: string, params: {
  tokenId?: string;
  investorId?: string;
  minBalance?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { tokenId, investorId, minBalance, limit = 100, offset = 0 } = params;

  const conditions = [eq(ledgerPositions.orgId, orgId)];
  if (tokenId) conditions.push(eq(ledgerPositions.tokenId, tokenId));
  if (investorId) conditions.push(eq(ledgerPositions.investorId, investorId));

  let results = await db.select()
    .from(ledgerPositions)
    .where(and(...conditions))
    .orderBy(desc(ledgerPositions.balance))
    .limit(limit)
    .offset(offset);

  // Filter by min balance in JS (numeric comparison in SQL is tricky with string amounts)
  if (minBalance) {
    const minBal = BigInt(minBalance);
    results = results.filter(p => BigInt(p.balance) >= minBal);
  }

  return results;
}

// ============================================================================
// Token Cap Table
// ============================================================================

export async function getCapTable(tokenId: string, orgId: string) {
  const token = await getToken(tokenId, orgId);

  const positions = await db.select()
    .from(ledgerPositions)
    .where(eq(ledgerPositions.tokenId, tokenId))
    .orderBy(desc(ledgerPositions.balance));

  const totalHeld = positions.reduce((sum, p) => sum + BigInt(p.balance), 0n);

  return {
    token: {
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      totalSupply: token.totalSupply,
      issuedSupply: token.issuedSupply,
    },
    positions: positions.map(p => ({
      investorId: p.investorId,
      walletAddress: p.walletAddress,
      balance: p.balance,
      percentage: (BigInt(p.balance) * 10000n / BigInt(token.issuedSupply || '1')).toString(),
    })),
    summary: {
      totalHolders: positions.length,
      totalHeld: totalHeld.toString(),
      circulatingSupply: token.issuedSupply,
    },
  };
}
