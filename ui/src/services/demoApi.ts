import { API_URL } from '../config/wagmi';

const HEADERS = { 'Content-Type': 'application/json', 'x-dev-org-id': 'dev-org' };

export const demoApi = {
  post: (path: string, body: Record<string, unknown>) =>
    fetch(`${API_URL}/api/v1${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    }).then((r) => r.json()),

  get: (path: string) =>
    fetch(`${API_URL}/api/v1${path}`, { headers: HEADERS }).then((r) => r.json()),
};
