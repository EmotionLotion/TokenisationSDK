/**
 * useKYC Hook
 *
 * Hook for KYC (Know Your Customer) verification in React Native.
 * Supports document capture, selfie verification, and status tracking.
 */

import { useState, useCallback, useEffect } from 'react';
import { useTokenisation } from '../context/TokenisationProvider.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * KYC verification status
 */
export type KycStatus =
  | 'none'
  | 'pending'
  | 'in_progress'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'needs_review';

/**
 * Document type for KYC
 */
export type DocumentType =
  | 'passport'
  | 'drivers_license'
  | 'national_id'
  | 'residence_permit';

/**
 * KYC verification level
 */
export type KycLevel =
  | 'basic'      // Name, email, phone
  | 'standard'   // + ID verification
  | 'enhanced'   // + proof of address
  | 'accredited'; // + accreditation verification

/**
 * Document capture result
 */
export interface DocumentCapture {
  type: DocumentType;
  frontImage: string; // Base64 or URI
  backImage?: string; // For IDs with back side
  capturedAt: string;
}

/**
 * Selfie capture result
 */
export interface SelfieCapture {
  image: string; // Base64 or URI
  isLiveness: boolean;
  capturedAt: string;
}

/**
 * KYC verification details
 */
export interface KycVerification {
  verificationId: string;
  status: KycStatus;
  level: KycLevel;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  rejectionReason?: string;
  documents: DocumentCapture[];
  selfie?: SelfieCapture;
}

/**
 * KYC submission request
 */
export interface KycSubmissionRequest {
  level: KycLevel;
  documents: DocumentCapture[];
  selfie?: SelfieCapture;
  personalInfo?: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    address?: {
      street: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
  };
}

/**
 * Return type for useKYC hook
 */
export interface UseKycReturn {
  // State
  status: KycStatus;
  level: KycLevel | null;
  verification: KycVerification | null;
  isLoading: boolean;
  error: Error | null;

  // Verification flow
  startVerification: (level: KycLevel) => Promise<string>;
  submitDocuments: (documents: DocumentCapture[]) => Promise<void>;
  submitSelfie: (selfie: SelfieCapture) => Promise<void>;
  completeVerification: () => Promise<KycVerification>;

  // Status
  refresh: () => Promise<void>;
  checkStatus: () => Promise<KycStatus>;

  // Utilities
  isVerified: boolean;
  needsVerification: boolean;
  canInvest: (requiredLevel: KycLevel) => boolean;
}

// ============================================================================
// LEVEL HIERARCHY
// ============================================================================

const LEVEL_HIERARCHY: Record<KycLevel, number> = {
  basic: 1,
  standard: 2,
  enhanced: 3,
  accredited: 4,
};

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for KYC management
 *
 * @example
 * ```tsx
 * function KycScreen() {
 *   const {
 *     status,
 *     isVerified,
 *     startVerification,
 *     submitDocuments,
 *     submitSelfie,
 *   } = useKYC();
 *
 *   const handleStartKyc = async () => {
 *     await startVerification('standard');
 *     // Navigate to document capture screen
 *   };
 *
 *   if (isVerified) {
 *     return <Text>KYC Verified</Text>;
 *   }
 *
 *   return (
 *     <View>
 *       <Text>Status: {status}</Text>
 *       <Button onPress={handleStartKyc} title="Start Verification" />
 *     </View>
 *   );
 * }
 * ```
 */
