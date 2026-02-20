/**
 * GDPR Data Retention Routes
 */
import { Router } from 'express';
import { apiKeyMiddleware, ApiKeyRequest } from '../middleware/auth.js';
import * as dataRetention from '../services/data-retention.service.js';

const gdprRouter = Router();

// All routes require API key auth
gdprRouter.use(apiKeyMiddleware as any);

// List retention policies
gdprRouter.get('/retention-policies', async (_req, res, next) => {
  try {
    const policies = dataRetention.getRetentionPolicies();
    res.json({ data: policies });
  } catch (error) {
    next(error);
  }
});

// Run retention cleanup (admin action)
gdprRouter.post('/retention-cleanup', async (req: ApiKeyRequest, res, next) => {
  try {
    const orgId = req.apiKey?.orgId;
    const result = await dataRetention.runRetentionCleanup(orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Submit deletion request
gdprRouter.post('/deletion-requests', async (req: ApiKeyRequest, res, next) => {
  try {
    const orgId = req.apiKey?.orgId;
    if (!orgId) throw new Error('Organization required');
    const { subjectId, subjectEmail, requestType, reason } = req.body;
    const result = await dataRetention.submitDeletionRequest(orgId, subjectId, subjectEmail, requestType, reason);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// List deletion requests
gdprRouter.get('/deletion-requests', async (req: ApiKeyRequest, res, next) => {
  try {
    const orgId = req.apiKey?.orgId;
    if (!orgId) throw new Error('Organization required');
    const { status, limit, offset } = req.query;
    const result = await dataRetention.listDeletionRequests(orgId, {
      status: status as any,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Process deletion request
gdprRouter.post('/deletion-requests/:requestId/process', async (req: ApiKeyRequest, res, next) => {
  try {
    const orgId = req.apiKey?.orgId;
    if (!orgId) throw new Error('Organization required');
    const processedBy = req.apiKey?.keyId || 'system';
    const result = await dataRetention.processDeletionRequest(req.params.requestId, orgId, processedBy);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Export subject data (portability)
gdprRouter.get('/subject-data/:subjectId', async (req: ApiKeyRequest, res, next) => {
  try {
    const orgId = req.apiKey?.orgId;
    if (!orgId) throw new Error('Organization required');
    const data = await dataRetention.exportSubjectData(orgId, req.params.subjectId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

export { gdprRouter };
