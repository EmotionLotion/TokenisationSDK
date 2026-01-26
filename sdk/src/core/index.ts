/**
 * Core module exports
 *
 * This module contains the fundamental types, interfaces, and enums
 * used throughout the Tokenisation SDK.
 *
 * Core Infrastructure:
 * - types: Result type, enums, base types
 * - interfaces: Plugin contracts (IStoragePlugin, ITokenAdapter, etc.)
 * - EventStore: Event sourcing and audit trail
 * - PolicyEvaluator: Compliance policy evaluation
 * - LifecycleEngine: Asset state management
 *
 * Compliance-First Architecture:
 * - ComplianceEngine: Central orchestrator for all compliance decisions
 * - DecisionReceipt: Immutable audit trail for compliance decisions
 * - PolicyHash: Policy versioning and cryptographic hashing
 *
 * Generic Extension System:
 * - RightTypeRegistry: Extensible right types (equity, debt, royalty, etc.)
 * - StateMachine: Configurable state transitions with guards/actions
 * - HookSystem: Pre/post lifecycle hooks for custom logic
 */

export * from './types.js';
export * from './interfaces.js';
export * from './EventStore.js';
export * from './PolicyEvaluator.js';
export * from './LifecycleEngine.js';
export * from './RightTypeRegistry.js';
export * from './StateMachine.js';
export * from './HookSystem.js';
export * from './ChainService.js';

// Compliance-First Architecture
export * from './PolicyHash.js';
export * from './DecisionReceipt.js';
export * from './ComplianceEngine.js';
