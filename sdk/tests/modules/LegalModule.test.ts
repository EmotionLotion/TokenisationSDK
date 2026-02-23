/**
 * LegalModule Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LegalModule } from '@tokenisation/realestate';

function createMockHttp() {
  return {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  } as any;
}

describe('LegalModule', () => {
  let mod: LegalModule;
  let http: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    http = createMockHttp();
    mod = new LegalModule(http);
  });

  describe('configureKYC', () => {
    it('should POST to /api/v1/compliance/kyc/configure', async () => {
      const input = { provider: 'sumsub', region: 'AE' };
      await mod.configureKYC(input);
      expect(http.post).toHaveBeenCalledWith('/api/v1/compliance/kyc/configure', input);
    });

    it('should return configuration data', async () => {
      const expected = { id: 'cfg-1', provider: 'sumsub', region: 'AE', status: 'active' };
      http.post.mockResolvedValue({ data: expected });
      const result = await mod.configureKYC({ provider: 'sumsub', region: 'AE' });
      expect(result).toEqual(expected);
    });
  });

  describe('initiateVerification', () => {
    it('should POST to correct URL with encoded investorId', async () => {
      await mod.initiateVerification('inv/123');
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/compliance/kyc/verify/inv%2F123',
        {},
      );
    });
  });

  describe('getVerificationStatus', () => {
    it('should GET from correct URL with encoded investorId', async () => {
      await mod.getVerificationStatus('inv-456');
      expect(http.get).toHaveBeenCalledWith('/api/v1/compliance/kyc/status/inv-456');
    });
  });

  describe('freezeParty', () => {
    it('should POST freeze with reason', async () => {
      await mod.freezeParty('inv-789', 'Suspicious activity');
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/compliance/kyc/freeze/inv-789',
        { reason: 'Suspicious activity' },
      );
    });
  });

  describe('unfreezeParty', () => {
    it('should POST unfreeze', async () => {
      await mod.unfreezeParty('inv-789');
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/compliance/kyc/unfreeze/inv-789',
        {},
      );
    });
  });
});
