/**
 * PackManifest — Declarative description of a vertical pack's capabilities
 *
 * Every vertical package (@tokenisation/pack-travel, @tokenisation/pack-realestate, etc.)
 * exports a manifest so the SDK can auto-discover what a pack provides.
 *
 * Inspired by Google Cloud client libraries: each service is self-describing
 * and the client library discovers capabilities at load time.
 *
 * @example
 * ```typescript
 * // @tokenisation/pack-realestate/manifest.ts
 * export const manifest: PackManifest = {
 *   id: 'realestate',
 *   version: '1.0.0',
 *   name: 'Real Estate Tokenization',
 *   description: 'UAE real estate with DLD integration, NAV, investor tiers',
 *   assetTypes: ['REAL_ESTATE', 'UAE_REAL_ESTATE'],
 *   rightTypes: ['OWNERSHIP'],
 *   extensions: {
 *     packs: ['./packs/UAERealEstate'],
 *     policies: ['./policies/uae-real-estate-v1'],
 *     workflows: ['tokenize-real-estate'],
 *   },
 * };
 * ```
 */

import { z } from 'zod';

// ============================================================================
// PACK MANIFEST SCHEMA
// ============================================================================

export const PackManifestSchema = z.object({
  /** Unique pack identifier (lowercase, kebab-case) */
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, 'Pack ID must be lowercase kebab-case'),

  /** Semver version string */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver (x.y.z)'),

  /** Human-readable name */
  name: z.string().min(1),

  /** Short description */
  description: z.string().min(1),

  /** Asset types this pack can tokenize */
  assetTypes: z.array(z.string()).default([]),

  /** Right types this pack uses (OWNERSHIP, ACCESS, BEHAVIOR, etc.) */
  rightTypes: z.array(z.string()).default([]),

  /** Chains this pack supports (by chainId) */
  chains: z.array(z.number()).default([]),

  /** Other pack IDs this pack depends on */
  requires: z.array(z.string()).default([]),

  /** Extension points this pack registers */
  extensions: z.object({
    /** AssetPack configurations to register */
    packs: z.array(z.string()).default([]),
    /** Compliance policies to register */
    policies: z.array(z.string()).default([]),
    /** Named workflows to register */
    workflows: z.array(z.string()).default([]),
    /** Server plugin entrypoints */
    serverPlugins: z.array(z.string()).default([]),
    /** Smart contract paths */
    contracts: z.array(z.string()).default([]),
    /** Adapter implementations */
    adapters: z.array(z.string()).default([]),
    /** UI component paths */
    uiComponents: z.array(z.string()).default([]),
  }).default({}),

  /** Arbitrary tags for discovery */
  tags: z.array(z.string()).default([]),
});

// ============================================================================
// TYPES
// ============================================================================

export type PackManifest = z.infer<typeof PackManifestSchema>;

/**
 * A loaded pack — the manifest plus the actual runtime extensions.
 * Vertical packages export a `load()` function that returns this.
 */
export interface LoadedPack {
  manifest: PackManifest;
  /** Called when the pack is loaded into an SDK instance */
  activate?: (context: PackActivationContext) => void | Promise<void>;
  /** Called when the pack is unloaded */
  deactivate?: () => void | Promise<void>;
}

/**
 * Context passed to a pack's activate() function.
 * Provides registration hooks into the SDK.
 */
export interface PackActivationContext {
  /** Register named workflows */
  registerWorkflow: (name: string, workflow: WorkflowDefinition) => void;
  /** Register asset packs */
  registerAssetPack: (pack: unknown) => void;
  /** Register compliance policies */
  registerPolicy: (policy: unknown) => void;
  /** Register server routes (if running in server context) */
  registerServerPlugin?: (plugin: unknown) => void;
}

/**
 * A workflow definition that a pack can register.
 * The WorkflowRegistry in core executes these generically.
 */
export interface WorkflowDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique workflow name (e.g., 'tokenize-real-estate') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Zod schema for input validation (optional) */
  inputSchema?: z.ZodType<TInput>;
  /** Step definitions */
  steps: WorkflowStepDefinition[];
  /** The actual execution function */
  execute: (input: TInput, context: WorkflowExecutionContext) => Promise<TOutput>;
}

export interface WorkflowStepDefinition {
  /** Step name for progress tracking */
  name: string;
  /** Human-readable description */
  description: string;
}

export interface WorkflowExecutionContext {
  /** Emit progress for the current step */
  emitProgress: (stepIndex: number, status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped', message?: string) => void;
  /** SDK reference for making API calls */
  sdk: unknown;
}

// ============================================================================
// PACK REGISTRY
// ============================================================================

/**
 * PackRegistry — Central registry for loaded vertical packs.
 *
 * @example
 * ```typescript
 * const registry = new PackRegistry();
 * await registry.load(travelPack);
 * await registry.load(realEstatePack);
 *
 * registry.list(); // ['travel', 'realestate']
 * registry.get('travel'); // LoadedPack
 * ```
 */
export class PackRegistry {
  private packs: Map<string, LoadedPack> = new Map();

  /**
   * Load a pack into the registry.
   * Validates the manifest and calls activate() if provided.
   */
  async load(pack: LoadedPack, context?: PackActivationContext): Promise<void> {
    const result = PackManifestSchema.safeParse(pack.manifest);
    if (!result.success) {
      const firstError = result.error.errors[0];
      throw new Error(
        `Invalid pack manifest for "${pack.manifest?.id ?? 'unknown'}": ${firstError.message} at ${firstError.path.join('.')}`
      );
    }

    const { id } = pack.manifest;

    if (this.packs.has(id)) {
      throw new Error(`Pack "${id}" is already loaded. Unload it first to reload.`);
    }

    // Check dependencies
    for (const dep of pack.manifest.requires) {
      if (!this.packs.has(dep)) {
        throw new Error(`Pack "${id}" requires "${dep}" which is not loaded. Load "${dep}" first.`);
      }
    }

    if (pack.activate && context) {
      await pack.activate(context);
    }

    this.packs.set(id, pack);
  }

  /**
   * Unload a pack from the registry.
   */
  async unload(packId: string): Promise<void> {
    const pack = this.packs.get(packId);
    if (!pack) {
      throw new Error(`Pack "${packId}" is not loaded.`);
    }

    // Check no other pack depends on this one
    for (const [otherId, otherPack] of this.packs) {
      if (otherId !== packId && otherPack.manifest.requires.includes(packId)) {
        throw new Error(`Cannot unload "${packId}" — "${otherId}" depends on it.`);
      }
    }

    if (pack.deactivate) {
      await pack.deactivate();
    }

    this.packs.delete(packId);
  }

  /**
   * Get a loaded pack by ID.
   */
  get(packId: string): LoadedPack | undefined {
    return this.packs.get(packId);
  }

  /**
   * List all loaded pack IDs.
   */
  list(): string[] {
    return Array.from(this.packs.keys());
  }

  /**
   * List all loaded pack manifests.
   */
  listManifests(): PackManifest[] {
    return Array.from(this.packs.values()).map(p => p.manifest);
  }

  /**
   * Check if a pack is loaded.
   */
  has(packId: string): boolean {
    return this.packs.has(packId);
  }

  /**
   * Find packs that support a given asset type.
   */
  findByAssetType(assetType: string): LoadedPack[] {
    return Array.from(this.packs.values()).filter(
      p => p.manifest.assetTypes.includes(assetType)
    );
  }

  /**
   * Find packs by tag.
   */
  findByTag(tag: string): LoadedPack[] {
    return Array.from(this.packs.values()).filter(
      p => p.manifest.tags.includes(tag)
    );
  }
}
