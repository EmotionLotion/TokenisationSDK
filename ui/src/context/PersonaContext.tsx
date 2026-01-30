import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { PartyRole } from '@tokenisation/sdk';
import { sdkStore } from '../store';

// ============================================================================
// PERSONA TYPES — mapped 1:1 to SDK PartyRole
// ============================================================================

export type PersonaId = 'issuer' | 'user' | 'auditor' | 'partner_admin';

export interface PersonaPolicy {
  /** SDK PartyRole this persona maps to */
  sdkRole: PartyRole;
  /** Actions this persona may perform (validated by SDK at runtime) */
  allowedActions: string[];
  /** State slices visible to this persona in the UI */
  visibleStateSlices: string[];
  label: string;
  description: string;
  color: string;
}

/**
 * Persona policies mapped to real SDK PartyRole values.
 *
 * - partner_admin → OPERATOR  (full platform access)
 * - issuer        → ISSUER    (create/manage assets)
 * - user          → INVESTOR  (view/transfer tokens)
 * - auditor       → REGULATOR (read-only audit trail)
 */
export const PERSONA_POLICIES: Record<PersonaId, PersonaPolicy> = {
  partner_admin: {
    sdkRole: PartyRole.OPERATOR,
    allowedActions: [
      'create_asset', 'transition', 'mint', 'transfer', 'freeze', 'redeem',
      'manage_parties', 'manage_policies', 'view_audit', 'configure_compliance', 'override',
    ],
    visibleStateSlices: ['assets', 'parties', 'tokens', 'policies', 'audit', 'oracles', 'cashflow', 'governance'],
    label: 'Partner Admin',
    description: 'Full platform access with override capabilities',
    color: '#F8B032',
  },
  issuer: {
    sdkRole: PartyRole.ISSUER,
    allowedActions: ['create_asset', 'transition', 'mint', 'configure_compliance', 'manage_parties', 'view_audit'],
    visibleStateSlices: ['assets', 'parties', 'tokens', 'policies', 'cashflow'],
    label: 'Issuer',
    description: 'Can create and manage tokenized assets',
    color: '#3B82F6',
  },
  user: {
    sdkRole: PartyRole.INVESTOR,
    allowedActions: ['transfer', 'view_portfolio', 'view_audit'],
    visibleStateSlices: ['assets', 'tokens'],
    label: 'Investor / User',
    description: 'Can view and transfer owned tokens',
    color: '#10B981',
  },
  auditor: {
    sdkRole: PartyRole.REGULATOR,
    allowedActions: ['view_audit', 'view_compliance', 'export_reports'],
    visibleStateSlices: ['assets', 'parties', 'tokens', 'policies', 'audit', 'oracles'],
    label: 'Auditor',
    description: 'Read-only access with full audit trail visibility',
    color: '#8B5CF6',
  },
};

// ============================================================================
// CONTEXT VALUE
// ============================================================================

interface PersonaContextValue {
  /** Current persona identifier */
  persona: PersonaId;
  /** Full policy record for the active persona */
  policy: PersonaPolicy;
  /** Switch to a different persona (creates/re-uses the SDK Party automatically) */
  setPersona: (id: PersonaId) => void;
  /** The SDK PartyRole for the active persona */
  sdkRole: PartyRole;
  /** The SDK Party ID backing this persona (lazily created on first access) */
  activePartyId: string | null;
  /**
   * Check if the current persona can perform an action.
   * Delegates to `sdkStore.evaluatePersonaPermission()` which checks
   * the SDK role-action matrix and asset-level compliance.
   */
  canPerform: (action: string, assetId?: string) => boolean;
  /** Check if the current persona can view a state slice */
  canView: (slice: string) => boolean;
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [persona, setPersonaId] = useState<PersonaId>('partner_admin');
  const [activePartyId, setActivePartyId] = useState<string | null>(null);

  const policy = PERSONA_POLICIES[persona];

  // When the persona changes, ensure there is a matching SDK Party.
  const setPersona = useCallback((id: PersonaId) => {
    setPersonaId(id);

    const nextPolicy = PERSONA_POLICIES[id];
    try {
      const party = sdkStore.getOrCreatePartyForRole(nextPolicy.sdkRole, nextPolicy.label);
      setActivePartyId(party.id);
    } catch {
      // SDK not yet initialised — activePartyId stays null until first use
      setActivePartyId(null);
    }
  }, []);

  /**
   * Permission check backed by the SDK's role-action matrix.
   * Falls back to the static `allowedActions` list if the SDK store
   * method is unavailable (e.g. during initial render before hydration).
   */
  const canPerform = useCallback(
    (action: string, assetId?: string): boolean => {
      try {
        const result = sdkStore.evaluatePersonaPermission(policy.sdkRole, action, assetId);
        return result.allowed;
      } catch {
        // Fallback to static policy list
        return policy.allowedActions.includes(action);
      }
    },
    [policy],
  );

  const canView = useCallback(
    (slice: string): boolean => policy.visibleStateSlices.includes(slice),
    [policy],
  );

  const value = useMemo<PersonaContextValue>(
    () => ({
      persona,
      policy,
      setPersona,
      sdkRole: policy.sdkRole,
      activePartyId,
      canPerform,
      canView,
    }),
    [persona, policy, setPersona, activePartyId, canPerform, canView],
  );

  return (
    <PersonaContext.Provider value={value}>
      {children}
    </PersonaContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function usePersona(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (!ctx) {
    throw new Error('usePersona must be used within a <PersonaProvider>');
  }
  return ctx;
}
