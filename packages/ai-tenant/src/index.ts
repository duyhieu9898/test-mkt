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
import * as brain from './brain-store.js';
import * as marketScan from './market-scan-store.js';
import * as dealsStore from './deals-store.js';
import * as ceoAdvisorStore from './ceo-advisor-store.js';
import {
  getDeploymentMode,
  upsertDeploymentMode,
  setByoApiKey,
  getByoApiKey,
  deleteByoApiKey,
  listByoKeyProviders,
  type DeploymentMode,
  type DeploymentModeInput,
  type DeploymentModeKind,
  type ByoKeyProvider,
} from './deployment-store.js';
import * as config from './config-store.js';
import * as credit from './credit-store.js';
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
  // Business Brain (W0.2) — editable structured memory
  // =========================================================================

  /**
   * Business Brain accessor. Every mutation is audit-logged on the
   * chain-hashed trail. See brain-store.ts for the underlying
   * implementation and docs 06 §6a / 07 §3 G2 for the design.
   */
  readonly brain = {
    getSnapshot: (tenantId: string) => brain.getSnapshot(this.db, tenantId),

    getBrandVoice: (tenantId: string) => brain.getBrandVoice(this.db, tenantId),
    upsertBrandVoice: (
      tenantId: string,
      input: brain.BrandVoiceInput,
      actor?: string,
    ) => brain.upsertBrandVoice(this.db, tenantId, input, actor),

    listPersonas: (tenantId: string) => brain.listPersonas(this.db, tenantId),
    getPrimaryPersona: (tenantId: string) => brain.getPrimaryPersona(this.db, tenantId),
    createPersona: (
      tenantId: string,
      input: brain.PersonaInput,
      actor?: string,
    ) => brain.createPersona(this.db, tenantId, input, actor),
    updatePersona: (
      tenantId: string,
      personaId: string,
      input: Partial<brain.PersonaInput>,
      actor?: string,
    ) => brain.updatePersona(this.db, tenantId, personaId, input, actor),
    deletePersona: (tenantId: string, personaId: string, actor?: string) =>
      brain.deletePersona(this.db, tenantId, personaId, actor),

    listProducts: (tenantId: string) => brain.listProducts(this.db, tenantId),
    createProduct: (
      tenantId: string,
      input: brain.ProductInput,
      actor?: string,
    ) => brain.createProduct(this.db, tenantId, input, actor),
    updateProduct: (
      tenantId: string,
      productId: string,
      input: Partial<brain.ProductInput>,
      actor?: string,
    ) => brain.updateProduct(this.db, tenantId, productId, input, actor),
    deleteProduct: (tenantId: string, productId: string, actor?: string) =>
      brain.deleteProduct(this.db, tenantId, productId, actor),

    listLearnings: (tenantId: string, limit?: number) =>
      brain.listLearnings(this.db, tenantId, limit),
    appendLearning: (
      tenantId: string,
      input: brain.CampaignLearningInput,
      actor?: string,
    ) => brain.appendLearning(this.db, tenantId, input, actor),

    // Market Position (doc 10 §4)
    getMarketPosition: (tenantId: string) =>
      brain.getMarketPosition(this.db, tenantId),
    upsertMarketPosition: (
      tenantId: string,
      input: brain.MarketPositionInput,
      actor?: string,
    ) => brain.upsertMarketPosition(this.db, tenantId, input, actor),

    // Sales Playbook (doc 10 §4)
    getSalesPlaybook: (tenantId: string) =>
      brain.getSalesPlaybook(this.db, tenantId),
    upsertSalesPlaybook: (
      tenantId: string,
      input: brain.SalesPlaybookInput,
      actor?: string,
    ) => brain.upsertSalesPlaybook(this.db, tenantId, input, actor),

    // Marketing Strategy (doc 10 §4)
    getMarketingStrategy: (tenantId: string) =>
      brain.getMarketingStrategy(this.db, tenantId),
    upsertMarketingStrategy: (
      tenantId: string,
      input: brain.MarketingStrategyInput,
      actor?: string,
    ) => brain.upsertMarketingStrategy(this.db, tenantId, input, actor),
  };

  // =========================================================================
  // Market & Competitors (doc 10 §5)
  // =========================================================================
  readonly market = {
    listCompetitors: (tenantId: string) =>
      marketScan.listCompetitors(this.db, tenantId),
    getCompetitor: (tenantId: string, competitorId: string) =>
      marketScan.getCompetitor(this.db, tenantId, competitorId),
    createCompetitor: (
      tenantId: string,
      input: marketScan.CompetitorInput,
      actor?: string,
    ) => marketScan.createCompetitor(this.db, tenantId, input, actor),
    updateCompetitor: (
      tenantId: string,
      competitorId: string,
      input: Partial<marketScan.CompetitorInput>,
      actor?: string,
    ) => marketScan.updateCompetitor(this.db, tenantId, competitorId, input, actor),
    deleteCompetitor: (tenantId: string, competitorId: string, actor?: string) =>
      marketScan.deleteCompetitor(this.db, tenantId, competitorId, actor),

    startScan: (tenantId: string, competitorId: string | null) =>
      marketScan.startScan(this.db, tenantId, competitorId),
    completeScan: (
      scanId: string,
      patch: Parameters<typeof marketScan.completeScan>[2],
    ) => marketScan.completeScan(this.db, scanId, patch),
    updateCompetitorAfterScan: (
      competitorId: string,
      signals: marketScan.Signal[],
    ) => marketScan.updateCompetitorAfterScan(this.db, competitorId, signals),
    listScans: (tenantId: string, limit?: number) =>
      marketScan.listScans(this.db, tenantId, limit),
  };

  // =========================================================================
  // Sales — Deals + Events (doc 10 §6)
  // =========================================================================
  readonly deals = {
    list: (tenantId: string) => dealsStore.listDeals(this.db, tenantId),
    get: (tenantId: string, dealId: string) =>
      dealsStore.getDeal(this.db, tenantId, dealId),
    create: (tenantId: string, input: dealsStore.DealInput, actor?: string) =>
      dealsStore.createDeal(this.db, tenantId, input, actor),
    update: (
      tenantId: string,
      dealId: string,
      input: Partial<dealsStore.DealInput>,
      actor?: string,
    ) => dealsStore.updateDeal(this.db, tenantId, dealId, input, actor),
    delete: (tenantId: string, dealId: string, actor?: string) =>
      dealsStore.deleteDeal(this.db, tenantId, dealId, actor),

    listEvents: (dealId: string, limit?: number) =>
      dealsStore.listDealEvents(this.db, dealId, limit),
    appendEvent: (dealId: string, input: dealsStore.DealEventInput) =>
      dealsStore.appendDealEvent(this.db, dealId, input),
  };

  // =========================================================================
  // CEO Advisor briefs (doc 10 §8)
  // =========================================================================
  readonly ceoAdvisor = {
    latest: (tenantId: string) => ceoAdvisorStore.getLatestBrief(this.db, tenantId),
    list: (tenantId: string, limit?: number) =>
      ceoAdvisorStore.listBriefs(this.db, tenantId, limit),
    append: (
      tenantId: string,
      input: ceoAdvisorStore.AdvisorBriefInput,
      actor?: string,
    ) => ceoAdvisorStore.appendBrief(this.db, tenantId, input, actor),
  };

  // =========================================================================
  // Deployment mode (P0-A1) — cloud / private / on-premise routing
  // =========================================================================

  /**
   * Deployment mode accessor. Lets apps/api decide per-tenant whether to
   * use shared cloud infrastructure, bring-your-own keys, or an operator-
   * supplied vLLM endpoint. Every mutation is audit-logged.
   */
  readonly deployment = {
    getMode: (tenantId: string) => getDeploymentMode(this.db, tenantId),
    upsertMode: (
      tenantId: string,
      input: DeploymentModeInput,
      actor?: string,
    ) => upsertDeploymentMode(this.db, tenantId, input, actor),

    // Bring-your-own API key storage (P0-A2). Keys are encrypted at rest
    // with AES-256-GCM using TRUSTAI_KEY_ENCRYPTION_KEY from env.
    setByoKey: (
      tenantId: string,
      provider: ByoKeyProvider,
      plaintextKey: string,
      actor?: string,
    ) => setByoApiKey(this.db, tenantId, provider, plaintextKey, actor),
    getByoKey: (tenantId: string, provider: ByoKeyProvider) =>
      getByoApiKey(this.db, tenantId, provider),
    deleteByoKey: (
      tenantId: string,
      provider: ByoKeyProvider,
      actor?: string,
    ) => deleteByoApiKey(this.db, tenantId, provider, actor),
    listByoKeys: (tenantId: string) => listByoKeyProviders(this.db, tenantId),
  };

  // =========================================================================
  // System Config — admin-managed app-wide configuration
  // =========================================================================
  //
  // Replaces .env for everything a non-technical operator should be
  // able to change: LLM provider keys, per-feature LLM mapping, Stripe,
  // Google OAuth, Meta Ads, Sentry, Langfuse. Secrets are encrypted
  // with the same AES-256-GCM helpers as BYO keys.
  //
  // Two flavors of read:
  //   - `get*` → returns decrypted secrets, server-only
  //   - `get*Public` → returns MASKED secrets, safe for admin UI
  //
  readonly config = {
    list: (category?: config.ConfigCategory) => config.listConfigs(this.db, category),
    listPublic: (category?: config.ConfigCategory) => config.listConfigsPublic(this.db, category),
    get: (category: config.ConfigCategory, key: string) =>
      config.getConfig(this.db, category, key),
    getPublic: (category: config.ConfigCategory, key: string) =>
      config.getConfigPublic(this.db, category, key),
    upsert: (input: config.SystemConfigInput, actor?: string) =>
      config.upsertConfig(this.db, input, actor),
    updateStatus: (
      category: config.ConfigCategory,
      key: string,
      status: config.ConfigStatus,
      message: string | null,
    ) => config.updateStatus(this.db, category, key, status, message),
    delete: (category: config.ConfigCategory, key: string, actor?: string) =>
      config.deleteConfig(this.db, category, key, actor),
    resolveProviderKey: (providerKey: string, envVarName: string) =>
      config.resolveProviderKey(this.db, providerKey, envVarName),
    resolveFeatureLLM: (featureKey: string) =>
      config.resolveFeatureLLM(this.db, featureKey),
    seedDefaults: (opts?: { overwriteFeatures?: boolean }) =>
      config.seedDefaultConfigs(this.db, opts),
  };

  // =========================================================================
  // Credits — per-tenant subscription state + atomic charge (Phase B)
  // =========================================================================
  //
  // Every action that costs money (LLM call, image gen, agent run)
  // should call `charge()` AFTER the call succeeds. Pre-check with
  // `getBalance().totalAvailable` to avoid wasting LLM tokens on a
  // tenant that's about to hit 402.
  //
  // Atomicity: charge() and addCredit() run inside a Postgres
  // transaction with FOR UPDATE so concurrent requests can't
  // double-spend or double-grant.
  //
  // See docs/architecture/09-pricing-and-credits.md for the model.
  //
  readonly credits = {
    // Plans (admin)
    listPlans: () => credit.listPlans(this.db),
    getPlan: (key: string) => credit.getPlan(this.db, key),
    upsertPlan: (plan: Parameters<typeof credit.upsertPlan>[1]) =>
      credit.upsertPlan(this.db, plan),
    seedDefaultPlans: () => credit.seedDefaultPlans(this.db),

    // Tenant balance
    getBalance: (tenantId: string) => credit.getBalance(this.db, tenantId),
    getOrCreateBalance: (tenantId: string) => credit.getOrCreateBalance(this.db, tenantId),

    // Atomic operations
    charge: (tenantId: string, input: credit.ChargeInput) =>
      credit.chargeCredit(this.db, tenantId, input),
    addCredit: (
      tenantId: string,
      amount: number,
      kind: 'grant' | 'topup' | 'refund' | 'rollover',
      input?: Omit<credit.ChargeInput, 'amount'>,
    ) => credit.addCredit(this.db, tenantId, amount, kind, input),
    changePlan: (
      tenantId: string,
      planKey: string,
      stripeIds?: { customerId?: string; subscriptionId?: string },
    ) => credit.changePlan(this.db, tenantId, planKey, stripeIds),

    // History
    listTransactions: (tenantId: string, limit?: number, offset?: number) =>
      credit.listTransactions(this.db, tenantId, limit, offset),
  };

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

