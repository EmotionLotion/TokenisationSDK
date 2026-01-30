/**
 * Unified Types for SDK Showcase UI
 *
 * Re-exports from SDK and sdk-react, plus showcase-specific types.
 */

// Re-export core SDK types
export type {
  Asset,
  Party,
  BaseEvent,
} from '@tokenisation/sdk';

export {
  LifecycleState,
  PartyType,
  PartyRole,
  RightType,
} from '@tokenisation/sdk';

// ============================================================================
// TOKEN STATE
// ============================================================================

export interface TokenState {
  assetId: string;
  totalSupply: string;
  holders: Record<string, string>; // partyId -> balance
  frozen: boolean;
  complianceRules: ComplianceRules;
  lifecycleState: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// COMPLIANCE RULES
// ============================================================================

export interface ComplianceRules {
  kycRequired: boolean;
  kycProvider?: string;
  amlRules: string[];
  accreditation?: string;
  holdingPeriodDays?: number;
  maxInvestors?: number;
  jurisdictionWhitelist: string[];
  jurisdictionBlacklist: string[];
}

// ============================================================================
// PERSONA
// ============================================================================

export type Persona = 'issuer' | 'investor' | 'passenger' | 'regulator' | 'auditor';

export interface PersonaPermissions {
  canMint: boolean;
  canTransfer: boolean;
  canVerifyKyc: boolean;
  canFreeze: boolean;
  canViewCompliance: boolean;
  canOverrideOracle: boolean;
  canApproveRefund: boolean;
  canViewAuditLog: boolean;
}

export const PERSONA_PERMISSIONS: Record<Persona, PersonaPermissions> = {
  issuer: {
    canMint: true,
    canTransfer: true,
    canVerifyKyc: true,
    canFreeze: true,
    canViewCompliance: true,
    canOverrideOracle: true,
    canApproveRefund: true,
    canViewAuditLog: true,
  },
  investor: {
    canMint: false,
    canTransfer: true,
    canVerifyKyc: false,
    canFreeze: false,
    canViewCompliance: false,
    canOverrideOracle: false,
    canApproveRefund: false,
    canViewAuditLog: false,
  },
  passenger: {
    canMint: false,
    canTransfer: true,
    canVerifyKyc: false,
    canFreeze: false,
    canViewCompliance: false,
    canOverrideOracle: false,
    canApproveRefund: false,
    canViewAuditLog: false,
  },
  regulator: {
    canMint: false,
    canTransfer: false,
    canVerifyKyc: true,
    canFreeze: true,
    canViewCompliance: true,
    canOverrideOracle: false,
    canApproveRefund: false,
    canViewAuditLog: true,
  },
  auditor: {
    canMint: false,
    canTransfer: false,
    canVerifyKyc: false,
    canFreeze: false,
    canViewCompliance: true,
    canOverrideOracle: false,
    canApproveRefund: false,
    canViewAuditLog: true,
  },
};

// ============================================================================
// WORKFLOW STAGES (Discriminated Union for 18-step showcases)
// ============================================================================

export type WorkflowStage =
  | { phase: 'partner-onboarding'; step: 'register-org' | 'configure-compliance' | 'setup-wallet' }
  | { phase: 'property-issuance'; step: 'create-asset' | 'submit-docs' | 'verify-asset' | 'activate-offering' }
  | { phase: 'primary-purchase'; step: 'register-investor' | 'kyc-investor' | 'create-investor-wallet' | 'subscribe-invest' | 'mint-tokens' }
  | { phase: 'secondary-transfer'; step: 'register-buyer' | 'compliance-check' | 'execute-transfer' }
  | { phase: 'corporate-actions'; step: 'valuation-update' | 'dividend-distribution' | 'settlement' };

export type AirlineWorkflowStage =
  | { phase: 'partner-onboarding'; step: 'configure-airline' | 'setup-oracle' | 'configure-refund' }
  | { phase: 'ticket-issuance'; step: 'create-flight' | 'register-passenger' | 'mint-ticket' }
  | { phase: 'end-user'; step: 'wallet-pass' | 'boarding-pass' | 'lounge-access' }
  | { phase: 'flight-status'; step: 'oracle-update' | 'delay-notification' | 'gate-change' }
  | { phase: 'refund-disruption'; step: 'compute-refund' | 'insurance-claim' | 'settlement' }
  | { phase: 'ticket-transfer'; step: 'mint-transfer-ticket' | 'eligibility-check' | 'execute-transfer' };
