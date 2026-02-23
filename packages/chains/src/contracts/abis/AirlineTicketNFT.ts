/**
 * ABI for the AirlineTicketNFT smart contract.
 * Generated from contracts/src/tokens/AirlineTicketNFT.sol
 */
export const AIRLINE_TICKET_NFT_ABI = [
  // ERC721 Core
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'ownerOf', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'tokenURI', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getApproved', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'setApprovalForAll', inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'isApprovedForAll', inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'transferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'safeTransferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'supportsInterface', inputs: [{ name: 'interfaceId', type: 'bytes4' }], outputs: [{ type: 'bool' }], stateMutability: 'pure' },

  // Ticket Issuance
  {
    type: 'function', name: 'issueTicket', stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'flightNumber', type: 'string' },
      { name: 'airline', type: 'string' },
      { name: 'departureTime', type: 'uint256' },
      { name: 'arrivalTime', type: 'uint256' },
      { name: 'departureAirport', type: 'string' },
      { name: 'arrivalAirport', type: 'string' },
      { name: 'gate', type: 'string' },
      { name: 'seat', type: 'string' },
      { name: 'ticketClass', type: 'uint8' },
      { name: 'maxTransfers', type: 'uint8' },
      { name: 'transferable', type: 'bool' },
    ],
    outputs: [{ type: 'uint256' }],
  },

  // Lifecycle
  { type: 'function', name: 'checkIn', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'board', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'completeAndBurn', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'cancelTicket', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'reason', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'processRefund', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },

  // Dynamic Metadata
  { type: 'function', name: 'updateGate', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'newGate', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'updateSeat', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'newSeat', type: 'string' }, { name: 'newClass', type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'updateDepartureTime', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'newDepartureTime', type: 'uint256' }, { name: 'newArrivalTime', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setTicketURI', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'uri', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },

  // Query
  {
    type: 'function', name: 'getTicketData', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'flightNumber', type: 'string' },
        { name: 'airline', type: 'string' },
        { name: 'departureTime', type: 'uint256' },
        { name: 'arrivalTime', type: 'uint256' },
        { name: 'departureAirport', type: 'string' },
        { name: 'arrivalAirport', type: 'string' },
        { name: 'gate', type: 'string' },
        { name: 'seat', type: 'string' },
        { name: 'ticketClass', type: 'uint8' },
        { name: 'status', type: 'uint8' },
        { name: 'issuedAt', type: 'uint256' },
        { name: 'checkedInAt', type: 'uint256' },
        { name: 'boardedAt', type: 'uint256' },
        { name: 'transferCount', type: 'uint8' },
        { name: 'maxTransfers', type: 'uint8' },
        { name: 'transferable', type: 'bool' },
        { name: 'metadataVersion', type: 'uint256' },
        { name: 'pricePaid', type: 'uint256' },
        { name: 'originalBuyer', type: 'address' },
      ],
    }],
  },
  { type: 'function', name: 'isTicketValid', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  {
    type: 'function', name: 'canTransfer', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'allowed', type: 'bool' }, { name: 'reason', type: 'string' }],
  },
  { type: 'function', name: 'getActiveTicketCount', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getMetadataVersion', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },

  // Admin
  { type: 'function', name: 'addAirline', inputs: [{ name: 'airline', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'removeAirline', inputs: [{ name: 'airline', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addAgent', inputs: [{ name: 'agent', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'removeAgent', inputs: [{ name: 'agent', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'pause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },

  // Events
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'tokenId', type: 'uint256', indexed: true }] },
  { type: 'event', name: 'TicketIssued', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'flightNumber', type: 'string' }, { name: 'departureTime', type: 'uint256' }] },
  { type: 'event', name: 'TicketCheckedIn', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'passenger', type: 'address', indexed: true }] },
  { type: 'event', name: 'TicketBoarded', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'passenger', type: 'address', indexed: true }] },
  { type: 'event', name: 'TicketBurned', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'lastOwner', type: 'address', indexed: true }] },
  { type: 'event', name: 'TicketCancelled', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'reason', type: 'string' }] },
  { type: 'event', name: 'TicketRefunded', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }] },
  { type: 'event', name: 'TicketExpired', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'departureTime', type: 'uint256' }, { name: 'currentTime', type: 'uint256' }] },
  { type: 'event', name: 'TicketTransferred', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'transferCount', type: 'uint8' }] },
  { type: 'event', name: 'GateChanged', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'oldGate', type: 'string' }, { name: 'newGate', type: 'string' }] },
  { type: 'event', name: 'SeatChanged', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'oldSeat', type: 'string' }, { name: 'newSeat', type: 'string' }, { name: 'newClass', type: 'uint8' }] },
  { type: 'event', name: 'FlightDelayed', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'oldDeparture', type: 'uint256' }, { name: 'newDeparture', type: 'uint256' }] },
  { type: 'event', name: 'MetadataUpdated', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'field', type: 'string' }, { name: 'newValue', type: 'string' }, { name: 'version', type: 'uint256' }] },
  { type: 'event', name: 'AutoExpiryTriggered', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'departureTime', type: 'uint256' }] },
  { type: 'event', name: 'AutoRefundTriggered', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'amount', type: 'uint256' }] },
] as const;

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
