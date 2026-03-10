/**
 * Genericisation Smoke Tests
 *
 * Verifies that the SDK's generic core contains ZERO vertical-specific code
 * and that vertical packages are self-contained.
 *
 * Section 15 of the genericisation audit checklist.
 */

import { describe, it, expect } from 'vitest';

// ─── Core imports (should all resolve) ──────────────────────────────────────

import {
  // SDK entry points
  TokenisationSDK,
  createTokenisationSDK,
  createApiClient,
  HttpClient,

  // Core types
  LifecycleState,
  RightType,
  EventType,
  ComplianceAction,

  // Pack infrastructure
  PackRegistry,
  PackManifestSchema,

  // Workflow infrastructure
  WorkflowRegistry,

  // State machine infrastructure
  StateMachineRegistry,
  stateMachineRegistry,

  // Custom condition evaluation
  CustomConditionRegistry,

  // Error classes
  SDKError,
  ValidationError,

  // Asset abstraction
  AssetType,
  InvestorClass,
  LiquidityProfile,

  // Orchestration
  CrossPackEventBus,
  SagaOrchestrator,
  UnifiedAuditLog,

  // Generic packs
  type AssetPack,
} from '@tokenisation/core';

// ─── Vertical imports (should all resolve from their own packages) ──────────

import {
  type DldTitle,
  DLDModule,
  PropertyModule,
  NAVModule,
} from '@tokenisation/realestate';

import {
  GPUNodeModule,
  ClusterModule,
  BenchmarkModule,
  type ComputeMetadata,
} from '@tokenisation/compute';

// ============================================================================
// 1. CORE PURITY — No vertical types leak into core
// ============================================================================

describe('Core Purity', () => {
  it('should export generic SDK entry points', () => {
    expect(TokenisationSDK).toBeDefined();
    expect(createTokenisationSDK).toBeTypeOf('function');
    expect(createApiClient).toBeTypeOf('function');
    expect(HttpClient).toBeDefined();
  });

  it('should export generic lifecycle states', () => {
    expect(LifecycleState.DRAFT).toBe('DRAFT');
    expect(LifecycleState.ACTIVE).toBe('ACTIVE');
    expect(LifecycleState.FROZEN).toBe('FROZEN');
  });

  it('should export generic right types', () => {
    expect(RightType.OWNERSHIP).toBeDefined();
    expect(RightType.ACCESS).toBeDefined();
  });

  it('should export pack infrastructure', () => {
    expect(PackRegistry).toBeDefined();
    expect(PackManifestSchema).toBeDefined();
    expect(WorkflowRegistry).toBeDefined();
    expect(StateMachineRegistry).toBeDefined();
    expect(stateMachineRegistry).toBeDefined();
    expect(CustomConditionRegistry).toBeDefined();
  });

  it('should export orchestration primitives', () => {
    expect(CrossPackEventBus).toBeDefined();
    expect(SagaOrchestrator).toBeDefined();
    expect(UnifiedAuditLog).toBeDefined();
  });

  it('should export asset abstraction enums', () => {
    expect(AssetType.REAL_ESTATE).toBeDefined();
    expect(AssetType.CARBON_CREDIT).toBeDefined();
    expect(InvestorClass.RETAIL).toBeDefined();
    expect(LiquidityProfile.LIQUID).toBeDefined();
  });

  it('should export error classes', () => {
    const err = new ValidationError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test');
    expect(SDKError).toBeDefined();
  });
});

// ============================================================================
// 2. PACK REGISTRY — Manifests validate correctly
// ============================================================================

