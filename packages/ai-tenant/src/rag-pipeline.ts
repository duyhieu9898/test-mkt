// =============================================================================
// @1person/ai-tenant — RAG Pipeline
// =============================================================================
// Core Retrieval-Augmented Generation implementation:
//   1. Chunk text into overlapping segments
//   2. Generate embeddings via OpenAI-compatible API (vLLM / OpenAI)
//   3. Store chunks with embeddings in PostgreSQL (pgvector-ready)
//   4. Retrieve relevant chunks filtered by tenantId (isolation boundary)
//   5. Generate answers via LLM with retrieved context
//
// RULES:
// - EVERY database query MUST filter by tenantId
// - LLM calls use OpenAI-compatible API format (works with vLLM)
// =============================================================================

import { eq, and, sql } from 'drizzle-orm';
import { documentChunks, tenantDocuments, tenantAgents } from './schema.js';
import { logAction, generateTraceId } from './audit-trail.js';
import type { Database } from './db.js';
import type {
  ChunkOptions,
  DocumentChunk,
  EmbeddingConfig,
  EmbeddingResponse,
  LLMConfig,
  ChatCompletionResponse,
  QueryRequest,
  QueryResponse,
} from './types.js';

// ---------------------------------------------------------------------------
// Text chunking
// ---------------------------------------------------------------------------

/**
 * Split text into overlapping chunks, preferring paragraph boundaries.
 *
 * @param text - The full text to chunk
 * @param options - Chunk size (~2000 chars / ~500 tokens) and overlap (~200 chars / ~50 tokens)
 * @returns Array of text chunks
 */
export function chunkText(
  text: string,
  options?: ChunkOptions,
): string[] {
  const chunkSize = options?.chunkSize ?? 2000;
  const overlap = options?.overlap ?? 200;

  if (!text || text.trim().length === 0) {
    return [];
  }

  // Split into paragraphs first
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();

    // If a single paragraph exceeds chunk size, split it further by sentences
    if (trimmed.length > chunkSize) {
      // Flush any accumulated content
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Keep overlap from the end of current chunk
        currentChunk = currentChunk.slice(-overlap);
      }

      // Split large paragraph by sentences
      const sentences = trimmed.match(/[^.!?]+[.!?]+\s*/g) ?? [trimmed];
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = currentChunk.slice(-overlap);
        }
        currentChunk += sentence;
      }
      continue;
    }

    // If adding this paragraph would exceed chunk size, start a new chunk
    if (currentChunk.length + trimmed.length + 2 > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep overlap from end of current chunk
      currentChunk = currentChunk.slice(-overlap);
    }

    currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + trimmed;
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embedding generation
// ---------------------------------------------------------------------------

/**
 * Generate an embedding vector for the given text using an OpenAI-compatible API.
 * Works with vLLM, OpenAI, and any compatible provider.
 */
export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig,
): Promise<number[]> {
  if (!config.baseUrl) {
    throw new Error('Embedding service URL is not configured. Please set up your embedding provider.');
  }

  // Convention: baseUrl already includes the API version suffix
  // (e.g. https://api.openai.com/v1). Matches the LLM path builder below.
  const url = `${config.baseUrl.replace(/\/$/, '')}/embeddings`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `Embedding service returned an error (${response.status}). Please check your embedding configuration. Details: ${errorText}`,
    );
  }

  const data = (await response.json()) as EmbeddingResponse;

  if (!data.data?.[0]?.embedding) {
    throw new Error('Embedding service returned an unexpected response format.');
  }

  return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single batch call.
 * Falls back to individual calls if batch is not supported.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  config: EmbeddingConfig,
): Promise<number[][]> {
  if (!config.baseUrl) {
    throw new Error('Embedding service URL is not configured.');
  }

  const url = `${config.baseUrl.replace(/\/$/, '')}/embeddings`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  try {
    // Try batch request first
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        input: texts,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as EmbeddingResponse;
      return data.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    }
  } catch {
    // Batch not supported — fall through to individual calls
  }

  // Fallback: generate embeddings one by one
  const embeddings: number[][] = [];
  for (const text of texts) {
    const embedding = await generateEmbedding(text, config);
    embeddings.push(embedding);
  }
  return embeddings;
}

