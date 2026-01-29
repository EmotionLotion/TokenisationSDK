/**
 * WalletConnectButton Component
 *
 * Pre-built button component for connecting/disconnecting wallets.
 * Handles connection state, loading indicators, and error display.
 */

import React, { useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useWallet } from '../hooks/useWallet.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Button variant styles
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline';

/**
 * Button size options
 */
export type ButtonSize = 'small' | 'medium' | 'large';

/**
 * Props for WalletConnectButton
 */
export interface WalletConnectButtonProps {
  /** Button variant style */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Show wallet address when connected */
  showAddress?: boolean;
  /** Show chain name when connected */
  showChain?: boolean;
  /** Custom connected label */
  connectedLabel?: string;
  /** Custom disconnected label */
  disconnectedLabel?: string;
  /** Custom connecting label */
  connectingLabel?: string;
  /** Called when connection succeeds */
  onConnect?: () => void;
  /** Called when disconnection succeeds */
  onDisconnect?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Custom container style */
  style?: ViewStyle;
  /** Custom text style */
  textStyle?: TextStyle;
  /** Custom colors */
  colors?: {
    primary?: string;
    secondary?: string;
    text?: string;
    textSecondary?: string;
    border?: string;
    error?: string;
  };
}

// ============================================================================
// DEFAULT COLORS
// ============================================================================

const DEFAULT_COLORS = {
  primary: '#3b82f6',
  secondary: '#1f2937',
  text: '#ffffff',
  textSecondary: '#6b7280',
  border: '#d1d5db',
  error: '#ef4444',
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * WalletConnectButton - Pre-built wallet connection button
 *
 * @example
 * ```tsx
 * function Header() {
 *   return (
 *     <WalletConnectButton
 *       variant="primary"
 *       size="medium"
 *       showAddress
 *       onConnect={() => console.log('Connected!')}
 *       onError={(err) => Alert.alert('Error', err.message)}
 *     />
 *   );
 * }
 * ```
 */
export function WalletConnectButton({
  variant = 'primary',
  size = 'medium',
  showAddress = true,
  showChain = false,
  connectedLabel,
  disconnectedLabel = 'Connect Wallet',
  connectingLabel = 'Connecting...',
  onConnect,
  onDisconnect,
  onError,
  disabled = false,
  style,
  textStyle,
  colors: customColors,
}: WalletConnectButtonProps): JSX.Element {
  const {
    isConnected,
    isConnecting,
    shortAddress,
    chainName,
    connect,
    disconnect,
    error,
  } = useWallet();

  const colors = { ...DEFAULT_COLORS, ...customColors };

  // Handle button press
  const handlePress = useCallback(async () => {
    try {
      if (isConnected) {
        await disconnect();
        onDisconnect?.();
      } else {
        await connect();
        onConnect?.();
      }
    } catch (err) {
      const buttonError = err instanceof Error ? err : new Error('Connection failed');
      onError?.(buttonError);
    }
  }, [isConnected, connect, disconnect, onConnect, onDisconnect, onError]);

  // Get button label
  const getLabel = useCallback((): string => {
    if (isConnecting) return connectingLabel;
    if (isConnected) {
      if (connectedLabel) return connectedLabel;
      if (showAddress && shortAddress) return shortAddress;
      return 'Disconnect';
    }
    return disconnectedLabel;
  }, [isConnecting, isConnected, connectedLabel, disconnectedLabel, connectingLabel, showAddress, shortAddress]);

  // Get button styles based on variant
  const getButtonStyle = useCallback((): ViewStyle => {
    const baseStyle: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    };

    // Size styles
    switch (size) {
      case 'small':
        baseStyle.paddingHorizontal = 12;
        baseStyle.paddingVertical = 8;
        break;
      case 'large':
        baseStyle.paddingHorizontal = 24;
        baseStyle.paddingVertical = 16;
        break;
      default: // medium
        baseStyle.paddingHorizontal = 16;
        baseStyle.paddingVertical = 12;
    }

    // Variant styles
    switch (variant) {
      case 'secondary':
        baseStyle.backgroundColor = colors.secondary;
        break;
      case 'outline':
        baseStyle.backgroundColor = 'transparent';
        baseStyle.borderWidth = 1;
        baseStyle.borderColor = colors.border;
        break;
      default: // primary
        baseStyle.backgroundColor = colors.primary;
    }

    // Disabled state
    if (disabled || isConnecting) {
      baseStyle.opacity = 0.6;
    }

    return baseStyle;
  }, [variant, size, colors, disabled, isConnecting]);

  // Get text styles based on variant and size
  const getTextStyle = useCallback((): TextStyle => {
    const baseStyle: TextStyle = {
      fontWeight: '600',
    };

    // Size styles
    switch (size) {
      case 'small':
        baseStyle.fontSize = 14;
        break;
      case 'large':
        baseStyle.fontSize = 18;
        break;
      default: // medium
        baseStyle.fontSize = 16;
    }

    // Variant styles
    switch (variant) {
      case 'outline':
        baseStyle.color = colors.secondary;
        break;
      default:
        baseStyle.color = colors.text;
    }

    return baseStyle;
  }, [variant, size, colors]);

  return (
    <View>
      <TouchableOpacity
        style={[getButtonStyle(), style]}
        onPress={handlePress}
        disabled={disabled || isConnecting}
        activeOpacity={0.7}
      >
        {isConnecting && (
          <ActivityIndicator
            size="small"
            color={variant === 'outline' ? colors.primary : colors.text}
            style={styles.spinner}
          />
        )}
        <Text style={[getTextStyle(), textStyle]}>
          {getLabel()}
        </Text>
      </TouchableOpacity>

      {/* Chain indicator when connected */}
      {isConnected && showChain && chainName && (
        <View style={styles.chainContainer}>
          <View style={[styles.chainDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.chainText, { color: colors.textSecondary }]}>
            {chainName}
          </Text>
        </View>
      )}

      {/* Error display */}
      {error && (
        <Text style={[styles.errorText, { color: colors.error }]}>
          {error.message}
        </Text>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  spinner: {
    marginRight: 8,
  },
  chainContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  chainDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  chainText: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});

export default WalletConnectButton;
