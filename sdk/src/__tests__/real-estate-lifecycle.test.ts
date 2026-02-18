/**
 * Real Estate Lifecycle State Machine - Integration Tests
 *
 * Tests the 11-state Dubai real estate lifecycle, guard functions,
 * bridge mappers (core <-> real estate <-> Stake stages), and
 * transition validity.
 */

import { describe, it, expect } from 'vitest';
import {
  REAL_ESTATE_LIFECYCLE,
  RealEstateLifecycleStates,
  mapCoreStateToRealEstate,
  mapRealEstateToCoreState,
  mapStakeStageToState,
  mapStateToStakeStage,
} from '../packs/real-estate-lifecycle.js';
import type { RealEstateLifecycleState } from '../packs/real-estate-lifecycle.js';
import { LifecycleState } from '../core/types.js';
import { StateMachine } from '../core/StateMachine.js';

// ============================================================================
// Helpers
// ============================================================================

const ALL_STATES: RealEstateLifecycleState[] = [
  'SOURCING',
  'DUE_DILIGENCE',
  'LEGAL_STRUCTURING',
  'REGULATORY_APPROVAL',
  'TOKEN_ISSUANCE',
  'LIVE',
  'SECONDARY_TRADING',
  'DISTRIBUTING',
  'FROZEN',
  'REDEEMED',
  'CLOSED',
];

const TERMINAL_STATES: RealEstateLifecycleState[] = ['REDEEMED', 'CLOSED'];
const NON_TERMINAL_STATES = ALL_STATES.filter(s => !TERMINAL_STATES.includes(s));

/** Create a StateMachine instance from the real estate config for transition testing. */
function createMachine(): StateMachine {
  return new StateMachine(REAL_ESTATE_LIFECYCLE);
}

// ============================================================================
// Tests
// ============================================================================

describe('REAL_ESTATE_LIFECYCLE config', () => {
  it('has the correct id', () => {
    expect(REAL_ESTATE_LIFECYCLE.id).toBe('real-estate-dubai');
  });

  it('has a human-readable name and description', () => {
    expect(REAL_ESTATE_LIFECYCLE.name).toBeDefined();
    expect(REAL_ESTATE_LIFECYCLE.name.length).toBeGreaterThan(0);
    expect(REAL_ESTATE_LIFECYCLE.description).toBeDefined();
  });

  it('registers all 11 states', () => {
    const stateIds = REAL_ESTATE_LIFECYCLE.states.map(s => s.id);
    expect(stateIds).toHaveLength(11);
    for (const expected of ALL_STATES) {
      expect(stateIds).toContain(expected);
    }
  });

  it('marks SOURCING as the only initial state', () => {
    const initialStates = REAL_ESTATE_LIFECYCLE.states.filter(s => s.isInitial);
    expect(initialStates).toHaveLength(1);
    expect(initialStates[0].id).toBe('SOURCING');
  });

  it('marks REDEEMED and CLOSED as terminal states', () => {
    const terminalStates = REAL_ESTATE_LIFECYCLE.states.filter(s => s.isTerminal);
    const terminalIds = terminalStates.map(s => s.id).sort();
    expect(terminalIds).toEqual(['CLOSED', 'REDEEMED']);
  });

  it('non-terminal states are not marked as terminal', () => {
    for (const state of REAL_ESTATE_LIFECYCLE.states) {
      if (!TERMINAL_STATES.includes(state.id as RealEstateLifecycleState)) {
        expect(state.isTerminal).toBeFalsy();
      }
    }
  });
});

describe('RealEstateLifecycleStates constant', () => {
  it('exports all 11 state values', () => {
    expect(Object.keys(RealEstateLifecycleStates)).toHaveLength(11);
    for (const s of ALL_STATES) {
      expect(RealEstateLifecycleStates).toHaveProperty(s, s);
    }
  });
});

