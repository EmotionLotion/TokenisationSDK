/**
 * Reference Packs
 *
 * Generic, asset-class-agnostic pack infrastructure.
 * Vertical-specific packs live in their own packages:
 * - @tokenisation/realestate
 * - @tokenisation/compute
 */

// Pack Manifest — Declarative pack description and registry
export * from './PackManifest.js';

// Asset Pack Registry - Pre-built configurations with lifecycle rules
export * from './AssetPackRegistry.js';

// Cross-Pack Orchestration Layer
export * from '../orchestration/SharedIdentityRegistry.js';
export * from '../orchestration/CrossPackEventBus.js';
export * from '../orchestration/SagaOrchestrator.js';
export {
  type AuditEntry as OrchestrationAuditEntry,
  type AuditFilter,
  type IAuditLog,
  UnifiedAuditLog,
} from '../orchestration/UnifiedAuditLog.js';
export * from '../orchestration/PortableComplianceReceipt.js';
export * from '../orchestration/ScopedAuditView.js';

// AssetPack Lifecycle Manager - Wires pack rules to the engine
export * from './AssetPackLifecycleManager.js';

// EventTicket — Generic event access token
export * from './EventTicket.js';

// ServiceRightTemplate — Generic service right factory
export * from './ServiceRightTemplate.js';

// ============================================================================
// Vertical pack re-exports
// ============================================================================

/** GPU Compute pack — prefer importing from @tokenisation/compute directly */
export {
  type GPUComputeConfig,
  GPUComputePack,
  createGPUComputeToken,
} from './GPUCompute.js';
