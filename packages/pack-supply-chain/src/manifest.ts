import type { PackManifest } from '@tokenisation/core';

export const manifest: PackManifest = {
  id: 'supply-chain',
  version: '1.0.0',
  name: 'Supply Chain & Verification',
  description: 'Warehouse receipts, verification credentials (education, IP, carbon), and physical asset tokenization',

  assetTypes: [
    'WAREHOUSE_RECEIPT',
    'VERIFICATION_CREDENTIAL',
    'PHYSICAL_ASSET',
  ],

  rightTypes: ['OWNERSHIP', 'VERIFICATION'],

  chains: [1, 137, 8453], // Ethereum, Polygon, Base

  requires: [],

  extensions: {
    packs: [
      'WarehouseReceiptEngine',
      'VerificationCredentialPack',
      'PhysicalAssetPack',
    ],
    policies: [],
    workflows: [
      'tokenize-warehouse-receipt',
      'tokenize-verification-credential',
      'tokenize-physical-asset',
    ],
    serverPlugins: [],
    contracts: [],
    adapters: [],
    uiComponents: [],
  },

  tags: ['supply-chain', 'warehouse', 'verification', 'physical-asset', 'carbon-credit', 'education', 'trade-finance'],
};
