/**
 * Wallet Pass Connectors
 *
 * Provides unified pass generation for Apple Wallet and Google Pay.
 */

export * from './types.js';
export { AppleWalletProvider } from './AppleWalletProvider.js';
export { GooglePayProvider } from './GooglePayProvider.js';

import { AppleWalletProvider } from './AppleWalletProvider.js';
import { GooglePayProvider } from './GooglePayProvider.js';
import {
  AppleWalletConfig,
  GooglePayConfig,
  WalletPassError,
} from './types.js';

/**
 * Supported wallet platforms
 */
export type WalletPlatform = 'apple' | 'google';

/**
 * Factory function to create a wallet pass provider
 *
 * @param platform - The wallet platform ('apple' or 'google')
 * @param config - Platform-specific configuration
 * @returns A configured wallet pass provider
 *
 * @example
 * ```typescript
 * // Apple Wallet
 * const appleProvider = createWalletPassProvider('apple', {
 *   passTypeIdentifier: 'pass.com.example.ticket',
 *   teamIdentifier: 'ABCDE12345',
 *   signingCertificate: fs.readFileSync('certificate.p12'),
 *   certificatePassword: 'password123',
 * });
 *
 * // Google Pay
 * const googleProvider = createWalletPassProvider('google', {
 *   issuerId: '1234567890',
 *   serviceAccountKey: require('./service-account.json'),
 * });
 * ```
 */
export function createWalletPassProvider(
  platform: 'apple',
  config: AppleWalletConfig
): AppleWalletProvider;
export function createWalletPassProvider(
  platform: 'google',
  config: GooglePayConfig
): GooglePayProvider;
export function createWalletPassProvider(
  platform: WalletPlatform,
  config: AppleWalletConfig | GooglePayConfig
): AppleWalletProvider | GooglePayProvider {
  switch (platform) {
    case 'apple':
      return new AppleWalletProvider(config as AppleWalletConfig);
    case 'google':
      return new GooglePayProvider(config as GooglePayConfig);
    default:
      throw new WalletPassError(
        `Unsupported wallet platform: ${platform}`,
        platform as 'apple' | 'google',
        'UNSUPPORTED_PLATFORM'
      );
  }
}

/**
 * Check if a platform is supported
 */
export function isWalletPlatformSupported(platform: string): platform is WalletPlatform {
  return platform === 'apple' || platform === 'google';
}
