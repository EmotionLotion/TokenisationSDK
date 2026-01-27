/**
 * Mock DLD Provider
 *
 * A mock implementation of the IDLDProvider interface for development and testing.
 * Simulates Dubai Land Department responses with configurable data.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  IDLDProvider,
  TitleDeedResult,
  TokenizationEligibility,
  TokenizationNotification,
  TokenizationNotificationResult,
  ValuationResult,
  ValuationType,
  Owner,
} from './IDLDProvider.js';

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_OWNERS: Record<string, Owner[]> = {
  'PROP-001': [
    {
      id: 'OWN-001',
      name: 'Mohammed Al Maktoum Investment LLC',
      nationality: 'AE',
      sharePercentage: 100,
    },
  ],
  'PROP-002': [
    {
      id: 'OWN-002',
      name: 'Dubai Real Estate Holding',
      nationality: 'AE',
      sharePercentage: 60,
    },
    {
      id: 'OWN-003',
      name: 'Global Property Partners',
      nationality: 'GB',
      sharePercentage: 40,
    },
  ],
};

const MOCK_PROPERTIES: Record<string, Partial<TitleDeedResult>> = {
  'DEED-001': {
    deedNumber: 'DEED-001',
    propertyId: 'PROP-001',
    status: 'VALID',
    propertyType: 'COMMERCIAL',
    ownershipType: 'FREEHOLD',
    area: 5000,
    areaUnit: 'sqm',
    location: {
      emirate: 'Dubai',
      community: 'Business Bay',
      building: 'Marina Tower',
    },
    registrationDate: '2020-01-15T00:00:00Z',
    encumbrances: [],
    restrictions: [],
  },
  'DEED-002': {
    deedNumber: 'DEED-002',
    propertyId: 'PROP-002',
    status: 'VALID',
    propertyType: 'RESIDENTIAL',
    ownershipType: 'FREEHOLD',
    area: 200,
    areaUnit: 'sqm',
    location: {
      emirate: 'Dubai',
      community: 'Dubai Marina',
      building: 'Marina Heights',
      unit: '2501',
    },
    registrationDate: '2021-06-20T00:00:00Z',
    encumbrances: ['Mortgage - Emirates NBD'],
    restrictions: [],
  },
  'DEED-003': {
    deedNumber: 'DEED-003',
    propertyId: 'PROP-003',
    status: 'EXPIRED',
    propertyType: 'LAND',
    ownershipType: 'LEASEHOLD',
    area: 10000,
    areaUnit: 'sqm',
    location: {
      emirate: 'Dubai',
      community: 'Dubai South',
    },
    registrationDate: '2015-03-10T00:00:00Z',
    expiryDate: '2023-03-10T00:00:00Z',
    encumbrances: [],
    restrictions: ['Industrial use only'],
  },
};

// ============================================================================
// Mock Provider Implementation
// ============================================================================

/**
 * Mock DLD Provider for development and testing.
 *
 * @example
 * ```typescript
 * const provider = new MockDLDProvider();
 *
 * // Add custom properties for testing
 * provider.addProperty({
 *   deedNumber: 'TEST-001',
 *   propertyId: 'TEST-PROP-001',
 *   status: 'VALID',
 *   // ...
 * });
 *
 * const deed = await provider.verifyTitleDeed('TEST-001');
 * ```
 */
export class MockDLDProvider implements IDLDProvider {
  readonly name = 'MockDLDProvider';

  private properties: Map<string, Partial<TitleDeedResult>>;
  private notifications: Map<string, TokenizationNotificationResult>;
  private simulatedLatency: number;

  constructor(options?: { simulatedLatency?: number }) {
    this.properties = new Map(Object.entries(MOCK_PROPERTIES));
    this.notifications = new Map();
    this.simulatedLatency = options?.simulatedLatency ?? 100;
  }