describe('Transitions - valid happy path', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = createMachine();
  });

  it('SOURCING -> DUE_DILIGENCE', () => {
    expect(sm.canTransition('SOURCING', 'DUE_DILIGENCE')).toBe(true);
  });

  it('DUE_DILIGENCE -> LEGAL_STRUCTURING', () => {
    expect(sm.canTransition('DUE_DILIGENCE', 'LEGAL_STRUCTURING')).toBe(true);
  });

  it('LEGAL_STRUCTURING -> REGULATORY_APPROVAL', () => {
    expect(sm.canTransition('LEGAL_STRUCTURING', 'REGULATORY_APPROVAL')).toBe(true);
  });

  it('REGULATORY_APPROVAL -> TOKEN_ISSUANCE', () => {
    expect(sm.canTransition('REGULATORY_APPROVAL', 'TOKEN_ISSUANCE')).toBe(true);
  });

  it('TOKEN_ISSUANCE -> LIVE', () => {
    expect(sm.canTransition('TOKEN_ISSUANCE', 'LIVE')).toBe(true);
  });

  it('LIVE -> SECONDARY_TRADING (lockup expired)', () => {
    expect(sm.canTransition('LIVE', 'SECONDARY_TRADING')).toBe(true);
  });

  it('REDEEMED -> CLOSED', () => {
    expect(sm.canTransition('REDEEMED', 'CLOSED')).toBe(true);
  });
});

describe('Transitions - distribution cycles', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = createMachine();
  });

  it('LIVE -> DISTRIBUTING', () => {
    expect(sm.canTransition('LIVE', 'DISTRIBUTING')).toBe(true);
  });

  it('DISTRIBUTING -> LIVE', () => {
    expect(sm.canTransition('DISTRIBUTING', 'LIVE')).toBe(true);
  });

  it('SECONDARY_TRADING -> DISTRIBUTING', () => {
    expect(sm.canTransition('SECONDARY_TRADING', 'DISTRIBUTING')).toBe(true);
  });

  it('DISTRIBUTING -> SECONDARY_TRADING', () => {
    expect(sm.canTransition('DISTRIBUTING', 'SECONDARY_TRADING')).toBe(true);
  });
});

describe('Transitions - freeze / unfreeze', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = createMachine();
  });

  it('LIVE -> FROZEN', () => {
    expect(sm.canTransition('LIVE', 'FROZEN')).toBe(true);
  });

  it('SECONDARY_TRADING -> FROZEN', () => {
    expect(sm.canTransition('SECONDARY_TRADING', 'FROZEN')).toBe(true);
  });

  it('FROZEN -> LIVE (unfreeze to live)', () => {
    expect(sm.canTransition('FROZEN', 'LIVE')).toBe(true);
  });

  it('FROZEN -> SECONDARY_TRADING (unfreeze to secondary)', () => {
    expect(sm.canTransition('FROZEN', 'SECONDARY_TRADING')).toBe(true);
  });
});

describe('Transitions - rollback / rejection in pre-live', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = createMachine();
  });

  it('DUE_DILIGENCE -> SOURCING (reject DD)', () => {
    expect(sm.canTransition('DUE_DILIGENCE', 'SOURCING')).toBe(true);
  });

  it('LEGAL_STRUCTURING -> DUE_DILIGENCE (reject legal)', () => {
    expect(sm.canTransition('LEGAL_STRUCTURING', 'DUE_DILIGENCE')).toBe(true);
  });

  it('REGULATORY_APPROVAL -> LEGAL_STRUCTURING (reject regulatory)', () => {
    expect(sm.canTransition('REGULATORY_APPROVAL', 'LEGAL_STRUCTURING')).toBe(true);
  });
});

describe('Transitions - redemption from any non-terminal state', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = createMachine();
  });

  it.each(NON_TERMINAL_STATES)('%s -> REDEEMED is valid', (fromState) => {
    expect(sm.canTransition(fromState, 'REDEEMED')).toBe(true);
  });
});

