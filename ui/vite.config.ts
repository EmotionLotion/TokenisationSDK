import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

/**
 * Custom Vite plugin to resolve vite-plugin-node-polyfills shim imports.
 * pnpm strict isolation means Rollup (and the commonjs resolver) can't find
 * the injected shim specifiers. This plugin resolves them before other plugins.
 */
function polyfillShimResolver(): Plugin {
  const shimMap: Record<string, string> = {}
  for (const name of ['buffer', 'global', 'process']) {
    // require.resolve returns the CJS entry; replace with ESM entry so that
    // Vite dev server gets proper ES module exports (default export).
    const cjsPath = require.resolve(`vite-plugin-node-polyfills/shims/${name}`)
    shimMap[`vite-plugin-node-polyfills/shims/${name}`] = cjsPath.replace(
      /index\.cjs$/,
      'index.js',
    )
  }

  return {
    name: 'polyfill-shim-resolver',
    enforce: 'pre',
    resolveId(source) {
      if (shimMap[source]) return shimMap[source]
      return null
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@tokenisation/ui-kit': path.resolve(__dirname, '../ui-kit/dist/index.js'),
      '@tokenisation/sdk/components': path.resolve(__dirname, '../sdk/dist/components/index.js'),
      '@tokenisation/sdk/plugins': path.resolve(__dirname, '../sdk/dist/plugins/index.js'),
      '@tokenisation/sdk': path.resolve(__dirname, '../sdk/dist/index.js'),
      '@aws-sdk/client-secrets-manager': path.resolve(__dirname, './src/mocks/aws-sdk.ts'),
      'mongodb': path.resolve(__dirname, './src/mocks/db-mock.ts'),
      'node:module': path.resolve(__dirname, './src/mocks/node-module.ts'),
      // Use custom crypto shim that re-exports crypto-browserify + stubs for
      // Node-only APIs (generateKeyPairSync, createSign, createVerify)
      'crypto': path.resolve(__dirname, './src/mocks/crypto-shim.ts'),
    },
  },
  plugins: [
    polyfillShimResolver(),
    react(),
    nodePolyfills({
      include: ['buffer', 'stream', 'events', 'util', 'process'],
      globals: {
        Buffer: true,
      },
      overrides: {
        // Ensure process shim resolves correctly in pnpm environments
        process: 'process/browser',
      },
    }),
  ],
})
