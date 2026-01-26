/**
 * AddressAvatar - Visual representation of wallet addresses with copy functionality
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

// ============================================
// Types
// ============================================

export interface AddressAvatarProps {
  /** Wallet address */
  address: string;
  /** Size of the avatar */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Show the truncated address text */
  showAddress?: boolean;
  /** Number of characters to show at start/end */
  truncateChars?: number;
  /** Enable copy to clipboard */
  copyable?: boolean;
  /** Show explorer link */
  explorerUrl?: string;
  /** Custom label instead of address */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// Color Generation (Jazzicon-style)
// ============================================

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateColors(address: string): [string, string] {
  const hash = hashCode(address.toLowerCase());

  // Generate two contrasting colors from the hash
  const hue1 = hash % 360;
  const hue2 = (hash * 7) % 360;

  const color1 = `hsl(${hue1}, 70%, 50%)`;
  const color2 = `hsl(${hue2}, 70%, 60%)`;

  return [color1, color2];
}

// ============================================
// Styles
// ============================================

const sizeConfig = {
  xs: { avatar: 'w-5 h-5', text: 'text-xs', icon: 12 },
  sm: { avatar: 'w-6 h-6', text: 'text-xs', icon: 14 },
  md: { avatar: 'w-8 h-8', text: 'text-sm', icon: 16 },
  lg: { avatar: 'w-10 h-10', text: 'text-base', icon: 18 },
};

// ============================================
// Component
// ============================================

export function AddressAvatar({
  address,
  size = 'md',
  showAddress = true,
  truncateChars = 4,
  copyable = true,
  explorerUrl,
  label,
  className = '',
}: AddressAvatarProps) {
  const [copied, setCopied] = useState(false);
  const config = sizeConfig[size];

  // Generate avatar colors
  const [color1, color2] = useMemo(() => generateColors(address), [address]);

  // Truncate address
  const truncatedAddress = useMemo(() => {
    if (!address) return '';
    if (address.length <= truncateChars * 2 + 2) return address;
    return `${address.slice(0, truncateChars + 2)}...${address.slice(-truncateChars)}`;
  }, [address, truncateChars]);

  // Copy handler
  const handleCopy = useCallback(async () => {
    if (!copyable) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [address, copyable]);

  // Open explorer
  const handleExplorer = useCallback(() => {
    if (explorerUrl) {
      window.open(explorerUrl, '_blank', 'noopener,noreferrer');
    }
  }, [explorerUrl]);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Avatar */}
      <div
        className={`
          ${config.avatar} rounded-full flex-shrink-0
          ring-1 ring-white/10
        `}
        style={{
          background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
        }}
        title={address}
      />

      {/* Address/Label */}
      {showAddress && (
        <div className="flex items-center gap-1.5">
          <span className={`font-mono ${config.text} text-gray-300`}>
            {label || truncatedAddress}
          </span>

          {/* Copy button */}
          {copyable && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded hover:bg-white/10 transition-colors text-gray-500 hover:text-gray-300"
              title={copied ? 'Copied!' : 'Copy address'}
            >
              {copied ? (
                <Check size={config.icon} className="text-green-400" />
              ) : (
                <Copy size={config.icon} />
              )}
            </button>
          )}

          {/* Explorer link */}
          {explorerUrl && (
            <button
              type="button"
              onClick={handleExplorer}
              className="p-1 rounded hover:bg-white/10 transition-colors text-gray-500 hover:text-gray-300"
              title="View on explorer"
            >
              <ExternalLink size={config.icon} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Specialized Variants
// ============================================

export interface AddressListProps {
  addresses: Array<{
    address: string;
    label?: string;
    balance?: string;
  }>;
  explorerBaseUrl?: string;
  maxDisplay?: number;
  size?: AddressAvatarProps['size'];
  className?: string;
}

export function AddressList({
  addresses,
  explorerBaseUrl,
  maxDisplay = 5,
  size = 'sm',
  className = '',
}: AddressListProps) {
  const displayAddresses = addresses.slice(0, maxDisplay);
  const remaining = addresses.length - maxDisplay;

  return (
    <div className={`space-y-2 ${className}`}>
      {displayAddresses.map((item, index) => (
        <div key={item.address + index} className="flex items-center justify-between">
          <AddressAvatar
            address={item.address}
            label={item.label}
            size={size}
            explorerUrl={
              explorerBaseUrl ? `${explorerBaseUrl}/address/${item.address}` : undefined
            }
          />
          {item.balance && (
            <span className="text-sm text-gray-400 font-mono">{item.balance}</span>
          )}
        </div>
      ))}
      {remaining > 0 && (
        <div className="text-sm text-gray-500">+ {remaining} more addresses</div>
      )}
    </div>
  );
}

export interface ContractAddressProps {
  address: string;
  chainId?: number;
  verified?: boolean;
  size?: AddressAvatarProps['size'];
  className?: string;
}

const chainExplorers: Record<number, string> = {
  1: 'https://etherscan.io',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  8453: 'https://basescan.org',
};

export function ContractAddress({
  address,
  chainId = 1,
  verified = false,
  size = 'sm',
  className = '',
}: ContractAddressProps) {
  const explorerBase = chainExplorers[chainId] || chainExplorers[1];
  const explorerUrl = `${explorerBase}/address/${address}`;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <AddressAvatar
        address={address}
        size={size}
        explorerUrl={explorerUrl}
      />
      {verified && (
        <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30">
          Verified
        </span>
      )}
    </div>
  );
}
