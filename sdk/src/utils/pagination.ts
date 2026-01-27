/**
 * Pagination Utilities
 *
 * Provides helpers for working with paginated API responses:
 * - Cursor-based pagination iterator
 * - Page-based pagination helper
 * - Utility to collect all pages
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Standard paginated response structure
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total?: number;
    limit: number;
    offset?: number;
    page?: number;
    totalPages?: number;
    hasMore: boolean;
    nextCursor?: string;
    prevCursor?: string;
  };
}

/**
 * Page info for page-based pagination
 */
export interface PageInfo {
  page: number;
  limit: number;
  total?: number;
  totalPages?: number;
  hasMore: boolean;
}

/**
 * Options for pagination helpers
 */
export interface PaginationOptions {
  /** Maximum number of items to fetch (across all pages) */
  maxItems?: number;

  /** Maximum number of pages to fetch */
  maxPages?: number;

  /** Delay between page fetches (ms) */
  delayMs?: number;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

// ============================================================================
// CURSOR-BASED PAGINATION
// ============================================================================

/**
 * Async generator for cursor-based pagination
 * Yields items one at a time from all pages
 *
 * @example
 * ```typescript
 * for await (const investor of paginate((cursor) =>
 *   api.investors.list({ cursor, limit: 100 })
 * )) {
 *   console.log(investor.name);
 * }
 * ```
 */
export async function* paginate<T>(
  fetcher: (cursor?: string) => Promise<PaginatedResponse<T>>,
  options: PaginationOptions = {}
): AsyncGenerator<T, void, undefined> {
  const { maxItems, maxPages, delayMs, signal } = options;

  let cursor: string | undefined;
  let itemCount = 0;
  let pageCount = 0;

  do {
    // Check for abort
    if (signal?.aborted) {
      return;
    }

    // Check page limit
    if (maxPages !== undefined && pageCount >= maxPages) {
      return;
    }

    // Fetch the next page
    const response = await fetcher(cursor);
    pageCount++;

    // Yield each item
    for (const item of response.data) {
      // Check item limit
      if (maxItems !== undefined && itemCount >= maxItems) {
        return;
      }

      yield item;
      itemCount++;
    }

    // Get next cursor
    cursor = response.pagination.nextCursor;

    // Add delay if specified
    if (delayMs && cursor) {
      await sleep(delayMs);
    }
  } while (cursor);
}

/**
 * Collect all items from a paginated endpoint
 * Fetches all pages and returns a single array
 *
 * @example
 * ```typescript
 * const allInvestors = await collectAll(
 *   (cursor) => api.investors.list({ cursor, limit: 100 }),
 *   { maxItems: 1000 }
 * );
 * ```
 */
export async function collectAll<T>(
  fetcher: (cursor?: string) => Promise<PaginatedResponse<T>>,
  options: PaginationOptions = {}
): Promise<T[]> {
  const items: T[] = [];

  for await (const item of paginate(fetcher, options)) {
    items.push(item);
  }

  return items;
}

/**
 * Collect items into batches
 * Useful for processing large datasets in chunks
 *
 * @example
 * ```typescript
 * for await (const batch of collectBatches(
 *   (cursor) => api.investors.list({ cursor, limit: 100 }),
 *   50  // process in batches of 50
 * )) {
 *   await processBatch(batch);
 * }
 * ```
 */
export async function* collectBatches<T>(
  fetcher: (cursor?: string) => Promise<PaginatedResponse<T>>,
  batchSize: number,
  options: PaginationOptions = {}
): AsyncGenerator<T[], void, undefined> {
  let batch: T[] = [];

  for await (const item of paginate(fetcher, options)) {
    batch.push(item);

    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
  }

  // Yield remaining items
  if (batch.length > 0) {
    yield batch;
  }
}

// ============================================================================
// PAGE-BASED PAGINATION
// ============================================================================

/**
 * Page-based paginator class
 * Provides a more traditional pagination interface
 *
 * @example
 * ```typescript
 * const paginator = new Paginator((page, limit) =>
 *   api.tokens.list({ page, limit })
 * );
 *
 * // Get specific page
 * const page1 = await paginator.getPage(1);
 *
 * // Iterate all items
 * for await (const token of paginator) {
 *   console.log(token);
 * }
 *
 * // Get all items as array
 * const allTokens = await paginator.toArray();
 * ```
 */
export class Paginator<T> {
  private readonly fetcher: (page: number, limit: number) => Promise<PaginatedResponse<T>>;
  private readonly defaultLimit: number;
  private readonly options: PaginationOptions;

