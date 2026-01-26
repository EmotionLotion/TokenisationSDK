import React, { useState } from 'react';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { useTokenisation } from '../context/TokenisationProvider';
import { KYCModal } from './KYCModal';
import { WalletConnectModal, WalletInfo } from './WalletConnectModal';

/**
 * Props for the InvestButton component
 */
export interface InvestButtonProps {
    /** Asset ID to invest in */
    assetId: string;
    /** Amount to invest (in base units) */
    amount: string;
    /** Callback on successful investment */
    onSuccess?: (txHash: string) => void;
    /** Callback on error */
    onError?: (error: Error) => void;
    /** Custom button label */
    label?: string;
    /** Custom class name */
    className?: string;
    /** Whether KYC is required */
    requiresKyc?: boolean;
}

type InvestStep = 'idle' | 'kyc' | 'wallet' | 'confirm' | 'processing' | 'success' | 'error';

/**
 * One-click investment button that handles the complete flow:
 * KYC verification → Wallet connection → Investment transaction
 *
 * @example
 * ```tsx
 * import { InvestButton } from '@tokenisation/ui-kit';
 *
 * function AssetPage({ asset }) {
 *   return (
 *     <InvestButton
 *       assetId={asset.id}
 *       amount="1000"
 *       onSuccess={(tx) => console.log('Invested!', tx)}
 *       onError={(err) => console.error('Failed:', err)}
 *     />
 *   );
 * }
 * ```
 */
export function InvestButton({
    assetId,
    amount,
    onSuccess,
    onError,
    label = 'Invest Now',
    className = '',
    requiresKyc = true,
}: InvestButtonProps) {
    const { api, isReady, user, events, theme } = useTokenisation();
    const [step, setStep] = useState<InvestStep>('idle');
    const [wallet, setWallet] = useState<WalletInfo | null>(null);
    const [kycVerified, setKycVerified] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const primaryColor = theme?.colors?.primary || '#F8B032';

    const handleClick = async () => {
        // If KYC is required and not verified, show KYC modal
        if (requiresKyc && !kycVerified && !user?.kycVerified) {
            setStep('kyc');
            return;
        }

        // If no wallet connected, show wallet modal
        if (!wallet) {
            setStep('wallet');
            return;
        }

        // Proceed to confirm
        setStep('confirm');
    };

    const handleKycComplete = () => {
        setKycVerified(true);
        setStep('wallet'); // Next step: connect wallet
    };

    const handleWalletConnect = (connectedWallet: WalletInfo) => {
        setWallet(connectedWallet);
        setStep('confirm');
    };

    const executeInvestment = async () => {
        setStep('processing');
        setError(null);

        // Emit pending event
        events.emit('transaction:pending', {
            txHash: '',
            type: 'mint',
        });

        try {
            // Execute the mint operation via API
            const result = await api.tokens.mint(assetId, wallet!.address, amount);

            if (result.success) {
                setStep('success');

                // Generate transaction hash from event or timestamp
                const txHash = result.event?.id || `tx_${Date.now()}`;

                // Emit confirmed event
                events.emit('transaction:confirmed', {
                    txHash,
                    type: 'mint',
                    blockNumber: 0,
                });

                onSuccess?.(txHash);

                // Reset after 3 seconds
                setTimeout(() => {
                    setStep('idle');
                }, 3000);
            } else {
                throw new Error('Investment failed');
            }
        } catch (err: any) {
            const errorMessage = err.message || 'Investment failed';
            setError(errorMessage);
            setStep('error');

            // Emit failed event
            events.emit('transaction:failed', {
                type: 'mint',
                error: errorMessage,
            });

            onError?.(err);
        }
    };

    const renderButton = () => {
        switch (step) {
            case 'processing':
                return (
                    <button
                        disabled
                        className={`flex items-center justify-center gap-2 py-3 px-6 text-black font-bold rounded-xl cursor-not-allowed opacity-50 ${className}`}
                        style={{ background: primaryColor }}
                    >
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                    </button>
                );

            case 'success':
                return (
                    <button
                        disabled
                        className={`flex items-center justify-center gap-2 py-3 px-6 bg-green-500 text-white font-bold rounded-xl ${className}`}
                    >
                        <CheckCircle className="w-4 h-4" />
                        Investment Complete!
                    </button>
                );

            case 'error':
                return (
                    <button
                        onClick={handleClick}
                        className={`flex items-center justify-center gap-2 py-3 px-6 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors ${className}`}
                    >
                        <AlertTriangle className="w-4 h-4" />
                        Retry Investment
                    </button>
                );

            default:
                return (
                    <button
                        onClick={handleClick}
                        disabled={!isReady}
                        className={`py-3 px-6 text-black font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 ${className}`}
                        style={{ background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}dd)` }}
                    >
                        {label}
                    </button>
                );
        }
    };

    return (
        <>
            {renderButton()}

            {/* KYC Modal */}
            <KYCModal
                isOpen={step === 'kyc'}
                onClose={() => setStep('idle')}
                onComplete={handleKycComplete}
                config={{ requiredTier: 'STANDARD' }}
            />

            {/* Wallet Connect Modal */}
            <WalletConnectModal
                isOpen={step === 'wallet'}
                onClose={() => setStep('idle')}
                onConnect={handleWalletConnect}
            />

            {/* Confirmation Modal */}
            {step === 'confirm' && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div
                        className="w-full max-w-sm rounded-2xl p-6"
                        style={{ background: theme?.colors?.backgroundSecondary || 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        <h3 className="text-lg font-bold text-white mb-4">Confirm Investment</h3>

                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Asset</span>
                                <span className="text-white font-mono">{assetId.slice(0, 12)}...</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Amount</span>
                                <span className="text-white font-mono">{Number(amount).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Wallet</span>
                                <span className="text-white font-mono">{wallet?.address.slice(0, 6)}...{wallet?.address.slice(-4)}</span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('idle')}
                                className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeInvestment}
                                className="flex-1 py-2.5 text-black font-bold rounded-lg"
                                style={{ background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}dd)` }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
