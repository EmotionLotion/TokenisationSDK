import 'dotenv/config';

// Prevent server crashes from unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/openapi.js';
import { testConnection, getDbMode } from './config/database.js';
import { bootstrapRegistry, isBootstrapped } from './config/bootstrap.js';
import { validateEnvironmentOrExit, getEnvironmentSummary } from './config/environment.js';
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
import { custodyRouter } from './routes/custody.routes.js';
import { truthviewRouter } from './routes/truthview.routes.js';
import { reconciliationRouter } from './routes/reconciliation.routes.js';
import { datasourcesRouter } from './routes/datasources.routes.js';
import { sdkCompatRouter } from './routes/sdk-compat.routes.js';
import { issuanceRouter } from './routes/issuance.routes.js';
import { exportRouter } from './routes/export.routes.js';
import { transitionRouter } from './routes/transition.routes.js';
import { oauthRouter } from './routes/oauth.routes.js';
import { ticketRouter } from './routes/ticket.routes.js';
import { gasRouter } from './routes/gas.routes.js';
// Vertical routes
import { hotelRouter } from './routes/hotel.routes.js';
import { carRentalRouter } from './routes/car-rental.routes.js';
import { concertRouter } from './routes/concert.routes.js';
import { metricsRouter } from './routes/metrics.routes.js';
import { kycWebhookRouter } from './routes/kyc-webhook.routes.js';
// Phase 1-5: New route imports
import { schedulerRouter } from './routes/scheduler.routes.js';
import { navRouter } from './routes/nav.routes.js';
import { flightOracleRouter } from './routes/flight-oracle.routes.js';
import { redemptionRouter } from './routes/redemption.routes.js';
import { boardingPassRouter } from './routes/boarding-pass.routes.js';
import { accreditationRouter } from './routes/accreditation.routes.js';
import { sseRouter } from './routes/sse.routes.js';
import { themeRouter } from './routes/theme.routes.js';
// Hackathon Apps
import { predictionMarketRouter } from './routes/prediction-market.routes.js';
import { travelShieldRouter } from './routes/travel-shield.routes.js';
import { proofOfFundsRouter } from './routes/proof-of-funds.routes.js';
import { depinRouter } from './routes/depin.routes.js';
import { propertyManagementRouter } from './routes/property-management.routes.js';
import { validateChainConfig } from './config/chains.js';
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
import { tenantContextMiddleware, optionalTenantContextMiddleware } from './middleware/context.js';
import { traceMiddleware } from './middleware/traceMiddleware.js';
import { usageMiddleware } from './middleware/usage.js';
import { idempotencyMiddleware } from './middleware/idempotency.js';
import { auditTrailMiddleware } from './middleware/auditTrail.js';
import * as recoveryService from './services/recovery.service.js';
import * as schedulerService from './services/scheduler.service.js';
import { sseService } from './services/sse.service.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(securityHeaders);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Request ID, tracing and logging (before parsing)
app.use(requestIdMiddleware);
app.use(traceMiddleware);
app.use(requestLogger({ logBody: process.env.LOG_REQUEST_BODY === 'true' }));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Idempotency middleware for write operations (Gap 12)
app.use(idempotencyMiddleware());

// Automatic audit trail middleware for all mutations (Gap 18)
app.use(auditTrailMiddleware);

// SSE Events endpoint — registered before compression (SSE must not be compressed) (Gap 1)
app.use('/api/v1/events', sseRouter);

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

// ============================================================================
// Public routes (no auth required, optional tenant context)
// ============================================================================
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/chains', chainRouter); // Public chain config
app.use('/oauth', oauthRouter); // OAuth2 Authorization Server
app.use('/api/v1/kyc-webhooks', kycWebhookRouter); // Public KYC provider webhooks

// ============================================================================
// Protected API routes with tenant context enforcement
// All routes below require authentication AND tenant context (orgId)
// The middleware stack: apiKeyMiddleware -> tenantContextMiddleware -> router
// ============================================================================

// IAM & Organization Management
app.use('/api/v1/iam', apiKeyMiddleware, tenantContextMiddleware, iamRouter);
app.use('/api/v1/projects', apiKeyMiddleware, tenantContextMiddleware, projectRouter);

