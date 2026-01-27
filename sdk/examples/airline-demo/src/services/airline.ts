/**
 * Airline Service
 *
 * Integrates with the Tokenisation SDK to manage airline tickets as tokens.
 */

import { createApiClient, type ApiClient } from '@tokenisation/sdk';

// ============================================================================
// TYPES
// ============================================================================

export interface FlightDetails {
  number: string;
  departure: string; // Airport code
  arrival: string; // Airport code
  date: string; // ISO date
  class: 'economy' | 'premium_economy' | 'business' | 'first';
  seat?: string;
}

export interface Ticket {
  id: string;
  tokenId: string;
  passengerId: string;
  flight: FlightDetails;
  status: 'active' | 'transferred' | 'cancelled' | 'used';
  issuedAt: Date;
  price: number;
  currency: string;
}

export interface IssueTicketParams {
  passengerId: string;
  passengerWallet: string;
  flight: FlightDetails;
  price: number;
  currency?: string;
}

// ============================================================================
// AIRLINE SERVICE CLASS
// ============================================================================

export class AirlineService {
  private client: ApiClient;
  private projectId: string;

  constructor(apiKey: string, projectId: string, baseUrl?: string) {
    this.client = createApiClient({
      apiKey,
      baseUrl: baseUrl || 'http://localhost:3001',
    });
    this.projectId = projectId;
  }

  /**
   * Issue a new ticket as a tokenized asset
   */
  async issueTicket(params: IssueTicketParams): Promise<Ticket> {
    const ticketId = `TKT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create the asset representing the ticket
    const asset = await this.client.assets.create({
      name: `Flight ${params.flight.number} - ${params.flight.date}`,
      description: `Airline ticket: ${params.flight.departure} → ${params.flight.arrival}`,
      projectId: this.projectId,
      rightType: 'ACCESS',
      jurisdiction: {
        country: 'AE',
        subdivision: 'DUBAI',
      },
      attributes: {
        ticketId,
        flightNumber: params.flight.number,
        departure: params.flight.departure,
        arrival: params.flight.arrival,
        date: params.flight.date,
        class: params.flight.class,
        seat: params.flight.seat,
        passengerId: params.passengerId,
        price: params.price,
        currency: params.currency || 'USD',
      },
      metadata: {
        type: 'airline_ticket',
        version: '1.0',
      },
    });

    // Create and deploy the token (NFT)
    const token = await this.client.tokens.create({
      name: `Ticket #${ticketId}`,
      symbol: 'AIRTKN',
      projectId: this.projectId,
      assetId: asset.id,
      standard: 'ERC721',
      chainId: 137, // Polygon
    });

    // Issue the token to the passenger's wallet
    await this.client.tokens.mint({
      tokenId: token.id,
      toWallet: params.passengerWallet,
      amount: '1',
    });

    return {
      id: ticketId,
      tokenId: token.id,
      passengerId: params.passengerId,
      flight: params.flight,
      status: 'active',
      issuedAt: new Date(),
      price: params.price,
      currency: params.currency || 'USD',
    };
  }

  /**
   * Transfer a ticket to another passenger
   */
  async transferTicket(
    tokenId: string,
    fromWallet: string,
    toWallet: string,
    toPassengerId: string
  ): Promise<{ transferId: string; status: string }> {
    // Check if transfer is allowed (24h+ before departure)
    const token = await this.client.tokens.get(tokenId);
    const flightDate = new Date(token.metadata?.flightDate as string);
    const hoursUntilFlight = (flightDate.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilFlight < 24) {
      throw new Error('Transfers not allowed within 24 hours of departure');
    }

    // Create the transfer
    const transfer = await this.client.transfers.create({
      tokenId,
      fromWallet,
      toWallet,
      amount: '1',
      metadata: {
        type: 'ticket_transfer',
        toPassengerId,
      },
      idempotencyKey: `transfer-${tokenId}-${Date.now()}`,
    });

    return {
      transferId: transfer.id,
      status: transfer.status,
    };
  }

  /**
   * Cancel a ticket and process refund
   */
  async cancelTicket(
    tokenId: string,
    reason: string
  ): Promise<{ refundAmount: number; currency: string }> {
    const token = await this.client.tokens.get(tokenId);

    // Calculate refund based on cancellation policy
    const flightDate = new Date(token.metadata?.flightDate as string);
    const hoursUntilFlight = (flightDate.getTime() - Date.now()) / (1000 * 60 * 60);

    let refundPercentage = 0;
    if (hoursUntilFlight > 168) { // 7+ days
      refundPercentage = 100;
    } else if (hoursUntilFlight > 72) { // 3-7 days
      refundPercentage = 75;
    } else if (hoursUntilFlight > 24) { // 1-3 days
      refundPercentage = 50;
    } else {
      refundPercentage = 0;
    }

    const originalPrice = (token.metadata?.price as number) || 0;
    const refundAmount = (originalPrice * refundPercentage) / 100;

    // Burn the token (invalidate ticket)
    await this.client.tokens.burn({
      tokenId,
      fromWallet: token.metadata?.holderWallet as string,
      amount: '1',
      reason,
    });

    return {
      refundAmount,
      currency: (token.metadata?.currency as string) || 'USD',
    };
  }

  /**
   * Get ticket details
   */
  async getTicket(tokenId: string): Promise<Ticket | null> {
    try {
      const token = await this.client.tokens.get(tokenId);
      const asset = token.assetId
        ? await this.client.assets.get(token.assetId)
        : null;

      return {
        id: asset?.attributes?.ticketId as string,
        tokenId: token.id,
        passengerId: asset?.attributes?.passengerId as string,
        flight: {
          number: asset?.attributes?.flightNumber as string,
          departure: asset?.attributes?.departure as string,
          arrival: asset?.attributes?.arrival as string,
          date: asset?.attributes?.date as string,
          class: asset?.attributes?.class as FlightDetails['class'],
          seat: asset?.attributes?.seat as string,
        },
        status: token.status === 'deployed' ? 'active' : 'cancelled',
        issuedAt: new Date(token.createdAt),
        price: asset?.attributes?.price as number,
        currency: asset?.attributes?.currency as string,
      };
    } catch {
      return null;
    }
  }

  /**
   * List all tickets for a passenger
   */
  async listPassengerTickets(passengerId: string): Promise<Ticket[]> {
    const tokens = await this.client.tokens.list({
      projectId: this.projectId,
      limit: 100,
    });

    const tickets: Ticket[] = [];

    for (const token of tokens.data) {
      const ticket = await this.getTicket(token.id);
      if (ticket && ticket.passengerId === passengerId) {
        tickets.push(ticket);
      }
    }

    return tickets;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAirlineService(
  apiKey: string,
  projectId: string,
  baseUrl?: string
): AirlineService {
  return new AirlineService(apiKey, projectId, baseUrl);
}
