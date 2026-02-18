/**
 * Secondary Market Service
 *
 * P2P listing CRUD for tokenized asset secondary trading.
 * Data persisted in DB (secondary_listings table).
 */

import { eq, and } from 'drizzle-orm';
import { db, secondaryListings } from '../config/database.js';
import { logger } from '../middleware/logger.js';

export interface SecondaryListing {
  id: string;
  assetId: string;
  sellerId: string;
  sellerWallet: string;
  tokenAmount: number;
  pricePerToken: number;
  currency: string;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt?: string;
}

export interface PurchaseResult {
  listingId: string;
  transferId: string;
  buyerWallet: string;
  sellerWallet: string;
  tokenAmount: number;
  totalPrice: number;
  currency: string;
  platformFee: number;
  status: string;
}

// ============================================================================
// Helpers
// ============================================================================

function rowToListing(row: any): SecondaryListing {
  return {
    id: row.id,
    assetId: row.assetId ?? row.asset_id,
    sellerId: row.sellerId ?? row.seller_id,
    sellerWallet: row.sellerWallet ?? row.seller_wallet,
    tokenAmount: Number(row.tokenAmount ?? row.token_amount),
    pricePerToken: Number(row.pricePerToken ?? row.price_per_token),
    currency: row.currency,
    status: row.status,
    createdAt: row.listedAt ?? row.listed_at ?? row.createdAt ?? row.created_at ?? new Date().toISOString(),
    expiresAt: row.expiresAt ?? row.expires_at ?? undefined,
  };
}

// ============================================================================
// Service Functions
// ============================================================================

export async function getListings(
  assetId: string,
  params?: { status?: string; limit?: number; offset?: number },
): Promise<SecondaryListing[]> {
  let rows: any[];
  if (params?.status) {
    rows = await (db as any).select().from(secondaryListings).where(
      and(eq(secondaryListings.assetId, assetId), eq(secondaryListings.status, params.status))
    );
  } else {
    rows = await (db as any).select().from(secondaryListings).where(eq(secondaryListings.assetId, assetId));
  }

  const offset = params?.offset || 0;
  const limit = params?.limit || 50;
  return rows.slice(offset, offset + limit).map(rowToListing);
}

export async function createListing(
  assetId: string,
  sellerId: string,
  sellerWallet: string,
  input: { tokenAmount: number; pricePerToken: number; currency?: string; expiresAt?: string },
): Promise<SecondaryListing> {
  const listing: SecondaryListing = {
    id: `lst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    assetId,
    sellerId,
    sellerWallet,
    tokenAmount: input.tokenAmount,
    pricePerToken: input.pricePerToken,
    currency: input.currency || 'AED',
    status: 'active',
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
  };

  await (db as any).insert(secondaryListings).values({
    id: listing.id,
    assetId: listing.assetId,
    sellerId: listing.sellerId,
    sellerWallet: listing.sellerWallet,
    tokenAmount: String(listing.tokenAmount),
    pricePerToken: String(listing.pricePerToken),
    currency: listing.currency,
    status: listing.status,
    expiresAt: listing.expiresAt ?? null,
  });

  logger.info('Secondary listing created', { listingId: listing.id, assetId });
  return listing;
}

export async function purchaseListing(
  listingId: string,
  buyerWallet: string,
): Promise<PurchaseResult> {
  const rows = await (db as any).select().from(secondaryListings).where(eq(secondaryListings.id, listingId));
  if (rows.length === 0) throw new Error('Listing not found');

  const listing = rowToListing(rows[0]);
  if (listing.status !== 'active') throw new Error('Listing is not active');

  await (db as any).update(secondaryListings)
    .set({ status: 'sold', soldAt: new Date() })
    .where(eq(secondaryListings.id, listingId));

  const totalPrice = listing.tokenAmount * listing.pricePerToken;
  const platformFee = totalPrice * 0.015; // 1.5% platform fee

  const result: PurchaseResult = {
    listingId,
    transferId: `txn-${Date.now()}`,
    buyerWallet,
    sellerWallet: listing.sellerWallet,
    tokenAmount: listing.tokenAmount,
    totalPrice,
    currency: listing.currency,
    platformFee,
    status: 'completed',
  };

  logger.info('Secondary listing purchased', { listingId, buyerWallet });
  return result;
}

export async function cancelListing(listingId: string): Promise<{ success: boolean }> {
  const rows = await (db as any).select().from(secondaryListings).where(eq(secondaryListings.id, listingId));
  if (rows.length === 0) throw new Error('Listing not found');

  const listing = rowToListing(rows[0]);
  if (listing.status !== 'active') throw new Error('Listing is not active');

  await (db as any).update(secondaryListings)
    .set({ status: 'cancelled' })
    .where(eq(secondaryListings.id, listingId));

  logger.info('Secondary listing cancelled', { listingId });
  return { success: true };
}
