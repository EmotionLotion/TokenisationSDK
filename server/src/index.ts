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
import paymentRailsRouter from './routes/payment-rails.routes.js';
import reportsRouter from './routes/reports.routes.js';
import { kycRouter } from './routes/kyc.routes.js';
import { sdkCompatRouter } from './routes/sdk-compat.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import { requestIdMiddleware, standardRateLimiter, authRateLimiter, securityHeaders } from './middleware/apiGateway.js';
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

// Rate limiting
app.use('/api/v1/auth', authRateLimiter);
app.use('/api/v1', standardRateLimiter);

// Health check (no auth required)
app.get('/health', async (_req, res) => {
  const dbConnected = await testConnection();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: dbConnected ? 'connected' : 'disconnected',
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
app.use('/api/v1/payment-rails', paymentRailsRouter); // Payment rails (USDC, Bank)
app.use('/api/v1/reports', reportsRouter); // Report exports (cap table, audit, etc.)
app.use('/api/v1/kyc', kycRouter); // KYC provider integration (SumSub, Onfido)
app.use('/api/v1/parties', authMiddleware, partyRouter);
app.use('/api/v1/assets', authMiddleware, assetRouter);
app.use('/api/v1/events', authMiddleware, eventRouter);
app.use('/api/v1/tokens', authMiddleware, tokenRouter);
app.use('/api/v1/chains', chainRouter); // Public chain config

// Error logging and handling
app.use(errorLogger);
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

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

    app.listen(PORT, () => {
      logger.info('Server started', {
        metadata: {
          environment: process.env.NODE_ENV || 'development',
          port: PORT,
          database: `${getDbMode().toUpperCase()} (${dbOk ? 'Connected' : 'Disconnected'})`,
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
