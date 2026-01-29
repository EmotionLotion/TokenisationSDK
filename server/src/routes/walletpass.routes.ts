/**
 * Wallet Pass Routes
 *
 * API endpoints for generating Apple Wallet and Google Pay passes
 * for event tickets, boarding passes, and other tokenized assets.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import {
  AppleWalletProvider,
  GooglePayProvider,
  WalletPassError,
  type WalletPassData,
  type AppleWalletConfig,
  type GooglePayConfig,
} from '@tokenisation/sdk/connectors';

export const walletPassRouter = Router();

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get Apple Wallet configuration from environment
 */
function getAppleConfig(): AppleWalletConfig | null {
  const passTypeIdentifier = process.env.APPLE_PASS_TYPE_IDENTIFIER;
  const teamIdentifier = process.env.APPLE_TEAM_IDENTIFIER;
  const signingCertificate = process.env.APPLE_SIGNING_CERTIFICATE;
  const certificatePassword = process.env.APPLE_CERTIFICATE_PASSWORD;

  if (!passTypeIdentifier || !teamIdentifier || !signingCertificate || !certificatePassword) {
    return null;
  }

  return {
    passTypeIdentifier,
    teamIdentifier,
    signingCertificate: Buffer.from(signingCertificate, 'base64'),
    certificatePassword,
  };
}

/**
 * Get Google Pay configuration from environment
 */
