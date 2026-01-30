/**
 * Lockup Monitor CRE Workflow
 *
 * Cron-triggered workflow (hourly) that monitors token lockup expiry timestamps
 * on-chain via EVM capability. When lockups expire, it reports unlock events
 * and sends batch notifications to the server callback endpoint.
 *
 * @module cre/workflows/lockup-monitor
 */

import {
  Workflow,
  CronTrigger,
  EVMCapability,
  HttpCapability,
  type WorkflowContext,
  type CronTriggerConfig,
  type EVMReadResult,
} from '@chainlink/cre-sdk';

// ============================================================================
// Types
// ============================================================================

interface LockupEntry {
  lockupId: string;
  walletAddress: string;
  tokenAddress: string;
  amount: string;
  lockUntil: number; // unix timestamp
  releaseType: 'cliff' | 'linear' | 'milestone';
  tier: 'founder' | 'team' | 'advisor' | 'investor';
}

interface UnlockEvent {
  lockupId: string;
  walletAddress: string;
  tokenAddress: string;
  amount: string;
  unlockedAt: string;
  releaseType: string;
  tier: string;
}

interface BatchUnlockPayload {
  workflowId: string;
  executionId: string;
  timestamp: string;
  unlocks: UnlockEvent[];
  totalUnlocked: number;
}

// ============================================================================
// Configuration
// ============================================================================

const LOCKUP_REGISTRY_ABI = [
  {
    name: 'getLockupCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getLockupAtIndex',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'wallet', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'lockUntil', type: 'uint256' },
      { name: 'released', type: 'bool' },
    ],
  },
  {
    name: 'reportUnlock',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'lockupId', type: 'bytes32' }],
    outputs: [{ name: 'success', type: 'bool' }],
  },
] as const;

const CONFIG = {
  cronSchedule: '0 * * * *', // every hour
  registryAddress: process.env.LOCKUP_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000000000',
  chainId: parseInt(process.env.LOCKUP_CHAIN_ID || '1', 10),
  rpcUrl: process.env.LOCKUP_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
  callbackUrl: process.env.LOCKUP_CALLBACK_URL || 'http://localhost:3000/api/v1/lockups/unlock-callback',
  callbackSecret: process.env.LOCKUP_CALLBACK_SECRET || '',
  batchSize: 50,
  maxLockupsPerRun: 500,
};

// ============================================================================
// Workflow Definition
// ============================================================================

const lockupMonitorWorkflow = new Workflow({
  name: 'lockup-monitor',
  description: 'Hourly monitor for expired token lockups. Reads on-chain lockup expiry timestamps, reports unlock events, and notifies the server via batch callback.',
});

// ============================================================================
// Trigger: Cron (hourly)
// ============================================================================

const cronTrigger = new CronTrigger({
  schedule: CONFIG.cronSchedule,
  name: 'lockup-cron-trigger',
} as CronTriggerConfig);

lockupMonitorWorkflow.setTrigger(cronTrigger);

// ============================================================================
// Capabilities
// ============================================================================

const evmCapability = new EVMCapability({
  chainId: CONFIG.chainId,
  rpcUrl: CONFIG.rpcUrl,
});

const httpCapability = new HttpCapability();

// ============================================================================
// Workflow Handler
// ============================================================================

