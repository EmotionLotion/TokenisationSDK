/**
 * Chainlink Plugin Configuration
 *
 * Provides standardized configuration schemas and validation for all Chainlink plugins.
 * Ensures consistent configuration across data feeds, automation, CCIP, and other services.
 */

import { z } from 'zod';
import { ValidationError } from '../../errors/index.js';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Ethereum address validation schema
 */
export const EthereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format');

/**
 * RPC URL validation schema
 */
export const RpcUrlSchema = z
  .string()
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: 'Invalid RPC URL format' }
  );

/**
 * Private key validation schema (optional, validates format if provided)
 */
export const PrivateKeySchema = z
  .string()
  .regex(/^(0x)?[a-fA-F0-9]{64}$/, 'Invalid private key format')
  .optional();

/**
 * Supported chain IDs
 */
export const SUPPORTED_CHAINLINK_CHAINS = [
  1,       // Ethereum Mainnet
  137,     // Polygon Mainnet
  8453,    // Base Mainnet
  42161,   // Arbitrum One
  10,      // Optimism
  11155111, // Sepolia Testnet
  84532,   // Base Sepolia Testnet
  80001,   // Polygon Mumbai (deprecated)
] as const;

export type SupportedChainlinkChainId = typeof SUPPORTED_CHAINLINK_CHAINS[number];

/**
 * Chain ID validation schema
 */
export const ChainIdSchema = z
  .number()
  .int()
  .positive()
  .refine(
    (id) => SUPPORTED_CHAINLINK_CHAINS.includes(id as SupportedChainlinkChainId),
    { message: `Chain ID must be one of: ${SUPPORTED_CHAINLINK_CHAINS.join(', ')}` }
  );

/**
 * Flexible chain ID schema (allows any positive integer for custom chains)
 */
export const FlexibleChainIdSchema = z.number().int().positive();

// ============================================================================
// BASE CONFIGURATION
// ============================================================================

/**
 * Base Chainlink plugin configuration schema
 */
export const BaseChainlinkConfigSchema = z.object({
  chainId: FlexibleChainIdSchema,
  rpcUrl: RpcUrlSchema,
  privateKey: PrivateKeySchema,
});

export type BaseChainlinkConfig = z.infer<typeof BaseChainlinkConfigSchema>;

// ============================================================================
// PLUGIN-SPECIFIC SCHEMAS
// ============================================================================

/**
 * Data Feed Plugin configuration schema
 */
export const DataFeedConfigSchema = BaseChainlinkConfigSchema.extend({
  customFeeds: z.record(EthereumAddressSchema).optional(),
  cacheTimeMs: z.number().int().min(0).max(3600000).optional(), // Max 1 hour
}).omit({ privateKey: true });

export type ValidatedDataFeedConfig = z.infer<typeof DataFeedConfigSchema>;

/**
 * Automation Plugin configuration schema
 */
export const AutomationConfigSchema = BaseChainlinkConfigSchema;

export type ValidatedAutomationConfig = z.infer<typeof AutomationConfigSchema>;

/**
 * CCIP Bridge configuration schema
 */
export const CCIPBridgeConfigSchema = z.object({
  sourceChainId: FlexibleChainIdSchema,
  rpcUrl: RpcUrlSchema,
  privateKey: PrivateKeySchema,
});

export type ValidatedCCIPBridgeConfig = z.infer<typeof CCIPBridgeConfigSchema>;

/**
 * Link Manager configuration schema
 */
export const LinkManagerConfigSchema = BaseChainlinkConfigSchema.extend({
  alertThresholds: z.object({
    functionsSubscription: z.string().optional(),
    automationUpkeep: z.string().optional(),
    vrfSubscription: z.string().optional(),
  }).optional(),
  alertCallback: z.function().optional(),
});

export type ValidatedLinkManagerConfig = z.infer<typeof LinkManagerConfigSchema>;

