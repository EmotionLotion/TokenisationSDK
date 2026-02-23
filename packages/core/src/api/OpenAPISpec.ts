/**
 * OpenAPI Specification Generator
 *
 * Generates OpenAPI 3.1 spec from SDK types and routes.
 * Supports automatic documentation of:
 * - Endpoints
 * - Request/Response schemas
 * - Authentication
 * - Error codes
 */

// ============================================================================
// TYPES
// ============================================================================

export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface OpenAPIServer {
  url: string;
  description?: string;
  variables?: Record<string, {
    default: string;
    enum?: string[];
    description?: string;
  }>;
}

export interface OpenAPISchema {
  type?: string;
  format?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  enum?: string[];
  description?: string;
  example?: unknown;
  $ref?: string;
  allOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface OpenAPIParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema: OpenAPISchema;
  example?: unknown;
}

export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, {
    schema: OpenAPISchema;
    example?: unknown;
  }>;
}

export interface OpenAPIResponse {
  description: string;
  content?: Record<string, {
    schema: OpenAPISchema;
    example?: unknown;
  }>;
  headers?: Record<string, {
    description?: string;
    schema: OpenAPISchema;
  }>;
}

export interface OpenAPIOperation {
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

export interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  parameters?: OpenAPIParameter[];
}

export interface OpenAPISecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: {
    implicit?: { authorizationUrl: string; scopes: Record<string, string> };
    password?: { tokenUrl: string; scopes: Record<string, string> };
    clientCredentials?: { tokenUrl: string; scopes: Record<string, string> };
    authorizationCode?: {
      authorizationUrl: string;
      tokenUrl: string;
      scopes: Record<string, string>;
    };
  };
}

export interface OpenAPISpec {
  openapi: '3.1.0';
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  paths: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, OpenAPISecurityScheme>;
    parameters?: Record<string, OpenAPIParameter>;
    responses?: Record<string, OpenAPIResponse>;
  };
  security?: Array<Record<string, string[]>>;
  tags?: Array<{
    name: string;
    description?: string;
  }>;
}

// ============================================================================
// SPEC BUILDER
// ============================================================================

export class OpenAPISpecBuilder {
  private spec: OpenAPISpec;

  constructor(info: OpenAPIInfo) {
    this.spec = {
      openapi: '3.1.0',
      info,
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {},
        parameters: {},
        responses: {},
      },
      tags: [],
    };
  }

  addServer(server: OpenAPIServer): this {
    if (!this.spec.servers) {
      this.spec.servers = [];
    }
    this.spec.servers.push(server);
    return this;
  }

  addTag(name: string, description?: string): this {
    if (!this.spec.tags) {
      this.spec.tags = [];
    }
    this.spec.tags.push({ name, description });
    return this;
  }

  addSchema(name: string, schema: OpenAPISchema): this {
    if (!this.spec.components) {
      this.spec.components = {};
    }
    if (!this.spec.components.schemas) {
      this.spec.components.schemas = {};
    }
    this.spec.components.schemas[name] = schema;
    return this;
  }

  addSecurityScheme(name: string, scheme: OpenAPISecurityScheme): this {
    if (!this.spec.components) {
      this.spec.components = {};
    }
    if (!this.spec.components.securitySchemes) {
      this.spec.components.securitySchemes = {};
    }
    this.spec.components.securitySchemes[name] = scheme;
    return this;
  }

  addPath(path: string, methods: OpenAPIPathItem): this {
    this.spec.paths[path] = methods;
    return this;
  }

  addGlobalSecurity(security: Record<string, string[]>): this {
    if (!this.spec.security) {
      this.spec.security = [];
    }
    this.spec.security.push(security);
    return this;
  }

  build(): OpenAPISpec {
    return this.spec;
  }

  toJSON(): string {
    return JSON.stringify(this.spec, null, 2);
  }

  toYAML(): string {
    return this.jsonToYaml(this.spec);
  }

  private jsonToYaml(obj: unknown, indent = 0): string {
    const spaces = '  '.repeat(indent);

    if (obj === null || obj === undefined) {
      return 'null';
    }

    if (typeof obj === 'string') {
      if (obj.includes('\n') || obj.includes(':') || obj.includes('#')) {
        return `|\n${obj.split('\n').map(line => spaces + '  ' + line).join('\n')}`;
      }
      return obj;
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return String(obj);
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return obj.map(item => {
        const value = this.jsonToYaml(item, indent + 1);
        if (typeof item === 'object' && item !== null) {
          return `${spaces}- ${value.trim().replace(/^\s+/gm, match => '\n' + spaces + '  ' + match.trim())}`;
        }
        return `${spaces}- ${value}`;
      }).join('\n');
    }

    if (typeof obj === 'object') {
      const entries = Object.entries(obj);
      if (entries.length === 0) return '{}';
      return entries.map(([key, value]) => {
        const yamlValue = this.jsonToYaml(value, indent + 1);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return `${spaces}${key}:\n${yamlValue}`;
        }
        if (Array.isArray(value)) {
          return `${spaces}${key}:\n${yamlValue}`;
        }
        return `${spaces}${key}: ${yamlValue}`;
      }).join('\n');
    }

    return String(obj);
  }
}