// Compliance & Governance
app.use('/api/v1/compliance', apiKeyMiddleware, tenantContextMiddleware, complianceRouter);
app.use('/api/v1/audit', apiKeyMiddleware, tenantContextMiddleware, auditRouter);

// Core Asset Operations
app.use('/api/v1/assets', apiKeyMiddleware, tenantContextMiddleware, assetRouter);
app.use('/api/v1/tokens', apiKeyMiddleware, tenantContextMiddleware, tokenRouter);

// Investor Management
app.use('/api/v1/parties', apiKeyMiddleware, tenantContextMiddleware, partyRouter);
app.use('/api/v1/investors', apiKeyMiddleware, tenantContextMiddleware, investorRouter);
app.use('/api/v1/kyc', apiKeyMiddleware, tenantContextMiddleware, kycRouter);

// Transfer & Settlement
app.use('/api/v1/transfers', apiKeyMiddleware, tenantContextMiddleware, transferRouter);
app.use('/api/v1/settlements', apiKeyMiddleware, tenantContextMiddleware, settlementRouter);

// Financial Operations
app.use('/api/v1/distributions', apiKeyMiddleware, tenantContextMiddleware, distributionRouter);
app.use('/api/v1/vesting', apiKeyMiddleware, tenantContextMiddleware, vestingRouter);
app.use('/api/v1/corporate-actions', apiKeyMiddleware, tenantContextMiddleware, corporateActionRouter);
app.use('/api/v1/payment-rails', apiKeyMiddleware, tenantContextMiddleware, paymentRailsRouter);
app.use('/api/v1/issuance', apiKeyMiddleware, tenantContextMiddleware, issuanceRouter);

// Infrastructure & Operations
app.use('/api/v1/webhooks', apiKeyMiddleware, tenantContextMiddleware, webhookRouter);
app.use('/api/v1/relayer', apiKeyMiddleware, tenantContextMiddleware, relayerRouter);
app.use('/api/v1/gas', apiKeyMiddleware, tenantContextMiddleware, gasRouter);
app.use('/api/v1/indexer', apiKeyMiddleware, tenantContextMiddleware, indexerRouter);
app.use('/api/v1/eventbus', apiKeyMiddleware, tenantContextMiddleware, eventbusRouter);
app.use('/api/v1/idempotency', apiKeyMiddleware, tenantContextMiddleware, idempotencyRouter);
app.use('/api/v1/custody', apiKeyMiddleware, tenantContextMiddleware, custodyRouter);

// Reporting & Analytics
app.use('/api/v1/ledger', apiKeyMiddleware, tenantContextMiddleware, ledgerRouter);
app.use('/api/v1/reports', apiKeyMiddleware, tenantContextMiddleware, reportsRouter);
app.use('/api/v1/truthview', apiKeyMiddleware, tenantContextMiddleware, truthviewRouter);
app.use('/api/v1/reconciliation', apiKeyMiddleware, tenantContextMiddleware, reconciliationRouter);
app.use('/api/v1/export', apiKeyMiddleware, tenantContextMiddleware, exportRouter);

// State Transitions & Audit Trail
app.use('/api/v1/transitions', apiKeyMiddleware, tenantContextMiddleware, transitionRouter);

// Airline Tickets (NFT Utility Tokens)
app.use('/api/v1/tickets', apiKeyMiddleware, tenantContextMiddleware, ticketRouter);

// Vertical NFT Tokens
app.use('/api/v1/hotels', apiKeyMiddleware, tenantContextMiddleware, hotelRouter);
app.use('/api/v1/car-rentals', apiKeyMiddleware, tenantContextMiddleware, carRentalRouter);
app.use('/api/v1/concerts', apiKeyMiddleware, tenantContextMiddleware, concertRouter);

// Dashboard Metrics
app.use('/api/v1/metrics', apiKeyMiddleware, tenantContextMiddleware, metricsRouter);

// NAV & Valuation (Gap 4)
app.use('/api/v1/assets', apiKeyMiddleware, tenantContextMiddleware, navRouter);

