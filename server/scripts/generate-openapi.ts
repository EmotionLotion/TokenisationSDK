#!/usr/bin/env tsx
/**
 * Generate OpenAPI specification file
 *
 * Usage: npm run openapi:generate
 *
 * Outputs:
 * - server/openapi.yaml (YAML format)
 * - server/openapi.json (JSON format)
 */

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function generateOpenAPI() {
  // Dynamic import to ensure proper module loading
  const { swaggerSpec } = await import('../src/config/openapi.js');

  const outputDir = join(__dirname, '..');

  // Write JSON
  const jsonPath = join(outputDir, 'openapi.json');
  writeFileSync(jsonPath, JSON.stringify(swaggerSpec, null, 2));
  console.log(`✓ Generated ${jsonPath}`);

  // Write YAML
  const yamlPath = join(outputDir, 'openapi.yaml');
  writeFileSync(yamlPath, yaml.stringify(swaggerSpec, { lineWidth: 0 }));
  console.log(`✓ Generated ${yamlPath}`);

  console.log('\nOpenAPI specification generated successfully!');
  console.log(`  - JSON: ${jsonPath}`);
  console.log(`  - YAML: ${yamlPath}`);
  console.log('\nTo view documentation, start the server and visit:');
  console.log('  http://localhost:3001/api/docs');
}

generateOpenAPI().catch(console.error);
