/**
 * Pack B: Event Ticket
 *
 * Reference implementation for tokenizing event tickets.
 * Type: ACCESS Right
 *
 * Flow: Define (VIP Pass) -> Verify (Payment) -> Mint (ERC-721) -> Enforce (Time-bound) -> Burn (Entry Scan)
 */

import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType, TransferabilityMode } from '../SDK.js';
import { EvidenceType, type TicketMetadata } from '../models/index.js';
import { RuleConditionType } from '../services/ComplianceService.js';

/**
 * Event Ticket Pack configuration
 */
export interface EventTicketConfig {
  /** Event name */
  eventName: string;

  /** Event date (ISO 8601) */
  eventDate: string;

  /** Venue name */
  venue: string;

  /** Ticket tier */
  tier: 'GENERAL' | 'VIP' | 'PREMIUM' | 'BACKSTAGE';

  /** Seat information (optional) */
  seat?: {
    section: string;
    row: string;
    seat: string;
  };

  /** Maximum resale price (optional, for anti-scalping) */
  maxResalePrice?: string;

  /** Transfer window end (ISO 8601, when transfers are no longer allowed) */
  transferWindowEnd?: string;

  /** Organizer information */
  organizer: {
    name: string;
    email?: string;
  };
}

/**
 * Event Ticket Pack
 *
 * Demonstrates the full tokenization flow for event tickets.
 */
export class EventTicketPack {
  private sdk: TokenisationSDK;
  private config: EventTicketConfig;

  constructor(sdk: TokenisationSDK, config: EventTicketConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Execute the full tokenization flow
   */
  async execute(): Promise<{
    assetId: string;
    organizerId: string;
    paymentEvidenceId: string;
  }> {
    // Step 1: Create Organizer
    const organizer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER],
      name: this.config.organizer.name,
      email: this.config.organizer.email,
      jurisdiction: 'AE', // Default to UAE
    });

    // Step 2: Create Ticket Asset with Metadata
    const ticketName = `${this.config.eventName} - ${this.config.tier} Ticket`;

    const metadata: TicketMetadata = {
      assetType: 'TICKET',
      eventName: this.config.eventName,
      eventDate: this.config.eventDate,
      venue: this.config.venue,
      ticketTier: this.config.tier,
      seatInfo: this.config.seat,
      maxResalePrice: this.config.maxResalePrice,
      transferWindowEnd: this.config.transferWindowEnd,
    };

    // Calculate ticket validity period
    const eventDate = new Date(this.config.eventDate);
    const eventEndDate = new Date(eventDate);
    eventEndDate.setHours(eventEndDate.getHours() + 12); // Assume 12 hour event

    const asset = await this.sdk.assets.create({
      name: ticketName,
      description: `${this.config.tier} access ticket for ${this.config.eventName} at ${this.config.venue}`,
      rightType: RightType.ACCESS,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        startTime: new Date().toISOString(),
        endTime: eventEndDate.toISOString(),
        isPerpetual: false,
      },
      transferabilityRules: {
        mode: TransferabilityMode.COMPLIANCE_GATED,
        lockupPeriodSeconds: 0,
        requireKyc: false, // Tickets often don't require KYC
      },
      issuerId: organizer.id,
      typedMetadata: metadata,
    });

    // Step 3: Add Payment Evidence
    const paymentEvidence = this.sdk.evidence.create({
      assetId: asset.id,
      type: EvidenceType.FINANCIAL_DOCUMENT,
      title: 'Ticket Purchase Receipt',
      description: `Payment confirmation for ${ticketName}`,
      contentHash: 'sha256:' + Buffer.from(asset.id + 'payment').toString('hex').slice(0, 64),
      source: {
        type: 'PAYMENT_PROCESSOR',
        identifier: 'stripe',
        name: 'Stripe Payment',
        trusted: true,
        reputationScore: 95,
      },
    });

    // Step 4: Verify Payment
    await this.sdk.evidence.verify(paymentEvidence.id, organizer.id, 'PAYMENT_VERIFICATION');

    // Step 5: Submit for Verification
    await this.sdk.assets.transition(
      asset.id,
      LifecycleState.PENDING_VERIFICATION,
      organizer.id
    );

    // Step 6: Verify Asset
    await this.sdk.assets.verify(asset.id, organizer.id);

    // Step 7: Activate Asset
    await this.sdk.assets.activate(asset.id, organizer.id);

    // Step 8: Register Compliance Rules for Time-bound Access
    this.sdk.compliance.registerRuleset({
      id: `ticket-${asset.id.slice(0, 8)}`,
      name: `Event Ticket - ${this.config.eventName}`,
      appliesToAssetTypes: [RightType.ACCESS],
      conditions: [
        {
          type: RuleConditionType.TIME_RESTRICTION,
          enabled: true,
          params: {
            endTime: this.config.transferWindowEnd || this.config.eventDate,
          },
          errorMessage: 'Ticket transfer window has closed',
          severity: 'ERROR',
        },
      ],
      priority: 5,
      active: true,
      metadata: {},
    });

    return {
      assetId: asset.id,
      organizerId: organizer.id,
      paymentEvidenceId: paymentEvidence.id,
    };
  }

  /**
   * Redeem/Burn ticket on entry scan
   */
  async redeemTicket(assetId: string, scannerId: string): Promise<void> {
    // Transition to REDEEMED state
    await this.sdk.assets.transition(assetId, LifecycleState.REDEEMED, scannerId);
  }
}

/**
 * Quick start helper for Event Ticket tokenization
 */
export async function createEventTicket(
  sdk: TokenisationSDK,
  config: EventTicketConfig
): Promise<string> {
  const pack = new EventTicketPack(sdk, config);
  const result = await pack.execute();
  return result.assetId;
}
