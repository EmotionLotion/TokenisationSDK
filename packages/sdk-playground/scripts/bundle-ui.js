#!/usr/bin/env node

/**
 * Bundle UI script
 * Copies the built UI files to the public directory for npm publishing.
 * This allows npx @tokenisation/sdk-playground to work without the monorepo.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageRoot = join(__dirname, '..');
const monorepoRoot = join(packageRoot, '..', '..');
const uiDistPath = join(monorepoRoot, 'ui', 'dist');
const publicPath = join(packageRoot, 'public');

console.log('Bundling UI for npm package...');

// Check if UI is built
if (!existsSync(join(uiDistPath, 'index.html'))) {
  console.error('Error: UI is not built. Run "npm run build" in the ui/ directory first.');
  console.error(`Looking for: ${join(uiDistPath, 'index.html')}`);
  process.exit(1);
}

// Clean and recreate public directory
if (existsSync(publicPath)) {
  rmSync(publicPath, { recursive: true, force: true });
}
mkdirSync(publicPath, { recursive: true });

// Copy UI dist to public
cpSync(uiDistPath, publicPath, { recursive: true });

console.log('UI bundled successfully to public/');
console.log('Package is ready for publishing.');
