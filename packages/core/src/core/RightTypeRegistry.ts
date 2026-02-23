/**
 * Extensible Right Type Registry
 *
 * Allows developers to define custom right types beyond the built-in ones.
 * Each right type defines its behavior, transferability defaults, and validation rules.
 */

import { z } from 'zod';
import { TransferabilityMode } from './types.js';
import { ValidationError, SDKError, ErrorCode } from '../errors/index.js';

// ============================================================================
// RIGHT TYPE DEFINITION
// ============================================================================

/**
 * Behavior configuration for a right type
 */
export interface RightTypeBehavior {
  /** Whether the right is transferable by default */
  defaultTransferable: boolean;

  /** Whether the right can generate cash flows (dividends, royalties) */
  hasCashFlows: boolean;

  /** Whether the right grants voting power */
  hasVotingRights: boolean;

  /** Whether the right can be redeemed for underlying asset */
  isRedeemable: boolean;

  /** Whether the right expires */
  canExpire: boolean;

  /** Whether the right can be burned/retired */
  canBurn: boolean;

  /** Whether the right is divisible (fractional ownership) */
  isDivisible: boolean;

  /** Whether the right is fungible */
  isFungible: boolean;

  /** Default token standard for this right type */
  defaultTokenStandard: 'ERC20' | 'ERC721' | 'ERC1155' | 'ERC3643' | 'ERC4626' | 'ERC1410';

  /** Required metadata fields for this right type */
  requiredMetadata: string[];

  /** Optional metadata fields */
  optionalMetadata: string[];

  /** Custom validation function */
  validate?: (metadata: Record<string, unknown>) => boolean;
}

/**
 * Full definition of a right type
 */
export interface RightTypeDefinition {
  /** Unique identifier for this right type */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this right type represents */
  description: string;

  /** Category for grouping */
  category: 'ownership' | 'access' | 'financial' | 'governance' | 'verification' | 'custom';

  /** Behavior configuration */
  behavior: RightTypeBehavior;

  /** Default lifecycle states (can be customized) */
  defaultStates?: string[];

  /** Default state transitions */
  defaultTransitions?: Record<string, string[]>;

  /** Metadata schema (Zod schema) */
  metadataSchema?: z.ZodType<any>;

  /** Icon identifier for UI */
  icon?: string;

  /** Color for UI */
  color?: string;
}

// ============================================================================
// BUILT-IN RIGHT TYPES
// ============================================================================

