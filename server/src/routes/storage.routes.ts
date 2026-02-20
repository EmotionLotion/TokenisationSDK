/**
 * Storage Routes
 *
 * Provides IPFS upload relay endpoint. The client uploads files to this server
 * endpoint, which then pins them to Pinata/IPFS and returns the real CID.
 */

import { Router } from 'express';
import { IPFSStorageAdapter } from '../services/storage/ipfs.adapter.js';
import { ValidationError, UnauthorizedError } from '../middleware/errorHandler.js';
import { logger } from '../middleware/logger.js';

export const storageRouter = Router();

// POST /ipfs/upload/:uploadId — IPFS upload relay
storageRouter.post('/ipfs/upload/:uploadId', async (req, res, next) => {
  try {
    const { uploadId } = req.params;
    const orgId = (req as any).apiKey?.orgId || (req as any).orgId;
    if (!orgId) throw new UnauthorizedError('Organization required');

    // Collect the request body as a buffer
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks);

    if (content.length === 0) {
      throw new ValidationError('No file content provided');
    }

    const ipfsAdapter = new IPFSStorageAdapter();
    const fileName = req.headers['x-file-name'] as string || 'upload';
    const result = await ipfsAdapter.pinContent(content, fileName, orgId);

    logger.info('IPFS upload completed', {
      metadata: { uploadId, cid: result.cid, size: result.size, orgId },
    });

    res.json({
      cid: result.cid,
      uri: result.uri,
      size: result.size,
    });
  } catch (error) {
    next(error);
  }
});
