#!/usr/bin/env tsx
/**
 * Postman Collection Generator
 *
 * Generates a Postman collection from the OpenAPI specification.
 * Includes environment variables, pre-request scripts, and test scripts.
 *
 * Usage:
 *   npm run postman:generate
 *   npm run postman:generate -- --output ./postman/collection.json
 *   npm run postman:generate -- --include-tests
 *
 * @packageDocumentation
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { swaggerSpec } from '../src/config/openapi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

interface GeneratorOptions {
  output: string;
  includeTests: boolean;
  environmentFile: string;
}

function parseArgs(): GeneratorOptions {
  const args = process.argv.slice(2);
  const options: GeneratorOptions = {
    output: join(__dirname, '../postman/AHOY_API.postman_collection.json'),
    includeTests: true,
    environmentFile: join(__dirname, '../postman/AHOY_Sandbox.postman_environment.json'),
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--include-tests':
        options.includeTests = true;
        break;
      case '--no-tests':
        options.includeTests = false;
        break;
      case '--env-file':
        options.environmentFile = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Postman Collection Generator

Usage:
  npx tsx scripts/generate-postman.ts [options]

Options:
  --output, -o <path>   Output path for collection JSON (default: ./postman/AHOY_API.postman_collection.json)
  --include-tests       Include test scripts (default: true)
  --no-tests            Exclude test scripts
  --env-file <path>     Output path for environment file
  --help, -h            Show this help message
`);
}

// ============================================================================
// POSTMAN COLLECTION TYPES
// ============================================================================

interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: string;
    version: string;
  };
  variable: Array<{ key: string; value: string; type?: string }>;
  auth: {
    type: string;
    apikey: Array<{ key: string; value: string; type: string }>;
  };
  item: PostmanFolder[];
  event?: PostmanEvent[];
}

interface PostmanFolder {
  name: string;
  description?: string;
  item: PostmanRequest[];
}

interface PostmanRequest {
  name: string;
  request: {
    method: string;
    header: Array<{ key: string; value: string; type?: string; disabled?: boolean }>;
    url: {
      raw: string;
      host: string[];
      path: string[];
      query?: Array<{ key: string; value: string; description?: string; disabled?: boolean }>;
      variable?: Array<{ key: string; value: string; description?: string }>;
    };
    body?: {
      mode: string;
      raw: string;
      options?: { raw: { language: string } };
    };
    description?: string;
  };
  response?: any[];
  event?: PostmanEvent[];
}

interface PostmanEvent {
  listen: 'prerequest' | 'test';
  script: {
    type: string;
    exec: string[];
  };
}

interface PostmanEnvironment {
  name: string;
  values: Array<{
    key: string;
    value: string;
    type: 'default' | 'secret';
    enabled: boolean;
  }>;
}

// ============================================================================
// OPENAPI TO POSTMAN CONVERSION
// ============================================================================

function convertOpenApiToPostman(spec: any, options: GeneratorOptions): PostmanCollection {
  const collection: PostmanCollection = {
    info: {
      name: spec.info.title || 'AHOY Tokenisation API',
      description: spec.info.description || '',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      version: spec.info.version || '1.0.0',
    },
    variable: [
      { key: 'baseUrl', value: '{{baseUrl}}', type: 'string' },
      { key: 'apiKey', value: '{{apiKey}}', type: 'string' },
    ],
    auth: {
      type: 'apikey',
      apikey: [
        { key: 'key', value: 'Authorization', type: 'string' },
        { key: 'value', value: 'Bearer {{apiKey}}', type: 'string' },
        { key: 'in', value: 'header', type: 'string' },
      ],
    },
    item: [],
  };

  // Add collection-level pre-request script
  collection.event = [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          '// Set timestamp for idempotency keys',
          'pm.variables.set("timestamp", Date.now());',
          'pm.variables.set("uuid", require("uuid").v4());',
        ],
      },
    },
  ];

  // Group endpoints by tag
  const tagMap = new Map<string, PostmanRequest[]>();

  // Initialize with defined tags
  if (spec.tags) {
    for (const tag of spec.tags) {
      tagMap.set(tag.name, []);
    }
  }

  // Process paths
  if (spec.paths) {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods as any)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const request = convertOperation(path, method, operation as any, spec, options);
          const tag = (operation as any).tags?.[0] || 'Other';

          if (!tagMap.has(tag)) {
            tagMap.set(tag, []);
          }
          tagMap.get(tag)!.push(request);
        }
      }
    }
  }

  // Convert to folders
  for (const [tag, requests] of tagMap) {
    if (requests.length > 0) {
      const tagInfo = spec.tags?.find((t: any) => t.name === tag);
      collection.item.push({
        name: tag,
        description: tagInfo?.description || '',
        item: requests,
      });
    }
  }

  return collection;
}

function convertOperation(
  path: string,
  method: string,
  operation: any,
  spec: any,
  options: GeneratorOptions
): PostmanRequest {
  // Convert path parameters from OpenAPI format to Postman format
  const postmanPath = path.replace(/{(\w+)}/g, ':$1');

  // Build URL
  const pathSegments = postmanPath.split('/').filter(Boolean);

  // Build query parameters
  const queryParams: Array<{ key: string; value: string; description?: string; disabled?: boolean }> = [];
  const pathVariables: Array<{ key: string; value: string; description?: string }> = [];

  if (operation.parameters) {
    for (const param of operation.parameters) {
      if (param.in === 'query') {
        queryParams.push({
          key: param.name,
          value: param.example || '',
          description: param.description,
          disabled: !param.required,
        });
      } else if (param.in === 'path') {
        pathVariables.push({
          key: param.name,
          value: param.example || `{{${param.name}}}`,
          description: param.description,
        });
      }
    }
  }

  // Build headers
  const headers: Array<{ key: string; value: string; type?: string; disabled?: boolean }> = [
    { key: 'Content-Type', value: 'application/json', type: 'text' },
  ];

  // Add Idempotency-Key for POST requests
  if (method === 'post') {
    headers.push({
      key: 'Idempotency-Key',
      value: '{{$guid}}',
      type: 'text',
      disabled: true,
    });
  }

  // Build request body
  let body: PostmanRequest['request']['body'];
  if (operation.requestBody?.content?.['application/json']) {
    const schema = operation.requestBody.content['application/json'].schema;
    const example = operation.requestBody.content['application/json'].example ||
      generateExample(schema, spec);
    body = {
      mode: 'raw',
      raw: JSON.stringify(example, null, 2),
      options: { raw: { language: 'json' } },
    };
  }

  // Build request
  const request: PostmanRequest = {
    name: operation.summary || `${method.toUpperCase()} ${path}`,
    request: {
      method: method.toUpperCase(),
      header: headers,
      url: {
        raw: `{{baseUrl}}${postmanPath}${queryParams.length ? '?' + queryParams.map(q => `${q.key}=${q.value}`).join('&') : ''}`,
        host: ['{{baseUrl}}'],
        path: pathSegments,
        query: queryParams.length > 0 ? queryParams : undefined,
        variable: pathVariables.length > 0 ? pathVariables : undefined,
      },
      body,
      description: operation.description || '',
    },
    response: [],
  };

  // Add test scripts
  if (options.includeTests) {
    request.event = generateTestScripts(method, operation);
  }

  return request;
}

function generateExample(schema: any, spec: any): any {
  if (!schema) return {};

  // Handle $ref
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/components/schemas/', '');
    const refSchema = spec.components?.schemas?.[refPath];
    if (refSchema) {
      return generateExample(refSchema, spec);
    }
    return {};
  }

  if (schema.example !== undefined) {
    return schema.example;
  }

  if (schema.type === 'object') {
    const obj: any = {};
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        const propSchema = prop as any;
        // Only include required properties or provide commented hints
        if (schema.required?.includes(key) || propSchema.example !== undefined) {
          obj[key] = generateExample(propSchema, spec);
        }
      }
    }
    return obj;
  }

  if (schema.type === 'array') {
    return [generateExample(schema.items, spec)];
  }

  // Primitive types
  switch (schema.type) {
    case 'string':
      if (schema.format === 'uuid') return '{{$guid}}';
      if (schema.format === 'email') return 'test@example.com';
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'uri') return 'https://example.com';
      if (schema.enum) return schema.enum[0];
      if (schema.pattern?.includes('0x')) return '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE23';
      return schema.example || 'string';
    case 'integer':
    case 'number':
      return schema.example || 0;
    case 'boolean':
      return schema.example !== undefined ? schema.example : true;
    default:
      return null;
  }
}

function generateTestScripts(method: string, operation: any): PostmanEvent[] {
  const tests: string[] = [
    '// Verify response status',
    `pm.test("Status code is 2xx", function () {`,
    `    pm.response.to.be.success;`,
    `});`,
    '',
    '// Verify response time',
    `pm.test("Response time is less than 2000ms", function () {`,
    `    pm.expect(pm.response.responseTime).to.be.below(2000);`,
    `});`,
    '',
    '// Verify response format',
    `pm.test("Response has valid JSON body", function () {`,
    `    pm.response.to.be.json;`,
    `});`,
  ];

  // Add specific tests based on operation
  if (operation.responses?.['200']?.content?.['application/json']?.schema) {
    tests.push('');
    tests.push('// Verify response structure');
    tests.push(`pm.test("Response has expected structure", function () {`);
    tests.push(`    const jsonData = pm.response.json();`);
    tests.push(`    pm.expect(jsonData).to.be.an('object');`);
    tests.push(`});`);
  }

  // Store IDs for chaining requests
  if (method === 'post') {
    tests.push('');
    tests.push('// Store created resource ID for subsequent requests');
    tests.push(`if (pm.response.code === 201 || pm.response.code === 200) {`);
    tests.push(`    const jsonData = pm.response.json();`);
    tests.push(`    if (jsonData.id) {`);
    tests.push(`        pm.environment.set("lastCreatedId", jsonData.id);`);
    tests.push(`    }`);
    tests.push(`}`);
  }

  return [
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: tests,
      },
    },
  ];
}

function generateEnvironment(): PostmanEnvironment {
  return {
    name: 'AHOY Sandbox',
    values: [
      {
        key: 'baseUrl',
        value: 'http://localhost:3001/api/v1',
        type: 'default',
        enabled: true,
      },
      {
        key: 'apiKey',
        value: 'your-api-key-here',
        type: 'secret',
        enabled: true,
      },
      {
        key: 'orgId',
        value: '',
        type: 'default',
        enabled: true,
      },
      {
        key: 'projectId',
        value: '',
        type: 'default',
        enabled: true,
      },
      {
        key: 'assetId',
        value: '',
        type: 'default',
        enabled: true,
      },
      {
        key: 'tokenId',
        value: '',
        type: 'default',
        enabled: true,
      },
      {
        key: 'investorId',
        value: '',
        type: 'default',
        enabled: true,
      },
      {
        key: 'transferId',
        value: '',
        type: 'default',
        enabled: true,
      },
      {
        key: 'walletAddress',
        value: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE23',
        type: 'default',
        enabled: true,
      },
      {
        key: 'lastCreatedId',
        value: '',
        type: 'default',
        enabled: true,
      },
    ],
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs();

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         AHOY Postman Collection Generator                      ║
╚════════════════════════════════════════════════════════════════╝
`);

  console.log('Generating Postman collection from OpenAPI spec...');

  // Convert OpenAPI to Postman
  const collection = convertOpenApiToPostman(swaggerSpec, options);

  // Ensure output directory exists
  const outputDir = dirname(options.output);
  mkdirSync(outputDir, { recursive: true });

  // Write collection
  writeFileSync(options.output, JSON.stringify(collection, null, 2));
  console.log(`✓ Collection written to: ${options.output}`);

  // Generate environment file
  const environment = generateEnvironment();
  const envDir = dirname(options.environmentFile);
  mkdirSync(envDir, { recursive: true });
  writeFileSync(options.environmentFile, JSON.stringify(environment, null, 2));
  console.log(`✓ Environment written to: ${options.environmentFile}`);

  // Print summary
  const totalRequests = collection.item.reduce((sum, folder) => sum + folder.item.length, 0);
  console.log(`
Summary:
  - Folders: ${collection.item.length}
  - Requests: ${totalRequests}
  - Tests included: ${options.includeTests ? 'Yes' : 'No'}

Import Instructions:
  1. Open Postman
  2. Click "Import" button
  3. Select the collection file: ${options.output}
  4. Import the environment file: ${options.environmentFile}
  5. Select "AHOY Sandbox" environment from dropdown
  6. Update the "apiKey" variable with your API key

Get your API key by running:
  npm run db:seed
`);
}

main().catch((error) => {
  console.error('Generation failed:', error);
  process.exit(1);
});
