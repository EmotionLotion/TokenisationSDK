import { db, schema } from '../config/database.js';
import { eq, and, desc, lt, or } from 'drizzle-orm';
import { createHmac, randomBytes } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

const { webhookEndpoints, webhookDeliveries, eventBusQueue } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface CreateEndpointInput {
  orgId: string;
  url: string;
  description?: string;
  events: string[]; // e.g., ['transfer.*', 'token.deployed']
  metadata?: Record<string, unknown>;
}

export interface UpdateEndpointInput {
  url?: string;
  description?: string;
  events?: string[];
  status?: 'active' | 'disabled';
  metadata?: Record<string, unknown>;
}

export interface WebhookPayload {
  id: string;
  type: string;
  createdAt: string;
  data: object;
}

// ============================================================================
// Webhook Endpoint Management
// ============================================================================

export async function createEndpoint(input: CreateEndpointInput) {
  // Validate URL
  try {
    new URL(input.url);
  } catch {
    throw new ValidationError('Invalid webhook URL');
  }

  // Must be HTTPS in production
  if (process.env.NODE_ENV === 'production' && !input.url.startsWith('https://')) {
    throw new ValidationError('Webhook URL must use HTTPS');
  }

  // Validate event patterns
  for (const event of input.events) {
    if (!isValidEventPattern(event)) {
      throw new ValidationError(`Invalid event pattern: ${event}`);
    }
  }

  // Generate secret
  const secret = `whsec_${randomBytes(32).toString('base64url')}`;

  const [endpoint] = await db.insert(webhookEndpoints).values({
    orgId: input.orgId,
    url: input.url,
    description: input.description,
    events: input.events,
    secret,
    metadata: input.metadata || {},
  }).returning();

  return {
    ...endpoint,
    secret, // Only returned on creation
  };
}

export async function getEndpoint(id: string, orgId: string) {
  const endpoint = await db.query.webhookEndpoints.findFirst({
    where: and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, orgId)),
  });

  if (!endpoint) {
    throw new NotFoundError('Webhook endpoint not found');
  }

  // Don't return the secret
  const { secret, ...rest } = endpoint;
  return rest;
}

export async function listEndpoints(orgId: string, params: { status?: string; limit?: number; offset?: number } = {}) {
  const { status, limit = 50, offset = 0 } = params;

  const conditions = [eq(webhookEndpoints.orgId, orgId)];
  if (status) conditions.push(eq(webhookEndpoints.status, status));

  const results = await db.select({
    id: webhookEndpoints.id,
    orgId: webhookEndpoints.orgId,
    url: webhookEndpoints.url,
    description: webhookEndpoints.description,
    events: webhookEndpoints.events,
    status: webhookEndpoints.status,
    version: webhookEndpoints.version,
    lastDeliveryAt: webhookEndpoints.lastDeliveryAt,
    lastDeliveryStatus: webhookEndpoints.lastDeliveryStatus,
    failureCount: webhookEndpoints.failureCount,
    createdAt: webhookEndpoints.createdAt,
    updatedAt: webhookEndpoints.updatedAt,
  })
    .from(webhookEndpoints)
    .where(and(...conditions))
    .orderBy(desc(webhookEndpoints.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateEndpoint(id: string, orgId: string, input: UpdateEndpointInput) {
  await getEndpoint(id, orgId);

  if (input.url) {
    try {
      new URL(input.url);
    } catch {
      throw new ValidationError('Invalid webhook URL');
    }
  }

  if (input.events) {
    for (const event of input.events) {
      if (!isValidEventPattern(event)) {
        throw new ValidationError(`Invalid event pattern: ${event}`);
      }
    }
  }

  const [updated] = await db.update(webhookEndpoints)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, orgId)))
    .returning();

  const { secret, ...rest } = updated;
  return rest;
}

export async function deleteEndpoint(id: string, orgId: string) {
  await getEndpoint(id, orgId);

  await db.delete(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, orgId)));

  return { success: true, id };
}

export async function rotateSecret(id: string, orgId: string) {
  await getEndpoint(id, orgId);

  const newSecret = `whsec_${randomBytes(32).toString('base64url')}`;

  await db.update(webhookEndpoints)
    .set({
      secret: newSecret,
      updatedAt: new Date(),
    })
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, orgId)));

  return { secret: newSecret };
}

// ============================================================================
// Webhook Delivery
// ============================================================================

export async function dispatchEvent(orgId: string, eventType: string, payload: object) {
  // Find all active endpoints that match this event type
  const endpoints = await db.select()
    .from(webhookEndpoints)
    .where(and(
      eq(webhookEndpoints.orgId, orgId),
      eq(webhookEndpoints.status, 'active')
    ));

  const matchingEndpoints = endpoints.filter(endpoint =>
    endpoint.events.some(pattern => matchesEventPattern(pattern, eventType))
  );

  const eventId = `evt_${randomBytes(16).toString('hex')}`;
  const webhookPayload: WebhookPayload = {
    id: eventId,
    type: eventType,
    createdAt: new Date().toISOString(),
    data: payload,
  };

  // Create delivery records for each matching endpoint
  const deliveries = [];
  for (const endpoint of matchingEndpoints) {
    const [delivery] = await db.insert(webhookDeliveries).values({
      orgId,
      endpointId: endpoint.id,
      eventId,
      eventType,
      payload: webhookPayload as any,
      status: 'pending',
      nextAttemptAt: new Date(),
    }).returning();

    deliveries.push(delivery);
  }

  return { eventId, deliveryCount: deliveries.length };
}

