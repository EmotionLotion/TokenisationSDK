/**
 * Airline Demo - Main Entry Point
 *
 * Express server demonstrating tokenized airline ticket management.
 */

import 'dotenv/config';
import express from 'express';
import { createAirlineService } from './services/airline.js';
import { createTicketRouter } from './routes/tickets.js';
import { createWebhookRouter } from './routes/webhooks.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = process.env.PORT || 3002;
const API_KEY = process.env.TOKENISATION_API_KEY;
const API_URL = process.env.TOKENISATION_API_URL || 'http://localhost:3001';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret';
const PROJECT_ID = process.env.PROJECT_ID || 'proj_airline_demo';

if (!API_KEY) {
  console.error('Error: TOKENISATION_API_KEY environment variable is required');
  process.exit(1);
}

// ============================================================================
// APPLICATION SETUP
// ============================================================================

const app = express();

// Parse JSON for all routes except webhooks (which need raw body for signature verification)
app.use((req, res, next) => {
  if (req.path === '/webhooks') {
    express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// SERVICES
// ============================================================================

const airlineService = createAirlineService(API_KEY, PROJECT_ID, API_URL);

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'airline-demo',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/tickets', createTicketRouter(airlineService));
app.use('/webhooks', createWebhookRouter(WEBHOOK_SECRET));

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`
========================================
  Airline Ticket Demo
========================================
  Server:    http://localhost:${PORT}
  API URL:   ${API_URL}
  Project:   ${PROJECT_ID}
========================================

Endpoints:
  POST   /tickets            - Issue a new ticket
  GET    /tickets/:id        - Get ticket details
  GET    /tickets?passengerId=xxx - List passenger tickets
  POST   /tickets/:id/transfer - Transfer ticket
  POST   /tickets/:id/cancel - Cancel ticket
  POST   /webhooks           - Webhook receiver

  `);
});