  constructor(
    fetcher: (page: number, limit: number) => Promise<PaginatedResponse<T>>,
    options: { limit?: number } & PaginationOptions = {}
  ) {
    this.fetcher = fetcher;
    this.defaultLimit = options.limit ?? 50;
    this.options = options;
  }

  /**
   * Get a specific page
   */
  async getPage(page: number, limit: number = this.defaultLimit): Promise<T[]> {
    const response = await this.fetcher(page, limit);
    return response.data;
  }

  /**
   * Get page info for a specific page
   */
  async getPageInfo(page: number, limit: number = this.defaultLimit): Promise<PageInfo> {
    const response = await this.fetcher(page, limit);
    return {
      page,
      limit,
      total: response.pagination.total,
      totalPages: response.pagination.totalPages,
      hasMore: response.pagination.hasMore,
    };
  }

  /**
   * Iterate over all items
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    const { maxItems, maxPages, delayMs, signal } = this.options;

    let page = 1;
    let itemCount = 0;
    let hasMore = true;

    while (hasMore) {
      // Check for abort
      if (signal?.aborted) {
        return;
      }

      // Check page limit
      if (maxPages !== undefined && page > maxPages) {
        return;
      }

      const response = await this.fetcher(page, this.defaultLimit);

      for (const item of response.data) {
        // Check item limit
        if (maxItems !== undefined && itemCount >= maxItems) {
          return;
        }

        yield item;
        itemCount++;
      }

      hasMore = response.pagination.hasMore;
      page++;

      // Add delay if specified
      if (delayMs && hasMore) {
        await sleep(delayMs);
      }
    }
  }

  /**
   * Collect all items into an array
   */
  async toArray(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      items.push(item);
    }
    return items;
  }

  /**
   * Get the first N items
   */
  async take(n: number): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      items.push(item);
      if (items.length >= n) {
        break;
      }
    }
    return items;
  }

  /**
   * Find the first item matching a predicate
   */
  async find(predicate: (item: T) => boolean): Promise<T | undefined> {
    for await (const item of this) {
      if (predicate(item)) {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Filter items across all pages
   */
  async filter(predicate: (item: T) => boolean): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      if (predicate(item)) {
        items.push(item);
      }
    }
    return items;
  }

  /**
   * Map items across all pages
   */
  async map<U>(mapper: (item: T) => U): Promise<U[]> {
    const items: U[] = [];
    for await (const item of this) {
      items.push(mapper(item));
    }
    return items;
  }

  /**
   * Count all items
   */
  async count(): Promise<number> {
    // Try to get total from first page
    const response = await this.fetcher(1, 1);
    if (response.pagination.total !== undefined) {
      return response.pagination.total;
    }

    // Otherwise count manually
    let count = 0;
    for await (const _ of this) {
      count++;
    }
    return count;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a cursor-based fetcher from an API client method
 */
export function createCursorFetcher<T, P extends Record<string, any>>(
  method: (params: P) => Promise<PaginatedResponse<T>>,
  baseParams: Omit<P, 'cursor'>
): (cursor?: string) => Promise<PaginatedResponse<T>> {
  return (cursor?: string) => method({ ...baseParams, cursor } as P);
}

/**
 * Create a page-based fetcher from an API client method
 */
export function createPageFetcher<T, P extends Record<string, any>>(
  method: (params: P) => Promise<PaginatedResponse<T>>,
  baseParams: Omit<P, 'page' | 'limit'>
): (page: number, limit: number) => Promise<PaginatedResponse<T>> {
  return (page: number, limit: number) =>
    method({ ...baseParams, page, limit } as P);
}

/**
 * Sleep utility for delays between requests
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export { sleep };
