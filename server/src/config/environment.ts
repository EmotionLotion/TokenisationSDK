/**
 * Environment Validation Module
 *
 * Validates all environment variables at startup to ensure
 * the server is properly configured before accepting requests.
 */

import { logger } from '../middleware/logger.js';

// ============================================================================
// Types
// ============================================================================

interface EnvValidation {
  name: string;
  required: boolean | ((env: NodeJS.ProcessEnv) => boolean);
  validator?: (value: string | undefined, env: NodeJS.ProcessEnv) => ValidationResult;
  description: string;
  sensitive?: boolean;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  environment: string;
  timestamp: Date;
}

// ============================================================================
// Validators
// ============================================================================

const validators = {
  nonEmpty: (value: string | undefined): ValidationResult => ({
    valid: !!value && value.trim().length > 0,
    error: 'Value cannot be empty',
  }),

  minLength: (min: number) => (value: string | undefined): ValidationResult => ({
    valid: !!value && value.length >= min,
    error: `Value must be at least ${min} characters`,
  }),

  isNumber: (value: string | undefined): ValidationResult => ({
    valid: !!value && !isNaN(parseInt(value, 10)),
    error: 'Value must be a number',
  }),

  isPort: (value: string | undefined): ValidationResult => {
    const port = parseInt(value || '', 10);
    return {
      valid: !isNaN(port) && port >= 1 && port <= 65535,
      error: 'Value must be a valid port number (1-65535)',
    };
  },

  isUrl: (value: string | undefined): ValidationResult => {
    if (!value) return { valid: false, error: 'URL is required' };
    try {
      new URL(value);
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  },

  isOneOf: (options: string[]) => (value: string | undefined): ValidationResult => ({
    valid: !!value && options.includes(value),
    error: `Value must be one of: ${options.join(', ')}`,
  }),

  isBool: (value: string | undefined): ValidationResult => ({
    valid: value === undefined || value === 'true' || value === 'false',
    error: 'Value must be "true" or "false"',
  }),

  noInsecureDefaults: (insecure: string[]) => (value: string | undefined): ValidationResult => {
    if (!value) return { valid: true };
    const isInsecure = insecure.some(i => value.toLowerCase().includes(i.toLowerCase()));
    return {
      valid: !isInsecure,
      error: 'Value appears to contain insecure default text',
    };
  },

  jwtSecret: (value: string | undefined, env: NodeJS.ProcessEnv): ValidationResult => {
    const isProduction = env.NODE_ENV === 'production';

    if (isProduction) {
      if (!value) {
        return { valid: false, error: 'JWT_SECRET is required in production' };
      }
      if (value.length < 32) {
        return { valid: false, error: 'JWT_SECRET must be at least 32 characters in production' };
      }
      const insecurePatterns = ['secret', 'password', 'change', 'default', 'example', 'test', 'dev'];
      if (insecurePatterns.some(p => value.toLowerCase().includes(p))) {
        return { valid: false, error: 'JWT_SECRET appears to contain insecure placeholder text' };
      }
    } else {
      if (!value) {
        return { valid: true, warning: 'JWT_SECRET not set. Using insecure development secret.' };
      }
    }
    return { valid: true };
  },

  productionRequiresRedis: (value: string | undefined, env: NodeJS.ProcessEnv): ValidationResult => {
    const isProduction = env.NODE_ENV === 'production';
    if (isProduction && !value) {
      return { valid: true, warning: 'REDIS_URL not set. Rate limiting will use in-memory storage (not recommended for production).' };
    }
    if (value) {
      try {
        new URL(value);
        return { valid: true };
      } catch {
        return { valid: false, error: 'REDIS_URL must be a valid URL' };
      }
    }
    return { valid: true };
  },

  authDevMode: (value: string | undefined, env: NodeJS.ProcessEnv): ValidationResult => {
    const isProduction = env.NODE_ENV === 'production';
    if (isProduction && value === 'true') {
      return { valid: false, error: 'AUTH_DEV_MODE cannot be enabled in production' };
    }
    if (value === 'true') {
      return { valid: true, warning: 'AUTH_DEV_MODE is enabled. Authentication is bypassed!' };
    }
    return { valid: true };
  },

  databaseConfig: (_value: string | undefined, env: NodeJS.ProcessEnv): ValidationResult => {
    const dbMode = env.DB_MODE || 'sqlite';

    if (dbMode === 'postgresql' || dbMode === 'postgres') {
      if (!env.DATABASE_URL) {
        return { valid: false, error: 'DATABASE_URL is required when DB_MODE is postgresql' };
      }
      try {
        new URL(env.DATABASE_URL);
      } catch {
        return { valid: false, error: 'DATABASE_URL must be a valid PostgreSQL connection string' };
      }
    }

    return { valid: true };
  },
};

// ============================================================================
// Environment Variable Definitions
// ============================================================================

const envDefinitions: EnvValidation[] = [
  // Server
  {
    name: 'NODE_ENV',
    required: false,
    validator: validators.isOneOf(['development', 'test', 'staging', 'production']),
    description: 'Application environment',
  },
  {
    name: 'PORT',
    required: false,
    validator: validators.isPort,
    description: 'Server port',
  },

  // Authentication
  {
    name: 'JWT_SECRET',
    required: (env) => env.NODE_ENV === 'production',
    validator: validators.jwtSecret,
    description: 'JWT signing secret',
    sensitive: true,
  },
  {
    name: 'AUTH_DEV_MODE',
    required: false,
    validator: validators.authDevMode,
    description: 'Development authentication bypass',
  },

  // Database
  {
    name: 'DB_MODE',
    required: false,
    validator: validators.isOneOf(['sqlite', 'postgresql', 'postgres']),
    description: 'Database mode',
  },
  {
    name: 'DATABASE_URL',
    required: (env) => {
      const mode = env.DB_MODE || 'sqlite';
      return mode === 'postgresql' || mode === 'postgres';
    },
    validator: validators.databaseConfig,
    description: 'PostgreSQL connection string',
    sensitive: true,
  },
  {
    name: 'SQLITE_PATH',
    required: false,
    description: 'SQLite database file path',
  },

  // Redis
  {
    name: 'REDIS_URL',
    required: false,
    validator: validators.productionRequiresRedis,
    description: 'Redis connection URL',
    sensitive: true,
  },

  // CORS
  {
    name: 'CORS_ORIGIN',
    required: false,
    validator: (value, env) => {
      if (env.NODE_ENV === 'production' && (!value || value === '*')) {
        return { valid: true, warning: 'CORS_ORIGIN should be explicitly set in production' };
      }
      return { valid: true };
    },
    description: 'Allowed CORS origin',
  },

  // Blockchain RPCs
  {
    name: 'ETHEREUM_RPC_URL',
    required: false,
    validator: validators.isUrl,
    description: 'Ethereum RPC endpoint',
  },
  {
    name: 'BASE_RPC_URL',
    required: false,
    validator: validators.isUrl,
    description: 'Base chain RPC endpoint',
  },
  {
    name: 'POLYGON_RPC_URL',
    required: false,
    validator: validators.isUrl,
    description: 'Polygon RPC endpoint',
  },

  // Storage
  {
    name: 'DEFAULT_STORAGE_PROVIDER',
    required: false,
    validator: validators.isOneOf(['s3', 'ipfs', 'azure', 'local']),
    description: 'Default storage provider',
  },
  {
    name: 'S3_ACCESS_KEY_ID',
    required: (env) => env.S3_ENABLED === 'true',
    description: 'S3 access key',
    sensitive: true,
  },
  {
    name: 'S3_SECRET_ACCESS_KEY',
    required: (env) => env.S3_ENABLED === 'true',
    description: 'S3 secret key',
    sensitive: true,
  },
  {
    name: 'SIGNER_KEYS',
    required: false,
    description: 'JSON array of signer keys: [{"address":"0x...","privateKey":"0x..."}]',
    sensitive: true,
  },
  {
    name: 'SIGNING_PROVIDER',
    required: false,
    validator: (value) => {
      if (!value) return { valid: true }; // Optional — skip if not set
      return validators.isOneOf(['ephemeral', 'file', 'kms'])(value);
    },
    description: 'Compliance signing provider: ephemeral, file, kms',
  },
  {
    name: 'SIGNING_KEY_PATH',
    required: (env) => env.SIGNING_PROVIDER === 'file',
    description: 'Path to RSA PEM key file for compliance signing',
    sensitive: true,
  },
  {
    name: 'KMS_KEY_ID',
    required: (env) => env.SIGNING_PROVIDER === 'kms',
    description: 'AWS KMS key ID for compliance signing',
    sensitive: true,
  },
  {
    name: 'IPFS_ENABLED',
    required: false,
    validator: validators.isBool,
    description: 'Enable IPFS storage via Pinata (true/false)',
  },
  {
    name: 'PINATA_JWT',
    required: (env) => env.IPFS_ENABLED === 'true',
    description: 'Pinata JWT for IPFS pinning',
    sensitive: true,
  },
  {
    name: 'S3_ENABLED',
    required: false,
    validator: validators.isBool,
    description: 'Enable S3 storage (true/false)',
  },
  {
    name: 'AWS_SES_REGION',
    required: false,
    description: 'AWS SES region for email sending',
  },
  {
    name: 'ENABLED_VERTICALS',
    required: false,
    description: 'Comma-separated enabled vertical modules',
  },
];

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate all environment variables
 */
export function validateEnvironment(): ValidationReport {
  const env = process.env;
  const isProduction = env.NODE_ENV === 'production';

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const definition of envDefinitions) {
    const value = env[definition.name];

    // Check required
    const isRequired = typeof definition.required === 'function'
      ? definition.required(env)
      : definition.required;

    if (isRequired && !value) {
      errors.push(`${definition.name}: Required but not set (${definition.description})`);
      continue;
    }

    // Run validator if present
    if (definition.validator) {
      const result = definition.validator(value, env);
      if (!result.valid) {
        errors.push(`${definition.name}: ${result.error}`);
      }
      if (result.warning) {
        warnings.push(`${definition.name}: ${result.warning}`);
      }
    }
  }

  // Additional production-specific checks
  if (isProduction) {
    // Check for debug/development flags that shouldn't be in production
    if (env.DEBUG === 'true' || env.DEBUG === '*') {
      warnings.push('DEBUG: Debug mode is enabled in production');
    }
    if (env.LOG_REQUEST_BODY === 'true') {
      warnings.push('LOG_REQUEST_BODY: Request body logging is enabled in production (may log sensitive data)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    environment: env.NODE_ENV || 'development',
    timestamp: new Date(),
  };
}

/**
 * Validate environment and exit if invalid (for startup)
 */
export function validateEnvironmentOrExit(): void {
  const report = validateEnvironment();

  // Log warnings
  for (const warning of report.warnings) {
    logger.warn(`[ENV] ${warning}`);
  }

  // Log errors and exit if invalid
  if (!report.valid) {
    logger.error('[ENV] Environment validation failed:');
    for (const error of report.errors) {
      logger.error(`[ENV]   - ${error}`);
    }
    logger.error('[ENV] Server cannot start with invalid configuration');
    process.exit(1);
  }

  logger.info('[ENV] Environment validation passed', {
    metadata: {
      environment: report.environment,
      warnings: report.warnings.length,
    },
  });
}

/**
 * Get a safe summary of environment configuration (no sensitive values)
 */
export function getEnvironmentSummary(): Record<string, string | boolean> {
  const env = process.env;

  return {
    NODE_ENV: env.NODE_ENV || 'development',
    PORT: env.PORT || '3001',
    DB_MODE: env.DB_MODE || 'sqlite',
    DATABASE_CONFIGURED: !!env.DATABASE_URL,
    REDIS_CONFIGURED: !!env.REDIS_URL,
    CORS_ORIGIN: env.CORS_ORIGIN || 'http://localhost:5173',
    AUTH_DEV_MODE: env.AUTH_DEV_MODE === 'true',
    S3_ENABLED: env.S3_ENABLED === 'true',
    IPFS_ENABLED: env.IPFS_ENABLED === 'true',
    ETHEREUM_RPC_CONFIGURED: !!env.ETHEREUM_RPC_URL,
    BASE_RPC_CONFIGURED: !!env.BASE_RPC_URL,
    POLYGON_RPC_CONFIGURED: !!env.POLYGON_RPC_URL,
  };
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging';
}

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flagName: string): boolean {
  const value = process.env[flagName];
  return value === 'true' || value === '1';
}