export async function deliverWebhook(deliveryId: string): Promise<{ success: boolean; error?: string }> {
  const delivery = await db.query.webhookDeliveries.findFirst({
    where: eq(webhookDeliveries.id, deliveryId),
  });

  if (!delivery) {
    throw new NotFoundError('Delivery not found');
  }

  const endpoint = await db.query.webhookEndpoints.findFirst({
    where: eq(webhookEndpoints.id, delivery.endpointId),
  });

  if (!endpoint) {
    throw new NotFoundError('Endpoint not found');
  }

  // Sign the payload
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadStr = JSON.stringify(delivery.payload);
  const signature = signPayload(payloadStr, endpoint.secret, timestamp);

  try {
    // Make HTTP request
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Id': delivery.eventId,
        'X-Webhook-Timestamp': timestamp.toString(),
        'X-Webhook-Signature': signature,
      },
      body: payloadStr,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    const responseBody = await response.text().catch(() => '');

    if (response.ok) {
      // Success
      await db.update(webhookDeliveries)
        .set({
          status: 'sent',
          attempts: delivery.attempts + 1,
          lastAttemptAt: new Date(),
          responseStatus: response.status,
          responseBody: responseBody.slice(0, 1000), // Limit stored response
          deliveredAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, deliveryId));

      await db.update(webhookEndpoints)
        .set({
          lastDeliveryAt: new Date(),
          lastDeliveryStatus: 'sent',
          failureCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoints.id, endpoint.id));

      return { success: true };
    } else {
      // HTTP error
      throw new Error(`HTTP ${response.status}: ${responseBody.slice(0, 200)}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const newAttempts = delivery.attempts + 1;

    // Calculate next retry with exponential backoff
    const nextAttemptAt = newAttempts < delivery.maxAttempts
      ? new Date(Date.now() + Math.pow(2, newAttempts) * 60 * 1000) // 2^n minutes
      : null;

    const status = newAttempts >= delivery.maxAttempts ? 'dlq' : 'failed';

    await db.update(webhookDeliveries)
      .set({
        status,
        attempts: newAttempts,
        lastAttemptAt: new Date(),
        nextAttemptAt,
        lastError: errorMessage,
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    await db.update(webhookEndpoints)
      .set({
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: status,
        failureCount: endpoint.failureCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, endpoint.id));

    return { success: false, error: errorMessage };
  }
}

export async function retryDelivery(deliveryId: string, orgId: string) {
  const delivery = await db.query.webhookDeliveries.findFirst({
    where: and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.orgId, orgId)),
  });

  if (!delivery) {
    throw new NotFoundError('Delivery not found');
  }

  if (delivery.status === 'sent') {
    throw new ValidationError('Delivery already succeeded');
  }

  // Reset for retry
  await db.update(webhookDeliveries)
    .set({
      status: 'pending',
      nextAttemptAt: new Date(),
    })
    .where(eq(webhookDeliveries.id, deliveryId));

  return deliverWebhook(deliveryId);
}

export async function listDeliveries(orgId: string, params: {
  endpointId?: string;
  status?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { endpointId, status, eventType, limit = 50, offset = 0 } = params;

  const conditions = [eq(webhookDeliveries.orgId, orgId)];
  if (endpointId) conditions.push(eq(webhookDeliveries.endpointId, endpointId));
  if (status) conditions.push(eq(webhookDeliveries.status, status));
  if (eventType) conditions.push(eq(webhookDeliveries.eventType, eventType));

  return db.select()
    .from(webhookDeliveries)
    .where(and(...conditions))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============================================================================
// Webhook Worker (processes pending deliveries)
// ============================================================================

export async function processPendingDeliveries(batchSize: number = 100): Promise<number> {
  const now = new Date();

  // Find pending deliveries that are due
  const pendingDeliveries = await db.select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, 'pending'),
        lt(webhookDeliveries.nextAttemptAt, now)
      )
    )
    .limit(batchSize);

  let successCount = 0;

  for (const delivery of pendingDeliveries) {
    try {
      const result = await deliverWebhook(delivery.id);
      if (result.success) successCount++;
    } catch (error) {
      console.error(`Failed to deliver webhook ${delivery.id}:`, error);
    }
  }

  return successCount;
}

export async function retryFailedDeliveries(batchSize: number = 50): Promise<number> {
  const now = new Date();

  // Find failed deliveries that are due for retry
  const failedDeliveries = await db.select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, 'failed'),
        lt(webhookDeliveries.nextAttemptAt, now)
      )
    )
    .limit(batchSize);

  let successCount = 0;

  for (const delivery of failedDeliveries) {
    try {
      const result = await deliverWebhook(delivery.id);
      if (result.success) successCount++;
    } catch (error) {
      console.error(`Failed to retry webhook ${delivery.id}:`, error);
    }
  }

  return successCount;
}

// ============================================================================
// Helpers
// ============================================================================

function isValidEventPattern(pattern: string): boolean {
  // Valid patterns: 'transfer.created', 'transfer.*', '*'
  return /^[a-z_]+(\.[a-z_*]+)*$/.test(pattern);
}

function matchesEventPattern(pattern: string, eventType: string): boolean {
  if (pattern === '*') return true;

  const patternParts = pattern.split('.');
  const eventParts = eventType.split('.');

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '*') {
      // Wildcard matches rest of event
      return true;
    }

    if (i >= eventParts.length || patternParts[i] !== eventParts[i]) {
      return false;
    }
  }

  return patternParts.length === eventParts.length;
}

function signPayload(payload: string, secret: string, timestamp: number): string {
  const signedPayloadStr = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(signedPayloadStr);
  return `v1=${hmac.digest('hex')}`;
}

// Signature verification (for clients to use)
export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: number,
  tolerance: number = 300 // 5 minutes
): boolean {
  // Check timestamp is within tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    return false;
  }

  const expectedSignature = signPayload(payload, secret, timestamp);
  return signature === expectedSignature;
}
