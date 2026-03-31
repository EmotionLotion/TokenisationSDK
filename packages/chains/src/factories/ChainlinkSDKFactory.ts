/**
 * ChainlinkSDKFactory
 *
 * Top-level factory that wires all Chainlink plugins into core services
 * in a single createChainlinkWiredSDK() call.
 *
 * This is the main integration point: it instantiates plugins based on
 * config flags, creates bridges, wires them to core services, and returns
 * a unified object with start()/stop() lifecycle management.
 */

import { OracleService } from '../services/OracleService.js';
import { ComplianceEngine } from '@tokenisation/core';
import { DataFeedPlugin, type DataFeedPluginConfig } from '../plugins/chainlink/DataFeedPlugin.js';
import { ChainlinkFunctionsPlugin, type FunctionsPluginConfig } from '../plugins/chainlink/FunctionsPlugin.js';
import { CCIPBridgePlugin, type CCIPBridgeConfig } from '../plugins/chainlink/CCIPBridgePlugin.js';
import { ChainlinkAutomationPlugin, type AutomationTaskType } from '../plugins/chainlink/AutomationPlugin.js';
import { ChainlinkAcePlugin, type AcePluginConfig } from '../plugins/chainlink/ChainlinkAcePlugin.js';
import { ProofOfReservePlugin, type ProofOfReservePluginConfig } from '../plugins/chainlink/ProofOfReservePlugin.js';
import { OracleMonitorPlugin, type OracleMonitorConfig } from '../plugins/chainlink/OracleMonitorPlugin.js';
import { DataFeedBridge, type DataFeedBridgeConfig } from '../bridges/DataFeedBridge.js';
import { AutomationLifecycleManager, type AutomationLifecycleConfig } from '../bridges/AutomationLifecycleManager.js';
import { CCIPSettlementProvider } from '@tokenisation/core';
import type { CrossPackEventBus } from '@tokenisation/core';

// ============================================================================
// Configuration
// ============================================================================

export interface ChainlinkWiringConfig {
  /** Target chain ID */
  chainId: number;
  /** RPC endpoint URL */
  rpcUrl: string;
  /** Private key for signing transactions (optional) */
  privateKey?: string;

  /** Data feed configuration */
  dataFeeds?: {
    pairs: string[];
    pollIntervalMs?: number;
    navMappings?: Record<string, { pair: string; currency: string }>;
  };

  /** Chainlink Functions configuration */
  functions?: {
    subscriptionId: bigint;
    consumerAddress: string;
  };

  /** CCIP cross-chain bridge configuration */
  ccip?: {
    enabled: boolean;
    routerAddress?: string;
    chainSelector?: bigint;
  };

  /** Automation (Keepers) configuration */
  automation?: {
    autoRegisterTasks?: AutomationTaskType[];
    complianceContract?: string;
    navContract?: string;
    adminAddress?: string;
    /** Event bus for automation lifecycle (required for automation) */
    eventBus?: CrossPackEventBus;
  };

  /** ACE (Automated Compliance Engine) configuration */
  ace?: {
    routerAddress: string;
  };

  /** Proof of Reserve configuration */
  por?: {
    checkerAddress: string;
  };

  /** Oracle monitoring configuration */
  monitoring?: {
    webhookUrl?: string;
  };

  /** Pre-existing OracleService instance (optional; created if not provided) */
  oracleService?: OracleService;

  /** Pre-existing ComplianceEngine instance (optional; created if not provided) */
  complianceEngine?: ComplianceEngine;
}

// ============================================================================
// Wired SDK
// ============================================================================

export interface ChainlinkWiredSDK {
  /** Core services */
  oracleService: OracleService;
  complianceEngine: ComplianceEngine;

  /** Settlement provider (if CCIP enabled) */
  settlementProvider?: CCIPSettlementProvider;

  /** Bridges */
  dataFeedBridge?: DataFeedBridge;
  automationManager?: AutomationLifecycleManager;

  /** Raw plugin instances */
  plugins: {
    dataFeed?: DataFeedPlugin;
    functions?: ChainlinkFunctionsPlugin;
    ccip?: CCIPBridgePlugin;
    automation?: ChainlinkAutomationPlugin;
    ace?: ChainlinkAcePlugin;
    por?: ProofOfReservePlugin;
    monitor?: OracleMonitorPlugin;
  };

