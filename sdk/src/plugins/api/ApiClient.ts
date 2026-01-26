/**
 * API Client for AHOY Platform
 *
 * HTTP client with JWT authentication for communicating with the backend API server.
 */

import { AuthenticationError, NetworkError, ErrorCode } from '../../errors/index.js';
import type { EventType } from '../../core/types.js';

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null;
  onTokenExpired?: () => void;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
}

// Domain types for API responses
export interface PartyInfo {
  id: string;
  name: string;
  type: string;
  roles: string[];
  jurisdiction: string;
  verificationLevel: string;
  kycVerified: boolean;
  accreditedInvestor?: boolean;
  isFrozen?: boolean;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AssetInfo {
  id: string;
  name: string;
  rightType: string;
  state: string;
  issuerId: string;
  totalSupply?: string;
  decimals?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface EventInfo {
  id: string;
  type: EventType;
  assetId: string;
  timestamp: string;
  actorId: string;
  payload: Record<string, unknown>;
  eventVersion: number;
}

export interface DeploymentInfo {
  id: string;
  chainId: number;
  assetId: string;
  contractType: string;
  contractAddress: string;
  deployTxHash?: string;
  deployerAddress?: string;
  createdAt?: string;
}

export interface ChainInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isDefault: boolean;
  isTestnet: boolean;
}

export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;
  private onTokenExpired: () => void;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.getToken = config.getToken || (() => null);
    this.onTokenExpired = config.onTokenExpired || (() => {});
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const token = this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });

    // Handle token expiration
    if (response.status === 401) {
      const error = await response.json().catch(() => ({ message: 'Unauthorized' })) as { code?: string; message?: string };
      if (error.code === 'TOKEN_EXPIRED' || error.message?.includes('expired')) {
        this.onTokenExpired();
      }
      throw new AuthenticationError(error.message || 'Unauthorized', ErrorCode.AUTH_FAILED);
    }

    // Handle other errors
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' })) as { error?: { message?: string }; message?: string };
      throw new NetworkError(
        error.error?.message || error.message || `Request failed with status ${response.status}`,
        { statusCode: response.status }
      );
    }

    // Return empty object for 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // HTTP methods
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const queryString = params
      ? '?' + new URLSearchParams(params).toString()
      : '';
    return this.request<T>('GET', path + queryString);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // Auth-specific methods
  async getNonce(address: string): Promise<{ nonce: string; expiresAt: string }> {
    return this.post('/api/v1/auth/siwe/nonce', { address });
  }

  async verifySiwe(message: string, signature: string): Promise<{
    token: string;
    refreshToken: string;
    party: {
      id: string;
      name: string;
      type: string;
      roles: string[];
      jurisdiction: string;
      verificationLevel: string;
      kycVerified: boolean;
    };
  }> {
    return this.post('/api/v1/auth/siwe/verify', { message, signature });
  }

  async refreshToken(refreshToken: string): Promise<{
    token: string;
    refreshToken: string;
  }> {
    return this.post('/api/v1/auth/refresh', { refreshToken });
  }

  async logout(): Promise<{ success: boolean }> {
    return this.post('/api/v1/auth/logout');
  }

  async getMe(): Promise<{
    party: {
      id: string;
      name: string;
      type: string;
      roles: string[];
      jurisdiction: string;
      verificationLevel: string;
      kycVerified: boolean;
      accreditedInvestor: boolean;
      isFrozen: boolean;
    };
    wallets: Array<{
      address: string;
      chainId: number;
      isPrimary: boolean;
      verified: boolean;
    }>;
  }> {
    return this.get('/api/v1/auth/me');
  }

  // Party methods
  async getParties(params?: {
    page?: number;
    limit?: number;
    type?: string;
    jurisdiction?: string;
    search?: string;
  }): Promise<{
    parties: PartyInfo[];
    total: number;
    page: number;
    limit: number;
  }> {
    const queryParams = params ? Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ) : undefined;
    return this.get('/api/v1/parties', queryParams);
  }

  async getParty(id: string): Promise<PartyInfo> {
    return this.get(`/api/v1/parties/${id}`);
  }

  async createParty(data: {
    name: string;
    type: string;
    roles?: string[];
    jurisdiction: string;
    metadata?: Record<string, unknown>;
  }): Promise<PartyInfo> {
    return this.post('/api/v1/parties', data);
  }

  async updateParty(id: string, data: Partial<{
    name: string;
    roles: string[];
    jurisdiction: string;
    metadata: Record<string, unknown>;
  }>): Promise<PartyInfo> {
    return this.patch(`/api/v1/parties/${id}`, data);
  }

  async updateKyc(partyId: string, data: {
    verified: boolean;
    expiryDate?: string;
    verificationLevel?: string;
    accreditedInvestor?: boolean;
  }): Promise<PartyInfo> {
    return this.post(`/api/v1/parties/${partyId}/kyc`, data);
  }

  async freezeParty(partyId: string, reason?: string): Promise<PartyInfo> {
    return this.post(`/api/v1/parties/${partyId}/freeze`, { reason });
  }

  async unfreezeParty(partyId: string): Promise<PartyInfo> {
    return this.post(`/api/v1/parties/${partyId}/unfreeze`);
  }

  // Asset methods
  async getAssets(params?: {
    page?: number;
    limit?: number;
    state?: string;
    rightType?: string;
    issuerId?: string;
    search?: string;
  }): Promise<{
    assets: AssetInfo[];
    total: number;
    page: number;
    limit: number;
  }> {
    const queryParams = params ? Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ) : undefined;
    return this.get('/api/v1/assets', queryParams);
  }

  async getAsset(id: string): Promise<AssetInfo> {
    return this.get(`/api/v1/assets/${id}`);
  }

  async createAsset(data: {
    name: string;
    rightType: string;
    issuerId: string;
    totalSupply?: string;
    decimals?: number;
    metadata?: Record<string, unknown>;
  }): Promise<AssetInfo> {
    return this.post('/api/v1/assets', data);
  }

  async updateAsset(id: string, data: Partial<{
    name: string;
    state: string;
    metadata: Record<string, unknown>;
  }>): Promise<AssetInfo> {
    return this.patch(`/api/v1/assets/${id}`, data);
  }

  async transitionAsset(id: string, toState: string, reason?: string): Promise<{
    asset: AssetInfo;
    event: EventInfo;
  }> {
    return this.post(`/api/v1/assets/${id}/transition`, { toState, reason });
  }

  async deleteAsset(id: string): Promise<{ success: boolean }> {
    return this.delete(`/api/v1/assets/${id}`);
  }

  // Token methods
  async getBalances(assetId: string): Promise<{
    assetId: string;
    balances: Record<string, { balance: string; holderName: string; holderType: string }>;
    totalSupply: string;
  }> {
    return this.get(`/api/v1/tokens/${assetId}/balances`);
  }

  async getBalance(assetId: string, holderId: string): Promise<{
    assetId: string;
    holderId: string;
    balance: string;
  }> {
    return this.get(`/api/v1/tokens/${assetId}/balance/${holderId}`);
  }

  async mint(assetId: string, to: string, amount: string): Promise<{
    success: boolean;
    txHash: string;
    event: EventInfo;
    newBalance: string;
  }> {
    return this.post(`/api/v1/tokens/${assetId}/mint`, { to, amount });
  }

  async transfer(assetId: string, from: string, to: string, amount: string): Promise<{
    success: boolean;
    txHash: string;
    event: EventInfo;
    fromBalance: string;
    toBalance: string;
  }> {
    return this.post(`/api/v1/tokens/${assetId}/transfer`, { from, to, amount });
  }

  async burn(assetId: string, from: string, amount: string): Promise<{
    success: boolean;
    txHash: string;
    event: EventInfo;
    newBalance: string;
  }> {
    return this.post(`/api/v1/tokens/${assetId}/burn`, { from, amount });
  }

  // Event methods
  async getEvents(params?: {
    page?: number;
    limit?: number;
    assetId?: string;
    types?: string;
    from?: string;
    to?: string;
    actorId?: string;
  }): Promise<{
    events: EventInfo[];
    total: number;
    page: number;
    limit: number;
  }> {
    const queryParams = params ? Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ) : undefined;
    return this.get('/api/v1/events', queryParams);
  }

  async getEvent(id: string): Promise<EventInfo> {
    return this.get(`/api/v1/events/${id}`);
  }

  async getAssetEvents(assetId: string, params?: {
    page?: number;
    limit?: number;
    types?: string;
  }): Promise<{
    events: EventInfo[];
    total: number;
    page: number;
    limit: number;
  }> {
    const queryParams = params ? Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ) : undefined;
    return this.get(`/api/v1/events/asset/${assetId}`, queryParams);
  }

  async createEvent(event: {
    type: string;
    assetId: string;
    payload?: Record<string, unknown>;
  }): Promise<EventInfo> {
    return this.post('/api/v1/events', event);
  }

  // Chain methods
  async getChains(): Promise<{
    chains: Array<{
      chainId: number;
      name: string;
      rpcUrl: string;
      explorerUrl: string;
      nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
      };
      isDefault: boolean;
      isTestnet: boolean;
    }>;
  }> {
    return this.get('/api/v1/chains');
  }

  async getChain(chainId: number): Promise<ChainInfo> {
    return this.get(`/api/v1/chains/${chainId}`);
  }

  async getChainDeployments(chainId: number): Promise<{ deployments: DeploymentInfo[] }> {
    return this.get(`/api/v1/chains/${chainId}/deployments`);
  }

  async getAssetDeployments(assetId: string): Promise<{ deployments: DeploymentInfo[] }> {
    return this.get(`/api/v1/chains/asset/${assetId}`);
  }

  async createDeployment(chainId: number, data: {
    assetId: string;
    contractType: string;
    contractAddress: string;
    deployTxHash?: string;
    deployerAddress?: string;
    abi?: Array<Record<string, unknown>>;
  }): Promise<DeploymentInfo> {
    return this.post(`/api/v1/chains/${chainId}/deployments`, data);
  }

  async getCCIPLanes(): Promise<{
    lanes: Array<{
      source: number;
      dest: number;
      name: string;
    }>;
  }> {
    return this.get('/api/v1/chains/ccip/lanes');
  }
}

export default ApiClient;