// ---------------------------------------------------------------------------
// Chunk storage
// ---------------------------------------------------------------------------

/**
 * Store document chunks with embeddings in the database.
 * ALWAYS includes tenantId for data isolation.
 */
export async function storeChunks(
  db: Database,
  tenantId: string,
  documentId: string,
  chunks: string[],
  embeddingConfig: EmbeddingConfig,
): Promise<void> {
  if (chunks.length === 0) return;

  // Generate embeddings for all chunks
  const embeddings = await generateEmbeddingsBatch(chunks, embeddingConfig);

  // Insert chunks with embeddings
  const values = chunks.map((content, index) => ({
    tenantId,
    documentId,
    content,
    chunkIndex: index,
    tokenCount: Math.ceil(content.length / 4), // rough estimate: 1 token ~ 4 chars
    embedding: embeddings[index] ?? null,
    metadata: {},
  }));

  // Insert in batches of 50 to avoid oversized queries
  const batchSize = 50;
  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);
    await db.insert(documentChunks).values(batch);
  }

  // Update document chunk count
  await db
    .update(tenantDocuments)
    .set({ chunkCount: chunks.length })
    .where(
      and(
        eq(tenantDocuments.id, documentId),
        eq(tenantDocuments.tenantId, tenantId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Retrieve the most relevant document chunks for a query.
 * CRITICAL: ALWAYS filters by tenantId — this is the isolation boundary.
 *
 * When pgvector is available, uses native cosine distance for performance.
 * Falls back to in-memory cosine similarity computation otherwise.
 */
export async function retrieveRelevant(
  db: Database,
  tenantId: string,
  queryEmbedding: number[],
  topK: number = 5,
): Promise<Array<DocumentChunk & { relevanceScore: number }>> {
  // Fetch all chunks for this tenant that have embeddings
  // In production with pgvector, replace this with:
  //   ORDER BY embedding <=> $queryEmbedding::vector LIMIT $topK
  const chunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.tenantId, tenantId));

  // Compute similarity scores in memory
  const scored = chunks
    .filter((chunk) => chunk.embedding !== null)
    .map((chunk) => {
      const embedding = chunk.embedding as number[];
      const score = cosineSimilarity(queryEmbedding, embedding);
      return {
        id: chunk.id,
        tenantId: chunk.tenantId,
        documentId: chunk.documentId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        embedding,
        metadata: chunk.metadata as Record<string, unknown>,
        relevanceScore: score,
      };
    });

  // Sort by relevance and return top-K
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return scored.slice(0, topK);
}

// ---------------------------------------------------------------------------
// Query (full RAG pipeline)
// ---------------------------------------------------------------------------

/**
 * Execute a full RAG query:
 *   1. Generate embedding for the question
 *   2. Retrieve relevant chunks (filtered by tenantId)
 *   3. Load agent config (system prompt, tone, temperature)
 *   4. Build prompt with context
 *   5. Call LLM via OpenAI-compatible API
 *   6. Log to audit trail
 *   7. Return answer with sources and trace
 */
export async function query(
  db: Database,
  request: QueryRequest,
  llmConfig: LLMConfig,
  embeddingConfig: EmbeddingConfig,
): Promise<QueryResponse> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  // 1. Generate embedding for the question
  const queryEmbedding = await generateEmbedding(request.question, embeddingConfig);
  const retrievalStart = Date.now();

  // 2. Retrieve relevant chunks — ALWAYS filtered by tenantId
  const maxChunks = request.maxChunks ?? 5;
  const relevantChunks = await retrieveRelevant(
    db,
    request.tenantId,
    queryEmbedding,
    maxChunks,
  );
  const retrievalTimeMs = Date.now() - retrievalStart;

  // 3. Load agent config
  let systemPrompt: string;
  let temperature = 0.7;

  if (request.agentId) {
    const agents = await db
      .select()
      .from(tenantAgents)
      .where(
        and(
          eq(tenantAgents.id, request.agentId),
          eq(tenantAgents.tenantId, request.tenantId),
        ),
      )
      .limit(1);

    if (agents[0]) {
      systemPrompt = agents[0].systemPrompt;
      temperature = agents[0].temperature;
    } else {
      systemPrompt = buildDefaultSystemPrompt();
    }
  } else {
    // Try to find a default agent for this tenant
    const defaultAgents = await db
      .select()
      .from(tenantAgents)
      .where(
        and(
          eq(tenantAgents.tenantId, request.tenantId),
          eq(tenantAgents.isDefault, true),
        ),
      )
      .limit(1);

    if (defaultAgents[0]) {
      systemPrompt = defaultAgents[0].systemPrompt;
      temperature = defaultAgents[0].temperature;
    } else {
      systemPrompt = buildDefaultSystemPrompt();
    }
  }

  // 4. Build the context from retrieved chunks
  const contextParts = relevantChunks.map(
    (chunk, i) => `[Source ${i + 1}]: ${chunk.content}`,
  );
  const contextText = contextParts.join('\n\n');

  // 5. Call LLM via OpenAI-compatible API
  const inferenceStart = Date.now();
  const llmResponse = await callLLM(
    llmConfig,
    systemPrompt,
    contextText,
    request.question,
    temperature,
  );
  const inferenceTimeMs = Date.now() - inferenceStart;

  // 6. Fetch document names for sources
  const docIds = [...new Set(relevantChunks.map((c) => c.documentId))];
  const docMap = new Map<string, string>();

  if (docIds.length > 0) {
    const docs = await db
      .select({ id: tenantDocuments.id, name: tenantDocuments.name })
      .from(tenantDocuments)
      .where(
        and(
          eq(tenantDocuments.tenantId, request.tenantId),
          // Filter to only the document IDs we need
          sql`${tenantDocuments.id} = ANY(${docIds}::uuid[])`,
        ),
      );

    for (const doc of docs) {
      docMap.set(doc.id, doc.name);
    }
  }

  // Build sources
  const sources = relevantChunks.map((chunk) => ({
    documentId: chunk.documentId,
    documentName: docMap.get(chunk.documentId) ?? 'Unknown Document',
    chunkContent: chunk.content.slice(0, 500), // truncate for response
    relevanceScore: Math.round(chunk.relevanceScore * 1000) / 1000,
  }));

  const answer = llmResponse.answer;
  const usage = {
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    retrievalTimeMs,
    inferenceTimeMs,
  };

  // 7. Log to audit trail
  await logAction(db, request.tenantId, 'query', 'system', {
    question: request.question,
    agentId: request.agentId ?? null,
    retrievedChunkIds: relevantChunks.map((c) => c.id),
    model: llmConfig.model,
    traceId,
    usage,
  });

  return {
    answer,
    sources,
    traceId,
    usage,
  };
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

/**
 * Call an LLM via the OpenAI-compatible chat completions API.
 * Works with vLLM, OpenAI, Anthropic (via proxy), and any compatible provider.
 */
async function callLLM(
  config: LLMConfig,
  systemPrompt: string,
  context: string,
  question: string,
  temperature: number,
): Promise<{
  answer: string;
  promptTokens: number;
  completionTokens: number;
}> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const userMessage = context.length > 0
    ? `Context:\n${context}\n\nQuestion: ${question}`
    : question;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `AI service is temporarily unavailable (${response.status}). Please try again in a moment. Details: ${errorText}`,
    );
  }

  const data = (await response.json()) as ChatCompletionResponse;

  const answer = data.choices?.[0]?.message?.content ?? '';
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;

  return { answer, promptTokens, completionTokens };
}

// ---------------------------------------------------------------------------
// Default system prompt
// ---------------------------------------------------------------------------

function buildDefaultSystemPrompt(): string {
  return `You are an AI assistant. Your tone is professional.
Answer questions using ONLY the provided context.
If the answer is not in the context, say so honestly.
Always cite which source your answer comes from by referencing [Source N].
Be concise and accurate.`;
}
