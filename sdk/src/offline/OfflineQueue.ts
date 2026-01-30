/**
 * IndexedDB-backed offline operation queue with in-memory fallback.
 *
 * Operations are stored persistently so they survive page reloads and can be
 * replayed when the network is restored.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperationPriority = 'high' | 'medium' | 'low';

export interface QueuedOperation {
  /** Unique identifier for this queued operation. */
  id: string;
  /** HTTP method. */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Target URL. */
  url: string;
  /** Serialised request body (JSON string or undefined). */
  body?: string;
  /** HTTP headers to attach on replay. */
  headers: Record<string, string>;
  /** Idempotency key – prevents duplicate creates on replay. */
  idempotencyKey: string;
  /** Priority bucket. Lower numeric value = higher priority. */
  priority: OperationPriority;
  /** ISO-8601 timestamp of when the operation was enqueued. */
  createdAt: string;
  /** How many times we have attempted to replay this operation. */
  retryCount: number;
}

const PRIORITY_VALUE: Record<OperationPriority, number> = {
  high: 1,
  medium: 5,
  low: 10,
};

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

interface QueueStorage {
  getAll(): Promise<QueuedOperation[]>;
  get(id: string): Promise<QueuedOperation | undefined>;
  put(op: QueuedOperation): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
  findByIdempotencyKey(key: string): Promise<QueuedOperation | undefined>;
}

// ---------------------------------------------------------------------------
// In-memory storage (fallback for non-browser / test environments)
// ---------------------------------------------------------------------------

class InMemoryStorage implements QueueStorage {
  private store = new Map<string, QueuedOperation>();

  async getAll(): Promise<QueuedOperation[]> {
    return Array.from(this.store.values());
  }

  async get(id: string): Promise<QueuedOperation | undefined> {
    return this.store.get(id);
  }

  async put(op: QueuedOperation): Promise<void> {
    this.store.set(op.id, op);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  async findByIdempotencyKey(key: string): Promise<QueuedOperation | undefined> {
    for (const op of this.store.values()) {
      if (op.idempotencyKey === key) return op;
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// IndexedDB storage
// ---------------------------------------------------------------------------

const DB_NAME = 'tokenisation_sdk_offline';
const DB_VERSION = 1;
const STORE_NAME = 'operations';

class IndexedDBStorage implements QueueStorage {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.open();
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('idempotencyKey', 'idempotencyKey', { unique: false });
          store.createIndex('priority', 'priority', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.dbPromise;
    const transaction = db.transaction(STORE_NAME, mode);
    return transaction.objectStore(STORE_NAME);
  }

  private wrap<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<QueuedOperation[]> {
    const store = await this.tx('readonly');
    return this.wrap(store.getAll());
  }

  async get(id: string): Promise<QueuedOperation | undefined> {
    const store = await this.tx('readonly');
    const result = await this.wrap(store.get(id));
    return result ?? undefined;
  }

  async put(op: QueuedOperation): Promise<void> {
    const store = await this.tx('readwrite');
    await this.wrap(store.put(op));
  }

  async delete(id: string): Promise<void> {
    const store = await this.tx('readwrite');
    await this.wrap(store.delete(id));
  }

  async clear(): Promise<void> {
    const store = await this.tx('readwrite');
    await this.wrap(store.clear());
  }

  async count(): Promise<number> {
    const store = await this.tx('readonly');
    return this.wrap(store.count());
  }

  async findByIdempotencyKey(key: string): Promise<QueuedOperation | undefined> {
    const store = await this.tx('readonly');
    const index = store.index('idempotencyKey');
    const result = await this.wrap(index.get(key));
    return result ?? undefined;
  }
}

// ---------------------------------------------------------------------------
// OfflineQueue
// ---------------------------------------------------------------------------

export interface OfflineQueueOptions {
  /** Force in-memory storage even in browser environments. */
  forceInMemory?: boolean;
}

export class OfflineQueue {
  private storage: QueueStorage;

  constructor(options: OfflineQueueOptions = {}) {
    const isBrowser =
      typeof window !== 'undefined' &&
      typeof indexedDB !== 'undefined';

    this.storage =
      isBrowser && !options.forceInMemory
        ? new IndexedDBStorage()
        : new InMemoryStorage();
  }

  /**
   * Add an operation to the queue.
   *
   * For POST / create operations the idempotency key is checked – if a queued
   * operation with the same key already exists the enqueue is rejected.
   * For updates (PUT/PATCH) the last write wins: an existing entry with the
   * same idempotency key is replaced.
   */
  async enqueue(
    operation: Omit<QueuedOperation, 'id' | 'createdAt' | 'retryCount'> & {
      id?: string;
      createdAt?: string;
      retryCount?: number;
    },
  ): Promise<QueuedOperation> {
    const existing = await this.storage.findByIdempotencyKey(operation.idempotencyKey);

    if (existing) {
      // Conflict resolution
      if (operation.method === 'POST') {
        throw new Error(
          `Duplicate idempotency key "${operation.idempotencyKey}" for POST operation. ` +
            'Cannot enqueue duplicate creates.',
        );
      }

      // Last-write-wins for updates
      const updated: QueuedOperation = {
        ...existing,
        method: operation.method,
        url: operation.url,
        body: operation.body,
        headers: operation.headers,
        priority: operation.priority,
        retryCount: operation.retryCount ?? existing.retryCount,
      };
      await this.storage.put(updated);
      return updated;
    }

    const op: QueuedOperation = {
      id: operation.id ?? generateId(),
      method: operation.method,
      url: operation.url,
      body: operation.body,
      headers: operation.headers,
      idempotencyKey: operation.idempotencyKey,
      priority: operation.priority,
      createdAt: operation.createdAt ?? new Date().toISOString(),
      retryCount: operation.retryCount ?? 0,
    };

    await this.storage.put(op);
    return op;
  }

  /**
   * Remove and return the highest-priority (then oldest) operation.
   */
  async dequeue(): Promise<QueuedOperation | undefined> {
    const all = await this.storage.getAll();
    if (all.length === 0) return undefined;

    const sorted = this.sortByPriority(all);
    const next = sorted[0];
    await this.storage.delete(next.id);
    return next;
  }

  /**
   * Return the highest-priority operation without removing it.
   */
  async peek(): Promise<QueuedOperation | undefined> {
    const all = await this.storage.getAll();
    if (all.length === 0) return undefined;
    return this.sortByPriority(all)[0];
  }

  /** Number of queued operations. */
  async size(): Promise<number> {
    return this.storage.count();
  }

  /** Remove all queued operations. */
  async clear(): Promise<void> {
    return this.storage.clear();
  }

  /** Return all operations sorted by priority then age. */
  async getAll(): Promise<QueuedOperation[]> {
    const all = await this.storage.getAll();
    return this.sortByPriority(all);
  }

  /** Increment the retry count for a given operation (by id). */
  async incrementRetry(id: string): Promise<void> {
    const op = await this.storage.get(id);
    if (op) {
      op.retryCount += 1;
      await this.storage.put(op);
    }
  }

  /** Remove a specific operation by id. */
  async remove(id: string): Promise<void> {
    await this.storage.delete(id);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private sortByPriority(ops: QueuedOperation[]): QueuedOperation[] {
    return ops.sort((a, b) => {
      const pa = PRIORITY_VALUE[a.priority] ?? 5;
      const pb = PRIORITY_VALUE[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;
      // Same priority – oldest first.
      return a.createdAt.localeCompare(b.createdAt);
    });
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export default OfflineQueue;
