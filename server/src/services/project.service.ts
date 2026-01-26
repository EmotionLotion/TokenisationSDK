import { db, schema } from '../config/database.js';
import { eq, and, desc, like, or } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import {
  getStorageAdapter,
  isStorageConfigured,
  isProviderAvailable,
  type StorageProviderType,
} from './storage/index.js';

const { projects, documents, assets } = schema;

// ============================================================================
// Project Service
// ============================================================================

export interface CreateProjectInput {
  orgId: string;
  name: string;
  description?: string;
  jurisdiction?: string;
  assetType?: string;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  jurisdiction?: string;
  assetType?: string;
  status?: 'draft' | 'active' | 'frozen' | 'closed';
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ListProjectsParams {
  orgId: string;
  limit?: number;
  offset?: number;
  status?: string;
  jurisdiction?: string;
  assetType?: string;
  search?: string;
}

export async function createProject(input: CreateProjectInput) {
  const [project] = await db.insert(projects).values({
    orgId: input.orgId,
    name: input.name,
    description: input.description,
    jurisdiction: input.jurisdiction || 'DUBAI',
    assetType: input.assetType || 'REAL_ESTATE',
    settings: input.settings || {},
    metadata: input.metadata || {},
  }).returning();

  return project;
}

export async function getProject(id: string, orgId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.orgId, orgId)),
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  return project;
}

export async function listProjects(params: ListProjectsParams) {
  const { orgId, limit = 50, offset = 0, status, jurisdiction, assetType, search } = params;

  const conditions = [eq(projects.orgId, orgId)];

  if (status) {
    conditions.push(eq(projects.status, status));
  }

  if (jurisdiction) {
    conditions.push(eq(projects.jurisdiction, jurisdiction));
  }

  if (assetType) {
    conditions.push(eq(projects.assetType, assetType));
  }

  if (search) {
    conditions.push(
      or(
        like(projects.name, `%${search}%`),
        like(projects.description, `%${search}%`)
      ) as any
    );
  }

  const results = await db.select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateProject(id: string, orgId: string, input: UpdateProjectInput) {
  await getProject(id, orgId);

  const [updated] = await db.update(projects)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId)))
    .returning();

  return updated;
}

export async function deleteProject(id: string, orgId: string) {
  const project = await getProject(id, orgId);

  // Only allow deletion of draft projects
  if (project.status !== 'draft') {
    throw new ValidationError('Only draft projects can be deleted');
  }

  // Check if project has any assets
  const projectAssets = await db.select()
    .from(assets)
    .where(eq(assets.projectId, id))
    .limit(1);

  if (projectAssets.length > 0) {
    throw new ValidationError('Cannot delete project with associated assets');
  }

  await db.delete(projects)
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId)));

  return { success: true, id };
}

export async function getProjectStats(id: string, orgId: string) {
  await getProject(id, orgId);

  const projectAssets = await db.select()
    .from(assets)
    .where(eq(assets.projectId, id));

  const projectDocs = await db.select()
    .from(documents)
    .where(eq(documents.projectId, id));

  const stateCount: Record<string, number> = {};
  for (const asset of projectAssets) {
    stateCount[asset.state] = (stateCount[asset.state] || 0) + 1;
  }

  return {
    totalAssets: projectAssets.length,
    totalDocuments: projectDocs.length,
    assetsByState: stateCount,
  };
}

// ============================================================================
// Document Service
// ============================================================================

export interface CreateDocumentInput {
  orgId: string;
  projectId?: string;
  assetId?: string;
  type: string;
  name: string;
  storageProvider?: string;
  uri: string;
  sha256: string;
  mimeType?: string;
  size?: number;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface UpdateDocumentInput {
  name?: string;
  status?: 'uploaded' | 'verified' | 'expired' | 'rejected';
  signedBy?: string;
  signedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ListDocumentsParams {
  orgId: string;
  projectId?: string;
  assetId?: string;
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function createDocument(input: CreateDocumentInput) {
  // Verify project exists if provided
  if (input.projectId) {
    await getProject(input.projectId, input.orgId);
  }

  const [document] = await db.insert(documents).values({
    orgId: input.orgId,
    projectId: input.projectId,
    assetId: input.assetId,
    type: input.type,
    name: input.name,
    storageProvider: input.storageProvider || 's3',
    uri: input.uri,
    sha256: input.sha256,
    mimeType: input.mimeType,
    size: input.size,
    expiresAt: input.expiresAt,
    metadata: input.metadata || {},
  }).returning();

  return document;
}

export async function getDocument(id: string, orgId: string) {
  const document = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.orgId, orgId)),
  });

  if (!document) {
    throw new NotFoundError('Document not found');
  }

  return document;
}

export async function listDocuments(params: ListDocumentsParams) {
  const { orgId, projectId, assetId, type, status, limit = 50, offset = 0 } = params;

  const conditions = [eq(documents.orgId, orgId)];

  if (projectId) {
    conditions.push(eq(documents.projectId, projectId));
  }

  if (assetId) {
    conditions.push(eq(documents.assetId, assetId));
  }

  if (type) {
    conditions.push(eq(documents.type, type));
  }

  if (status) {
    conditions.push(eq(documents.status, status));
  }

  const results = await db.select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateDocument(id: string, orgId: string, input: UpdateDocumentInput) {
  await getDocument(id, orgId);

  const [updated] = await db.update(documents)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, id), eq(documents.orgId, orgId)))
    .returning();

  return updated;
}

