import { db, schema } from '../config/database.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';
import { AbiCoder } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import { withSerializableTransaction, withRetryableTransaction } from '../utils/transaction.js';

const { tokens, tokenTranches, issuances, redemptions, clawbacks, ledgerPositions, ledgerEvents, eventBusQueue } = schema;

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

export interface ClawbackInput {
  orgId: string;
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  fromInvestorId?: string;
  toInvestorId?: string;
  amount: string;
  reason: string; // Required - regulatory requirement
  idempotencyKey: string;
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
    assetId: input.assetId,
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
      updatedAt: new Date(),
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
      updatedAt: new Date(),
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
      deployedAt: new Date(),
      deployTxHash: txHash,
      updatedAt: new Date(),
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

// Cache loaded contract artifacts
const artifactCache = new Map<string, { abi: any[]; bytecode: string }>();

/**
 * Load a compiled contract artifact from contracts/out/ (Foundry format).
 * Exported for reuse by other services (e.g., NFT lifecycle contracts).
 */
export function loadContractArtifact(contractName: string): { abi: any[]; bytecode: string } {
  const cached = artifactCache.get(contractName);
  if (cached) return cached;

  const artifactPath = resolve(
    process.cwd(), '..', 'contracts', 'out',
    `${contractName}.sol`, `${contractName}.json`
  );

  if (!existsSync(artifactPath)) {
    throw new ValidationError(
      `Contract artifact not found: ${contractName}. Run 'forge build' in contracts/.`
    );
  }

  const raw = JSON.parse(readFileSync(artifactPath, 'utf-8'));
  const artifact = {
    abi: raw.abi,
    bytecode: raw.bytecode.object, // Foundry format: bytecode.object contains the hex
  };

  artifactCache.set(contractName, artifact);
  return artifact;
}

function buildERC3643Bytecode(token: any): string {
  const { abi, bytecode } = loadContractArtifact('ComplianceToken');

  // Encode constructor args using the ABI definition
  const coder = new AbiCoder();
  const constructorAbi = abi.find(
    (entry: any) => entry.type === 'constructor'
  );

  if (!constructorAbi) {
    // If no constructor, return raw bytecode
    return bytecode;
  }

  const types = constructorAbi.inputs.map((input: any) => input.type);
  const values: unknown[] = [];

  for (const input of constructorAbi.inputs) {
    switch (input.name) {
      case '_name': values.push(token.name); break;
      case '_symbol': values.push(token.symbol); break;
      case '_identityRegistry':
        values.push(token.identityRegistryAddress || '0x0000000000000000000000000000000000000000');
        break;
      default:
        values.push('0x0000000000000000000000000000000000000000');
    }
  }

  const encodedArgs = coder.encode(types, values);

  // bytecode + encoded constructor args (strip 0x from encoded args)
  return bytecode + encodedArgs.slice(2);
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
      updatedAt: new Date(),
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
      updatedAt: new Date(),
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
      updatedAt: new Date(),
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

  // Wrap entire issuance in a retryable transaction for atomicity
  // This ensures supply updates, ledger positions, and records are consistent
  const issuance = await withRetryableTransaction(async (tx) => {
    // Re-read token within transaction for consistency
    const currentToken = await tx.query.tokens.findFirst({
      where: and(eq(tokens.id, input.tokenId), eq(tokens.orgId, input.orgId)),
    });

    if (!currentToken) {
      throw new NotFoundError('Token not found');
    }

    // Check supply limits with fresh data
    const newIssuedSupply = BigInt(currentToken.issuedSupply || '0') + BigInt(input.amount);
    if (newIssuedSupply > BigInt(currentToken.totalSupply || '0')) {
      throw new ValidationError('Issuance would exceed total supply');
    }

    // If tranche specified, check tranche limits
    let tranche = null;
    if (input.trancheId) {
      tranche = await tx.query.tokenTranches.findFirst({
        where: and(eq(tokenTranches.id, input.trancheId), eq(tokenTranches.orgId, input.orgId)),
      });
      if (!tranche) {
        throw new NotFoundError('Tranche not found');
      }
      const newTrancheIssued = BigInt(tranche.issuedSupply) + BigInt(input.amount);
      if (newTrancheIssued > BigInt(tranche.supply)) {
        throw new ValidationError('Issuance would exceed tranche supply');
      }
    }

    // Create issuance record
    const [newIssuance] = await tx.insert(issuances).values({
      orgId: input.orgId,
      tokenId: input.tokenId,
      trancheId: input.trancheId,
      investorId: input.investorId,
      toWallet: input.walletAddress.toLowerCase(),
      amount: input.amount,
      status: 'pending',
      reason: input.reason,
      metadata: input.metadata || {},
    }).returning();

    // Update token issued supply
    await tx.update(tokens)
      .set({
        issuedSupply: newIssuedSupply.toString(),
        updatedAt: new Date(),
      })
      .where(eq(tokens.id, input.tokenId));

    // Update tranche if applicable
    if (input.trancheId && tranche) {
      await tx.update(tokenTranches)
        .set({
          issuedSupply: (BigInt(tranche.issuedSupply) + BigInt(input.amount)).toString(),
          updatedAt: new Date(),
        })
        .where(eq(tokenTranches.id, input.trancheId));
    }

    // Update or create ledger position within transaction
    await updateLedgerPositionInTx(
      tx,
      input.orgId,
      input.tokenId,
      input.investorId,
      input.walletAddress,
      input.amount,
      'credit'
    );

    // Create event within transaction
    await tx.insert(eventBusQueue).values({
      orgId: input.orgId,
      topic: 'token.issued',
      payload: {
        issuanceId: newIssuance.id,
        tokenId: input.tokenId,
        investorId: input.investorId,
        amount: input.amount,
      },
    });

    return newIssuance;
  }, 3, 100);

  // Audit log (outside transaction - non-critical)
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
      txBlock: blockNumber,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(issuances.id, id))
    .returning();

