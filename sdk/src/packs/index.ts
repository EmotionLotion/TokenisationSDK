/**
 * Reference Packs
 *
 * Pre-configured templates for common tokenization use cases.
 * These demonstrate how to use the SDK for specific asset types.
 */

// Asset Pack Registry - Pre-built configurations with lifecycle rules
export * from './AssetPackRegistry.js';

// Pack A: UAE Real Estate - OWNERSHIP Right
export * from './UAERealEstate.js';

// Jurisdiction-Specific Packs
// Real Estate Packs - Unified real estate tokenization with jurisdiction variants
export * from './real-estate.pack.js';

// Real Estate Lifecycle State Machine (11-state Stake.com model)
export * from './real-estate-lifecycle.js';

// Pack J: US Securities - SEC Regulation D compliant (506b/506c)
export * from './us-securities.pack.js';

// Cross-Pack Orchestration Layer
// Selective re-export to avoid AuditEntry conflict with audit/AuditLog
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

// Custom Condition Evaluators
// DLD Condition Evaluator - Dubai Land Department verification
export * from './DLDConditionEvaluator.js';

// VARA Condition Evaluator - UAE VARA regulatory compliance
export * from './VARAConditionEvaluator.js';

// AssetPack Lifecycle Manager - Wires pack rules to the engine
export * from './AssetPackLifecycleManager.js';