lockupMonitorWorkflow.setHandler(async (context: WorkflowContext) => {
  const executionId = context.executionId || `exec_${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);

  context.logger.info(`[lockup-monitor] Starting lockup scan at ${new Date().toISOString()}, execution: ${executionId}`);

  try {
    // Step 1: Read the total number of lockups from on-chain registry
    const lockupCountResult: EVMReadResult = await evmCapability.readContract({
      address: CONFIG.registryAddress,
      abi: LOCKUP_REGISTRY_ABI,
      functionName: 'getLockupCount',
      args: [],
    });

    const totalLockups = Number(lockupCountResult.value);
    context.logger.info(`[lockup-monitor] Found ${totalLockups} total lockups on-chain`);

    if (totalLockups === 0) {
      context.logger.info('[lockup-monitor] No lockups found, exiting');
      return { status: 'ok', unlocksProcessed: 0 };
    }

    // Step 2: Iterate through lockups in batches and find expired ones
    const expiredLockups: LockupEntry[] = [];
    const scanLimit = Math.min(totalLockups, CONFIG.maxLockupsPerRun);

    for (let i = 0; i < scanLimit; i += CONFIG.batchSize) {
      const batchEnd = Math.min(i + CONFIG.batchSize, scanLimit);

      const batchPromises = [];
      for (let j = i; j < batchEnd; j++) {
        batchPromises.push(
          evmCapability.readContract({
            address: CONFIG.registryAddress,
            abi: LOCKUP_REGISTRY_ABI,
            functionName: 'getLockupAtIndex',
            args: [j],
          })
        );
      }

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'rejected') {
          context.logger.warn('[lockup-monitor] Failed to read lockup entry', { error: result.reason });
          continue;
        }

        const [id, wallet, token, amount, lockUntil, released] = result.value.value as [
          string, string, string, bigint, bigint, boolean
        ];

        // Skip already-released lockups
        if (released) continue;

        const lockUntilNum = Number(lockUntil);

        // Check if lockup has expired
        if (lockUntilNum <= now) {
          expiredLockups.push({
            lockupId: id,
            walletAddress: wallet,
            tokenAddress: token,
            amount: amount.toString(),
            lockUntil: lockUntilNum,
            releaseType: 'cliff', // default; server resolves actual type
            tier: 'investor',     // default; server resolves actual tier
          });
        }
      }
    }

    context.logger.info(`[lockup-monitor] Found ${expiredLockups.length} expired lockups`);

    if (expiredLockups.length === 0) {
      return { status: 'ok', unlocksProcessed: 0 };
    }

    // Step 3: Report unlocks on-chain
    const reportedUnlocks: UnlockEvent[] = [];

    for (const lockup of expiredLockups) {
      try {
        await evmCapability.writeContract({
          address: CONFIG.registryAddress,
          abi: LOCKUP_REGISTRY_ABI,
          functionName: 'reportUnlock',
          args: [lockup.lockupId],
        });

        reportedUnlocks.push({
          lockupId: lockup.lockupId,
          walletAddress: lockup.walletAddress,
          tokenAddress: lockup.tokenAddress,
          amount: lockup.amount,
          unlockedAt: new Date().toISOString(),
          releaseType: lockup.releaseType,
          tier: lockup.tier,
        });

        context.logger.info(`[lockup-monitor] Reported unlock for lockup ${lockup.lockupId}`);
      } catch (err) {
        context.logger.error(`[lockup-monitor] Failed to report unlock for ${lockup.lockupId}`, { error: err });
      }
    }

    // Step 4: POST batch unlock notifications to server callback
    if (reportedUnlocks.length > 0) {
      const payload: BatchUnlockPayload = {
        workflowId: 'lockup-monitor',
        executionId,
        timestamp: new Date().toISOString(),
        unlocks: reportedUnlocks,
        totalUnlocked: reportedUnlocks.length,
      };

      try {
        const response = await httpCapability.request({
          method: 'POST',
          url: CONFIG.callbackUrl,
          headers: {
            'Content-Type': 'application/json',
            ...(CONFIG.callbackSecret
              ? { 'X-Webhook-Secret': CONFIG.callbackSecret }
              : {}),
          },
          body: JSON.stringify(payload),
        });

        if (response.statusCode >= 200 && response.statusCode < 300) {
          context.logger.info(`[lockup-monitor] Callback succeeded: ${reportedUnlocks.length} unlocks notified`);
        } else {
          context.logger.error(`[lockup-monitor] Callback returned status ${response.statusCode}`, {
            body: response.body,
          });
        }
      } catch (callbackErr) {
        context.logger.error('[lockup-monitor] Failed to POST unlock callback', { error: callbackErr });
      }
    }

    context.logger.info(`[lockup-monitor] Completed. Reported ${reportedUnlocks.length} unlocks.`);

    return {
      status: 'ok',
      unlocksProcessed: reportedUnlocks.length,
      totalScanned: scanLimit,
      executionId,
    };
  } catch (err) {
    context.logger.error('[lockup-monitor] Workflow execution failed', { error: err });
    throw err;
  }
});

export default lockupMonitorWorkflow;