  // Create ledger event
  await db.insert(ledgerEvents).values({
    orgId,
    tokenId: issuance.tokenId,
    eventType: 'issuance',
    toWallet: issuance.toWallet,
    delta: issuance.amount,
    txHash,
    txBlock: blockNumber,
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

  // Wrap entire redemption in a retryable transaction for atomicity
  const redemption = await withRetryableTransaction(async (tx) => {
    // Check investor has sufficient balance within transaction
    const position = await tx.query.ledgerPositions.findFirst({
      where: and(
        eq(ledgerPositions.tokenId, input.tokenId),
        eq(ledgerPositions.investorId, input.investorId),
        eq(ledgerPositions.walletAddress, input.walletAddress.toLowerCase())
      ),
    });

    if (!position || BigInt(position.balance) < BigInt(input.amount)) {
      throw new ValidationError('Insufficient balance for redemption');
    }

    // Re-read token for current supply
    const currentToken = await tx.query.tokens.findFirst({
      where: and(eq(tokens.id, input.tokenId), eq(tokens.orgId, input.orgId)),
    });

    if (!currentToken) {
      throw new NotFoundError('Token not found');
    }

    // Create redemption record
    const [newRedemption] = await tx.insert(redemptions).values({
      orgId: input.orgId,
      tokenId: input.tokenId,
      investorId: input.investorId,
      fromWallet: input.walletAddress.toLowerCase(),
      amount: input.amount,
      status: 'pending',
      reason: input.reason,
      metadata: input.metadata || {},
    }).returning();

    // Update ledger position (debit) within transaction
    await updateLedgerPositionInTx(
      tx,
      input.orgId,
      input.tokenId,
      input.investorId,
      input.walletAddress,
      input.amount,
      'debit'
    );

    // Update token issued supply
    await tx.update(tokens)
      .set({
        issuedSupply: (BigInt(currentToken.issuedSupply || '0') - BigInt(input.amount)).toString(),
        updatedAt: new Date(),
      })
      .where(eq(tokens.id, input.tokenId));

    // Create event within transaction
    await tx.insert(eventBusQueue).values({
      orgId: input.orgId,
      topic: 'token.redeemed',
      payload: {
        redemptionId: newRedemption.id,
        tokenId: input.tokenId,
        investorId: input.investorId,
        amount: input.amount,
      },
    });

    return newRedemption;
  }, 3, 100);

  // Audit log (outside transaction - non-critical)
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
      txBlock: blockNumber,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(redemptions.id, id))
    .returning();

  // Create ledger event
  await db.insert(ledgerEvents).values({
    orgId,
    tokenId: redemption.tokenId,
    eventType: 'redemption',
    fromWallet: redemption.fromWallet,
    delta: `-${redemption.amount}`,
    txHash,
    txBlock: blockNumber,
  });

  return updated;
}

// ============================================================================
// Clawback (Administrative Token Recovery)
// ============================================================================

/**
 * Initiates a clawback of tokens from one address to another.
 * This is an administrative action that bypasses normal transfer compliance checks.
 *
 * Regulatory Note: Clawbacks must always include a documented reason.
 * The reason is stored permanently in the audit trail and cannot be modified.
 */
export async function initiateClawback(input: ClawbackInput) {
  const token = await getToken(input.tokenId, input.orgId);

  if (token.status !== 'deployed') {
    throw new ValidationError(`Cannot clawback from ${token.status} token`);
  }

  // Validate amount
  if (!/^\d+$/.test(input.amount) || BigInt(input.amount) <= 0n) {
    throw new ValidationError('Amount must be a positive integer string');
  }

  // Validate reason is provided and substantial
  if (!input.reason || input.reason.trim().length < 10) {
    throw new ValidationError('Clawback reason must be at least 10 characters');
  }

  const clawback = await withRetryableTransaction(async (tx) => {
    // Check source has sufficient balance
    const sourcePosition = await tx.query.ledgerPositions.findFirst({
      where: and(
        eq(ledgerPositions.tokenId, input.tokenId),
        eq(ledgerPositions.walletAddress, input.fromWallet.toLowerCase())
      ),
    });

    if (!sourcePosition || BigInt(sourcePosition.balance) < BigInt(input.amount)) {
      throw new ValidationError('Source wallet has insufficient balance for clawback');
    }

    // Create clawback record
    const [newClawback] = await tx.insert(clawbacks).values({
      orgId: input.orgId,
      tokenId: input.tokenId,
      fromWallet: input.fromWallet.toLowerCase(),
      toWallet: input.toWallet.toLowerCase(),
      fromInvestorId: input.fromInvestorId || sourcePosition.investorId,
      toInvestorId: input.toInvestorId,
      amount: input.amount,
      reason: input.reason,
      status: 'pending',
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata || {},
    }).returning();

    // Create event
    await tx.insert(eventBusQueue).values({
      orgId: input.orgId,
      topic: 'token.clawback.initiated',
      payload: {
        clawbackId: newClawback.id,
        tokenId: input.tokenId,
        fromWallet: input.fromWallet,
        toWallet: input.toWallet,
        amount: input.amount,
        reason: input.reason,
      },
    });

    return newClawback;
  }, 3, 100);

  // Audit log
  await auditService.logSystemAction(
    input.orgId,
    'clawback_initiated',
    'clawback',
    clawback.id,
    `Clawback of ${input.amount} tokens initiated from ${input.fromWallet}: ${input.reason}`,
    { tokenId: input.tokenId, fromWallet: input.fromWallet, toWallet: input.toWallet }
  );

  return clawback;
}

/**
 * Approves a clawback for execution.
 * In production, this should require multi-sig or compliance officer approval.
 */
export async function approveClawback(
  id: string,
  orgId: string,
  approverId: string
) {
  const clawback = await db.query.clawbacks.findFirst({
    where: and(eq(clawbacks.id, id), eq(clawbacks.orgId, orgId)),
  });

  if (!clawback) {
    throw new NotFoundError('Clawback not found');
  }

  if (clawback.status !== 'pending') {
    throw new ValidationError(`Cannot approve clawback in ${clawback.status} status`);
  }

  const [updated] = await db.update(clawbacks)
    .set({
      status: 'approved',
      approvedBy: approverId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(clawbacks.id, id))
    .returning();

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'token.clawback.approved',
    payload: { clawbackId: id },
  });

