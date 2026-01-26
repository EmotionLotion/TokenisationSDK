/**
 * AHOY Test API Client
 * Helper for making authenticated API requests in tests
 */

export class ApiClient {
  private baseUrl: string;
  private apiKey: string | null;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey || null;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<any> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (this.apiKey) {
      requestHeaders['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = response.headers.get('content-type');
    let data: any;

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const error = new Error(data?.error || data?.message || `HTTP ${response.status}`);
      (error as any).status = response.status;
      (error as any).data = data;
      throw error;
    }

    return data;
  }

  async get(path: string, params?: Record<string, any>): Promise<any> {
    let url = path;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    return this.request('GET', url);
  }

  async post(path: string, body?: unknown, headers?: Record<string, string>): Promise<any> {
    return this.request('POST', path, body, headers);
  }

  async patch(path: string, body?: unknown): Promise<any> {
    return this.request('PATCH', path, body);
  }

  async put(path: string, body?: unknown): Promise<any> {
    return this.request('PUT', path, body);
  }

  async delete(path: string): Promise<any> {
    return this.request('DELETE', path);
  }
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout = 30000,
  interval = 1000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
}

/**
 * Generate a unique test ID
 */
export function testId(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
