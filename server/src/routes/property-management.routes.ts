/**
 * Property Management Routes
 *
 * REST API endpoints for property management operations:
 * - Unit management (tenants, leases, rent)
 * - Maintenance request lifecycle
 * - Expense recording and reporting
 * - Occupancy and summary analytics
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as propertyManagementService from '../services/property-management.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const propertyManagementRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const unitTypeSchema = z.enum(['studio', 'apartment', '1bed', '2bed', '3bed', 'penthouse', 'retail', 'office', 'warehouse', 'other']);
const unitStatusSchema = z.enum(['vacant', 'occupied', 'maintenance', 'reserved']);
const maintenancePrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
const maintenanceStatusSchema = z.enum(['open', 'assigned', 'in_progress', 'completed', 'cancelled']);
const expenseCategorySchema = z.enum(['maintenance', 'insurance', 'tax', 'utility', 'management_fee', 'legal', 'marketing', 'other']);

const addUnitSchema = z.object({
  unitNumber: z.string().min(1),
  type: unitTypeSchema,
  area: z.number().min(0),
  tenantName: z.string().optional(),
  tenantEmail: z.string().email().optional(),
  leaseStart: z.string().optional(),
  leaseEnd: z.string().optional(),
  monthlyRent: z.string().optional(),
  currency: z.string().default('USD'),
  status: unitStatusSchema.default('vacant'),
  metadata: z.record(z.unknown()).optional(),
});

const updateUnitSchema = z.object({
  unitNumber: z.string().min(1).optional(),
  type: unitTypeSchema.optional(),
  area: z.number().min(0).optional(),
  tenantName: z.string().nullable().optional(),
  tenantEmail: z.string().email().nullable().optional(),
  leaseStart: z.string().nullable().optional(),
  leaseEnd: z.string().nullable().optional(),
  monthlyRent: z.string().nullable().optional(),
  currency: z.string().optional(),
  status: unitStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createMaintenanceSchema = z.object({
  unitId: z.string().uuid().optional(),
  category: z.string().min(1),
  priority: maintenancePrioritySchema,
  description: z.string().min(1),
  assignee: z.string().optional(),
  estimatedCost: z.string().optional(),
  currency: z.string().default('USD'),
  metadata: z.record(z.unknown()).optional(),
});

const updateMaintenanceSchema = z.object({
  status: maintenanceStatusSchema.optional(),
  assignee: z.string().nullable().optional(),
  actualCost: z.string().nullable().optional(),
  priority: maintenancePrioritySchema.optional(),
});

const recordExpenseSchema = z.object({
  category: expenseCategorySchema,
  amount: z.string().min(1),
  currency: z.string().default('USD'),
  description: z.string().optional(),
  vendor: z.string().optional(),
  invoiceRef: z.string().optional(),
  paidAt: z.string().optional(),
  period: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Unit Routes
// ============================================================================

/**
 * @swagger
 * /api/v1/properties/{assetId}/units:
 *   post:
 *     summary: Add a unit to a property
 *     tags: [Property Management]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddUnitInput'
 *     responses:
 *       201:
 *         description: Unit created successfully
 */
propertyManagementRouter.post(
  '/:assetId/units',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const input = addUnitSchema.parse(req.body);
      const unit = await propertyManagementService.addUnit(req.apiKey.orgId, {
        propertyAssetId: req.params.assetId,
        ...input,
      });

      res.status(201).json({ unit });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else {
        next(error);
      }
    }
  }
);

/**
 * @swagger
 * /api/v1/properties/{assetId}/units:
 *   get:
 *     summary: List all units for a property
 *     tags: [Property Management]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of units
 */
propertyManagementRouter.get(
  '/:assetId/units',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const units = await propertyManagementService.listUnits(req.apiKey.orgId, req.params.assetId);
      res.json({ units, count: units.length });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/properties/{assetId}/units/{unitId}:
 *   patch:
 *     summary: Update a property unit
 *     tags: [Property Management]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: unitId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUnitInput'
 *     responses:
 *       200:
 *         description: Unit updated successfully
 */
propertyManagementRouter.patch(
  '/:assetId/units/:unitId',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const input = updateUnitSchema.parse(req.body);
      const unit = await propertyManagementService.updateUnit(req.apiKey.orgId, req.params.unitId, input as any);

      res.json({ unit });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else {
        next(error);
      }
    }
  }
);

