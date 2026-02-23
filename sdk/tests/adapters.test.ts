/**
 * Token Adapter Tests
 *
 * Tests for the validation functionality in token adapters.
 * Ensures proper input validation for all adapter methods.
 */

import { describe, it, expect } from 'vitest';
import {
  EthereumAddressSchema,
  TokenAmountSchema,
  TokenAmountOrZeroSchema,
  TokenIdSchema,
  ChainIdSchema,
  RpcUrlSchema,
  BatchMintParamsSchema,
  ERC20AdapterConfigSchema,
  ERC721AdapterConfigSchema,
  ERC1155AdapterConfigSchema,
  validateOrThrow,
  validateToResult,
  isValidAddress,
  isValidAmount,
} from '@tokenisation/chains';
import { ValidationError } from '@tokenisation/core';

describe('Adapter Validation Schemas', () => {
  describe('EthereumAddressSchema', () => {
    it('should accept valid Ethereum addresses', () => {
      const validAddresses = [
        '0x1234567890abcdef1234567890abcdef12345678',
        '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        '0x0000000000000000000000000000000000000000',
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
      ];

      for (const addr of validAddresses) {
        const result = EthereumAddressSchema.safeParse(addr);
        expect(result.success, `Failed for ${addr}`).toBe(true);
      }
    });

    it('should reject invalid Ethereum addresses', () => {
      const invalidAddresses = [
        '1234567890abcdef1234567890abcdef12345678', // Missing 0x prefix
        '0x123456789', // Too short
        '0x1234567890abcdef1234567890abcdef1234567890abcdef', // Too long
        '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', // Invalid hex
        '',
        'not an address',
      ];

      for (const addr of invalidAddresses) {
        const result = EthereumAddressSchema.safeParse(addr);
        expect(result.success, `Should reject ${addr}`).toBe(false);
      }
    });

    it('should normalize addresses to lowercase', () => {
      const result = EthereumAddressSchema.parse('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');
      expect(result).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    });
  });

  describe('TokenAmountSchema', () => {
    it('should accept valid positive token amounts', () => {
      const validAmounts = [
        '1',
        '100',
        '1000000000000000000',
        '99999999999999999999999999999999',
      ];

      for (const amount of validAmounts) {
        const result = TokenAmountSchema.safeParse(amount);
        expect(result.success, `Failed for ${amount}`).toBe(true);
      }
    });

    it('should reject zero amount (use TokenAmountOrZeroSchema for zero)', () => {
      const result = TokenAmountSchema.safeParse('0');
      expect(result.success).toBe(false);
    });

    it('should reject negative amounts (via regex)', () => {
      const result = TokenAmountSchema.safeParse('-1');
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = TokenAmountSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject strings with special characters', () => {
      const result = TokenAmountSchema.safeParse('100$');
      expect(result.success).toBe(false);
    });
  });

  describe('TokenAmountOrZeroSchema', () => {
    it('should accept zero and positive amounts', () => {
      const validAmounts = ['0', '1', '100', '1000000000000000000'];

      for (const amount of validAmounts) {
        const result = TokenAmountOrZeroSchema.safeParse(amount);
        expect(result.success, `Failed for ${amount}`).toBe(true);
      }
    });
  });

  describe('TokenIdSchema', () => {
    it('should accept valid token IDs', () => {
      const validIds = ['0', '1', '100', '99999999999'];

      for (const id of validIds) {
        const result = TokenIdSchema.safeParse(id);
        expect(result.success, `Failed for ${id}`).toBe(true);
      }
    });

    it('should reject invalid token IDs', () => {
      const invalidIds = ['-1', '1.5', 'abc', ''];

      for (const id of invalidIds) {
        const result = TokenIdSchema.safeParse(id);
        expect(result.success, `Should reject ${id}`).toBe(false);
      }
    });
  });

  describe('ChainIdSchema', () => {
    it('should accept valid chain IDs', () => {
      const validChainIds = [1, 5, 137, 8453, 11155111];

      for (const chainId of validChainIds) {
        const result = ChainIdSchema.safeParse(chainId);
        expect(result.success, `Failed for ${chainId}`).toBe(true);
      }
    });

    it('should reject invalid chain IDs', () => {
      const invalidChainIds = [0, -1, 1.5];

      for (const chainId of invalidChainIds) {
        const result = ChainIdSchema.safeParse(chainId);
        expect(result.success, `Should reject ${chainId}`).toBe(false);
      }
    });
  });

  describe('RpcUrlSchema', () => {
    it('should accept valid RPC URLs', () => {
      const validUrls = [
        'http://localhost:8545',
        'https://mainnet.infura.io/v3/key',
        'wss://ws.example.com',
        'https://rpc.example.com:8080/path',
      ];

      for (const url of validUrls) {
        const result = RpcUrlSchema.safeParse(url);
        expect(result.success, `Failed for ${url}`).toBe(true);
      }
    });

    it('should reject invalid RPC URLs', () => {
      const invalidUrls = [
        'ftp://invalid.com', // Wrong protocol
        'not-a-url',
        '',
      ];

      for (const url of invalidUrls) {
        const result = RpcUrlSchema.safeParse(url);
        expect(result.success, `Should reject ${url}`).toBe(false);
      }
    });
  });

  describe('BatchMintParamsSchema', () => {
    it('should accept valid batch mint params', () => {
      const validParams = {
        to: '0x1234567890abcdef1234567890abcdef12345678',
        tokenIds: ['1', '2', '3'],
        amounts: ['100', '200', '300'],
      };

      const result = BatchMintParamsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject batch mint params with invalid address', () => {
      const invalidParams = {
        to: 'invalid-address',
        tokenIds: ['1'],
        amounts: ['100'],
      };

      const result = BatchMintParamsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject batch mint params with mismatched array lengths', () => {
      const params = {
        to: '0x1234567890abcdef1234567890abcdef12345678',
        tokenIds: ['1', '2', '3'],
        amounts: ['100', '200'], // Mismatch!
      };

      const result = BatchMintParamsSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject empty arrays', () => {
      const params = {
        to: '0x1234567890abcdef1234567890abcdef12345678',
        tokenIds: [],
        amounts: [],
      };

      const result = BatchMintParamsSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });
});

describe('Adapter Config Schemas', () => {
  describe('ERC20AdapterConfigSchema', () => {
    it('should accept valid config with providerUrl', () => {
      const validConfig = {
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 1,
        providerUrl: 'https://mainnet.infura.io/v3/key',
      };

      const result = ERC20AdapterConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject config with invalid contract address', () => {
      const invalidConfig = {
        contractAddress: 'invalid',
        chainId: 1,
        providerUrl: 'https://mainnet.infura.io/v3/key',
      };

      const result = ERC20AdapterConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject config with invalid chain ID', () => {
      const invalidConfig = {
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: -1,
        providerUrl: 'https://mainnet.infura.io/v3/key',
      };

      const result = ERC20AdapterConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject config with invalid provider URL', () => {
      const invalidConfig = {
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 1,
        providerUrl: 'not-a-url',
      };

      const result = ERC20AdapterConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should accept optional private key', () => {
      const config = {
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 1,
        providerUrl: 'https://mainnet.infura.io/v3/key',
        privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };

      const result = ERC20AdapterConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('ERC721AdapterConfigSchema', () => {
    it('should accept valid config', () => {
      const validConfig = {
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 137,
        providerUrl: 'https://polygon-rpc.com',
      };

      const result = ERC721AdapterConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });
  });

  describe('ERC1155AdapterConfigSchema', () => {
    it('should accept valid config', () => {
      const validConfig = {
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 8453,
        providerUrl: 'https://base.publicnode.com',
      };

      const result = ERC1155AdapterConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });
  });
});

describe('Validation Helper Functions', () => {
  describe('validateOrThrow', () => {
    it('should return validated data for valid input', () => {
      const result = validateOrThrow(
        EthereumAddressSchema,
        '0x1234567890abcdef1234567890abcdef12345678',
        'Address'
      );
      expect(result).toBe('0x1234567890abcdef1234567890abcdef12345678');
    });

    it('should throw ValidationError for invalid input', () => {
      expect(() =>
        validateOrThrow(EthereumAddressSchema, 'invalid', 'Address')
      ).toThrow(ValidationError);
    });

    it('should include context in error message', () => {
      try {
        validateOrThrow(EthereumAddressSchema, 'invalid', 'Test Address');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain('Test Address');
      }
    });
  });

  describe('validateToResult', () => {
    it('should return success result for valid input', () => {
      const result = validateToResult(
        EthereumAddressSchema,
        '0x1234567890abcdef1234567890abcdef12345678'
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('0x1234567890abcdef1234567890abcdef12345678');
      }
    });

    it('should return failure result for invalid input', () => {
      const result = validateToResult(EthereumAddressSchema, 'invalid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError);
      }
    });
  });

  describe('isValidAddress', () => {
    it('should return true for valid addresses', () => {
      expect(isValidAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('')).toBe(false);
    });
  });

  describe('isValidAmount', () => {
    it('should return true for valid positive amounts', () => {
      expect(isValidAmount('100')).toBe(true);
      expect(isValidAmount('1')).toBe(true);
    });

    it('should return false for zero (use TokenAmountOrZeroSchema)', () => {
      expect(isValidAmount('0')).toBe(false);
    });

    it('should return false for invalid amounts', () => {
      expect(isValidAmount('-1')).toBe(false);
      expect(isValidAmount('')).toBe(false);
    });
  });
});
