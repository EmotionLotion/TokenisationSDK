/**
 * Chainlink Plugin Exports
 *
 * Provides Chainlink integrations for price feeds, automation, monitoring,
 * and cross-chain transfers.
 */

// Shared configuration and validation
export {
  // Validation schemas
  EthereumAddressSchema,
  RpcUrlSchema,
  PrivateKeySchema,
  ChainIdSchema,
  FlexibleChainIdSchema,
  BaseChainlinkConfigSchema,
  DataFeedConfigSchema,
  AutomationConfigSchema,
  CCIPBridgeConfigSchema,
  LinkManagerConfigSchema,
  FunctionsConfigSchema,
  OracleMonitorConfigSchema,
  // Validation functions
  validateChainlinkConfig,
  validateDataFeedConfig,
  validateAutomationConfig,
  validateCCIPBridgeConfig,
  validateLinkManagerConfig,
  validateFunctionsConfig,
  validateOracleMonitorConfig,
  // Utilities
  isChainlinkSupportedChain,
  getChainlinkChainName,
  isTestnet,
  SUPPORTED_CHAINLINK_CHAINS,
  // Types
  type BaseChainlinkConfig,
  type ValidatedDataFeedConfig,
  type ValidatedAutomationConfig,
  type ValidatedCCIPBridgeConfig,
  type ValidatedLinkManagerConfig,
  type ValidatedFunctionsConfig,
  type ValidatedOracleMonitorConfig,
  type SupportedChainlinkChainId,
} from './ChainlinkConfig.js';

export {
  DataFeedPlugin,
  createDataFeedPlugin,
  createBaseDataFeedPlugin,
  createPolygonDataFeedPlugin,
  createEthereumDataFeedPlugin,
  type DataFeedPluginConfig,
  type PriceData,
} from './DataFeedPlugin.js';

export {
  CCIPBridgePlugin,
  createCCIPBridgePlugin,
  createBaseCCIPBridge,
  createPolygonCCIPBridge,
  createEthereumCCIPBridge,
  type CCIPBridgeConfig,
  type CCIPMessage,
  type CCIPTransferParams,
  type CCIPTransferResult,
} from './CCIPBridgePlugin.js';

export {
  ChainlinkFunctionsPlugin,
  createFunctionsPlugin,
  createBaseSepoliaFunctionsPlugin,
  createSepoliaFunctionsPlugin,
  type FunctionsPluginConfig,
  type FunctionsRequest,
  type FunctionsResponse,
  type SafetyScoreResult,
  type CarbonOffsetResult,
  type DLDVerificationResult,
} from './FunctionsPlugin.js';

export {
  LinkManagerPlugin,
  createLinkManager,
  createSepoliaLinkManager,
  createBaseSepoliaLinkManager,
  type LinkManagerConfig,
  type LinkBalanceAlert,
  type SubscriptionBalance,
  type UpkeepBalance,
  type FundingEstimate,
} from './LinkManagerPlugin.js';

export {
  ChainlinkAutomationPlugin,
  createAutomationPlugin,
  createSepoliaAutomationPlugin,
  createBaseSepoliaAutomationPlugin,
  TriggerType,
  AutomationTaskType,
  type AutomationPluginConfig,
  type UpkeepRegistration,
  type UpkeepInfo,
  type AutomationTask,
  type PerformanceLog,
} from './AutomationPlugin.js';

export {
  OracleMonitorPlugin,
  createOracleMonitor,
  createSepoliaOracleMonitor,
  createBaseSepoliaOracleMonitor,
  OracleType,
  HealthStatus,
  AlertSeverity,
  type OracleMonitorConfig,
  type MonitoredOracle,
  type OracleHealthCheck,
  type OracleAlert,
  type WebhookPayload,
} from './OracleMonitorPlugin.js';

export {
  OracleAggregator,
  createOracleAggregator,
  createPrimaryFallbackAggregator,
  createConsensusAggregator,
  AggregationStrategy,
  type OracleSource,
  type OracleAggregatorConfig,
  type AggregatedResult,
} from './OracleAggregator.js';

// ACE (Automated Compliance Engine) Plugin
export {
  ChainlinkAcePlugin,
  createAcePlugin,
  createBaseSepoliaAcePlugin,
  createSepoliaAcePlugin,
  createMumbaiAcePlugin,
  type AcePluginConfig,
  type PolicyResult,
  type FullComplianceResult,
} from './ChainlinkAcePlugin.js';

// Proof of Reserve (PoR) Plugin
export {
  ProofOfReservePlugin,
  createProofOfReservePlugin,
  createBaseSepoliaPoRPlugin,
  createSepoliaPoRPlugin,
  ReserveStatus,
  type ProofOfReservePluginConfig,
  type ReserveCheckResult,
  type ReserveConfig,
  type MintAllowance,
} from './ProofOfReservePlugin.js';
