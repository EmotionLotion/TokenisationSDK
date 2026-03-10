/**
 * Price Monitor CRE Workflow
 *
 * EVM Log-triggered workflow that monitors secondary market Transfer events.
 * Detects suspicious patterns such as multiple rapid transfers or price spikes,
 * and reports violations to the compliance service via HTTP callback.
 *
 * @module cre/workflows/price-monitor
 */

import {
  Workflow,
  EVMLogTrigger,
  EVMCapability,
  HttpCapability,
  type WorkflowContext,
  type EVMLogTriggerConfig,
  type EVMLogEvent,
  type EVMReadResult,
} from '@chainlink/cre-sdk';

// ============================================================================
// Types
// ============================================================================

interface TransferEvent {
  from: string;
  to: string;
  value: string;
  tokenAddress: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

interface PriceDataPoint {
  tokenAddress: string;
  price: string;
  timestamp: number;
  source: string;
}

interface SuspiciousPattern {
  type: 'rapid_transfers' | 'price_spike' | 'wash_trading' | 'concentration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: Record<string, unknown>;
}

interface ViolationReport {
  workflowId: string;
  executionId: string;
  timestamp: string;
  tokenAddress: string;
  triggerTxHash: string;
  transferEvent: TransferEvent;
  patterns: SuspiciousPattern[];
  priceData?: PriceDataPoint;
  recommendation: 'flag' | 'pause' | 'block';
}

// ============================================================================
// Configuration
// ============================================================================

const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // Transfer(address,address,uint256)

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const CONFIG = {
  monitoredTokens: (process.env.PRICE_MONITOR_TOKENS || '').split(',').filter(Boolean),
  chainId: parseInt(process.env.PRICE_MONITOR_CHAIN_ID || '1', 10),
  rpcUrl: process.env.PRICE_MONITOR_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
  complianceCallbackUrl: process.env.COMPLIANCE_CALLBACK_URL || 'http://localhost:3000/api/v1/compliance/violation-callback',
  callbackSecret: process.env.COMPLIANCE_CALLBACK_SECRET || '',

  // Thresholds
  rapidTransferWindowSeconds: 300,       // 5 minutes
  rapidTransferThreshold: 5,             // transfers within window
  priceSpikePctThreshold: 20,            // 20% price change
  concentrationPctThreshold: 25,         // 25% of total supply
  washTradingWindowSeconds: 3600,        // 1 hour
  washTradingMinCycles: 3,               // min round-trip transfers

  // State TTL
  stateWindowSeconds: 7200,              // 2 hours of history
};

// ============================================================================
// In-memory state for pattern detection
// (In production, use durable storage via CRE state capability)
// ============================================================================

const recentTransfers: Map<string, TransferEvent[]> = new Map(); // tokenAddress -> events
const lastKnownPrices: Map<string, PriceDataPoint> = new Map();  // tokenAddress -> price

// ============================================================================
// Workflow Definition
// ============================================================================

const priceMonitorWorkflow = new Workflow({
  name: 'price-monitor',
  description: 'Monitors secondary market Transfer events for suspicious patterns including rapid transfers, price spikes, wash trading, and concentration risks.',
});

// ============================================================================
// Trigger: EVM Log (Transfer events)
// ============================================================================

const transferLogTrigger = new EVMLogTrigger({
  chainId: CONFIG.chainId,
  rpcUrl: CONFIG.rpcUrl,
  addresses: CONFIG.monitoredTokens,
  topics: [TRANSFER_EVENT_SIGNATURE],
  name: 'transfer-event-trigger',
} as EVMLogTriggerConfig);

priceMonitorWorkflow.setTrigger(transferLogTrigger);

// ============================================================================
// Capabilities
// ============================================================================

const evmCapability = new EVMCapability({
  chainId: CONFIG.chainId,
  rpcUrl: CONFIG.rpcUrl,
});

const httpCapability = new HttpCapability();

// ============================================================================
// Pattern Detection Functions
// ============================================================================

function pruneOldTransfers(tokenAddress: string): void {
  const cutoff = Math.floor(Date.now() / 1000) - CONFIG.stateWindowSeconds;
  const events = recentTransfers.get(tokenAddress) || [];
  recentTransfers.set(
    tokenAddress,
    events.filter((e) => e.timestamp > cutoff)
  );
}

function detectRapidTransfers(tokenAddress: string, currentEvent: TransferEvent): SuspiciousPattern | null {
  const events = recentTransfers.get(tokenAddress) || [];
  const windowStart = currentEvent.timestamp - CONFIG.rapidTransferWindowSeconds;

  const recentFromSender = events.filter(
    (e) => e.from === currentEvent.from && e.timestamp >= windowStart
  );

  // Count includes the current event
  const transferCount = recentFromSender.length + 1;

  if (transferCount >= CONFIG.rapidTransferThreshold) {
    return {
      type: 'rapid_transfers',
      severity: transferCount >= CONFIG.rapidTransferThreshold * 2 ? 'critical' : 'high',
      description: `Wallet ${currentEvent.from} executed ${transferCount} transfers in ${CONFIG.rapidTransferWindowSeconds}s window`,
      evidence: {
        wallet: currentEvent.from,
        transferCount,
        windowSeconds: CONFIG.rapidTransferWindowSeconds,
        recentTxHashes: recentFromSender.map((e) => e.txHash).slice(-10),
      },
    };
  }

  return null;
}

function detectPriceSpike(tokenAddress: string, currentPrice: PriceDataPoint): SuspiciousPattern | null {
  const lastPrice = lastKnownPrices.get(tokenAddress);
  if (!lastPrice) return null;

  const oldPriceNum = parseFloat(lastPrice.price);
  const newPriceNum = parseFloat(currentPrice.price);

  if (oldPriceNum === 0) return null;

  const changePct = Math.abs(((newPriceNum - oldPriceNum) / oldPriceNum) * 100);

  if (changePct >= CONFIG.priceSpikePctThreshold) {
    return {
      type: 'price_spike',
      severity: changePct >= CONFIG.priceSpikePctThreshold * 2 ? 'critical' : 'high',
      description: `Token ${tokenAddress} price changed by ${changePct.toFixed(2)}% (${oldPriceNum} -> ${newPriceNum})`,
      evidence: {
        tokenAddress,
        oldPrice: lastPrice.price,
        newPrice: currentPrice.price,
        changePct: changePct.toFixed(2),
        timeElapsedSeconds: currentPrice.timestamp - lastPrice.timestamp,
      },
    };
  }

  return null;
}

function detectWashTrading(tokenAddress: string, currentEvent: TransferEvent): SuspiciousPattern | null {
  const events = recentTransfers.get(tokenAddress) || [];
  const windowStart = currentEvent.timestamp - CONFIG.washTradingWindowSeconds;
  const windowEvents = events.filter((e) => e.timestamp >= windowStart);

  // Look for round-trip patterns: A->B and B->A
  const pairCounts: Map<string, number> = new Map();

  for (const e of windowEvents) {
    const pairKey = [e.from, e.to].sort().join('_');
    pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
  }

  // Check current event pair
  const currentPairKey = [currentEvent.from, currentEvent.to].sort().join('_');
  const currentPairCount = (pairCounts.get(currentPairKey) || 0) + 1;

  if (currentPairCount >= CONFIG.washTradingMinCycles) {
    return {
      type: 'wash_trading',
      severity: currentPairCount >= CONFIG.washTradingMinCycles * 2 ? 'critical' : 'medium',
      description: `Suspected wash trading between ${currentEvent.from} and ${currentEvent.to}: ${currentPairCount} round-trips in ${CONFIG.washTradingWindowSeconds}s`,
      evidence: {
        walletA: currentEvent.from,
        walletB: currentEvent.to,
        roundTrips: currentPairCount,
        windowSeconds: CONFIG.washTradingWindowSeconds,
      },
    };
  }

  return null;
}

async function detectConcentration(
  tokenAddress: string,
  recipientAddress: string
): Promise<SuspiciousPattern | null> {
  try {
    const [balanceResult, supplyResult]: [EVMReadResult, EVMReadResult] = await Promise.all([
      evmCapability.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [recipientAddress],
      }),
      evmCapability.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'totalSupply',
        args: [],
      }),
    ]);

    const balance = BigInt(balanceResult.value as string);
    const totalSupply = BigInt(supplyResult.value as string);

    if (totalSupply === 0n) return null;

    const concentrationPct = Number((balance * 10000n) / totalSupply) / 100;

    if (concentrationPct >= CONFIG.concentrationPctThreshold) {
      return {
        type: 'concentration',
        severity: concentrationPct >= 50 ? 'critical' : 'high',
        description: `Wallet ${recipientAddress} holds ${concentrationPct.toFixed(2)}% of ${tokenAddress} total supply`,
        evidence: {
          wallet: recipientAddress,
          balance: balance.toString(),
          totalSupply: totalSupply.toString(),
          concentrationPct: concentrationPct.toFixed(2),
        },
      };
    }
  } catch (err) {
    // Concentration check is non-critical; log and continue
  }

  return null;
}

