/**
 * Webhook Routes
 *
 * Handles incoming webhooks from the Tokenisation platform.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

interface WebhookEvent {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
}

// ============================================================================
// HELPERS
// ============================================================================

function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const signatureHash = signature.replace('sha256=', '');

  return crypto.timingSafeEqual(
    Buffer.from(signatureHash),
    Buffer.from(expected)
  );
}

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createWebhookRouter(webhookSecret: string): Router {
  const router = Router();

  /**
   * POST /webhooks - Receive webhook events
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      // Verify signature
      const signature = req.headers['x-webhook-signature'] as string;
      const payload = JSON.stringify(req.body);

      if (!signature || !verifySignature(payload, signature, webhookSecret)) {
        console.warn('Webhook signature verification failed');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const event = req.body as WebhookEvent;
      console.log(`[Webhook] Received event: ${event.type}`);

      // Handle different event types
      switch (event.type) {
        case 'token.deployed':
          await handleTokenDeployed(event);
          break;

        case 'transfer.created':
          await handleTransferCreated(event);
          break;

        case 'transfer.confirmed':
          await handleTransferConfirmed(event);
          break;

        case 'transfer.failed':
          await handleTransferFailed(event);
          break;

        case 'token.burned':
          await handleTokenBurned(event);
          break;

        default:
          console.log(`[Webhook] Unhandled event type: ${event.type}`);
      }

      // Always acknowledge receipt
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('[Webhook] Error processing event:', error);
      // Return 200 to prevent retries for processing errors
      res.status(200).json({ received: true, error: 'Processing failed' });
    }
  });

  return router;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleTokenDeployed(event: WebhookEvent): Promise<void> {
  console.log('[Webhook] Token deployed:', event.data);

  const { tokenId, name, address, chainId } = event.data;

  // Example: Update your database with the deployed token address
  console.log(`Ticket token ${name} deployed at ${address} on chain ${chainId}`);

  // Example: Send confirmation email to passenger
  // await emailService.send({
  //   to: passenger.email,
  //   template: 'ticket-confirmed',
  //   data: { ticketId: tokenId, ... }
  // });
}

async function handleTransferCreated(event: WebhookEvent): Promise<void> {
  console.log('[Webhook] Transfer created:', event.data);

  const { transferId, tokenId, fromWallet, toWallet, status } = event.data;

  // Example: Log the pending transfer
  console.log(`Transfer ${transferId} initiated: ${fromWallet} → ${toWallet}`);
}

async function handleTransferConfirmed(event: WebhookEvent): Promise<void> {
  console.log('[Webhook] Transfer confirmed:', event.data);

  const { transferId, tokenId, txHash, toWallet } = event.data;

  // Example: Update your database
  console.log(`Transfer ${transferId} confirmed with tx ${txHash}`);

  // Example: Notify the new ticket holder
  // await notificationService.send({
  //   userId: newPassengerId,
  //   type: 'ticket_received',
  //   data: { ticketId, txHash }
  // });
}

async function handleTransferFailed(event: WebhookEvent): Promise<void> {
  console.log('[Webhook] Transfer failed:', event.data);

  const { transferId, tokenId, error, reason } = event.data;

  // Example: Notify the user of the failure
  console.error(`Transfer ${transferId} failed: ${error || reason}`);

  // Example: Trigger refund or retry logic
  // await paymentService.refund({ transferId, reason });
}

async function handleTokenBurned(event: WebhookEvent): Promise<void> {
  console.log('[Webhook] Token burned (ticket cancelled):', event.data);

  const { tokenId, txHash, metadata } = event.data;

  // Example: Mark ticket as cancelled in your database
  console.log(`Ticket ${tokenId} cancelled, tx: ${txHash}`);

  // Example: Process refund
  // if (metadata?.refundAmount) {
  //   await paymentService.processRefund({
  //     tokenId,
  //     amount: metadata.refundAmount,
  //     currency: metadata.currency
  //   });
  // }
}
