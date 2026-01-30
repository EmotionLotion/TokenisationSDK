import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tokenisation/ui-kit': path.resolve(__dirname, '../ui-kit/dist/index.js'),
      '@tokenisation/sdk/components': path.resolve(__dirname, '../sdk/dist/components/index.js'),
      '@tokenisation/sdk': path.resolve(__dirname, '../sdk/dist/index.js'),
      '@aws-sdk/client-secrets-manager': path.resolve(__dirname, './src/mocks/aws-sdk.ts'),
      'mongodb': path.resolve(__dirname, './src/mocks/db-mock.ts'),
      'node:module': path.resolve(__dirname, './src/mocks/node-module.ts'),
      'crypto': path.resolve(__dirname, './src/mocks/crypto-shim.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: true,
  },
});
