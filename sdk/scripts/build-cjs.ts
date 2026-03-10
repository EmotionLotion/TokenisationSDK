#!/usr/bin/env npx tsx
/**
 * build-cjs.ts - Dual ESM + CJS build for @tokenisation/sdk.
 *
 * Uses esbuild to compile sdk/src/index.ts into:
 *   dist/esm/index.js   (ES module)
 *   dist/cjs/index.cjs   (CommonJS)
 *
 * Also generates dist/cjs/package.json with "type": "commonjs" so Node
 * correctly resolves the .cjs output as CommonJS.
 *
 * Usage:
 *   npx tsx sdk/scripts/build-cjs.ts
 */

import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SDK_ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(SDK_ROOT, 'src', 'index.ts');
const DIST = path.join(SDK_ROOT, 'dist');
const ESM_OUT = path.join(DIST, 'esm', 'index.js');
const CJS_OUT = path.join(DIST, 'cjs', 'index.cjs');
const CJS_PKG = path.join(DIST, 'cjs', 'package.json');

// ---------------------------------------------------------------------------
// Shared esbuild options
// ---------------------------------------------------------------------------

const sharedOptions = {
  entryPoints: [ENTRY],
  bundle: true,
  platform: 'node' as const,
  target: ['node18'],
  sourcemap: true,
  minify: false,
  treeShaking: true,
  // Allow JSX in .js files (e.g. @tokenisation/realestate compiled components)
  loader: { '.js': 'jsx' as const },
  // External peer / heavy deps that consumers provide
  external: [
    'ethers',
    'viem',
    'react',
    'react-dom',
    '@chainlink/*',
    'drizzle-orm',
    'pg',
    'ioredis',
    'bullmq',
    'pino',
    'zod',
  ],
  plugins: [
    {
      name: 'stub-abi-loader',
      setup(b) {
        // Replace ABI loader files that use createRequire + JSON files
        // with inline empty stubs for the CJS bundle
        b.onLoad({ filter: /contracts\/abis\/index\.ts$/ }, () => {
          return {
            contents: `
              export const abis = {
                ComplianceToken: [],
                IdentityRegistry: [],
                DividendDistributor: [],
                ModularCompliance: [],
                ClaimTopicsRegistry: [],
                TrustedIssuersRegistry: [],
                OracleRegistry: [],
                ChainlinkPriceFeed: [],
                TokenFactory: [],
              };
              export default abis;
            `,
            loader: 'ts',
          };
        });
        // Stub deployment services that also use createRequire
        b.onLoad({ filter: /(DeploymentService|ProductionDeploymentService)\.ts$/ }, async (args) => {
          const origFs = await import('fs');
          let contents = origFs.readFileSync(args.path, 'utf-8');
          // Replace createRequire pattern with a no-op
          contents = contents.replace(
            /import\s*{\s*createRequire\s*}\s*from\s*['"]node:module['"];?\s*const\s+require\s*=\s*createRequire\([^)]+\);?/g,
            '// createRequire stubbed for CJS bundle\nconst require = (p: string) => ({});'
          );
          return { contents, loader: 'ts' };
        });
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Ensure output directories exist
  fs.mkdirSync(path.dirname(ESM_OUT), { recursive: true });
  fs.mkdirSync(path.dirname(CJS_OUT), { recursive: true });

  console.log('Building ESM...');
  await build({
    ...sharedOptions,
    outfile: ESM_OUT,
    format: 'esm',
  });
  console.log(`  -> ${path.relative(SDK_ROOT, ESM_OUT)}`);

  console.log('Building CJS...');
  await build({
    ...sharedOptions,
    outfile: CJS_OUT,
    format: 'cjs',
    // Polyfill import.meta.url for CJS: esbuild replaces it with a banner-injected shim
    banner: {
      js: 'const import_meta_url = typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : undefined;',
    },
    define: {
      'import.meta.url': 'import_meta_url',
    },
  });
  console.log(`  -> ${path.relative(SDK_ROOT, CJS_OUT)}`);

  // Write CJS package.json so Node treats .cjs files correctly even without extension
  const cjsPackageJson = {
    type: 'commonjs',
  };
  fs.writeFileSync(CJS_PKG, JSON.stringify(cjsPackageJson, null, 2) + '\n');
  console.log(`  -> ${path.relative(SDK_ROOT, CJS_PKG)}`);

  console.log('\nDual build complete.');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
