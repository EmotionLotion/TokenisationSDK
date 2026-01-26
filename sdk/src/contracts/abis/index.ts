/**
 * Contract ABI Exports
 *
 * Type-safe exports of contract ABIs for use with viem/ethers.
 * ABIs are extracted from the compiled Solidity contracts.
 */

import ComplianceTokenAbi from './ComplianceToken.json' with { type: 'json' };
import IdentityRegistryAbi from './IdentityRegistry.json' with { type: 'json' };
import DividendDistributorAbi from './DividendDistributor.json' with { type: 'json' };
import ModularComplianceAbi from './ModularCompliance.json' with { type: 'json' };
import ClaimTopicsRegistryAbi from './ClaimTopicsRegistry.json' with { type: 'json' };
import TrustedIssuersRegistryAbi from './TrustedIssuersRegistry.json' with { type: 'json' };
import OracleRegistryAbi from './OracleRegistry.json' with { type: 'json' };
import ChainlinkPriceFeedAbi from './ChainlinkPriceFeed.json' with { type: 'json' };

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