/**
 * Functions Plugin configuration schema
 */
export const FunctionsConfigSchema = BaseChainlinkConfigSchema.extend({
  subscriptionId: z.number().int().positive().optional(),
  donId: z.string().min(1).optional(),
  gatewayUrl: z.string().url().optional(),
});

export type ValidatedFunctionsConfig = z.infer<typeof FunctionsConfigSchema>;

/**
 * Oracle Monitor configuration schema
 */
export const OracleMonitorConfigSchema = BaseChainlinkConfigSchema.omit({ privateKey: true }).extend({
  checkIntervalMs: z.number().int().min(1000).max(3600000).optional(),
  stalePriceThresholdSeconds: z.number().int().min(60).optional(),
  webhookUrl: z.string().url().optional(),
});

export type ValidatedOracleMonitorConfig = z.infer<typeof OracleMonitorConfigSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate configuration and throw ValidationError if invalid
 */
export function validateChainlinkConfig<T>(
  schema: z.ZodSchema<T>,
  config: unknown,
  pluginName: string
): T {
  const result = schema.safeParse(config);
  if (!result.success) {
    const firstError = result.error.errors[0];
    throw new ValidationError(
      `Invalid ${pluginName} configuration: ${firstError.message}`,
      {
        field: firstError.path.join('.'),
        constraints: { zodError: firstError.code },
      }
    );
  }
  return result.data;
}

/**
 * Validate data feed configuration
 */
export function validateDataFeedConfig(config: unknown): ValidatedDataFeedConfig {
  return validateChainlinkConfig(DataFeedConfigSchema, config, 'DataFeedPlugin');
}

/**
 * Validate automation configuration
 */
export function validateAutomationConfig(config: unknown): ValidatedAutomationConfig {
  return validateChainlinkConfig(AutomationConfigSchema, config, 'AutomationPlugin');
}

/**
 * Validate CCIP bridge configuration
 */
export function validateCCIPBridgeConfig(config: unknown): ValidatedCCIPBridgeConfig {
  return validateChainlinkConfig(CCIPBridgeConfigSchema, config, 'CCIPBridgePlugin');
}

/**
 * Validate link manager configuration
 */
export function validateLinkManagerConfig(config: unknown): ValidatedLinkManagerConfig {
  return validateChainlinkConfig(LinkManagerConfigSchema, config, 'LinkManagerPlugin');
}

/**
 * Validate functions configuration
 */
export function validateFunctionsConfig(config: unknown): ValidatedFunctionsConfig {
  return validateChainlinkConfig(FunctionsConfigSchema, config, 'FunctionsPlugin');
}

/**
 * Validate oracle monitor configuration
 */
export function validateOracleMonitorConfig(config: unknown): ValidatedOracleMonitorConfig {
  return validateChainlinkConfig(OracleMonitorConfigSchema, config, 'OracleMonitorPlugin');
}

// ============================================================================
// CHAIN UTILITIES
// ============================================================================

/**
 * Check if a chain ID is supported by Chainlink
 */
export function isChainlinkSupportedChain(chainId: number): chainId is SupportedChainlinkChainId {
  return SUPPORTED_CHAINLINK_CHAINS.includes(chainId as SupportedChainlinkChainId);
}

/**
 * Get chain name from chain ID
 */
export function getChainlinkChainName(chainId: number): string {
  const names: Record<number, string> = {
    1: 'Ethereum Mainnet',
    137: 'Polygon Mainnet',
    8453: 'Base Mainnet',
    42161: 'Arbitrum One',
    10: 'Optimism',
    11155111: 'Sepolia Testnet',
    84532: 'Base Sepolia Testnet',
    80001: 'Polygon Mumbai (deprecated)',
  };
  return names[chainId] || `Chain ${chainId}`;
}

/**
 * Check if chain is a testnet
 */
export function isTestnet(chainId: number): boolean {
  return [11155111, 84532, 80001].includes(chainId);
}