export { snapshotToPromptBlock } from './brain-store.js';
export type {
  BrandVoice,
  BrandVoiceInput,
  Persona,
  PersonaInput,
  Product,
  ProductInput,
  CampaignLearning,
  CampaignLearningInput,
  BrainSnapshot,
  MarketPosition,
  MarketPositionInput,
  SalesPlaybook,
  SalesPlaybookInput,
  MarketingStrategy,
  MarketingStrategyInput,
} from './brain-store.js';

// Market & Competitors (doc 10 §5)
export type {
  Competitor,
  CompetitorInput,
  Signal,
  ScanSource,
  ScanRecord,
} from './market-scan-store.js';

// Sales — Deals + Events (doc 10 §6)
export type {
  Deal,
  DealInput,
  DealStage,
  DealEvent,
  DealEventInput,
} from './deals-store.js';

// CEO Advisor briefs (doc 10 §8)
export type {
  AdvisorBrief,
  AdvisorBriefInput,
  BriefAction,
  AdvisorStrategicGap,
  AdvisorResponsibleDepartment,
  AdvisorTeamTask,
  AdvisorWeeklyAction,
  BriefEvidence,
  CampaignProposal,
  BriefWin,
  BriefAlert,
} from './ceo-advisor-store.js';

export { sha256, generateTraceId } from './audit-trail.js';
export { chunkText } from './rag-pipeline.js';

