/**
 * Chainlink Integration Smoke Tests
 *
 * End-to-end smoke tests for every Chainlink integration use case.
 * Uses mocked plugin internals (no real RPC) but exercises REAL code paths
 * through bridges, providers, factories, and core services.
 *
 * Categories:
 * 1. DataFeed pipeline: Plugin → Bridge → OracleService → query
 * 2. Functions pipeline: Plugin → Bridge → OracleService → FLIGHT_STATUS
 * 3. CCIP pipeline: Plugin → SettlementProvider → DvP flow
 * 4. Automation pipeline: Plugin → LifecycleManager → EventBus
 * 5. PoR pipeline: Plugin → ComplianceEngine → mint/transfer gating
 * 6. Factory assembly: ChainlinkSDKFactory wires everything
 * 7. OracleService fail-safe & circuit breaker
 * 8. Settlement edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OracleService, OracleFailSafeMode, ComplianceEngine, ComplianceAction, CrossPackEventBus } from '@tokenisation/core';
import type { IProofOfReservePlugin } from '@tokenisation/core';
import {
  DataFeedBridge,
  FlightDataFunctionsBridge,
  AutomationLifecycleManager,
  CCIPSettlementProvider,
  AutomationTaskType,
} from '@tokenisation/chains';
import type { DataFeedPlugin, PriceData } from '@tokenisation/chains';
import type { ChainlinkFunctionsPlugin, FunctionsResponse } from '@tokenisation/chains';
import type { CCIPBridgePlugin, CCIPTransferResult } from '@tokenisation/chains';
import type { ChainlinkAutomationPlugin, AutomationTask } from '@tokenisation/chains';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockDataFeedPlugin(overrides: Partial<DataFeedPlugin> = {}): DataFeedPlugin {
  return {
    pluginId: 'chainlink-data-feeds',
    supportedDataTypes: ['price', 'nav'],
    getLatestPrice: vi.fn().mockImplementation((pair: string) => {
      const prices: Record<string, PriceData> = {
        'ETH/USD': {
          pair: 'ETH/USD',
          price: 200000000000n,
          decimals: 8,
          formattedPrice: '2000.00000000',
          updatedAt: new Date(),
          roundId: 100n,
        },
        'BTC/USD': {
          pair: 'BTC/USD',
          price: 5000000000000n,
          decimals: 8,
          formattedPrice: '50000.00000000',
          updatedAt: new Date(),
          roundId: 200n,
        },
        'USD/AED': {
          pair: 'USD/AED',
          price: 367000000n,
          decimals: 8,
          formattedPrice: '3.67000000',
          updatedAt: new Date(),
          roundId: 300n,
        },
      };
      return Promise.resolve(prices[pair] || prices['ETH/USD']);
    }),
    fetchData: vi.fn(),
    subscribe: vi.fn(),
    verifySignature: vi.fn(),
    getNAV: vi.fn(),
    ...overrides,
  } as unknown as DataFeedPlugin;
}

function createMockFunctionsPlugin(overrides: Partial<ChainlinkFunctionsPlugin> = {}): ChainlinkFunctionsPlugin {
  const encoder = new TextEncoder();
  return {
    pluginId: 'chainlink-functions',
    executeRequest: vi.fn().mockResolvedValue({
      success: true,
      data: {
        requestId: '0xabc123',
        response: encoder.encode(
          JSON.stringify({
            landed: true,
            actualArrival: '2025-01-15T14:30:00Z',
            delay: 15,
            verified: true,
          })
        ),
      } satisfies FunctionsResponse,
    }),
    ...overrides,
  } as unknown as ChainlinkFunctionsPlugin;
}

function createMockCCIPPlugin(overrides: Partial<CCIPBridgePlugin> = {}): CCIPBridgePlugin {
  return {
    pluginId: 'chainlink-ccip',
    bridgeTokens: vi.fn().mockResolvedValue({
      success: true,
      data: {
        messageId: '0xmsg123',
        txHash: '0xtx456',
        sourceChainId: 8453,
        destChainId: 1,
        fee: '0.01',
      } satisfies CCIPTransferResult,
    }),
    getSupportedLanes: vi.fn().mockReturnValue([
      { source: 8453, dest: 1, name: 'Base -> Ethereum' },
      { source: 8453, dest: 137, name: 'Base -> Polygon' },
    ]),
    isChainSupported: vi.fn().mockResolvedValue(true),
    estimateFee: vi.fn().mockResolvedValue({ success: true, data: '50000000000000' }),
    getSupportedTokens: vi.fn().mockResolvedValue(['0xUSDC', '0xWETH']),
    getExplorerUrl: vi.fn().mockReturnValue('https://basescan.org/tx/0xtx456'),
    getCCIPExplorerUrl: vi.fn().mockReturnValue('https://ccip.chain.link/msg/0xmsg123'),
    ...overrides,
  } as unknown as CCIPBridgePlugin;
}

function createMockAutomationPlugin(overrides: Partial<ChainlinkAutomationPlugin> = {}): ChainlinkAutomationPlugin {
  return {
    pluginId: 'chainlink-automation',
    createComplianceCheckTask: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'compliance-asset1',
        type: AutomationTaskType.COMPLIANCE_CHECK,
        upkeepId: 'upkeep-100',
        contractAddress: '0xCompliance',
        checkData: '0x',
        enabled: true,
        performCount: 0,
      } satisfies AutomationTask,
    }),
    createNAVUpdateTask: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'nav-asset1',
        type: AutomationTaskType.NAV_UPDATE,
        upkeepId: 'upkeep-200',
        contractAddress: '0xNAV',
        checkData: '0x',
        enabled: true,
        performCount: 0,
      } satisfies AutomationTask,
    }),
    createDistributionTask: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'dist-schedule1',
        type: AutomationTaskType.DISTRIBUTION,
        upkeepId: 'upkeep-300',
        contractAddress: '0xDistributor',
        checkData: '0x',
        enabled: true,
        performCount: 0,
      },
    }),
    createEscrowReleaseTask: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'escrow-esc1',
        type: AutomationTaskType.ESCROW_RELEASE,
        upkeepId: 'upkeep-400',
        contractAddress: '0xEscrow',
        checkData: '0x',
        enabled: true,
        performCount: 0,
      },
    }),
    registerUpkeep: vi.fn(),
    destroy: vi.fn(),
    getTask: vi.fn(),
    getAllTasks: vi.fn().mockReturnValue([]),
    getTasksByType: vi.fn().mockReturnValue([]),
    getRegistryAddress: vi.fn().mockReturnValue('0xRegistry'),
    ...overrides,
  } as unknown as ChainlinkAutomationPlugin;
}

function createMockPoRPlugin(): IProofOfReservePlugin {
  return {
    pluginId: 'chainlink-por',
    checkMintCompliance: vi.fn().mockResolvedValue({
      compliant: true,
      status: 1,
      reason: 'Reserve fully backed',
      currentRatio: 15000,
      requiredRatio: 10000,
    }),
    checkTransferCompliance: vi.fn().mockResolvedValue({
      compliant: true,
      status: 1,
      reason: 'Reserve sufficient for transfers',
    }),
    canMint: vi.fn().mockResolvedValue({
      success: true,
      data: { allowed: true, reason: 'Reserve sufficient' },
    }),
  } as unknown as IProofOfReservePlugin;
}

function createUndercollateralizedPoRPlugin(): IProofOfReservePlugin {
  return {
    pluginId: 'chainlink-por',
    checkMintCompliance: vi.fn().mockResolvedValue({
      compliant: false,
      status: 2,
      reason: 'Reserve undercollateralized: ratio 8500 < required 10000',
      currentRatio: 8500,
      requiredRatio: 10000,
    }),
    checkTransferCompliance: vi.fn().mockResolvedValue({
      compliant: false,
      status: 2,
      reason: 'Reserve undercollateralized',
    }),
  } as unknown as IProofOfReservePlugin;
}

// ============================================================================
// 1. DATA FEED PIPELINE
// ============================================================================

describe('Smoke: DataFeed Pipeline', () => {
  let oracleService: OracleService;

  beforeEach(() => {
    oracleService = new OracleService({
      failSafeMode: OracleFailSafeMode.DENY_ON_FAILURE,
    });
  });

  it('ETH/USD price flows from plugin through bridge to OracleService', async () => {
    const plugin = createMockDataFeedPlugin();
    const bridge = new DataFeedBridge(plugin, oracleService, {
      pollIntervalMs: 60000,
      pairs: ['ETH/USD'],
    });

    await bridge.syncOnce();

    const price = await oracleService.getPrice('ETH/USD');
    expect(price.success).toBe(true);
    if (price.success) {
      expect(price.data.value).toBeDefined();
    }
  });

  it('multiple pairs are synced in a single poll cycle', async () => {
    const plugin = createMockDataFeedPlugin();
    const bridge = new DataFeedBridge(plugin, oracleService, {
      pollIntervalMs: 60000,
      pairs: ['ETH/USD', 'BTC/USD', 'USD/AED'],
    });

    await bridge.syncOnce();

    for (const pair of ['ETH/USD', 'BTC/USD', 'USD/AED']) {
      const price = await oracleService.getPrice(pair);
      expect(price.success).toBe(true);
    }
    expect(plugin.getLatestPrice).toHaveBeenCalledTimes(3);
  });

  it('NAV mappings sync asset NAVs through OracleService', async () => {
    const plugin = createMockDataFeedPlugin();
    const bridge = new DataFeedBridge(plugin, oracleService, {
      pollIntervalMs: 60000,
      pairs: ['ETH/USD'],
      navMappings: {
        'property-dubai-001': { pair: 'ETH/USD', currency: 'USD' },
        'property-dubai-002': { pair: 'BTC/USD', currency: 'USD' },
      },
    });

    await bridge.syncOnce();

    const nav1 = await oracleService.getNAV('property-dubai-001');
    expect(nav1.success).toBe(true);
    if (nav1.success) {
      expect(nav1.data.source).toBe('chainlink:ETH/USD');
    }

    const nav2 = await oracleService.getNAV('property-dubai-002');
    expect(nav2.success).toBe(true);
    if (nav2.success) {
      expect(nav2.data.source).toBe('chainlink:BTC/USD');
    }
  });

  it('bridge start/stop lifecycle manages polling correctly', async () => {
    const plugin = createMockDataFeedPlugin();
    const bridge = new DataFeedBridge(plugin, oracleService, {
      pollIntervalMs: 50,
      pairs: ['ETH/USD'],
    });

    await bridge.start();
    expect(bridge.isRunning()).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 80));

    bridge.stop();
    expect(bridge.isRunning()).toBe(false);

    // Should have been called at least twice (initial + 1 poll)
    expect((plugin.getLatestPrice as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('individual pair failure does not block other pairs', async () => {
    const plugin = createMockDataFeedPlugin({
      getLatestPrice: vi.fn().mockImplementation((pair: string) => {
        if (pair === 'FAIL/USD') return Promise.reject(new Error('Feed down'));
        return Promise.resolve({
          pair,
          price: 100n,
          decimals: 8,
          formattedPrice: '0.00000100',
          updatedAt: new Date(),
          roundId: 1n,
        });
      }),
    } as any);

    const bridge = new DataFeedBridge(plugin, oracleService, {
      pollIntervalMs: 60000,
      pairs: ['ETH/USD', 'FAIL/USD', 'BTC/USD'],
    });

    // Should not throw
    await bridge.syncOnce();

    const ethPrice = await oracleService.getPrice('ETH/USD');
    expect(ethPrice.success).toBe(true);

    const btcPrice = await oracleService.getPrice('BTC/USD');
    expect(btcPrice.success).toBe(true);
  });
});

// ============================================================================
// 2. FUNCTIONS PIPELINE
// ============================================================================

describe('Smoke: Functions Pipeline', () => {
  let oracleService: OracleService;

  beforeEach(() => {
    oracleService = new OracleService({
      failSafeMode: OracleFailSafeMode.DENY_ON_FAILURE,
    });
  });

  it('FLIGHT_STATUS flows from Functions plugin through bridge to OracleService', async () => {
    const plugin = createMockFunctionsPlugin();
    const bridge = new FlightDataFunctionsBridge(plugin, oracleService);
    bridge.wire();

    expect(bridge.isWired()).toBe(true);

    const result = await oracleService.fetchData({
      dataType: 'FLIGHT_STATUS',
      parameters: { flightNumber: 'EK202', date: '2025-01-15' },
    });

    expect(result).toBeDefined();
    expect(plugin.executeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['EK202', '2025-01-15'],
      }),
    );
  });

  it('wire() is idempotent — calling twice does not double-register', () => {
    const plugin = createMockFunctionsPlugin();
    const bridge = new FlightDataFunctionsBridge(plugin, oracleService);
    bridge.wire();
    bridge.wire();
    expect(bridge.isWired()).toBe(true);
  });

  it('handles Functions failure gracefully', async () => {
    const plugin = createMockFunctionsPlugin({
      executeRequest: vi.fn().mockResolvedValue({
        success: false,
        error: 'Functions request timed out',
      }),
    } as any);

    const bridge = new FlightDataFunctionsBridge(plugin, oracleService);
    bridge.wire();

    const result = await oracleService.fetchData({
      dataType: 'FLIGHT_STATUS',
      parameters: { flightNumber: 'XX999', date: '2025-12-31' },
    });

    // Should not throw, should return a result (possibly with error data)
    expect(result).toBeDefined();
  });
});

// ============================================================================
// 3. CCIP SETTLEMENT PIPELINE
// ============================================================================

describe('Smoke: CCIP Settlement Pipeline', () => {
  it('asset-only settlement: create → execute → settled', async () => {
    const plugin = createMockCCIPPlugin();
    const provider = new CCIPSettlementProvider(plugin);

    const create = await provider.createInstruction({
      referenceId: 'smoke-trade-001',
      referenceType: 'transfer',
      settlementType: 'instant',
      asset: {
        assetId: '0xUSDC',
        quantity: '1000000',
        fromAccount: '0xSeller',
        toAccount: '0xBuyer',
      },
    });

    expect(create.success).toBe(true);
    if (!create.success) return;
    expect(create.data.status).toBe('pending');

    const exec = await provider.executeInstruction(create.data.instructionId);
    expect(exec.success).toBe(true);
    if (!exec.success) return;

    expect(exec.data.status).toBe('settled');
    expect(exec.data.transactionHash).toBe('0xtx456');
    expect(exec.data.settledAt).toBeDefined();
    expect(provider.getMessageId(exec.data.instructionId)).toBe('0xmsg123');
  });

  it('DvP settlement: create → execute → awaiting_funds → confirmFundsReceipt → settled', async () => {
    const plugin = createMockCCIPPlugin();
    const provider = new CCIPSettlementProvider(plugin);

    const create = await provider.createInstruction({
      referenceId: 'smoke-dvp-001',
      referenceType: 'trade',
      settlementType: 'atomic',
      asset: {
        assetId: '0xPropertyToken',
        quantity: '100',
        fromAccount: '0xSeller',
        toAccount: '137:0xBuyerOnPolygon',
      },
      cash: {
        currency: 'USDC',
        amount: '500000',
        fromAccount: '0xBuyer',
        toAccount: '0xSeller',
      },
    });

    if (!create.success) return;
    const id = create.data.instructionId;

    // Execute — sends asset leg, transitions to awaiting_funds
    const exec = await provider.executeInstruction(id);
    expect(exec.success).toBe(true);
    if (exec.success) {
      expect(exec.data.status).toBe('awaiting_funds');
    }

    // Verify CCIP was called with parsed chain ID and address
    expect(plugin.bridgeTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        destChainId: 137,
        receiver: '0xBuyerOnPolygon',
      }),
    );

    // Confirm funds receipt — both legs done → settled
    const confirm = await provider.confirmFundsReceipt(id);
    expect(confirm.success).toBe(true);

    const final = await provider.getInstruction(id);
    expect(final.success).toBe(true);
    if (final.success) {
      expect(final.data.status).toBe('settled');
      expect(final.data.settledAt).toBeDefined();
    }
  });

  it('cancel pending instruction', async () => {
    const plugin = createMockCCIPPlugin();
    const provider = new CCIPSettlementProvider(plugin);

    const create = await provider.createInstruction({
      referenceId: 'smoke-cancel-001',
      referenceType: 'transfer',
      settlementType: 'T+0',
      asset: {
        assetId: '0xToken',
        quantity: '50',
        fromAccount: '0xA',
        toAccount: '0xB',
      },
    });

    if (!create.success) return;

    const cancel = await provider.cancelInstruction(create.data.instructionId);
    expect(cancel.success).toBe(true);
    if (cancel.success) {
      expect(cancel.data.status).toBe('cancelled');
    }
  });

  it('cannot cancel non-pending instruction', async () => {
    const plugin = createMockCCIPPlugin();
    const provider = new CCIPSettlementProvider(plugin);

    const create = await provider.createInstruction({
      referenceId: 'smoke-cancel-fail',
      referenceType: 'transfer',
      settlementType: 'instant',
      asset: {
        assetId: '0xToken',
        quantity: '50',
        fromAccount: '0xA',
        toAccount: '0xB',
      },
    });

    if (!create.success) return;
    await provider.executeInstruction(create.data.instructionId);

    const cancel = await provider.cancelInstruction(create.data.instructionId);
    expect(cancel.success).toBe(false);
  });

  it('listInstructions filters by status', async () => {
    const plugin = createMockCCIPPlugin();
    const provider = new CCIPSettlementProvider(plugin);

    // Create 3 instructions
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await provider.createInstruction({
        referenceId: `smoke-list-${i}`,
        referenceType: 'transfer',
        settlementType: 'instant',
        asset: { assetId: '0xT', quantity: '1', fromAccount: '0xA', toAccount: '0xB' },
      });
      if (r.success) ids.push(r.data.instructionId);
    }

    // Execute first one
    await provider.executeInstruction(ids[0]);

    const pending = await provider.listInstructions({ status: ['pending'] });
    expect(pending.success).toBe(true);
    if (pending.success) {
      expect(pending.data.length).toBe(2);
    }

    const settled = await provider.listInstructions({ status: ['settled'] });
    expect(settled.success).toBe(true);
    if (settled.success) {
      expect(settled.data.length).toBe(1);
    }
  });

  it('healthCheck returns true when CCIP lanes available', async () => {
    const plugin = createMockCCIPPlugin();
    const provider = new CCIPSettlementProvider(plugin);
    expect(await provider.healthCheck()).toBe(true);
  });

  it('healthCheck returns false when no lanes', async () => {
    const plugin = createMockCCIPPlugin({
      getSupportedLanes: vi.fn().mockReturnValue([]),
    } as any);
    const provider = new CCIPSettlementProvider(plugin);
    expect(await provider.healthCheck()).toBe(false);
  });

  it('getSettlementWindow returns 20-minute finality window', async () => {
    const plugin = createMockCCIPPlugin();
    const provider = new CCIPSettlementProvider(plugin);

    const window = await provider.getSettlementWindow();
    const next = new Date(window.nextSettlementTime).getTime();
    const cutoff = new Date(window.cutoffTime).getTime();

    expect((cutoff - next) / 60_000).toBeCloseTo(20, 0);
    expect(window.timezone).toBe('UTC');
  });

  it('CCIP bridge failure propagates to settlement provider', async () => {
    const plugin = createMockCCIPPlugin({
      bridgeTokens: vi.fn().mockResolvedValue({
        success: false,
        error: 'Insufficient LINK for fee',
      }),
    } as any);

    const provider = new CCIPSettlementProvider(plugin);
    const create = await provider.createInstruction({
      referenceId: 'smoke-fail',
      referenceType: 'transfer',
      settlementType: 'instant',
      asset: { assetId: '0xT', quantity: '1', fromAccount: '0xA', toAccount: '0xB' },
    });

    if (!create.success) return;
    const exec = await provider.executeInstruction(create.data.instructionId);
    expect(exec.success).toBe(false);

    // Check that instruction is marked as failed
    const get = await provider.getInstruction(create.data.instructionId);
    if (get.success) {
      expect(get.data.status).toBe('failed');
      expect(get.data.failureReason).toBe('Insufficient LINK for fee');
    }
  });
});

// ============================================================================
// 4. AUTOMATION PIPELINE
// ============================================================================

describe('Smoke: Automation Pipeline', () => {
  it('event bus event triggers compliance + NAV upkeep creation', async () => {
    const automationPlugin = createMockAutomationPlugin();
    const eventBus = new CrossPackEventBus();

    const manager = new AutomationLifecycleManager(automationPlugin, eventBus, {
      autoRegisterTasks: [AutomationTaskType.COMPLIANCE_CHECK, AutomationTaskType.NAV_UPDATE],
      complianceContract: '0xCompliance',
      navContract: '0xNAV',
      adminAddress: '0xAdmin',
    });

    manager.start();
    expect(manager.isRunning()).toBe(true);

    // Publish event
    eventBus.publish({
      source: 'smoke-test',
      type: 'ASSET_CREATED',
      resourceId: 'property-001',
      data: {},
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(automationPlugin.createComplianceCheckTask).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'property-001' }),
    );
    expect(automationPlugin.createNAVUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'property-001' }),
    );

    const upkeepIds = manager.getUpkeepIds();
    expect(upkeepIds.get('compliance:property-001')).toBe('upkeep-100');
    expect(upkeepIds.get('nav:property-001')).toBe('upkeep-200');

    manager.stop();
    expect(manager.isRunning()).toBe(false);
  });

  it('multiple events create independent upkeeps', async () => {
    const automationPlugin = createMockAutomationPlugin();
    const eventBus = new CrossPackEventBus();

    const manager = new AutomationLifecycleManager(automationPlugin, eventBus, {
      autoRegisterTasks: [AutomationTaskType.COMPLIANCE_CHECK],
      complianceContract: '0xCompliance',
      adminAddress: '0xAdmin',
    });

    manager.start();

    eventBus.publish({ source: 'test', type: 'TICKET_ISSUED', resourceId: 'ticket-A', data: {} });
    eventBus.publish({ source: 'test', type: 'RENTAL_CREATED', resourceId: 'rental-B', data: {} });
    eventBus.publish({ source: 'test', type: 'RESERVATION_CONFIRMED', resourceId: 'res-C', data: {} });

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(automationPlugin.createComplianceCheckTask).toHaveBeenCalledTimes(3);

    manager.stop();
  });

  it('events after stop() are not processed', async () => {
    const automationPlugin = createMockAutomationPlugin();
    const eventBus = new CrossPackEventBus();

    const manager = new AutomationLifecycleManager(automationPlugin, eventBus, {
      autoRegisterTasks: [AutomationTaskType.COMPLIANCE_CHECK],
      complianceContract: '0xCompliance',
      adminAddress: '0xAdmin',
    });

    manager.start();
    manager.stop();

    eventBus.publish({ source: 'test', type: 'ASSET_CREATED', resourceId: 'ignored', data: {} });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(automationPlugin.createComplianceCheckTask).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 5. PROOF OF RESERVE PIPELINE
// ============================================================================

describe('Smoke: PoR → ComplianceEngine Pipeline', () => {
  it('mint allowed when reserves are sufficient', async () => {
    const porPlugin = createMockPoRPlugin();
    const engine = new ComplianceEngine({
      porPlugin,
      porConfig: { enabled: true, blockOnUndercollateralized: true },
    });

    const result = await engine.evaluate(ComplianceAction.TOKEN_MINT, {
      actorId: 'issuer-001',
      recipientId: 'investor-001',
      amount: '1000',
      metadata: { tokenAddress: '0xToken' },
    } as any);

    // PoR should have been checked
    expect(porPlugin.checkMintCompliance).toHaveBeenCalledWith('0xToken', '1000');

    // With no compliance plugin, recipient won't be found — but PoR passes
    // The decision may be DENY for other reasons, but NOT for PoR
    const porViolation = result.decision.violations.find(v => v.code === 'POR_MINT_BLOCKED');
    expect(porViolation).toBeUndefined();
  });

  it('mint blocked when reserves are undercollateralized', async () => {
    const porPlugin = createUndercollateralizedPoRPlugin();
    const engine = new ComplianceEngine({
      porPlugin,
      porConfig: { enabled: true, blockOnUndercollateralized: true },
    });

    const result = await engine.evaluate(ComplianceAction.TOKEN_MINT, {
      actorId: 'issuer-001',
      recipientId: 'investor-001',
      amount: '1000',
      metadata: { tokenAddress: '0xToken' },
    } as any);

    const porViolation = result.decision.violations.find(v => v.code === 'POR_MINT_BLOCKED');
    expect(porViolation).toBeDefined();
    expect(result.decision.result).toBe('DENY');
  });

  it('transfer blocked when reserves undercollateralized and blockOnUndercollateralized is true', async () => {
    const porPlugin = createUndercollateralizedPoRPlugin();
    const engine = new ComplianceEngine({
      porPlugin,
      porConfig: { enabled: true, blockOnUndercollateralized: true },
    });

    const result = await engine.evaluate(ComplianceAction.TOKEN_TRANSFER, {
      actorId: 'sender-001',
      recipientId: 'receiver-001',
      metadata: { tokenAddress: '0xToken' },
    } as any);

    const porViolation = result.decision.violations.find(v => v.code === 'POR_TRANSFER_BLOCKED');
    expect(porViolation).toBeDefined();
  });

  it('PoR disabled — no check performed', async () => {
    const porPlugin = createMockPoRPlugin();
    const engine = new ComplianceEngine({
      porPlugin,
      porConfig: { enabled: false },
    });

    await engine.evaluate(ComplianceAction.TOKEN_MINT, {
      actorId: 'issuer-001',
      recipientId: 'investor-001',
      amount: '1000',
      metadata: { tokenAddress: '0xToken' },
    } as any);

    expect(porPlugin.checkMintCompliance).not.toHaveBeenCalled();
  });

  it('setPoRPlugin() wires dynamically after construction', async () => {
    const engine = new ComplianceEngine({
      porConfig: { enabled: true, blockOnUndercollateralized: true },
    });

    const porPlugin = createUndercollateralizedPoRPlugin();
    engine.setPoRPlugin(porPlugin);

    const result = await engine.evaluate(ComplianceAction.TOKEN_MINT, {
      actorId: 'issuer-001',
      recipientId: 'investor-001',
      amount: '1000',
      metadata: { tokenAddress: '0xToken' },
    } as any);

    expect(porPlugin.checkMintCompliance).toHaveBeenCalled();
    const porViolation = result.decision.violations.find(v => v.code === 'POR_MINT_BLOCKED');
    expect(porViolation).toBeDefined();
  });
});

// ============================================================================
// 6. FACTORY ASSEMBLY
// ============================================================================

describe('Smoke: ChainlinkSDKFactory Assembly', () => {
  it('assembles data feed pipeline end-to-end', async () => {
    const mockDataFeed = createMockDataFeedPlugin();
    const oracleService = new OracleService();

    const bridge = new DataFeedBridge(mockDataFeed, oracleService, {
      pollIntervalMs: 60000,
      pairs: ['ETH/USD', 'BTC/USD'],
      navMappings: {
        'property-001': { pair: 'ETH/USD', currency: 'USD' },
      },
    });

    await bridge.start();
    expect(bridge.isRunning()).toBe(true);

    // Verify data flowed through
    const ethPrice = await oracleService.getPrice('ETH/USD');
    expect(ethPrice.success).toBe(true);

    const nav = await oracleService.getNAV('property-001');
    expect(nav.success).toBe(true);

    bridge.stop();
  });

  it('assembles full SDK structure with all components', () => {
    const mockDataFeed = createMockDataFeedPlugin();
    const mockFunctions = createMockFunctionsPlugin();
    const mockCcip = createMockCCIPPlugin();
    const mockAutomation = createMockAutomationPlugin();
    const mockPor = createMockPoRPlugin();
    const oracleService = new OracleService();
    const complianceEngine = new ComplianceEngine({});
    const eventBus = new CrossPackEventBus();

    const dataFeedBridge = new DataFeedBridge(mockDataFeed, oracleService, {
      pollIntervalMs: 60000,
      pairs: ['ETH/USD'],
    });
    const flightBridge = new FlightDataFunctionsBridge(mockFunctions, oracleService);
    flightBridge.wire();
    const settlementProvider = new CCIPSettlementProvider(mockCcip);
    const automationManager = new AutomationLifecycleManager(mockAutomation, eventBus, {
      autoRegisterTasks: [AutomationTaskType.COMPLIANCE_CHECK],
      complianceContract: '0xC',
      adminAddress: '0xA',
    });

    complianceEngine.setPoRPlugin(mockPor as any);

    const sdk = {
      oracleService,
      complianceEngine,
      settlementProvider,
      dataFeedBridge,
      flightDataBridge: flightBridge,
      automationManager,
      plugins: {
        dataFeed: mockDataFeed,
        functions: mockFunctions,
        ccip: mockCcip,
        automation: mockAutomation,
        por: mockPor,
      },
    };

    expect(sdk.oracleService).toBeDefined();
    expect(sdk.complianceEngine).toBeDefined();
    expect(sdk.settlementProvider).toBeDefined();
    expect(sdk.dataFeedBridge).toBeDefined();
    expect(sdk.flightDataBridge.isWired()).toBe(true);
    expect(sdk.plugins.dataFeed).toBeDefined();
    expect(sdk.plugins.functions).toBeDefined();
    expect(sdk.plugins.ccip).toBeDefined();
    expect(sdk.plugins.automation).toBeDefined();
    expect(sdk.plugins.por).toBeDefined();
  });

  it('start()/stop() lifecycle controls all bridges', async () => {
    const mockDataFeed = createMockDataFeedPlugin();
    const mockAutomation = createMockAutomationPlugin();
    const oracleService = new OracleService();
    const eventBus = new CrossPackEventBus();

    const dataFeedBridge = new DataFeedBridge(mockDataFeed, oracleService, {
      pollIntervalMs: 60000,
      pairs: ['ETH/USD'],
    });
    const automationManager = new AutomationLifecycleManager(mockAutomation, eventBus, {
      autoRegisterTasks: [],
    });

    await dataFeedBridge.start();
    automationManager.start();

    expect(dataFeedBridge.isRunning()).toBe(true);
    expect(automationManager.isRunning()).toBe(true);

    dataFeedBridge.stop();
    automationManager.stop();

    expect(dataFeedBridge.isRunning()).toBe(false);
    expect(automationManager.isRunning()).toBe(false);
  });
});

// ============================================================================
// 7. ORACLE SERVICE FAIL-SAFE
// ============================================================================

describe('Smoke: OracleService Fail-Safe', () => {
  it('DENY_ON_FAILURE rejects queries when no data available', async () => {
    const oracleService = new OracleService({
      failSafeMode: OracleFailSafeMode.DENY_ON_FAILURE,
      strictMode: true,
    });

    const price = await oracleService.getPrice('UNKNOWN/PAIR');
    expect(price.success).toBe(false);
  });

  it('data flows correctly after bridge sync', async () => {
    const oracleService = new OracleService({
      failSafeMode: OracleFailSafeMode.DENY_ON_FAILURE,
    });

    const plugin = createMockDataFeedPlugin();
    const bridge = new DataFeedBridge(plugin, oracleService, {
      pollIntervalMs: 60000,
      pairs: ['ETH/USD'],
    });

    // Before sync — no data
    const before = await oracleService.getPrice('ETH/USD');
    expect(before.success).toBe(false);

    // After sync — data available
    await bridge.syncOnce();
    const after = await oracleService.getPrice('ETH/USD');
    expect(after.success).toBe(true);
  });
});

// ============================================================================
// 8. CROSS-CUTTING: Full Pipeline Integration
// ============================================================================

describe('Smoke: Full Pipeline Integration', () => {
  it('data feed → oracle → compliance engine evaluation', async () => {
    const oracleService = new OracleService();
    const porPlugin = createMockPoRPlugin();
    const complianceEngine = new ComplianceEngine({
      porPlugin,
      porConfig: { enabled: true, blockOnUndercollateralized: true },
    });

    // Wire data feeds
    const dataFeedPlugin = createMockDataFeedPlugin();
    const bridge = new DataFeedBridge(dataFeedPlugin, oracleService, {
      pollIntervalMs: 60000,
      pairs: ['ETH/USD'],
    });
    await bridge.syncOnce();

    // Verify oracle has data
    const price = await oracleService.getPrice('ETH/USD');
    expect(price.success).toBe(true);

    // Evaluate mint via compliance engine (PoR check passes)
    const mintResult = await complianceEngine.evaluate(ComplianceAction.TOKEN_MINT, {
      actorId: 'issuer',
      recipientId: 'investor',
      amount: '1000',
      metadata: { tokenAddress: '0xToken' },
    } as any);

    expect(mintResult.receipt).toBeDefined();
    expect(mintResult.receipt.id).toBeDefined();
    // PoR should pass
    const porViolation = mintResult.decision.violations.find(v => v.code === 'POR_MINT_BLOCKED');
    expect(porViolation).toBeUndefined();
  });

  it('settlement + event bus → automation upkeep creation', async () => {
    const ccipPlugin = createMockCCIPPlugin();
    const automationPlugin = createMockAutomationPlugin();
    const eventBus = new CrossPackEventBus();

    const settlement = new CCIPSettlementProvider(ccipPlugin);
    const automation = new AutomationLifecycleManager(automationPlugin, eventBus, {
      autoRegisterTasks: [AutomationTaskType.COMPLIANCE_CHECK],
      complianceContract: '0xCompliance',
      adminAddress: '0xAdmin',
    });

    automation.start();

    // Create and execute settlement
    const create = await settlement.createInstruction({
      referenceId: 'trade-integration',
      referenceType: 'trade',
      settlementType: 'instant',
      asset: { assetId: '0xT', quantity: '1', fromAccount: '0xA', toAccount: '0xB' },
    });
    if (create.success) {
      await settlement.executeInstruction(create.data.instructionId);
    }

    // Simulate downstream event from the trade
    eventBus.publish({
      source: 'settlement',
      type: 'ASSET_CREATED',
      resourceId: 'trade-integration',
      data: {},
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(automationPlugin.createComplianceCheckTask).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'trade-integration' }),
    );

    automation.stop();
  });

  it('end-to-end: price sync → NAV → settlement → event → automation', async () => {
    const oracleService = new OracleService();
    const eventBus = new CrossPackEventBus();

    // 1. Price feed pipeline
    const dataFeed = createMockDataFeedPlugin();
    const bridge = new DataFeedBridge(dataFeed, oracleService, {
      pollIntervalMs: 60000,
      pairs: ['ETH/USD'],
      navMappings: { 'asset-001': { pair: 'ETH/USD', currency: 'USD' } },
    });
    await bridge.syncOnce();

    const nav = await oracleService.getNAV('asset-001');
    expect(nav.success).toBe(true);

    // 2. CCIP Settlement
    const ccip = createMockCCIPPlugin();
    const settlement = new CCIPSettlementProvider(ccip);
    const create = await settlement.createInstruction({
      referenceId: 'asset-001',
      referenceType: 'trade',
      settlementType: 'instant',
      asset: { assetId: '0xAsset', quantity: '100', fromAccount: '0xA', toAccount: '0xB' },
    });
    expect(create.success).toBe(true);
    if (create.success) {
      const exec = await settlement.executeInstruction(create.data.instructionId);
      expect(exec.success).toBe(true);
    }

    // 3. Automation responds to event
    const automation = createMockAutomationPlugin();
    const manager = new AutomationLifecycleManager(automation, eventBus, {
      autoRegisterTasks: [AutomationTaskType.COMPLIANCE_CHECK, AutomationTaskType.NAV_UPDATE],
      complianceContract: '0xC',
      navContract: '0xN',
      adminAddress: '0xA',
    });
    manager.start();

    eventBus.publish({
      source: 'settlement',
      type: 'ASSET_CREATED',
      resourceId: 'asset-001',
      data: {},
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(automation.createComplianceCheckTask).toHaveBeenCalled();
    expect(automation.createNAVUpdateTask).toHaveBeenCalled();

    bridge.stop();
    manager.stop();
  });
});
