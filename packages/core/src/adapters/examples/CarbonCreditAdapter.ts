/**
 * @fileoverview Carbon Credit Asset Adapter
 *
 * Reference implementation for tokenizing carbon credits.
 * Supports voluntary and compliance carbon markets with registry integration.
 */

import type {
  IAssetAdapter,
  ValidationResult,
  AssetSchema,
  AssetContext,
  IssueContext,
  TransferContext,
  RedeemContext,
  PayoutContext,
  OperationResult,
  ExternalConnector,
  TokenStandard,
} from '../types.js';
import { ValidationError } from '../../errors/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type CarbonStandard = 'VCS' | 'GoldStandard' | 'CAR' | 'ACR' | 'CDM' | 'CORSIA';
export type ProjectType = 'reforestation' | 'renewable_energy' | 'energy_efficiency' | 'methane_capture' | 'blue_carbon' | 'direct_air_capture';
export type CreditStatus = 'issued' | 'transferred' | 'retired' | 'cancelled';

export interface CarbonCreditInput {
  projectName: string;
  projectId: string;
  standard: CarbonStandard;
  projectType: ProjectType;
  vintage: number; // Year the carbon offset occurred
  country: string;
  region?: string;
  methodology: string;
  verifier: string;
  quantity: number; // Number of credits (1 credit = 1 tonne CO2e)
  serialNumber?: string;
  registryUrl?: string;
  cobenefits?: string[];
  additionalCertifications?: string[];
  documents?: {
    verificationReport?: string;
    projectDesignDocument?: string;
    monitoringReport?: string;
  };
}

export interface CarbonCreditMetadata extends CarbonCreditInput {
  registryStatus: CreditStatus;
  tokenizedCredits: number;
  retiredCredits: number;
  lastVerificationDate?: string;
  sdgContributions?: number[]; // UN SDG goals
}

// ============================================================================
// ADAPTER IMPLEMENTATION
// ============================================================================

export class CarbonCreditAdapter implements IAssetAdapter<CarbonCreditInput, CarbonCreditMetadata> {
  readonly assetType = 'carbon_credit';
  readonly displayName = 'Carbon Credits';
  readonly supportedTokenStandards: TokenStandard[] = ['ERC-3643', 'ERC-20'];
  readonly defaultTokenStandard: TokenStandard = 'ERC-3643';

  // -------------------------------------------------------------------------
  // SCHEMA & VALIDATION
  // -------------------------------------------------------------------------

  validateAsset(input: CarbonCreditInput): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    // Required fields
    if (!input.projectName) {
      errors.push({
        field: 'projectName',
        code: 'REQUIRED',
        message: 'Project name is required',
      });
    }

    if (!input.projectId) {
      errors.push({
        field: 'projectId',
        code: 'REQUIRED',
        message: 'Registry project ID is required',
      });
    }

    if (!input.standard) {
      errors.push({
        field: 'standard',
        code: 'REQUIRED',
        message: 'Carbon standard is required',
      });
    }

    if (!input.vintage || input.vintage < 2000 || input.vintage > new Date().getFullYear()) {
      errors.push({
        field: 'vintage',
        code: 'INVALID',
        message: 'Vintage year must be between 2000 and current year',
      });
    }

    if (!input.quantity || input.quantity <= 0) {
      errors.push({
        field: 'quantity',
        code: 'INVALID',
        message: 'Credit quantity must be greater than 0',
      });
    }

    if (!input.methodology) {
      errors.push({
        field: 'methodology',
        code: 'REQUIRED',
        message: 'Verification methodology is required',
      });
    }

    if (!input.verifier) {
      errors.push({
        field: 'verifier',
        code: 'REQUIRED',
        message: 'Third-party verifier is required',
      });
    }

    // Warnings
    if (!input.serialNumber) {
      warnings.push({
        field: 'serialNumber',
        code: 'RECOMMENDED',
        message: 'Registry serial number is recommended for traceability',
      });
    }

    if (!input.documents?.verificationReport) {
      warnings.push({
        field: 'documents.verificationReport',
        code: 'RECOMMENDED',
        message: 'Verification report should be attached',
      });
    }

