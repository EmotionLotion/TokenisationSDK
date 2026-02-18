/**
 * Core Contract ABIs
 *
 * Compliance and identity ABIs used across multiple verticals.
 * Extracted from AirlineTicketNFT.ts as they are not airline-specific.
 */

export const COMPLIANCE_TOKEN_ABI = [
  // ERC20 Core
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },

  // Compliance
  { type: 'function', name: 'mint', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'burn', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'freeze', inputs: [{ name: 'account', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unfreeze', inputs: [{ name: 'account', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'isFrozen', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'forceTransfer', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'reason', type: 'string' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'recoveryAddress', inputs: [{ name: 'lostWallet', type: 'address' }, { name: 'newWallet', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'canTransfer', stateMutability: 'view',
    inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }, { type: 'string' }],
  },
  { type: 'function', name: 'investorCount', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'isInvestor', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },

  // Admin
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'addAgent', inputs: [{ name: 'agent', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'removeAgent', inputs: [{ name: 'agent', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'pause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },

  // Events
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256' }] },
  { type: 'event', name: 'Frozen', inputs: [{ name: 'account', type: 'address', indexed: true }, { name: 'by', type: 'address', indexed: true }] },
  { type: 'event', name: 'Unfrozen', inputs: [{ name: 'account', type: 'address', indexed: true }, { name: 'by', type: 'address', indexed: true }] },
  { type: 'event', name: 'ForceTransfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }, { name: 'reason', type: 'string' }] },
] as const;

export const IDENTITY_REGISTRY_ABI = [
  { type: 'function', name: 'registerIdentity', inputs: [{ name: 'user', type: 'address' }, { name: 'identity', type: 'address' }, { name: 'country', type: 'uint16' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'removeIdentity', inputs: [{ name: 'user', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'hasIdentity', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getCountry', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint16' }], stateMutability: 'view' },
  { type: 'function', name: 'isVerified', inputs: [{ name: 'user', type: 'address' }, { name: 'requiredClaims', type: 'uint256[]' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
] as const;
