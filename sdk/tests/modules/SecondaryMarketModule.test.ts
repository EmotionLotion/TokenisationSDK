/**
 * SecondaryMarketModule Tests
 *
 * Comprehensive tests for the P2P secondary market module covering
 * listing CRUD, purchase flow, cancellation, and input validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecondaryMarketModule, ValidationError } from '@tokenisation/realestate';

// ---------------------------------------------------------------------------
// Mock HttpClient
// ---------------------------------------------------------------------------

function createMockHttp() {
  return {
    get: vi.fn().mockResolvedValue({ data: { data: {} } }),
    post: vi.fn().mockResolvedValue({ data: { data: {} } }),
    put: vi.fn().mockResolvedValue({ data: { data: {} } }),
    patch: vi.fn().mockResolvedValue({ data: { data: {} } }),
    delete: vi.fn().mockResolvedValue({ data: { data: {} } }),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SecondaryMarketModule', () => {
  let mod: SecondaryMarketModule;
  let http: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    http = createMockHttp();
    mod = new SecondaryMarketModule(http);
  });

  // ========================================================================
  // listListings
  // ========================================================================

  describe('listListings', () => {
    it('should GET the correct URL for the given assetId', async () => {
      http.get.mockResolvedValue({ data: { data: [] } });

      await mod.listListings('asset-42');

      expect(http.get).toHaveBeenCalledWith(
        '/api/v1/assets/asset-42/listings',
        undefined,
      );
    });

    it('should return response.data.data (the listings array)', async () => {
      const fakeListing = {
        id: 'lst-1',
        assetId: 'a1',
        sellerId: 's1',
        sellerWallet: '0xABC',
        tokenAmount: 10,
        pricePerToken: 5,
        currency: 'USDC',
        status: 'active',
        createdAt: '2025-01-01T00:00:00Z',
      };
      http.get.mockResolvedValue({ data: { data: [fakeListing] } });

      const result = await mod.listListings('a1');

      expect(result).toEqual([fakeListing]);
    });

    it('should forward optional query params (status, limit, offset)', async () => {
      http.get.mockResolvedValue({ data: { data: [] } });

      await mod.listListings('a1', { status: 'active', limit: 20, offset: 5 });

      expect(http.get).toHaveBeenCalledWith(
        '/api/v1/assets/a1/listings',
        { status: 'active', limit: 20, offset: 5 },
      );
    });

    it('should encode special characters in assetId', async () => {
      http.get.mockResolvedValue({ data: { data: [] } });

      await mod.listListings('asset/1');

      expect(http.get).toHaveBeenCalledWith(
        `/api/v1/assets/${encodeURIComponent('asset/1')}/listings`,
        undefined,
      );
    });
  });

  // ========================================================================
  // createListing
  // ========================================================================

  describe('createListing', () => {
    const validInput = {
      tokenAmount: 100,
      pricePerToken: 2.5,
      sellerWallet: '0xDEADBEEF',
    };

    it('should POST to the correct URL with validated body', async () => {
      const fakeListing = { id: 'lst-new', ...validInput, status: 'active' };
      http.post.mockResolvedValue({ data: { data: fakeListing } });

      const result = await mod.createListing('asset-1', validInput);

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/assets/asset-1/listings',
        validInput,
      );
      expect(result).toEqual(fakeListing);
    });

    it('should pass sellerWallet through in the request body', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });

      await mod.createListing('a1', {
        tokenAmount: 5,
        pricePerToken: 10,
        sellerWallet: '0xWALLET_123',
      });

      const postedBody = http.post.mock.calls[0][1];
      expect(postedBody).toHaveProperty('sellerWallet', '0xWALLET_123');
    });

    it('should throw ValidationError when sellerWallet is missing', async () => {
      const input = { tokenAmount: 10, pricePerToken: 1 } as any;

      await expect(mod.createListing('a1', input)).rejects.toThrow(ValidationError);
      await expect(mod.createListing('a1', input)).rejects.toThrow(/sellerWallet/i);
    });

    it('should throw ValidationError when sellerWallet is an empty string', async () => {
      const input = { tokenAmount: 10, pricePerToken: 1, sellerWallet: '' };

      await expect(mod.createListing('a1', input)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when tokenAmount is zero', async () => {
      const input = { tokenAmount: 0, pricePerToken: 1, sellerWallet: '0xABC' };

      await expect(mod.createListing('a1', input)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when tokenAmount is negative', async () => {
      const input = { tokenAmount: -5, pricePerToken: 1, sellerWallet: '0xABC' };

      await expect(mod.createListing('a1', input)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when pricePerToken is zero', async () => {
      const input = { tokenAmount: 10, pricePerToken: 0, sellerWallet: '0xABC' };

      await expect(mod.createListing('a1', input)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when pricePerToken is negative', async () => {
      const input = { tokenAmount: 10, pricePerToken: -3, sellerWallet: '0xABC' };

      await expect(mod.createListing('a1', input)).rejects.toThrow(ValidationError);
    });

    it('should accept optional currency and expiresAt fields', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });

      await mod.createListing('a1', {
        tokenAmount: 50,
        pricePerToken: 1.5,
        sellerWallet: '0xABC',
        currency: 'AED',
        expiresAt: '2026-12-31T23:59:59Z',
      });

      const postedBody = http.post.mock.calls[0][1];
      expect(postedBody).toHaveProperty('currency', 'AED');
      expect(postedBody).toHaveProperty('expiresAt', '2026-12-31T23:59:59Z');
    });

    it('should throw ValidationError when tokenAmount is a non-integer', async () => {
      const input = { tokenAmount: 1.5, pricePerToken: 10, sellerWallet: '0xABC' };

      await expect(mod.createListing('a1', input)).rejects.toThrow(ValidationError);
    });

    it('should encode special characters in assetId for createListing', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });

      await mod.createListing('asset/special', validInput);

      const calledUrl = http.post.mock.calls[0][0];
      expect(calledUrl).toBe(`/api/v1/assets/${encodeURIComponent('asset/special')}/listings`);
    });
  });

  // ========================================================================
  // purchase
  // ========================================================================

  describe('purchase', () => {
    it('should POST to the correct URL with buyerWallet', async () => {
      const purchaseResult = {
        listingId: 'lst-1',
        transferId: 'tx-1',
        buyerWallet: '0xBUYER',
        sellerWallet: '0xSELLER',
        tokenAmount: 10,
        totalPrice: 50,
        currency: 'USDC',
        platformFee: 1,
        status: 'completed',
      };
      http.post.mockResolvedValue({ data: { data: purchaseResult } });

      const result = await mod.purchase('lst-1', { buyerWallet: '0xBUYER' });

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/listings/lst-1/purchase',
        { buyerWallet: '0xBUYER' },
      );
      expect(result).toEqual(purchaseResult);
    });

    it('should forward optional maxPrice in the request body', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });

      await mod.purchase('lst-1', { buyerWallet: '0xBUYER', maxPrice: 100 });

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/listings/lst-1/purchase',
        { buyerWallet: '0xBUYER', maxPrice: 100 },
      );
    });

    it('should encode special characters in listingId', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });

      await mod.purchase('lst/special', { buyerWallet: '0xBUYER' });

      const calledUrl = http.post.mock.calls[0][0];
      expect(calledUrl).toBe(`/api/v1/listings/${encodeURIComponent('lst/special')}/purchase`);
    });
  });

  // ========================================================================
  // cancelListing
  // ========================================================================

  describe('cancelListing', () => {
    it('should POST to the correct cancel URL', async () => {
      http.post.mockResolvedValue({ data: { data: { success: true } } });

      const result = await mod.cancelListing('lst-42');

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/listings/lst-42/cancel',
        {},
      );
      expect(result).toEqual({ success: true });
    });

    it('should encode special characters in listingId for cancel', async () => {
      http.post.mockResolvedValue({ data: { data: { success: true } } });

      await mod.cancelListing('lst/special');

      const calledUrl = http.post.mock.calls[0][0];
      expect(calledUrl).toBe(`/api/v1/listings/${encodeURIComponent('lst/special')}/cancel`);
    });

    it('should return success: false when the server says so', async () => {
      http.post.mockResolvedValue({ data: { data: { success: false } } });

      const result = await mod.cancelListing('lst-99');

      expect(result).toEqual({ success: false });
    });
  });

  // ========================================================================
  // Validation Error shape
  // ========================================================================

  describe('ValidationError shape', () => {
    it('should include fieldErrors array with path and message', async () => {
      const input = { tokenAmount: -1, pricePerToken: 0, sellerWallet: '' } as any;

      try {
        await mod.createListing('a1', input);
        expect.fail('Expected ValidationError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const ve = err as ValidationError;
        expect(ve.code).toBe('VALIDATION_ERROR');
        expect(ve.fieldErrors).toBeInstanceOf(Array);
        expect(ve.fieldErrors.length).toBeGreaterThan(0);
        for (const fe of ve.fieldErrors) {
          expect(fe).toHaveProperty('path');
          expect(fe).toHaveProperty('message');
        }
      }
    });
  });
});
