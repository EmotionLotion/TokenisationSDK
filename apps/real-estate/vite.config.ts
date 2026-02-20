import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Resolve the vite-plugin-node-polyfills base directory so its shim subpackages
// can be found during build (pnpm strict resolution workaround)
const polyfillBase = path.resolve(path.dirname(require.resolve('vite-plugin-node-polyfills')), '..')

// Stub out server-side-only packages and Node built-ins that the SDK references
// but the browser app never calls at runtime
const serverOnlyDeps = [
  '@aws-sdk/client-secrets-manager',
  'mongodb',
  'node:module',
  'node:fs',
  'node:path',
  'node:crypto',
]

function stubServerDeps(): Plugin {
  return {
    name: 'stub-server-deps',
    enforce: 'pre',
    resolveId(id) {
      if (serverOnlyDeps.includes(id)) return '\0stub:' + id
    },
    load(id) {
      if (id.startsWith('\0stub:')) {
        return 'export default {}; export const createRequire = () => () => ({});'
      }
    },
  }
}

export default defineConfig({
  server: {
    port: 5174,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@tokenisation/ui-kit': path.resolve(__dirname, '../../ui-kit/dist/index.js'),
      '@tokenisation/sdk-react': path.resolve(__dirname, '../../sdk-react/dist/index.js'),
      '@tokenisation/sdk/client': path.resolve(__dirname, '../../sdk/dist/client.js'),
      '@tokenisation/sdk/components': path.resolve(__dirname, '../../sdk/dist/components/index.js'),
      '@tokenisation/sdk/plugins': path.resolve(__dirname, '../../sdk/dist/plugins/index.js'),
      '@tokenisation/sdk': path.resolve(__dirname, '../../sdk/dist/index.js'),
      // Resolve polyfill shims from the actual pnpm store path
      'vite-plugin-node-polyfills/shims/process': path.join(polyfillBase, 'shims/process/dist/index.js'),
      'vite-plugin-node-polyfills/shims/buffer': path.join(polyfillBase, 'shims/buffer/dist/index.js'),
      'vite-plugin-node-polyfills/shims/global': path.join(polyfillBase, 'shims/global/dist/index.js'),
    },
  },
  plugins: [
    stubServerDeps(),
    react(),
    nodePolyfills({
      include: ['crypto', 'buffer', 'stream', 'util', 'process', 'events'],
    }),
  ],
  build: {
    rollupOptions: {
      external: serverOnlyDeps,
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
})
