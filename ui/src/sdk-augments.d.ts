/**
 * Type augmentations for the SDK's Asset interface.
 *
 * The SDK exports two `Asset` types: an API-layer interface (sdk/src/types.ts)
 * and a Zod-inferred model type (sdk/src/models/Asset.ts). Because the explicit
 * `export type { Asset }` in index.ts takes precedence over the `export *` from
 * models, the UI receives the lean API type. This file augments it with the
 * model-layer fields the UI components rely on.
 */

// Make this file a module so `declare module` works as augmentation
export {};

declare module '@tokenisation/sdk' {
  interface Asset {
    rightType?: string;
    jurisdiction?: string | {
      countryCode: string;
      accreditedOnly?: boolean;
      blockedJurisdictions?: string[];
      regulatoryFramework?: string;
    };
    issuerId?: string;
    tokenInfo?: {
      contractAddress: string;
      tokenId?: string;
      chainId: number;
      tokenStandard: 'ERC20' | 'ERC721' | 'ERC1155';
      totalSupply: string;
      decimals?: number;
    };
    version?: number;
    validityPeriod?: Record<string, unknown>;
    transferabilityRules?: Record<string, unknown>;
    evidenceIds?: string[];
    currentHolders?: Array<{
      partyId: string;
      amount: string;
      acquiredAt: string;
    }>;
  }
}