// Flight Oracle (Gap 5)
app.use('/api/v1/flights', apiKeyMiddleware, tenantContextMiddleware, flightOracleRouter);

// Redemption Workflow (Gap 9)
app.use('/api/v1', apiKeyMiddleware, tenantContextMiddleware, redemptionRouter);

// Boarding Pass (Gap 16)
app.use('/api/v1', apiKeyMiddleware, tenantContextMiddleware, boardingPassRouter);

// Accreditation (Gap 17)
app.use('/api/v1', apiKeyMiddleware, tenantContextMiddleware, accreditationRouter);

// Scheduler Admin (Gap 13)
app.use('/api/v1/scheduler', apiKeyMiddleware, tenantContextMiddleware, schedulerRouter);

// White-Label Theming (Gap 6)
app.use('/api/v1/themes', apiKeyMiddleware, tenantContextMiddleware, themeRouter);

// Hackathon Apps
app.use('/api/v1/markets', apiKeyMiddleware, tenantContextMiddleware, predictionMarketRouter);
app.use('/api/v1/policies', apiKeyMiddleware, tenantContextMiddleware, travelShieldRouter);
app.use('/api/v1/proofs', apiKeyMiddleware, tenantContextMiddleware, proofOfFundsRouter);
app.use('/api/v1', apiKeyMiddleware, tenantContextMiddleware, depinRouter);

// External Integrations
app.use('/api/v1/dld', apiKeyMiddleware, tenantContextMiddleware, dldRouter);

// Property Management (Real Estate)
app.use('/api/v1/properties', apiKeyMiddleware, tenantContextMiddleware, propertyManagementRouter);
app.use('/api/v1/datasources', apiKeyMiddleware, tenantContextMiddleware, datasourcesRouter);

// Events (using authMiddleware for JWT-based access)
app.use('/api/v1/events', authMiddleware, optionalTenantContextMiddleware, eventRouter);

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
    // Stop recovery workers (indexers, event bus, outbox)
    await recoveryService.shutdown();
    logger.info('Recovery service stopped');

    // Stop scheduler service
    schedulerService.stop();
    logger.info('Scheduler service stopped');

    // Close SSE connections
    sseService.shutdown();
    logger.info('SSE connections closed');

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
    // Validate environment configuration first
    validateEnvironmentOrExit();

    // Validate chain RPC configuration
    validateChainConfig();

    // Bootstrap the RegistryService with adapters and asset pack configurations
    await bootstrapRegistry();
    logger.info('RegistryService bootstrapped', {
      metadata: { isBootstrapped: isBootstrapped() },
    });

    // Test database connection
    const dbOk = await testConnection();
    if (!dbOk) {
      logger.warn('Database connection failed. Server starting without DB.');
    } else {
      logger.info('Database connected successfully');
    }

    // Check Redis connection (rate limiting will log its own status)
    const redisOk = isRedisAvailable();

    // Get environment summary for logging
    const envSummary = getEnvironmentSummary();

    // Start recovery service (outbox worker, event bus, saga recovery)
    if (dbOk) {
      try {
        const indexerChainIds = process.env.INDEXER_CHAIN_IDS
          ? process.env.INDEXER_CHAIN_IDS.split(',').map(Number).filter(Boolean)
          : [];

        await recoveryService.start({ indexerChainIds });
        logger.info('Recovery service initialized');
      } catch (error) {
        logger.error('Recovery service failed to start', { error: error as Error });
      }

      // Start scheduled jobs service (Gap 13)
      try {
        await schedulerService.start();
        logger.info('Scheduler service started');
      } catch (error) {
        logger.error('Scheduler service failed to start', { error: error as Error });
      }
    }

    app.listen(PORT, () => {
      logger.info('Server started', {
        metadata: {
          environment: process.env.NODE_ENV || 'development',
          port: PORT,
          database: `${getDbMode().toUpperCase()} (${dbOk ? 'Connected' : 'Disconnected'})`,
          redis: redisOk ? 'Connected' : 'Not configured (using in-memory rate limiting)',
          corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
          ...envSummary,
        },
      });
      logger.info(`
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
