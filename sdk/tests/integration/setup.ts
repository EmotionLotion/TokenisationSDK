/**
 * Integration Test Setup
 *
 * Validates environment variables and sets up test context.
 * Runs before all integration tests.
 */

import { beforeAll, afterAll } from 'vitest';

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Required environment variables for Stripe integration tests
 */
export const STRIPE_ENV_VARS = {
  STRIPE_TEST_SECRET_KEY: process.env.STRIPE_TEST_SECRET_KEY,
  STRIPE_TEST_PUBLISHABLE_KEY: process.env.STRIPE_TEST_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
} as const;

/**
 * Required environment variables for Circle integration tests
 */
export const CIRCLE_ENV_VARS = {
  CIRCLE_SANDBOX_API_KEY: process.env.CIRCLE_SANDBOX_API_KEY,
  CIRCLE_SANDBOX_WALLET_ID: process.env.CIRCLE_SANDBOX_WALLET_ID,
} as const;

/**
 * Optional environment variables
 */
export const OPTIONAL_ENV_VARS = {
  INTEGRATION_TEST_TIMEOUT: process.env.INTEGRATION_TEST_TIMEOUT,
  INTEGRATION_TEST_RETRY_COUNT: process.env.INTEGRATION_TEST_RETRY_COUNT,
  INTEGRATION_TEST_VERBOSE: process.env.INTEGRATION_TEST_VERBOSE,
} as const;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if Stripe credentials are available
 */
export function hasStripeCredentials(): boolean {
  return !!(
    STRIPE_ENV_VARS.STRIPE_TEST_SECRET_KEY &&
    STRIPE_ENV_VARS.STRIPE_TEST_PUBLISHABLE_KEY
  );
}

/**
 * Check if Circle credentials are available
 */
export function hasCircleCredentials(): boolean {
  return !!CIRCLE_ENV_VARS.CIRCLE_SANDBOX_API_KEY;
}

/**
 * Validate and get Stripe credentials
 */
export function getStripeCredentials(): {
  secretKey: string;
  publishableKey: string;
  webhookSecret?: string;
} {
  if (!hasStripeCredentials()) {
    throw new Error(
      'Stripe credentials not found. Set STRIPE_TEST_SECRET_KEY and STRIPE_TEST_PUBLISHABLE_KEY environment variables.'
    );
  }

  return {
    secretKey: STRIPE_ENV_VARS.STRIPE_TEST_SECRET_KEY!,
    publishableKey: STRIPE_ENV_VARS.STRIPE_TEST_PUBLISHABLE_KEY!,
    webhookSecret: STRIPE_ENV_VARS.STRIPE_WEBHOOK_SECRET,
  };
}

/**
 * Validate and get Circle credentials
 */
export function getCircleCredentials(): {
  apiKey: string;
  walletId?: string;
} {
  if (!hasCircleCredentials()) {
    throw new Error(
      'Circle credentials not found. Set CIRCLE_SANDBOX_API_KEY environment variable.'
    );
  }

  return {
    apiKey: CIRCLE_ENV_VARS.CIRCLE_SANDBOX_API_KEY!,
    walletId: CIRCLE_ENV_VARS.CIRCLE_SANDBOX_WALLET_ID,
  };
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Generate a unique test reference ID
 */
export function generateTestReferenceId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor<T>(
  condition: () => Promise<T>,
  options: {
    timeout?: number;
    interval?: number;
    message?: string;
  } = {}
): Promise<T> {
  const { timeout = 30000, interval = 1000, message = 'Condition not met' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout: ${message}`);
}

/**
 * Retry an operation with exponential backoff
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, initialDelayMs = 1000, maxDelayMs = 10000 } = options;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, maxDelayMs);
      }
    }
  }

  throw lastError;
}

// ============================================================================
// TEST CONTEXT
// ============================================================================

/**
 * Shared test context
 */
export interface TestContext {
  stripeAvailable: boolean;
  circleAvailable: boolean;
  testStartTime: number;
  createdResources: Array<{
    type: string;
    id: string;
    cleanup?: () => Promise<void>;
  }>;
}

/**
 * Global test context
 */
export const testContext: TestContext = {
  stripeAvailable: false,
  circleAvailable: false,
  testStartTime: 0,
  createdResources: [],
};

/**
 * Register a resource for cleanup
 */
export function registerForCleanup(
  type: string,
  id: string,
  cleanup?: () => Promise<void>
): void {
  testContext.createdResources.push({ type, id, cleanup });
}

// ============================================================================
// GLOBAL SETUP
// ============================================================================

beforeAll(async () => {
  console.log('\n======================================');
  console.log('Integration Test Setup');
  console.log('======================================\n');

  testContext.testStartTime = Date.now();
  testContext.stripeAvailable = hasStripeCredentials();
  testContext.circleAvailable = hasCircleCredentials();

  console.log('Environment:');
  console.log(`  - Stripe available: ${testContext.stripeAvailable}`);
  console.log(`  - Circle available: ${testContext.circleAvailable}`);
  console.log('');

  if (!testContext.stripeAvailable && !testContext.circleAvailable) {
    console.warn(
      '⚠️  No payment provider credentials found. Integration tests will be skipped.\n' +
      '   Set STRIPE_TEST_SECRET_KEY or CIRCLE_SANDBOX_API_KEY to run tests.\n'
    );
  }
});

afterAll(async () => {
  console.log('\n======================================');
  console.log('Integration Test Cleanup');
  console.log('======================================\n');

  // Cleanup created resources
  for (const resource of testContext.createdResources.reverse()) {
    try {
      if (resource.cleanup) {
        await resource.cleanup();
        console.log(`  ✓ Cleaned up ${resource.type}: ${resource.id}`);
      }
    } catch (error) {
      console.error(`  ✗ Failed to cleanup ${resource.type}: ${resource.id}`, error);
    }
  }

  const duration = Date.now() - testContext.testStartTime;
  console.log(`\nTotal duration: ${(duration / 1000).toFixed(2)}s\n`);
});

// ============================================================================
// SKIP HELPERS
// ============================================================================

/**
 * Skip test if Stripe is not available
 */
export function skipIfNoStripe(testFn: () => void | Promise<void>) {
  return async () => {
    if (!testContext.stripeAvailable) {
      console.log('Skipping: Stripe credentials not available');
      return;
    }
    await testFn();
  };
}

/**
 * Skip test if Circle is not available
 */
export function skipIfNoCircle(testFn: () => void | Promise<void>) {
  return async () => {
    if (!testContext.circleAvailable) {
      console.log('Skipping: Circle credentials not available');
      return;
    }
    await testFn();
  };
}