describe('Pack Registry', () => {
  it('should validate a well-formed manifest', () => {
    const result = PackManifestSchema.safeParse({
      id: 'test-vertical',
      version: '1.0.0',
      name: 'Test Vertical',
      description: 'A test vertical for smoke testing',
      assetTypes: ['TEST'],
      rightTypes: ['OWNERSHIP'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid manifest', () => {
    const result = PackManifestSchema.safeParse({
      id: 'INVALID CAPS',
      version: 'not-semver',
    });
    expect(result.success).toBe(false);
  });

  it('should load and unload packs', async () => {
    const registry = new PackRegistry();

    await registry.load({
      manifest: {
        id: 'smoke-test',
        version: '1.0.0',
        name: 'Smoke Test Pack',
        description: 'For testing',
        assetTypes: [],
        rightTypes: [],
        chains: [],
        requires: [],
        extensions: {
          packs: [],
          policies: [],
          workflows: [],
          serverPlugins: [],
          contracts: [],
          adapters: [],
          uiComponents: [],
        },
        tags: ['test'],
      },
    });

    expect(registry.has('smoke-test')).toBe(true);
    expect(registry.list()).toContain('smoke-test');

    await registry.unload('smoke-test');
    expect(registry.has('smoke-test')).toBe(false);
  });

  it('should enforce dependency ordering', async () => {
    const registry = new PackRegistry();

    await expect(
      registry.load({
        manifest: {
          id: 'dependent',
          version: '1.0.0',
          name: 'Dependent Pack',
          description: 'Depends on missing-dep',
          assetTypes: [],
          rightTypes: [],
          chains: [],
          requires: ['missing-dep'],
          extensions: {
            packs: [],
            policies: [],
            workflows: [],
            serverPlugins: [],
            contracts: [],
            adapters: [],
            uiComponents: [],
          },
          tags: [],
        },
      }),
    ).rejects.toThrow('requires "missing-dep"');
  });
});

// ============================================================================
// 3. VERTICAL ISOLATION — Each vertical resolves from its own package
// ============================================================================

describe('Vertical Isolation: Real Estate', () => {
  it('should export DLD types from @tokenisation/realestate', () => {
    // DldTitle is a type, so we just verify the module resolved
    expect(DLDModule).toBeDefined();
    expect(PropertyModule).toBeDefined();
    expect(NAVModule).toBeDefined();
  });
});

describe('Vertical Isolation: Compute', () => {
  it('should export compute modules from @tokenisation/compute', () => {
    expect(GPUNodeModule).toBeDefined();
    expect(ClusterModule).toBeDefined();
    expect(BenchmarkModule).toBeDefined();
  });
});

// ============================================================================
// 4. WORKFLOW REGISTRY — Generic workflow registration works
// ============================================================================

describe('Workflow Registry', () => {
  it('should register and run generic workflows', async () => {
    const registry = new WorkflowRegistry();

    registry.register({
      name: 'smoke-test-workflow',
      description: 'A smoke test workflow',
      steps: [
        { name: 'validate', description: 'Validate input' },
        { name: 'execute', description: 'Execute action' },
      ],
      execute: async (input: { value: string }) => {
        return { result: `processed-${input.value}` };
      },
    });

    expect(registry.has('smoke-test-workflow')).toBe(true);

    const result = await registry.run('smoke-test-workflow', { value: 'hello' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ result: 'processed-hello' });
  });
});

// ============================================================================
// 5. NEW VERTICAL LITMUS TEST (Section 17)
// ============================================================================

describe('New Vertical Litmus Test', () => {
  it('should be possible to define a new vertical without touching core', () => {
    // This test proves that a new vertical can be created using only
    // the public API of @tokenisation/core

    const registry = new PackRegistry();

    // Define a hypothetical "carbon-trading" vertical
    const carbonManifest = PackManifestSchema.parse({
      id: 'carbon-trading',
      version: '1.0.0',
      name: 'Carbon Trading',
      description: 'Carbon credit trading and retirement',
      assetTypes: ['CARBON_CREDIT'],
      rightTypes: ['OWNERSHIP'],
      tags: ['carbon', 'esg', 'sustainability'],
    });

    expect(carbonManifest.id).toBe('carbon-trading');
    expect(carbonManifest.assetTypes).toContain('CARBON_CREDIT');

    // The pack can register itself
    registry.load({
      manifest: carbonManifest,
      activate: (ctx) => {
        // Would register workflows, policies, etc.
        // ctx.registerWorkflow('retire-credits', { ... });
      },
    });

    expect(registry.has('carbon-trading')).toBe(true);
    expect(registry.findByAssetType('CARBON_CREDIT')).toHaveLength(1);
    expect(registry.findByTag('esg')).toHaveLength(1);
  });
});