  await auditService.logSystemAction(
    orgId,
    'clawback_approved',
    'clawback',
    id,
    `Clawback approved by ${approverId}`,
    { approverId }
  );

  return updated;
}

/**
 * Executes an approved clawback.
 * This performs the actual token movement and updates ledger positions.
 */
export async function executeClawback(
  id: string,
  orgId: string,
  executorId: string
) {
  const clawbackRecord = await db.query.clawbacks.findFirst({
    where: and(eq(clawbacks.id, id), eq(clawbacks.orgId, orgId)),
  });

  if (!clawbackRecord) {
    throw new NotFoundError('Clawback not found');
  }

  if (clawbackRecord.status !== 'approved') {
    throw new ValidationError(`Cannot execute clawback in ${clawbackRecord.status} status (must be approved first)`);
  }

  const result = await withRetryableTransaction(async (tx) => {
    // Debit from source
    await updateLedgerPositionInTx(
      tx,
      orgId,
      clawbackRecord.tokenId,
      clawbackRecord.fromInvestorId || 'UNKNOWN',
      clawbackRecord.fromWallet,
      clawbackRecord.amount,
      'debit'
    );

    // Credit to destination
    await updateLedgerPositionInTx(
      tx,
      orgId,
      clawbackRecord.tokenId,
      clawbackRecord.toInvestorId || 'TREASURY',
      clawbackRecord.toWallet,
      clawbackRecord.amount,
      'credit'
    );

    // Update clawback status
    const [updated] = await tx.update(clawbacks)
      .set({
        status: 'executed',
        executedBy: executorId,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clawbacks.id, id))
      .returning();

    // Create ledger events for audit trail
    await tx.insert(ledgerEvents).values([
      {
        orgId,
        tokenId: clawbackRecord.tokenId,
        eventType: 'clawback_debit',
        fromWallet: clawbackRecord.fromWallet,
        delta: `-${clawbackRecord.amount}`,
        ref: id,
        refType: 'clawback',
      },
      {
        orgId,
        tokenId: clawbackRecord.tokenId,
        eventType: 'clawback_credit',
        toWallet: clawbackRecord.toWallet,
        delta: clawbackRecord.amount,
        ref: id,
        refType: 'clawback',
      },
    ]);

    // Emit event
    await tx.insert(eventBusQueue).values({
      orgId,
      topic: 'token.clawback.executed',
      payload: {
        clawbackId: id,
        tokenId: clawbackRecord.tokenId,
        fromWallet: clawbackRecord.fromWallet,
        toWallet: clawbackRecord.toWallet,
        amount: clawbackRecord.amount,
      },
    });

    return updated;
  }, 3, 100);

  await auditService.logSystemAction(
    orgId,
    'clawback_executed',
    'clawback',
    id,
    `Clawback executed: ${clawbackRecord.amount} tokens moved from ${clawbackRecord.fromWallet} to ${clawbackRecord.toWallet}. Reason: ${clawbackRecord.reason}`,
    { executorId, fromWallet: clawbackRecord.fromWallet, toWallet: clawbackRecord.toWallet }
  );

  return result;
}

