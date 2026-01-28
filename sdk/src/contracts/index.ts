/**
 * Contracts module exports
 *
 * This module contains token adapters, ABIs, and Solidity contract sources.
 */

export * from './adapters/index.js';

// Contract ABIs (extracted from compiled Solidity)
export * from './abis/index.js';

// Typed Contract Adapters (wraps ChainService with typed methods)
export { AirlineTicketContract, OnChainTicketClass, OnChainTicketStatus } from './AirlineTicketContract.js';
export type { OnChainTicketData } from './AirlineTicketContract.js';
export { ComplianceTokenContract } from './ComplianceTokenContract.js';

// Inline ABIs (TypeScript-native, no JSON files needed)
export { AIRLINE_TICKET_NFT_ABI, COMPLIANCE_TOKEN_ABI, IDENTITY_REGISTRY_ABI } from './abis/AirlineTicketNFT.js';

// Note: Solidity contracts are in ./solidity/ directory
// They need to be compiled using Foundry or Hardhat before deployment
