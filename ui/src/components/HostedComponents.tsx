import React, { useState } from 'react';
import {
    UserCheck, Wallet, Shield, CheckCircle, XCircle, AlertTriangle,
    Upload, Camera, FileText, Globe, Lock, Loader2, ExternalLink,
    Copy, ChevronRight, Sparkles, QrCode, X
} from 'lucide-react';

// =============================================================================
// HOSTED KYC MODAL - Embeddable KYC verification component
// Per StripeSDKPlan Section 9.2 - Hosted Components
// =============================================================================

interface KYCModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: (result: KYCResult) => void;
    config?: {
        requiredTier?: 'basic' | 'standard' | 'enhanced';
        jurisdiction?: string;
        customBranding?: {
            primaryColor?: string;
            logo?: string;
        };
    };
}

interface KYCResult {
    status: 'approved' | 'pending' | 'rejected';
    identityId: string;
    tier: string;
    checks: {
        identity: boolean;
        address: boolean;
        sanctions: boolean;
    };
}

type KYCStep = 'intro' | 'personal' | 'documents' | 'selfie' | 'review' | 'complete';

export function KYCModal({ isOpen, onClose, onComplete, config }: KYCModalProps) {
    const [step, setStep] = useState<KYCStep>('intro');
    const [isProcessing, setIsProcessing] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        dateOfBirth: '',
        nationality: '',
        address: '',
        city: '',
        country: '',
        postalCode: '',
    });
    const [documents, setDocuments] = useState<{
        idFront: File | null;
        idBack: File | null;
        selfie: File | null;
    }>({
        idFront: null,
        idBack: null,
        selfie: null,
    });

    if (!isOpen) return null;

    const primaryColor = config?.customBranding?.primaryColor || '#F8B032';

    const handleComplete = async () => {
        setIsProcessing(true);
        // Simulate KYC processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        const result: KYCResult = {
            status: 'approved',
            identityId: `id_${Date.now()}`,
            tier: config?.requiredTier || 'standard',
            checks: {
                identity: true,
                address: true,
                sanctions: true,
            },
        };

        setIsProcessing(false);
        setStep('complete');
        setTimeout(() => {
            onComplete(result);
        }, 1500);
    };

    const renderStep = () => {
        switch (step) {
            case 'intro':
                return (
                    <div className="text-center space-y-6">
                        <div className="w-20 h-20 mx-auto rounded-full bg-[#F8B032]/20 flex items-center justify-center">
                            <UserCheck className="w-10 h-10 text-[#F8B032]" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white mb-2">Identity Verification</h3>
                            <p className="text-gray-400 text-sm">
                                Complete a quick verification to access tokenized assets. This usually takes less than 5 minutes.
                            </p>
                        </div>

                        <div className="space-y-3 text-left">
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                                <FileText className="w-5 h-5 text-blue-400" />
                                <div>
                                    <p className="text-sm text-white">Valid ID Document</p>
                                    <p className="text-xs text-gray-500">Passport, Driver's License, or National ID</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                                <Camera className="w-5 h-5 text-purple-400" />
                                <div>
                                    <p className="text-sm text-white">Live Selfie</p>
                                    <p className="text-xs text-gray-500">We'll match your face to your ID</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                                <Shield className="w-5 h-5 text-green-400" />
                                <div>
                                    <p className="text-sm text-white">Secure & Private</p>
                                    <p className="text-xs text-gray-500">Your data is encrypted and protected</p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setStep('personal')}
                            className="w-full py-3 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-bold rounded-xl hover:shadow-lg transition-all"
                        >
                            Start Verification
                        </button>
                    </div>
                );

            case 'personal':
                return (
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1">Personal Information</h3>
                            <p className="text-sm text-gray-400">Enter your details as they appear on your ID</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">First Name</label>
                                <input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#F8B032]/50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Last Name</label>
                                <input
                                    type="text"
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#F8B032]/50"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Email</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#F8B032]/50"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Date of Birth</label>
                                <input
                                    type="date"
                                    value={formData.dateOfBirth}
                                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#F8B032]/50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Nationality</label>
                                <select
                                    value={formData.nationality}
                                    onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#F8B032]/50"
                                >
                                    <option value="">Select...</option>
                                    <option value="US">United States</option>
                                    <option value="UK">United Kingdom</option>
                                    <option value="SG">Singapore</option>
                                    <option value="DE">Germany</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Address</label>
                            <input
                                type="text"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#F8B032]/50"
                            />
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={() => setStep('intro')}
                                className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep('documents')}
                                className="flex-1 py-2.5 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-bold rounded-lg hover:shadow-lg transition-all"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                );

            case 'documents':
                return (
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1">Upload Documents</h3>
                            <p className="text-sm text-gray-400">Take clear photos of your identification</p>
                        </div>

                        <div className="space-y-3">
                            <div className="p-4 border-2 border-dashed border-white/20 rounded-xl hover:border-[#F8B032]/50 transition-colors cursor-pointer">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center">
                                        <Upload className="w-6 h-6 text-gray-400" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-white">ID Front</p>
                                        <p className="text-xs text-gray-500">
                                            {documents.idFront ? documents.idFront.name : 'Click to upload or drag and drop'}
                                        </p>
                                    </div>
                                    {documents.idFront && <CheckCircle className="w-5 h-5 text-green-400" />}
                                </div>
                            </div>

                            <div className="p-4 border-2 border-dashed border-white/20 rounded-xl hover:border-[#F8B032]/50 transition-colors cursor-pointer">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center">
                                        <Upload className="w-6 h-6 text-gray-400" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-white">ID Back</p>
                                        <p className="text-xs text-gray-500">
                                            {documents.idBack ? documents.idBack.name : 'Click to upload or drag and drop'}
                                        </p>
                                    </div>
                                    {documents.idBack && <CheckCircle className="w-5 h-5 text-green-400" />}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={() => setStep('personal')}
                                className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep('selfie')}
                                className="flex-1 py-2.5 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-bold rounded-lg hover:shadow-lg transition-all"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                );

            case 'selfie':
                return (
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1">Take a Selfie</h3>
                            <p className="text-sm text-gray-400">Position your face in the frame</p>
                        </div>

                        <div className="aspect-square max-w-[300px] mx-auto rounded-2xl bg-black/50 border border-white/10 flex items-center justify-center overflow-hidden">
                            <div className="w-48 h-48 border-2 border-dashed border-[#F8B032]/50 rounded-full flex items-center justify-center">
                                <Camera className="w-12 h-12 text-[#F8B032]" />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={() => setStep('documents')}
                                className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep('review')}
                                className="flex-1 py-2.5 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-bold rounded-lg hover:shadow-lg transition-all"
                            >
                                Capture
                            </button>
                        </div>
                    </div>
                );

            case 'review':
                return (
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1">Review & Submit</h3>
                            <p className="text-sm text-gray-400">Please verify your information before submitting</p>
                        </div>

                        <div className="space-y-3">
                            <div className="p-3 bg-white/5 rounded-lg flex items-center justify-between">
                                <span className="text-sm text-gray-400">Personal Info</span>
                                <CheckCircle className="w-4 h-4 text-green-400" />
                            </div>
                            <div className="p-3 bg-white/5 rounded-lg flex items-center justify-between">
                                <span className="text-sm text-gray-400">ID Documents</span>
                                <CheckCircle className="w-4 h-4 text-green-400" />
                            </div>
                            <div className="p-3 bg-white/5 rounded-lg flex items-center justify-between">
                                <span className="text-sm text-gray-400">Selfie Verification</span>
                                <CheckCircle className="w-4 h-4 text-green-400" />
                            </div>
                        </div>

                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-2">
                            <Shield className="w-4 h-4 text-blue-400 mt-0.5" />
                            <p className="text-xs text-blue-400">
                                By submitting, you consent to identity verification and acknowledge our privacy policy.
                            </p>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={() => setStep('selfie')}
                                className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                                disabled={isProcessing}
                            >
                                Back
                            </button>
                            <button
                                onClick={handleComplete}
                                disabled={isProcessing}
                                className="flex-1 py-2.5 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-bold rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    'Submit for Verification'
                                )}
                            </button>
                        </div>
                    </div>
                );

            case 'complete':
                return (
                    <div className="text-center space-y-6 py-8">
                        <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                            <CheckCircle className="w-10 h-10 text-green-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white mb-2">Verification Complete!</h3>
                            <p className="text-gray-400 text-sm">
                                Your identity has been verified. You can now access tokenized assets.
                            </p>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card w-full max-w-md rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#F8B032]/20 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-[#F8B032]" />
                        </div>
                        <span className="text-sm font-bold text-white">AHOY KYC</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {renderStep()}
                </div>

                {/* Footer */}
                <div className="px-6 pb-4 flex items-center justify-center gap-2 text-xs text-gray-500">
                    <Lock className="w-3 h-3" />
                    <span>Secured by AHOY Identity</span>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// WALLET CONNECT MODAL - Embeddable wallet connection component
// =============================================================================

interface WalletConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onConnect: (wallet: WalletInfo) => void;
    supportedWallets?: string[];
}

