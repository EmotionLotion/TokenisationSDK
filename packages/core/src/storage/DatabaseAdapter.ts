/**
 * Database Adapters
 *
 * Pluggable database layer supporting:
 * - PostgreSQL (primary)
 * - MongoDB (document store)
 * - In-memory (testing)
 *
 * All adapters implement the same interface for easy swapping.
 */

import { ok, err, type Result } from '../core/types.js';
import { ValidationError } from '../errors/index.js';

// Note: pg and mongodb are optional peer dependencies
// They will be dynamically imported only when the corresponding adapter is used

// ============================================================================
// TYPES
// ============================================================================

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface WhereClause {
  [field: string]: unknown | { $gt?: unknown; $lt?: unknown; $gte?: unknown; $lte?: unknown; $in?: unknown[]; $ne?: unknown };
}

export interface DatabaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface IDatabaseAdapter {
  /** Connect to database */
  connect(): Promise<Result<void, string>>;

  /** Disconnect from database */
  disconnect(): Promise<Result<void, string>>;

  /** Check connection health */
  isConnected(): boolean;

  /** Insert a record */
  insert<T extends DatabaseRecord>(collection: string, record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<T, string>>;

  /** Find record by ID */
  findById<T extends DatabaseRecord>(collection: string, id: string): Promise<Result<T | null, string>>;

  /** Find records matching criteria */
  find<T extends DatabaseRecord>(collection: string, where?: WhereClause, options?: QueryOptions): Promise<Result<T[], string>>;

  /** Find one record matching criteria */
  findOne<T extends DatabaseRecord>(collection: string, where: WhereClause): Promise<Result<T | null, string>>;

  /** Update a record */
  update<T extends DatabaseRecord>(collection: string, id: string, updates: Partial<T>): Promise<Result<T, string>>;

  /** Delete a record */
  delete(collection: string, id: string): Promise<Result<boolean, string>>;

  /** Count records */
  count(collection: string, where?: WhereClause): Promise<Result<number, string>>;

  /** Execute raw query (database-specific) */
  raw<T>(query: string, params?: unknown[]): Promise<Result<T, string>>;

  /** Begin transaction */
  beginTransaction(): Promise<Result<ITransaction, string>>;
}

export interface ITransaction {
  commit(): Promise<Result<void, string>>;
  rollback(): Promise<Result<void, string>>;
  insert<T extends DatabaseRecord>(collection: string, record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<T, string>>;
  update<T extends DatabaseRecord>(collection: string, id: string, updates: Partial<T>): Promise<Result<T, string>>;
  delete(collection: string, id: string): Promise<Result<boolean, string>>;
}

// ============================================================================
// IN-MEMORY ADAPTER (Testing/Development)
// ============================================================================

export class InMemoryDatabaseAdapter implements IDatabaseAdapter {
  private collections: Map<string, Map<string, DatabaseRecord>> = new Map();
  private connected: boolean = false;

  async connect(): Promise<Result<void, string>> {
    this.connected = true;
    return ok(undefined);
  }

