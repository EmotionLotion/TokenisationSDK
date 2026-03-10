/**
 * @tokenisation/pack-supply-chain
 *
 * Supply Chain & Verification vertical pack for the Tokenisation SDK.
 * Includes warehouse receipts, verification credentials (education, IP, carbon),
 * and physical asset tokenization.
 *
 * @example
 * ```typescript
 * import { PackRegistry } from '@tokenisation/core';
 * import { supplyChainPack } from '@tokenisation/pack-supply-chain';
 *
 * const registry = new PackRegistry();
 * await registry.load(supplyChainPack);
 * ```
 */

import type { LoadedPack } from '@tokenisation/core';
import { manifest } from './manifest.js';

// ============================================================================
// Pack Loader
// ============================================================================

export const supplyChainPack: LoadedPack = {
  manifest,
  activate: (context) => {
    // Register supply-chain-specific workflows when the pack is loaded
  },
};

// ============================================================================
// Re-export manifest
// ============================================================================

export { manifest } from './manifest.js';

// ============================================================================
// Warehouse Receipt
// ============================================================================

export {
  WarehouseReceiptEngine,
  DocumentType,
  DocumentStatus,
  WAREHOUSE_RECEIPT_PACK,
  type WarehouseReceiptMetadata,
  type TransferRecord,
  type Operator,
  type Dispute,
} from './packs/WarehouseReceipt.js';

// ============================================================================
// Verification Credential
// ============================================================================

export {
  VerificationCredentialPack,
  createEducationalDegree,
  createCarbonCredit,
  createProfessionalLicense,
  type CredentialType,
  type VerificationCredentialConfig,
} from './packs/VerificationCredential.js';

// ============================================================================
// Physical Asset
// ============================================================================

export {
  PhysicalAssetPack,
  createAhoyCometBike,
  createCollectible,
  type PhysicalAssetConfig,
} from './packs/PhysicalAsset.js';

// ============================================================================
// Adapters
// ============================================================================

export {
  CarbonCreditAdapter,
  carbonCreditAdapter,
  type CarbonCreditInput,
  type CarbonCreditMetadata,
  type CarbonStandard,
  type ProjectType,
  type CreditStatus,
} from './adapters/CarbonCreditAdapter.js';
