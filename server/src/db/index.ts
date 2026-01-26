// Re-export database and schema based on mode
export { db, testConnection, getDbMode, schema } from '../config/database.js';

// For SQLite, we use raw SQL for complex queries
// For PostgreSQL, we use Drizzle's query builder

import { db, getDbMode } from '../config/database.js';
import { sql } from 'drizzle-orm';

const DB_MODE = getDbMode();

// Helper to generate UUID
export function generateId(): string {
  return crypto.randomUUID();
}

// Helper to get current timestamp
export function now(): string {
  return new Date().toISOString();
}

// Pagination helper
export interface PaginationParams {
  page: number;
  limit: number;
}

export function paginate(params: PaginationParams) {
  return {
    offset: (params.page - 1) * params.limit,
    limit: params.limit,
  };
}