export function useKYC(): UseKycReturn {
  const { client, wallet, user, config, refreshUser } = useTokenisation();

  const [verification, setVerification] = useState<KycVerification | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pendingDocuments, setPendingDocuments] = useState<DocumentCapture[]>([]);
  const [pendingSelfie, setPendingSelfie] = useState<SelfieCapture | null>(null);

  // Derived status from user state
  const status = user.kycStatus as KycStatus;

  // Fetch verification details
  const fetchVerification = useCallback(async () => {
    if (!client || !wallet.address) return;

    setIsLoading(true);
    setError(null);

    try {
      // In a real implementation:
      // const verification = await client.kyc.getVerification(wallet.address);

      // Mock implementation
      if (status !== 'none') {
        setVerification({
          verificationId: `kyc_${wallet.address?.slice(2, 10)}`,
          status,
          level: 'standard',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          documents: [],
        });
      }
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch KYC status');
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [client, wallet.address, status]);

  // Initial fetch
  useEffect(() => {
    fetchVerification();
  }, [fetchVerification]);

  // Start verification flow
  const startVerification = useCallback(async (level: KycLevel): Promise<string> => {
    if (!client || !wallet.address) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      if (config.debug) {
        console.log('[Tokenisation] Starting KYC verification:', level);
      }

      // In a real implementation:
      // const result = await client.kyc.startVerification({ level, wallet: wallet.address });

      // Mock implementation
      const verificationId = `kyc_${Date.now()}`;

      setVerification({
        verificationId,
        status: 'in_progress',
        level,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        documents: [],
      });

      return verificationId;
    } catch (err) {
      const startError = err instanceof Error ? err : new Error('Failed to start verification');
      setError(startError);
      throw startError;
    } finally {
      setIsLoading(false);
    }
  }, [client, wallet.address, config.debug]);

  // Submit documents
  const submitDocuments = useCallback(async (documents: DocumentCapture[]): Promise<void> => {
    if (!verification) {
      throw new Error('No active verification. Call startVerification first.');
    }

    setIsLoading(true);
    setError(null);

    try {
      if (config.debug) {
        console.log('[Tokenisation] Submitting documents:', documents.length);
      }

      // Store for later submission
      setPendingDocuments(documents);

      // In a real implementation:
      // await client.kyc.submitDocuments(verification.verificationId, documents);

      // Update local state
      setVerification(prev => prev ? {
        ...prev,
        documents,
        updatedAt: new Date().toISOString(),
      } : null);
    } catch (err) {
      const submitError = err instanceof Error ? err : new Error('Failed to submit documents');
      setError(submitError);
      throw submitError;
    } finally {
      setIsLoading(false);
    }
  }, [verification, config.debug]);

  // Submit selfie
  const submitSelfie = useCallback(async (selfie: SelfieCapture): Promise<void> => {
    if (!verification) {
      throw new Error('No active verification. Call startVerification first.');
    }

    setIsLoading(true);
    setError(null);

    try {
      if (config.debug) {
        console.log('[Tokenisation] Submitting selfie');
      }

      // Store for later submission
      setPendingSelfie(selfie);

      // In a real implementation:
      // await client.kyc.submitSelfie(verification.verificationId, selfie);

      // Update local state
      setVerification(prev => prev ? {
        ...prev,
        selfie,
        updatedAt: new Date().toISOString(),
      } : null);
    } catch (err) {
      const submitError = err instanceof Error ? err : new Error('Failed to submit selfie');
      setError(submitError);
      throw submitError;
    } finally {
      setIsLoading(false);
    }
  }, [verification, config.debug]);

  // Complete verification
  const completeVerification = useCallback(async (): Promise<KycVerification> => {
    if (!verification) {
      throw new Error('No active verification');
    }

    if (pendingDocuments.length === 0) {
      throw new Error('No documents submitted');
    }

    setIsLoading(true);
    setError(null);

    try {
      if (config.debug) {
        console.log('[Tokenisation] Completing verification');
      }

      // In a real implementation:
      // const result = await client.kyc.completeVerification(verification.verificationId);

      // Mock implementation - simulate processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      const completedVerification: KycVerification = {
        ...verification,
        status: 'pending',
        updatedAt: new Date().toISOString(),
      };

      setVerification(completedVerification);

      // Refresh user state
      await refreshUser();

      return completedVerification;
    } catch (err) {
      const completeError = err instanceof Error ? err : new Error('Failed to complete verification');
      setError(completeError);
      throw completeError;
    } finally {
      setIsLoading(false);
    }
  }, [verification, pendingDocuments, config.debug, refreshUser]);

  // Refresh status
  const refresh = useCallback(async (): Promise<void> => {
    await fetchVerification();
    await refreshUser();
  }, [fetchVerification, refreshUser]);

  // Check status (for polling)
  const checkStatus = useCallback(async (): Promise<KycStatus> => {
    await refresh();
    return status;
  }, [refresh, status]);

  // Check if can invest at required level
  const canInvest = useCallback((requiredLevel: KycLevel): boolean => {
    if (status !== 'approved' || !verification?.level) {
      return false;
    }
    return LEVEL_HIERARCHY[verification.level] >= LEVEL_HIERARCHY[requiredLevel];
  }, [status, verification?.level]);

  return {
    // State
    status,
    level: verification?.level || null,
    verification,
    isLoading,
    error,

    // Verification flow
    startVerification,
    submitDocuments,
    submitSelfie,
    completeVerification,

    // Status
    refresh,
    checkStatus,

    // Utilities
    isVerified: status === 'approved',
    needsVerification: status === 'none' || status === 'expired' || status === 'rejected',
    canInvest,
  };
}

export default useKYC;
