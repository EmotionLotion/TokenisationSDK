/**
 * Wallet Button Component
 *
 * Displays wallet connection status and allows connecting/disconnecting.
 */

import React, { useState } from 'react';
import { Wallet, ChevronDown, LogOut, Copy, ExternalLink, Check } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useAuth } from '../contexts/AuthContext';
import { chainMetadata, type SupportedChainId } from '../config/wagmi';

export function WalletButton() {
  const { address, chainId, isConnected, isConnecting, connect, disconnect, connectors, displayAddress, displayBalance, currentChain } = useWallet();
  const { isAuthenticated, signIn, signOut, isLoading: isAuthLoading, party } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSignIn = async () => {
    try {
      await signIn();
      setShowDropdown(false);
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setShowDropdown(false);
  };

  const handleConnect = async (connectorId: string) => {
    const connector = connectors.find(c => c.id === connectorId);
    if (connector) {
      connect({ connector });
      setShowConnectors(false);
    }
  };

  // Not connected - show connect button
  if (!isConnected) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowConnectors(!showConnectors)}
          disabled={isConnecting}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#D69A31] text-black font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Wallet className="w-4 h-4" />
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>

        {showConnectors && (
          <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50">
            <div className="p-3 border-b border-white/10">
              <p className="text-sm text-gray-400">Select Wallet</p>
            </div>
            <div className="p-2">
              {connectors.map(connector => (
                <button
                  key={connector.id}
                  onClick={() => handleConnect(connector.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                    {connector.name === 'MetaMask' && '🦊'}
                    {connector.name === 'WalletConnect' && '🔗'}
                    {connector.name === 'Coinbase Wallet' && '🔵'}
                    {!['MetaMask', 'WalletConnect', 'Coinbase Wallet'].includes(connector.name) && '💼'}
                  </div>
                  <span className="text-white font-medium">{connector.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Connected but not authenticated
  if (!isAuthenticated) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/15 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{currentChain?.icon || '⟠'}</span>
            <span className="text-white font-medium">{displayAddress}</span>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>

        {showDropdown && (
          <div className="absolute right-0 mt-2 w-72 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50">
            <div className="p-4 border-b border-white/10">
              <p className="text-sm text-gray-400">Connected Wallet</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-white font-mono">{displayAddress}</span>
                <button onClick={handleCopyAddress} className="text-gray-400 hover:text-white">
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {displayBalance && (
                <p className="text-sm text-gray-400 mt-1">{displayBalance}</p>
              )}
            </div>

            <div className="p-2">
              <button
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="w-full flex items-center gap-3 px-3 py-3 bg-gradient-to-r from-[#F8B032]/20 to-[#D69A31]/20 border border-[#F8B032]/30 rounded-lg hover:border-[#F8B032]/50 transition-colors"
              >
                <Wallet className="w-5 h-5 text-[#F8B032]" />
                <div className="text-left">
                  <p className="text-white font-medium">
                    {isAuthLoading ? 'Signing In...' : 'Sign In with Ethereum'}
                  </p>
                  <p className="text-xs text-gray-400">Authenticate to manage assets</p>
                </div>
              </button>
            </div>

            <div className="p-2 border-t border-white/10">
              <button
                onClick={() => { disconnect(); setShowDropdown(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fully authenticated
  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-[#F8B032]/10 to-[#D69A31]/10 border border-[#F8B032]/30 rounded-lg hover:border-[#F8B032]/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{currentChain?.icon || '⟠'}</span>
          <div className="text-left">
            <p className="text-white font-medium text-sm">{party?.name || displayAddress}</p>
            <p className="text-xs text-gray-400">
              {party?.kycVerified ? '✓ Verified' : 'Not Verified'}
            </p>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50">
          {/* Header */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-semibold">{party?.name}</p>
                <p className="text-sm text-gray-400 font-mono">{displayAddress}</p>
              </div>
              <button onClick={handleCopyAddress} className="text-gray-400 hover:text-white p-2">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {displayBalance && (
              <p className="text-sm text-[#F8B032] mt-2">{displayBalance}</p>
            )}
          </div>

          {/* Party Info */}
          <div className="p-4 border-b border-white/10">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400">Type</p>
                <p className="text-white">{party?.type}</p>
              </div>
              <div>
                <p className="text-gray-400">Jurisdiction</p>
                <p className="text-white">{party?.jurisdiction}</p>
              </div>
              <div>
                <p className="text-gray-400">KYC Status</p>
                <p className={party?.kycVerified ? 'text-green-400' : 'text-yellow-400'}>
                  {party?.kycVerified ? 'Verified' : 'Pending'}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Network</p>
                <p className="text-white">{currentChain?.name}</p>
              </div>
            </div>
          </div>

          {/* Roles */}
          {party?.roles && party.roles.length > 0 && (
            <div className="p-4 border-b border-white/10">
              <p className="text-sm text-gray-400 mb-2">Roles</p>
              <div className="flex flex-wrap gap-2">
                {party.roles.map(role => (
                  <span
                    key={role}
                    className="px-2 py-1 bg-white/10 rounded text-xs text-white"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="p-2">
            <a
              href={`https://basescan.org/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-white/5 rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>View on Explorer</span>
            </a>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WalletButton;
