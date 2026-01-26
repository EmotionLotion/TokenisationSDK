import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/openapi.js';
import { testConnection, getDbMode } from './config/database.js';
import { authRouter } from './routes/auth.routes.js';
import { partyRouter } from './routes/party.routes.js';
import { assetRouter } from './routes/asset.routes.js';
import { eventRouter } from './routes/event.routes.js';
import { tokenRouter } from './routes/token.routes.js';
import { chainRouter } from './routes/chain.routes.js';
import { iamRouter } from './routes/iam.routes.js';
import { projectRouter } from './routes/project.routes.js';
import { complianceRouter } from './routes/compliance.routes.js';
import { transferRouter } from './routes/transfer.routes.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { dldRouter } from './routes/dld.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { ledgerRouter } from './routes/ledger.routes.js';
import { investorRouter } from './routes/investor.routes.js';
import { relayerRouter } from './routes/relayer.routes.js';
import { indexerRouter } from './routes/indexer.routes.js';
import { eventbusRouter } from './routes/eventbus.routes.js';
import { idempotencyRouter } from './routes/idempotency.routes.js';
import { settlementRouter } from './routes/settlement.routes.js';
import { distributionRouter } from './routes/distribution.routes.js';
import { vestingRouter } from './routes/vesting.routes.js';
import { corporateActionRouter } from './routes/corporateAction.routes.js';
import paymentRailsRouter from './routes/payment-rails.routes.js';
import reportsRouter from './routes/reports.routes.js';
import { kycRouter } from './routes/kyc.routes.js';
import { sdkCompatRouter } from './routes/sdk-compat.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware, apiKeyMiddleware } from './middleware/auth.js';
import { requestIdMiddleware, securityHeaders } from './middleware/apiGateway.js';
import {
  standardRateLimiter,
  authRateLimiter,
  transferRateLimiter,
  heavyOperationRateLimiter,
  isRedisAvailable,
  closeRedisConnection,
} from './middleware/rateLimit.js';
import { requestLogger, errorLogger, logger } from './middleware/logger.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(securityHeaders);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Request ID and logging (before parsing)
app.use(requestIdMiddleware);
app.use(requestLogger({ logBody: process.env.LOG_REQUEST_BODY === 'true' }));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Rate limiting (Redis-backed when REDIS_URL is configured)
app.use('/api/v1/auth', authRateLimiter);
app.use('/api/v1/transfers', transferRateLimiter);
app.use('/api/v1/tokens', heavyOperationRateLimiter);
app.use('/api/v1/relayer', heavyOperationRateLimiter);
app.use('/api/v1', standardRateLimiter);

// Health check (no auth required)
app.get('/health', async (_req, res) => {
  const dbConnected = await testConnection();
  const redisConnected = isRedisAvailable();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: dbConnected ? 'connected' : 'disconnected',
    redis: redisConnected ? 'connected' : 'not configured',
    rateLimit: redisConnected ? 'distributed' : 'in-memory',
    version: '1.0.0',
  });
});

// API Documentation (Swagger UI)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'AHOY Tokenisation API Docs',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
    showExtensions: true,
  },
}));

// OpenAPI spec endpoint (JSON)
app.get('/api/openapi.json', (_req, res) => {
  res.json(swaggerSpec);
});

// SDK Compatibility routes (aliases for React SDK)
app.use('/api/v1', sdkCompatRouter);

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/iam', iamRouter); // IAM routes (orgs, users, roles, api-keys)
app.use('/api/v1/projects', projectRouter); // Project & Document routes
app.use('/api/v1/compliance', complianceRouter); // Compliance policies & decisions
app.use('/api/v1/transfers', transferRouter); // Transfer orchestration saga
app.use('/api/v1/webhooks', webhookRouter); // Webhook endpoints & deliveries
app.use('/api/v1/dld', dldRouter); // DLD title registry & events
app.use('/api/v1/audit', auditRouter); // Audit log with hash chain
app.use('/api/v1/ledger', ledgerRouter); // Ledger positions & reporting
app.use('/api/v1/investors', investorRouter); // Investor onboarding & KYC
app.use('/api/v1/relayer', relayerRouter); // Chain relayer & signer
app.use('/api/v1/indexer', indexerRouter); // Chain event indexer
app.use('/api/v1/eventbus', eventbusRouter); // Internal event bus
app.use('/api/v1/idempotency', idempotencyRouter); // Idempotency management
app.use('/api/v1/settlements', settlementRouter); // Settlement finality tracking
app.use('/api/v1/distributions', distributionRouter); // Yield/dividend distributions
app.use('/api/v1/vesting', vestingRouter); // Vesting schedules & releases
app.use('/api/v1/corporate-actions', corporateActionRouter); // Corporate actions (splits, conversions)
app.use('/api/v1/payment-rails', paymentRailsRouter); // Payment rails (USDC, Bank)
app.use('/api/v1/reports', reportsRouter); // Report exports (cap table, audit, etc.)
app.use('/api/v1/kyc', kycRouter); // KYC provider integration (SumSub, Onfido)
app.use('/api/v1/parties', authMiddleware, partyRouter);
app.use('/api/v1/assets', apiKeyMiddleware, assetRouter);
app.use('/api/v1/events', authMiddleware, eventRouter);
app.use('/api/v1/tokens', apiKeyMiddleware, tokenRouter);
app.use('/api/v1/chains', chainRouter); // Public chain config

// Error logging and handling
app.use(errorLogger);
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  try {
    // Close Redis connection
    await closeRedisConnection();
    logger.info('Redis connection closed');

    // Allow pending requests to complete (give 10 seconds)
    await new Promise(resolve => setTimeout(resolve, 1000));

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error as Error });
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function start() {
  try {
    // Test database connection
    const dbOk = await testConnection();
    if (!dbOk) {
      logger.warn('Database connection failed. Server starting without DB.');
    } else {
      logger.info('Database connected successfully');
    }

    // Check Redis connection (rate limiting will log its own status)
    const redisOk = isRedisAvailable();

    app.listen(PORT, () => {
      logger.info('Server started', {
        metadata: {
          environment: process.env.NODE_ENV || 'development',
          port: PORT,
          database: `${getDbMode().toUpperCase()} (${dbOk ? 'Connected' : 'Disconnected'})`,
          redis: redisOk ? 'Connected' : 'Not configured (using in-memory rate limiting)',
          corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        },
      });
      console.log(`
========================================
  AHOY Tokenisation API Server
========================================
  Environment: ${process.env.NODE_ENV || 'development'}
  Port: ${PORT}
  Database: ${getDbMode().toUpperCase()} (${dbOk ? 'Connected' : 'Disconnected'})
  Redis: ${redisOk ? 'Connected (distributed rate limiting)' : 'Not configured (in-memory rate limiting)'}
  CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}
========================================
      `);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error as Error });
    process.exit(1);
  }
}

start();

export { app };
