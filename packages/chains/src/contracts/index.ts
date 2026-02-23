/**
 * Contracts module exports
 *
 * This module contains token adapters, ABIs, and Solidity contract sources.
 */

export * from './adapters/index.js';

// Contract ABIs (extracted from compiled Solidity)
export * from './abis/index.js';

// Typed Contract Adapters (wraps ChainService with typed methods)
export { ComplianceTokenContract } from './ComplianceTokenContract.js';

// Inline ABIs (TypeScript-native, no JSON files needed)
export { COMPLIANCE_TOKEN_ABI, IDENTITY_REGISTRY_ABI } from './abis/CoreContracts.js';

// Validation schemas for contract operations (explicit to avoid collision with chainlink plugins)
export {
  TokenAmountSchema,
  TokenAmountOrZeroSchema,
  TokenIdSchema,
  BatchMintParamsSchema,
  ERC20AdapterConfigSchema,
  ERC721AdapterConfigSchema,
  ERC1155AdapterConfigSchema,
  validateOrThrow,
  validateToResult,
  isValidAddress,
  isValidAmount,
} from './validation.js';

// Note: Solidity contracts are in ./solidity/ directory
// They need to be compiled using Foundry or Hardhat before deployment
