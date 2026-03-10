/**
 * DLDConditionEvaluator - Dubai Land Department condition evaluator
 *
 * This evaluator handles custom conditions for Dubai Real Estate tokenization:
 * - DLD_OWNERSHIP_VERIFIED: Verifies property ownership with DLD
 * - DLD_TOKENIZATION_REGISTERED: Confirms tokenization registration with DLD
 * - PROPERTY_SOLD: Verifies property sale completion
 *
 * Integration with DLDModule API:
 * - verify(): Title deed verification
 * - canTokenize(): Tokenization eligibility check
 * - notifyTokenization(): DLD notification
 * - getTokenizationStatus(): Check notification status
 */

import type {
  ICustomConditionEvaluator,
  CustomConditionContext,
  CustomConditionResult,
} from '@tokenisation/core';
import type { DLDModule, TitleDeed, TokenizationNotification, TokenizationEligibility } from '../modules/DLDClient.js';

/**
 * DLD verification cache entry
 */
interface DLDVerificationCache {
  titleDeed?: TitleDeed;
  eligibility?: TokenizationEligibility;
  notification?: TokenizationNotification;
  verifiedAt?: string;
  cachedAt: string;
}

/**
 * DLD Condition Evaluator Configuration
 */
export interface DLDConditionEvaluatorConfig {
  /** DLD Module instance */
  dldModule: DLDModule;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs?: number;
  /** Whether to require fresh verification (no cache) */
  requireFreshVerification?: boolean;
}

/**
 * DLD Condition Evaluator
 *
 * Evaluates Dubai Land Department custom conditions for the
 * dubai-real-estate.pack.ts lifecycle rules.
 */
export class DLDConditionEvaluator implements ICustomConditionEvaluator {
  readonly evaluatorId = 'dld-condition-evaluator';
  readonly supportedConditions = [
    'DLD_OWNERSHIP_VERIFIED',
    'DLD_TOKENIZATION_REGISTERED',
    'PROPERTY_SOLD',
  ];

  private dldModule: DLDModule;
  private cache: Map<string, DLDVerificationCache> = new Map();
  private cacheTtlMs: number;
  private requireFreshVerification: boolean;

  constructor(config: DLDConditionEvaluatorConfig) {
    this.dldModule = config.dldModule;
    this.cacheTtlMs = config.cacheTtlMs ?? 5 * 60 * 1000; // 5 minutes
    this.requireFreshVerification = config.requireFreshVerification ?? false;
  }

  /**
   * Check if this evaluator supports a condition
   */
  supports(conditionName: string): boolean {
    return this.supportedConditions.includes(conditionName);
  }

  /**
   * Evaluate a DLD custom condition
   */
  async evaluate(
    conditionName: string,
    context: CustomConditionContext
  ): Promise<CustomConditionResult> {
    if (!this.supports(conditionName)) {
      return {
        satisfied: false,
        reason: `Unsupported condition: ${conditionName}`,
      };
    }

    // Extract DLD-specific metadata
    const titleDeedNumber = context.asset.metadata?.titleDeedNumber as string | undefined;
    const propertyId = context.asset.metadata?.propertyId as string | undefined;

    if (!titleDeedNumber && !propertyId) {
      return {
        satisfied: false,
        reason: 'Asset metadata must include titleDeedNumber or propertyId for DLD verification',
      };
    }

    switch (conditionName) {
      case 'DLD_OWNERSHIP_VERIFIED':
        return this.evaluateOwnershipVerified(context, titleDeedNumber, propertyId);
      case 'DLD_TOKENIZATION_REGISTERED':
        return this.evaluateTokenizationRegistered(context, titleDeedNumber, propertyId);
      case 'PROPERTY_SOLD':
        return this.evaluatePropertySold(context, titleDeedNumber, propertyId);
      default:
        return { satisfied: false, reason: `Unknown condition: ${conditionName}` };
    }
  }

