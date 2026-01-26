/**
 * Ahoy Ecosystem Module
 *
 * Exports all Ahoy-specific types, packs, and plugins.
 */

// Types
export * from './types.js';

// Packs
export { FlyPlusPassPack, createFlyPlusPass, createAllTierPasses } from './packs/FlyPlusPass.js';
export { DriverReputationPack, registerCometDriver, simulateDriverWeek } from './packs/DriverReputation.js';
export { AhoyTokenPack, initializeAhoyToken, createDemoUser, DEFAULT_AHOY_TOKEN_CONFIG } from './packs/AhoyToken.js';
export { H2OUtilityCreditPack, createWaterCreditProvider, simulateWaterDelivery } from './packs/H2OUtilityCredit.js';
export { DataStreamAccessPack, AlgorithmIPPack, createDataStreamAccess, registerRoutingAlgorithm } from './packs/DataStreamAccess.js';
export { ComputeCreditPack, AgentWalletPack, registerComputeNode, createRoutingAgent, simulateComputeWeek } from './packs/ComputeCredit.js';

// Plugins
export { TelematicsOraclePlugin } from './plugins/TelematicsOracle.js';
export { LoyaltyPlugin } from './plugins/LoyaltyPlugin.js';
export { IoTOraclePlugin } from './plugins/IoTOracle.js';

// Adapters (connect to real COMET app)
export * from './adapters/index.js';
