/**
 * Payment Rails API Routes
 *
 * Endpoints for managing payment rails and processing payments.
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as paymentRailsService from '../services/payment-rails.service.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';

const router = Router();

// ============================================================================
// Rail Configuration Endpoints
// ============================================================================

/**
 * POST /v1/payment-rails
 * Create a new payment rail configuration
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const {
      railType,
      name,
      config,
      supportedCurrencies,
      fees,
      limits,
      isDefault,
      metadata,
    } = req.body;

    if (!railType || !name || !config || !supportedCurrencies) {
      throw new ValidationError('railType, name, config, and supportedCurrencies are required');
    }

    // Validate rail type
    const validRailTypes = ['usdc', 'bank_ach', 'bank_wire', 'bank_sepa'];
    if (!validRailTypes.includes(railType)) {
      throw new ValidationError(`Invalid railType. Must be one of: ${validRailTypes.join(', ')}`);
    }

    // Validate rail-specific config
    validateRailConfig(railType, config);

    const railConfig = await paymentRailsService.createRailConfig({
      orgId,
      railType,
      name,
      config,
      supportedCurrencies,
      fees,
      limits,
      isDefault,
      metadata,
    });

    res.status(201).json(railConfig);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/payment-rails
 * List payment rail configurations
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { railType, isActive } = req.query;

    const configs = await paymentRailsService.listRailConfigs(orgId, {
      railType: railType as paymentRailsService.PaymentRailType | undefined,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });

    res.json({ data: configs, count: configs.length });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/payment-rails/:id
 * Get a payment rail configuration
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { id } = req.params;

    const config = await paymentRailsService.getRailConfig(id, orgId);
    if (!config) {
      throw new NotFoundError('Payment rail configuration not found');
    }

    res.json(config);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /v1/payment-rails/:id
 * Update a payment rail configuration
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { id } = req.params;
    const updates = req.body;

    const config = await paymentRailsService.updateRailConfig(id, orgId, updates);
    if (!config) {
      throw new NotFoundError('Payment rail configuration not found');
    }

    res.json(config);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /v1/payment-rails/:id
 * Delete (deactivate) a payment rail configuration
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { id } = req.params;

    const deleted = await paymentRailsService.deleteRailConfig(id, orgId);
    if (!deleted) {
      throw new NotFoundError('Payment rail configuration not found');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Payment Endpoints
// ============================================================================

/**
 * POST /v1/payment-rails/:railId/payments
 * Create a new payment
 */
router.post('/:railId/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { railId } = req.params;
    const {
      amount,
      currency,
      recipientId,
      recipientType,
      recipientAddress,
      recipientBankInfo,
      payoutId,
      distributionId,
      metadata,
    } = req.body;

    if (!amount || !currency || !recipientId || !recipientType) {
      throw new ValidationError('amount, currency, recipientId, and recipientType are required');
    }

    const payment = await paymentRailsService.createPayment({
      orgId,
      railConfigId: railId,
      amount,
      currency,
      recipientId,
      recipientType,
      recipientAddress,
      recipientBankInfo,
      payoutId,
      distributionId,
      metadata,
    });

    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/payment-rails/:railId/payments/batch
 * Create batch payments for a distribution
 */
router.post('/:railId/payments/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { railId } = req.params;
    const { currency, distributionId, payments: paymentInputs } = req.body;

    if (!currency || !distributionId || !paymentInputs || !Array.isArray(paymentInputs)) {
      throw new ValidationError('currency, distributionId, and payments array are required');
    }

    const result = await paymentRailsService.createBatchPayments({
      orgId,
      railConfigId: railId,
      currency,
      distributionId,
      payments: paymentInputs,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/payments
 * List all payments
 */
router.get('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { status, railType, distributionId, recipientId, limit, offset } = req.query;

    const result = await paymentRailsService.listPayments(orgId, {
      status: status as paymentRailsService.PaymentStatus | undefined,
      railType: railType as paymentRailsService.PaymentRailType | undefined,
      distributionId: distributionId as string | undefined,
      recipientId: recipientId as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: result.payments, count: result.payments.length, total: result.total });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/payments/:id
 * Get a payment by ID
 */
router.get('/payments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { id } = req.params;

    const payment = await paymentRailsService.getPayment(id, orgId);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    res.json(payment);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/payments/:id/process
 * Process a pending payment
 */
router.post('/payments/:id/process', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { id } = req.params;

    const payment = await paymentRailsService.processPayment(id, orgId);
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/payments/:id/cancel
 * Cancel a pending payment
 */
router.post('/payments/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { id } = req.params;

    const payment = await paymentRailsService.cancelPayment(id, orgId);
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/payments/analytics
 * Get payment analytics
 */
router.get('/payments/analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers['x-org-id'] as string || 'default-org';
    const { startDate, endDate, railType } = req.query;

    const analytics = await paymentRailsService.getPaymentAnalytics(orgId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      railType: railType as paymentRailsService.PaymentRailType | undefined,
    });

    res.json(analytics);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function validateRailConfig(railType: string, config: Record<string, unknown>): void {
  switch (railType) {
    case 'usdc':
      if (!config.usdcChainId) {
        throw new ValidationError('usdcChainId is required for USDC rail');
      }
      if (!config.treasuryWallet) {
        throw new ValidationError('treasuryWallet is required for USDC rail');
      }
      break;

    case 'bank_ach':
      if (!config.accountNumber || !config.routingNumber) {
        throw new ValidationError('accountNumber and routingNumber are required for ACH rail');
      }
      break;

    case 'bank_wire':
      if (!config.accountNumber || !config.swiftCode) {
        throw new ValidationError('accountNumber and swiftCode are required for wire rail');
      }
      break;

    case 'bank_sepa':
      if (!config.iban) {
        throw new ValidationError('iban is required for SEPA rail');
      }
      break;
  }
}

export default router;
