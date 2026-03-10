import type { PackManifest } from '@tokenisation/core';

export const manifest: PackManifest = {
  id: 'loyalty',
  version: '1.0.0',
  name: 'Loyalty & Behavior Scoring',
  description: 'Loyalty points, behavior scoring, driver reputation, and Ahoy ecosystem tokens',

  assetTypes: [
    'LOYALTY_POINTS',
    'BEHAVIOR_SCORE',
    'DRIVER_REPUTATION',
    'FLY_PLUS_PASS',
    'H2O_UTILITY_CREDIT',
    'COMPUTE_CREDIT',
    'DATA_STREAM_ACCESS',
    'AHOY_TOKEN',
  ],

  rightTypes: ['BEHAVIOR', 'MEMBERSHIP'],

  chains: [1, 137, 8453], // Ethereum, Polygon, Base

  requires: [],

  extensions: {
    packs: [
      'LoyaltyPointsEngine',
      'BehaviorScorePack',
      'DriverReputationPack',
      'FlyPlusPassPack',
      'H2OUtilityCreditPack',
      'ComputeCreditPack',
      'DataStreamAccessPack',
      'AhoyTokenPack',
    ],
    policies: [],
    workflows: [
      'tokenize-loyalty-points',
      'tokenize-behavior-score',
      'tokenize-driver-reputation',
      'tokenize-fly-plus-pass',
    ],
    serverPlugins: [],
    contracts: [],
    adapters: [],
    uiComponents: [],
  },

  tags: ['loyalty', 'points', 'rewards', 'behavior', 'scoring', 'driver', 'ecosystem'],
};
