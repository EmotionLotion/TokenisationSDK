/**
 * Boarding Pass Routes
 *
 * REST API endpoints for generating boarding passes in HTML and Apple Wallet formats.
 */

import { Router, Response, NextFunction } from 'express';
import * as boardingPassService from '../services/boarding-pass.service.js';
import type { ApiKeyRequest } from '../middleware/auth.js';

export const boardingPassRouter = Router();

// ============================================================================
// Routes
// ============================================================================

// GET /api/v1/tickets/:ticketId/boarding-pass - Get boarding pass HTML
boardingPassRouter.get(
  '/:ticketId/boarding-pass',
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const result = await boardingPassService.generateBoardingPass(
        req.params.ticketId,
        req.apiKey!.orgId,
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/v1/tickets/:ticketId/boarding-pass/wallet - Get Apple Wallet pass JSON
boardingPassRouter.get(
  '/:ticketId/boarding-pass/wallet',
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const walletPass = await boardingPassService.generateWalletPass(
        req.params.ticketId,
        req.apiKey!.orgId,
      );
      res.json({ data: walletPass });
    } catch (error) {
      next(error);
    }
  },
);
