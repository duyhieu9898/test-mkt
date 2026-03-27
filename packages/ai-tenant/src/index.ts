// =============================================================================
// @1person/ai-tenant — Public API
// =============================================================================
// Multi-tenant AI module for the 1Person platform.
// Provides document management, RAG pipeline, agent configuration, and
// transparency audit logging with chain-hashed tamper detection.
//
// This module is INDEPENDENT — no imports from @1person/core.
// It can be extracted as a standalone SaaS service.
//
// Usage:
//   import { createTenantAI } from '@1person/ai-tenant';
//
//   const ai = createTenantAI({
//     databaseUrl: 'postgres://...',
//     llm: { provider: 'vllm', baseUrl: 'http://gpu:8001/v1', model: 'Qwen/Qwen2-7B-Instruct' },
//     embedding: { provider: 'vllm', baseUrl: 'http://gpu:8001/v1', model: 'BAAI/bge-small-en', dimensions: 384 },
//     storagePath: '/deploy/tenant-data',
//   });
//
//   const tenantId = await ai.initTenant('company-123', 'Acme Corp');
//   await ai.uploadDocument(tenantId, 'handbook.pdf', buffer, 'application/pdf');
//   const result = await ai.query({ tenantId, question: 'What is the vacation policy?' });
// =============================================================================

