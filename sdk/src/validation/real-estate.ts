/**
 * Real Estate Validation Schemas
 *
 * Zod schemas for all real-estate-related SDK module inputs.
 * Used by PropertyModule, NAVModule, SecondaryMarketModule,
 * InvestorTierModule, ExitWindowModule, and DLDClient.
 */

import { z, ZodSchema, ZodError } from 'zod';

// ============================================================================
// Validation Utility
// ============================================================================

export class ValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  public readonly fieldErrors: Array<{ path: string; message: string }>;

  constructor(message: string, fieldErrors: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Parse input against a Zod schema and throw a clear ValidationError on failure.
 */
export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fieldErrors = result.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    const summary = fieldErrors
      .map(e => e.path ? `${e.path}: ${e.message}` : e.message)
      .join('; ');
    throw new ValidationError(
      `${label} validation failed: ${summary}`,
      fieldErrors,
    );
  }
  return result.data;
}

// ============================================================================
// Property Module Schemas
// ============================================================================

export const createPropertyInputSchema = z.object({
  assetId: z.string().min(1, 'assetId is required'),
  name: z.string().min(1, 'name is required').max(256),
  address: z.string().min(1, 'address is required'),
  type: z.enum(['residential', 'commercial', 'industrial', 'land', 'mixed_use']),
  metadata: z.record(z.unknown()).optional(),
});
export type CreatePropertyInput = z.infer<typeof createPropertyInputSchema>;

export const updatePropertyInputSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  address: z.string().min(1).optional(),
  type: z.enum(['residential', 'commercial', 'industrial', 'land', 'mixed_use']).optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine(obj => Object.keys(obj).length > 0, 'At least one field required');
export type UpdatePropertyInput = z.infer<typeof updatePropertyInputSchema>;

export const propertyUnitInputSchema = z.object({
  unitNumber: z.string().min(1, 'unitNumber is required'),
  type: z.enum(['studio', 'apartment', '1bed', '2bed', '3bed', 'penthouse', 'retail', 'office', 'warehouse', 'other']),
  area: z.number().positive('area must be positive'),
  tenantName: z.string().optional(),
  tenantEmail: z.string().email().optional(),
  leaseStart: z.string().optional(),
  leaseEnd: z.string().optional(),
  monthlyRent: z.string().optional(),
  currency: z.string().optional(),
  status: z.enum(['vacant', 'occupied', 'maintenance', 'reserved']).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type PropertyUnitInput = z.infer<typeof propertyUnitInputSchema>;

export const maintenanceRequestInputSchema = z.object({
  unitId: z.string().optional(),
  category: z.string().min(1, 'category is required'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  description: z.string().min(1, 'description is required').max(2000),
  assignee: z.string().optional(),
  estimatedCost: z.string().optional(),
  currency: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type MaintenanceRequestInput = z.infer<typeof maintenanceRequestInputSchema>;

export const expenseInputSchema = z.object({
  category: z.enum(['maintenance', 'insurance', 'tax', 'utility', 'management_fee', 'legal', 'marketing', 'other']),
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a positive number string'),
  currency: z.string().optional(),
  description: z.string().max(1000).optional(),
  vendor: z.string().optional(),
  invoiceRef: z.string().optional(),
  paidAt: z.string().optional(),
  period: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

// ============================================================================
// NAV Module Schemas
// ============================================================================

export const navValuationInputSchema = z.object({
  totalAssetValue: z.string().regex(/^\d+$/, 'Must be a non-negative integer string'),
  liabilities: z.string().regex(/^\d+$/).optional(),
  currency: z.string().min(1).max(10).optional(),
  decimals: z.number().int().min(0).max(36).optional(),
  reason: z.string().max(1000).optional(),
  sources: z.array(z.object({
    name: z.string().min(1).max(256),
    value: z.string().regex(/^\d+$/),
    weight: z.number().min(0).max(1),
  })).optional(),
});
export type NAVValuationInput = z.infer<typeof navValuationInputSchema>;

// ============================================================================
// Secondary Market Module Schemas
// ============================================================================

export const createListingInputSchema = z.object({
  tokenAmount: z.number().int().positive('tokenAmount must be a positive integer'),
  pricePerToken: z.number().positive('pricePerToken must be positive'),
  sellerWallet: z.string().min(1, 'sellerWallet is required'),
  currency: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateListingInput = z.infer<typeof createListingInputSchema>;

// ============================================================================
// Investor Tier Module Schemas
// ============================================================================

export const assignTierInputSchema = z.object({
  tier: z.enum(['retail', 'qualified', 'professional', 'institutional']),
  accreditationStatus: z.string().default('none'),
  totalInvested: z.number().min(0).default(0),
});
export type AssignTierInput = z.infer<typeof assignTierInputSchema>;

export const checkEligibilityInputSchema = z.object({
  investorId: z.string().min(1, 'investorId is required'),
  amount: z.number().positive('amount must be positive'),
});
export type CheckEligibilityInput = z.infer<typeof checkEligibilityInputSchema>;

// ============================================================================
// Exit Window Module Schemas
// ============================================================================

export const createScheduleInputSchema = z.object({
  frequency: z.enum(['monthly', 'quarterly', 'semi-annually', 'annually']),
  windowDurationDays: z.number().int().min(1, 'Must be at least 1 day').max(90),
  maxRedemptionPercent: z.number().min(0).max(100),
  noticePeriodDays: z.number().int().min(0),
});
export type CreateScheduleInput = z.infer<typeof createScheduleInputSchema>;

export const redemptionRequestInputSchema = z.object({
  investorId: z.string().min(1, 'investorId is required'),
  amount: z.number().positive('amount must be positive'),
});
export type RedemptionRequestInput = z.infer<typeof redemptionRequestInputSchema>;

// ============================================================================
// DLD Client Schemas
// ============================================================================

export const dldRegisterTitleInputSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  dldTitleNumber: z.string().min(1, 'dldTitleNumber is required'),
  propertyType: z.enum(['land', 'building', 'unit']),
  emirate: z.string().optional(),
  area: z.string().optional(),
  plotNumber: z.string().optional(),
  buildingName: z.string().optional(),
  unitNumber: z.string().optional(),
  propertyDetails: z.record(z.unknown()).optional(),
});
export type DLDRegisterTitleInput = z.infer<typeof dldRegisterTitleInputSchema>;

export const dldIngestEventInputSchema = z.object({
  dldTitleId: z.string().min(1, 'dldTitleId is required'),
  eventType: z.string().min(1, 'eventType is required'),
  eventData: z.record(z.unknown()),
  dldEventId: z.string().optional(),
  occurredAt: z.string().optional(),
});
export type DLDIngestEventInput = z.infer<typeof dldIngestEventInputSchema>;

export const dldCreateSyncJobInputSchema = z.object({
  jobType: z.enum(['poll', 'reconcile', 'manual']),
  config: z.record(z.unknown()).optional(),
});
export type DLDCreateSyncJobInput = z.infer<typeof dldCreateSyncJobInputSchema>;
