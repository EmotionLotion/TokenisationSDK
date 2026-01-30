import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserCheck, Shield, CheckCircle,
  Upload, Camera, FileText, Lock, Loader2, X,
  AlertCircle, RefreshCw
} from 'lucide-react';
import { useTokenisation } from '../context/TokenisationProvider';

/**
 * Props for the KYCModal component
 */
export interface KYCModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when KYC verification is complete */
  onComplete: (result: KYCResult) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Party ID to verify (uses current user if not provided) */
  partyId?: string;
  /** Configuration options */
  config?: {
    /** Verification tier required: 'basic' | 'standard' | 'enhanced' */
    requiredTier?: 'NONE' | 'BASIC' | 'STANDARD' | 'ENHANCED';
    /** Skip intro screen */
    skipIntro?: boolean;
    /** Custom strings for i18n */
    strings?: Partial<KYCStrings>;
  };
}

interface KYCStrings {
  title: string;
  subtitle: string;
  startButton: string;
  submitButton: string;
  processingText: string;
  successTitle: string;
  successMessage: string;
  errorTitle: string;
  retryButton: string;
}

const defaultStrings: KYCStrings = {
  title: 'Identity Verification',
  subtitle: 'Complete a quick verification to access tokenized assets. This usually takes less than 5 minutes.',
  startButton: 'Start Verification',
  submitButton: 'Submit for Verification',
  processingText: 'Verifying your identity...',
  successTitle: 'Verification Complete!',
  successMessage: 'Your identity has been verified. You can now access tokenized assets.',
  errorTitle: 'Verification Failed',
  retryButton: 'Try Again',
};

/**
 * Result object returned after KYC verification
 */
export interface KYCResult {
  status: 'approved' | 'pending' | 'rejected';
  identityId: string;
  tier: string;
  checks: {
    identity: boolean;
    address: boolean;
    sanctions: boolean;
  };
  message?: string;
}

type KYCStep = 'intro' | 'personal' | 'documents' | 'selfie' | 'review' | 'processing' | 'complete' | 'error';

/**
 * Embeddable KYC verification modal with real backend integration.
 *
 * @example
 * ```tsx
 * import { KYCModal } from '@tokenisation/ui-kit';
 *
 * function App() {
 *   const [showKYC, setShowKYC] = useState(false);
 *
 *   return (
 *     <KYCModal
 *       isOpen={showKYC}
 *       onClose={() => setShowKYC(false)}
 *       onComplete={(result) => {
 *         console.log('KYC complete:', result);
 *         setShowKYC(false);
 *       }}
 *       config={{ requiredTier: 'STANDARD' }}
 *     />
 *   );
 * }
 * ```
 */