export const BUILT_IN_RIGHT_TYPES: Record<string, RightTypeDefinition> = {
  // Existing types upgraded
  OWNERSHIP: {
    id: 'OWNERSHIP',
    name: 'Ownership Rights',
    description: 'Title/property ownership of an asset',
    category: 'ownership',
    behavior: {
      defaultTransferable: true,
      hasCashFlows: true,
      hasVotingRights: false,
      isRedeemable: true,
      canExpire: false,
      canBurn: true,
      isDivisible: true,
      isFungible: true,
      defaultTokenStandard: 'ERC3643',
      requiredMetadata: ['name'],
      optionalMetadata: ['description', 'valuation', 'location'],
    },
    icon: 'building',
    color: 'blue',
  },

  ACCESS: {
    id: 'ACCESS',
    name: 'Access Rights',
    description: 'Permission to access services, events, or content',
    category: 'access',
    behavior: {
      defaultTransferable: true,
      hasCashFlows: false,
      hasVotingRights: false,
      isRedeemable: true,
      canExpire: true,
      canBurn: true,
      isDivisible: false,
      isFungible: false,
      defaultTokenStandard: 'ERC721',
      requiredMetadata: ['name', 'accessType'],
      optionalMetadata: ['validFrom', 'validUntil', 'maxUses'],
    },
    icon: 'ticket',
    color: 'purple',
  },

  BEHAVIOR: {
    id: 'BEHAVIOR',
    name: 'Behavior/Reputation',
    description: 'Reputation scores, loyalty points, behavior tracking',
    category: 'verification',
    behavior: {
      defaultTransferable: false, // Soulbound by default
      hasCashFlows: false,
      hasVotingRights: false,
      isRedeemable: false,
      canExpire: true,
      canBurn: false,
      isDivisible: false,
      isFungible: false,
      defaultTokenStandard: 'ERC721',
      requiredMetadata: ['scoreType', 'currentScore'],
      optionalMetadata: ['maxScore', 'decayRate'],
    },
    icon: 'star',
    color: 'yellow',
  },

  VERIFICATION: {
    id: 'VERIFICATION',
    name: 'Verification/Certificate',
    description: 'Proofs, attestations, and certificates',
    category: 'verification',
    behavior: {
      defaultTransferable: false, // Soulbound by default
      hasCashFlows: false,
      hasVotingRights: false,
      isRedeemable: false,
      canExpire: true,
      canBurn: true,
      isDivisible: false,
      isFungible: false,
      defaultTokenStandard: 'ERC721',
      requiredMetadata: ['certificateType', 'issuingAuthority'],
      optionalMetadata: ['issueDate', 'expiryDate', 'verificationProof'],
    },
    icon: 'award',
    color: 'green',
  },

  // NEW FINANCIAL TYPES
  EQUITY: {
    id: 'EQUITY',
    name: 'Equity/Shares',
    description: 'Ownership stake with dividend and voting rights',
    category: 'financial',
    behavior: {
      defaultTransferable: true,
      hasCashFlows: true,
      hasVotingRights: true,
      isRedeemable: false,
      canExpire: false,
      canBurn: true,
      isDivisible: true,
      isFungible: true,
      defaultTokenStandard: 'ERC1410',
      requiredMetadata: ['name', 'symbol', 'shareClass'],
      optionalMetadata: ['dividendRate', 'votingWeight', 'preferenceRank'],
    },
    icon: 'trending-up',
    color: 'blue',
  },

  DEBT: {
    id: 'DEBT',
    name: 'Debt/Bond',
    description: 'Fixed income instrument with interest payments',
    category: 'financial',
    behavior: {
      defaultTransferable: true,
      hasCashFlows: true,
      hasVotingRights: false,
      isRedeemable: true,
      canExpire: true,
      canBurn: true,
      isDivisible: true,
      isFungible: true,
      defaultTokenStandard: 'ERC20',
      requiredMetadata: ['name', 'faceValue', 'couponRate', 'maturityDate'],
      optionalMetadata: ['paymentFrequency', 'callableDate'],
    },
    icon: 'credit-card',
    color: 'cyan',
  },

  REVENUE_SHARE: {
    id: 'REVENUE_SHARE',
    name: 'Revenue Share',
    description: 'Right to receive portion of revenue/royalties',
    category: 'financial',
    behavior: {
      defaultTransferable: true,
      hasCashFlows: true,
      hasVotingRights: false,
      isRedeemable: false,
      canExpire: true,
      canBurn: true,
      isDivisible: true,
      isFungible: true,
      defaultTokenStandard: 'ERC20',
      requiredMetadata: ['name', 'revenueSource', 'sharePercentage'],
      optionalMetadata: ['paymentSchedule', 'minimumPayout', 'capAmount'],
    },
    icon: 'pie-chart',
    color: 'orange',
  },

  ROYALTY: {
    id: 'ROYALTY',
    name: 'Royalty Rights',
    description: 'Ongoing royalty payments from IP or assets',
    category: 'financial',
    behavior: {
      defaultTransferable: true,
      hasCashFlows: true,
      hasVotingRights: false,
      isRedeemable: false,
      canExpire: true,
      canBurn: true,
      isDivisible: true,
      isFungible: true,
      defaultTokenStandard: 'ERC20',
      requiredMetadata: ['name', 'royaltySource', 'royaltyRate'],
      optionalMetadata: ['paymentSchedule', 'territories'],
    },
    icon: 'music',
    color: 'pink',
  },

  // GOVERNANCE TYPE
  GOVERNANCE: {
    id: 'GOVERNANCE',
    name: 'Governance Token',
    description: 'Voting and proposal rights for DAOs',
    category: 'governance',
    behavior: {
      defaultTransferable: true,
      hasCashFlows: false,
      hasVotingRights: true,
      isRedeemable: false,
      canExpire: false,
      canBurn: true,
      isDivisible: true,
      isFungible: true,
      defaultTokenStandard: 'ERC20',
      requiredMetadata: ['name', 'symbol'],
      optionalMetadata: ['votingWeight', 'delegatable', 'proposalThreshold'],
    },
    icon: 'vote',
    color: 'indigo',
  },

  // UTILITY TYPE
  UTILITY: {
    id: 'UTILITY',
    name: 'Utility Token',
    description: 'Access to platform services or features',
    category: 'access',
    behavior: {
      defaultTransferable: true,
      hasCashFlows: false,
      hasVotingRights: false,
      isRedeemable: true,
      canExpire: true,
      canBurn: true,
      isDivisible: true,
      isFungible: true,
      defaultTokenStandard: 'ERC20',
      requiredMetadata: ['name', 'symbol'],
      optionalMetadata: ['utilityType', 'exchangeRate'],
    },
    icon: 'zap',
    color: 'yellow',
  },

  // DERIVATIVE TYPE
  DERIVATIVE: {
    id: 'DERIVATIVE',
    name: 'Derivative/Option',
    description: 'Options, futures, or other derivative instruments',
    category: 'financial',
    behavior: {
      defaultTransferable: true,
      hasCashFlows: false,
      hasVotingRights: false,
      isRedeemable: true,
      canExpire: true,
      canBurn: true,
      isDivisible: true,
      isFungible: true,
      defaultTokenStandard: 'ERC20',
      requiredMetadata: ['name', 'underlyingAsset', 'strikePrice', 'expirationDate', 'optionType'],
      optionalMetadata: ['premium', 'exerciseStyle'],
    },
    icon: 'git-branch',
    color: 'red',
  },

  // COLLATERAL TYPE
  COLLATERAL: {
    id: 'COLLATERAL',
    name: 'Collateralized Asset',
    description: 'Asset used as collateral with lien tracking',
    category: 'financial',
    behavior: {
      defaultTransferable: false, // Locked during collateralization
      hasCashFlows: false,
      hasVotingRights: false,
      isRedeemable: true,
      canExpire: true,
      canBurn: true,
      isDivisible: true,
      isFungible: true,
      defaultTokenStandard: 'ERC20',
      requiredMetadata: ['name', 'collateralValue', 'loanToValue'],
      optionalMetadata: ['lienHolder', 'lienAmount', 'releaseConditions'],
    },
    icon: 'lock',
    color: 'gray',
  },

  // INSURANCE TYPE
  INSURANCE: {
    id: 'INSURANCE',
    name: 'Insurance Policy',
    description: 'Insurance coverage with claim mechanics',
    category: 'financial',
    behavior: {
      defaultTransferable: false,
      hasCashFlows: false,
      hasVotingRights: false,
      isRedeemable: true,
      canExpire: true,
      canBurn: true,
      isDivisible: false,
      isFungible: false,
      defaultTokenStandard: 'ERC721',
      requiredMetadata: ['policyType', 'coverage', 'premium', 'beneficiary'],
      optionalMetadata: ['deductible', 'terms', 'exclusions'],
    },
    icon: 'shield',
    color: 'teal',
  },
};

