/**
 * AirlineTicketContract - SDK adapter for AirlineTicketNFT smart contract
 *
 * Wraps ChainService.writeContract/readContract with typed methods
 * for airline ticket lifecycle management on-chain.
 */

import { ChainService } from '../core/ChainService.js';
import { AIRLINE_TICKET_NFT_ABI } from './abis/AirlineTicketNFT.js';
import type { Address, Hash } from 'viem';
import type { Result } from '../core/types.js';

export enum OnChainTicketClass {
  ECONOMY = 0,
  PREMIUM_ECONOMY = 1,
  BUSINESS = 2,
  FIRST = 3,
}

export enum OnChainTicketStatus {
  ISSUED = 0,
  CONFIRMED = 1,
  CHECKED_IN = 2,
  BOARDED = 3,
  COMPLETED = 4,
  CANCELLED = 5,
  REFUNDED = 6,
  EXPIRED = 7,
  BURNED = 8,
}

export interface OnChainTicketData {
  flightNumber: string;
  airline: string;
  departureTime: bigint;
  arrivalTime: bigint;
  departureAirport: string;
  arrivalAirport: string;
  gate: string;
  seat: string;
  ticketClass: OnChainTicketClass;
  status: OnChainTicketStatus;
  issuedAt: bigint;
  checkedInAt: bigint;
  boardedAt: bigint;
  transferCount: number;
  maxTransfers: number;
  transferable: boolean;
  metadataVersion: bigint;
  pricePaid: bigint;
  originalBuyer: Address;
}

export class AirlineTicketContract {
  constructor(
    private chain: ChainService,
    private contractAddress: Address,
  ) {}

  // ============================================================================
  // Issuance
  // ============================================================================

  async issueTicket(params: {
    to: Address;
    flightNumber: string;
    airline: string;
    departureTime: number; // Unix timestamp
    arrivalTime: number;
    departureAirport: string;
    arrivalAirport: string;
    gate: string;
    seat: string;
    ticketClass: OnChainTicketClass;
    maxTransfers: number;
    transferable: boolean;
    value?: bigint; // ETH value for ticket price
  }): Promise<Result<Hash, string>> {
    return this.chain.writeContract(
      this.contractAddress,
      [...AIRLINE_TICKET_NFT_ABI],
      'issueTicket',
      [
        params.to,
        params.flightNumber,
        params.airline,
        BigInt(params.departureTime),
        BigInt(params.arrivalTime),
        params.departureAirport,
        params.arrivalAirport,
        params.gate,
        params.seat,
        params.ticketClass,
        params.maxTransfers,
        params.transferable,
      ],
    );
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async checkIn(tokenId: bigint): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'checkIn', [tokenId]);
  }

  async board(tokenId: bigint): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'board', [tokenId]);
  }

  async completeAndBurn(tokenId: bigint): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'completeAndBurn', [tokenId]);
  }

  async cancelTicket(tokenId: bigint, reason: string): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'cancelTicket', [tokenId, reason]);
  }

  async processRefund(tokenId: bigint): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'processRefund', [tokenId]);
  }

  // ============================================================================
  // Dynamic Metadata
  // ============================================================================

  async updateGate(tokenId: bigint, newGate: string): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'updateGate', [tokenId, newGate]);
  }

  async updateSeat(tokenId: bigint, newSeat: string, newClass: OnChainTicketClass): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'updateSeat', [tokenId, newSeat, newClass]);
  }

  async updateDepartureTime(tokenId: bigint, newDeparture: number, newArrival: number): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'updateDepartureTime', [tokenId, BigInt(newDeparture), BigInt(newArrival)]);
  }

  // ============================================================================
  // Transfer
  // ============================================================================

  async transferTicket(from: Address, to: Address, tokenId: bigint): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'transferFrom', [from, to, tokenId]);
  }

  // ============================================================================
  // Queries
  // ============================================================================

  async getTicketData(tokenId: bigint): Promise<OnChainTicketData | null> {
    return this.chain.readContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'getTicketData', [tokenId]);
  }

  async isTicketValid(tokenId: bigint): Promise<boolean> {
    return this.chain.readContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'isTicketValid', [tokenId]);
  }

  async canTransfer(tokenId: bigint): Promise<{ allowed: boolean; reason: string }> {
    const result = await this.chain.readContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'canTransfer', [tokenId]);
    return { allowed: result[0], reason: result[1] };
  }

  async ownerOf(tokenId: bigint): Promise<Address | null> {
    return this.chain.readContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'ownerOf', [tokenId]);
  }

  async balanceOf(owner: Address): Promise<bigint> {
    return this.chain.readContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'balanceOf', [owner]);
  }

  async getActiveTicketCount(): Promise<bigint> {
    return this.chain.readContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'getActiveTicketCount', []);
  }

  async totalSupply(): Promise<bigint> {
    return this.chain.readContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'totalSupply', []);
  }

  async getMetadataVersion(tokenId: bigint): Promise<bigint> {
    return this.chain.readContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'getMetadataVersion', [tokenId]);
  }

  // ============================================================================
  // Admin
  // ============================================================================

  async addAirline(airline: Address): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'addAirline', [airline]);
  }

  async addAgent(agent: Address): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'addAgent', [agent]);
  }

  async pause(): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'pause', []);
  }

  async unpause(): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.contractAddress, [...AIRLINE_TICKET_NFT_ABI], 'unpause', []);
  }
}