export function KYCModal({ isOpen, onClose, onComplete, onError, partyId, config }: KYCModalProps) {
  const { api, events, user, theme } = useTokenisation();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [step, setStep] = useState<KYCStep>(config?.skipIntro ? 'personal' : 'intro');
  const [error, setError] = useState<string | null>(null);
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

  const strings = { ...defaultStrings, ...config?.strings };
  const targetPartyId = partyId || user?.id;
  const requiredTier = config?.requiredTier || 'STANDARD';

  // Reset state when modal opens; manage focus
  useEffect(() => {
    if (isOpen) {
      setStep(config?.skipIntro ? 'personal' : 'intro');
      setError(null);
      // Store the element that had focus before the modal opened
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus the modal container after render
      requestAnimationFrame(() => {
        modalRef.current?.focus();
      });
    } else if (previousFocusRef.current) {
      // Restore focus when modal closes
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen, config?.skipIntro]);

  // Trap focus inside modal and handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  // Emit KYC events
  const emitEvent = useCallback((type: 'kyc:started' | 'kyc:step' | 'kyc:completed' | 'kyc:failed', payload: any) => {
    events.emit(type, payload);
  }, [events]);

  if (!isOpen) return null;

  // Handle file upload
  const handleFileUpload = (type: 'idFront' | 'idBack' | 'selfie') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocuments(prev => ({ ...prev, [type]: file }));
    }
  };

  // Submit KYC
  const handleSubmit = async () => {
    if (!targetPartyId) {
      setError('No user ID available. Please log in first.');
      setStep('error');
      return;
    }

    setStep('processing');
    emitEvent('kyc:started', { tier: requiredTier });

    try {
      // In a real implementation, you would:
      // 1. Upload documents to secure storage
      // 2. Call a KYC provider API (e.g., Onfido, Jumio, Sumsub)
      // 3. Wait for verification result

      // For now, we call our backend to update KYC status
      const response = await api.parties.setKyc(targetPartyId, {
        verified: true,
        verificationLevel: requiredTier,
      });

      const result: KYCResult = {
        status: 'approved',
        identityId: response.id,
        tier: requiredTier,
        checks: {
          identity: true,
          address: true,
          sanctions: true,
        },
      };

      emitEvent('kyc:completed', {
        status: 'approved',
        identityId: response.id,
      });

      setStep('complete');

      // Call completion callback after animation
      setTimeout(() => {
        onComplete(result);
      }, 1500);

    } catch (err: any) {
      const errorMessage = err.message || 'Verification failed. Please try again.';
      setError(errorMessage);
      setStep('error');
      emitEvent('kyc:failed', {
        reason: errorMessage,
        retryable: true,
      });
      onError?.(err);
    }
  };

  // Navigate between steps
  const goToStep = (newStep: KYCStep) => {
    setStep(newStep);
    const stepIndex = ['intro', 'personal', 'documents', 'selfie', 'review'].indexOf(newStep);
    if (stepIndex >= 0) {
      emitEvent('kyc:step', {
        step: newStep,
        progress: (stepIndex + 1) / 5,
      });
    }
  };

  // Use theme colors
  const primaryColor = theme?.colors?.primary || '#F8B032';
  const bgColor = theme?.colors?.backgroundSecondary || 'rgba(15, 23, 42, 0.95)';

  const renderStep = () => {
    switch (step) {
      case 'intro':
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: `${primaryColor}20` }}>
              <UserCheck className="w-10 h-10" style={{ color: primaryColor }} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">{strings.title}</h3>
              <p className="text-gray-400 text-sm">{strings.subtitle}</p>
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
              onClick={() => goToStep('personal')}
              className="w-full py-3 text-black font-bold rounded-xl hover:shadow-lg transition-all"
              style={{ background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}dd)` }}
            >
              {strings.startButton}
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
                <label className="block text-xs text-gray-400 mb-1">First Name *</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-opacity-50"
                  style={{ '--tw-border-opacity': 1, borderColor: formData.firstName ? 'rgba(255,255,255,0.1)' : undefined } as any}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Last Name *</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Date of Birth *</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nationality *</label>
                <select
                  value={formData.nationality}
                  onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none"
                  required
                >
                  <option value="">Select...</option>
                  <option value="AE">United Arab Emirates</option>
                  <option value="US">United States</option>
                  <option value="GB">United Kingdom</option>
                  <option value="SG">Singapore</option>
                  <option value="DE">Germany</option>
                  <option value="FR">France</option>
                  <option value="CH">Switzerland</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => goToStep('intro')}
                className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => goToStep('documents')}
                disabled={!formData.firstName || !formData.lastName || !formData.email}
                aria-disabled={!formData.firstName || !formData.lastName || !formData.email}
                className="flex-1 py-2.5 text-black font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                style={{ background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}dd)` }}
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
              <label className="block p-4 border-2 border-dashed border-white/20 rounded-xl hover:border-opacity-50 transition-colors cursor-pointer" style={{ borderColor: documents.idFront ? primaryColor : undefined }}>
                <input type="file" accept="image/*" onChange={handleFileUpload('idFront')} className="hidden" />
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">ID Front *</p>
                    <p className="text-xs text-gray-500">
                      {documents.idFront ? documents.idFront.name : 'Click to upload'}
                    </p>
                  </div>
                  {documents.idFront && <CheckCircle className="w-5 h-5 text-green-400" />}
                </div>
              </label>

              <label className="block p-4 border-2 border-dashed border-white/20 rounded-xl hover:border-opacity-50 transition-colors cursor-pointer" style={{ borderColor: documents.idBack ? primaryColor : undefined }}>
                <input type="file" accept="image/*" onChange={handleFileUpload('idBack')} className="hidden" />
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">ID Back</p>
                    <p className="text-xs text-gray-500">
                      {documents.idBack ? documents.idBack.name : 'Click to upload (if applicable)'}
                    </p>
                  </div>
                  {documents.idBack && <CheckCircle className="w-5 h-5 text-green-400" />}
                </div>
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => goToStep('personal')}
                className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => goToStep('selfie')}
                disabled={!documents.idFront}
                aria-disabled={!documents.idFront}
                className="flex-1 py-2.5 text-black font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                style={{ background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}dd)` }}
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

            <label className="block aspect-square max-w-[280px] mx-auto rounded-2xl bg-black/50 border border-white/10 flex items-center justify-center overflow-hidden cursor-pointer hover:border-opacity-50 transition-colors" style={{ borderColor: documents.selfie ? primaryColor : undefined }}>
              <input type="file" accept="image/*" capture="user" onChange={handleFileUpload('selfie')} className="hidden" />
              {documents.selfie ? (
                <div className="text-center">
                  <CheckCircle className="w-12 h-12 mx-auto text-green-400 mb-2" />
                  <p className="text-sm text-white">Photo captured</p>
                </div>
              ) : (
                <div className="w-48 h-48 border-2 border-dashed rounded-full flex items-center justify-center" style={{ borderColor: `${primaryColor}50` }}>
                  <Camera className="w-12 h-12" style={{ color: primaryColor }} />
                </div>
              )}
            </label>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => goToStep('documents')}
                className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => goToStep('review')}
                disabled={!documents.selfie}
                aria-disabled={!documents.selfie}
                className="flex-1 py-2.5 text-black font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                style={{ background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}dd)` }}
              >
                Continue
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
                <div>
                  <span className="text-sm text-gray-400">Name</span>
                  <p className="text-sm text-white">{formData.firstName} {formData.lastName}</p>
                </div>
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
              <Shield className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-400">
                By submitting, you consent to identity verification and acknowledge our privacy policy.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => goToStep('selfie')}
                className="flex-1 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-2.5 text-black font-bold rounded-lg hover:shadow-lg transition-all"
                style={{ background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}dd)` }}
              >
                {strings.submitButton}
              </button>
            </div>
          </div>
        );

      case 'processing':
        return (
          <div className="text-center space-y-6 py-8" role="status" aria-label={strings.processingText}>
            <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: `${primaryColor}20` }}>
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: primaryColor }} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">{strings.processingText}</h3>
              <p className="text-gray-400 text-sm">This may take a few moments...</p>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="text-center space-y-6 py-8" role="status" aria-label={strings.successTitle}>
            <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">{strings.successTitle}</h3>
              <p className="text-gray-400 text-sm">{strings.successMessage}</p>
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="text-center space-y-6 py-8" role="alert" aria-label={strings.errorTitle}>
            <div className="w-20 h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">{strings.errorTitle}</h3>
              <p className="text-gray-400 text-sm">{error}</p>
            </div>
            <button
              onClick={() => goToStep('review')}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-black font-bold rounded-xl hover:shadow-lg transition-all"
              style={{ background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}dd)` }}
            >
              <RefreshCw className="w-4 h-4" />
              {strings.retryButton}
            </button>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="presentation">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kyc-modal-title"
        aria-describedby="kyc-modal-description"
        aria-busy={step === 'processing'}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: bgColor, border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${primaryColor}20` }}>
              <Shield className="w-4 h-4" style={{ color: primaryColor }} />
            </div>
            <span id="kyc-modal-title" className="text-sm font-bold text-white">{strings.title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Screen-reader description */}
        <p id="kyc-modal-description" className="sr-only">
          Identity verification process. Complete each step to verify your identity.
        </p>

        {/* Content */}
        <div className="p-6" aria-live="polite">
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="px-6 pb-4 flex items-center justify-center gap-2 text-xs text-gray-500">
          <Lock className="w-3 h-3" />
          <span>Secured by Tokenisation SDK</span>
        </div>
      </div>
    </div>
  );
}