// ============================================================================
// RIGHT TYPE REGISTRY
// ============================================================================

/**
 * Registry for managing right types
 */
export class RightTypeRegistry {
  private static instance: RightTypeRegistry;
  private types: Map<string, RightTypeDefinition> = new Map();

  private constructor() {
    // Register built-in types
    Object.values(BUILT_IN_RIGHT_TYPES).forEach(type => {
      this.types.set(type.id, type);
    });
  }

  static getInstance(): RightTypeRegistry {
    if (!RightTypeRegistry.instance) {
      RightTypeRegistry.instance = new RightTypeRegistry();
    }
    return RightTypeRegistry.instance;
  }

  /**
   * Register a new right type
   */
  register(definition: RightTypeDefinition): void {
    if (this.types.has(definition.id)) {
      throw new SDKError(
        `Right type '${definition.id}' already exists`,
        ErrorCode.ALREADY_EXISTS,
        { details: { id: definition.id } }
      );
    }
    this.types.set(definition.id, definition);
  }

  /**
   * Override an existing right type
   */
  override(definition: RightTypeDefinition): void {
    this.types.set(definition.id, definition);
  }

  /**
   * Get a right type by ID
   */
  get(id: string): RightTypeDefinition | undefined {
    return this.types.get(id);
  }

  /**
   * Get all registered right types
   */
  getAll(): RightTypeDefinition[] {
    return Array.from(this.types.values());
  }

