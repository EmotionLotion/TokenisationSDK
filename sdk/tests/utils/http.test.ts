/**
 * HttpClient Unit Tests
 *
 * Comprehensive tests for the HTTP client including URL construction,
 * authentication headers, retry logic, timeout handling, error mapping,
 * and convenience methods (get, post, put, patch, delete, list).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HttpClient, TokenizationError } from '../../src/utils/http.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal SDK config reused across tests. */
const BASE_CONFIG = {
  apiKey: 'sk_test_abc123',
  baseUrl: 'https://api.example.com',
  timeout: 5000,
  retry: { maxRetries: 2, retryDelay: 100, retryOn: [408, 429, 500, 502, 503, 504] },
};

/** Build a mock Response that `fetch` can return. */
function mockResponse(
  body: unknown,
  init: {
    status?: number;
    headers?: Record<string, string>;
  } = {},
): Response {
  const { status = 200, headers = {} } = init;
  const headersObj = new Headers({
    'X-Request-ID': 'req_mock_123',
    ...headers,
  });

  return new Response(JSON.stringify(body), {
    status,
    headers: headersObj,
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('HttpClient', () => {
  let client: HttpClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new HttpClient(BASE_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // =========================================================================
  // 1. URL construction
  // =========================================================================

  describe('URL construction', () => {
    it('should build a URL from base URL and path', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ id: 1 }));

      await client.get('/v1/tokens');

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toBe('https://api.example.com/v1/tokens');
    });

    it('should append query parameters, omitting undefined values', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ id: 1 }));

      await client.get('/v1/tokens', { page: 2, limit: 10, filter: undefined });

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get('page')).toBe('2');
      expect(calledUrl.searchParams.get('limit')).toBe('10');
      expect(calledUrl.searchParams.has('filter')).toBe(false);
    });

    it('should use the default base URL when none is provided', async () => {
      const defaultClient = new HttpClient({ apiKey: 'sk_test_xyz' });
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await defaultClient.get('/v1/health');

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toBe('https://api.tokenisation.io/v1/health');
    });

    it('should convert boolean query parameters to strings', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await client.get('/v1/tokens', { active: true, archived: false });

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get('active')).toBe('true');
      expect(calledUrl.searchParams.get('archived')).toBe('false');
    });
  });

  // =========================================================================
  // 2. Authentication headers
  // =========================================================================

  describe('Authentication headers', () => {
    it('should send Bearer token on every request', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await client.get('/v1/tokens');

      const calledOptions = fetchMock.mock.calls[0][1];
      expect(calledOptions.headers['Authorization']).toBe('Bearer sk_test_abc123');
    });

    it('should include Content-Type, Accept, and User-Agent headers', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await client.get('/v1/tokens');

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Accept']).toBe('application/json');
      expect(headers['User-Agent']).toBe('@tokenisation/sdk/1.0.0');
    });

    it('should merge defaultHeaders from SDK config', async () => {
      const customClient = new HttpClient({
        ...BASE_CONFIG,
        defaultHeaders: { 'X-Tenant': 'tenant_123' },
      });
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await customClient.get('/v1/tokens');

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['X-Tenant']).toBe('tenant_123');
      // Standard headers should still be present
      expect(headers['Authorization']).toBe('Bearer sk_test_abc123');
    });
  });

  // =========================================================================
  // 3. POST idempotency key
  // =========================================================================

  describe('POST idempotency key', () => {
    it('should auto-generate an Idempotency-Key header for POST requests', async () => {
      // Mock crypto.randomUUID
      vi.stubGlobal('crypto', { randomUUID: () => 'auto-generated-uuid' });
      fetchMock.mockResolvedValueOnce(mockResponse({ id: 'tok_new' }));

      await client.post('/v1/tokens', { name: 'Test' });

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['Idempotency-Key']).toBe('auto-generated-uuid');
    });

    it('should use a caller-supplied idempotency key if provided', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ id: 'tok_new' }));

      await client.post('/v1/tokens', { name: 'Test' }, { idempotencyKey: 'my-custom-key' });

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['Idempotency-Key']).toBe('my-custom-key');
    });

    it('should NOT include Idempotency-Key on GET requests', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await client.get('/v1/tokens');

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['Idempotency-Key']).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. Retry logic
  // =========================================================================

  describe('Retry logic', () => {
    it('should retry on retryable status codes with exponential backoff', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse({ error: { message: 'fail', code: 'SERVER_ERROR' } }, { status: 500 }))
        .mockResolvedValueOnce(mockResponse({ error: { message: 'fail', code: 'SERVER_ERROR' } }, { status: 500 }))
        .mockResolvedValueOnce(mockResponse({ success: true }));

      const promise = client.get('/v1/tokens');
      // Advance through the retry delays
      await vi.advanceTimersByTimeAsync(100); // 1st retry: 100ms * 2^0 = 100ms
      await vi.advanceTimersByTimeAsync(200); // 2nd retry: 100ms * 2^1 = 200ms

      const result = await promise;
      expect(result.data).toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should throw TokenizationError after exhausting all retries on server errors', async () => {
      // maxRetries is 2, so 3 total attempts (initial + 2 retries)
      // Each call needs a fresh Response because the body stream can only be read once
      const errorPayload = { error: { message: 'Server overloaded', code: 'SERVER_ERROR' } };
      fetchMock.mockImplementation(() =>
        Promise.resolve(mockResponse(errorPayload, { status: 500 })),
      );

      // Attach the rejection handler immediately to prevent unhandled rejection warnings
      const promise = client.get('/v1/tokens').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(100); // 1st retry delay
      await vi.advanceTimersByTimeAsync(200); // 2nd retry delay

      const error = await promise;
      expect(error).toBeInstanceOf(TokenizationError);
      expect((error as TokenizationError).code).toBe('SERVER_ERROR');
      expect((error as TokenizationError).statusCode).toBe(500);
      expect((error as TokenizationError).message).toBe('Server overloaded');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should NOT retry on non-retryable status codes (e.g. 400, 401, 404)', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          { error: { message: 'Bad request', code: 'VALIDATION_ERROR' } },
          { status: 400 },
        ),
      );

      await expect(client.get('/v1/tokens')).rejects.toThrow(TokenizationError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should retry on 408 Request Timeout', async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockResponse({ error: { message: 'timeout', code: 'TIMEOUT' } }, { status: 408 }),
        )
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = client.get('/v1/tokens');
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result.data).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 5. Retry-After header parsing
  // =========================================================================

  describe('Retry-After header parsing', () => {
    it('should use Retry-After seconds value on 429 instead of exponential backoff', async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockResponse(
            { error: { message: 'Rate limited', code: 'RATE_LIMITED' } },
            { status: 429, headers: { 'Retry-After': '3' } },
          ),
        )
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = client.get('/v1/tokens');
      // Retry-After is 3 seconds = 3000ms
      await vi.advanceTimersByTimeAsync(3000);

      const result = await promise;
      expect(result.data).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should use Retry-After seconds value on 503 Service Unavailable', async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockResponse(
            { error: { message: 'Unavailable', code: 'UNAVAILABLE' } },
            { status: 503, headers: { 'Retry-After': '5' } },
          ),
        )
        .mockResolvedValueOnce(mockResponse({ restored: true }));

      const promise = client.get('/v1/tokens');
      await vi.advanceTimersByTimeAsync(5000);

      const result = await promise;
      expect(result.data).toEqual({ restored: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should fall back to exponential backoff if Retry-After is absent on a 429', async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockResponse(
            { error: { message: 'Rate limited', code: 'RATE_LIMITED' } },
            { status: 429 },
          ),
        )
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = client.get('/v1/tokens');
      // Exponential backoff: retryDelay * 2^(retryCount-1) = 100 * 2^0 = 100ms
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result.data).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 6. Timeout handling
  // =========================================================================

  describe('Timeout handling', () => {
    it('should pass an AbortController signal to fetch', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await client.get('/v1/tokens');

      const calledOptions = fetchMock.mock.calls[0][1];
      expect(calledOptions.signal).toBeInstanceOf(AbortSignal);
    });

    it('should abort the request and retry when the timeout fires', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      fetchMock
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = client.get('/v1/tokens');
      // Advance past the retry delay for the network-error retry
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result.data).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 7. Error mapping
  // =========================================================================

  describe('Error mapping', () => {
    it('should throw TokenizationError with correct status, code, and requestId', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          { error: { message: 'Token not found', code: 'NOT_FOUND', details: { id: 'tok_abc' } } },
          { status: 404, headers: { 'X-Request-ID': 'req_err_456' } },
        ),
      );

      try {
        await client.get('/v1/tokens/tok_abc');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TokenizationError);
        const error = err as TokenizationError;
        expect(error.message).toBe('Token not found');
        expect(error.code).toBe('NOT_FOUND');
        expect(error.statusCode).toBe(404);
        expect(error.requestId).toBe('req_err_456');
        expect(error.details).toEqual({ id: 'tok_abc' });
      }
    });

    it('should fall back to generic message when error body is empty', async () => {
      // Respond with something that is not valid JSON for the error body
      const badResponse = new Response('not json', {
        status: 422,
        headers: { 'X-Request-ID': 'req_bad' },
      });
      fetchMock.mockResolvedValueOnce(badResponse);

      try {
        await client.post('/v1/tokens', { invalid: true });
        expect.unreachable('Should have thrown');
      } catch (err) {
        const error = err as TokenizationError;
        expect(error).toBeInstanceOf(TokenizationError);
        expect(error.statusCode).toBe(422);
        expect(error.code).toBe('REQUEST_FAILED');
        expect(error.message).toContain('422');
      }
    });

    it('should set name property to "TokenizationError"', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
          { status: 403 },
        ),
      );

      await expect(client.get('/v1/tokens')).rejects.toMatchObject({
        name: 'TokenizationError',
      });
    });
  });

  // =========================================================================
  // 8. Network error handling
  // =========================================================================

  describe('Network error handling', () => {
    it('should retry network errors and ultimately throw NETWORK_ERROR', async () => {
      const networkError = new TypeError('Failed to fetch');
      fetchMock.mockRejectedValue(networkError);

      // Attach the rejection handler immediately to prevent unhandled rejection warnings
      const promise = client.get('/v1/tokens').catch((e: unknown) => e);
      // Advance through all retries: 100ms, 200ms
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      const error = await promise;
      expect(error).toBeInstanceOf(TokenizationError);
      expect((error as TokenizationError).code).toBe('NETWORK_ERROR');
      expect((error as TokenizationError).statusCode).toBe(0);
      expect((error as TokenizationError).details).toEqual({ originalError: 'TypeError' });
      // initial + 2 retries = 3 calls total
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should recover if network succeeds on a retry', async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce(mockResponse({ recovered: true }));

      const promise = client.get('/v1/tokens');
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result.data).toEqual({ recovered: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 9. HTTP verb convenience methods
  // =========================================================================

  describe('HTTP verb convenience methods', () => {
    it('get() should issue a GET request', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ id: 1 }));

      await client.get('/v1/tokens');

      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
      expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });

    it('post() should issue a POST request with JSON body', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ id: 'tok_new' }));
      const body = { name: 'My Token', amount: 1000 };

      await client.post('/v1/tokens', body);

      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(body));
    });

    it('put() should issue a PUT request with JSON body', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ updated: true }));
      const body = { name: 'Updated Token' };

      await client.put('/v1/tokens/tok_1', body);

      expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(body));
    });

    it('patch() should issue a PATCH request with JSON body', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ patched: true }));
      const body = { status: 'active' };

      await client.patch('/v1/tokens/tok_1', body);

      expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(body));
    });

    it('delete() should issue a DELETE request', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ deleted: true }));

      await client.delete('/v1/tokens/tok_1');

      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    });

    it('delete() should support query parameters', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ deleted: true }));

      await client.delete('/v1/tokens/tok_1', { force: true, reason: 'test' });

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get('force')).toBe('true');
      expect(calledUrl.searchParams.get('reason')).toBe('test');
    });
  });

  // =========================================================================
  // 10. list() pagination helper
  // =========================================================================

  describe('list() pagination helper', () => {
    it('should return response.data directly (PaginatedResponse)', async () => {
      const paginatedPayload = {
        data: [{ id: 'tok_1' }, { id: 'tok_2' }],
        count: 2,
        page: 1,
        limit: 10,
        hasMore: false,
      };
      fetchMock.mockResolvedValueOnce(mockResponse(paginatedPayload));

      const result = await client.list('/v1/tokens', { page: 1, limit: 10 });

      // list() unwraps: returns the PaginatedResponse directly
      expect(result).toEqual(paginatedPayload);
      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('should forward query parameters to the underlying GET call', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ data: [], count: 0, hasMore: false }),
      );

      await client.list('/v1/tokens', { status: 'active', page: 3 });

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get('status')).toBe('active');
      expect(calledUrl.searchParams.get('page')).toBe('3');
    });
  });

  // =========================================================================
  // 11. Response parsing
  // =========================================================================

  describe('Response parsing', () => {
    it('should extract requestId from X-Request-ID header', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ id: 1 }, { headers: { 'X-Request-ID': 'req_unique_789' } }),
      );

      const result = await client.get('/v1/tokens/tok_1');

      expect(result.requestId).toBe('req_unique_789');
    });

    it('should extract idempotencyKey from Idempotency-Key response header', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          { id: 'tok_new' },
          { headers: { 'Idempotency-Key': 'idem_from_server' } },
        ),
      );

      const result = await client.post('/v1/tokens', { name: 'test' }, { idempotencyKey: 'my-key' });

      expect(result.idempotencyKey).toBe('idem_from_server');
    });

    it('should return the parsed JSON body as data', async () => {
      const payload = { id: 'tok_42', name: 'Gold Bond', amount: 50000 };
      fetchMock.mockResolvedValueOnce(mockResponse(payload));

      const result = await client.get<typeof payload>('/v1/tokens/tok_42');

      expect(result.data).toEqual(payload);
    });
  });

  // =========================================================================
  // 12. request() method directly
  // =========================================================================

  describe('request() direct usage', () => {
    it('should accept custom headers that override defaults', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await client.request({
        method: 'GET',
        path: '/v1/tokens',
        headers: { 'Accept': 'text/plain' },
      });

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['Accept']).toBe('text/plain');
      // Auth should still be present
      expect(headers['Authorization']).toBe('Bearer sk_test_abc123');
    });

    it('should include idempotencyKey header when provided to request()', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await client.request({
        method: 'POST',
        path: '/v1/tokens',
        body: { name: 'test' },
        idempotencyKey: 'manual-key-123',
      });

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['Idempotency-Key']).toBe('manual-key-123');
    });

    it('should not send a body for GET requests', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

      await client.request({ method: 'GET', path: '/v1/health' });

      expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });
  });

  // =========================================================================
  // 13. Edge cases
  // =========================================================================

  describe('Edge cases', () => {
    it('should handle a response with no X-Request-ID header gracefully', async () => {
      const resp = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {},
      });
      fetchMock.mockResolvedValueOnce(resp);

      const result = await client.get('/v1/health');

      expect(result.requestId).toBe('');
    });

    it('should handle post() with no body', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ created: true }));

      await client.post('/v1/actions/trigger');

      expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });

    it('should use default retry config when none is provided', async () => {
      const minimalClient = new HttpClient({ apiKey: 'sk_test_minimal' });
      // The first call returns 500, should retry
      fetchMock
        .mockResolvedValueOnce(
          mockResponse({ error: { message: 'fail', code: 'ERR' } }, { status: 500 }),
        )
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = minimalClient.get('/v1/test');
      // Default retryDelay is 1000ms, first retry: 1000 * 2^0 = 1000ms
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result.data).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should not retry TokenizationError thrown from non-retryable status', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          { error: { message: 'Unauthorized', code: 'AUTH_ERROR' } },
          { status: 401 },
        ),
      );

      await expect(client.get('/v1/tokens')).rejects.toMatchObject({
        code: 'AUTH_ERROR',
        statusCode: 401,
      });
      // Must be exactly 1 call - no retries
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