export {
  getDeploymentMode,
  upsertDeploymentMode,
  setByoApiKey,
  getByoApiKey,
  deleteByoApiKey,
  listByoKeyProviders,
  encryptApiKey,
  decryptApiKey,
} from './deployment-store.js';
export type {
  DeploymentMode,
  DeploymentModeInput,
  DeploymentModeKind,
  ByoKeyProvider,
  EncryptedKey,
} from './deployment-store.js';

export {
  getConfig,
  listConfigs,
  listConfigsPublic,
  getConfigPublic,
  upsertConfig,
  updateStatus,
  deleteConfig,
  resolveProviderKey,
  resolveFeatureLLM,
  seedDefaultConfigs,
} from './config-store.js';
export type {
  SystemConfig,
  PublicSystemConfig,
  SystemConfigInput,
  ConfigCategory,
  ConfigStatus,
} from './config-store.js';

export {
  chargeCredit,
  addCredit,
  changePlan,
  getBalance,
  getOrCreateBalance,
  listTransactions,
  listPlans,
  getPlan,
  upsertPlan,
  seedDefaultPlans,
  OutOfCreditsError,
} from './credit-store.js';
export type {
  CreditBalance,
  CreditTransaction,
  CreditTransactionKind,
  CreditPlan,
  ChargeInput,
} from './credit-store.js';
