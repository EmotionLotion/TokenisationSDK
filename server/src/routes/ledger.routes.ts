import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as ledgerService from '../services/ledger.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import { requireScope } from '../middleware/scopeGuard.js';

export const ledgerRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const dateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// ============================================================================
// Position Routes
// ============================================================================

// List positions
ledgerRouter.get('/positions', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, investorId, minBalance, maxBalance, limit, offset } = req.query;

    const positions = await ledgerService.listPositions(req.apiKey.orgId, {
      tokenId: tokenId as string | undefined,
      investorId: investorId as string | undefined,
      minBalance: minBalance as string | undefined,
      maxBalance: maxBalance as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: positions, count: positions.length });
  } catch (error) {
    next(error);
  }
});

// Get position by wallet
ledgerRouter.get('/positions/wallet/:walletAddress', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const positions = await ledgerService.getPositionsByWallet(
      req.params.walletAddress,
      req.apiKey.orgId
    );

    res.json({ data: positions, count: positions.length });
  } catch (error) {
    next(error);
  }
});

// Get positions by investor
ledgerRouter.get('/positions/investor/:investorId', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const positions = await ledgerService.getPositionsByInvestor(
      req.params.investorId,
      req.apiKey.orgId
    );

    res.json({ data: positions, count: positions.length });
  } catch (error) {
    next(error);
  }
});

// Get specific position
ledgerRouter.get('/positions/:tokenId/:investorId/:walletAddress', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const position = await ledgerService.getPosition(
      req.params.tokenId,
      req.params.investorId,
      req.params.walletAddress,
      req.apiKey.orgId
    );

    if (!position) {
      res.json({ balance: '0', lockedBalance: '0' });
    } else {
      res.json(position);
    }
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Ledger Events Routes
// ============================================================================

// List ledger events
ledgerRouter.get('/events', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, walletAddress, eventType, startDate, endDate, limit, offset } = req.query;

    const events = await ledgerService.listLedgerEvents(req.apiKey.orgId, {
      tokenId: tokenId as string | undefined,
      walletAddress: walletAddress as string | undefined,
      eventType: eventType as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: events, count: events.length });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Cap Table Snapshot Routes
// ============================================================================

// Create cap table snapshot
ledgerRouter.post('/snapshots', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, metadata } = req.body;

    if (!tokenId) {
      throw new ValidationError('tokenId is required');
    }

    const snapshot = await ledgerService.createCapTableSnapshot(
      tokenId,
      req.apiKey.orgId,
      metadata
    );

    res.status(201).json(snapshot);
  } catch (error) {
    next(error);
  }
});

// List cap table snapshots
ledgerRouter.get('/snapshots', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, startDate, endDate, limit, offset } = req.query;

    const snapshots = await ledgerService.listCapTableSnapshots(req.apiKey.orgId, {
      tokenId: tokenId as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: snapshots, count: snapshots.length });
  } catch (error) {
    next(error);
  }
});

// Get cap table snapshot
ledgerRouter.get('/snapshots/:id', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const snapshot = await ledgerService.getCapTableSnapshot(req.params.id, req.apiKey.orgId);
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

// Verify cap table snapshot integrity
ledgerRouter.get('/snapshots/:id/verify', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await ledgerService.verifyCapTableSnapshot(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Analytics & Reporting Routes
// ============================================================================

// Get position summary for a token
ledgerRouter.get('/analytics/summary/:tokenId', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const summary = await ledgerService.getPositionSummary(req.params.tokenId, req.apiKey.orgId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// Get token distribution
ledgerRouter.get('/analytics/distribution/:tokenId', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const distribution = await ledgerService.getTokenDistribution(req.params.tokenId, req.apiKey.orgId);
    res.json(distribution);
  } catch (error) {
    next(error);
  }
});

// Get holder movements
ledgerRouter.post('/analytics/holder-movements', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const movements = await ledgerService.getHolderMovements(req.apiKey.orgId, {
      tokenId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    res.json(movements);
  } catch (error) {
    next(error);
  }
});

// Get transfer volume
ledgerRouter.post('/analytics/transfer-volume', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, startDate, endDate, groupBy } = req.body;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const volume = await ledgerService.getTransferVolume(req.apiKey.orgId, {
      tokenId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      groupBy: groupBy as 'day' | 'week' | 'month' | undefined,
    });

    res.json(volume);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Portfolio Routes
// ============================================================================

// Get investor portfolio
ledgerRouter.get('/portfolio/:investorId', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const portfolio = await ledgerService.getInvestorPortfolio(
      req.params.investorId,
      req.apiKey.orgId
    );

    res.json(portfolio);
  } catch (error) {
    next(error);
  }
});