describe('Transitions - invalid (must be rejected)', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = createMachine();
  });

  it('SOURCING cannot go directly to LIVE', () => {
    expect(sm.canTransition('SOURCING', 'LIVE')).toBe(false);
  });

  it('SOURCING cannot go directly to SECONDARY_TRADING', () => {
    expect(sm.canTransition('SOURCING', 'SECONDARY_TRADING')).toBe(false);
  });

  it('SOURCING cannot go directly to TOKEN_ISSUANCE', () => {
    expect(sm.canTransition('SOURCING', 'TOKEN_ISSUANCE')).toBe(false);
  });

  it('CLOSED cannot transition anywhere (terminal)', () => {
    const targets = sm.getAvailableTargetStates('CLOSED');
    expect(targets).toHaveLength(0);
  });

  it('REDEEMED can only go to CLOSED', () => {
    const targets = sm.getAvailableTargetStates('REDEEMED');
    expect(targets).toEqual(['CLOSED']);
  });

  it('LIVE cannot go directly to LEGAL_STRUCTURING', () => {
    expect(sm.canTransition('LIVE', 'LEGAL_STRUCTURING')).toBe(false);
  });

  it('DISTRIBUTING cannot go directly to FROZEN', () => {
    expect(sm.canTransition('DISTRIBUTING', 'FROZEN')).toBe(false);
  });
});

