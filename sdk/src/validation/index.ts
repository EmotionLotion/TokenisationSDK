/**
 * SDK Input Validation Module
 *
 * Provides validation utilities and schemas for SDK method inputs.
 */

import { z, ZodSchema, ZodError } from 'zod';

// Re-export all schemas
export * from './schemas.js';
export * from './real-estate.js';

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  public readonly issues: z.ZodIssue[];

  constructor(error: ZodError) {
    const message = error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    super(`Validation failed: ${message}`);
    this.name = 'ValidationError';
    this.issues = error.issues;
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate input against a Zod schema
 * @throws ValidationError if validation fails
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(result.error);
  }

  return result.data;
}

/**
 * Validate input and return result without throwing
 */
export function validateSafe<T>(
  schema: ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ValidationError } {
  const result = schema.safeParse(data);

  if (!result.success) {
    return { success: false, error: new ValidationError(result.error) };
  }

  return { success: true, data: result.data };
}

/**
 * Create a validated API method wrapper
 */
export function withValidation<TInput, TOutput>(
  schema: ZodSchema<TInput>,
  fn: (validatedInput: TInput) => Promise<TOutput>
): (input: unknown) => Promise<TOutput> {
  return async (input: unknown) => {
    const validated = validate(schema, input);
    return fn(validated);
  };
}

// ============================================================================
// Common Validators
// ============================================================================

/**
 * Validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate UUID
 */
export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Validate token amount (positive integer string)
 */
export function isValidTokenAmount(amount: string): boolean {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

/**
 * Validate transaction hash
 */
export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Validate chain ID
 */
export function isValidChainId(chainId: number): boolean {
  return Number.isInteger(chainId) && chainId > 0;
}

/**
 * Sanitize string input (trim and limit length)
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  return input.trim().slice(0, maxLength);
}

/**
 * Sanitize object by removing undefined/null values
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      result[key as keyof T] = value as T[keyof T];
    }
  }

  return result;
}
