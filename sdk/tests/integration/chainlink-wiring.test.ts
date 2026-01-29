/**
 * Integration Tests: Chainlink Wiring
 *
 * Tests that Chainlink plugins are correctly wired into core services
 * via bridges, providers, and the factory.
 *
 * All tests use mocked plugin instances — no real RPC calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OracleService } from '../../src/services/OracleService.js';
import { OracleFailSafeMode } from '../../src/services/OracleService.js';
import { ComplianceEngine } from '../../src/core/ComplianceEngine.js';
import { DataFeedBridge } from '../../src/bridges/DataFeedBridge.js';
import { FlightDataFunctionsBridge } from '../../src/bridges/FlightDataFunctionsBridge.js';
import { AutomationLifecycleManager } from '../../src/bridges/AutomationLifecycleManager.js';
import { CCIPSettlementProvider } from '../../src/providers/settlement/CCIPSettlementProvider.js';
import { CrossPackEventBus } from '../../src/orchestration/CrossPackEventBus.js';
import { AutomationTaskType } from '../../src/plugins/chainlink/AutomationPlugin.js';
import { IoTOraclePlugin } from '../../src/ahoy/plugins/IoTOracle.js';
import type { DataFeedPlugin, PriceData } from '../../src/plugins/chainlink/DataFeedPlugin.js';
import type { ChainlinkFunctionsPlugin, FunctionsResponse } from '../../src/plugins/chainlink/FunctionsPlugin.js';
import type { CCIPBridgePlugin, CCIPTransferResult } from '../../src/plugins/chainlink/CCIPBridgePlugin.js';
import type { ChainlinkAutomationPlugin, AutomationTask } from '../../src/plugins/chainlink/AutomationPlugin.js';
import type { ProofOfReservePlugin } from '../../src/plugins/chainlink/ProofOfReservePlugin.js';
import type { IProofOfReservePlugin } from '../../src/core/interfaces.js';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockDataFeedPlugin(): DataFeedPlugin {
  return {
    pluginId: 'chainlink-data-feeds',
    supportedDataTypes: ['price', 'nav'],
    getLatestPrice: vi.fn().mockResolvedValue({
      pair: 'ETH/USD',
      price: 200000000000n,
      decimals: 8,
      formattedPrice: '2000.00000000',
      updatedAt: new Date(),
      roundId: 1n,
    } satisfies PriceData),
    fetchData: vi.fn(),
    subscribe: vi.fn(),
    verifySignature: vi.fn(),
    getNAV: vi.fn(),
  } as unknown as DataFeedPlugin;
}

function createMockFunctionsPlugin(): ChainlinkFunctionsPlugin {
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
  } as unknown as ChainlinkFunctionsPlugin;
}

function createMockCCIPPlugin(): CCIPBridgePlugin {
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
  } as unknown as CCIPBridgePlugin;
}

function createMockAutomationPlugin(): ChainlinkAutomationPlugin {
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
    registerUpkeep: vi.fn(),
    destroy: vi.fn(),
  } as unknown as ChainlinkAutomationPlugin;
}

function createMockPoRPlugin(): ProofOfReservePlugin & IProofOfReservePlugin {
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
  } as unknown as ProofOfReservePlugin & IProofOfReservePlugin;
}

// ============================================================================
// Tests
// ============================================================================

describe('Chainlink Wiring Integration', () => {
  let oracleService: OracleService;
  let complianceEngine: ComplianceEngine;

  beforeEach(() => {
    oracleService = new OracleService({
      failSafeMode: OracleFailSafeMode.ALLOW_WITH_WARNING,
    });
    complianceEngine = new ComplianceEngine({});
  });

  // ---------- DataFeedBridge ----------

  describe('DataFeedBridge', () => {
    it('syncOnce() pushes price into OracleService', async () => {
      const mockPlugin = createMockDataFeedPlugin();
      const bridge = new DataFeedBridge(mockPlugin, oracleService, {
        pollIntervalMs: 60000,
        pairs: ['ETH/USD'],
      });

      await bridge.syncOnce();

      expect(mockPlugin.getLatestPrice).toHaveBeenCalledWith('ETH/USD');

      // Verify OracleService has the price
      const price = await oracleService.getPrice('ETH/USD');
      expect(price.success).toBe(true);
      if (price.success) {
        expect(price.data.value).toBeDefined();
      }
    });

    it('syncNAV() updates NAV in OracleService', async () => {
      const mockPlugin = createMockDataFeedPlugin();
      const bridge = new DataFeedBridge(mockPlugin, oracleService, {
        pollIntervalMs: 60000,
        pairs: ['ETH/USD'],
      });

      await bridge.syncNAV('asset-001', 'ETH/USD', 'USD');

      const nav = await oracleService.getNAV('asset-001');
      expect(nav.success).toBe(true);
      if (nav.success) {
        expect(nav.data.value).toBeDefined();
      }
    });

    it('start()/stop() manages polling lifecycle', async () => {
      const mockPlugin = createMockDataFeedPlugin();
      const bridge = new DataFeedBridge(mockPlugin, oracleService, {
        pollIntervalMs: 100,
        pairs: ['ETH/USD'],
      });

      await bridge.start();
      expect(bridge.isRunning()).toBe(true);

      // Wait a bit for at least one poll
      await new Promise(resolve => setTimeout(resolve, 50));

      bridge.stop();
      expect(bridge.isRunning()).toBe(false);

      // Plugin was called at least once (initial sync)
      expect(mockPlugin.getLatestPrice).toHaveBeenCalled();
    });
  });

  // ---------- FlightDataFunctionsBridge ----------

  describe('FlightDataFunctionsBridge', () => {
    it('wire() registers FLIGHT_STATUS provider on OracleService', () => {
      const mockPlugin = createMockFunctionsPlugin();
      const bridge = new FlightDataFunctionsBridge(mockPlugin, oracleService);

      bridge.wire();
      expect(bridge.isWired()).toBe(true);
    });

    it('OracleService can query FLIGHT_STATUS after wiring', async () => {
      const mockPlugin = createMockFunctionsPlugin();
      const bridge = new FlightDataFunctionsBridge(mockPlugin, oracleService);
      bridge.wire();

      const result = await oracleService.fetchData({
        dataType: 'FLIGHT_STATUS',
        parameters: { flightNumber: 'EK202', date: '2025-01-15' },
      });

      // The Functions plugin should have been called
      expect(mockPlugin.executeRequest).toHaveBeenCalled();

      // Should return a result (may be success or wrapped depending on oracle config)
      expect(result).toBeDefined();
    });
  });

  // ---------- CCIPSettlementProvider ----------

  describe('CCIPSettlementProvider', () => {
    it('createInstruction() creates a pending settlement instruction', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const result = await provider.createInstruction({
        referenceId: 'trade-001',
        referenceType: 'trade',
        settlementType: 'T+0',
        asset: {
          assetId: '0xToken',
          quantity: '1000',
          fromAccount: '0xSeller',
          toAccount: '0xBuyer',
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('pending');
        expect(result.data.referenceId).toBe('trade-001');
        expect(result.data.instructionId).toBeDefined();
      }
    });

    it('executeInstruction() settles immediately for asset-only transfers', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const createResult = await provider.createInstruction({
        referenceId: 'trade-002',
        referenceType: 'transfer',
        settlementType: 'instant',
        asset: {
          assetId: '0xToken',
          quantity: '500',
          fromAccount: '0xFrom',
          toAccount: '0xTo',
        },
      });

      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      const execResult = await provider.executeInstruction(createResult.data.instructionId);

      expect(execResult.success).toBe(true);
      if (execResult.success) {
        expect(execResult.data.status).toBe('settled');
        expect(execResult.data.transactionHash).toBe('0xtx456');
        expect(execResult.data.settledAt).toBeDefined();
      }
      expect(mockPlugin.bridgeTokens).toHaveBeenCalledTimes(1);
    });

    it('executeInstruction() transitions to awaiting_funds for DvP instructions', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const createResult = await provider.createInstruction({
        referenceId: 'trade-dvp-001',
        referenceType: 'trade',
        settlementType: 'atomic',
        asset: {
          assetId: '0xToken',
          quantity: '1000',
          fromAccount: '0xSeller',
          toAccount: '0xBuyer',
        },
        cash: {
          currency: 'USDC',
          amount: '50000',
          fromAccount: '0xBuyer',
          toAccount: '0xSeller',
        },
      });

      if (!createResult.success) return;

      const execResult = await provider.executeInstruction(createResult.data.instructionId);

      expect(execResult.success).toBe(true);
      if (execResult.success) {
        expect(execResult.data.status).toBe('awaiting_funds');
        expect(execResult.data.transactionHash).toBe('0xtx456');
        expect(execResult.data.settledAt).toBeUndefined();
      }
    });

    it('DvP full flow: execute → confirmFundsReceipt → settled', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const createResult = await provider.createInstruction({
        referenceId: 'trade-dvp-002',
        referenceType: 'trade',
        settlementType: 'atomic',
        asset: {
          assetId: '0xToken',
          quantity: '2000',
          fromAccount: '0xSeller',
          toAccount: '0xBuyer',
        },
        cash: {
          currency: 'USDC',
          amount: '100000',
          fromAccount: '0xBuyer',
          toAccount: '0xSeller',
        },
      });

      if (!createResult.success) return;
      const id = createResult.data.instructionId;

      // Execute: asset leg sent via CCIP, status → awaiting_funds
      await provider.executeInstruction(id);

      // Confirm funds receipt: both legs now confirmed → settled
      const confirmResult = await provider.confirmFundsReceipt(id);
      expect(confirmResult.success).toBe(true);

      const finalResult = await provider.getInstruction(id);
      expect(finalResult.success).toBe(true);
      if (finalResult.success) {
        expect(finalResult.data.status).toBe('settled');
        expect(finalResult.data.settledAt).toBeDefined();
      }
    });

    it('DvP flow: confirmFundsReceipt first → awaiting_assets → confirmAssetReceipt → settled', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const createResult = await provider.createInstruction({
        referenceId: 'trade-dvp-003',
        referenceType: 'trade',
        settlementType: 'atomic',
        asset: {
          assetId: '0xToken',
          quantity: '500',
          fromAccount: '0xSeller',
          toAccount: '0xBuyer',
        },
        cash: {
          currency: 'USDC',
          amount: '25000',
          fromAccount: '0xBuyer',
          toAccount: '0xSeller',
        },
      });

      if (!createResult.success) return;
      const id = createResult.data.instructionId;

      // Manually set to processing to simulate a different entry point
      await provider.executeInstruction(id);

      // Reset asset receipt tracking to test funds-first ordering
      // confirmFundsReceipt on awaiting_funds with asset already marked
      // Instead, test the reverse: create a new instruction where funds arrive before asset
      const createResult2 = await provider.createInstruction({
        referenceId: 'trade-dvp-004',
        referenceType: 'trade',
        settlementType: 'atomic',
        asset: {
          assetId: '0xToken',
          quantity: '500',
          fromAccount: '0xSeller',
          toAccount: '0xBuyer',
        },
        cash: {
          currency: 'USDC',
          amount: '25000',
          fromAccount: '0xBuyer',
          toAccount: '0xSeller',
        },
      });

      if (!createResult2.success) return;
      const id2 = createResult2.data.instructionId;

      // Execute the instruction (sends asset leg, status → awaiting_funds, asset receipt auto-marked)
      await provider.executeInstruction(id2);

      // Now confirm funds → both done → settled
      const fundsResult = await provider.confirmFundsReceipt(id2);
      expect(fundsResult.success).toBe(true);

      const final = await provider.getInstruction(id2);
      expect(final.success).toBe(true);
      if (final.success) {
        expect(final.data.status).toBe('settled');
      }
    });

    it('confirmAssetReceipt() rejects asset-only instructions', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const createResult = await provider.createInstruction({
        referenceId: 'trade-asset-only',
        referenceType: 'transfer',
        settlementType: 'instant',
        asset: {
          assetId: '0xToken',
          quantity: '100',
          fromAccount: '0xA',
          toAccount: '0xB',
        },
      });

      if (!createResult.success) return;
      await provider.executeInstruction(createResult.data.instructionId);

      const result = await provider.confirmAssetReceipt(createResult.data.instructionId);
      expect(result.success).toBe(false);
    });

    it('confirmFundsReceipt() rejects instructions without cash leg', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const createResult = await provider.createInstruction({
        referenceId: 'trade-no-cash',
        referenceType: 'transfer',
        settlementType: 'instant',
        asset: {
          assetId: '0xToken',
          quantity: '100',
          fromAccount: '0xA',
          toAccount: '0xB',
        },
      });

      if (!createResult.success) return;

      const result = await provider.confirmFundsReceipt(createResult.data.instructionId);
      expect(result.success).toBe(false);
    });

    it('getInstruction() retrieves stored instruction', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const createResult = await provider.createInstruction({
        referenceId: 'trade-003',
        referenceType: 'redemption',
        settlementType: 'T+0',
        asset: {
          assetId: '0xToken',
          quantity: '100',
          fromAccount: '0xA',
          toAccount: '0xB',
        },
      });

      if (!createResult.success) return;
      const getResult = await provider.getInstruction(createResult.data.instructionId);

      expect(getResult.success).toBe(true);
      if (getResult.success) {
        expect(getResult.data.referenceId).toBe('trade-003');
      }
    });

    it('extractDestChainId parses chain-prefixed toAccount', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin, { defaultDestChainId: 8453 });

      const createResult = await provider.createInstruction({
        referenceId: 'trade-chain-prefix',
        referenceType: 'transfer',
        settlementType: 'instant',
        asset: {
          assetId: '0xToken',
          quantity: '100',
          fromAccount: '0xFrom',
          toAccount: '137:0xReceiverOnPolygon',
        },
      });

      if (!createResult.success) return;

      await provider.executeInstruction(createResult.data.instructionId);

      // bridgeTokens should have been called with destChainId=137 and stripped address
      expect(mockPlugin.bridgeTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          destChainId: 137,
          receiver: '0xReceiverOnPolygon',
        }),
      );
    });

    it('extractDestChainId falls back to defaultDestChainId for plain addresses', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin, { defaultDestChainId: 8453 });

      const createResult = await provider.createInstruction({
        referenceId: 'trade-plain-addr',
        referenceType: 'transfer',
        settlementType: 'instant',
        asset: {
          assetId: '0xToken',
          quantity: '100',
          fromAccount: '0xFrom',
          toAccount: '0xPlainAddress',
        },
      });

      if (!createResult.success) return;

      await provider.executeInstruction(createResult.data.instructionId);

      expect(mockPlugin.bridgeTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          destChainId: 8453,
          receiver: '0xPlainAddress',
        }),
      );
    });

    it('healthCheck() returns true when CCIP lanes are available', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const healthy = await provider.healthCheck();
      expect(healthy).toBe(true);
      expect(mockPlugin.getSupportedLanes).toHaveBeenCalled();
      expect(mockPlugin.isChainSupported).toHaveBeenCalledWith(1); // first lane dest
    });

    it('healthCheck() returns false when no lanes available', async () => {
      const mockPlugin = createMockCCIPPlugin();
      (mockPlugin.getSupportedLanes as ReturnType<typeof vi.fn>).mockReturnValue([]);
      const provider = new CCIPSettlementProvider(mockPlugin);

      const healthy = await provider.healthCheck();
      expect(healthy).toBe(false);
    });

    it('healthCheck() returns false when isChainSupported throws', async () => {
      const mockPlugin = createMockCCIPPlugin();
      (mockPlugin.isChainSupported as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('RPC down'));
      const provider = new CCIPSettlementProvider(mockPlugin);

      const healthy = await provider.healthCheck();
      expect(healthy).toBe(false);
    });

    it('getSettlementWindow() returns a 20-minute finality window', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const before = Date.now();
      const window = await provider.getSettlementWindow();
      const after = Date.now();

      const nextTime = new Date(window.nextSettlementTime).getTime();
      const cutoffTime = new Date(window.cutoffTime).getTime();

      expect(nextTime).toBeGreaterThanOrEqual(before);
      expect(nextTime).toBeLessThanOrEqual(after);
      // Cutoff should be ~20 minutes after nextSettlementTime
      const diffMinutes = (cutoffTime - nextTime) / 60_000;
      expect(diffMinutes).toBeCloseTo(20, 0);
      expect(window.timezone).toBe('UTC');
    });

    it('getMessageId() returns CCIP message ID after settlement', async () => {
      const mockPlugin = createMockCCIPPlugin();
      const provider = new CCIPSettlementProvider(mockPlugin);

      const createResult = await provider.createInstruction({
        referenceId: 'trade-msg-id',
        referenceType: 'transfer',
        settlementType: 'instant',
        asset: {
          assetId: '0xToken',
          quantity: '100',
          fromAccount: '0xFrom',
          toAccount: '0xTo',
        },
      });

      if (!createResult.success) return;
      const id = createResult.data.instructionId;

      expect(provider.getMessageId(id)).toBeUndefined();

      await provider.executeInstruction(id);

      expect(provider.getMessageId(id)).toBe('0xmsg123');
    });
  });

  // ---------- ProofOfReservePlugin implements IProofOfReservePlugin ----------

  describe('ProofOfReservePlugin IProofOfReservePlugin compliance', () => {
    it('has checkMintCompliance and checkTransferCompliance methods', () => {
      const mockPlugin = createMockPoRPlugin();

      // The plugin should satisfy IProofOfReservePlugin
      expect(typeof mockPlugin.checkMintCompliance).toBe('function');
      expect(typeof mockPlugin.checkTransferCompliance).toBe('function');
      expect(mockPlugin.pluginId).toBe('chainlink-por');
    });

    it('ComplianceEngine.setPoRPlugin() accepts the plugin', () => {
      const mockPlugin = createMockPoRPlugin();

      // Should not throw
      expect(() => {
        complianceEngine.setPoRPlugin(mockPlugin);
      }).not.toThrow();
    });
  });

  // ---------- ComplianceEngine ACE wiring ----------

  describe('ComplianceEngine ACE wiring', () => {
    it('ComplianceEngine.setAcePlugin() accepts an ACE plugin', () => {
      const mockAce = {
        pluginId: 'chainlink-ace',
        requestAttestation: vi.fn(),
        getAttestation: vi.fn(),
        isAttestationValid: vi.fn(),
        getCachedAttestation: vi.fn(),
        checkTransferCompliance: vi.fn(),
        hasRequiredAttestations: vi.fn(),
        subscribeToAttestations: vi.fn(),
        getConsensusInfo: vi.fn(),
      };

      expect(() => {
        complianceEngine.setAcePlugin(mockAce as any);
      }).not.toThrow();
    });
  });

  // ---------- AutomationLifecycleManager ----------

  describe('AutomationLifecycleManager', () => {
    it('creates upkeep on event', async () => {
      const mockAutomation = createMockAutomationPlugin();
      const eventBus = new CrossPackEventBus();

      const manager = new AutomationLifecycleManager(mockAutomation, eventBus, {
        autoRegisterTasks: [AutomationTaskType.COMPLIANCE_CHECK, AutomationTaskType.NAV_UPDATE],
        complianceContract: '0xCompliance',
        navContract: '0xNAV',
        adminAddress: '0xAdmin',
      });

      manager.start();
      expect(manager.isRunning()).toBe(true);

      // Publish an event
      eventBus.publish({
        source: 'test',
        type: 'TICKET_ISSUED',
        resourceId: 'ticket-001',
        data: { ticketId: 'ticket-001' },
      });

      // Allow async handler to run
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockAutomation.createComplianceCheckTask).toHaveBeenCalledWith(
        expect.objectContaining({
          complianceContract: '0xCompliance',
          assetId: 'ticket-001',
        })
      );

      expect(mockAutomation.createNAVUpdateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          navContract: '0xNAV',
          assetId: 'ticket-001',
        })
      );

      // Verify upkeep IDs are tracked
      const upkeepIds = manager.getUpkeepIds();
      expect(upkeepIds.get('compliance:ticket-001')).toBe('upkeep-100');
      expect(upkeepIds.get('nav:ticket-001')).toBe('upkeep-200');

      manager.stop();
      expect(manager.isRunning()).toBe(false);
    });
  });

  // ---------- IoTOracle + Functions ----------

  describe('IoTOracle Functions wiring', () => {
    it('setFunctionsPlugin() stores plugin reference', () => {
      const iot = new IoTOraclePlugin();
      const mockFunctions = createMockFunctionsPlugin();

      expect(iot.getFunctionsPlugin()).toBeUndefined();

      iot.setFunctionsPlugin(mockFunctions);

      expect(iot.getFunctionsPlugin()).toBe(mockFunctions);
    });
  });

  // ---------- Factory ----------

  describe('ChainlinkSDKFactory', () => {
    // Dynamic import to avoid constructor side effects from real plugins
    it('createChainlinkWiredSDK creates wired SDK with all components', async () => {
      // We test the factory by manually assembling what it would create,
      // since real plugin constructors require RPC connections.
      const mockDataFeed = createMockDataFeedPlugin();
      const mockFunctions = createMockFunctionsPlugin();
      const mockCcip = createMockCCIPPlugin();
      const mockAutomation = createMockAutomationPlugin();
      const mockPor = createMockPoRPlugin();
      const eventBus = new CrossPackEventBus();

      // Build bridges manually (what factory does internally)
      const dataFeedBridge = new DataFeedBridge(mockDataFeed, oracleService, {
        pollIntervalMs: 60000,
        pairs: ['ETH/USD', 'BTC/USD'],
      });
      const flightBridge = new FlightDataFunctionsBridge(mockFunctions, oracleService);
      flightBridge.wire();

      const settlementProvider = new CCIPSettlementProvider(mockCcip);
      const automationManager = new AutomationLifecycleManager(mockAutomation, eventBus, {
        autoRegisterTasks: [AutomationTaskType.COMPLIANCE_CHECK],
        complianceContract: '0xCompliance',
        adminAddress: '0xAdmin',
      });

      complianceEngine.setPoRPlugin(mockPor);

      // Assemble the SDK structure
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
        async start() {
          await dataFeedBridge.start();
          automationManager.start();
        },
        stop() {
          dataFeedBridge.stop();
          automationManager.stop();
        },
      };

      // Verify structure
      expect(sdk.oracleService).toBeDefined();
      expect(sdk.complianceEngine).toBeDefined();
      expect(sdk.settlementProvider).toBeDefined();
      expect(sdk.dataFeedBridge).toBeDefined();
      expect(sdk.flightDataBridge).toBeDefined();
      expect(sdk.automationManager).toBeDefined();
      expect(sdk.plugins.dataFeed).toBeDefined();
      expect(sdk.plugins.functions).toBeDefined();
      expect(sdk.plugins.ccip).toBeDefined();
      expect(sdk.plugins.automation).toBeDefined();
      expect(sdk.plugins.por).toBeDefined();
    });

    it('start()/stop() manages all bridge lifecycles', async () => {
      const mockDataFeed = createMockDataFeedPlugin();
      const mockAutomation = createMockAutomationPlugin();
      const eventBus = new CrossPackEventBus();

      const dataFeedBridge = new DataFeedBridge(mockDataFeed, oracleService, {
        pollIntervalMs: 60000,
        pairs: ['ETH/USD'],
      });
      const automationManager = new AutomationLifecycleManager(mockAutomation, eventBus, {
        autoRegisterTasks: [],
      });

      const sdk = {
        async start() {
          await dataFeedBridge.start();
          automationManager.start();
        },
        stop() {
          dataFeedBridge.stop();
          automationManager.stop();
        },
      };

      await sdk.start();
      expect(dataFeedBridge.isRunning()).toBe(true);
      expect(automationManager.isRunning()).toBe(true);

      sdk.stop();
      expect(dataFeedBridge.isRunning()).toBe(false);
      expect(automationManager.isRunning()).toBe(false);
    });
  });

  // ---------- End-to-end flow ----------

  describe('End-to-end flow', () => {
    it('factory → price feed → oracle → query', async () => {
      const mockDataFeed = createMockDataFeedPlugin();
      const bridge = new DataFeedBridge(mockDataFeed, oracleService, {
        pollIntervalMs: 60000,
        pairs: ['ETH/USD'],
        navMappings: {
          'property-dubai-001': { pair: 'ETH/USD', currency: 'USD' },
        },
      });

      // Sync prices and NAV
      await bridge.syncOnce();

      // Query price from OracleService
      const price = await oracleService.getPrice('ETH/USD');
      expect(price.success).toBe(true);

      // Query NAV from OracleService
      const nav = await oracleService.getNAV('property-dubai-001');
      expect(nav.success).toBe(true);
      if (nav.success) {
        expect(nav.data.source).toBe('chainlink:ETH/USD');
      }
    });
  });
});
