import { defineConfig } from 'vitest/config';

// T1 (Foundation Test) — package-level test runner for @tokenisation/core.
// Tests live in tests/ and exercise the public foundation seams from source.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
