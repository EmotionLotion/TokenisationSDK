/**
 * Account Abstraction Interfaces
 *
 * ERC-4337 types and interfaces for:
 * - UserOperation (v0.7 format)
 * - Smart Accounts
 * - Bundlers
 * - Paymasters
 */

// UserOperation types
export type {
  PackedUserOperation,
  UserOperation,
  UnsignedUserOperation,
  PartialUserOperation,
  UserOperationReceipt,
  UserOperationLog,
  UserOperationByHash,
  UserOperationGasEstimate,
  UserOperationCall,
  UserOperationCalls,
} from './UserOperation.js';

export {
  packAccountGasLimits,
  unpackAccountGasLimits,
  packGasFees,
  unpackGasFees,
  packInitCode,
  unpackInitCode,
  packPaymasterAndData,
  packUserOperation,
  unpackUserOperation,
} from './UserOperation.js';

// Smart Account interfaces
export type {
  ISmartAccount,
  IMultiSigSmartAccount,
  ISessionKeyAccount,
  SmartAccountType,
  SmartAccountState,
  SmartAccountInfo,
  SmartAccountConfig,
  SessionKeyConfig,
} from './ISmartAccount.js';

// Bundler interfaces
export type {
  IBundler,
  BundlerStatus,
  BundlerConfig,
  BundlerChainConfig,
  BundlerGasPrices,
  SupportedEntryPoint,
  SendUserOperationOptions,
} from './IBundler.js';

// Paymaster interfaces
export type {
  IPaymaster,
  PaymasterType,
  PaymasterData,
  SponsorshipResult,
  TokenPaymasterQuote,
  VerifyingPaymasterConfig,
  TokenPaymasterConfig,
  SponsorPaymasterConfig,
  SponsorshipPolicy,
} from './IPaymaster.js';
