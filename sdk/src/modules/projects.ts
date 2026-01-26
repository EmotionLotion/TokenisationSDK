import type { HttpClient } from '../utils/http.js';
import type { Project, Document, PaginatedResponse } from '../types.js';

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
    const response = await this.http.post<Project>('/api/v1/projects', input, { idempotencyKey });
    return response.data;
  }

  /**
   * Retrieves a project by ID.
   */
  async get(id: string): Promise<Project> {
    const response = await this.http.get<Project>(`/api/v1/projects/${id}`);
    return response.data;
  }

  /**
   * Lists projects with optional filters.
   */
  async list(params?: ListProjectsParams): Promise<PaginatedResponse<Project>> {
    return this.http.list<Project>('/api/v1/projects', params as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Updates a project.
   */
  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const response = await this.http.patch<Project>(`/api/v1/projects/${id}`, input);
    return response.data;
  }

  /**
   * Deletes a project (only draft projects).
   */
  async delete(id: string): Promise<void> {
    await this.http.delete(`/api/v1/projects/${id}`);
  }

  // ============================================================================
  // Document Management
  // ============================================================================

  /**
   * Uploads a document to a project.
   */
  async uploadDocument(projectId: string, input: CreateDocumentInput): Promise<Document> {
    const response = await this.http.post<Document>(`/api/v1/projects/${projectId}/documents`, input);
    return response.data;
  }

  /**
   * Lists documents for a project.
   */
  async listDocuments(projectId: string, params?: { type?: string; status?: string }): Promise<PaginatedResponse<Document>> {
    return this.http.list<Document>(`/api/v1/projects/${projectId}/documents`, params as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Gets a specific document.
   */
  async getDocument(projectId: string, documentId: string): Promise<Document> {
    const response = await this.http.get<Document>(`/api/v1/projects/${projectId}/documents/${documentId}`);
    return response.data;
  }

  /**
   * Verifies a document.
   */
  async verifyDocument(projectId: string, documentId: string): Promise<Document> {
    const response = await this.http.post<Document>(`/api/v1/projects/${projectId}/documents/${documentId}/verify`);
    return response.data;
  }

  /**
   * Deletes a document.
   */
  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    await this.http.delete(`/api/v1/projects/${projectId}/documents/${documentId}`);
  }
}
