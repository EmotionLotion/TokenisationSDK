/**
 * Metrics Routes
 *
 * Returns real dashboard metrics from the database.
 */

import { Router, Response, NextFunction } from 'express';
import { db, schema } from '../config/database.js';
import { eq, sql } from 'drizzle-orm';
import type { ApiKeyRequest } from '../middleware/auth.js';
import { logger } from '../middleware/logger.js';

export const metricsRouter = Router();

const { tokens, investors, transfers, assets, airlineTickets } = schema;

// GET /api/v1/metrics - Dashboard metrics
metricsRouter.get('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.apiKey!.orgId;

    const [
      tokenCount,
      investorCount,
      transferCount,
      assetCount,
      ticketCount,
      hotelCount,
      carRentalCount,
      concertCount,
    ] = await Promise.all([
      countTable(schema.tokens, orgId),
      countTable(schema.investors, orgId),
      countTable(schema.transfers, orgId),
      countTable(schema.assets, orgId),
      countTable(schema.airlineTickets, orgId),
      safeCountTable('hotelReservations', orgId),
      safeCountTable('carRentals', orgId),
      safeCountTable('concertTickets', orgId),
    ]);

    res.json({
      data: {
        tokens: tokenCount,
        investors: investorCount,
        transfers: transferCount,
        assets: assetCount,
        airlineTickets: ticketCount,
        hotelReservations: hotelCount,
        carRentals: carRentalCount,
        concertTickets: concertCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

async function countTable(table: any, orgId: string): Promise<number> {
  try {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(table)
      .where(eq(table.orgId, orgId));
    return Number(result[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function safeCountTable(tableName: string, orgId: string): Promise<number> {
  try {
    const table = (schema as any)[tableName];
    if (!table) return 0;
    return countTable(table, orgId);
  } catch {
    return 0;
  }
}
