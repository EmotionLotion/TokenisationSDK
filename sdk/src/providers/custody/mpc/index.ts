/**
 * MPC Custody Providers
 *
 * Multi-Party Computation (MPC) custody solutions for institutional-grade
 * key management without single points of failure.
 *
 * Available Providers:
 * - FireblocksCustodyProvider - Fireblocks institutional MPC
 * - LitProtocolCustodyProvider - Lit Protocol decentralized MPC
 * - Web3AuthCustodyProvider - Web3Auth social login MPC
 *
 * @example
 * ```typescript
 * import {
 *   FireblocksCustodyProvider,
 *   LitProtocolCustodyProvider,
 *   Web3AuthCustodyProvider,
 *   MPCSigner,
 * } from '@tokenisation/sdk';
 *
 * // Fireblocks for institutional custody
 * const fireblocks = new FireblocksCustodyProvider({
 *   apiKey: process.env.FIREBLOCKS_API_KEY!,
 *   apiSecret: process.env.FIREBLOCKS_API_SECRET!,
 * });
 *
 * // Lit Protocol for decentralized MPC
 * const lit = new LitProtocolCustodyProvider({
 *   network: 'cayenne',
 * });
 *
 * // Web3Auth for social login recovery
 * const web3Auth = new Web3AuthCustodyProvider({
 *   clientId: 'YOUR_CLIENT_ID',
 *   network: 'mainnet',
 * });
 *
 * // Create ethers.js signer from any MPC provider
 * const signer = await fireblocks.createSigner(accountId, 8453);
 * evmPlugin.connectSigner(signer);
 * ```
 *
 * @module
 */

// Interfaces and Types
export type {
  IMPCProvider,
  MPCKeyShare,
  MPCKeyGenParams,
  MPCSigningSession,
  MPCSigningSessionRequest,
  MPCSigningSessionStatus,
  MPCSigningParticipant,
  MPCProviderCapabilities,
  MPCProviderConfig,
  TypedData,
  TypedDataDomain,
  TypedDataType,
  TypedDataTypes,
} from './IMPCProvider.js';

// MPCSigner (ethers.js adapter)
export {
  MPCSigner,
  createMPCSigner,
  type MPCSignerConfig,
} from './MPCSigner.js';

// Abstract base class
export { AbstractMPCProvider } from './AbstractMPCProvider.js';

// Provider implementations
export {
  FireblocksCustodyProvider,
  createFireblocksProvider,
  type FireblocksConfig,
} from './FireblocksCustodyProvider.js';

export {
  LitProtocolCustodyProvider,
  createLitProtocolProvider,
  type LitProtocolConfig,
} from './LitProtocolCustodyProvider.js';

export {
  Web3AuthCustodyProvider,
  createWeb3AuthProvider,
  type Web3AuthConfig,
} from './Web3AuthCustodyProvider.js';
