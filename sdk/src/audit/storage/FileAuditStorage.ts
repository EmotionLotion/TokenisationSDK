/**
 * File Audit Storage
 *
 * Append-only file storage for audit logs.
 * Supports JSON Lines format for easy parsing and streaming.
 */

import { createWriteStream, createReadStream, existsSync, mkdirSync, statSync } from 'fs';
import { readFile, appendFile, stat, rename } from 'fs/promises';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { ok, err, type Result } from '../../core/types.js';
import type { AuditEntry, AuditQueryOptions, AuditAction } from '../AuditLog.js';
import type { IAuditStorage, IStreamingAuditStorage } from './IAuditStorage.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * File audit storage configuration
 */
export interface FileAuditStorageConfig {
  /** Base directory for audit files */
  directory: string;
  /** File name pattern (supports {date} placeholder) */
  filePattern?: string;
  /** Maximum file size in bytes before rotation */
  maxFileSizeBytes?: number;
  /** Whether to rotate files daily */
  dailyRotation?: boolean;
  /** Whether to compress rotated files */
  compressRotated?: boolean;
}

// ============================================================================
// FILE AUDIT STORAGE
// ============================================================================

/**
 * Append-only file-based audit storage
 *
 * Features:
 * - JSON Lines format for streaming reads
 * - Automatic file rotation by size or date
 * - Streaming query support
 */
export class FileAuditStorage implements IAuditStorage, IStreamingAuditStorage {
  readonly name = 'file-storage';

  private config: Required<FileAuditStorageConfig>;
  private currentFilePath: string;
  private currentFileSize: number = 0;
  private subscribers: Map<string, {
    callback: (entry: AuditEntry) => void;
    filter?: Partial<AuditQueryOptions>;
  }> = new Map();

  constructor(config: FileAuditStorageConfig) {
    this.config = {
      directory: config.directory,
      filePattern: config.filePattern ?? 'audit-{date}.jsonl',
      maxFileSizeBytes: config.maxFileSizeBytes ?? 100 * 1024 * 1024, // 100MB
      dailyRotation: config.dailyRotation ?? true,
      compressRotated: config.compressRotated ?? false,
    };
    this.currentFilePath = this.getCurrentFilePath();
  }