// ============================================================================
// Maintenance Routes
// ============================================================================

/**
 * @swagger
 * /api/v1/properties/{assetId}/maintenance:
 *   post:
 *     summary: Create a maintenance request
 *     tags: [Property Management]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMaintenanceInput'
 *     responses:
 *       201:
 *         description: Maintenance request created
 */
propertyManagementRouter.post(
  '/:assetId/maintenance',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const input = createMaintenanceSchema.parse(req.body);
      const request = await propertyManagementService.createMaintenanceRequest(req.apiKey.orgId, {
        propertyAssetId: req.params.assetId,
        ...input,
      });

      res.status(201).json({ request });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else {
        next(error);
      }
    }
  }
);

/**
 * @swagger
 * /api/v1/properties/{assetId}/maintenance:
 *   get:
 *     summary: List maintenance requests for a property
 *     tags: [Property Management]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, assigned, in_progress, completed, cancelled]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *     responses:
 *       200:
 *         description: List of maintenance requests
 */
propertyManagementRouter.get(
  '/:assetId/maintenance',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const { status, priority } = req.query;
      const requests = await propertyManagementService.listMaintenanceRequests(
        req.apiKey.orgId,
        req.params.assetId,
        {
          status: status as propertyManagementService.MaintenanceStatus | undefined,
          priority: priority as propertyManagementService.MaintenancePriority | undefined,
        }
      );

      res.json({ requests, count: requests.length });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/properties/{assetId}/maintenance/{requestId}:
 *   patch:
 *     summary: Update a maintenance request
 *     tags: [Property Management]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMaintenanceInput'
 *     responses:
 *       200:
 *         description: Maintenance request updated
 */
propertyManagementRouter.patch(
  '/:assetId/maintenance/:requestId',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const input = updateMaintenanceSchema.parse(req.body);
      const request = await propertyManagementService.updateMaintenanceRequest(
        req.apiKey.orgId,
        req.params.requestId,
        input
      );

      res.json({ request });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else {
        next(error);
      }
    }
  }
);

// ============================================================================
// Expense Routes
// ============================================================================

/**
 * @swagger
 * /api/v1/properties/{assetId}/expenses:
 *   post:
 *     summary: Record a property expense
 *     tags: [Property Management]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RecordExpenseInput'
 *     responses:
 *       201:
 *         description: Expense recorded
 */
propertyManagementRouter.post(
  '/:assetId/expenses',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const input = recordExpenseSchema.parse(req.body);
      const expense = await propertyManagementService.recordExpense(req.apiKey.orgId, {
        propertyAssetId: req.params.assetId,
        ...input,
      });

      res.status(201).json({ expense });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else {
        next(error);
      }
    }
  }
);

/**
 * @swagger
 * /api/v1/properties/{assetId}/expenses:
 *   get:
 *     summary: List expenses for a property
 *     tags: [Property Management]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [maintenance, insurance, tax, utility, management_fee, legal, marketing, other]
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of expenses
 */
propertyManagementRouter.get(
  '/:assetId/expenses',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const { category, from, to } = req.query;
      const expenses = await propertyManagementService.listExpenses(
        req.apiKey.orgId,
        req.params.assetId,
        {
          category: category as propertyManagementService.ExpenseCategory | undefined,
          from: from as string | undefined,
          to: to as string | undefined,
        }
      );

      res.json({ expenses, count: expenses.length });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Analytics Routes
// ============================================================================

/**
 * @swagger
 * /api/v1/properties/{assetId}/summary:
 *   get:
 *     summary: Get property summary with analytics
 *     tags: [Property Management]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Property summary
 */
propertyManagementRouter.get(
  '/:assetId/summary',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const summary = await propertyManagementService.getPropertySummary(req.apiKey.orgId, req.params.assetId);
      res.json({ summary });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/properties/{assetId}/occupancy:
 *   get:
 *     summary: Get occupancy rate for a property
 *     tags: [Property Management]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Occupancy rate data
 */
propertyManagementRouter.get(
  '/:assetId/occupancy',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const occupancy = await propertyManagementService.getOccupancyRate(req.apiKey.orgId, req.params.assetId);
      res.json(occupancy);
    } catch (error) {
      next(error);
    }
  }
);
