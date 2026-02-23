/**
 * @fileoverview Real Estate Asset Adapter Example
 *
 * This is a reference implementation showing how to create an asset adapter
 * for tokenized real estate.
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

export interface RealEstateInput {
  propertyType: 'residential' | 'commercial' | 'land' | 'industrial';
  address: {
    street: string;
    city: string;
    emirate?: string;
    country: string;
    postalCode?: string;
  };
  titleDeedNumber?: string;
  plotNumber?: string;
  buildingName?: string;
  unitNumber?: string;
  area: number;
  areaUnit: 'sqft' | 'sqm';
  valuation?: {
    amount: number;
    currency: string;
    date: string;
    valuerId?: string;
  };
  documents?: {
    titleDeed?: string;
    valuationReport?: string;
    floorPlan?: string;
  };
}

export interface RealEstateMetadata extends RealEstateInput {
  normalizedArea: number; // Always in sqm
  dldStatus?: 'pending' | 'verified' | 'disputed';
  dldTitleId?: string;
}

// ============================================================================
// ADAPTER IMPLEMENTATION
// ============================================================================

export class RealEstateAdapter implements IAssetAdapter<RealEstateInput, RealEstateMetadata> {
  readonly assetType = 'real_estate';
  readonly displayName = 'Real Estate';
  readonly supportedTokenStandards: TokenStandard[] = ['ERC-3643', 'ERC-1400'];
  readonly defaultTokenStandard: TokenStandard = 'ERC-3643';

  // -------------------------------------------------------------------------
  // SCHEMA & VALIDATION
  // -------------------------------------------------------------------------

  validateAsset(input: RealEstateInput): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    // Required fields
    if (!input.propertyType) {
      errors.push({
        field: 'propertyType',
        code: 'REQUIRED',
        message: 'Property type is required',
      });
    }

    if (!input.address) {
      errors.push({
        field: 'address',
        code: 'REQUIRED',
        message: 'Property address is required',
      });
    } else {
      if (!input.address.street) {
        errors.push({
          field: 'address.street',
          code: 'REQUIRED',
          message: 'Street address is required',
        });
      }
      if (!input.address.country) {
        errors.push({
          field: 'address.country',
          code: 'REQUIRED',
          message: 'Country is required',
        });
      }
    }

    if (!input.area || input.area <= 0) {
      errors.push({
        field: 'area',
        code: 'INVALID',
        message: 'Valid property area is required',
      });
    }

    // UAE-specific validation
    if (input.address?.country === 'AE') {
      if (!input.titleDeedNumber) {
        errors.push({
          field: 'titleDeedNumber',
          code: 'REQUIRED_FOR_UAE',
          message: 'Title deed number is required for UAE properties',
        });
      }
      if (!input.address.emirate) {
        errors.push({
          field: 'address.emirate',
          code: 'REQUIRED_FOR_UAE',
          message: 'Emirate is required for UAE properties',
        });
      }
    }

    // Warnings
    if (!input.valuation) {
      warnings.push({
        field: 'valuation',
        code: 'RECOMMENDED',
        message: 'Professional valuation is recommended before tokenization',
      });
    }

    if (!input.documents?.titleDeed) {
      warnings.push({
        field: 'documents.titleDeed',
        code: 'RECOMMENDED',
        message: 'Title deed document should be attached',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  normalizeMetadata(raw: RealEstateInput): RealEstateMetadata {
    // Convert area to sqm for consistency
    const normalizedArea = raw.areaUnit === 'sqft'
      ? raw.area * 0.092903
      : raw.area;

    return {
      ...raw,
      normalizedArea,
      dldStatus: raw.address.country === 'AE' ? 'pending' : undefined,
    };
  }

  getSchema(): AssetSchema {
    return {
      type: 'object',
      required: ['propertyType', 'address', 'area', 'areaUnit'],
      properties: {
        propertyType: {
          type: 'string',
          enum: ['residential', 'commercial', 'land', 'industrial'],
          description: 'Type of property',
        },
        address: {
          type: 'object',
          description: 'Property address',
        },
        titleDeedNumber: {
          type: 'string',
          description: 'Official title deed number',
        },
        plotNumber: {
          type: 'string',
          description: 'Plot/parcel number',
        },
        buildingName: {
          type: 'string',
          description: 'Building name (for units)',
        },
        unitNumber: {
          type: 'string',
          description: 'Unit number within building',
        },
        area: {
          type: 'number',
          minimum: 0,
          description: 'Property area',
        },
        areaUnit: {
          type: 'string',
          enum: ['sqft', 'sqm'],
          description: 'Unit of area measurement',
        },
        valuation: {
          type: 'object',
          description: 'Property valuation details',
        },
        documents: {
          type: 'object',
          description: 'Associated document references',
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE HOOKS
  // -------------------------------------------------------------------------

  async onBeforeCreate(context: AssetContext): Promise<OperationResult> {
    // For UAE properties, we could initiate DLD verification here
    if (context.jurisdiction === 'AE') {
      console.log(`Initiating DLD verification for asset ${context.assetId}`);
      // In real implementation, call DLD connector
    }

    return { success: true };
  }

  async onAfterCreate(context: AssetContext): Promise<void> {
    console.log(`Real estate asset created: ${context.assetId}`);
    // Could trigger notifications, create audit entry, etc.
  }

  async onBeforeIssue(context: IssueContext): Promise<OperationResult> {
    // Verify DLD status before issuing tokens
    const metadata = context.metadata as unknown as RealEstateMetadata;

    if (metadata.dldStatus && metadata.dldStatus !== 'verified') {
      return {
        success: false,
        error: {
          code: 'DLD_NOT_VERIFIED',
          message: 'Property must be verified with DLD before token issuance',
        },
      };
    }

    return { success: true };
  }

  async onAfterIssue(context: IssueContext): Promise<void> {
    console.log(`Tokens issued for property: ${context.amount} to ${context.recipientAddress}`);
    // Update cap table, notify registrar, etc.
  }

  async onBeforeTransfer(context: TransferContext): Promise<OperationResult> {
    // Additional real estate specific checks
    // e.g., check if there's a mortgage lien, ongoing dispute, etc.
    return { success: true };
  }

  async onAfterTransfer(context: TransferContext): Promise<void> {
    console.log(`Property token transfer: ${context.amount} from ${context.fromAddress} to ${context.toAddress}`);
    // Notify registrar of ownership change
  }

  async onBeforeRedeem(context: RedeemContext): Promise<OperationResult> {
    // Redemption might require property sale verification
    return { success: true };
  }

  async onAfterRedeem(context: RedeemContext): Promise<void> {
    console.log(`Property tokens redeemed: ${context.amount}`);
    // Distribute sale proceeds, update DLD, etc.
  }

  async onBeforePayout(context: PayoutContext): Promise<OperationResult> {
    // Verify rental income or dividend amount
    return { success: true };
  }

  async onAfterPayout(context: PayoutContext): Promise<void> {
    console.log(`Rent/dividend distributed: ${context.totalAmount} ${context.currency}`);
  }

  // -------------------------------------------------------------------------
  // EXTERNAL CONNECTORS
  // -------------------------------------------------------------------------

  getConnectors(): ExternalConnector[] {
    return [
      {
        id: 'dld',
        name: 'Dubai Land Department',
        type: 'registry',
        baseUrl: 'https://api.dubailand.gov.ae',

        async healthCheck(): Promise<boolean> {
          // In real implementation, ping DLD API
          return true;
        },

        async execute<T>(operation: string, params: Record<string, unknown>): Promise<T> {
          // Route to appropriate DLD operation
          switch (operation) {
            case 'verifyTitle':
              // Call DLD title verification
              return { verified: true } as T;
            case 'registerTransfer':
              // Register ownership transfer
              return { registrationId: 'DLD-' + Date.now() } as T;
            default:
              throw new ValidationError(`Unknown DLD operation: ${operation}`, {
                field: 'operation',
                constraints: { allowedValues: 'verifyTitle, registerTransfer' },
              });
          }
        },
      },
    ];
  }
}

// Export singleton instance
export const realEstateAdapter = new RealEstateAdapter();
