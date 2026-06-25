/**
 * T2 — RBAC authorization conformance (G3).
 *
 * Locks the reconciliation between coarse API-key scopes ('read'/'write'/'admin')
 * and rich role permission strings ('*','read:*','write:compliance','write:tokens')
 * under one matcher, and verifies the route guard (requireScope) uses it.
 */
import { describe, it, expect } from 'vitest';
import { permissionGranted, requiredPermission } from '../middleware/permission.js';
import { requireScope } from '../middleware/scopeGuard.js';
import { isDevModeEnabled } from '../middleware/auth.js';

describe('permissionGranted — the single authorization matcher (G3)', () => {
  it('exact permission match', () => {
    expect(permissionGranted(['write:tokens'], 'write:tokens')).toBe(true);
    expect(permissionGranted(['read'], 'read')).toBe(true); // legacy coarse
  });

  it('wildcard permission match (read:* covers read and read:resource)', () => {
    expect(permissionGranted(['read:*'], 'read')).toBe(true);
    expect(permissionGranted(['read:*'], 'read:assets')).toBe(true);
    expect(permissionGranted(['read:*'], 'read:tokens')).toBe(true);
  });

  it('coarse action covers a resource action (write covers write:tokens)', () => {
    expect(permissionGranted(['write'], 'write:tokens')).toBe(true);
    expect(permissionGranted(['read', 'write'], 'write:compliance')).toBe(true);
  });

  it('denied when the permission is missing', () => {
    expect(permissionGranted(['read:*'], 'write')).toBe(false);
    expect(permissionGranted(['write:compliance'], 'write:tokens')).toBe(false);
    expect(permissionGranted([], 'read')).toBe(false);
    expect(permissionGranted(undefined, 'read')).toBe(false);
  });

  it('write does NOT satisfy read (an action never implies another action)', () => {
    expect(permissionGranted(['write'], 'read')).toBe(false);
    expect(permissionGranted(['write:tokens'], 'read')).toBe(false);
    expect(permissionGranted(['write:*'], 'read')).toBe(false);
  });

  it("'*' and 'admin' grant everything (superuser)", () => {
    expect(permissionGranted(['*'], 'write:tokens')).toBe(true);
    expect(permissionGranted(['admin'], 'read:anything')).toBe(true);
  });

  it('maps the default role permission strings correctly', () => {
    const ops = ['read:*', 'write:assets', 'write:tokens'];            // DEFAULT_ROLES ops
    expect(permissionGranted(ops, 'read')).toBe(true);                  // read:* -> read
    expect(permissionGranted(ops, 'write:tokens')).toBe(true);          // exact
    expect(permissionGranted(ops, 'write:compliance')).toBe(false);     // not granted
    const compliance = ['read:*', 'write:compliance', 'write:kyc'];     // DEFAULT_ROLES compliance_officer
    expect(permissionGranted(compliance, 'write:compliance')).toBe(true);
    expect(permissionGranted(compliance, 'write:tokens')).toBe(false);
    const readOnly = ['read:*'];                                        // DEFAULT_ROLES read_only
    expect(permissionGranted(readOnly, 'read')).toBe(true);
    expect(permissionGranted(readOnly, 'write')).toBe(false);
  });

  it('requiredPermission builds canonical strings', () => {
    expect(requiredPermission('write')).toBe('write');
    expect(requiredPermission('write', 'tokens')).toBe('write:tokens');
  });
});

// minimal express-style harness for requireScope
function run(mw: any, apiKey: any) {
  const req: any = { apiKey };
  let nextErr: any = 'NOT_CALLED';
  mw(req, {} as any, (e?: any) => { nextErr = e; });
  return nextErr; // undefined = allowed; Error = denied
}

describe('requireScope — route guard uses the matcher (backward compatible)', () => {
  it('allows a coarse key on the legacy form (no regression)', () => {
    expect(run(requireScope('read'), { scopes: ['read', 'write'], orgId: 'o', keyId: 'k' })).toBeUndefined();
    expect(run(requireScope('write'), { scopes: ['read', 'write'], orgId: 'o', keyId: 'k' })).toBeUndefined();
  });

  it('FIXED: a role-permission key now passes where exact-match wrongly denied', () => {
    const ops = { scopes: ['read:*', 'write:assets', 'write:tokens'], orgId: 'o', keyId: 'k' };
    expect(run(requireScope('read'), ops)).toBeUndefined();              // was denied before T2
    expect(run(requireScope('write', 'tokens'), ops)).toBeUndefined();   // resource-level
  });

  it('denies insufficient permission and missing apiKey', () => {
    const readonly = { scopes: ['read:*'], orgId: 'o', keyId: 'k' };
    expect(run(requireScope('write'), readonly)).toBeInstanceOf(Error);
    expect(run(requireScope('write', 'tokens'), readonly)).toBeInstanceOf(Error);
    expect(run(requireScope('read'), undefined)).toBeInstanceOf(Error);  // unauthenticated
  });

  it('admin scope and * permission grant everything', () => {
    expect(run(requireScope('write', 'compliance'), { scopes: ['admin'], orgId: 'o', keyId: 'k' })).toBeUndefined();
    expect(run(requireScope('write', 'compliance'), { scopes: ['*'], orgId: 'o', keyId: 'k' })).toBeUndefined();
  });
});

describe('dev-mode bypass (documented; cannot be production security)', () => {
  // The dev bypass (x-dev-org-id / X-API-Key) assigns scopes:['admin']. It applies ONLY when
  // !IS_PRODUCTION && !IS_STAGING && AUTH_DEV_MODE==='true' (auth.ts apiKeyMiddleware), and is
  // additionally gated by IP and org allowlists.
  it('is disabled by default in this environment (AUTH_DEV_MODE not true)', () => {
    expect(typeof isDevModeEnabled).toBe('function');
    expect(isDevModeEnabled()).toBe(false);
  });
  // PROD-SAFETY INVARIANT (verified by code review, NOT re-import — importing auth.ts under
  // NODE_ENV=production calls process.exit(1) and would kill the test runner):
  //   auth.ts:27-37  -> DEV_MODE IIFE forces `false` whenever IS_PRODUCTION || IS_STAGING,
  //                     regardless of AUTH_DEV_MODE.
  //   auth.ts:63-75  -> startup guard process.exit(1) if AUTH_DEV_MODE is set in prod/staging.
  // So the ['admin'] dev bypass can never apply in production/staging.
});