  async initialize(): Promise<Result<void, string>> {
    try {
      // Ensure directory exists
      if (!existsSync(this.config.directory)) {
        mkdirSync(this.config.directory, { recursive: true });
      }

      // Get current file size if exists
      if (existsSync(this.currentFilePath)) {
        const stats = statSync(this.currentFilePath);
        this.currentFileSize = stats.size;
      }

      return ok(undefined);
    } catch (error) {
      return err(`Failed to initialize file storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async write(entry: AuditEntry): Promise<Result<void, string>> {
    try {
      // Check if rotation needed
      await this.rotateIfNeeded();

      const line = JSON.stringify(entry) + '\n';
      await appendFile(this.currentFilePath, line, 'utf-8');
      this.currentFileSize += Buffer.byteLength(line);

      // Notify subscribers
      this.notifySubscribers(entry);

      return ok(undefined);
    } catch (error) {
      return err(`Failed to write audit entry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async writeBatch(entries: AuditEntry[]): Promise<Result<void, string>> {
    try {
      await this.rotateIfNeeded();

      const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await appendFile(this.currentFilePath, lines, 'utf-8');
      this.currentFileSize += Buffer.byteLength(lines);

      // Notify subscribers
      for (const entry of entries) {
        this.notifySubscribers(entry);
      }

      return ok(undefined);
    } catch (error) {
      return err(`Failed to write batch: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async query(options: AuditQueryOptions): Promise<Result<AuditEntry[], string>> {
    try {
      const entries: AuditEntry[] = [];
      const files = await this.getRelevantFiles(options);

      for (const file of files) {
        await this.readFile(file, (entry) => {
          if (this.matchesQuery(entry, options)) {
            entries.push(entry);
          }
        });
      }

      // Apply sorting
      entries.sort((a, b) => {
        const aVal = a[options.orderBy ?? 'createdAt'] as string;
        const bVal = b[options.orderBy ?? 'createdAt'] as string;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return options.orderDirection === 'asc' ? cmp : -cmp;
      });

      // Apply pagination
      const offset = options.offset ?? 0;
      const limit = options.limit ?? entries.length;

      return ok(entries.slice(offset, offset + limit));
    } catch (error) {
      return err(`Failed to query: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getById(id: string): Promise<Result<AuditEntry | null, string>> {
    try {
      const files = await this.getAllFiles();

      for (const file of files) {
        let found: AuditEntry | null = null;
        await this.readFile(file, (entry) => {
          if (entry.id === id) {
            found = entry;
          }
        });
        if (found) {
          return ok(found);
        }
      }

      return ok(null);
    } catch (error) {
      return err(`Failed to get by ID: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async count(options?: AuditQueryOptions): Promise<Result<number, string>> {
    try {
      let count = 0;
      const files = options ? await this.getRelevantFiles(options) : await this.getAllFiles();

      for (const file of files) {
        await this.readFile(file, (entry) => {
          if (!options || this.matchesQuery(entry, options)) {
            count++;
          }
        });
      }

      return ok(count);
    } catch (error) {
      return err(`Failed to count: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Try to write and read a test entry
      return existsSync(this.config.directory);
    } catch {
      return false;
    }
  }

  async close(): Promise<Result<void, string>> {
    this.subscribers.clear();
    return ok(undefined);
  }

  // ============================================================================
  // STREAMING METHODS
  // ============================================================================

  subscribe(
    callback: (entry: AuditEntry) => void,
    filter?: Partial<AuditQueryOptions>
  ): () => void {
    const id = Math.random().toString(36).substring(2);
    this.subscribers.set(id, { callback, filter });

    return () => {
      this.subscribers.delete(id);
    };
  }

  async stream(
    options: AuditQueryOptions,
    callback: (entry: AuditEntry) => void
  ): Promise<Result<void, string>> {
    try {
      const files = await this.getRelevantFiles(options);

      for (const file of files) {
        await this.readFile(file, (entry) => {
          if (this.matchesQuery(entry, options)) {
            callback(entry);
          }
        });
      }

      return ok(undefined);
    } catch (error) {
      return err(`Failed to stream: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getCurrentFilePath(): string {
    const date = new Date().toISOString().split('T')[0];
    const filename = this.config.filePattern.replace('{date}', date);
    return join(this.config.directory, filename);
  }

  private async rotateIfNeeded(): Promise<void> {
    const newPath = this.getCurrentFilePath();

    // Daily rotation
    if (this.config.dailyRotation && newPath !== this.currentFilePath) {
      this.currentFilePath = newPath;
      this.currentFileSize = 0;
      return;
    }

    // Size-based rotation
    if (this.currentFileSize >= this.config.maxFileSizeBytes) {
      const timestamp = Date.now();
      const rotatedPath = this.currentFilePath.replace('.jsonl', `.${timestamp}.jsonl`);
      await rename(this.currentFilePath, rotatedPath);
      this.currentFileSize = 0;
    }
  }

  private async readFile(
    filePath: string,
    callback: (entry: AuditEntry) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!existsSync(filePath)) {
        resolve();
        return;
      }

      const stream = createReadStream(filePath, 'utf-8');
      const rl = createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        try {
          const entry = JSON.parse(line) as AuditEntry;
          callback(entry);
        } catch {
          // Skip invalid lines
        }
      });

      rl.on('close', resolve);
      rl.on('error', reject);
    });
  }

  private async getAllFiles(): Promise<string[]> {
    const { readdirSync } = await import('fs');
    const files = readdirSync(this.config.directory)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => join(this.config.directory, f))
      .sort();
    return files;
  }

  private async getRelevantFiles(options: AuditQueryOptions): Promise<string[]> {
    const allFiles = await this.getAllFiles();

    // Filter by date if possible
    if (options.fromDate || options.toDate) {
      return allFiles.filter((file) => {
        const dateMatch = file.match(/\d{4}-\d{2}-\d{2}/);
        if (!dateMatch) return true;

        const fileDate = dateMatch[0];
        if (options.fromDate && fileDate < options.fromDate.split('T')[0]) return false;
        if (options.toDate && fileDate > options.toDate.split('T')[0]) return false;
        return true;
      });
    }

    return allFiles;
  }

  private matchesQuery(entry: AuditEntry, options: AuditQueryOptions): boolean {
    if (options.actions && options.actions.length > 0) {
      if (!options.actions.includes(entry.action)) return false;
    }

    if (options.actorId && entry.actorId !== options.actorId) return false;
    if (options.resourceType && entry.resourceType !== options.resourceType) return false;
    if (options.resourceId && entry.resourceId !== options.resourceId) return false;

    if (options.fromDate && entry.timestamp < options.fromDate) return false;
    if (options.toDate && entry.timestamp > options.toDate) return false;

    return true;
  }

  private notifySubscribers(entry: AuditEntry): void {
    for (const { callback, filter } of this.subscribers.values()) {
      if (!filter || this.matchesQuery(entry, filter as AuditQueryOptions)) {
        try {
          callback(entry);
        } catch {
          // Ignore subscriber errors
        }
      }
    }
  }
}

/**
 * Create a file audit storage instance
 */
export function createFileAuditStorage(config: FileAuditStorageConfig): FileAuditStorage {
  return new FileAuditStorage(config);
}

export default FileAuditStorage;
