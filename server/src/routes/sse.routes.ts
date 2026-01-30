import { Router, Response, NextFunction } from 'express';
import { sseService } from '../services/sse.service.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import { ValidationError } from '../middleware/errorHandler.js';

export const sseRouter = Router();

// ============================================================================
// SSE Stream Endpoint
// ============================================================================

/**
 * GET /api/v1/events/stream?topics=transfer.*,token.*
 *
 * Opens a persistent SSE connection for the authenticated organisation.
 * Events are filtered by the comma-separated `topics` query parameter.
 * If no topics are provided, all events for the org are streamed.
 *
 * Headers set:
 *   Content-Type: text/event-stream
 *   Cache-Control: no-cache
 *   Connection: keep-alive
 *   X-Accel-Buffering: no   (disables Nginx buffering)
 */
sseRouter.get('/stream', apiKeyMiddleware, (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const orgId = req.apiKey.orgId;

    // Parse topic filters from query string
    const topicsParam = req.query.topics as string | undefined;
    const topics = topicsParam
      ? topicsParam.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    // Validate topic patterns
    for (const topic of topics) {
      if (!/^[a-z_]+(\.[a-z_*]+)*$/.test(topic) && topic !== '*') {
        throw new ValidationError(`Invalid topic pattern: ${topic}`);
      }
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Flush headers immediately
    res.flushHeaders();

    // Send initial connected comment
    res.write(': connected\n\n');

    // Register connection with SSE service
    const connection = sseService.addConnection(orgId, res, topics);

    // Send connection metadata as first event
    res.write(`event: connection.established\n`);
    res.write(`data: ${JSON.stringify({
      connectionId: connection.id,
      topics,
      connectedAt: connection.connectedAt.toISOString(),
    })}\n\n`);

    // Cleanup is handled inside sseService.addConnection via res.on('close')
    // Keep the request open - do NOT call next() or res.end()
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Connection Stats Endpoint
// ============================================================================

/**
 * GET /api/v1/events/stats
 *
 * Returns the number of active SSE connections for the authenticated organisation.
 */
sseRouter.get('/stats', apiKeyMiddleware, (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const orgId = req.apiKey.orgId;
    const count = sseService.getConnectionCount(orgId);

    res.json({
      orgId,
      activeConnections: count,
    });
  } catch (error) {
    next(error);
  }
});