interface WalletInfo {
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

export function WalletConnectModal({ isOpen, onClose, onConnect, supportedWallets }: WalletConnectProps) {
    const [connecting, setConnecting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card w-full max-w-sm rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#F8B032]/20 flex items-center justify-center">
                            <Wallet className="w-4 h-4 text-[#F8B032]" />
                        </div>
                        <span className="text-sm font-bold text-white">Connect Wallet</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-2">
                    <p className="text-sm text-gray-400 mb-4">
                        Choose your preferred wallet to connect to AHOY Platform
                    </p>

                    {/* Popular Wallets */}
                    <div className="space-y-2">
                        {availableWallets.filter(w => w.popular).map(wallet => (
                            <button
                                key={wallet.id}
                                onClick={() => handleConnect(wallet.id)}
                                disabled={connecting !== null}
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

                            <div className="grid grid-cols-3 gap-2">
                                {availableWallets.filter(w => !w.popular).map(wallet => (
                                    <button
                                        key={wallet.id}
                                        onClick={() => handleConnect(wallet.id)}
                                        disabled={connecting !== null}
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
                        <button className="w-full p-3 border border-dashed border-white/20 rounded-xl hover:border-[#F8B032]/50 transition-all flex items-center justify-center gap-2 text-gray-400 hover:text-white">
                            <QrCode className="w-4 h-4" />
                            <span className="text-sm">Scan QR Code</span>
                        </button>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
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

// =============================================================================
// DEMO SHOWCASE - Component to demonstrate hosted components
// =============================================================================

export function HostedComponentsDemo() {
    const [showKYC, setShowKYC] = useState(false);
    const [showWallet, setShowWallet] = useState(false);
    const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);
    const [kycResult, setKycResult] = useState<KYCResult | null>(null);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#F8B032]" />
                    Hosted Components
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                    Embeddable UI components for seamless integration
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* KYC Component Card */}
                <div className="glass-card rounded-xl p-6 border border-white/10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                            <UserCheck className="w-6 h-6 text-green-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">KYC Modal</h3>
                            <p className="text-xs text-gray-400">Identity verification flow</p>
                        </div>
                    </div>

                    <p className="text-sm text-gray-400 mb-4">
                        Embed a complete KYC verification experience with document upload, selfie capture, and real-time verification.
                    </p>

                    <div className="bg-black/30 rounded-lg p-3 mb-4">
                        <code className="text-xs text-gray-400">
                            {`<KYCModal\n  requiredTier="standard"\n  onComplete={handleKYC}\n/>`}
                        </code>
                    </div>

                    {kycResult && (
                        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                            <p className="text-sm text-green-400">
                                KYC Status: {kycResult.status} (ID: {kycResult.identityId.slice(0, 12)}...)
                            </p>
                        </div>
                    )}

                    <button
                        onClick={() => setShowKYC(true)}
                        className="w-full py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rounded-lg hover:shadow-lg transition-all"
                    >
                        Launch KYC Modal
                    </button>
                </div>

                {/* Wallet Connect Card */}
                <div className="glass-card rounded-xl p-6 border border-white/10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                            <Wallet className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">Wallet Connect</h3>
                            <p className="text-xs text-gray-400">Multi-wallet connection</p>
                        </div>
                    </div>

                    <p className="text-sm text-gray-400 mb-4">
                        Support multiple wallet providers including MetaMask, WalletConnect, Coinbase Wallet, and more.
                    </p>

                    <div className="bg-black/30 rounded-lg p-3 mb-4">
                        <code className="text-xs text-gray-400">
                            {`<WalletConnect\n  onConnect={handleWallet}\n  supportedChains={[137]}\n/>`}
                        </code>
                    </div>

                    {connectedWallet && (
                        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-between">
                            <p className="text-sm text-blue-400 font-mono">
                                {connectedWallet.address.slice(0, 6)}...{connectedWallet.address.slice(-4)}
                            </p>
                            <button
                                onClick={() => navigator.clipboard.writeText(connectedWallet.address)}
                                className="p-1 hover:bg-white/10 rounded"
                            >
                                <Copy className="w-3 h-3 text-gray-400" />
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => setShowWallet(true)}
                        className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold rounded-lg hover:shadow-lg transition-all"
                    >
                        {connectedWallet ? 'Change Wallet' : 'Connect Wallet'}
                    </button>
                </div>
            </div>

            {/* Integration Guide */}
            <div className="glass-card rounded-xl p-6 border border-white/10">
                <h3 className="font-bold text-white mb-4">Integration Guide</h3>
                <div className="space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#F8B032]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs text-[#F8B032] font-bold">1</span>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Install SDK</p>
                            <code className="text-xs text-gray-400">npm install @ahoy/components</code>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#F8B032]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs text-[#F8B032] font-bold">2</span>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Import Components</p>
                            <code className="text-xs text-gray-400">{`import { KYCModal, WalletConnect } from '@ahoy/components'`}</code>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#F8B032]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs text-[#F8B032] font-bold">3</span>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Configure & Deploy</p>
                            <p className="text-xs text-gray-400">Pass your API key and configure callbacks</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <KYCModal
                isOpen={showKYC}
                onClose={() => setShowKYC(false)}
                onComplete={(result) => {
                    setKycResult(result);
                    setShowKYC(false);
                }}
            />

            <WalletConnectModal
                isOpen={showWallet}
                onClose={() => setShowWallet(false)}
                onConnect={(wallet) => {
                    setConnectedWallet(wallet);
                    setShowWallet(false);
                }}
            />
        </div>
    );
}
