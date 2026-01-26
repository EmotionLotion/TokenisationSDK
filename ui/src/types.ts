// SDK Types for UI - Re-exported from Real SDK
import {
  LifecycleState,
  VALID_TRANSITIONS,
} from '@tokenisation/sdk';

export * from '@tokenisation/sdk';

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
  [LifecycleState.REDEEMED]: 'bg-purple-500',
  [LifecycleState.EXPIRED]: 'bg-orange-500',
  [LifecycleState.BURNED]: 'bg-red-500',
};

// UI Mapping Helpers
// We keep the old Event interface name but it is now equal to BaseEvent from SDK
import { BaseEvent } from '@tokenisation/sdk';
export type Event = BaseEvent; // Alias