// ============================================================================
// SDK SPEC GENERATOR
// ============================================================================

export function generateTokenisationSDKSpec(): OpenAPISpec {
  const builder = new OpenAPISpecBuilder({
    title: 'Tokenisation SDK API',
    version: '1.0.0',
    description: `
Modular tokenisation infrastructure for real-world assets.

## Authentication
All endpoints require API key authentication via the \`X-API-Key\` header.

## Rate Limits
- Standard endpoints: 100 requests/minute
- Sensitive operations: 10 requests/minute

## Error Codes
All errors follow the format:
\`\`\`json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "details": {}
}
\`\`\`
    `.trim(),
    contact: {
      name: 'API Support',
      email: 'support@tokenisation.io',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  });

  // Servers
  builder
    .addServer({ url: 'https://api.tokenisation.io/v1', description: 'Production' })
    .addServer({ url: 'https://sandbox.tokenisation.io/v1', description: 'Sandbox' })
    .addServer({ url: 'http://localhost:3000/v1', description: 'Development' });

  // Tags
  builder
    .addTag('Assets', 'Asset management operations')
    .addTag('Investors', 'Investor/party management')
    .addTag('Tokens', 'Token operations (mint, transfer, burn)')
    .addTag('Compliance', 'Compliance and KYC operations')
    .addTag('Webhooks', 'Webhook management');

  // Security Schemes
  builder
    .addSecurityScheme('ApiKeyAuth', {
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
      description: 'API key for authentication',
    })
    .addSecurityScheme('BearerAuth', {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT token for user authentication',
    });

  // Common Schemas
  builder
    .addSchema('Error', {
      type: 'object',
      properties: {
        error: { type: 'string', description: 'Error code' },
        message: { type: 'string', description: 'Human-readable message' },
        details: { type: 'object', description: 'Additional error details' },
      },
      required: ['error', 'message'],
    })
    .addSchema('Pagination', {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        total: { type: 'integer' },
        hasMore: { type: 'boolean' },
      },
    })
    .addSchema('Asset', {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        symbol: { type: 'string' },
        state: { type: 'string', enum: ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'FROZEN', 'RETIRED'] },
        rightType: { type: 'string', enum: ['OWNERSHIP', 'DEBT', 'REVENUE_SHARE', 'ACCESS', 'GOVERNANCE'] },
        totalSupply: { type: 'string' },
        jurisdiction: {
          type: 'object',
          properties: {
            countryCode: { type: 'string' },
            accreditedOnly: { type: 'boolean' },
            blockedJurisdictions: { type: 'array', items: { type: 'string' } },
          },
        },
        compliance: {
          type: 'object',
          properties: {
            kycRequired: { type: 'boolean' },
            accreditationRequired: { type: 'boolean' },
            lockupDays: { type: 'integer' },
            maxInvestors: { type: 'integer' },
          },
        },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'name', 'state', 'rightType'],
    })
    .addSchema('Investor', {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['INDIVIDUAL', 'ORGANIZATION'] },
        jurisdiction: { type: 'string' },
        kycStatus: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] },
        accreditationStatus: { type: 'string', enum: ['NONE', 'ACCREDITED', 'QUALIFIED_PURCHASER'] },
        wallets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              chainId: { type: 'integer' },
              isPrimary: { type: 'boolean' },
            },
          },
        },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'name', 'type'],
    })
    .addSchema('Transfer', {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        assetId: { type: 'string', format: 'uuid' },
        from: { type: 'string' },
        to: { type: 'string' },
        amount: { type: 'string' },
        status: { type: 'string', enum: ['PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'FAILED'] },
        transactionHash: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'assetId', 'from', 'to', 'amount', 'status'],
    });

  // Asset Endpoints
  builder
    .addPath('/assets', {
      get: {
        operationId: 'listAssets',
        summary: 'List all assets',
        tags: ['Assets'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Page number' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 }, description: 'Items per page' },
          { name: 'state', in: 'query', schema: { type: 'string' }, description: 'Filter by state' },
        ],
        responses: {
          '200': {
            description: 'List of assets',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Asset' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
        security: [{ ApiKeyAuth: [] }],
      },
      post: {
        operationId: 'createAsset',
        summary: 'Create a new asset',
        tags: ['Assets'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Asset name' },
                  symbol: { type: 'string', description: 'Token symbol' },
                  rightType: { type: 'string', enum: ['OWNERSHIP', 'DEBT', 'REVENUE_SHARE'] },
                  jurisdiction: { type: 'string', description: 'ISO country code' },
                  totalSupply: { type: 'string', description: 'Total token supply' },
                },
                required: ['name', 'rightType', 'jurisdiction'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Asset created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } },
          },
          '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
        security: [{ ApiKeyAuth: [] }],
      },
    })
    .addPath('/assets/{assetId}', {
      get: {
        operationId: 'getAsset',
        summary: 'Get asset by ID',
        tags: ['Assets'],
        parameters: [
          { name: 'assetId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Asset details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } },
          '404': { description: 'Asset not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
        security: [{ ApiKeyAuth: [] }],
      },
    })
    .addPath('/assets/{assetId}/activate', {
      post: {
        operationId: 'activateAsset',
        summary: 'Activate an asset',
        tags: ['Assets'],
        parameters: [
          { name: 'assetId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Asset activated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } },
          '400': { description: 'Invalid state transition', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
        security: [{ ApiKeyAuth: [] }],
      },
    });

  // Investor Endpoints
  builder
    .addPath('/investors', {
      get: {
        operationId: 'listInvestors',
        summary: 'List all investors',
        tags: ['Investors'],
        responses: {
          '200': {
            description: 'List of investors',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Investor' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
        security: [{ ApiKeyAuth: [] }],
      },
      post: {
        operationId: 'createInvestor',
        summary: 'Create a new investor',
        tags: ['Investors'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['INDIVIDUAL', 'ORGANIZATION'] },
                  email: { type: 'string', format: 'email' },
                  jurisdiction: { type: 'string' },
                },
                required: ['name', 'type', 'jurisdiction'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Investor created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Investor' } } } },
        },
        security: [{ ApiKeyAuth: [] }],
      },
    });

  // Token Endpoints
  builder
    .addPath('/assets/{assetId}/mint', {
      post: {
        operationId: 'mintTokens',
        summary: 'Mint tokens to an investor',
        tags: ['Tokens'],
        parameters: [
          { name: 'assetId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  investorId: { type: 'string', format: 'uuid' },
                  amount: { type: 'string' },
                },
                required: ['investorId', 'amount'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Tokens minted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Transfer' } } } },
          '400': { description: 'Compliance check failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
        security: [{ ApiKeyAuth: [] }],
      },
    })
    .addPath('/assets/{assetId}/transfer', {
      post: {
        operationId: 'transferTokens',
        summary: 'Transfer tokens between investors',
        tags: ['Tokens'],
        parameters: [
          { name: 'assetId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  fromInvestorId: { type: 'string', format: 'uuid' },
                  toInvestorId: { type: 'string', format: 'uuid' },
                  amount: { type: 'string' },
                },
                required: ['fromInvestorId', 'toInvestorId', 'amount'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Transfer initiated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Transfer' } } } },
          '400': { description: 'Transfer rejected', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
        security: [{ ApiKeyAuth: [] }],
      },
    });

  // Global security
  builder.addGlobalSecurity({ ApiKeyAuth: [] });

  return builder.build();
}

// Export spec as JSON
export const openAPISpec = generateTokenisationSDKSpec();

export default OpenAPISpecBuilder;