// ============================================================================
// Workflow Handler
// ============================================================================

priceMonitorWorkflow.setHandler(async (context: WorkflowContext) => {
  const executionId = context.executionId || `exec_${Date.now()}`;
  const logEvent: EVMLogEvent = context.triggerEvent as EVMLogEvent;

  if (!logEvent || !logEvent.topics || logEvent.topics.length < 3) {
    context.logger.warn('[price-monitor] Invalid log event received, skipping');
    return { status: 'skipped', reason: 'invalid_event' };
  }

  // Decode Transfer event
  const tokenAddress = logEvent.address;
  const fromAddress = '0x' + (logEvent.topics[1]?.slice(26) || '');
  const toAddress = '0x' + (logEvent.topics[2]?.slice(26) || '');
  const value = logEvent.data || '0';

  const transferEvent: TransferEvent = {
    from: fromAddress.toLowerCase(),
    to: toAddress.toLowerCase(),
    value,
    tokenAddress: tokenAddress.toLowerCase(),
    txHash: logEvent.transactionHash || '',
    blockNumber: logEvent.blockNumber || 0,
    timestamp: Math.floor(Date.now() / 1000),
  };

  context.logger.info(`[price-monitor] Transfer detected: ${transferEvent.from} -> ${transferEvent.to}, value: ${transferEvent.value}, token: ${transferEvent.tokenAddress}`);

  // Prune old transfers
  pruneOldTransfers(transferEvent.tokenAddress);

  // Run pattern detection
  const detectedPatterns: SuspiciousPattern[] = [];

  // 1. Rapid transfers
  const rapidPattern = detectRapidTransfers(transferEvent.tokenAddress, transferEvent);
  if (rapidPattern) {
    detectedPatterns.push(rapidPattern);
    context.logger.warn(`[price-monitor] Rapid transfer pattern detected`, { pattern: rapidPattern });
  }

  // 2. Wash trading
  const washPattern = detectWashTrading(transferEvent.tokenAddress, transferEvent);
  if (washPattern) {
    detectedPatterns.push(washPattern);
    context.logger.warn(`[price-monitor] Wash trading pattern detected`, { pattern: washPattern });
  }

  // 3. Concentration risk
  const concentrationPattern = await detectConcentration(transferEvent.tokenAddress, transferEvent.to);
  if (concentrationPattern) {
    detectedPatterns.push(concentrationPattern);
    context.logger.warn(`[price-monitor] Concentration risk detected`, { pattern: concentrationPattern });
  }

  // 4. Price spike detection (compare against cached price)
  // In production, fetch from Chainlink price feed or DEX oracle
  let priceData: PriceDataPoint | undefined;
  try {
    // Attempt to fetch current price via an HTTP oracle endpoint
    const priceResponse = await httpCapability.request({
      method: 'GET',
      url: `${CONFIG.complianceCallbackUrl.replace('/violation-callback', '/price')}?token=${transferEvent.tokenAddress}`,
      headers: { 'Content-Type': 'application/json' },
    });

    if (priceResponse.statusCode === 200 && priceResponse.body) {
      const parsed = JSON.parse(priceResponse.body);
      priceData = {
        tokenAddress: transferEvent.tokenAddress,
        price: parsed.price || '0',
        timestamp: Math.floor(Date.now() / 1000),
        source: 'compliance-api',
      };

      const spikePattern = detectPriceSpike(transferEvent.tokenAddress, priceData);
      if (spikePattern) {
        detectedPatterns.push(spikePattern);
        context.logger.warn(`[price-monitor] Price spike detected`, { pattern: spikePattern });
      }

      // Update cached price
      lastKnownPrices.set(transferEvent.tokenAddress, priceData);
    }
  } catch (priceErr) {
    context.logger.debug('[price-monitor] Could not fetch price data', { error: priceErr });
  }

  // Store current transfer for future pattern detection
  const existing = recentTransfers.get(transferEvent.tokenAddress) || [];
  existing.push(transferEvent);
  recentTransfers.set(transferEvent.tokenAddress, existing);

  // Report violations if any patterns detected
  if (detectedPatterns.length > 0) {
    const maxSeverity = detectedPatterns.reduce((max, p) => {
      const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      return severityOrder[p.severity] > severityOrder[max] ? p.severity : max;
    }, 'low' as SuspiciousPattern['severity']);

    const recommendation: ViolationReport['recommendation'] =
      maxSeverity === 'critical' ? 'block' :
      maxSeverity === 'high' ? 'pause' : 'flag';

    const violationReport: ViolationReport = {
      workflowId: 'price-monitor',
      executionId,
      timestamp: new Date().toISOString(),
      tokenAddress: transferEvent.tokenAddress,
      triggerTxHash: transferEvent.txHash,
      transferEvent,
      patterns: detectedPatterns,
      priceData,
      recommendation,
    };

    try {
      const response = await httpCapability.request({
        method: 'POST',
        url: CONFIG.complianceCallbackUrl,
        headers: {
          'Content-Type': 'application/json',
          ...(CONFIG.callbackSecret
            ? { 'X-Webhook-Secret': CONFIG.callbackSecret }
            : {}),
        },
        body: JSON.stringify(violationReport),
      });

      if (response.statusCode >= 200 && response.statusCode < 300) {
        context.logger.info(`[price-monitor] Violation report sent successfully: ${detectedPatterns.length} patterns, recommendation: ${recommendation}`);
      } else {
        context.logger.error(`[price-monitor] Compliance callback returned status ${response.statusCode}`, {
          body: response.body,
        });
      }
    } catch (callbackErr) {
      context.logger.error('[price-monitor] Failed to send violation report', { error: callbackErr });
    }

    return {
      status: 'violation_reported',
      patternsDetected: detectedPatterns.length,
      recommendation,
      executionId,
    };
  }

  context.logger.info('[price-monitor] Transfer processed, no suspicious patterns detected');

  return {
    status: 'ok',
    patternsDetected: 0,
    executionId,
  };
});

export default priceMonitorWorkflow;
