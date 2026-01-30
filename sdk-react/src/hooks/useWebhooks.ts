/**
 * useWebhooks - Hook for webhook management via WebhooksModule.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface WebhookData {
  id: string;
  url: string;
  events: string[];
  status: string;
  secret: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface WebhookDeliveryData {
  id: string;
  endpointId: string;
  event: string;
  status: string;
  attempts: number;
  deliveredAt?: string | null;
  responseStatus?: number | null;
  createdAt: string;
  [key: string]: unknown;
}

export interface UseWebhooksReturn {
  create: (params: { url: string; events: string[]; metadata?: Record<string, unknown> }) => Promise<WebhookData>;
  get: (webhookId: string) => Promise<WebhookData | null>;
  list: (params?: { status?: string; limit?: number }) => Promise<WebhookData[]>;
  update: (webhookId: string, params: { url?: string; events?: string[]; status?: string }) => Promise<WebhookData>;
  remove: (webhookId: string) => Promise<void>;
  getDeliveries: (webhookId: string, params?: { status?: string; limit?: number }) => Promise<WebhookDeliveryData[]>;
  retryDelivery: (deliveryId: string) => Promise<WebhookDeliveryData>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useWebhooks(): UseWebhooksReturn {
  const { modules } = useTokenisation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wrapAsync = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const create = useCallback(
    (params: { url: string; events: string[]; metadata?: Record<string, unknown> }) =>
      wrapAsync(async () => {
        const result = await modules.webhooks.create(params as any);
        return (result as any).data;
      }),
    [modules.webhooks, wrapAsync],
  );

  const get = useCallback(
    (webhookId: string) =>
      wrapAsync(async () => {
        const result = await modules.webhooks.get(webhookId);
        return (result as any).data ?? null;
      }),
    [modules.webhooks, wrapAsync],
  );

  const list = useCallback(
    (params?: { status?: string; limit?: number }) =>
      wrapAsync(async () => {
        const result = await modules.webhooks.list(params as any);
        return (result as any).data ?? [];
      }),
    [modules.webhooks, wrapAsync],
  );

  const update = useCallback(
    (webhookId: string, params: { url?: string; events?: string[]; status?: string }) =>
      wrapAsync(async () => {
        const result = await modules.webhooks.update(webhookId, params as any);
        return (result as any).data;
      }),
    [modules.webhooks, wrapAsync],
  );

  const remove = useCallback(
    (webhookId: string) =>
      wrapAsync(async () => {
        await modules.webhooks.delete(webhookId);
      }),
    [modules.webhooks, wrapAsync],
  );

  const getDeliveries = useCallback(
    (webhookId: string, params?: { status?: string; limit?: number }) =>
      wrapAsync(async () => {
        const result = await modules.webhooks.listDeliveries({ endpointId: webhookId, ...params } as any);
        return (result as any).data ?? [];
      }),
    [modules.webhooks, wrapAsync],
  );

  const retryDelivery = useCallback(
    (deliveryId: string) =>
      wrapAsync(async () => {
        const result = await modules.webhooks.retryDelivery(deliveryId);
        return (result as any).data;
      }),
    [modules.webhooks, wrapAsync],
  );

  return {
    create, get, list, update, remove, getDeliveries, retryDelivery,
    loading, error,
  };
}
