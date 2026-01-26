/**
 * Tokenisation SDK - Server Entry Point
 *
 * Backend-only exports for Node.js server applications.
 * This entry point includes sensitive modules that should NEVER be used in browsers:
 * - SecretsManager (AWS, Vault, environment credentials)
 * - AdminAPI (system management, user administration)
 * - DatabaseAdapter (direct database access)
 * - AuditLog (server-side audit logging)
 * - WebhookQueue (server-side webhook processing)
 *
 * Use this import for Express, NestJS, or any Node.js backend:
 * ```typescript
 * import { SecretsManager, AdminAPIService } from '@tokenisation/sdk/server';
 * ```
 *
 * WARNING: Do not import this module in browser code. Use '@tokenisation/sdk/client' instead.
 *
 * @packageDocumentation
 */

// Warn if running in browser
if (typeof window !== 'undefined') {
  console.warn(
    '[@tokenisation/sdk/server] WARNING: Server-only module imported in browser environment. ' +
    'This may expose sensitive functionality. Use "@tokenisation/sdk/client" for browser applications.'
  );
}

// ============================================================================
// RE-EXPORT ALL CLIENT MODULES (server can use everything client can)
// ============================================================================
export * from './client.js';

// ============================================================================
// SERVER-ONLY MODULES
// ============================================================================

// Secrets Management (AWS, Vault, Environment)
export { SecretsManager } from './secrets/SecretsManager.js';

// Database Adapters
export {
  InMemoryDatabaseAdapter,
  PostgresDatabaseAdapter,
  MongoDatabaseAdapter,
  createDatabaseAdapter,
} from './storage/DatabaseAdapter.js';
export type {
  IDatabaseAdapter,
  ITransaction,
  QueryOptions,
  WhereClause,
  DatabaseRecord,
  PostgresConfig,
  MongoConfig,
  DatabaseType,
} from './storage/DatabaseAdapter.js';

// Storage Plugins (S3, IPFS)
export { S3StoragePlugin } from './plugins/storage/S3StoragePlugin.js';
export { IPFSStoragePlugin } from './plugins/storage/IPFSStoragePlugin.js';

// Admin API
export { AdminAPIService, createAdminRouterHandlers } from './api/AdminAPI.js';
export type {
  SystemStats,
  ApiKey as AdminApiKey,
  User as AdminUser,
  ComplianceReport,
  AssetAnalytics,
  CreateApiKeyParams,
  AdminRouterConfig,
} from './api/AdminAPI.js';

// API Plugins
export { ApiStoragePlugin } from './plugins/api/ApiStoragePlugin.js';
export { ApiEventStore } from './plugins/api/ApiEventStore.js';

// Audit Logging
export { AuditLogService, createAuditLogger, AuditAction } from './audit/AuditLog.js';
export type {
  AuditEntry,
  AuditQueryOptions,
  AuditContext,
} from './audit/AuditLog.js';

// Webhook Queue
export { WebhookQueue, getWebhookQueue, configureWebhookQueue, InMemoryWebhookStore } from './queue/WebhookQueue.js';
export type {
  WebhookDelivery as QueueWebhookDelivery,
  WebhookEvent,
  WebhookEndpoint as QueueWebhookEndpoint,
  WebhookQueueConfig,
  IWebhookStore,
} from './queue/WebhookQueue.js';

// Rate Limiting Middleware
export {
  RateLimiter,
  createRateLimitHeaders,
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  standardApiLimiter,
  strictLimiter,
  authLimiter,
  webhookLimiter,
} from './middleware/RateLimiter.js';
export type {
  RateLimitConfig,
  RateLimitResult,
  RateLimitInfo,
  RateLimitHeaders,
  IRateLimitStore,
} from './middleware/RateLimiter.js';

// Full Custody Manager (with write operations)
export {
  CustodyManager,
  custodyManager,
} from './core/CustodyManager.js';

// Full Indexing Engine (with indexing operations)
export {
  IndexingEngine,
  indexingEngine,
} from './core/IndexingEngine.js';

// Services (server-side operations)
export {
  AssetIssuanceService,
  AssetIssuanceError,
} from './services/AssetIssuanceService.js';
export type {
  AssetIssuanceServiceOptions,
} from './services/AssetIssuanceService.js';

export { ComplianceService } from './services/ComplianceService.js';
export { VerificationService } from './services/VerificationService.js';
export { OracleService } from './services/OracleService.js';
export { IndexingService } from './services/IndexingService.js';
export { DeploymentService } from './services/DeploymentService.js';
export { AttestationService } from './services/AttestationService.js';
export { TaxWithholdingService } from './services/TaxWithholdingService.js';
export { getHealthCheck } from './services/HealthCheck.js';

// Contract Adapters (full implementation for server-side operations)
export {
  ERC20Adapter,
  ERC721Adapter,
  ERC1155Adapter,
  ERC1410Adapter,
  ERC4626Adapter,
  SoulboundAdapter,
} from './contracts/index.js';

// Chainlink Plugins
export { DataFeedPlugin } from './plugins/chainlink/DataFeedPlugin.js';
export { ChainlinkAutomationPlugin, createAutomationPlugin } from './plugins/chainlink/AutomationPlugin.js';
export { CCIPBridgePlugin } from './plugins/chainlink/CCIPBridgePlugin.js';
export { ChainlinkFunctionsPlugin } from './plugins/chainlink/FunctionsPlugin.js';
export { OracleMonitorPlugin } from './plugins/chainlink/OracleMonitorPlugin.js';
export { OracleAggregator } from './plugins/chainlink/OracleAggregator.js';
export { LinkManagerPlugin } from './plugins/chainlink/LinkManagerPlugin.js';

// Chain Plugins
export { EVMChainPlugin } from './plugins/chain/EVMChainPlugin.js';
export { ChainRegistry } from './plugins/chain/ChainRegistry.js';

// Compliance Plugins (full server-side)
export { KYCCompliancePlugin } from './plugins/compliance/KYCCompliancePlugin.js';
export { MockCompliancePlugin } from './plugins/mocks/MockCompliancePlugin.js';

// Carbon Plugins
export { CarbonOraclePlugin } from './plugins/carbon/CarbonOraclePlugin.js';

// Mock Providers (for testing)
export * from './providers/index.js';

// Extension Modules (full server-side)
export {
  RightTypeRegistry,
  rightTypeRegistry,
  StateMachine,
  HookManager,
  hookManager,
  CashFlowEngine,
  GovernanceEngine,
  EscrowEngine,
} from './SDK.js';

// Ahoy Ecosystem (server-side)
export * from './ahoy/index.js';

// HTTP Utilities
export { HttpClient } from './utils/http.js';