  private async simulateDelay(): Promise<void> {
    if (this.simulatedLatency > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedLatency));
    }
  }

  /**
   * Add a custom property for testing.
   */
  addProperty(property: Partial<TitleDeedResult>): void {
    if (property.deedNumber) {
      this.properties.set(property.deedNumber, property);
    }
  }

  /**
   * Remove a property.
   */
  removeProperty(deedNumber: string): boolean {
    return this.properties.delete(deedNumber);
  }

  /**
   * Clear all mock data.
   */
  clearAll(): void {
    this.properties.clear();
    this.notifications.clear();
  }

  /**
   * Reset to default mock data.
   */
  reset(): void {
    this.properties = new Map(Object.entries(MOCK_PROPERTIES));
    this.notifications.clear();
  }

  async verifyTitleDeed(deedNumber: string): Promise<TitleDeedResult> {
    await this.simulateDelay();

    const property = this.properties.get(deedNumber);
    if (!property) {
      return {
        deedNumber,
        propertyId: '',
        status: 'NOT_FOUND',
        propertyType: 'RESIDENTIAL',
        ownershipType: 'FREEHOLD',
        owners: [],
        area: 0,
        areaUnit: 'sqm',
        location: { emirate: 'Dubai', community: '' },
        registrationDate: '',
        encumbrances: [],
        restrictions: [],
        verifiedAt: new Date().toISOString(),
      };
    }

    const propertyId = property.propertyId || 'PROP-UNKNOWN';
    const owners = MOCK_OWNERS[propertyId] || [
      {
        id: 'OWN-DEFAULT',
        name: 'Default Owner',
        nationality: 'AE',
        sharePercentage: 100,
      },
    ];

    return {
      deedNumber: property.deedNumber || deedNumber,
      propertyId,
      status: property.status || 'VALID',
      propertyType: property.propertyType || 'RESIDENTIAL',
      ownershipType: property.ownershipType || 'FREEHOLD',
      owners,
      area: property.area || 100,
      areaUnit: property.areaUnit || 'sqm',
      location: property.location || { emirate: 'Dubai', community: 'Downtown' },
      registrationDate: property.registrationDate || new Date().toISOString(),
      expiryDate: property.expiryDate,
      encumbrances: property.encumbrances || [],
      restrictions: property.restrictions || [],
      verifiedAt: new Date().toISOString(),
    };
  }

  async canTokenize(propertyId: string, ownerIds?: string[]): Promise<TokenizationEligibility> {
    await this.simulateDelay();

    // Find property by ID
    let property: Partial<TitleDeedResult> | undefined;
    for (const prop of this.properties.values()) {
      if (prop.propertyId === propertyId) {
        property = prop;
        break;
      }
    }

    const reasons: string[] = [];
    const requirements: string[] = [];
    const warnings: string[] = [];
    let eligible = true;
    let maxPercentage = 100;

    if (!property) {
      return {
        propertyId,
        eligible: false,
        reasons: ['Property not found in DLD registry'],
        requirements: ['Register property with Dubai Land Department'],
        warnings: [],
        maxTokenizationPercentage: 0,
        checkedAt: new Date().toISOString(),
      };
    }

    // Check status
    if (property.status !== 'VALID') {
      eligible = false;
      reasons.push(`Property status is ${property.status}, must be VALID`);
      requirements.push('Renew or update property registration');
    }

    // Check encumbrances
    if (property.encumbrances && property.encumbrances.length > 0) {
      warnings.push(`Property has ${property.encumbrances.length} encumbrance(s)`);
      maxPercentage = Math.min(maxPercentage, 80);
    }

    // Check ownership type
    if (property.ownershipType === 'LEASEHOLD') {
      warnings.push('Leasehold properties may have tokenization restrictions');
      requirements.push('Obtain lessor consent for tokenization');
    }

    // Check restrictions
    if (property.restrictions && property.restrictions.length > 0) {
      warnings.push('Property has usage restrictions');
    }

    // Standard requirements
    if (eligible) {
      requirements.push('KYC verification for all token holders');
      requirements.push('Compliance with VARA regulations');
      requirements.push('Quarterly reporting to DLD');
    }

    return {
      propertyId,
      eligible,
      reasons,
      requirements,
      warnings,
      maxTokenizationPercentage: eligible ? maxPercentage : 0,
      checkedAt: new Date().toISOString(),
    };
  }

  async notifyTokenization(params: TokenizationNotification): Promise<TokenizationNotificationResult> {
    await this.simulateDelay();

    const referenceNumber = `DLD-TOK-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    const result: TokenizationNotificationResult = {
      referenceNumber,
      status: 'SUBMITTED',
      submittedAt: now,
    };

    // Simulate auto-acknowledgment after a short delay
    setTimeout(() => {
      const notification = this.notifications.get(referenceNumber);
      if (notification && notification.status === 'SUBMITTED') {
        notification.status = 'ACKNOWLEDGED';
        notification.acknowledgedAt = new Date().toISOString();
      }
    }, this.simulatedLatency * 10);

    this.notifications.set(referenceNumber, result);

    return result;
  }

  async getValuation(propertyId: string, valuationType?: ValuationType): Promise<ValuationResult> {
    await this.simulateDelay();

    // Find property
    let property: Partial<TitleDeedResult> | undefined;
    for (const prop of this.properties.values()) {
      if (prop.propertyId === propertyId) {
        property = prop;
        break;
      }
    }

    if (!property) {
      throw new Error(`Property not found: ${propertyId}`);
    }

    // Generate mock valuation based on property type and area
    const baseValue = property.area || 100;
    let multiplier = 1000; // AED per sqm

    switch (property.propertyType) {
      case 'COMMERCIAL':
        multiplier = 15000;
        break;
      case 'RESIDENTIAL':
        multiplier = 12000;
        break;
      case 'INDUSTRIAL':
        multiplier = 5000;
        break;
      case 'LAND':
        multiplier = 8000;
        break;
    }

    const value = Math.round(baseValue * multiplier);
    const type = valuationType || 'MARKET';

    // Apply adjustments based on valuation type
    let adjustedValue = value;
    if (type === 'BOOK') {
      adjustedValue = Math.round(value * 0.85); // Book value typically lower
    } else if (type === 'ASSESSED') {
      adjustedValue = Math.round(value * 0.9); // Assessed value somewhere in between
    }

    return {
      propertyId,
      valuationType: type,
      value: adjustedValue.toString(),
      currency: 'AED',
      valuationDate: new Date().toISOString(),
      source: 'MockDLDProvider',
      validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
      methodology: 'Comparable Sales Analysis (Mock)',
      comparables: [
        {
          propertyId: 'COMP-001',
          value: Math.round(adjustedValue * 0.95).toString(),
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          propertyId: 'COMP-002',
          value: Math.round(adjustedValue * 1.05).toString(),
          date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    };
  }

  async getPropertyByDeed(deedNumber: string): Promise<TitleDeedResult> {
    return this.verifyTitleDeed(deedNumber);
  }

  async getPropertyById(propertyId: string): Promise<TitleDeedResult> {
    await this.simulateDelay();

    for (const prop of this.properties.values()) {
      if (prop.propertyId === propertyId && prop.deedNumber) {
        return this.verifyTitleDeed(prop.deedNumber);
      }
    }

    throw new Error(`Property not found: ${propertyId}`);
  }

  async getNotificationStatus(referenceNumber: string): Promise<TokenizationNotificationResult> {
    await this.simulateDelay();

    const notification = this.notifications.get(referenceNumber);
    if (!notification) {
      throw new Error(`Notification not found: ${referenceNumber}`);
    }

    return notification;
  }

  async healthCheck(): Promise<boolean> {
    await this.simulateDelay();
    return true;
  }

  /**
   * Simulate approval of a tokenization notification (for testing).
   */
  approveNotification(referenceNumber: string): void {
    const notification = this.notifications.get(referenceNumber);
    if (notification) {
      notification.status = 'APPROVED';
      notification.approvedAt = new Date().toISOString();
    }
  }

  /**
   * Simulate rejection of a tokenization notification (for testing).
   */
  rejectNotification(referenceNumber: string, reason: string): void {
    const notification = this.notifications.get(referenceNumber);
    if (notification) {
      notification.status = 'REJECTED';
      notification.rejectedAt = new Date().toISOString();
      notification.rejectionReason = reason;
    }
  }
}

// ============================================================================
// Export factory
// ============================================================================

/**
 * Create a mock DLD provider.
 */
export function createMockDLDProvider(options?: { simulatedLatency?: number }): IDLDProvider {
  return new MockDLDProvider(options);
}
