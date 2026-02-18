// SDK Types for UI - Re-exported from Real SDK
import {
  LifecycleState,
  VALID_TRANSITIONS,
  type Asset as SDKAsset,
} from '@tokenisation/sdk';

// Re-export everything except Asset (which we augment below)
export * from '@tokenisation/sdk';

/** UI-friendly Asset type — augments the SDK's Zod-inferred type with guaranteed runtime fields */
export type Asset = SDKAsset & { id: string; name: string; state: any; metadata?: any; [key: string]: any };

export interface TokenBalance {
  partyId: string;
  partyName: string;
  balance: string;
}

// Compatibility Aliases
export const LIFECYCLE_TRANSITIONS = VALID_TRANSITIONS;

export const STATE_COLORS: Record<LifecycleState, string> = {
  [LifecycleState.DRAFT]: 'bg-gray-500',
  [LifecycleState.PENDING_VERIFICATION]: 'bg-yellow-500',
  [LifecycleState.VERIFIED]: 'bg-blue-500',
  [LifecycleState.ACTIVE]: 'bg-green-500',
  [LifecycleState.FROZEN]: 'bg-cyan-500',
  [LifecycleState.PARTIALLY_REDEEMED]: 'bg-violet-500',
  [LifecycleState.REDEEMED]: 'bg-purple-500',
  [LifecycleState.EXPIRED]: 'bg-orange-500',
  [LifecycleState.CLOSED]: 'bg-slate-500',
  [LifecycleState.BURNED]: 'bg-red-500',
};

// UI Mapping Helpers
// We keep the old Event interface name but it is now equal to BaseEvent from SDK
import { BaseEvent, VerificationLevel } from '@tokenisation/sdk';
export type Event = BaseEvent; // Alias

/**
 * Check whether a Party has been KYC-verified.
 * The SDK stores this as `verificationLevel` (enum), not a boolean `kycVerified`.
 * A party is considered verified if its level is BASIC or higher.
 */
export function isKycVerified(party: { verificationLevel?: string } | null | undefined): boolean {
  if (!party) return false;
  const level = party.verificationLevel;
  return level != null && level !== VerificationLevel.NONE;
}
