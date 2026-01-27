/**
 * Real Estate Demo - Main Entry Point
 *
 * Express server demonstrating real estate tokenization with fractional ownership.
 */

import 'dotenv/config';
import express from 'express';
import { createPropertyService, type PropertyService } from './services/property.js';
import { z } from 'zod';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = process.env.PORT || 3003;
const API_KEY = process.env.TOKENISATION_API_KEY;
const API_URL = process.env.TOKENISATION_API_URL || 'http://localhost:3001';
const PROJECT_ID = process.env.PROJECT_ID || 'proj_realestate_demo';

if (!API_KEY) {
  console.error('Error: TOKENISATION_API_KEY environment variable is required');
  process.exit(1);
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const LocationSchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  country: z.string().length(2),
  postalCode: z.string().optional(),
});

const CreatePropertySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  location: LocationSchema,
  propertyType: z.enum(['residential', 'commercial', 'industrial', 'land']).optional(),
  valuation: z.number().positive(),
  currency: z.string().length(3).optional(),
  totalShares: z.number().int().positive(),
  dldTitleDeedId: z.string().optional(),
});

const TokenizeSchema = z.object({
  symbol: z.string().min(2).max(10),
  chainId: z.number().int().positive(),
});

const InvestSchema = z.object({
  investorId: z.string().min(1),
  investorWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  shares: z.number().int().positive(),
  paymentAmount: z.number().positive(),
  paymentCurrency: z.string().length(3).optional(),
});

const DistributionSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['rent', 'dividend', 'profit_share']).optional(),
});

// ============================================================================
// APPLICATION SETUP
// ============================================================================

const app = express();
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// SERVICES
// ============================================================================

const propertyService = createPropertyService(API_KEY, PROJECT_ID, API_URL);

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'realestate-demo',
    timestamp: new Date().toISOString(),
  });
});

// Create property
app.post('/properties', async (req, res) => {
  try {
    const data = CreatePropertySchema.parse(req.body);
    const property = await propertyService.createProperty(data);
    res.status(201).json({ success: true, data: property });
  } catch (error) {
    handleError(res, error);
  }
});

// Get property
app.get('/properties/:id', async (req, res) => {
  try {
    const property = await propertyService.getProperty(req.params.id);
    if (!property) {
      res.status(404).json({ success: false, error: 'Property not found' });
      return;
    }
    res.json({ success: true, data: property });
  } catch (error) {
    handleError(res, error);
  }
});

// List properties
app.get('/properties', async (_req, res) => {
  try {
    const properties = await propertyService.listProperties();
    res.json({ success: true, data: properties });
  } catch (error) {
    handleError(res, error);
  }
});

// Tokenize property
app.post('/properties/:id/tokenize', async (req, res) => {
  try {
    const data = TokenizeSchema.parse(req.body);
    const result = await propertyService.tokenizeProperty(req.params.id, data);
    res.json({ success: true, data: result });
  } catch (error) {
    handleError(res, error);
  }
});

// Invest in property
app.post('/properties/:id/invest', async (req, res) => {
  try {
    const data = InvestSchema.parse(req.body);

    // Get property to find token ID
    const property = await propertyService.getProperty(req.params.id);
    if (!property?.tokenId) {
      res.status(400).json({ success: false, error: 'Property not tokenized' });
      return;
    }

    const result = await propertyService.processInvestment(property.tokenId, data);
    res.json({ success: true, data: result });
  } catch (error) {
    handleError(res, error);
  }
});

// Get cap table
app.get('/properties/:id/captable', async (req, res) => {
  try {
    const property = await propertyService.getProperty(req.params.id);
    if (!property?.tokenId) {
      res.status(400).json({ success: false, error: 'Property not tokenized' });
      return;
    }

    const capTable = await propertyService.getCapTable(property.tokenId);
    res.json({ success: true, data: capTable });
  } catch (error) {
    handleError(res, error);
  }
});

// Create distribution
app.post('/properties/:id/distributions', async (req, res) => {
  try {
    const data = DistributionSchema.parse(req.body);
    const result = await propertyService.createDistribution({
      propertyId: req.params.id,
      ...data,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    handleError(res, error);
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ============================================================================
// HELPERS
// ============================================================================

function handleError(res: express.Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: error.errors,
    });
  } else {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`
========================================
  Real Estate Tokenization Demo
========================================
  Server:    http://localhost:${PORT}
  API URL:   ${API_URL}
  Project:   ${PROJECT_ID}
========================================

Endpoints:
  POST   /properties              - Create property
  GET    /properties/:id          - Get property
  GET    /properties              - List properties
  POST   /properties/:id/tokenize - Tokenize property
  POST   /properties/:id/invest   - Invest in property
  GET    /properties/:id/captable - Get cap table
  POST   /properties/:id/distributions - Create distribution

  `);
});
