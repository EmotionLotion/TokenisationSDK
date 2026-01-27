/**
 * MockJurisdictionAdapter - Mock implementation for testing
 *
 * Provides a fully functional mock jurisdiction provider for:
 * - Unit and integration testing
 * - Development without external API dependencies
 * - Demo environments
 */

import type {
  IJurisdictionProvider,
  OwnershipParams,
  OwnershipResult,
  NotificationParams,
  NotificationResult,
  ValuationResult,
  ComplianceRequirements,
} from '../../interfaces/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Mock configuration options
 */
export interface MockJurisdictionConfig {
  /** Jurisdiction code */
  jurisdiction: string;
  /** Provider name */
  providerName?: string;
  /** Default verification result */
  defaultVerified?: boolean;
  /** Simulated delay in ms */
  simulatedDelay?: number;
  /** Error simulation rate (0-1) */
  errorRate?: number;
  /** Custom responses */
  customResponses?: {
    ownership?: Map<string, OwnershipResult>;
    valuation?: Map<string, ValuationResult>;
  };
}

// ============================================================================
// Mock Adapter Implementation
// ============================================================================

/**
 * MockJurisdictionAdapter - Mock jurisdiction provider for testing
 */
export class MockJurisdictionAdapter implements IJurisdictionProvider {
  readonly jurisdiction: string;
  readonly providerName: string;

  private config: Required<Omit<MockJurisdictionConfig, 'customResponses'>> & {
    customResponses: NonNullable<MockJurisdictionConfig['customResponses']>;
  };
  private notificationCounter = 0;

  constructor(config: MockJurisdictionConfig) {
    this.jurisdiction = config.jurisdiction;
    this.providerName = config.providerName || `Mock ${config.jurisdiction} Provider`;
    this.config = {
      jurisdiction: config.jurisdiction,
      providerName: this.providerName,
      defaultVerified: config.defaultVerified ?? true,
      simulatedDelay: config.simulatedDelay ?? 100,
      errorRate: config.errorRate ?? 0,
      customResponses: config.customResponses ?? {
        ownership: new Map(),
        valuation: new Map(),
      },
    };
  }

  /**
   * Create mock adapter with defaults
   */
  static create(jurisdiction: string = 'XX'): MockJurisdictionAdapter {
    return new MockJurisdictionAdapter({ jurisdiction });
  }

  /**
   * Verify ownership (mock)
   */
  async verifyOwnership(params: OwnershipParams): Promise<OwnershipResult> {
    await this.simulateDelay();
    this.maybeThrowError('verifyOwnership');

    // Check for custom response
    const customResponse = this.config.customResponses.ownership?.get(params.assetId);
    if (customResponse) {
      return customResponse;
    }

    const now = new Date().toISOString();
    const verified = this.config.defaultVerified;

    return {
      verified,
      owner: verified
        ? {
            name: params.ownerName,
            idNumber: params.ownerIdNumber || 'MOCK-ID-12345',
            registeredAt: '2020-01-15T00:00:00Z',
          }
        : undefined,
      asset: verified
        ? {
            id: params.assetId,
            type: params.assetType,
            description: `Mock ${params.assetType} asset`,
            registrationDate: '2020-01-15T00:00:00Z',
          }
        : undefined,
      referenceNumber: verified ? `MOCK-REF-${Date.now()}` : undefined,
      verifiedAt: now,
      expiresAt: verified ? this.addDays(new Date(), 30).toISOString() : undefined,
      message: verified ? undefined : 'Mock: Ownership verification failed',
      rawResponse: { mock: true },
    };
  }

  /**
   * Notify tokenization (mock)
   */
  async notifyTokenization(params: NotificationParams): Promise<NotificationResult> {
    await this.simulateDelay();
    this.maybeThrowError('notifyTokenization');

    this.notificationCounter++;
    const registrationNumber = `MOCK-TOK-${this.jurisdiction}-${this.notificationCounter.toString().padStart(6, '0')}`;

    return {
      accepted: true,
      registrationNumber,
      status: 'approved',
      notifiedAt: new Date().toISOString(),
      instructions: `Mock tokenization registered for asset ${params.assetId}`,
      message: `Token ${params.tokenAddress} registered on chain ${params.chainId}`,
    };
  }

