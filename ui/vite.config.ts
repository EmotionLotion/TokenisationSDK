import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@tokenisation/ui-kit': path.resolve(__dirname, '../ui-kit/dist/index.js'),
    },
  },
  plugins: [
    react(),
    nodePolyfills({
      include: ['crypto', 'buffer', 'stream'],
      globals: {
        Buffer: true,
      },
    }),
  ],
})
