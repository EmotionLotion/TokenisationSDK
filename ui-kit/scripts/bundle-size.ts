#!/usr/bin/env npx tsx
/**
 * bundle-size.ts - Measures the gzipped bundle size of @tokenisation/ui-kit.
 *
 * Usage:
 *   npx tsx ui-kit/scripts/bundle-size.ts
 *
 * Exits with code 1 if the gzipped size exceeds 100 KB.
 */

import { build, BuildResult } from 'esbuild';
import { gzipSync } from 'zlib';
import path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ENTRY_POINT = path.resolve(__dirname, '../src/index.ts');
const MAX_GZIP_BYTES = 100 * 1024; // 100 KB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Bundling ui-kit...\n');
  console.log(`  Entry point : ${ENTRY_POINT}`);

  let result: BuildResult;

  try {
    result = await build({
      entryPoints: [ENTRY_POINT],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: ['es2020'],
      minify: true,
      treeShaking: true,
      // Mark peer deps as external so they don't inflate the measurement
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'lucide-react',
        '@tokenisation/sdk',
      ],
      // Suppress warnings about unresolved imports from externals
      logLevel: 'silent',
    });
  } catch (err) {
    console.error('esbuild failed:', err);
    process.exit(1);
  }

  const outputFile = result.outputFiles?.[0];
  if (!outputFile) {
    console.error('No output produced by esbuild.');
    process.exit(1);
  }

  const rawBytes = outputFile.contents.byteLength;
  const gzipped = gzipSync(Buffer.from(outputFile.contents));
  const gzipBytes = gzipped.byteLength;
  const passed = gzipBytes <= MAX_GZIP_BYTES;

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  console.log('');
  console.log('  +--------------------------+--------------------+');
  console.log('  | Metric                   | Value              |');
  console.log('  +--------------------------+--------------------+');
  console.log(`  | Entry point              | src/index.ts       |`);
  console.log(`  | Raw size                 | ${formatBytes(rawBytes).padEnd(18)} |`);
  console.log(`  | Gzipped size             | ${formatBytes(gzipBytes).padEnd(18)} |`);
  console.log(`  | Budget                   | ${formatBytes(MAX_GZIP_BYTES).padEnd(18)} |`);
  console.log(`  | Result                   | ${(passed ? 'PASS' : 'FAIL').padEnd(18)} |`);
  console.log('  +--------------------------+--------------------+');
  console.log('');

  if (!passed) {
    console.error(
      `Bundle size check FAILED: gzipped size (${formatBytes(gzipBytes)}) exceeds budget (${formatBytes(MAX_GZIP_BYTES)}).`,
    );
    process.exit(1);
  }

  console.log('Bundle size check passed.');
}

main();
