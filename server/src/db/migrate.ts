import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { logger } from '../middleware/logger.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://ahoy:ahoy_dev_password@localhost:5432/ahoy_tokenisation',
});

async function migrate() {
  logger.info('Running database migrations...\n');

  const client = await pool.connect();

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get executed migrations
    const { rows: executed } = await client.query('SELECT name FROM _migrations ORDER BY id');
    const executedNames = new Set(executed.map(r => r.name));

    // Get migration files
    const migrationsDir = join(__dirname, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;

    for (const file of files) {
      if (executedNames.has(file)) {
        logger.info(`  [skip] ${file} (already executed)`);
        continue;
      }

      logger.info(`  [run]  ${file}`);

      const sql = readFileSync(join(migrationsDir, file), 'utf-8');

      await client.query('BEGIN');

      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count++;
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`\n  [FAIL] Migration ${file} failed:`, { error: error as Error });
        throw error;
      }
    }

    logger.info(`\nMigrations complete. ${count} migration(s) executed.`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  logger.error('Migration failed:', { error: err as Error });
  process.exit(1);
});
