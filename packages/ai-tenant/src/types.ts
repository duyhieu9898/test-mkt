// =============================================================================
// @1person/ai-tenant — Type Definitions
// =============================================================================
// All interfaces for the multi-tenant AI module.
// This module is INDEPENDENT — no imports from @1person/core.
// =============================================================================

/** Tenant (company) configuration */
export interface TenantConfig {
  tenantId: string;
  name: string;
  settings: {
    language: string;
    maxDocuments: number;
    maxQueriesPerDay: number;
  };
}

/** Agent configuration per tenant */
export interface AgentConfig {
  id: string;
  tenantId: string;
  name: string;
  systemPrompt: string;
  tone: 'professional' | 'friendly' | 'formal' | 'casual';
  temperature: number;
  maxContextChunks: number;
  tools: string[];
  createdAt: Date;
}

/** Document uploaded by tenant */
export interface TenantDocument {
  id: string;
  tenantId: string;
  name: string;
  mimeType: string;
  fileHash: string;
  chunkCount: number;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  encryptionKeyId?: string;
  createdAt: Date;
}

/** Chunk of a document (for RAG) */
export interface DocumentChunk {
  id: string;
  tenantId: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

/** Query request */
export interface QueryRequest {
  tenantId: string;
  agentId?: string;
  question: string;
  conversationId?: string;
  maxChunks?: number;
}

/** Query response */
export interface QueryResponse {
  answer: string;
  sources: Array<{
    documentId: string;
    documentName: string;
    chunkContent: string;
    relevanceScore: number;
  }>;
  traceId: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    retrievalTimeMs: number;
    inferenceTimeMs: number;
  };
}

/** Audit log entry (for transparency explorer) */
export interface AuditEntry {
  id: string;
  tenantId: string;
  action:
    | 'document_upload'
    | 'document_delete'
    | 'query'
    | 'agent_create'
    | 'agent_update'
    | 'data_access';
  actor: string;
  details: Record<string, unknown>;
  dataHash?: string;
  previousEntryHash?: string;
  timestamp: Date;
}

/** LLM provider config */
export interface LLMConfig {
  provider: 'vllm' | 'openai' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKey?: string;
}

/** Embedding config */
export interface EmbeddingConfig {
  provider: 'vllm' | 'openai' | 'local';
  baseUrl?: string;
  model: string;
  dimensions: number;
  apiKey?: string;
}

/** Configuration for TenantAI initialization */
export interface TenantAIConfig {
  databaseUrl: string;
  llm: LLMConfig;
  embedding: EmbeddingConfig;
  storagePath: string;
}

/** Options for chunking text */
export interface ChunkOptions {
  /** Approximate chunk size in characters (default: 2000 ~ 500 tokens) */
  chunkSize?: number;
  /** Overlap in characters between chunks (default: 200 ~ 50 tokens) */
  overlap?: number;
}

/** Result of audit chain verification */
export interface ChainVerificationResult {
  valid: boolean;
  entriesChecked: number;
  brokenAt?: string;
}

/** Result of data integrity verification */
export interface DataIntegrityResult {
  valid: boolean;
  documentsChecked: number;
  issues: string[];
}

/** Proof that a document has not been modified since upload */
export interface DocumentProof {
  hash: string;
  uploadedAt: Date;
  currentHashMatch: boolean;
}

/** OpenAI-compatible chat completion response */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** OpenAI-compatible embedding response */
export interface EmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
