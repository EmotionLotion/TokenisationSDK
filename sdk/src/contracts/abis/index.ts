/**
 * Contract ABI Exports
 *
 * Type-safe exports of contract ABIs for use with viem/ethers.
 * ABIs are extracted from the compiled Solidity contracts.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const ComplianceTokenAbi = require('./ComplianceToken.json');
const IdentityRegistryAbi = require('./IdentityRegistry.json');
const DividendDistributorAbi = require('./DividendDistributor.json');
const ModularComplianceAbi = require('./ModularCompliance.json');
const ClaimTopicsRegistryAbi = require('./ClaimTopicsRegistry.json');
const TrustedIssuersRegistryAbi = require('./TrustedIssuersRegistry.json');
const OracleRegistryAbi = require('./OracleRegistry.json');
const ChainlinkPriceFeedAbi = require('./ChainlinkPriceFeed.json');

export const abis = {
  ComplianceToken: ComplianceTokenAbi as readonly unknown[],
  IdentityRegistry: IdentityRegistryAbi as readonly unknown[],
  DividendDistributor: DividendDistributorAbi as readonly unknown[],
  ModularCompliance: ModularComplianceAbi as readonly unknown[],
  ClaimTopicsRegistry: ClaimTopicsRegistryAbi as readonly unknown[],
  TrustedIssuersRegistry: TrustedIssuersRegistryAbi as readonly unknown[],
  OracleRegistry: OracleRegistryAbi as readonly unknown[],
  ChainlinkPriceFeed: ChainlinkPriceFeedAbi as readonly unknown[],
} as const;

export {
  ComplianceTokenAbi,
  IdentityRegistryAbi,
  DividendDistributorAbi,
  ModularComplianceAbi,
  ClaimTopicsRegistryAbi,
  TrustedIssuersRegistryAbi,
  OracleRegistryAbi,
  ChainlinkPriceFeedAbi,
};

export type ContractName = keyof typeof abis;
