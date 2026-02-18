/**
 * Secondary Market Service - Unit Tests
 *
 * Tests createListing, getListings (filter/pagination),
 * purchaseListing (fee calc, error cases), and cancelListing.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createListing,
  getListings,
  purchaseListing,
  cancelListing,
} from '../services/secondary-market.service.js';

// ============================================================================
// Suppress logger output during tests
// ============================================================================

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// Helpers
// ============================================================================

let assetCounter = 0;
function uniqueAssetId(): string {
  return `asset-sm-${Date.now()}-${++assetCounter}`;
}

// ============================================================================
// Tests
// ============================================================================

describe('Secondary Market Service', () => {
  // --------------------------------------------------------------------------
  // createListing
  // --------------------------------------------------------------------------
  describe('createListing', () => {
    it('generates a lst- prefixed ID', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 100, pricePerToken: 50 },
      );
      expect(listing.id.startsWith('lst-')).toBe(true);
    });

    it('defaults currency to AED', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 100, pricePerToken: 50 },
      );
      expect(listing.currency).toBe('AED');
    });

    it('defaults status to active', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 100, pricePerToken: 50 },
      );
      expect(listing.status).toBe('active');
    });

    it('stores correct tokenAmount and pricePerToken', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 250, pricePerToken: 75.5 },
      );
      expect(listing.tokenAmount).toBe(250);
      expect(listing.pricePerToken).toBe(75.5);
    });

    it('stores seller info correctly', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-abc', '0xWalletABC',
        { tokenAmount: 50, pricePerToken: 100 },
      );
      expect(listing.sellerId).toBe('seller-abc');
      expect(listing.sellerWallet).toBe('0xWalletABC');
    });

    it('stores the correct assetId', async () => {
      const assetId = uniqueAssetId();
      const listing = await createListing(
        assetId, 'seller-1', '0xSeller1',
        { tokenAmount: 100, pricePerToken: 50 },
      );
      expect(listing.assetId).toBe(assetId);
    });

    it('accepts a custom currency', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 100, pricePerToken: 50, currency: 'USD' },
      );
      expect(listing.currency).toBe('USD');
    });

    it('includes createdAt timestamp', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 100, pricePerToken: 50 },
      );
      expect(listing.createdAt).toBeDefined();
      // Should be a valid ISO date string
      expect(new Date(listing.createdAt).getTime()).not.toBeNaN();
    });
  });

  // --------------------------------------------------------------------------
  // getListings
  // --------------------------------------------------------------------------
  describe('getListings', () => {
    it('returns empty array when no listings exist', async () => {
      const listings = await getListings(uniqueAssetId());
      expect(listings).toEqual([]);
    });

    it('returns listings for the correct asset', async () => {
      const assetId = uniqueAssetId();
      await createListing(assetId, 'seller-1', '0xS1', { tokenAmount: 100, pricePerToken: 50 });
      await createListing(assetId, 'seller-2', '0xS2', { tokenAmount: 200, pricePerToken: 60 });

      const listings = await getListings(assetId);
      expect(listings).toHaveLength(2);
      for (const l of listings) {
        expect(l.assetId).toBe(assetId);
      }
    });

    it('does not return listings from other assets', async () => {
      const assetA = uniqueAssetId();
      const assetB = uniqueAssetId();
      await createListing(assetA, 'seller-1', '0xS1', { tokenAmount: 100, pricePerToken: 50 });
      await createListing(assetB, 'seller-2', '0xS2', { tokenAmount: 200, pricePerToken: 60 });

      const listings = await getListings(assetA);
      expect(listings).toHaveLength(1);
      expect(listings[0].assetId).toBe(assetA);
    });

    it('filters by status', async () => {
      const assetId = uniqueAssetId();
      const listing1 = await createListing(assetId, 'seller-1', '0xS1', { tokenAmount: 100, pricePerToken: 50 });
      await createListing(assetId, 'seller-2', '0xS2', { tokenAmount: 200, pricePerToken: 60 });
      // Cancel one listing
      await cancelListing(listing1.id);

      const activeListings = await getListings(assetId, { status: 'active' });
      expect(activeListings).toHaveLength(1);

      const cancelledListings = await getListings(assetId, { status: 'cancelled' });
      expect(cancelledListings).toHaveLength(1);
    });

    it('respects limit parameter', async () => {
      const assetId = uniqueAssetId();
      for (let i = 0; i < 5; i++) {
        await createListing(assetId, `seller-${i}`, `0xS${i}`, { tokenAmount: 100, pricePerToken: 50 });
      }

      const listings = await getListings(assetId, { limit: 3 });
      expect(listings).toHaveLength(3);
    });

    it('respects offset parameter', async () => {
      const assetId = uniqueAssetId();
      for (let i = 0; i < 5; i++) {
        await createListing(assetId, `seller-${i}`, `0xS${i}`, { tokenAmount: 100 + i, pricePerToken: 50 });
      }

      const allListings = await getListings(assetId);
      const offsetListings = await getListings(assetId, { offset: 2 });

      expect(offsetListings).toHaveLength(3);
      expect(offsetListings[0].id).toBe(allListings[2].id);
    });

    it('defaults limit to 50', async () => {
      const assetId = uniqueAssetId();
      // Create a few listings and verify they all come back (under 50)
      for (let i = 0; i < 3; i++) {
        await createListing(assetId, `seller-${i}`, `0xS${i}`, { tokenAmount: 100, pricePerToken: 50 });
      }

      const listings = await getListings(assetId);
      expect(listings).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // purchaseListing
  // --------------------------------------------------------------------------
  describe('purchaseListing', () => {
    it('calculates totalPrice = tokenAmount * pricePerToken', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 100, pricePerToken: 50 },
      );

      const result = await purchaseListing(listing.id, '0xBuyer1');
      expect(result.totalPrice).toBe(100 * 50);
    });

    it('calculates 1.5% platform fee', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 200, pricePerToken: 100 },
      );

      const result = await purchaseListing(listing.id, '0xBuyer1');
      const expectedTotal = 200 * 100;
      const expectedFee = expectedTotal * 0.015;
      expect(result.platformFee).toBe(expectedFee);
    });

    it('returns completed status', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 50, pricePerToken: 25 },
      );

      const result = await purchaseListing(listing.id, '0xBuyer1');
      expect(result.status).toBe('completed');
    });

    it('includes buyer and seller wallet info', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSellerWallet',
        { tokenAmount: 50, pricePerToken: 25 },
      );

      const result = await purchaseListing(listing.id, '0xBuyerWallet');
      expect(result.buyerWallet).toBe('0xBuyerWallet');
      expect(result.sellerWallet).toBe('0xSellerWallet');
    });

    it('generates a transferId', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 50, pricePerToken: 25 },
      );

      const result = await purchaseListing(listing.id, '0xBuyer1');
      expect(result.transferId).toBeDefined();
      expect(result.transferId.startsWith('txn-')).toBe(true);
    });

    it('throws on not-found listing', async () => {
      await expect(
        purchaseListing('lst-nonexistent-12345', '0xBuyer1'),
      ).rejects.toThrow('Listing not found');
    });

    it('throws on non-active listing (already sold)', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 50, pricePerToken: 25 },
      );

      // Purchase it first
      await purchaseListing(listing.id, '0xBuyer1');

      // Try to purchase again
      await expect(
        purchaseListing(listing.id, '0xBuyer2'),
      ).rejects.toThrow('Listing is not active');
    });

    it('throws on cancelled listing', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 50, pricePerToken: 25 },
      );

      await cancelListing(listing.id);

      await expect(
        purchaseListing(listing.id, '0xBuyer1'),
      ).rejects.toThrow('Listing is not active');
    });

    it('returns correct currency from listing', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 50, pricePerToken: 25, currency: 'USD' },
      );

      const result = await purchaseListing(listing.id, '0xBuyer1');
      expect(result.currency).toBe('USD');
    });
  });

  // --------------------------------------------------------------------------
  // cancelListing
  // --------------------------------------------------------------------------
  describe('cancelListing', () => {
    it('cancels an active listing successfully', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 50, pricePerToken: 25 },
      );

      const result = await cancelListing(listing.id);
      expect(result.success).toBe(true);
    });

    it('cancelled listing shows cancelled status in getListings', async () => {
      const assetId = uniqueAssetId();
      const listing = await createListing(
        assetId, 'seller-1', '0xSeller1',
        { tokenAmount: 50, pricePerToken: 25 },
      );

      await cancelListing(listing.id);

      const cancelled = await getListings(assetId, { status: 'cancelled' });
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].id).toBe(listing.id);
    });

    it('throws on not-found listing', async () => {
      await expect(
        cancelListing('lst-nonexistent-12345'),
      ).rejects.toThrow('Listing not found');
    });

    it('throws on non-active listing (already cancelled)', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 50, pricePerToken: 25 },
      );

      await cancelListing(listing.id);

      await expect(
        cancelListing(listing.id),
      ).rejects.toThrow('Listing is not active');
    });

    it('throws on already-sold listing', async () => {
      const listing = await createListing(
        uniqueAssetId(), 'seller-1', '0xSeller1',
        { tokenAmount: 50, pricePerToken: 25 },
      );

      await purchaseListing(listing.id, '0xBuyer1');

      await expect(
        cancelListing(listing.id),
      ).rejects.toThrow('Listing is not active');
    });
  });
});