  /**
   * Evaluate DLD_OWNERSHIP_VERIFIED condition
   *
   * This verifies that:
   * 1. The title deed exists and is valid with DLD
   * 2. The property is eligible for tokenization
   */
  private async evaluateOwnershipVerified(
    context: CustomConditionContext,
    titleDeedNumber?: string,
    propertyId?: string
  ): Promise<CustomConditionResult> {
    const cacheKey = `ownership:${context.assetId}`;
    const cached = this.getCached(cacheKey);

    if (cached?.titleDeed && cached?.eligibility) {
      // Verify cached data is still valid
      if (cached.titleDeed.status === 'VALID' && cached.eligibility.eligible) {
        return {
          satisfied: true,
          evidence: {
            titleDeed: cached.titleDeed,
            eligibility: cached.eligibility,
            verificationSource: 'cache',
            verifiedAt: cached.verifiedAt,
          },
        };
      }
    }

    try {
      // Step 1: Verify title deed with DLD (deedNumber is required)
      if (!titleDeedNumber) {
        return {
          satisfied: false,
          reason: 'Title deed number is required for DLD ownership verification',
        };
      }

      const titleDeed = await this.dldModule.verify({
        deedNumber: titleDeedNumber,
      });

      if (titleDeed.status !== 'VALID') {
        return {
          satisfied: false,
          reason: `Title deed status is '${titleDeed.status}', expected 'VALID'`,
          evidence: { titleDeed },
        };
      }

      // Check for encumbrances
      if (titleDeed.encumbrances && titleDeed.encumbrances.length > 0) {
        return {
          satisfied: false,
          reason: `Property has encumbrances: ${titleDeed.encumbrances.join(', ')}`,
          evidence: { titleDeed },
          warnings: ['Property has existing encumbrances that may affect tokenization'],
        };
      }

      // Step 2: Check tokenization eligibility (uses propertyId)
      const eligibility = await this.dldModule.canTokenize({
        deedNumber: titleDeedNumber,
        propertyId: titleDeed.propertyId,
      });

      if (!eligibility.eligible) {
        return {
          satisfied: false,
          reason: `Property not eligible for tokenization: ${eligibility.reasons.join(', ')}`,
          evidence: { titleDeed, eligibility },
          warnings: eligibility.warnings,
        };
      }

      // Cache the successful verification
      const verifiedAt = new Date().toISOString();
      this.setCache(cacheKey, {
        titleDeed,
        eligibility,
        verifiedAt,
        cachedAt: verifiedAt,
      });

      return {
        satisfied: true,
        evidence: {
          titleDeed,
          eligibility,
          verificationSource: 'dld_api',
          verifiedAt,
        },
        warnings: eligibility.warnings.length > 0 ? eligibility.warnings : undefined,
      };
    } catch (error) {
      return {
        satisfied: false,
        reason: `DLD verification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Evaluate DLD_TOKENIZATION_REGISTERED condition
   *
   * This verifies that:
   * 1. Tokenization notification was submitted to DLD
   * 2. The notification has been approved (or at least acknowledged)
   */
  private async evaluateTokenizationRegistered(
    context: CustomConditionContext,
    titleDeedNumber?: string,
    propertyId?: string
  ): Promise<CustomConditionResult> {
    const cacheKey = `registration:${context.assetId}`;
    const cached = this.getCached(cacheKey);

    // Check if we have a cached approved notification
    if (cached?.notification) {
      if (cached.notification.status === 'APPROVED') {
        return {
          satisfied: true,
          evidence: {
            notification: cached.notification,
            verificationSource: 'cache',
          },
        };
      }
    }

    // Get tokenization reference from metadata
    const tokenizationRef = context.asset.metadata?.tokenizationReferenceNumber as string | undefined;
    const tokenContractAddress = context.asset.metadata?.tokenContractAddress as string | undefined;

    try {
      // If we have a reference number, check its status
      if (tokenizationRef) {
        const notification = await this.dldModule.getTokenizationStatus(tokenizationRef);

        if (notification.status === 'APPROVED') {
          this.setCache(cacheKey, {
            notification,
            cachedAt: new Date().toISOString(),
          });
          return {
            satisfied: true,
            evidence: {
              notification,
              verificationSource: 'dld_api',
            },
          };
        }

        if (notification.status === 'REJECTED') {
          return {
            satisfied: false,
            reason: `Tokenization registration was rejected: ${notification.rejectionReason || 'No reason provided'}`,
            evidence: { notification },
          };
        }

        // Still pending
        return {
          satisfied: false,
          reason: `Tokenization registration status is '${notification.status}', waiting for 'APPROVED'`,
          evidence: { notification },
          warnings: ['Registration is pending DLD approval'],
        };
      }

      // No reference number - need to submit notification
      if (!tokenContractAddress) {
        return {
          satisfied: false,
          reason: 'Token contract must be deployed before DLD registration. Missing tokenContractAddress in metadata.',
        };
      }

      // Get metadata needed for notification
      const totalSupply = context.asset.metadata?.totalSupply as string | undefined || '1000000';
      const issuerName = context.asset.metadata?.issuerName as string | undefined || context.asset.name;
      const issuerRegNumber = context.asset.metadata?.issuerRegistrationNumber as string | undefined || 'TBD';
      const issuerJurisdiction = context.asset.jurisdiction?.countryCode || 'AE';

      // Need both propertyId and deedNumber for notification
      if (!propertyId || !titleDeedNumber) {
        return {
          satisfied: false,
          reason: 'Both propertyId and titleDeedNumber are required for tokenization registration',
        };
      }

      // Submit tokenization notification
      const notification = await this.dldModule.notifyTokenization({
        propertyId,
        deedNumber: titleDeedNumber,
        tokenContractAddress,
        totalSupply,
      });

      // Store reference number for future checks
      // Note: The caller should update asset metadata with the reference number

      if (notification.status === 'APPROVED') {
        this.setCache(cacheKey, {
          notification,
          cachedAt: new Date().toISOString(),
        });
        return {
          satisfied: true,
          evidence: {
            notification,
            verificationSource: 'dld_api',
            newReferenceNumber: notification.referenceNumber,
          },
        };
      }

      return {
        satisfied: false,
        reason: `Tokenization notification submitted, status: '${notification.status}'. Save reference number: ${notification.referenceNumber}`,
        evidence: {
          notification,
          newReferenceNumber: notification.referenceNumber,
        },
        warnings: ['Tokenization notification submitted, awaiting DLD approval'],
      };
    } catch (error) {
      return {
        satisfied: false,
        reason: `DLD tokenization registration check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Evaluate PROPERTY_SOLD condition
   *
   * This verifies that property sale has been completed and registered with DLD.
   */
  private async evaluatePropertySold(
    context: CustomConditionContext,
    titleDeedNumber?: string,
    propertyId?: string
  ): Promise<CustomConditionResult> {
    const saleReferenceNumber = context.asset.metadata?.saleReferenceNumber as string | undefined;
    const saleConfirmed = context.asset.metadata?.saleConfirmed as boolean | undefined;

    // If sale is already confirmed in metadata
    if (saleConfirmed === true && saleReferenceNumber) {
      return {
        satisfied: true,
        evidence: {
          saleReferenceNumber,
          confirmedInMetadata: true,
        },
      };
    }

    // Return unsatisfied if propertyId is missing -- cannot query DLD without it
    if (!propertyId) {
      return {
        satisfied: false,
        reason: 'Cannot verify property sale: propertyId is required but was not provided',
      };
    }

    try {
      // Check DLD events for sale completion
      const events = await this.dldModule.getPropertyEvents(propertyId, {
        limit: 10,
      });

      // Look for a sale/transfer event
      const saleEvent = events.data.find(
        (e) => e.eventType === 'SALE' || e.eventType === 'OWNERSHIP_TRANSFER'
      );

      if (saleEvent) {
        return {
          satisfied: true,
          evidence: {
            saleEvent,
            verificationSource: 'dld_events',
          },
        };
      }

      return {
        satisfied: false,
        reason: 'No sale event found in DLD records. Property sale must be registered with DLD.',
        warnings: ['Ensure property sale is completed and registered with DLD before redemption'],
      };
    } catch (error) {
      return {
        satisfied: false,
        reason: `DLD sale verification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get cached verification data
   */
  private getCached(key: string): DLDVerificationCache | null {
    if (this.requireFreshVerification) {
      return null;
    }

    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    const cachedTime = new Date(cached.cachedAt).getTime();
    const now = Date.now();

    if (now - cachedTime > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Set cached verification data
   */
  private setCache(key: string, data: DLDVerificationCache): void {
    this.cache.set(key, data);
  }

  /**
   * Clear the verification cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
