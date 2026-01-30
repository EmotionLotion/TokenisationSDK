/**
 * Accreditation Routes
 *
 * REST API endpoints for investor accreditation workflows:
 * submission, verification, rejection, and retrieval.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as accreditationService from '../services/accreditation.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import type { ApiKeyRequest } from '../middleware/auth.js';

export const accreditationRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const SubmitAccreditationSchema = z.object({
  type: z.enum([
    'self_certification',
    'income_verification',
    'net_worth',
    'professional_certificate',
    'third_party',
  ]),
  evidenceRefs: z.array(z.string().min(1)).min(1, 'At least one evidence reference is required'),
  metadata: z.record(z.unknown()).optional(),
});

const VerifyAccreditationSchema = z.object({
  verifiedBy: z.string().min(1, 'verifiedBy is required'),
});

const RejectAccreditationSchema = z.object({
  rejectedBy: z.string().min(1, 'rejectedBy is required'),
  reason: z.string().min(1, 'Rejection reason is required'),
});

// ============================================================================
// Investor-scoped Routes
// ============================================================================

// POST /api/v1/investors/:investorId/accreditation - Submit accreditation
accreditationRouter.post(
  '/investors/:investorId/accreditation',
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const body = SubmitAccreditationSchema.parse(req.body);
      const submission = await accreditationService.submitAccreditation(
        req.apiKey!.orgId,
        req.params.investorId,
        body.type,
        body.evidenceRefs,
        body.metadata,
      );
      res.status(201).json({ data: submission });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(
          error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        ));
      } else {
        next(error);
      }
    }
  },
);

// GET /api/v1/investors/:investorId/accreditation - Get latest accreditation
accreditationRouter.get(
  '/investors/:investorId/accreditation',
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const submission = await accreditationService.getAccreditation(
        req.params.investorId,
        req.apiKey!.orgId,
      );
      res.json({ data: submission });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// Submission-scoped Routes
// ============================================================================

// PATCH /api/v1/accreditation/:id/verify - Verify accreditation
accreditationRouter.patch(
  '/accreditation/:id/verify',
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const body = VerifyAccreditationSchema.parse(req.body);
      const submission = await accreditationService.verifyAccreditation(
        req.params.id,
        req.apiKey!.orgId,
        body.verifiedBy,
      );
      res.json({ data: submission });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(
          error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        ));
      } else {
        next(error);
      }
    }
  },
);

// PATCH /api/v1/accreditation/:id/reject - Reject accreditation
accreditationRouter.patch(
  '/accreditation/:id/reject',
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const body = RejectAccreditationSchema.parse(req.body);
      const submission = await accreditationService.rejectAccreditation(
        req.params.id,
        req.apiKey!.orgId,
        body.rejectedBy,
        body.reason,
      );
      res.json({ data: submission });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(
          error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        ));
      } else {
        next(error);
      }
    }
  },
);
