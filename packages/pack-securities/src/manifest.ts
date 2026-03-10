import type { PackManifest } from '@tokenisation/core';

export const manifest: PackManifest = {
  id: 'securities',
  version: '1.0.0',
  name: 'US Securities',
  description: 'SEC Regulation D compliant securities tokenization (Rule 506b and 506c)',

  assetTypes: [
    'US_SECURITIES_506C',
    'US_SECURITIES_506B',
  ],

  rightTypes: ['OWNERSHIP'],

  chains: [1, 137], // Ethereum, Polygon

  requires: [],

  extensions: {
    packs: [
      'usSecurities506cPack',
      'usSecurities506bPack',
    ],
    policies: [],
    workflows: [
      'tokenize-us-securities-506c',
      'tokenize-us-securities-506b',
    ],
    serverPlugins: [],
    contracts: [],
    adapters: [],
    uiComponents: [],
  },

  tags: ['securities', 'us', 'reg-d', '506c', '506b', 'accredited', 'private-placement'],
};
