/**
 * KYC Routes
 *
 * API endpoints for KYC (Know Your Customer) verification operations.
 * Supports multiple providers: SumSub, Onfido, and mock for testing.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  getDefaultKYCProvider,
  createKYCProvider,
  type KYCProviderAdapter,
  type KYCLevel,
  type KYCProviderType,
  type KYCProviderConfig,
} from '../services/kyc/index.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import { logger } from '../middleware/logger.js';

export const kycRouter = Router();

// Get the default KYC provider
let kycProvider: KYCProviderAdapter;

try {
  kycProvider = getDefaultKYCProvider();
} catch {
  // Fallback to mock if no provider configured
  kycProvider = createKYCProvider('mock', {});
}

// Validation schemas
const createApplicantSchema = z.object({
  externalId: z.string().min(1, 'External ID is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().length(2).optional(),
  country: z.string().length(2).optional(),
  level: z.enum(['BASIC', 'STANDARD', 'ENHANCED']).optional(),
});

const createSessionSchema = z.object({
  applicantId: z.string().min(1, 'Applicant ID is required'),
  level: z.enum(['BASIC', 'STANDARD', 'ENHANCED']).default('STANDARD'),
  redirectUrl: z.string().url().optional(),
  locale: z.string().length(2).optional(),
});

/**
 * @openapi
 * /kyc/applicants:
 *   post:
 *     tags: [KYC]
 *     summary: Create KYC applicant
 *     description: Create a new KYC applicant to begin verification process
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - externalId
 *               - email
 *             properties:
 *               externalId:
 *                 type: string
 *                 description: Your internal ID for this applicant (e.g., investor ID)
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               nationality:
 *                 type: string
 *                 description: ISO 3166-1 alpha-2 country code
 *               country:
 *                 type: string
 *                 description: Country of residence (ISO 3166-1 alpha-2)
 *               level:
 *                 type: string
 *                 enum: [BASIC, STANDARD, ENHANCED]
 *     responses:
 *       201:
 *         description: Applicant created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KYCApplicant'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
kycRouter.post(
  '/applicants',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const data = createApplicantSchema.parse(req.body);
      const applicant = await kycProvider.createApplicant(data);

      res.status(201).json(applicant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
      }
      next(error);
    }
  }
);

/**
 * @openapi
 * /kyc/applicants/{id}:
 *   get:
 *     tags: [KYC]
 *     summary: Get applicant details
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Applicant details
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
kycRouter.get(
  '/applicants/:id',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const applicant = await kycProvider.getApplicant(req.params.id);

      if (!applicant) {
        throw new NotFoundError('KYC applicant not found');
      }

      res.json(applicant);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /kyc/applicants/external/{externalId}:
 *   get:
 *     tags: [KYC]
 *     summary: Get applicant by external ID
 *     parameters:
 *       - name: externalId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Applicant details
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
kycRouter.get(
  '/applicants/external/:externalId',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const applicant = await kycProvider.getApplicantByExternalId(req.params.externalId);

      if (!applicant) {
        throw new NotFoundError('KYC applicant not found');
      }

      res.json(applicant);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /kyc/sessions:
 *   post:
 *     tags: [KYC]
 *     summary: Create verification session
 *     description: Create a new KYC verification session. Returns a URL to redirect the user for verification.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - applicantId
 *             properties:
 *               applicantId:
 *                 type: string
 *               level:
 *                 type: string
 *                 enum: [BASIC, STANDARD, ENHANCED]
 *                 default: STANDARD
 *               redirectUrl:
 *                 type: string
 *                 format: uri
 *               locale:
 *                 type: string
 *                 description: Two-letter language code
 *     responses:
 *       201:
 *         description: Session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 sessionUrl:
 *                   type: string
 *                   format: uri
 *                 accessToken:
 *                   type: string
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 */
kycRouter.post(
  '/sessions',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const data = createSessionSchema.parse(req.body);
      const session = await kycProvider.createSession(data);

      res.status(201).json({
        sessionId: session.id,
        sessionUrl: session.accessUrl,
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        provider: session.provider,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
      }
      next(error);
    }
  }
);

/**
 * @openapi
 * /kyc/applicants/{id}/status:
 *   get:
 *     tags: [KYC]
 *     summary: Get verification status
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 applicantId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [NOT_STARTED, PENDING, IN_PROGRESS, AWAITING_REVIEW, APPROVED, REJECTED, EXPIRED, RETRY]
 */
kycRouter.get(
  '/applicants/:id/status',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const status = await kycProvider.getStatus(req.params.id);

      res.json({
        applicantId: req.params.id,
        status,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /kyc/applicants/{id}/verification:
 *   get:
 *     tags: [KYC]
 *     summary: Get full verification result
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Full verification result including checks and documents
 */
kycRouter.get(
  '/applicants/:id/verification',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const result = await kycProvider.getVerificationResult(req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /kyc/applicants/{id}/reset:
 *   post:
 *     tags: [KYC]
 *     summary: Reset applicant for re-verification
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Applicant reset successfully
 */
kycRouter.post(
  '/applicants/:id/reset',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      await kycProvider.resetApplicant(req.params.id);
      res.json({ success: true, message: 'Applicant reset for re-verification' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /kyc/webhooks/sumsub:
 *   post:
 *     tags: [KYC]
 *     summary: SumSub webhook endpoint
 *     description: Receive status updates from SumSub
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed
 */
kycRouter.post('/webhooks/sumsub', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-payload-digest'] as string || '';
    const payload = JSON.stringify(req.body);

    // Validate webhook signature
    if (!kycProvider.validateWebhook(payload, signature)) {
      logger.warn('Invalid SumSub webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse and process the event
    const event = kycProvider.parseWebhookEvent(payload);
    logger.info('SumSub webhook received', { metadata: { type: event.type, applicantId: event.applicantId } });

    // Handle different event types
    switch (event.type) {
      case 'applicantReviewed':
      case 'applicantPending':
      case 'applicantOnHold':
        // Update investor KYC status in database
        logger.info(`Applicant ${event.applicantId} status: ${event.type}`);
        break;
      default:
        logger.info(`Unhandled SumSub event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /kyc/webhooks/onfido:
 *   post:
 *     tags: [KYC]
 *     summary: Onfido webhook endpoint
 *     description: Receive status updates from Onfido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed
 */
kycRouter.post('/webhooks/onfido', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-sha2-signature'] as string || '';
    const payload = JSON.stringify(req.body);

    // Validate webhook signature
    if (!kycProvider.validateWebhook(payload, signature)) {
      logger.warn('Invalid Onfido webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse and process the event
    const event = kycProvider.parseWebhookEvent(payload);
    logger.info('Onfido webhook received', { metadata: { type: event.type, applicantId: event.applicantId } });

    // Handle different event types
    switch (event.type) {
      case 'check.completed':
      case 'check.started':
      case 'check.form_opened':
        logger.info(`Onfido check event: ${event.type}`);
        break;
      default:
        logger.info(`Unhandled Onfido event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /kyc/health:
 *   get:
 *     tags: [KYC]
 *     summary: Check KYC provider health
 *     responses:
 *       200:
 *         description: Provider health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 provider:
 *                   type: string
 *                 healthy:
 *                   type: boolean
 *                 latencyMs:
 *                   type: number
 */
kycRouter.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await kycProvider.healthCheck();

    res.json({
      provider: kycProvider.providerName,
      ...health,
    });
  } catch (error) {
    next(error);
  }
});

export default kycRouter;
