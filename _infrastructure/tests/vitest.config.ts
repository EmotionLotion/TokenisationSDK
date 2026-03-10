import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 second timeout for API tests
    hookTimeout: 30000,
    include: ['**/*.test.ts'],
    reporters: ['verbose'],
    outputFile: {
      json: 'results/report.json',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'results/coverage',
    },
  },
});
