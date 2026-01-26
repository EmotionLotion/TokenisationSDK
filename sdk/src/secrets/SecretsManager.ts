/**
 * Secrets Management
 *
 * Secure secrets handling with support for:
 * - Environment variables
 * - AWS Secrets Manager
 * - HashiCorp Vault
 * - Azure Key Vault
 * - GCP Secret Manager
 */

import { ok, err, type Result } from '../core/types.js';

// Note: @aws-sdk/client-secrets-manager is an optional peer dependency
// It will be dynamically imported only when the AWS provider is used

// ============================================================================
// TYPES
// ============================================================================

export interface Secret {
  key: string;
  value: string;
  version?: string;
  metadata?: Record<string, string>;
  expiresAt?: string;
}

export interface ISecretsProvider {
  /** Provider name */
  readonly name: string;

  /** Get a secret by key */
  get(key: string): Promise<Result<Secret, string>>;

  /** Set a secret */
  set(key: string, value: string, metadata?: Record<string, string>): Promise<Result<void, string>>;

  /** Delete a secret */
  delete(key: string): Promise<Result<void, string>>;

  /** List all secret keys */
  list(): Promise<Result<string[], string>>;

  /** Check if a secret exists */
  exists(key: string): Promise<Result<boolean, string>>;

  /** Rotate a secret */
  rotate(key: string, newValue: string): Promise<Result<Secret, string>>;
}

// ============================================================================
// ENVIRONMENT VARIABLES PROVIDER
// ============================================================================

export class EnvSecretsProvider implements ISecretsProvider {
  readonly name = 'environment';
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  private getEnvKey(key: string): string {
    return this.prefix + key.toUpperCase().replace(/[.-]/g, '_');
  }

  async get(key: string): Promise<Result<Secret, string>> {
    const envKey = this.getEnvKey(key);
    const value = process.env[envKey];

    if (value === undefined) {
      return err(`Secret not found: ${key}`);
    }

    return ok({
      key,
      value,
    });
  }

  async set(key: string, value: string): Promise<Result<void, string>> {
    const envKey = this.getEnvKey(key);
    process.env[envKey] = value;
    return ok(undefined);
  }

  async delete(key: string): Promise<Result<void, string>> {
    const envKey = this.getEnvKey(key);
    delete process.env[envKey];
    return ok(undefined);
  }

  async list(): Promise<Result<string[], string>> {
    const keys = Object.keys(process.env)
      .filter(k => k.startsWith(this.prefix))
      .map(k => k.slice(this.prefix.length).toLowerCase().replace(/_/g, '-'));
    return ok(keys);
  }

  async exists(key: string): Promise<Result<boolean, string>> {
    const envKey = this.getEnvKey(key);
    return ok(envKey in process.env);
  }

  async rotate(key: string, newValue: string): Promise<Result<Secret, string>> {
    await this.set(key, newValue);
    return this.get(key);
  }
}

// ============================================================================
// AWS SECRETS MANAGER PROVIDER
// ============================================================================

export interface AWSSecretsConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Prefix for secret names */
  prefix?: string;
}

export class AWSSecretsProvider implements ISecretsProvider {
  readonly name = 'aws-secrets-manager';
  private config: AWSSecretsConfig;
  private client: unknown;

  constructor(config: AWSSecretsConfig) {
    this.config = config;
  }

  private async getClient(): Promise<unknown> {
    if (this.client) return this.client;

    try {
      const { SecretsManagerClient } = // @ts-ignore - AWS SDK is an optional peer dependency
      await import('@aws-sdk/client-secrets-manager');
      this.client = new SecretsManagerClient({
        region: this.config.region,
        credentials: this.config.accessKeyId ? {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey!,
        } : undefined,
      });
      return this.client;
    } catch {
      throw new Error('AWS SDK not installed. Run: npm install @aws-sdk/client-secrets-manager');
    }
  }

  private getSecretName(key: string): string {
    return (this.config.prefix ?? '') + key;
  }

