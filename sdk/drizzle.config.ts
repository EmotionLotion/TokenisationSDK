import type { Config } from 'drizzle-kit';

export default {
  schema: './src/storage/postgres/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tokenisation',
  },
} satisfies Config;
