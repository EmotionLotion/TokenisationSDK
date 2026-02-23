/**
 * Common Type Definitions
 *
 * Shared types used across the SDK to eliminate `any` usage.
 */

// ============================================================================
// JSON TYPES
// ============================================================================

/**
 * JSON primitive types
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON object type
 */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * JSON array type
 */
export type JsonArray = JsonValue[];

/**
 * Any valid JSON value
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * A value that can be serialized to JSON
 */
export type JsonSerializable = JsonValue;

// ============================================================================
// METADATA TYPES
// ============================================================================

/**
 * Base metadata structure
 */
export interface BaseMetadata {
  [key: string]: unknown;
}

/**
 * Typed metadata with required fields
 */
export interface TypedMetadata<T extends Record<string, unknown> = Record<string, unknown>> {
  data: T;
  version?: number;
  updatedAt?: string;
}

// ============================================================================
// DECORATOR TYPES
// ============================================================================

/**
 * Function type for decorators
 */
export type DecoratorTarget = (...args: unknown[]) => unknown;

/**
 * Async function type for decorators
 */
export type AsyncDecoratorTarget<T = unknown> = (...args: unknown[]) => Promise<T>;

/**
 * Method decorator function signature
 */
export type MethodDecorator<T = unknown> = (
  target: object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<T>
) => TypedPropertyDescriptor<T> | void;

/**
 * Class decorator function signature
 */
export type ClassDecorator<T extends new (...args: unknown[]) => object> = (
  target: T
) => T | void;

// ============================================================================
// FUNCTION TYPES
// ============================================================================

/**
 * Generic async function type
 */
export type AsyncFunction<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

/**
 * Generic sync function type
 */
export type SyncFunction<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  ...args: TArgs
) => TResult;

/**
 * Callback function type
 */
export type Callback<T = void, E = Error> = (error: E | null, result?: T) => void;

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/**
 * Event subscription cleanup function
 */
export type Unsubscribe = () => void;

// ============================================================================
// STORAGE TYPES
// ============================================================================

/**
 * Browser storage interface (for environments without DOM types)
 */
export interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  readonly length: number;
  key(index: number): string | null;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Make all properties of T optional and nullable
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make specified keys of T required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Extract the element type of an array
 */
export type ElementType<T extends readonly unknown[]> = T extends readonly (infer E)[] ? E : never;

/**
 * Type guard function signature
 */
export type TypeGuard<T> = (value: unknown) => value is T;

/**
 * Dictionary/Record with string keys
 */
export type Dictionary<T> = Record<string, T>;

/**
 * Non-empty array type
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Promise or value type
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Constructor type
 */
export type Constructor<T = object, TArgs extends unknown[] = unknown[]> = new (
  ...args: TArgs
) => T;

/**
 * Abstract constructor type
 */
export type AbstractConstructor<T = object> = abstract new (...args: unknown[]) => T;
