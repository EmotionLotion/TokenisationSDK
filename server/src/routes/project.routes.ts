import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as projectService from '../services/project.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const projectRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createProjectSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().optional(),
  jurisdiction: z.string().max(32).optional(),
  assetType: z.string().max(32).optional(),
  settings: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().optional(),
  jurisdiction: z.string().max(32).optional(),
  assetType: z.string().max(32).optional(),
  status: z.enum(['draft', 'active', 'frozen', 'closed']).optional(),
  settings: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createDocumentSchema = z.object({
  projectId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  type: z.string().min(1).max(64),
  name: z.string().min(1).max(256),
  storageProvider: z.enum(['s3', 'ipfs', 'azure']).optional(),
  uri: z.string().min(1),
  sha256: z.string().length(64),
  mimeType: z.string().max(128).optional(),
  size: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateDocumentSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  status: z.enum(['uploaded', 'verified', 'expired', 'rejected']).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const uploadUrlSchema = z.object({
  fileName: z.string().min(1).max(256),
  contentType: z.string().min(1).max(128),
  storageProvider: z.enum(['s3', 'ipfs', 'azure']).optional(),
});

const downloadUrlSchema = z.object({
  uri: z.string().min(1),
  expiresInSeconds: z.number().int().min(60).max(86400).optional(), // 1 min to 24 hours
});

// ============================================================================
// Project Routes
// ============================================================================

// Create project
projectRouter.post('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createProjectSchema.parse(req.body);
    const project = await projectService.createProject({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// List projects
projectRouter.get('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { limit, offset, status, jurisdiction, assetType, search } = req.query;

    const projects = await projectService.listProjects({
      orgId: req.apiKey.orgId,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      status: status as string | undefined,
      jurisdiction: jurisdiction as string | undefined,
      assetType: assetType as string | undefined,
      search: search as string | undefined,
    });

    res.json({ data: projects, count: projects.length });
  } catch (error) {
    next(error);
  }
});

// Get project by ID
projectRouter.get('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const project = await projectService.getProject(req.params.id, req.apiKey.orgId);
    res.json(project);
  } catch (error) {
    next(error);
  }
});

// Get project stats
projectRouter.get('/:id/stats', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const stats = await projectService.getProjectStats(req.params.id, req.apiKey.orgId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Update project
projectRouter.patch('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = updateProjectSchema.parse(req.body);
    const project = await projectService.updateProject(req.params.id, req.apiKey.orgId, input);

    res.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Delete project
projectRouter.delete('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await projectService.deleteProject(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Document Routes
// ============================================================================

// Generate presigned upload URL
projectRouter.post('/documents/upload-url', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = uploadUrlSchema.parse(req.body);
    const result = await projectService.generateUploadUrl(
      req.apiKey.orgId,
      input.fileName,
      input.contentType,
      input.storageProvider
    );

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Generate presigned download URL
projectRouter.post('/documents/download-url', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = downloadUrlSchema.parse(req.body);
    const result = await projectService.generateDownloadUrl(
      input.uri,
      req.apiKey.orgId,
      input.expiresInSeconds
    );

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Verify document integrity (check SHA256 hash matches stored content)
projectRouter.post('/documents/:id/verify-integrity', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await projectService.verifyDocumentIntegrity(req.params.id, req.apiKey.orgId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Create document (register uploaded document)
projectRouter.post('/documents', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createDocumentSchema.parse(req.body);
    const document = await projectService.createDocument({
      ...input,
      orgId: req.apiKey.orgId,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    });

    res.status(201).json(document);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// List documents
projectRouter.get('/documents', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { projectId, assetId, type, status, limit, offset } = req.query;

    const documents = await projectService.listDocuments({
      orgId: req.apiKey.orgId,
      projectId: projectId as string | undefined,
      assetId: assetId as string | undefined,
      type: type as string | undefined,
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: documents, count: documents.length });
  } catch (error) {
    next(error);
  }
});

// Get document by ID
projectRouter.get('/documents/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const document = await projectService.getDocument(req.params.id, req.apiKey.orgId);
    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Update document
projectRouter.patch('/documents/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = updateDocumentSchema.parse(req.body);
    const document = await projectService.updateDocument(req.params.id, req.apiKey.orgId, {
      ...input,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    });

    res.json(document);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Verify document
projectRouter.post('/documents/:id/verify', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const verifierId = req.body.verifierId || req.apiKey.keyId;
    const document = await projectService.verifyDocument(req.params.id, req.apiKey.orgId, verifierId);

    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Reject document
projectRouter.post('/documents/:id/reject', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { reason } = req.body;
    const document = await projectService.rejectDocument(req.params.id, req.apiKey.orgId, reason);

    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Delete document
projectRouter.delete('/documents/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await projectService.deleteDocument(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get project documents
projectRouter.get('/:id/documents', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    // Verify project exists
    await projectService.getProject(req.params.id, req.apiKey.orgId);

    const { type, status, limit, offset } = req.query;

    const documents = await projectService.listDocuments({
      orgId: req.apiKey.orgId,
      projectId: req.params.id,
      type: type as string | undefined,
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: documents, count: documents.length });
  } catch (error) {
    next(error);
  }
});
