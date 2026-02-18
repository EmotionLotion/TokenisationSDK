import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

export default defineConfig({
  server: {
    port: 5174,
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
    },
  },
  plugins: [
    react(),
    nodePolyfills({
      include: ['crypto', 'buffer', 'stream', 'util', 'process'],
    }),
  ],
})