  /**
   * Get valuation (mock)
   */
  async getValuation(assetId: string): Promise<ValuationResult> {
    await this.simulateDelay();
    this.maybeThrowError('getValuation');

    // Check for custom response
    const customResponse = this.config.customResponses.valuation?.get(assetId);
    if (customResponse) {
      return customResponse;
    }

    const baseValue = this.generateMockValuation(assetId);

    return {
      assetId,
      valuationAmount: baseValue.toString(),
      currency: this.getCurrencyForJurisdiction(),
      valuationDate: new Date().toISOString(),
      valuationType: 'estimated',
      source: 'MockProvider',
      isOfficial: false,
      history: [
        {
          date: this.addDays(new Date(), -365).toISOString(),
          amount: Math.round(baseValue * 0.9).toString(),
          source: 'MockProvider',
        },
        {
          date: this.addDays(new Date(), -180).toISOString(),
          amount: Math.round(baseValue * 0.95).toString(),
          source: 'MockProvider',
        },
      ],
    };
  }

  /**
   * Get compliance requirements (mock)
   */
  async getComplianceRequirements(assetType: string): Promise<ComplianceRequirements> {
    await this.simulateDelay();
    this.maybeThrowError('getComplianceRequirements');

    return {
      requiredDocuments: [
        {
          type: 'OWNERSHIP_PROOF',
          description: 'Proof of ownership document',
          mandatory: true,
        },
        {
          type: 'VALUATION_REPORT',
          description: 'Recent valuation report',
          mandatory: true,
        },
        {
          type: 'LEGAL_OPINION',
          description: 'Legal opinion on tokenization',
          mandatory: assetType === 'SECURITY',
        },
      ],
      requiredLicenses: [
        {
          type: 'MOCK_LICENSE',
          issuingAuthority: 'Mock Regulatory Authority',
          description: 'Mock license for testing',
        },
      ],
      allowedInvestorTypes: ['institutional', 'accredited', 'retail'],
      minimumInvestment: '100',
      kycLevel: 'standard',
      regulatoryFramework: `Mock ${this.jurisdiction} Regulatory Framework`,
    };
  }

  /**
   * Health check (mock)
   */
  async healthCheck(): Promise<boolean> {
    await this.simulateDelay();
    // Respect error rate for health checks too
    if (Math.random() < this.config.errorRate) {
      return false;
    }
    return true;
  }

  // ============================================================================
  // Testing Utilities
  // ============================================================================

  /**
   * Set custom ownership response for testing
   */
  setOwnershipResponse(assetId: string, response: OwnershipResult): void {
    this.config.customResponses.ownership?.set(assetId, response);
  }

  /**
   * Set custom valuation response for testing
   */
  setValuationResponse(assetId: string, response: ValuationResult): void {
    this.config.customResponses.valuation?.set(assetId, response);
  }

  /**
   * Set error rate for testing
   */
  setErrorRate(rate: number): void {
    this.config.errorRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Set default verification result
   */
  setDefaultVerified(verified: boolean): void {
    this.config.defaultVerified = verified;
  }

  /**
   * Reset all custom responses
   */
  reset(): void {
    this.config.customResponses.ownership?.clear();
    this.config.customResponses.valuation?.clear();
    this.notificationCounter = 0;
    this.config.errorRate = 0;
    this.config.defaultVerified = true;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async simulateDelay(): Promise<void> {
    if (this.config.simulatedDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.simulatedDelay));
    }
  }

  private maybeThrowError(operation: string): void {
    if (Math.random() < this.config.errorRate) {
      throw new Error(`Mock error in ${operation}: Simulated failure`);
    }
  }

  private generateMockValuation(assetId: string): number {
    // Generate deterministic but varied valuation based on asset ID
    let hash = 0;
    for (let i = 0; i < assetId.length; i++) {
      hash = ((hash << 5) - hash) + assetId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash % 10000000) + 100000; // 100,000 to 10,100,000
  }

  private getCurrencyForJurisdiction(): string {
    const currencyMap: Record<string, string> = {
      AE: 'AED',
      US: 'USD',
      GB: 'GBP',
      SG: 'SGD',
      EU: 'EUR',
      JP: 'JPY',
    };
    return currencyMap[this.jurisdiction] || 'USD';
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
