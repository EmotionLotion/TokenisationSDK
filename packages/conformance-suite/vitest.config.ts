import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@tokenisation/sdk': path.resolve(__dirname, '../../sdk/dist/index.js'),
    },
  },
});
