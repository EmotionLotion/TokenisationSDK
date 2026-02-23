/**
 * Storage Plugins Module
 *
 * Exports storage plugin implementations for S3 and IPFS.
 * These plugins implement the IStoragePlugin interface for direct
 * cloud storage operations from the SDK.
 */

export { S3StoragePlugin, type S3StoragePluginConfig } from './S3StoragePlugin.js';
export { IPFSStoragePlugin, type IPFSStoragePluginConfig } from './IPFSStoragePlugin.js';