import { eq } from 'drizzle-orm';
import { getDatabase, closeAllConnections } from './db.js';
import type { Database } from './db.js';
import { tenants } from './schema.js';
import {
  logAction,
  getAuditLog as fetchAuditLog,
  verifyChain,
  getDataProof,
} from './audit-trail.js';
import {
  query as ragQuery,
} from './rag-pipeline.js';
import {
  uploadDocument as storeUploadDocument,
  processDocument as storeProcessDocument,
  deleteDocument as storeDeleteDocument,
  listDocuments as storeListDocuments,
  getDocument as storeGetDocument,
  verifyDocumentIntegrity,
} from './tenant-store.js';
import {
  createAgent as runtimeCreateAgent,
  updateAgent as runtimeUpdateAgent,
  getAgent as runtimeGetAgent,
  listAgents as runtimeListAgents,
  getDefaultAgent as runtimeGetDefaultAgent,
  setDefaultAgent as runtimeSetDefaultAgent,
} from './agent-runtime.js';
import type {
  TenantAIConfig,
  TenantConfig,
  TenantDocument,
  AgentConfig,
  QueryRequest,
  QueryResponse,
  AuditEntry,
  DataIntegrityResult,
  DocumentProof,
  LLMConfig,
  EmbeddingConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// TenantAI — the main class
// ---------------------------------------------------------------------------

export class TenantAI {
  private readonly db: Database;
  private readonly llm: LLMConfig;
  private readonly embedding: EmbeddingConfig;
  private readonly storagePath: string;

  constructor(config: TenantAIConfig) {
    this.db = getDatabase(config.databaseUrl);
    this.llm = config.llm;
    this.embedding = config.embedding;
    this.storagePath = config.storagePath;
  }

  // =========================================================================
  // Tenant management
  // =========================================================================

  /**
   * Initialize a new tenant (company). Maps an external company ID to an
   * internal tenant record. Returns the internal tenant ID.
   * If the tenant already exists, returns its existing ID.
   */
  async initTenant(
    externalId: string,
    name: string,
    settings?: Record<string, unknown>,
  ): Promise<string> {
    // Check if tenant already exists
    const existing = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.externalId, externalId))
      .limit(1);

    if (existing[0]) {
      return existing[0].id;
    }

    const defaultSettings = {
      language: 'en',
      maxDocuments: 100,
      maxQueriesPerDay: 1000,
      ...settings,
    };

    const [tenant] = await this.db
      .insert(tenants)
      .values({
        externalId,
        name,
        settings: defaultSettings,
        status: 'active',
      })
      .returning();

    if (!tenant) {
      throw new Error('Unable to create company workspace. Please try again.');
    }

    return tenant.id;
  }

  /**
   * Get tenant configuration by external ID.
   */
  async getTenant(externalId: string): Promise<TenantConfig | null> {
    const rows = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.externalId, externalId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const settings = row.settings as Record<string, unknown>;
    return {
      tenantId: row.id,
      name: row.name,
      settings: {
        language: (settings.language as string) ?? 'en',
        maxDocuments: (settings.maxDocuments as number) ?? 100,
        maxQueriesPerDay: (settings.maxQueriesPerDay as number) ?? 1000,
      },
    };
  }

  // =========================================================================
  // Document management
  // =========================================================================

  /**
   * Upload a document for a tenant. Stores the file, creates a DB record,
   * and triggers async processing (text extraction, chunking, embedding).
   */
  async uploadDocument(
    tenantId: string,
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string,
    actor: string = 'system',
  ): Promise<TenantDocument> {
    const doc = await storeUploadDocument(
      this.db,
      this.storagePath,
      tenantId,
      fileName,
      fileBuffer,
      mimeType,
      actor,
    );

    // Process document asynchronously (in production, use a job queue)
    // For now, process inline but don't block the upload response
    this.processDocumentAsync(tenantId, doc.id).catch((err) => {
      console.error(`[ai-tenant] Document processing failed: ${doc.id}`, err);
    });

    return doc;
  }

  /**
   * Process a document (extract text, chunk, embed).
   * Can be called manually to re-process a failed document.
   */
  async processDocument(tenantId: string, documentId: string): Promise<void> {
    await storeProcessDocument(
      this.db,
      this.storagePath,
      tenantId,
      documentId,
      this.embedding,
    );
  }

  /**
   * List all documents for a tenant.
   */
  async listDocuments(tenantId: string): Promise<TenantDocument[]> {
    return storeListDocuments(this.db, tenantId);
  }

  /**
   * Get a single document by ID.
   */
  async getDocument(
    tenantId: string,
    documentId: string,
  ): Promise<TenantDocument | null> {
    return storeGetDocument(this.db, tenantId, documentId);
  }

  /**
   * Delete a document and all its chunks.
   */
  async deleteDocument(
    tenantId: string,
    documentId: string,
    actor: string = 'system',
  ): Promise<void> {
    await storeDeleteDocument(this.db, tenantId, documentId, actor);
  }

  // =========================================================================
  // Agent management
  // =========================================================================

  /**
   * Create a new AI agent for a tenant.
   */
  async createAgent(
    tenantId: string,
    config: Partial<AgentConfig>,
    actor: string = 'system',
  ): Promise<AgentConfig> {
    return runtimeCreateAgent(this.db, tenantId, config, actor);
  }

  /**
   * Update an existing agent's configuration.
   */
  async updateAgent(
    tenantId: string,
    agentId: string,
    updates: Partial<AgentConfig>,
    actor: string = 'system',
  ): Promise<AgentConfig> {
    return runtimeUpdateAgent(this.db, tenantId, agentId, updates, actor);
  }

  /**
   * Get a single agent by ID.
   */
  async getAgent(
    tenantId: string,
    agentId: string,
  ): Promise<AgentConfig | null> {
    return runtimeGetAgent(this.db, tenantId, agentId);
  }

  /**
   * List all agents for a tenant.
   */
  async listAgents(tenantId: string): Promise<AgentConfig[]> {
    return runtimeListAgents(this.db, tenantId);
  }

  /**
   * Get the default agent for a tenant.
   */
  async getDefaultAgent(tenantId: string): Promise<AgentConfig | null> {
    return runtimeGetDefaultAgent(this.db, tenantId);
  }

  /**
   * Set an agent as the default for its tenant.
   */
  async setDefaultAgent(
    tenantId: string,
    agentId: string,
    actor: string = 'system',
  ): Promise<void> {
    await runtimeSetDefaultAgent(this.db, tenantId, agentId, actor);
  }

  // =========================================================================
  // Query (RAG)
  // =========================================================================

  /**
   * Execute a RAG query: embed the question, retrieve relevant chunks
   * (filtered by tenantId), generate an answer via LLM, and return
   * the answer with sources and trace information.
   */
  async query(request: QueryRequest): Promise<QueryResponse> {
    return ragQuery(this.db, request, this.llm, this.embedding);
  }

  // =========================================================================
  // Transparency Explorer (Audit)
  // =========================================================================

  /**
   * Get the audit log for a tenant. Supports filtering by action type.
   */
  async getAuditLog(
    tenantId: string,
    options?: { limit?: number; action?: string },
  ): Promise<AuditEntry[]> {
    return fetchAuditLog(this.db, tenantId, options);
  }

  /**
   * Verify the integrity of all data for a tenant.
   * Checks:
   * 1. Audit chain integrity (no tampered entries)
   * 2. Document file hashes (no modified files)
   */
  async verifyDataIntegrity(tenantId: string): Promise<DataIntegrityResult> {
    const issues: string[] = [];

    // 1. Verify audit chain
    const chainResult = await verifyChain(this.db, tenantId);
    if (!chainResult.valid) {
      issues.push(
        `Audit chain integrity broken at entry ${chainResult.brokenAt}. ` +
        `This may indicate data tampering.`,
      );
    }

    // 2. Verify document file hashes
    const documents = await storeListDocuments(this.db, tenantId);
    let documentsChecked = 0;

    for (const doc of documents) {
      if (doc.status !== 'ready') continue;

      try {
        const integrity = await verifyDocumentIntegrity(
          this.db,
          tenantId,
          doc.id,
        );
        documentsChecked++;

        if (!integrity.currentHashMatch) {
          issues.push(
            `Document "${doc.name}" (${doc.id}) file has been modified since upload. ` +
            `Expected hash: ${doc.fileHash}.`,
          );
        }
      } catch {
        issues.push(
          `Document "${doc.name}" (${doc.id}) could not be verified. ` +
          `The file may be inaccessible.`,
        );
      }
    }

    return {
      valid: issues.length === 0,
      documentsChecked,
      issues,
    };
  }

  /**
   * Get proof that a specific document has not been modified since upload.
   */
  async getDocumentProof(
    tenantId: string,
    documentId: string,
  ): Promise<DocumentProof> {
    const integrity = await verifyDocumentIntegrity(
      this.db,
      tenantId,
      documentId,
    );

    return {
      hash: integrity.hash,
      uploadedAt: integrity.uploadedAt,
      currentHashMatch: integrity.currentHashMatch,
    };
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Gracefully close all database connections.
   * Call this during application shutdown.
   */
  async close(): Promise<void> {
    await closeAllConnections();
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async processDocumentAsync(
    tenantId: string,
    documentId: string,
  ): Promise<void> {
    await storeProcessDocument(
      this.db,
      this.storagePath,
      tenantId,
      documentId,
      this.embedding,
    );
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a new TenantAI instance.
 *
 * @example
 * ```typescript
 * const ai = createTenantAI({
 *   databaseUrl: process.env.DATABASE_URL!,
 *   llm: {
 *     provider: 'vllm',
 *     baseUrl: 'http://gpu-server:8001/v1',
 *     model: 'Qwen/Qwen2-7B-Instruct',
 *   },
 *   embedding: {
 *     provider: 'vllm',
 *     baseUrl: 'http://gpu-server:8001/v1',
 *     model: 'BAAI/bge-small-en',
 *     dimensions: 384,
 *   },
 *   storagePath: '/deploy/tenant-data',
 * });
 * ```
 */
export function createTenantAI(config: TenantAIConfig): TenantAI {
  return new TenantAI(config);
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  TenantAIConfig,
  TenantConfig,
  TenantDocument,
  DocumentChunk,
  AgentConfig,
  QueryRequest,
  QueryResponse,
  AuditEntry,
  LLMConfig,
  EmbeddingConfig,
  ChunkOptions,
  ChainVerificationResult,
  DataIntegrityResult,
  DocumentProof,
} from './types.js';

export { sha256, generateTraceId } from './audit-trail.js';
export { chunkText } from './rag-pipeline.js';
