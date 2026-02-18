/**
 * Test setup: runs before/after all test files.
 *
 * Initializes the in-memory SQLite instance (via vitest.config.ts env vars)
 * and ensures clean shutdown after all tests complete.
 */

import { beforeAll, afterAll } from 'vitest';
import { closePool } from '../config/database.js';

beforeAll(() => {
  // DB auto-initializes via database.ts on import (DB_MODE=sqlite, SQLITE_PATH=:memory:)
});

afterAll(async () => {
  // Close DB connection pool cleanly to prevent hanging handles
  await closePool();
});