export async function verifyDocument(id: string, orgId: string, verifierId: string) {
  const document = await getDocument(id, orgId);

  if (document.status === 'verified') {
    throw new ValidationError('Document is already verified');
  }

  const [updated] = await db.update(documents)
    .set({
      status: 'verified',
      signedBy: verifierId,
      signedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, id), eq(documents.orgId, orgId)))
    .returning();

  return updated;
}

export async function rejectDocument(id: string, orgId: string, reason?: string) {
  const document = await getDocument(id, orgId);

  if (document.status === 'verified') {
    throw new ValidationError('Cannot reject a verified document');
  }

  const metadata = {
    ...(document.metadata as Record<string, unknown> || {}),
    rejectionReason: reason,
    rejectedAt: new Date().toISOString(),
  };

  const [updated] = await db.update(documents)
    .set({
      status: 'rejected',
      metadata,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, id), eq(documents.orgId, orgId)))
    .returning();

  return updated;
}

export async function deleteDocument(id: string, orgId: string) {
  const document = await getDocument(id, orgId);

  // Only allow deletion of uploaded/rejected documents
  if (document.status === 'verified') {
    throw new ValidationError('Cannot delete a verified document');
  }

  await db.delete(documents)
    .where(and(eq(documents.id, id), eq(documents.orgId, orgId)));

  return { success: true, id };
}

// Generate presigned URL for upload
export async function generateUploadUrl(
  orgId: string,
  fileName: string,
  contentType: string,
  storageProvider: string = 's3'
): Promise<{ uploadUrl: string; documentUri: string; headers?: Record<string, string>; expiresAt: Date }> {
  const provider = storageProvider as StorageProviderType;

  // Check if storage is configured and provider is available
  if (!isStorageConfigured()) {
    // Fall back to mock implementation for development
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const documentUri = `${storageProvider}://${orgId}/${Date.now()}-${fileName}`;

    return {
      uploadUrl: `https://upload.mock.local/presigned?key=${encodeURIComponent(documentUri)}`,
      documentUri,
      expiresAt,
    };
  }

  if (!isProviderAvailable(provider)) {
    throw new ValidationError(`Storage provider '${provider}' is not enabled`);
  }

  const adapter = getStorageAdapter(provider);

  const result = await adapter.generateUploadUrl({
    orgId,
    fileName,
    contentType,
  });

  return {
    uploadUrl: result.uploadUrl,
    documentUri: result.documentUri,
    headers: result.headers,
    expiresAt: result.expiresAt,
  };
}

// Generate presigned URL for download
export async function generateDownloadUrl(
  uri: string,
  orgId: string,
  expiresInSeconds: number = 3600
): Promise<{ downloadUrl: string; expiresAt: Date }> {
  // Parse the URI to determine the provider
  const match = uri.match(/^([a-z0-9]+):\/\//i);
  if (!match) {
    throw new ValidationError(`Invalid document URI format: ${uri}`);
  }

  const provider = match[1].toLowerCase() as StorageProviderType;

  // Check if storage is configured
  if (!isStorageConfigured() || !isProviderAvailable(provider)) {
    // Fall back to mock implementation for development
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    return {
      downloadUrl: `https://download.mock.local/presigned?key=${encodeURIComponent(uri)}`,
      expiresAt,
    };
  }

  const adapter = getStorageAdapter(provider);
  return adapter.generateDownloadUrl(uri, expiresInSeconds);
}

// Verify document integrity by checking SHA256 hash
export async function verifyDocumentIntegrity(
  id: string,
  orgId: string
): Promise<{ verified: boolean; documentId: string; actualSha256?: string; error?: string }> {
  const document = await getDocument(id, orgId);

  if (!document.sha256) {
    return {
      verified: false,
      documentId: id,
      error: 'Document has no SHA256 hash stored',
    };
  }

  // Parse the URI to determine the provider
  const match = document.uri.match(/^([a-z0-9]+):\/\//i);
  if (!match) {
    return {
      verified: false,
      documentId: id,
      error: `Invalid document URI format: ${document.uri}`,
    };
  }

  const provider = match[1].toLowerCase() as StorageProviderType;

  // Check if storage is configured
  if (!isStorageConfigured() || !isProviderAvailable(provider)) {
    return {
      verified: false,
      documentId: id,
      error: 'Storage provider is not configured for integrity verification',
    };
  }

  const adapter = getStorageAdapter(provider);
  const result = await adapter.verifyIntegrity(document.uri, document.sha256);

  return {
    verified: result.verified,
    documentId: id,
    actualSha256: result.actualSha256,
    error: result.error,
  };
}

// Delete document from storage
export async function deleteDocumentFromStorage(uri: string): Promise<{ success: boolean; error?: string }> {
  // Parse the URI to determine the provider
  const match = uri.match(/^([a-z0-9]+):\/\//i);
  if (!match) {
    return { success: false, error: `Invalid document URI format: ${uri}` };
  }

  const provider = match[1].toLowerCase() as StorageProviderType;

  // Check if storage is configured
  if (!isStorageConfigured() || !isProviderAvailable(provider)) {
    // In development, just return success
    return { success: true };
  }

  const adapter = getStorageAdapter(provider);
  return adapter.delete(uri);
}