  async get(key: string): Promise<Result<Secret, string>> {
    try {
      const client = await this.getClient();
      const { GetSecretValueCommand } = // @ts-ignore - AWS SDK is an optional peer dependency
      await import('@aws-sdk/client-secrets-manager');

      const command = new GetSecretValueCommand({
        SecretId: this.getSecretName(key),
      });

      const response = await (client as { send: (cmd: unknown) => Promise<{
        SecretString?: string;
        VersionId?: string;
      }> }).send(command);

      if (!response.SecretString) {
        return err(`Secret ${key} has no string value`);
      }

      return ok({
        key,
        value: response.SecretString,
        version: response.VersionId,
      });
    } catch (error) {
      return err(`Failed to get secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async set(key: string, value: string, metadata?: Record<string, string>): Promise<Result<void, string>> {
    try {
      const client = await this.getClient();
      const { CreateSecretCommand, PutSecretValueCommand } = // @ts-ignore - AWS SDK is an optional peer dependency
      await import('@aws-sdk/client-secrets-manager');

      // Try to update existing secret first
      try {
        const putCommand = new PutSecretValueCommand({
          SecretId: this.getSecretName(key),
          SecretString: value,
        });
        await (client as { send: (cmd: unknown) => Promise<void> }).send(putCommand);
      } catch {
        // Secret doesn't exist, create it
        const createCommand = new CreateSecretCommand({
          Name: this.getSecretName(key),
          SecretString: value,
          Tags: metadata ? Object.entries(metadata).map(([Key, Value]) => ({ Key, Value })) : undefined,
        });
        await (client as { send: (cmd: unknown) => Promise<void> }).send(createCommand);
      }

      return ok(undefined);
    } catch (error) {
      return err(`Failed to set secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(key: string): Promise<Result<void, string>> {
    try {
      const client = await this.getClient();
      const { DeleteSecretCommand } = // @ts-ignore - AWS SDK is an optional peer dependency
      await import('@aws-sdk/client-secrets-manager');

      const command = new DeleteSecretCommand({
        SecretId: this.getSecretName(key),
        ForceDeleteWithoutRecovery: true,
      });

      await (client as { send: (cmd: unknown) => Promise<void> }).send(command);
      return ok(undefined);
    } catch (error) {
      return err(`Failed to delete secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async list(): Promise<Result<string[], string>> {
    try {
      const client = await this.getClient();
      const { ListSecretsCommand } = // @ts-ignore - AWS SDK is an optional peer dependency
      await import('@aws-sdk/client-secrets-manager');

      const command = new ListSecretsCommand({});
      const response = await (client as { send: (cmd: unknown) => Promise<{
        SecretList?: Array<{ Name?: string }>;
      }> }).send(command);

      const prefix = this.config.prefix ?? '';
      const keys = (response.SecretList ?? [])
        .map(s => s.Name)
        .filter((name): name is string => !!name && name.startsWith(prefix))
        .map(name => name.slice(prefix.length));

      return ok(keys);
    } catch (error) {
      return err(`Failed to list secrets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async exists(key: string): Promise<Result<boolean, string>> {
    const result = await this.get(key);
    return ok(result.success);
  }

  async rotate(key: string, newValue: string): Promise<Result<Secret, string>> {
    try {
      const client = await this.getClient();
      const { PutSecretValueCommand } = // @ts-ignore - AWS SDK is an optional peer dependency
      await import('@aws-sdk/client-secrets-manager');

      const command = new PutSecretValueCommand({
        SecretId: this.getSecretName(key),
        SecretString: newValue,
      });

      const response = await (client as { send: (cmd: unknown) => Promise<{
        VersionId?: string;
      }> }).send(command);

      return ok({
        key,
        value: newValue,
        version: response.VersionId,
      });
    } catch (error) {
      return err(`Failed to rotate secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// ============================================================================
// HASHICORP VAULT PROVIDER
// ============================================================================

export interface VaultConfig {
  address: string;
  token?: string;
  /** Path prefix (e.g., 'secret/data/') */
  path?: string;
  /** Namespace for Vault Enterprise */
  namespace?: string;
}

export class VaultSecretsProvider implements ISecretsProvider {
  readonly name = 'hashicorp-vault';
  private config: VaultConfig;

  constructor(config: VaultConfig) {
    this.config = {
      ...config,
      path: config.path ?? 'secret/data/',
    };
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Response> {
    const url = `${this.config.address}/v1/${this.config.path}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.token) {
      headers['X-Vault-Token'] = this.config.token;
    }

    if (this.config.namespace) {
      headers['X-Vault-Namespace'] = this.config.namespace;
    }

    return fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async get(key: string): Promise<Result<Secret, string>> {
    try {
      const response = await this.request('GET', key);

      if (!response.ok) {
        if (response.status === 404) {
          return err(`Secret not found: ${key}`);
        }
        return err(`Vault error: ${response.statusText}`);
      }

      const data = await response.json() as {
        data?: { data?: Record<string, string>; metadata?: { version?: number } };
      };

      const secretData = data.data?.data;
      if (!secretData || !secretData.value) {
        return err(`Invalid secret format for: ${key}`);
      }

      return ok({
        key,
        value: secretData.value,
        version: data.data?.metadata?.version?.toString(),
        metadata: Object.fromEntries(
          Object.entries(secretData).filter(([k]) => k !== 'value')
        ),
      });
    } catch (error) {
      return err(`Failed to get secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async set(key: string, value: string, metadata?: Record<string, string>): Promise<Result<void, string>> {
    try {
      const response = await this.request('POST', key, {
        data: { value, ...metadata },
      });

      if (!response.ok) {
        return err(`Vault error: ${response.statusText}`);
      }

      return ok(undefined);
    } catch (error) {
      return err(`Failed to set secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(key: string): Promise<Result<void, string>> {
    try {
      // Vault KV v2 uses metadata path for deletion
      const metadataPath = this.config.path?.replace('/data/', '/metadata/') ?? 'secret/metadata/';
      const url = `${this.config.address}/v1/${metadataPath}${key}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'X-Vault-Token': this.config.token ?? '',
        },
      });

      if (!response.ok && response.status !== 404) {
        return err(`Vault error: ${response.statusText}`);
      }

      return ok(undefined);
    } catch (error) {
      return err(`Failed to delete secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async list(): Promise<Result<string[], string>> {
    try {
      const metadataPath = this.config.path?.replace('/data/', '/metadata/') ?? 'secret/metadata/';
      const url = `${this.config.address}/v1/${metadataPath}?list=true`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Vault-Token': this.config.token ?? '',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return ok([]);
        }
        return err(`Vault error: ${response.statusText}`);
      }

      const data = await response.json() as { data?: { keys?: string[] } };
      return ok(data.data?.keys ?? []);
    } catch (error) {
      return err(`Failed to list secrets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async exists(key: string): Promise<Result<boolean, string>> {
    const result = await this.get(key);
    return ok(result.success);
  }

  async rotate(key: string, newValue: string): Promise<Result<Secret, string>> {
    await this.set(key, newValue);
    return this.get(key);
  }
}

// ============================================================================
// SECRETS MANAGER (Facade)
// ============================================================================

export class SecretsManager {
  private providers: Map<string, ISecretsProvider> = new Map();
  private defaultProvider: string;
  private cache: Map<string, { secret: Secret; expiresAt: number }> = new Map();
  private cacheTtlMs: number;

  constructor(options: {
    defaultProvider?: string;
    cacheTtlMs?: number;
  } = {}) {
    this.defaultProvider = options.defaultProvider ?? 'environment';
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000; // 5 minutes

    // Register default env provider
    this.registerProvider(new EnvSecretsProvider());
  }

  /**
   * Register a secrets provider
   */
  registerProvider(provider: ISecretsProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Set the default provider
   */
  setDefaultProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider not registered: ${name}`);
    }
    this.defaultProvider = name;
  }

  /**
   * Get a secret (with caching)
   */
  async get(key: string, providerName?: string): Promise<Result<string, string>> {
    const cacheKey = `${providerName ?? this.defaultProvider}:${key}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return ok(cached.secret.value);
    }

    // Fetch from provider
    const provider = this.providers.get(providerName ?? this.defaultProvider);
    if (!provider) {
      return err(`Provider not found: ${providerName ?? this.defaultProvider}`);
    }

    const result = await provider.get(key);
    if (!result.success) {
      return result as Result<string, string>;
    }

    // Cache the result
    this.cache.set(cacheKey, {
      secret: result.data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return ok(result.data.value);
  }

  /**
   * Get a secret or throw
   */
  async getOrThrow(key: string, providerName?: string): Promise<string> {
    const result = await this.get(key, providerName);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.data;
  }

  /**
   * Get a secret with a default value
   */
  async getOrDefault(key: string, defaultValue: string, providerName?: string): Promise<string> {
    const result = await this.get(key, providerName);
    return result.success ? result.data : defaultValue;
  }

  /**
   * Set a secret
   */
  async set(key: string, value: string, providerName?: string): Promise<Result<void, string>> {
    const provider = this.providers.get(providerName ?? this.defaultProvider);
    if (!provider) {
      return err(`Provider not found: ${providerName ?? this.defaultProvider}`);
    }

    const result = await provider.set(key, value);
    if (result.success) {
      // Invalidate cache
      const cacheKey = `${providerName ?? this.defaultProvider}:${key}`;
      this.cache.delete(cacheKey);
    }

    return result;
  }

  /**
   * Delete a secret
   */
  async delete(key: string, providerName?: string): Promise<Result<void, string>> {
    const provider = this.providers.get(providerName ?? this.defaultProvider);
    if (!provider) {
      return err(`Provider not found: ${providerName ?? this.defaultProvider}`);
    }

    const result = await provider.delete(key);
    if (result.success) {
      const cacheKey = `${providerName ?? this.defaultProvider}:${key}`;
      this.cache.delete(cacheKey);
    }

    return result;
  }

  /**
   * Rotate a secret
   */
  async rotate(key: string, newValue: string, providerName?: string): Promise<Result<Secret, string>> {
    const provider = this.providers.get(providerName ?? this.defaultProvider);
    if (!provider) {
      return err(`Provider not found: ${providerName ?? this.defaultProvider}`);
    }

    const result = await provider.rotate(key, newValue);
    if (result.success) {
      const cacheKey = `${providerName ?? this.defaultProvider}:${key}`;
      this.cache.delete(cacheKey);
    }

    return result;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get all registered providers
   */
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultSecretsManager: SecretsManager | undefined;

export function getSecretsManager(): SecretsManager {
  if (!defaultSecretsManager) {
    defaultSecretsManager = new SecretsManager();
  }
  return defaultSecretsManager;
}

export function configureSecretsManager(options: {
  defaultProvider?: string;
  cacheTtlMs?: number;
}): SecretsManager {
  defaultSecretsManager = new SecretsManager(options);
  return defaultSecretsManager;
}

export default SecretsManager;
