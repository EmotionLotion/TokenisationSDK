
import { v4 as uuidv4 } from 'uuid';
import { IStoragePlugin, StorageMetadata } from '../core/interfaces.js';
import { Result, ok, err } from '../core/types.js';
import type { BrowserStorage, JsonSerializable } from '../types/common.types.js';

// Polyfill types for environment where DOM Lib might be missing
declare const localStorage: BrowserStorage | undefined;
export class BrowserStoragePlugin implements IStoragePlugin {
    readonly pluginId = 'browser-storage';
    readonly providerName = 'LocalStorage';
    private prefix: string;

    constructor(prefix: string = 'ahoy_storage_') {
        this.prefix = prefix;
    }

    // Helper to safely access localStorage
    private getStorage(): BrowserStorage | null {
        if (typeof localStorage !== 'undefined') return localStorage;
        return null;
    }

    async store(content: Buffer | string, filename?: string): Promise<Result<StorageMetadata, string>> {
        const storage = this.getStorage();
        if (!storage) return err('LocalStorage not available');

        try {
            const id = uuidv4();
            const contentStr = Buffer.isBuffer(content) ? content.toString('base64') : content;
            const size = contentStr.length;
            const mimeType = 'application/octet-stream'; // Simplified

            const metadata: StorageMetadata = {
                contentHash: id, // In a real system this would be a hash
                size,
                mimeType,
                uploadedAt: new Date().toISOString(),
                uri: `local://${id}`,
            };

            // Store content
            storage.setItem(`${this.prefix}${id}`, contentStr);
            // Store metadata
            storage.setItem(`${this.prefix}meta_${id}`, JSON.stringify(metadata));

            return ok(metadata);
        } catch (e) {
            return err(`Storage quota exceeded or write failed`);
        }
    }

    async retrieve(uri: string): Promise<Result<Buffer, string>> {
        const storage = this.getStorage();
        if (!storage) return err('LocalStorage not available');

        try {
            const id = uri.replace('local://', '');
            const item = storage.getItem(`${this.prefix}${id}`);

            if (!item) {
                return err('File not found');
            }

            // Try to return as buffer if possible, but for browser environment string might be safer
            // The interface asks for Buffer. In browser context, Buffer might need a polyfill or we return string pretending to be buffer
            // For this MVP SDK, we'll assume the caller handles the string/buffer conversion or we use a basic Buffer polyfill if present.
            // Since this is a specialized environment, we'll return the string cast as any for now, or construct a Buffer if available.

            // Try to decode base64 content
            // In Node.js environments, use Buffer directly
            // In browser environments, use atob + Uint8Array
            if (typeof Buffer !== 'undefined') {
                return ok(Buffer.from(item, 'base64'));
            }

            // In browser environments without Buffer, decode base64 manually
            // Note: This returns the raw string as a Buffer-like Uint8Array
            // Callers should handle this appropriately
            const binaryString = atob(item);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            // Create a minimal Buffer-like object for compatibility
            return ok(bytes as unknown as Buffer);

        } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error(String(e));
            return err(`Failed to load: ${error.message}`);
        }
    }

    async save(key: string, data: JsonSerializable): Promise<void> {
        if (typeof localStorage === 'undefined') return;
        try {
            const serialized = JSON.stringify(data);
            localStorage.setItem(`${this.prefix}${key}`, serialized);
        } catch (e) {
            // Handle error if localStorage fails, e.g., quota exceeded
            console.error(`Failed to save to localStorage: ${e}`);
        }
    }

    async pin(uri: string): Promise<Result<void, string>> {
        // LocalStorage is already "pinned" by definition
        return ok(undefined);
    }

    async unpin(uri: string): Promise<Result<void, string>> {
        const storage = this.getStorage();
        if (!storage) return ok(undefined);
        // We treat unpin as delete in this simple model
        const id = uri.replace('local://', '');
        storage.removeItem(`${this.prefix}${id}`);
        storage.removeItem(`${this.prefix}meta_${id}`);
        return ok(undefined);
    }

    async exists(uri: string): Promise<boolean> {
        const storage = this.getStorage();
        if (!storage) return false;
        const id = uri.replace('local://', '');
        return storage.getItem(`${this.prefix}${id}`) !== null;
    }

    async getMetadata(uri: string): Promise<Result<StorageMetadata, string>> {
        const storage = this.getStorage();
        if (!storage) return err('LocalStorage not available');

        try {
            const id = uri.replace('local://', '');
            const metaStr = storage.getItem(`${this.prefix}meta_${id}`);

            if (!metaStr) return err('Metadata not found');

            return ok(JSON.parse(metaStr) as StorageMetadata);
        } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error(String(e));
            return err(error.message);
        }
    }
}
