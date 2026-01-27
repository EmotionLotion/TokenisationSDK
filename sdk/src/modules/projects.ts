import type { HttpClient } from '../utils/http.js';
import type { Project, Document, PaginatedResponse } from '../types.js';
import {
  validate,
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  ListProjectsParamsSchema,
  CreateDocumentInputSchema,
  ListDocumentsParamsSchema,
  UUIDSchema,
} from './validation.js';

// ============================================================================
// Projects Module
// ============================================================================

export interface CreateProjectInput {
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
  status?: string;
  jurisdiction?: string;
  limit?: number;
  offset?: number;
}

export interface CreateDocumentInput {
  type: string;
  name: string;
  uri: string;
  sha256: string;
  storageProvider?: 's3' | 'ipfs' | 'azure';
  mimeType?: string;
  size?: number;
  metadata?: Record<string, unknown>;
}

export class ProjectsModule {
  constructor(private http: HttpClient) {}

  /**
   * Creates a new project.
   */
  async create(input: CreateProjectInput, idempotencyKey?: string): Promise<Project> {
    const validated = validate(CreateProjectInputSchema, input);
    const response = await this.http.post<Project>('/api/v1/projects', validated, { idempotencyKey });
    return response.data;
  }

  /**
   * Retrieves a project by ID.
   */
  async get(id: string): Promise<Project> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<Project>(`/api/v1/projects/${validatedId}`);
    return response.data;
  }

  /**
   * Lists projects with optional filters.
   */
  async list(params?: ListProjectsParams): Promise<PaginatedResponse<Project>> {
    const validated = params ? validate(ListProjectsParamsSchema, params) : undefined;
    return this.http.list<Project>('/api/v1/projects', validated as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Updates a project.
   */
  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(UpdateProjectInputSchema, input);
    const response = await this.http.patch<Project>(`/api/v1/projects/${validatedId}`, validated);
    return response.data;
  }

  /**
   * Deletes a project (only draft projects).
   */
  async delete(id: string): Promise<void> {
    const validatedId = validate(UUIDSchema, id);
    await this.http.delete(`/api/v1/projects/${validatedId}`);
  }

  // ============================================================================
  // Document Management
  // ============================================================================

  /**
   * Uploads a document to a project.
   */
  async uploadDocument(projectId: string, input: CreateDocumentInput): Promise<Document> {
    const validatedProjectId = validate(UUIDSchema, projectId);
    const validated = validate(CreateDocumentInputSchema, input);
    const response = await this.http.post<Document>(`/api/v1/projects/${validatedProjectId}/documents`, validated);
    return response.data;
  }

  /**
   * Lists documents for a project.
   */
  async listDocuments(projectId: string, params?: { type?: string; status?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<Document>> {
    const validatedProjectId = validate(UUIDSchema, projectId);
    const validated = params ? validate(ListDocumentsParamsSchema, params) : undefined;
    return this.http.list<Document>(`/api/v1/projects/${validatedProjectId}/documents`, validated as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Gets a specific document.
   */
  async getDocument(projectId: string, documentId: string): Promise<Document> {
    const validatedProjectId = validate(UUIDSchema, projectId);
    const validatedDocumentId = validate(UUIDSchema, documentId);
    const response = await this.http.get<Document>(`/api/v1/projects/${validatedProjectId}/documents/${validatedDocumentId}`);
    return response.data;
  }

  /**
   * Verifies a document.
   */
  async verifyDocument(projectId: string, documentId: string): Promise<Document> {
    const validatedProjectId = validate(UUIDSchema, projectId);
    const validatedDocumentId = validate(UUIDSchema, documentId);
    const response = await this.http.post<Document>(`/api/v1/projects/${validatedProjectId}/documents/${validatedDocumentId}/verify`);
    return response.data;
  }

  /**
   * Deletes a document.
   */
  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    const validatedProjectId = validate(UUIDSchema, projectId);
    const validatedDocumentId = validate(UUIDSchema, documentId);
    await this.http.delete(`/api/v1/projects/${validatedProjectId}/documents/${validatedDocumentId}`);
  }
}