  /** Start all bridges and monitoring */
  start(): Promise<void>;
  /** Stop all bridges and monitoring */
  stop(): void;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a fully wired SDK with Chainlink plugins connected to core services.
 *
 * Each config section is optional. Only the plugins you configure will be
 * instantiated and wired. The returned object has start()/stop() lifecycle.
 */
export function createChainlinkWiredSDK(config: ChainlinkWiringConfig): ChainlinkWiredSDK {
  // Core services (use provided or create new)
  const oracleService = config.oracleService ?? new OracleService();
  const complianceEngine = config.complianceEngine ?? new ComplianceEngine({});

  // Plugin instances
  const plugins: ChainlinkWiredSDK['plugins'] = {};

  // Bridges and providers
  let dataFeedBridge: DataFeedBridge | undefined;
  let automationManager: AutomationLifecycleManager | undefined;
  let settlementProvider: CCIPSettlementProvider | undefined;

  // --- Data Feed Plugin + Bridge ---
  if (config.dataFeeds) {
    const dataFeedPlugin = new DataFeedPlugin({
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
    } as DataFeedPluginConfig);
    plugins.dataFeed = dataFeedPlugin;

    dataFeedBridge = new DataFeedBridge(dataFeedPlugin, oracleService, {
      pollIntervalMs: config.dataFeeds.pollIntervalMs ?? 30000,
      pairs: config.dataFeeds.pairs,
      navMappings: config.dataFeeds.navMappings,
    });
  }

  // --- Functions Plugin ---
  if (config.functions) {
    const functionsPlugin = new ChainlinkFunctionsPlugin({
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      subscriptionId: config.functions.subscriptionId,
      consumerAddress: config.functions.consumerAddress,
      privateKey: config.privateKey,
    });
    plugins.functions = functionsPlugin;
  }

  // --- CCIP Plugin + Settlement Provider ---
  if (config.ccip?.enabled) {
    const ccipPlugin = new CCIPBridgePlugin({
      sourceChainId: config.chainId,
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
    });
    plugins.ccip = ccipPlugin;

    settlementProvider = new CCIPSettlementProvider(ccipPlugin as any);
  }

  // --- Automation Plugin + Lifecycle Manager ---
  if (config.automation?.eventBus) {
    const automationPlugin = new ChainlinkAutomationPlugin({
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
    });
    plugins.automation = automationPlugin;

    automationManager = new AutomationLifecycleManager(
      automationPlugin,
      config.automation.eventBus,
      {
        autoRegisterTasks: config.automation.autoRegisterTasks ?? [],
        complianceContract: config.automation.complianceContract,
        navContract: config.automation.navContract,
        adminAddress: config.automation.adminAddress,
      }
    );
  }

  // --- ACE Plugin ---
  if (config.ace) {
    const acePlugin = new ChainlinkAcePlugin({
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      routerAddress: config.ace.routerAddress,
      privateKey: config.privateKey,
    });
    plugins.ace = acePlugin;

    complianceEngine.setAcePlugin(acePlugin);
  }

  // --- Proof of Reserve Plugin ---
  if (config.por) {
    const porPlugin = new ProofOfReservePlugin({
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      checkerAddress: config.por.checkerAddress,
      privateKey: config.privateKey,
    });
    plugins.por = porPlugin;

    complianceEngine.setPoRPlugin(porPlugin);
  }

  // --- Oracle Monitor Plugin ---
  if (config.monitoring) {
    const monitorPlugin = new OracleMonitorPlugin({
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      webhookUrl: config.monitoring.webhookUrl,
    } as OracleMonitorConfig);
    plugins.monitor = monitorPlugin;
  }

  // --- Lifecycle ---
  return {
    oracleService,
    complianceEngine,
    settlementProvider,
    dataFeedBridge,
    automationManager,
    plugins,

    async start(): Promise<void> {
      if (dataFeedBridge) {
        await dataFeedBridge.start();
      }
      if (automationManager) {
        automationManager.start();
      }
      if (plugins.monitor) {
        plugins.monitor.startMonitoring();
      }
    },

    stop(): void {
      if (dataFeedBridge) {
        dataFeedBridge.stop();
      }
      if (automationManager) {
        automationManager.stop();
      }
      if (plugins.monitor) {
        plugins.monitor.stopMonitoring();
      }
      // Destroy plugins that hold ethers event listeners / providers
      if (plugins.automation) {
        plugins.automation.destroy();
      }
      if (plugins.ace) {
        plugins.ace.disconnect();
      }
      if (plugins.dataFeed) {
        plugins.dataFeed.destroy();
      }
      if (plugins.ccip) {
        plugins.ccip.destroy();
      }
      if (plugins.por) {
        plugins.por.destroy();
      }
    },
  };
}
