/**
 * KYC Webhook Routes
 *
 * Public endpoints for external KYC providers (SumSub, Onfido, Jumio)
 * to deliver verification results. These are NOT behind apiKeyMiddleware
 * since the providers cannot authenticate with our API keys.
 * Instead, we verify provider-specific signatures.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';
import { logger } from '../middleware/logger.js';

export const kycWebhookRouter = Router();

// Provider signature header mapping
const PROVIDER_SIGNATURE_HEADERS: Record<string, string> = {
  sumsub: 'x-payload-digest',
  onfido: 'x-sha2-signature',
  jumio: 'x-jumio-signature',
};

/**
 * POST /api/v1/kyc-webhooks/:provider
 *
 * Receives webhook callbacks from KYC providers.
 * Validates provider-specific signature before processing.
 */
kycWebhookRouter.post('/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;
    const supportedProviders = Object.keys(PROVIDER_SIGNATURE_HEADERS);

    if (!supportedProviders.includes(provider)) {
      res.status(400).json({
        error: `Unsupported KYC provider: ${provider}. Supported: ${supportedProviders.join(', ')}`,
      });
      return;
    }

    // Extract provider-specific signature
    const signatureHeader = PROVIDER_SIGNATURE_HEADERS[provider];
    const signature = req.headers[signatureHeader] as string | undefined;

    if (!signature) {
      logger.warn('KYC webhook received without signature', { provider });
      res.status(401).json({ error: 'Missing signature header' });
      return;
    }

    // Verify signature using provider-specific webhook secret
    const webhookSecret = process.env[`KYC_WEBHOOK_SECRET_${provider.toUpperCase()}`];
    if (!webhookSecret) {
      logger.error('KYC webhook secret not configured', { provider });
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    const isValid = verifyProviderSignature(provider, req.body, signature, webhookSecret);
    if (!isValid) {
      logger.warn('KYC webhook signature verification failed', { provider });
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Delegate to investor service for processing
    // Dynamic import to avoid circular dependency
    const investorService = await import('../services/investor.service.js');
    if (typeof investorService.processKycWebhook === 'function') {
      await investorService.processKycWebhook(provider, req.body, signature);
    } else {
      logger.warn('processKycWebhook not available in investor.service');
    }

    logger.info('KYC webhook processed', { provider, event: req.body?.type || req.body?.event });
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('KYC webhook processing failed', { error: error as Error });
    // Always return 200 to prevent provider retries on our processing errors
    res.status(200).json({ received: true, error: 'processing_failed' });
  }
});

function verifyProviderSignature(
  provider: string,
  body: unknown,
  signature: string,
  secret: string,
): boolean {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);

  switch (provider) {
    case 'sumsub': {
      // SumSub uses HMAC-SHA1
      const computed = createHmac('sha1', secret).update(payload).digest('hex');
      return computed === signature;
    }
    case 'onfido': {
      // Onfido uses HMAC-SHA256
      const computed = createHmac('sha256', secret).update(payload).digest('hex');
      return computed === signature;
    }
    case 'jumio': {
      // Jumio uses HMAC-SHA256
      const computed = createHmac('sha256', secret).update(payload).digest('hex');
      return computed === signature;
    }
    default:
      return false;
  }
}