  async disconnect(): Promise<Result<void, string>> {
    this.connected = false;
    this.collections.clear();
    return ok(undefined);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private getCollection(name: string): Map<string, DatabaseRecord> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name)!;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  async insert<T extends DatabaseRecord>(
    collection: string,
    record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Result<T, string>> {
    const col = this.getCollection(collection);
    const now = new Date().toISOString();
    const newRecord = {
      ...record,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    } as T;
    col.set(newRecord.id, newRecord);
    return ok(newRecord);
  }

  async findById<T extends DatabaseRecord>(
    collection: string,
    id: string
  ): Promise<Result<T | null, string>> {
    const col = this.getCollection(collection);
    const record = col.get(id);
    return ok(record as T | null ?? null);
  }

  async find<T extends DatabaseRecord>(
    collection: string,
    where?: WhereClause,
    options?: QueryOptions
  ): Promise<Result<T[], string>> {
    const col = this.getCollection(collection);
    let results = Array.from(col.values()) as T[];

    // Apply where clause
    if (where) {
      results = results.filter(record => this.matchesWhere(record, where));
    }

    // Apply ordering
    if (options?.orderBy) {
      const dir = options.orderDirection === 'desc' ? -1 : 1;
      results.sort((a, b) => {
        const aVal = a[options.orderBy!] as string | number | boolean | null;
        const bVal = b[options.orderBy!] as string | number | boolean | null;
        if (aVal === null || aVal === undefined) return 1 * dir;
        if (bVal === null || bVal === undefined) return -1 * dir;
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }

    // Apply pagination
    if (options?.offset) {
      results = results.slice(options.offset);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return ok(results);
  }

  async findOne<T extends DatabaseRecord>(
    collection: string,
    where: WhereClause
  ): Promise<Result<T | null, string>> {
    const result = await this.find<T>(collection, where, { limit: 1 });
    if (!result.success) return result as Result<null, string>;
    return ok(result.data[0] ?? null);
  }

  async update<T extends DatabaseRecord>(
    collection: string,
    id: string,
    updates: Partial<T>
  ): Promise<Result<T, string>> {
    const col = this.getCollection(collection);
    const existing = col.get(id);
    if (!existing) {
      return err(`Record not found: ${id}`);
    }

    const updated = {
      ...existing,
      ...updates,
      id: existing.id, // Preserve ID
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt: new Date().toISOString(),
    } as T;
    col.set(id, updated);
    return ok(updated);
  }

  async delete(collection: string, id: string): Promise<Result<boolean, string>> {
    const col = this.getCollection(collection);
    const deleted = col.delete(id);
    return ok(deleted);
  }

  async count(collection: string, where?: WhereClause): Promise<Result<number, string>> {
    const result = await this.find(collection, where);
    if (!result.success) return err(result.error);
    return ok(result.data.length);
  }

  async raw<T>(_query: string, _params?: unknown[]): Promise<Result<T, string>> {
    return err('Raw queries not supported in memory adapter');
  }

  async beginTransaction(): Promise<Result<ITransaction, string>> {
    // Simple transaction simulation for in-memory
    return ok(new InMemoryTransaction(this));
  }

  private matchesWhere(record: DatabaseRecord, where: WhereClause): boolean {
    for (const [field, condition] of Object.entries(where)) {
      const value = record[field] as string | number | boolean | null | undefined;

      if (typeof condition === 'object' && condition !== null) {
        const cond = condition as { $gt?: unknown; $lt?: unknown; $gte?: unknown; $lte?: unknown; $in?: unknown[]; $ne?: unknown };
        if (cond.$gt !== undefined) {
          const gt = cond.$gt as string | number;
          if (!(value !== null && value !== undefined && value > gt)) return false;
        }
        if (cond.$lt !== undefined) {
          const lt = cond.$lt as string | number;
          if (!(value !== null && value !== undefined && value < lt)) return false;
        }
        if (cond.$gte !== undefined) {
          const gte = cond.$gte as string | number;
          if (!(value !== null && value !== undefined && value >= gte)) return false;
        }
        if (cond.$lte !== undefined) {
          const lte = cond.$lte as string | number;
          if (!(value !== null && value !== undefined && value <= lte)) return false;
        }
        if (cond.$in !== undefined && !cond.$in.includes(value)) return false;
        if (cond.$ne !== undefined && value === cond.$ne) return false;
      } else {
        if (value !== condition) return false;
      }
    }
    return true;
  }
}

class InMemoryTransaction implements ITransaction {
  private adapter: InMemoryDatabaseAdapter;
  private operations: Array<() => Promise<void>> = [];

  constructor(adapter: InMemoryDatabaseAdapter) {
    this.adapter = adapter;
  }

  async commit(): Promise<Result<void, string>> {
    // Operations already applied in memory
    return ok(undefined);
  }

  async rollback(): Promise<Result<void, string>> {
    // Would need snapshot for real rollback
    return ok(undefined);
  }

  async insert<T extends DatabaseRecord>(
    collection: string,
    record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Result<T, string>> {
    return this.adapter.insert(collection, record);
  }

  async update<T extends DatabaseRecord>(
    collection: string,
    id: string,
    updates: Partial<T>
  ): Promise<Result<T, string>> {
    return this.adapter.update(collection, id, updates);
  }

  async delete(collection: string, id: string): Promise<Result<boolean, string>> {
    return this.adapter.delete(collection, id);
  }
}

// ============================================================================
// POSTGRESQL ADAPTER (Configuration)
// ============================================================================

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
}

/**
 * PostgreSQL Adapter
 *
 * Requires `pg` package to be installed.
 * This is the interface - actual implementation needs the pg driver.
 */
export class PostgresDatabaseAdapter implements IDatabaseAdapter {
  private config: PostgresConfig;
  private pool: unknown; // pg.Pool
  private connected: boolean = false;

  constructor(config: PostgresConfig) {
    this.config = config;
  }

  async connect(): Promise<Result<void, string>> {
    try {
      // Dynamic import to avoid bundling pg if not used
      // @ts-ignore - pg is an optional peer dependency
      const { Pool } = await import('pg');
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        max: this.config.poolSize ?? 10,
      });

      // Test connection
      const client = await (this.pool as { connect: () => Promise<{ release: () => void }> }).connect();
      client.release();
      this.connected = true;
      return ok(undefined);
    } catch (error) {
      return err(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<Result<void, string>> {
    try {
      if (this.pool) {
        await (this.pool as { end: () => Promise<void> }).end();
      }
      this.connected = false;
      return ok(undefined);
    } catch (error) {
      return err(`Failed to disconnect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async insert<T extends DatabaseRecord>(
    collection: string,
    record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Result<T, string>> {
    try {
      const now = new Date().toISOString();
      const fields = Object.keys(record);
      const values = Object.values(record);
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');

      const query = `
        INSERT INTO ${collection} (${fields.join(', ')}, created_at, updated_at)
        VALUES (${placeholders}, $${fields.length + 1}, $${fields.length + 2})
        RETURNING *
      `;

      const result = await (this.pool as { query: (q: string, v: unknown[]) => Promise<{ rows: T[] }> })
        .query(query, [...values, now, now]);

      return ok(this.snakeToCamel(result.rows[0]) as T);
    } catch (error) {
      return err(`Insert failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findById<T extends DatabaseRecord>(
    collection: string,
    id: string
  ): Promise<Result<T | null, string>> {
    try {
      const query = `SELECT * FROM ${collection} WHERE id = $1`;
      const result = await (this.pool as { query: (q: string, v: unknown[]) => Promise<{ rows: T[] }> })
        .query(query, [id]);

      return ok(result.rows[0] ? this.snakeToCamel(result.rows[0]) as T : null);
    } catch (error) {
      return err(`Find failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async find<T extends DatabaseRecord>(
    collection: string,
    where?: WhereClause,
    options?: QueryOptions
  ): Promise<Result<T[], string>> {
    try {
      let query = `SELECT * FROM ${collection}`;
      const values: unknown[] = [];
      let paramIndex = 1;

      if (where && Object.keys(where).length > 0) {
        const conditions = Object.entries(where).map(([field, value]) => {
          const snakeField = this.camelToSnake(field);
          if (typeof value === 'object' && value !== null) {
            const cond = value as { $gt?: unknown; $lt?: unknown; $gte?: unknown; $lte?: unknown; $in?: unknown[]; $ne?: unknown };
            if (cond.$gt !== undefined) { values.push(cond.$gt); return `${snakeField} > $${paramIndex++}`; }
            if (cond.$lt !== undefined) { values.push(cond.$lt); return `${snakeField} < $${paramIndex++}`; }
            if (cond.$gte !== undefined) { values.push(cond.$gte); return `${snakeField} >= $${paramIndex++}`; }
            if (cond.$lte !== undefined) { values.push(cond.$lte); return `${snakeField} <= $${paramIndex++}`; }
            if (cond.$ne !== undefined) { values.push(cond.$ne); return `${snakeField} != $${paramIndex++}`; }
            if (cond.$in !== undefined) { values.push(cond.$in); return `${snakeField} = ANY($${paramIndex++})`; }
          }
          values.push(value);
          return `${snakeField} = $${paramIndex++}`;
        });
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      if (options?.orderBy) {
        query += ` ORDER BY ${this.camelToSnake(options.orderBy)} ${options.orderDirection ?? 'asc'}`;
      }

      if (options?.limit) {
        query += ` LIMIT ${options.limit}`;
      }

      if (options?.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      const result = await (this.pool as { query: (q: string, v: unknown[]) => Promise<{ rows: T[] }> })
        .query(query, values);

      return ok(result.rows.map(row => this.snakeToCamel(row) as T));
    } catch (error) {
      return err(`Find failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findOne<T extends DatabaseRecord>(
    collection: string,
    where: WhereClause
  ): Promise<Result<T | null, string>> {
    const result = await this.find<T>(collection, where, { limit: 1 });
    if (!result.success) return result as Result<null, string>;
    return ok(result.data[0] ?? null);
  }

  async update<T extends DatabaseRecord>(
    collection: string,
    id: string,
    updates: Partial<T>
  ): Promise<Result<T, string>> {
    try {
      const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'createdAt');
      const values = fields.map(f => updates[f as keyof T]);
      const setClause = fields.map((f, i) => `${this.camelToSnake(f)} = $${i + 1}`).join(', ');

      const query = `
        UPDATE ${collection}
        SET ${setClause}, updated_at = $${fields.length + 1}
        WHERE id = $${fields.length + 2}
        RETURNING *
      `;

      const result = await (this.pool as { query: (q: string, v: unknown[]) => Promise<{ rows: T[] }> })
        .query(query, [...values, new Date().toISOString(), id]);

      if (result.rows.length === 0) {
        return err(`Record not found: ${id}`);
      }

      return ok(this.snakeToCamel(result.rows[0]) as T);
    } catch (error) {
      return err(`Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(collection: string, id: string): Promise<Result<boolean, string>> {
    try {
      const query = `DELETE FROM ${collection} WHERE id = $1`;
      const result = await (this.pool as { query: (q: string, v: unknown[]) => Promise<{ rowCount: number }> })
        .query(query, [id]);
      return ok(result.rowCount > 0);
    } catch (error) {
      return err(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async count(collection: string, where?: WhereClause): Promise<Result<number, string>> {
    try {
      let query = `SELECT COUNT(*) as count FROM ${collection}`;
      const values: unknown[] = [];

      if (where && Object.keys(where).length > 0) {
        const conditions = Object.entries(where).map(([field, value], i) => {
          values.push(value);
          return `${this.camelToSnake(field)} = $${i + 1}`;
        });
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      const result = await (this.pool as { query: (q: string, v: unknown[]) => Promise<{ rows: [{ count: string }] }> })
        .query(query, values);

      return ok(parseInt(result.rows[0].count, 10));
    } catch (error) {
      return err(`Count failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async raw<T>(query: string, params?: unknown[]): Promise<Result<T, string>> {
    try {
      const result = await (this.pool as { query: (q: string, v?: unknown[]) => Promise<{ rows: T }> })
        .query(query, params);
      return ok(result.rows);
    } catch (error) {
      return err(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async beginTransaction(): Promise<Result<ITransaction, string>> {
    try {
      const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
      await (client as { query: (q: string) => Promise<void> }).query('BEGIN');
      return ok(new PostgresTransaction(client as unknown));
    } catch (error) {
      return err(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  private snakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = value;
    }
    return result;
  }
}

class PostgresTransaction implements ITransaction {
  private client: unknown;

  constructor(client: unknown) {
    this.client = client;
  }

  async commit(): Promise<Result<void, string>> {
    try {
      await (this.client as { query: (q: string) => Promise<void> }).query('COMMIT');
      (this.client as { release: () => void }).release();
      return ok(undefined);
    } catch (error) {
      return err(`Commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async rollback(): Promise<Result<void, string>> {
    try {
      await (this.client as { query: (q: string) => Promise<void> }).query('ROLLBACK');
      (this.client as { release: () => void }).release();
      return ok(undefined);
    } catch (error) {
      return err(`Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async insert<T extends DatabaseRecord>(
    _collection: string,
    _record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Result<T, string>> {
    return err('Transaction insert not implemented');
  }

  async update<T extends DatabaseRecord>(
    _collection: string,
    _id: string,
    _updates: Partial<T>
  ): Promise<Result<T, string>> {
    return err('Transaction update not implemented');
  }

  async delete(_collection: string, _id: string): Promise<Result<boolean, string>> {
    return err('Transaction delete not implemented');
  }
}

// ============================================================================
// MONGODB ADAPTER (Configuration)
// ============================================================================

export interface MongoConfig {
  uri: string;
  database: string;
}

/**
 * MongoDB Adapter
 *
 * Requires `mongodb` package to be installed.
 */
export class MongoDatabaseAdapter implements IDatabaseAdapter {
  private config: MongoConfig;
  private client: unknown;
  private db: unknown;
  private connected: boolean = false;

  constructor(config: MongoConfig) {
    this.config = config;
  }

  async connect(): Promise<Result<void, string>> {
    try {
      // @ts-ignore - mongodb is an optional peer dependency
      const { MongoClient } = await import('mongodb');
      this.client = new MongoClient(this.config.uri);
      await (this.client as { connect: () => Promise<void> }).connect();
      this.db = (this.client as { db: (name: string) => unknown }).db(this.config.database);
      this.connected = true;
      return ok(undefined);
    } catch (error) {
      return err(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<Result<void, string>> {
    try {
      if (this.client) {
        await (this.client as { close: () => Promise<void> }).close();
      }
      this.connected = false;
      return ok(undefined);
    } catch (error) {
      return err(`Failed to disconnect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private collection(name: string): unknown {
    return (this.db as { collection: (name: string) => unknown }).collection(name);
  }

  async insert<T extends DatabaseRecord>(
    collection: string,
    record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Result<T, string>> {
    try {
      const now = new Date().toISOString();
      const doc = {
        ...record,
        createdAt: now,
        updatedAt: now,
      };

      const result = await (this.collection(collection) as {
        insertOne: (doc: unknown) => Promise<{ insertedId: { toString: () => string } }>
      }).insertOne(doc);

      return ok({ ...doc, id: result.insertedId.toString() } as T);
    } catch (error) {
      return err(`Insert failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findById<T extends DatabaseRecord>(
    collection: string,
    id: string
  ): Promise<Result<T | null, string>> {
    try {
      // @ts-ignore - mongodb is an optional peer dependency
      const { ObjectId } = await import('mongodb');
      const doc = await (this.collection(collection) as {
        findOne: (filter: unknown) => Promise<T | null>
      }).findOne({ _id: new ObjectId(id) });

      if (!doc) return ok(null);
      return ok(this.transformDoc(doc) as T);
    } catch (error) {
      return err(`Find failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async find<T extends DatabaseRecord>(
    collection: string,
    where?: WhereClause,
    options?: QueryOptions
  ): Promise<Result<T[], string>> {
    try {
      const filter = this.buildMongoFilter(where ?? {});
      let cursor = (this.collection(collection) as {
        find: (filter: unknown) => {
          sort: (s: unknown) => unknown;
          skip: (n: number) => unknown;
          limit: (n: number) => unknown;
          toArray: () => Promise<T[]>;
        }
      }).find(filter);

      if (options?.orderBy) {
        cursor = cursor.sort({ [options.orderBy]: options.orderDirection === 'desc' ? -1 : 1 }) as typeof cursor;
      }
      if (options?.offset) {
        cursor = cursor.skip(options.offset) as typeof cursor;
      }
      if (options?.limit) {
        cursor = cursor.limit(options.limit) as typeof cursor;
      }

      const docs = await cursor.toArray();
      return ok(docs.map(doc => this.transformDoc(doc) as T));
    } catch (error) {
      return err(`Find failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findOne<T extends DatabaseRecord>(
    collection: string,
    where: WhereClause
  ): Promise<Result<T | null, string>> {
    try {
      const filter = this.buildMongoFilter(where);
      const doc = await (this.collection(collection) as {
        findOne: (filter: unknown) => Promise<T | null>
      }).findOne(filter);

      if (!doc) return ok(null);
      return ok(this.transformDoc(doc) as T);
    } catch (error) {
      return err(`Find failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async update<T extends DatabaseRecord>(
    collection: string,
    id: string,
    updates: Partial<T>
  ): Promise<Result<T, string>> {
    try {
      // @ts-ignore - mongodb is an optional peer dependency
      const { ObjectId } = await import('mongodb');
      const { id: _, createdAt: __, ...updateFields } = updates as Record<string, unknown>;

      const result = await (this.collection(collection) as {
        findOneAndUpdate: (
          filter: unknown,
          update: unknown,
          options: unknown
        ) => Promise<{ value: T | null }>
      }).findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...updateFields, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return err(`Record not found: ${id}`);
      }

      return ok(this.transformDoc(result.value) as T);
    } catch (error) {
      return err(`Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(collection: string, id: string): Promise<Result<boolean, string>> {
    try {
      // @ts-ignore - mongodb is an optional peer dependency
      const { ObjectId } = await import('mongodb');
      const result = await (this.collection(collection) as {
        deleteOne: (filter: unknown) => Promise<{ deletedCount: number }>
      }).deleteOne({ _id: new ObjectId(id) });

      return ok(result.deletedCount > 0);
    } catch (error) {
      return err(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async count(collection: string, where?: WhereClause): Promise<Result<number, string>> {
    try {
      const filter = this.buildMongoFilter(where ?? {});
      const count = await (this.collection(collection) as {
        countDocuments: (filter: unknown) => Promise<number>
      }).countDocuments(filter);

      return ok(count);
    } catch (error) {
      return err(`Count failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async raw<T>(query: string, _params?: unknown[]): Promise<Result<T, string>> {
    try {
      // MongoDB doesn't use SQL - this would need aggregation pipeline
      return err(`Raw queries not supported. Use aggregation pipeline instead. Query: ${query}`);
    } catch (error) {
      return err(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async beginTransaction(): Promise<Result<ITransaction, string>> {
    return err('MongoDB transactions require replica set - use session-based transactions');
  }

  private buildMongoFilter(where: WhereClause): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    for (const [field, condition] of Object.entries(where)) {
      if (typeof condition === 'object' && condition !== null) {
        const cond = condition as { $gt?: unknown; $lt?: unknown; $gte?: unknown; $lte?: unknown; $in?: unknown[]; $ne?: unknown };
        const mongoOp: Record<string, unknown> = {};
        if (cond.$gt !== undefined) mongoOp['$gt'] = cond.$gt;
        if (cond.$lt !== undefined) mongoOp['$lt'] = cond.$lt;
        if (cond.$gte !== undefined) mongoOp['$gte'] = cond.$gte;
        if (cond.$lte !== undefined) mongoOp['$lte'] = cond.$lte;
        if (cond.$in !== undefined) mongoOp['$in'] = cond.$in;
        if (cond.$ne !== undefined) mongoOp['$ne'] = cond.$ne;
        filter[field] = mongoOp;
      } else {
        filter[field] = condition;
      }
    }

    return filter;
  }

  private transformDoc(doc: Record<string, unknown>): Record<string, unknown> {
    const { _id, ...rest } = doc;
    return { id: _id?.toString(), ...rest };
  }
}

// ============================================================================
// DATABASE FACTORY
// ============================================================================

export type DatabaseType = 'memory' | 'postgres' | 'mongodb';

export function createDatabaseAdapter(
  type: 'memory'
): InMemoryDatabaseAdapter;
export function createDatabaseAdapter(
  type: 'postgres',
  config: PostgresConfig
): PostgresDatabaseAdapter;
export function createDatabaseAdapter(
  type: 'mongodb',
  config: MongoConfig
): MongoDatabaseAdapter;
export function createDatabaseAdapter(
  type: DatabaseType,
  config?: PostgresConfig | MongoConfig
): IDatabaseAdapter {
  switch (type) {
    case 'memory':
      return new InMemoryDatabaseAdapter();
    case 'postgres':
      if (!config) throw new ValidationError('PostgreSQL config required', {
        field: 'config',
        constraints: { required: 'true' },
      });
      return new PostgresDatabaseAdapter(config as PostgresConfig);
    case 'mongodb':
      if (!config) throw new ValidationError('MongoDB config required', {
        field: 'config',
        constraints: { required: 'true' },
      });
      return new MongoDatabaseAdapter(config as MongoConfig);
    default:
      throw new ValidationError(`Unknown database type: ${type}`, {
        field: 'type',
        constraints: { allowedValues: 'memory, postgres, mongodb' },
      });
  }
}

export default {
  InMemoryDatabaseAdapter,
  PostgresDatabaseAdapter,
  MongoDatabaseAdapter,
  createDatabaseAdapter,
};