function getGoogleConfig(): GooglePayConfig | null {
  const issuerId = process.env.GOOGLE_PAY_ISSUER_ID;
  const serviceAccountKey = process.env.GOOGLE_PAY_SERVICE_ACCOUNT_KEY;

  if (!issuerId || !serviceAccountKey) {
    return null;
  }

  try {
    return {
      issuerId,
      serviceAccountKey: JSON.parse(serviceAccountKey),
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Validation Schemas
// ============================================================================

const platformSchema = z.enum(['apple', 'google']);

const passFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  textAlignment: z.enum(['left', 'center', 'right', 'natural']).optional(),
});

const barcodeSchema = z.object({
  message: z.string(),
  format: z.enum(['QR', 'PDF417', 'AZTEC', 'CODE128']),
  altText: z.string().optional(),
});

const generatePassSchema = z.object({
  type: z.enum(['boardingPass', 'eventTicket', 'coupon', 'generic', 'storeCard']),
  organizationName: z.string(),
  description: z.string(),
  serialNumber: z.string(),
  backgroundColor: z.string().optional(),
  foregroundColor: z.string().optional(),
  logoUrl: z.string().url().optional(),
  barcode: barcodeSchema.optional(),
  primaryFields: z.array(passFieldSchema),
  secondaryFields: z.array(passFieldSchema).optional(),
  auxiliaryFields: z.array(passFieldSchema).optional(),
  backFields: z.array(passFieldSchema).optional(),
  relevantDate: z.string().datetime().optional(),
  expirationDate: z.string().datetime().optional(),
  holder: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get pass data from a ticket record
 * This would typically fetch from your database
 */
async function getTicketPassData(
  ticketId: string,
  orgId: string
): Promise<WalletPassData | null> {
  // In a real implementation, this would:
  // 1. Fetch the ticket from the database
  // 2. Get associated event/flight information
  // 3. Build the pass data structure

  // Placeholder implementation - replace with actual database lookup
  // const ticket = await db.query.tickets.findFirst({
  //   where: and(eq(tickets.id, ticketId), eq(tickets.orgId, orgId)),
  //   with: { event: true, holder: true }
  // });

  // For now, return null to indicate not found
  // In production, this would return the actual ticket data
  return null;
}

/**
 * Get pass data from a token record
 */
async function getTokenPassData(
  tokenId: string,
  orgId: string
): Promise<WalletPassData | null> {
  // Similar to getTicketPassData, fetch token and build pass data
  return null;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Get configuration status
 * GET /api/v1/wallet-pass/status
 */
walletPassRouter.get('/status', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response) => {
  const appleConfig = getAppleConfig();
  const googleConfig = getGoogleConfig();

  res.json({
    platforms: {
      apple: {
        configured: !!appleConfig,
        passTypeIdentifier: appleConfig?.passTypeIdentifier,
      },
      google: {
        configured: !!googleConfig,
        issuerId: googleConfig?.issuerId,
      },
    },
  });
});

/**
 * Generate a wallet pass for a ticket
 * GET /api/v1/tickets/:ticketId/wallet-pass?platform=apple|google
 */
walletPassRouter.get(
  '/tickets/:ticketId/wallet-pass',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const { ticketId } = req.params;
      const platform = platformSchema.parse(req.query.platform || 'apple');

      // Get ticket pass data
      const passData = await getTicketPassData(ticketId, req.apiKey.orgId);
      if (!passData) {
        throw new NotFoundError(`Ticket not found: ${ticketId}`);
      }

      // Generate pass based on platform
      if (platform === 'apple') {
        const config = getAppleConfig();
        if (!config) {
          throw new ValidationError('Apple Wallet is not configured');
        }

        const provider = new AppleWalletProvider(config);
        const result = await provider.generatePass(passData);

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.passBuffer);
      } else {
        const config = getGoogleConfig();
        if (!config) {
          throw new ValidationError('Google Pay is not configured');
        }

        const provider = new GooglePayProvider(config);
        const result = await provider.generatePass(passData);

        res.json({
          jwt: result.jwt,
          saveUrl: result.saveUrl,
          classId: result.classId,
          objectId: result.objectId,
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else if (error instanceof WalletPassError) {
        next(new ValidationError(`Wallet pass error: ${error.message}`));
      } else {
        next(error);
      }
    }
  }
);

/**
 * Generate a wallet pass for a token
 * GET /api/v1/tokens/:tokenId/wallet-pass?platform=apple|google
 */
walletPassRouter.get(
  '/tokens/:tokenId/wallet-pass',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const { tokenId } = req.params;
      const platform = platformSchema.parse(req.query.platform || 'apple');

      // Get token pass data
      const passData = await getTokenPassData(tokenId, req.apiKey.orgId);
      if (!passData) {
        throw new NotFoundError(`Token not found: ${tokenId}`);
      }

      // Generate pass based on platform
      if (platform === 'apple') {
        const config = getAppleConfig();
        if (!config) {
          throw new ValidationError('Apple Wallet is not configured');
        }

        const provider = new AppleWalletProvider(config);
        const result = await provider.generatePass(passData);

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.passBuffer);
      } else {
        const config = getGoogleConfig();
        if (!config) {
          throw new ValidationError('Google Pay is not configured');
        }

        const provider = new GooglePayProvider(config);
        const result = await provider.generatePass(passData);

        res.json({
          jwt: result.jwt,
          saveUrl: result.saveUrl,
          classId: result.classId,
          objectId: result.objectId,
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else if (error instanceof WalletPassError) {
        next(new ValidationError(`Wallet pass error: ${error.message}`));
      } else {
        next(error);
      }
    }
  }
);

/**
 * Generate a custom wallet pass
 * POST /api/v1/wallet-pass/generate?platform=apple|google
 *
 * Allows partners to generate custom passes with their own data.
 */
walletPassRouter.post(
  '/generate',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const platform = platformSchema.parse(req.query.platform || 'apple');
      const passData = generatePassSchema.parse(req.body) as WalletPassData;

      // Generate pass based on platform
      if (platform === 'apple') {
        const config = getAppleConfig();
        if (!config) {
          throw new ValidationError('Apple Wallet is not configured');
        }

        const provider = new AppleWalletProvider(config);
        const result = await provider.generatePass(passData);

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.passBuffer);
      } else {
        const config = getGoogleConfig();
        if (!config) {
          throw new ValidationError('Google Pay is not configured');
        }

        const provider = new GooglePayProvider(config);
        const result = await provider.generatePass(passData);

        res.json({
          jwt: result.jwt,
          saveUrl: result.saveUrl,
          classId: result.classId,
          objectId: result.objectId,
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else if (error instanceof WalletPassError) {
        next(new ValidationError(`Wallet pass error: ${error.message}`));
      } else {
        next(error);
      }
    }
  }
);

/**
 * Get save URL for Google Pay
 * POST /api/v1/wallet-pass/google/save-url
 *
 * Returns just the save URL without the full JWT response.
 */
walletPassRouter.post(
  '/google/save-url',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const config = getGoogleConfig();
      if (!config) {
        throw new ValidationError('Google Pay is not configured');
      }

      const passData = generatePassSchema.parse(req.body) as WalletPassData;
      const provider = new GooglePayProvider(config);
      const result = await provider.generatePass(passData);

      res.json({
        saveUrl: result.saveUrl,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else if (error instanceof WalletPassError) {
        next(new ValidationError(`Wallet pass error: ${error.message}`));
      } else {
        next(error);
      }
    }
  }
);

export default walletPassRouter;
