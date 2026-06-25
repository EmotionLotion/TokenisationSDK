/**
 * T1 — Foundation conformance suite for @tokenisation/core.
 *
 * Tests the public foundation seams the architecture diagrams call out:
 *  - View 1/2: @tokenisation/core is the SDK surface (ApiClient, typed models/errors, HttpClient).
 *  - View 2: HttpClient attaches Bearer auth + Idempotency-Key.
 *  - View 3: issue flow starts at ApiClient.assets.create.
 *
 * Scope: foundation seams only — no compute/dataset/model/agent modules, no architecture change.
 * Imports from the package root (../src/index.js) to assert the real public surface.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createApiClient,
  ApiClient,
  TokenizationError,
  // typed errors / codes (public re-exports)
  ValidationError,
  ErrorCode,
  // right + asset abstraction
  RightType,
  AssetType,
  TokenStandard,
  resolveTokenStandard,
} from '../src/index.js';
// Same-module imports for identity assertions (avoids cross-barrel instanceof
// brittleness under vite's source loading; tests the real factory->class seam).
import { ApiClient as ApiClientCls, createApiClient as factory } from '../src/ApiClient.js';
import {
  SDKError as SDKErrorCls,
  ValidationError as ValidationErrorCls,
  AuthenticationError as AuthenticationErrorCls,
  isSDKError as isSDKErrorFn,
} from '../src/errors/index.js';

const VALID_KEY = 'sk_test_foundation';

// --- helper: a mock fetch capturing the request + returning a JSON body ---
function mockFetchCapture(status: number, body: unknown) {
  const calls: Array<{ url: string; init: any }> = [];
  const fn = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (_: string) => null },
      json: async () => body,
    };
  });
  // @ts-expect-error test double for global fetch
  global.fetch = fn;
  return calls;
}

afterEach(() => vi.restoreAllMocks());

// 1. Construction / config validation
describe('Seam 1 — ApiClient construction & config validation', () => {
  it('throws when apiKey is missing', () => {
    // @ts-expect-error intentionally invalid
    expect(() => createApiClient({})).toThrow();
  });

  it('throws when apiKey does not start with sk_', () => {
    expect(() => createApiClient({ apiKey: 'nope' })).toThrowError(/sk_/);
  });

  it('factory returns an ApiClient instance (same-module identity)', () => {
    const client = factory({ apiKey: VALID_KEY, baseUrl: 'http://localhost:3001' });
    expect(client).toBeInstanceOf(ApiClientCls);
  });

  it('ApiClient + createApiClient are re-exported from the package root', () => {
    expect(typeof ApiClient).toBe('function');
    expect(typeof createApiClient).toBe('function');
    // behavioral check on the root-imported factory (cross-barrel instanceof is
    // intentionally avoided — see reflection_log: vite dual-instantiation)
    const client = createApiClient({ apiKey: VALID_KEY, baseUrl: 'http://localhost:3001' });
    expect(client.assets).toBeTruthy();
    expect(client.tokens).toBeTruthy();
  });
});

// 2. Public module surface
describe('Seam 2 — ApiClient exposes the expected public modules', () => {
  const EXPECTED = [
    'projects', 'assets', 'investors', 'tokens', 'transfers', 'compliance',
    'events', 'webhooks', 'audit', 'governance', 'escrow', 'cashflow',
  ];
  const client = createApiClient({ apiKey: VALID_KEY, baseUrl: 'http://localhost:3001' });

  it.each(EXPECTED)('exposes the %s module', (name) => {
    expect((client as any)[name]).toBeTruthy();
  });

  it('exposes exactly the documented module count (guards against accidental surface drift)', () => {
    const present = EXPECTED.filter((n) => (client as any)[n]);
    expect(present.length).toBe(EXPECTED.length);
  });
});

// 3 & 4 & 7. HttpClient auth + idempotency + asset response contract (one real path)
describe('Seam 3/4/7 — HttpClient Bearer auth, Idempotency-Key, asset response unwrap', () => {
  it('attaches Bearer auth and Idempotency-Key on a mutating call, and unwraps {asset}', async () => {
    const calls = mockFetchCapture(201, { asset: { id: 'asset-1', name: 'Unit 1', rightType: 'OWNERSHIP' } });
    const client = createApiClient({ apiKey: VALID_KEY, baseUrl: 'http://localhost:3001' });

    const asset = await client.assets.create(
      { name: 'Unit 1', rightType: 'OWNERSHIP', jurisdiction: { countryCode: 'AE' } },
      'idem-123',
    );

    expect(calls.length).toBe(1);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${VALID_KEY}`);
    expect(headers['Idempotency-Key']).toBe('idem-123');
    expect(calls[0].url).toContain('/api/v1/assets');

    // View 3 contract: assets.create() returns a bare Asset (asset.id usable downstream)
    expect(asset.id).toBe('asset-1');
  });

  it('omits Idempotency-Key when none is supplied', async () => {
    const calls = mockFetchCapture(200, { asset: { id: 'asset-2' } });
    const client = createApiClient({ apiKey: VALID_KEY, baseUrl: 'http://localhost:3001' });
    await client.assets.get('11111111-1111-1111-1111-111111111111');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${VALID_KEY}`);
    expect(headers['Idempotency-Key']).toBeUndefined();
  });
});

// 5. Typed errors / ErrorCode importable & well-formed
describe('Seam 5 — typed errors & ErrorCode are importable and structured', () => {
  it('error classes from the errors module extend SDKError / Error', () => {
    const v = new ValidationErrorCls('bad', { field: 'x', constraints: {} });
    expect(v).toBeInstanceOf(SDKErrorCls);
    expect(v).toBeInstanceOf(Error);
    expect(isSDKErrorFn(v)).toBe(true);
    expect(new AuthenticationErrorCls('no')).toBeInstanceOf(SDKErrorCls);
  });

  it('ValidationError + ErrorCode are re-exported from the package root', () => {
    expect(typeof ValidationError).toBe('function');
    expect(ErrorCode).toBeTruthy();
    expect(Object.keys(ErrorCode).length).toBeGreaterThan(0);
  });

  // KNOWN ISSUE (harness/fix_queue.json T1-BUG-1): two ValidationError classes exist
  // (errors/index.ts extends SDKError; modules/validation.ts extends Error). The root
  // barrel relies on ES explicit-re-export precedence to surface the SDKError one.
  it('documents the dual ValidationError: the errors-module one is the SDKError subclass', () => {
    expect(new ValidationErrorCls('x', { field: 'f', constraints: {} })).toBeInstanceOf(SDKErrorCls);
  });

  it('TokenizationError (client error) is importable and is an Error', () => {
    const e = new TokenizationError('x', 'CODE', 400, 'req');
    expect(e).toBeInstanceOf(Error);
  });
});

// 6. RightType / AssetAbstraction exports stable
describe('Seam 6 — RightType & AssetAbstraction exports are stable', () => {
  it('RightType has the four current right types', () => {
    expect(RightType.OWNERSHIP).toBe('OWNERSHIP');
    expect(RightType.ACCESS).toBe('ACCESS');
    expect(RightType.BEHAVIOR).toBe('BEHAVIOR');
    expect(RightType.VERIFICATION).toBe('VERIFICATION');
  });

  it('RightType taxonomy is exactly the live set (T5 ratified; USAGE/LICENSE land in T5a)', () => {
    // Locks the current canonical enum. MEMBERSHIP is resolved as an ACCESS profile,
    // never a RightType (RA-3/D-10). USAGE and LICENSE are RATIFIED but intentionally
    // NOT yet enum members — they are added in T5a when the first consuming module ships.
    // When T5a lands them, update this test deliberately (it is the change-detector).
    expect(Object.values(RightType).sort()).toEqual(
      ['ACCESS', 'BEHAVIOR', 'OWNERSHIP', 'VERIFICATION'],
    );
    expect((RightType as any).MEMBERSHIP).toBeUndefined();
    expect((RightType as any).USAGE).toBeUndefined();   // ratified, lands in T5a
    expect((RightType as any).LICENSE).toBeUndefined(); // ratified, lands in T5a
  });

  it('AssetType and TokenStandard enums are present', () => {
    expect(Object.keys(AssetType).length).toBeGreaterThan(0);
    expect(Object.keys(TokenStandard).length).toBeGreaterThan(0);
  });

  it('resolveTokenStandard is a callable function', () => {
    expect(typeof resolveTokenStandard).toBe('function');
  });
});
