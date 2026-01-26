/**
 * Chain Selector Component
 *
 * Allows users to switch between supported blockchain networks.
 */

import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useChain } from '../hooks/useChain';
import { type SupportedChainId } from '../config/wagmi';

interface ChainSelectorProps {
  showTestnets?: boolean;
  className?: string;
}

export function ChainSelector({ showTestnets = false, className = '' }: ChainSelectorProps) {
  const { currentChainId, currentChainMeta, mainnets, testnets, switchTo, isSwitching, chainMetadata } = useChain();
  const [isOpen, setIsOpen] = useState(false);

  const chains = showTestnets ? [...mainnets, ...testnets] : mainnets;

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
      >
        <span className="text-lg">{currentChainMeta?.icon || '⟠'}</span>
        <span className="text-white text-sm font-medium">
          {currentChainMeta?.name || 'Select Network'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50">
            <div className="p-2">
              <p className="px-3 py-2 text-xs text-gray-500 uppercase font-semibold">
                {showTestnets ? 'All Networks' : 'Mainnets'}
              </p>

              {chains.map(chain => {
                const meta = chainMetadata[chain.id as SupportedChainId];
                const isActive = chain.id === currentChainId;

                return (
                  <button
                    key={chain.id}
                    onClick={() => {
                      switchTo(chain.id);
                      setIsOpen(false);
                    }}
                    disabled={isSwitching}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-[#F8B032]/10 border border-[#F8B032]/30'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="text-lg">{meta?.icon || '⟠'}</span>
                    <span className="flex-1 text-left">
                      <span className="text-white text-sm font-medium">{chain.name}</span>
                      {meta?.isTestnet && (
                        <span className="ml-2 text-xs text-gray-500">Testnet</span>
                      )}
                    </span>
                    {isActive && <Check className="w-4 h-4 text-[#F8B032]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ChainSelector;