/**
 * Confirms a clawback after on-chain execution.
 */
export async function confirmClawback(
  id: string,
  orgId: string,
  txHash: string,
  blockNumber: number
) {
  const clawback = await db.query.clawbacks.findFirst({
    where: and(eq(clawbacks.id, id), eq(clawbacks.orgId, orgId)),
  });

  if (!clawback) {
    throw new NotFoundError('Clawback not found');
  }

  if (clawback.status !== 'executed') {
    throw new ValidationError(`Cannot confirm clawback in ${clawback.status} status`);
  }

  const [updated] = await db.update(clawbacks)
    .set({
      status: 'confirmed',
      txHash,
      txBlock: blockNumber,
      updatedAt: new Date(),
    })
    .where(eq(clawbacks.id, id))
    .returning();

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'token.clawback.confirmed',
    payload: { clawbackId: id, txHash, blockNumber },
  });

  return updated;
}

/**
 * Retrieves a clawback by ID.
 */
export async function getClawback(id: string, orgId: string) {
  const clawback = await db.query.clawbacks.findFirst({
    where: and(eq(clawbacks.id, id), eq(clawbacks.orgId, orgId)),
  });

  if (!clawback) {
    throw new NotFoundError('Clawback not found');
  }

  return clawback;
}

/**
 * Lists clawbacks with optional filters.
 */