    // Vintage warnings (older credits may have lower value)
    const currentYear = new Date().getFullYear();
    if (input.vintage && currentYear - input.vintage > 5) {
      warnings.push({
        field: 'vintage',
        code: 'OLD_VINTAGE',
        message: 'Credits older than 5 years may have reduced market value',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  normalizeMetadata(raw: CarbonCreditInput): CarbonCreditMetadata {
    // Map project type to SDG contributions
    const sdgMap: Record<ProjectType, number[]> = {
      reforestation: [13, 15], // Climate Action, Life on Land
      renewable_energy: [7, 13], // Affordable Energy, Climate Action
      energy_efficiency: [7, 12, 13], // Affordable Energy, Responsible Consumption, Climate Action
      methane_capture: [12, 13], // Responsible Consumption, Climate Action
      blue_carbon: [13, 14], // Climate Action, Life Below Water
      direct_air_capture: [9, 13], // Industry Innovation, Climate Action
    };

    return {
      ...raw,
      registryStatus: 'issued',
      tokenizedCredits: 0,
      retiredCredits: 0,
      sdgContributions: sdgMap[raw.projectType] || [13],
    };
  }

  getSchema(): AssetSchema {
    return {
      type: 'object',
      required: ['projectName', 'projectId', 'standard', 'projectType', 'vintage', 'country', 'methodology', 'verifier', 'quantity'],
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the carbon offset project',
        },
        projectId: {
          type: 'string',
          description: 'Registry project identifier',
        },
        standard: {
          type: 'string',
          enum: ['VCS', 'GoldStandard', 'CAR', 'ACR', 'CDM', 'CORSIA'],
          description: 'Carbon standard/registry',
        },
        projectType: {
          type: 'string',
          enum: ['reforestation', 'renewable_energy', 'energy_efficiency', 'methane_capture', 'blue_carbon', 'direct_air_capture'],
          description: 'Type of carbon offset project',
        },
        vintage: {
          type: 'integer',
          minimum: 2000,
          description: 'Year the carbon offset occurred',
        },
        country: {
          type: 'string',
          description: 'Country where project is located',
        },
        region: {
          type: 'string',
          description: 'Region/state within country',
        },
        methodology: {
          type: 'string',
          description: 'Verification methodology used',
        },
        verifier: {
          type: 'string',
          description: 'Third-party verifier name',
        },
        quantity: {
          type: 'number',
          minimum: 1,
          description: 'Number of credits (1 credit = 1 tonne CO2e)',
        },
        serialNumber: {
          type: 'string',
          description: 'Registry serial number',
        },
        registryUrl: {
          type: 'string',
          description: 'URL to registry listing',
        },
        cobenefits: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional co-benefits (biodiversity, community, etc.)',
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE HOOKS
  // -------------------------------------------------------------------------

  async onBeforeCreate(context: AssetContext): Promise<OperationResult> {
    const metadata = context.metadata as unknown as CarbonCreditMetadata;

    // Verify project exists in registry
    console.log(`Verifying carbon project ${metadata.projectId} on ${metadata.standard}`);

    // In real implementation, call registry API to verify project
    return { success: true };
  }

  async onAfterCreate(context: AssetContext): Promise<void> {
    console.log(`Carbon credit asset created: ${context.assetId}`);
    // Create registry link, notify stakeholders
  }

  async onBeforeIssue(context: IssueContext): Promise<OperationResult> {
    const metadata = context.metadata as unknown as CarbonCreditMetadata;

    // Verify credits haven't been retired
    if (metadata.registryStatus === 'retired') {
      return {
        success: false,
        error: {
          code: 'CREDITS_RETIRED',
          message: 'These carbon credits have already been retired',
        },
      };
    }

    // Check quantity available
    const availableCredits = metadata.quantity - metadata.tokenizedCredits - metadata.retiredCredits;
    if (Number(context.amount) > availableCredits) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: `Only ${availableCredits} credits available for tokenization`,
        },
      };
    }

    return { success: true };
  }

  async onAfterIssue(context: IssueContext): Promise<void> {
    console.log(`Carbon credits tokenized: ${context.amount} credits to ${context.recipientAddress}`);
    // Update registry, emit event
  }

  async onBeforeTransfer(context: TransferContext): Promise<OperationResult> {
    // Carbon credits can typically be freely transferred
    return { success: true };
  }

  async onAfterTransfer(context: TransferContext): Promise<void> {
    console.log(`Carbon credit transfer: ${context.amount} credits from ${context.fromAddress} to ${context.toAddress}`);
  }

  async onBeforeRedeem(context: RedeemContext): Promise<OperationResult> {
    // Redemption = retirement in carbon markets
    console.log(`Processing carbon credit retirement request: ${context.amount} credits`);
    return { success: true };
  }

  async onAfterRedeem(context: RedeemContext): Promise<void> {
    console.log(`Carbon credits retired: ${context.amount} credits`);
    // Record retirement in registry, issue retirement certificate
  }

  async onBeforePayout(context: PayoutContext): Promise<OperationResult> {
    // Carbon credits don't typically have payouts unless it's a revenue-sharing structure
    return { success: true };
  }

  async onAfterPayout(context: PayoutContext): Promise<void> {
    console.log(`Carbon credit revenue distributed: ${context.totalAmount} ${context.currency}`);
  }

  // -------------------------------------------------------------------------
  // EXTERNAL CONNECTORS
  // -------------------------------------------------------------------------

  getConnectors(): ExternalConnector[] {
    return [
      {
        id: 'verra',
        name: 'Verra VCS Registry',
        type: 'registry',
        baseUrl: 'https://registry.verra.org/api',

        async healthCheck(): Promise<boolean> {
          return true;
        },

        async execute<T>(operation: string, params: Record<string, unknown>): Promise<T> {
          switch (operation) {
            case 'verifyProject':
              return { verified: true, projectName: params.projectId } as T;
            case 'checkRetirementStatus':
              return { retired: false } as T;
            case 'retireCredits':
              return { retirementId: 'VCS-RET-' + Date.now() } as T;
            default:
              throw new ValidationError(`Unknown Verra operation: ${operation}`, {
                field: 'operation',
                constraints: { allowedValues: 'verifyProject, checkRetirementStatus, retireCredits' },
              });
          }
        },
      },
      {
        id: 'goldstandard',
        name: 'Gold Standard Registry',
        type: 'registry',
        baseUrl: 'https://registry.goldstandard.org/api',

        async healthCheck(): Promise<boolean> {
          return true;
        },

        async execute<T>(operation: string, params: Record<string, unknown>): Promise<T> {
          switch (operation) {
            case 'verifyProject':
              return { verified: true } as T;
            case 'retireCredits':
              return { retirementId: 'GS-RET-' + Date.now() } as T;
            default:
              throw new ValidationError(`Unknown Gold Standard operation: ${operation}`, {
                field: 'operation',
                constraints: { allowedValues: 'verifyProject, retireCredits' },
              });
          }
        },
      },
    ];
  }
}

// Export singleton instance
export const carbonCreditAdapter = new CarbonCreditAdapter();
