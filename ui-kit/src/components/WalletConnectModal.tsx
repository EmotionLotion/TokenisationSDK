import React, { useState, useEffect, useRef } from 'react';
import {
    Wallet, Lock, Loader2, AlertTriangle, X,
    ChevronRight, QrCode
} from 'lucide-react';

/**
 * Props for the WalletConnectModal component
 */
export interface WalletConnectProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback when modal is closed */
    onClose: () => void;
    /** Callback when wallet is connected */
    onConnect: (wallet: WalletInfo) => void;
    /** Optional list of supported wallet IDs */
    supportedWallets?: string[];
}

/**
 * Information about a connected wallet
 */
export interface WalletInfo {
    address: string;
    chainId: number;
    walletType: string;
}

const WALLET_OPTIONS = [
    { id: 'metamask', name: 'MetaMask', icon: '🦊', popular: true },
    { id: 'walletconnect', name: 'WalletConnect', icon: '🔗', popular: true },
    { id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵', popular: true },
    { id: 'rainbow', name: 'Rainbow', icon: '🌈', popular: false },
    { id: 'trust', name: 'Trust Wallet', icon: '🛡️', popular: false },
    { id: 'ledger', name: 'Ledger', icon: '📟', popular: false },
];

/**
 * Embeddable wallet connection modal.
 * 
 * @example
 * ```tsx
 * import { WalletConnectModal } from '@tokenisation/ui-kit';
 * 
 * function App() {
 *   const [showWallet, setShowWallet] = useState(false);
 *   
 *   return (
 *     <WalletConnectModal
 *       isOpen={showWallet}
 *       onClose={() => setShowWallet(false)}
 *       onConnect={(wallet) => {
 *         console.log('Connected:', wallet.address);
 *         setShowWallet(false);
 *       }}
 *     />
 *   );
 * }
 * ```
 */
export function WalletConnectModal({ isOpen, onClose, onConnect, supportedWallets }: WalletConnectProps) {
    const [connecting, setConnecting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    // Focus management and keyboard handling
    useEffect(() => {
        if (isOpen) {
            previousFocusRef.current = document.activeElement as HTMLElement;
            requestAnimationFrame(() => {
                modalRef.current?.focus();
            });
        } else if (previousFocusRef.current) {
            previousFocusRef.current.focus();
            previousFocusRef.current = null;
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }

            if (e.key === 'Tab' && modalRef.current) {
                const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                const first = focusableElements[0];
                const last = focusableElements[focusableElements.length - 1];

                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const availableWallets = supportedWallets
        ? WALLET_OPTIONS.filter(w => supportedWallets.includes(w.id))
        : WALLET_OPTIONS;

    const handleConnect = async (walletId: string) => {
        setConnecting(walletId);
        setError(null);

        // Simulate wallet connection
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Mock successful connection
        const mockWallet: WalletInfo = {
            address: '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
            chainId: 137, // Polygon
            walletType: walletId,
        };

        setConnecting(null);
        onConnect(mockWallet);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="presentation">
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="wallet-modal-title"
                aria-busy={connecting !== null}
                tabIndex={-1}
                style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
                className="w-full max-w-sm rounded-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#F8B032]/20 flex items-center justify-center">
                            <Wallet className="w-4 h-4 text-[#F8B032]" aria-hidden="true" />
                        </div>
                        <span id="wallet-modal-title" className="text-sm font-bold text-white">Connect Wallet</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        aria-label="Close wallet connection dialog"
                    >
                        <X className="w-4 h-4 text-gray-400" aria-hidden="true" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-2">
                    <p className="text-sm text-gray-400 mb-4">
                        Choose your preferred wallet to connect
                    </p>

                    {/* Popular Wallets */}
                    <div className="space-y-2" role="group" aria-label="Popular wallets">
                        {availableWallets.filter(w => w.popular).map(wallet => (
                            <button
                                key={wallet.id}
                                onClick={() => handleConnect(wallet.id)}
                                disabled={connecting !== null}
                                aria-disabled={connecting !== null}
                                aria-label={`Connect with ${wallet.name}${connecting === wallet.id ? ' - connecting' : ''}`}
                                aria-busy={connecting === wallet.id}
                                className="w-full p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{wallet.icon}</span>
                                    <span className="text-sm font-medium text-white">{wallet.name}</span>
                                </div>
                                {connecting === wallet.id ? (
                                    <Loader2 className="w-4 h-4 text-[#F8B032] animate-spin" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Other Wallets */}
                    {availableWallets.some(w => !w.popular) && (
                        <>
                            <div className="flex items-center gap-3 py-3">
                                <div className="flex-1 h-px bg-white/10" />
                                <span className="text-xs text-gray-500">More options</span>
                                <div className="flex-1 h-px bg-white/10" />
                            </div>

                            <div className="grid grid-cols-3 gap-2" role="group" aria-label="More wallet options">
                                {availableWallets.filter(w => !w.popular).map(wallet => (
                                    <button
                                        key={wallet.id}
                                        onClick={() => handleConnect(wallet.id)}
                                        disabled={connecting !== null}
                                        aria-disabled={connecting !== null}
                                        aria-label={`Connect with ${wallet.name}${connecting === wallet.id ? ' - connecting' : ''}`}
                                        aria-busy={connecting === wallet.id}
                                        className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all flex flex-col items-center gap-2"
                                    >
                                        <span className="text-xl">{wallet.icon}</span>
                                        <span className="text-xs text-gray-400">{wallet.name}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {/* QR Code Option */}
                    <div className="pt-4">
                        <button className="w-full p-3 border border-dashed border-white/20 rounded-xl hover:border-[#F8B032]/50 transition-all flex items-center justify-center gap-2 text-gray-400 hover:text-white" aria-label="Connect wallet by scanning QR code">
                            <QrCode className="w-4 h-4" aria-hidden="true" />
                            <span className="text-sm">Scan QR Code</span>
                        </button>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2" role="alert">
                            <AlertTriangle className="w-4 h-4 text-red-400" aria-hidden="true" />
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-4 flex items-center justify-center gap-2 text-xs text-gray-500">
                    <Lock className="w-3 h-3" />
                    <span>Non-custodial connection</span>
                </div>
            </div>
        </div>
    );
}