export async function listClawbacks(orgId: string, params: {
  tokenId?: string;
  status?: string;
  fromWallet?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { tokenId, status, fromWallet, limit = 50, offset = 0 } = params;

  const conditions = [eq(clawbacks.orgId, orgId)];
  if (tokenId) conditions.push(eq(clawbacks.tokenId, tokenId));
  if (status) conditions.push(eq(clawbacks.status, status));
  if (fromWallet) conditions.push(eq(clawbacks.fromWallet, fromWallet.toLowerCase()));

  return db.select()
    .from(clawbacks)
    .where(and(...conditions))
    .orderBy(desc(clawbacks.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============================================================================
// Ledger Position Management
// ============================================================================

/**
 * Update ledger position within a transaction context.
 * This is the core implementation that can be used within transactions.
 */
async function updateLedgerPositionInTx(
  txContext: typeof db,
  orgId: string,
  tokenId: string,
  investorId: string,
  walletAddress: string,
  amount: string,
  type: 'credit' | 'debit'
) {
  const normalizedWallet = walletAddress.toLowerCase();

  // Find existing position by the unique constraint columns (tokenId, walletAddress)
  const existing = await txContext.select()
    .from(ledgerPositions)
    .where(and(
      eq(ledgerPositions.tokenId, tokenId),
      eq(ledgerPositions.walletAddress, normalizedWallet)
    ))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    const currentBalance = BigInt(row.balance);
    const changeAmount = BigInt(amount);
    const newBalance = type === 'credit'
      ? currentBalance + changeAmount
      : currentBalance - changeAmount;

    if (newBalance < 0n) {
      throw new ValidationError('Operation would result in negative balance');
    }

    await txContext.update(ledgerPositions)
      .set({
        balance: newBalance.toString(),
        investorId, // update investorId in case it changed
        lastEventAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ledgerPositions.id, row.id));
  } else {
    if (type === 'debit') {
      throw new ValidationError('Cannot debit from non-existent position');
    }

    await txContext.insert(ledgerPositions).values({
      orgId,
      tokenId,
      investorId,
      walletAddress: normalizedWallet,
      balance: amount,
      lastEventAt: new Date(),
    });
  }
}

/**
 * Update ledger position with automatic transaction wrapping.
 * Use this for standalone position updates outside of other transactions.
 */
async function updateLedgerPosition(
  orgId: string,
  tokenId: string,
  investorId: string,
  walletAddress: string,
  amount: string,
  type: 'credit' | 'debit'
) {
  await withSerializableTransaction(async (tx) => {
    await updateLedgerPositionInTx(tx, orgId, tokenId, investorId, walletAddress, amount, type);
  });
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