  /**
   * Get right types by category
   */
  getByCategory(category: RightTypeDefinition['category']): RightTypeDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  /**
   * Get transferable right types
   */
  getTransferable(): RightTypeDefinition[] {
    return this.getAll().filter(t => t.behavior.defaultTransferable);
  }

  /**
   * Get right types with cash flows
   */
  getWithCashFlows(): RightTypeDefinition[] {
    return this.getAll().filter(t => t.behavior.hasCashFlows);
  }

  /**
   * Get right types with voting rights
   */
  getWithVoting(): RightTypeDefinition[] {
    return this.getAll().filter(t => t.behavior.hasVotingRights);
  }

  /**
   * Check if a right type exists
   */
  has(id: string): boolean {
    return this.types.has(id);
  }

  /**
   * Remove a right type (except built-in)
   */
  remove(id: string): boolean {
    if (BUILT_IN_RIGHT_TYPES[id]) {
      throw new ValidationError(`Cannot remove built-in right type '${id}'`, {
        field: 'id',
        constraints: { immutable: 'true' },
      });
    }
    return this.types.delete(id);
  }

  /**
   * Validate metadata against right type schema
   */
  validateMetadata(rightTypeId: string, metadata: Record<string, unknown>): boolean {
    const rightType = this.get(rightTypeId);
    if (!rightType) {
      throw new SDKError(
        `Unknown right type: ${rightTypeId}`,
        ErrorCode.NOT_FOUND,
        { details: { rightTypeId } }
      );
    }

    // Check required fields
    for (const field of rightType.behavior.requiredMetadata) {
      if (metadata[field] === undefined || metadata[field] === null) {
        return false;
      }
    }

    // Run custom validation if provided
    if (rightType.behavior.validate) {
      return rightType.behavior.validate(metadata);
    }

    // Validate against Zod schema if provided
    if (rightType.metadataSchema) {
      return rightType.metadataSchema.safeParse(metadata).success;
    }

    return true;
  }

  /**
   * Get default transferability mode for a right type
   */
  getDefaultTransferability(rightTypeId: string): TransferabilityMode {
    const rightType = this.get(rightTypeId);
    if (!rightType) {
      throw new SDKError(
        `Unknown right type: ${rightTypeId}`,
        ErrorCode.NOT_FOUND,
        { details: { rightTypeId } }
      );
    }

    return rightType.behavior.defaultTransferable
      ? TransferabilityMode.COMPLIANCE_GATED
      : TransferabilityMode.NON_TRANSFERABLE;
  }
}

// Export singleton accessor
export const rightTypeRegistry = RightTypeRegistry.getInstance();
