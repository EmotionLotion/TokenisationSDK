/**
 * Vitest Integration Test Configuration
 *
 * Separate configuration for integration tests that:
 * - Make real API calls to test mode/sandbox environments
 * - Have longer timeouts (120s)
 * - Run serially to avoid rate limiting
 * - Require environment variables for credentials
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Include only integration test files
    include: ['tests/integration/**/*.integration.test.ts'],

    // Longer timeout for real API calls
    testTimeout: 120000, // 2 minutes
    hookTimeout: 60000,  // 1 minute for setup/teardown

    // Run tests serially to avoid rate limiting
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Environment setup
    setupFiles: ['tests/integration/setup.ts'],

    // Don't watch files in CI
    watch: false,

    // Report format for CI
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: {
      junit: './test-results/integration-junit.xml',
    },

    // Coverage is typically not needed for integration tests
    coverage: {
      enabled: false,
    },

    // Retry failed tests once (network issues)
    retry: 1,

    // Environment variables passthrough
    env: {
      NODE_ENV: 'test',
    },

    // Globals
    globals: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src'),
    },
  },
});
