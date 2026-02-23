import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@tokenisation/core': path.resolve(__dirname, '../packages/core/src/index.ts'),
      '@tokenisation/compliance': path.resolve(__dirname, '../packages/compliance/src/index.ts'),
      '@tokenisation/chains': path.resolve(__dirname, '../packages/chains/src/index.ts'),
      '@tokenisation/realestate': path.resolve(__dirname, '../packages/realestate/src/index.ts'),
      '@tokenisation/sdk': path.resolve(__dirname, './src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