describe('Guard functions exist on the correct transitions', () => {
  const findTransitions = (from: string, to: string) =>
    REAL_ESTATE_LIFECYCLE.transitions.filter(t => t.from === from && t.to === to);

  it('lockup_expired guard on LIVE -> SECONDARY_TRADING', () => {
    const transitions = findTransitions('LIVE', 'SECONDARY_TRADING');
    expect(transitions).toHaveLength(1);
    expect(transitions[0].guards).toBeDefined();
    expect(transitions[0].guards!.length).toBeGreaterThanOrEqual(1);
  });

  it('vara_approved guard on REGULATORY_APPROVAL -> TOKEN_ISSUANCE', () => {
    const transitions = findTransitions('REGULATORY_APPROVAL', 'TOKEN_ISSUANCE');
    expect(transitions).toHaveLength(1);
    expect(transitions[0].guards).toBeDefined();
    expect(transitions[0].guards!.length).toBeGreaterThanOrEqual(1);
  });

  it('dld_registered guard on TOKEN_ISSUANCE -> LIVE', () => {
    const transitions = findTransitions('TOKEN_ISSUANCE', 'LIVE');
    expect(transitions).toHaveLength(1);
    expect(transitions[0].guards).toBeDefined();
    expect(transitions[0].guards!.length).toBeGreaterThanOrEqual(1);
  });

  it('property_sold guard on all REDEEM transitions', () => {
    const redeemTransitions = REAL_ESTATE_LIFECYCLE.transitions.filter(t => t.to === 'REDEEMED');
    expect(redeemTransitions.length).toBeGreaterThanOrEqual(9); // 9 non-terminal states
    for (const t of redeemTransitions) {
      expect(t.guards).toBeDefined();
      expect(t.guards!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('no guard on REDEEMED -> CLOSED', () => {
    const transitions = findTransitions('REDEEMED', 'CLOSED');
    expect(transitions).toHaveLength(1);
    expect(transitions[0].guards).toBeUndefined();
  });
});

describe('Guard function behavior', () => {
  const baseContext = {
    assetId: 'test-asset-1',
    currentState: 'LIVE',
    targetState: 'SECONDARY_TRADING',
    event: 'ENABLE_SECONDARY',
    actorId: 'admin-1',
    timestamp: new Date().toISOString(),
  };

  it('lockup guard allows when no lockup configured', async () => {
    const sm = createMachine();
    const result = await sm.transition({
      ...baseContext,
      metadata: {},
    });
    // Should succeed because no lockup means allowed
    expect(result.success).toBe(true);
  });

  it('lockup guard blocks when lockup is active', async () => {
    const sm = createMachine();
    sm.setState('test-asset-lockup', 'LIVE');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const result = await sm.transition({
      assetId: 'test-asset-lockup',
      currentState: 'LIVE',
      targetState: 'SECONDARY_TRADING',
      event: 'ENABLE_SECONDARY',
      actorId: 'admin-1',
      timestamp: new Date().toISOString(),
      metadata: { lockupEndDate: futureDate.toISOString() },
    });
    expect(result.success).toBe(false);
    expect(result.guardFailures).toBeDefined();
    expect(result.guardFailures!.some(f => f.includes('Lockup'))).toBe(true);
  });

  it('property_sold guard blocks when propertySold is false', async () => {
    const sm = createMachine();
    sm.setState('test-asset-ps', 'LIVE');
    const result = await sm.transition({
      assetId: 'test-asset-ps',
      currentState: 'LIVE',
      targetState: 'REDEEMED',
      event: 'REDEEM',
      actorId: 'admin-1',
      timestamp: new Date().toISOString(),
      metadata: { propertySold: false },
    });
    expect(result.success).toBe(false);
    expect(result.guardFailures).toBeDefined();
    expect(result.guardFailures!.some(f => f.includes('sold'))).toBe(true);
  });

  it('property_sold guard allows when propertySold is true', async () => {
    const sm = createMachine();
    sm.setState('test-asset-ps2', 'LIVE');
    const result = await sm.transition({
      assetId: 'test-asset-ps2',
      currentState: 'LIVE',
      targetState: 'REDEEMED',
      event: 'REDEEM',
      actorId: 'admin-1',
      timestamp: new Date().toISOString(),
      metadata: { propertySold: true },
    });
    expect(result.success).toBe(true);
    expect(result.newState).toBe('REDEEMED');
  });

  it('vara_approved guard blocks when varaApproved is false', async () => {
    const sm = createMachine();
    sm.setState('test-asset-vara', 'REGULATORY_APPROVAL');
    const result = await sm.transition({
      assetId: 'test-asset-vara',
      currentState: 'REGULATORY_APPROVAL',
      targetState: 'TOKEN_ISSUANCE',
      event: 'APPROVE_AND_ISSUE',
      actorId: 'admin-1',
      actorRoles: ['ADMIN'],
      timestamp: new Date().toISOString(),
      metadata: { varaApproved: false },
    });
    expect(result.success).toBe(false);
    expect(result.guardFailures).toBeDefined();
    expect(result.guardFailures!.some(f => f.includes('VARA'))).toBe(true);
  });

  it('dld_registered guard blocks when dldTokenizationRegistered is false', async () => {
    const sm = createMachine();
    sm.setState('test-asset-dld', 'TOKEN_ISSUANCE');
    const result = await sm.transition({
      assetId: 'test-asset-dld',
      currentState: 'TOKEN_ISSUANCE',
      targetState: 'LIVE',
      event: 'ACTIVATE',
      actorId: 'admin-1',
      actorRoles: ['ADMIN'],
      timestamp: new Date().toISOString(),
      metadata: { dldTokenizationRegistered: false },
    });
    expect(result.success).toBe(false);
    expect(result.guardFailures).toBeDefined();
    expect(result.guardFailures!.some(f => f.includes('DLD'))).toBe(true);
  });
});

describe('Bridge: mapCoreStateToRealEstate', () => {
  it('maps DRAFT -> SOURCING', () => {
    expect(mapCoreStateToRealEstate(LifecycleState.DRAFT)).toBe('SOURCING');
  });

  it('maps PENDING_VERIFICATION -> DUE_DILIGENCE', () => {
    expect(mapCoreStateToRealEstate(LifecycleState.PENDING_VERIFICATION)).toBe('DUE_DILIGENCE');
  });

  it('maps VERIFIED -> LEGAL_STRUCTURING', () => {
    expect(mapCoreStateToRealEstate(LifecycleState.VERIFIED)).toBe('LEGAL_STRUCTURING');
  });

  it('maps ACTIVE -> LIVE', () => {
    expect(mapCoreStateToRealEstate(LifecycleState.ACTIVE)).toBe('LIVE');
  });

  it('maps FROZEN -> FROZEN', () => {
    expect(mapCoreStateToRealEstate(LifecycleState.FROZEN)).toBe('FROZEN');
  });

  it('maps REDEEMED -> REDEEMED', () => {
    expect(mapCoreStateToRealEstate(LifecycleState.REDEEMED)).toBe('REDEEMED');
  });

  it('maps CLOSED -> CLOSED', () => {
    expect(mapCoreStateToRealEstate(LifecycleState.CLOSED)).toBe('CLOSED');
  });

  it('maps PARTIALLY_REDEEMED -> DISTRIBUTING', () => {
    expect(mapCoreStateToRealEstate(LifecycleState.PARTIALLY_REDEEMED)).toBe('DISTRIBUTING');
  });

  it('maps EXPIRED -> REDEEMED', () => {
    expect(mapCoreStateToRealEstate(LifecycleState.EXPIRED)).toBe('REDEEMED');
  });

  it('maps BURNED -> CLOSED', () => {
    expect(mapCoreStateToRealEstate(LifecycleState.BURNED)).toBe('CLOSED');
  });

  it('falls back to SOURCING for unknown string', () => {
    expect(mapCoreStateToRealEstate('UNKNOWN_STATE' as any)).toBe('SOURCING');
  });
});

describe('Bridge: mapRealEstateToCoreState', () => {
  it('maps SOURCING -> DRAFT', () => {
    expect(mapRealEstateToCoreState('SOURCING')).toBe(LifecycleState.DRAFT);
  });

  it('maps DUE_DILIGENCE -> PENDING_VERIFICATION', () => {
    expect(mapRealEstateToCoreState('DUE_DILIGENCE')).toBe(LifecycleState.PENDING_VERIFICATION);
  });

  it('maps LEGAL_STRUCTURING -> VERIFIED', () => {
    expect(mapRealEstateToCoreState('LEGAL_STRUCTURING')).toBe(LifecycleState.VERIFIED);
  });

  it('maps REGULATORY_APPROVAL -> VERIFIED', () => {
    expect(mapRealEstateToCoreState('REGULATORY_APPROVAL')).toBe(LifecycleState.VERIFIED);
  });

  it('maps TOKEN_ISSUANCE -> ACTIVE', () => {
    expect(mapRealEstateToCoreState('TOKEN_ISSUANCE')).toBe(LifecycleState.ACTIVE);
  });

  it('maps LIVE -> ACTIVE', () => {
    expect(mapRealEstateToCoreState('LIVE')).toBe(LifecycleState.ACTIVE);
  });

  it('maps SECONDARY_TRADING -> ACTIVE', () => {
    expect(mapRealEstateToCoreState('SECONDARY_TRADING')).toBe(LifecycleState.ACTIVE);
  });

  it('maps DISTRIBUTING -> ACTIVE', () => {
    expect(mapRealEstateToCoreState('DISTRIBUTING')).toBe(LifecycleState.ACTIVE);
  });

  it('maps FROZEN -> FROZEN', () => {
    expect(mapRealEstateToCoreState('FROZEN')).toBe(LifecycleState.FROZEN);
  });

  it('maps REDEEMED -> REDEEMED', () => {
    expect(mapRealEstateToCoreState('REDEEMED')).toBe(LifecycleState.REDEEMED);
  });

  it('maps CLOSED -> CLOSED', () => {
    expect(mapRealEstateToCoreState('CLOSED')).toBe(LifecycleState.CLOSED);
  });
});

describe('Bridge: core -> real estate -> core round-trip', () => {
  // These core states have a 1:1 round-trip through the bridge.
  const roundTrippableStates = [
    LifecycleState.DRAFT,
    LifecycleState.PENDING_VERIFICATION,
    LifecycleState.FROZEN,
    LifecycleState.REDEEMED,
    LifecycleState.CLOSED,
  ];

  it.each(roundTrippableStates)('core state %s round-trips correctly', (coreState) => {
    const reState = mapCoreStateToRealEstate(coreState);
    const backToCoreState = mapRealEstateToCoreState(reState);
    expect(backToCoreState).toBe(coreState);
  });
});

describe('Bridge: mapStakeStageToState', () => {
  const stakeStages = [
    'sourcing',
    'due-diligence',
    'legal-structuring',
    'regulatory-approval',
    'token-issuance',
    'live',
    'secondary-trading',
    'distributing',
    'frozen',
    'redeemed',
    'closed',
  ];

  it('maps all 11 Stake stages to corresponding states', () => {
    for (const stage of stakeStages) {
      const state = mapStakeStageToState(stage);
      expect(ALL_STATES).toContain(state);
    }
  });

  it('maps specific known stages correctly', () => {
    expect(mapStakeStageToState('sourcing')).toBe('SOURCING');
    expect(mapStakeStageToState('due-diligence')).toBe('DUE_DILIGENCE');
    expect(mapStakeStageToState('legal-structuring')).toBe('LEGAL_STRUCTURING');
    expect(mapStakeStageToState('regulatory-approval')).toBe('REGULATORY_APPROVAL');
    expect(mapStakeStageToState('token-issuance')).toBe('TOKEN_ISSUANCE');
    expect(mapStakeStageToState('live')).toBe('LIVE');
    expect(mapStakeStageToState('secondary-trading')).toBe('SECONDARY_TRADING');
    expect(mapStakeStageToState('distributing')).toBe('DISTRIBUTING');
    expect(mapStakeStageToState('frozen')).toBe('FROZEN');
    expect(mapStakeStageToState('redeemed')).toBe('REDEEMED');
    expect(mapStakeStageToState('closed')).toBe('CLOSED');
  });

  it('falls back to SOURCING for unknown stage', () => {
    expect(mapStakeStageToState('totally-unknown')).toBe('SOURCING');
  });
});

describe('Bridge: mapStateToStakeStage', () => {
  it('maps all 11 states to kebab-case Stake stages', () => {
    for (const state of ALL_STATES) {
      const stage = mapStateToStakeStage(state);
      expect(typeof stage).toBe('string');
      expect(stage.length).toBeGreaterThan(0);
      // Stake stages are lowercase kebab-case
      expect(stage).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('maps specific known states correctly', () => {
    expect(mapStateToStakeStage('SOURCING')).toBe('sourcing');
    expect(mapStateToStakeStage('DUE_DILIGENCE')).toBe('due-diligence');
    expect(mapStateToStakeStage('LEGAL_STRUCTURING')).toBe('legal-structuring');
    expect(mapStateToStakeStage('REGULATORY_APPROVAL')).toBe('regulatory-approval');
    expect(mapStateToStakeStage('TOKEN_ISSUANCE')).toBe('token-issuance');
    expect(mapStateToStakeStage('LIVE')).toBe('live');
    expect(mapStateToStakeStage('SECONDARY_TRADING')).toBe('secondary-trading');
    expect(mapStateToStakeStage('DISTRIBUTING')).toBe('distributing');
    expect(mapStateToStakeStage('FROZEN')).toBe('frozen');
    expect(mapStateToStakeStage('REDEEMED')).toBe('redeemed');
    expect(mapStateToStakeStage('CLOSED')).toBe('closed');
  });
});

describe('Bridge: Stake stage -> state -> Stake stage round-trip', () => {
  const stakeStages = [
    'sourcing',
    'due-diligence',
    'legal-structuring',
    'regulatory-approval',
    'token-issuance',
    'live',
    'secondary-trading',
    'distributing',
    'frozen',
    'redeemed',
    'closed',
  ];

  it.each(stakeStages)('Stake stage "%s" round-trips correctly', (stage) => {
    const state = mapStakeStageToState(stage);
    const backToStage = mapStateToStakeStage(state);
    expect(backToStage).toBe(stage);
  });
});

describe('Bridge: state -> Stake stage -> state round-trip', () => {
  it.each(ALL_STATES)('state %s round-trips correctly via Stake stage', (state) => {
    const stage = mapStateToStakeStage(state);
    const backToState = mapStakeStageToState(stage);
    expect(backToState).toBe(state);
  });
});
