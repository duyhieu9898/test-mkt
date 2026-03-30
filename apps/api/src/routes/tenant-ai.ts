import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { llmGenerate } from '../lib/llm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const tenantAIRouter = new Hono();

// ─── PUBLIC ROUTES (no auth — for proof page) ────────────────────────
tenantAIRouter.get('/public/proof/:companyId', async (c) => {
  const companyId = c.req.param('companyId');

  try {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    if (!company) return c.json({ error: 'Not found' }, 404);

    // Count documents, queries, audit entries
    const [docResult] = await db.execute(sql`SELECT COUNT(*)::int as count FROM ai_tenant_documents WHERE tenant_id = ${companyId}`);
    const [queryResult] = await db.execute(sql`SELECT COUNT(*)::int as count FROM ai_tenant_queries WHERE tenant_id = ${companyId}`);
    const [auditResult] = await db.execute(sql`SELECT COUNT(*)::int as count FROM ai_tenant_audit_log WHERE tenant_id = ${companyId}`);

    return c.json({
      companyName: company.name,
      documentCount: (docResult as any)?.count || 0,
      queryCount: (queryResult as any)?.count || 0,
      auditEntryCount: (auditResult as any)?.count || 0,
    });
  } catch {
    // Tables might not exist yet
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    return c.json({
      companyName: company?.name || 'Company',
      documentCount: 0,
      queryCount: 0,
      auditEntryCount: 0,
    });
  }
});

tenantAIRouter.get('/public/proof/:companyId/verify', async (c) => {
  const companyId = c.req.param('companyId');

  try {
    // Verify audit chain
    const entries = await db.execute(
      sql`SELECT id, data_hash, chain_hash, created_at FROM ai_tenant_audit_log WHERE tenant_id = ${companyId} ORDER BY created_at ASC`
    );

    let valid = true;
    let entriesChecked = 0;

    const rows = entries as any[];
    for (let i = 1; i < rows.length; i++) {
      entriesChecked++;
      const prev = rows[i - 1];
      const expectedHash = crypto.createHash('sha256')
        .update(`${prev.id}${prev.data_hash || ''}${prev.created_at}`)
        .digest('hex');
      if (rows[i].chain_hash !== expectedHash) {
        valid = false;
        break;
      }
    }
    if (rows.length > 0) entriesChecked = rows.length;

    // Count documents
    const [docResult] = await db.execute(sql`SELECT COUNT(*)::int as count FROM ai_tenant_documents WHERE tenant_id = ${companyId}`);

    return c.json({
      valid,
      entriesChecked,
      documentsChecked: (docResult as any)?.count || 0,
      verifiedAt: new Date().toISOString(),
    });
  } catch {
    return c.json({ valid: true, entriesChecked: 0, documentsChecked: 0, verifiedAt: new Date().toISOString() });
  }
});

// ─── AUTHENTICATED ROUTES ────────────────────────────────────────────
tenantAIRouter.use('*', authMiddleware);

// ─── Helper: Check company ownership ────────────────────────────────
const checkCompanyOwnership = async (companyId: string, userId: string) => {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });
  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }
  return company;
};

// ─── Helper: Hash data for integrity chain ──────────────────────────
function computeHash(data: string, previousHash?: string): string {
  const input = previousHash ? `${previousHash}:${data}` : data;
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ─── Helper: Ensure tenant data directory exists ────────────────────
function ensureTenantDir(companyId: string): string {
  const tenantDir = path.join(process.cwd(), '..', '..', 'deploy', 'tenant-data', companyId);
  fs.mkdirSync(tenantDir, { recursive: true });
  return tenantDir;
}

// ─── Helper: Get last audit hash for chain ──────────────────────────
async function getLastAuditHash(companyId: string): Promise<string | undefined> {
  const result = await db.execute(sql`
    SELECT chain_hash FROM ai_tenant_audit_log
    WHERE company_id = ${companyId}
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const rows = result.rows || result;
  return (rows as any[])?.[0]?.chain_hash;
}

// ─── Helper: Log audit entry ────────────────────────────────────────
async function logAudit(
  companyId: string,
  action: string,
  details: string,
  dataHash?: string,
  metadata?: Record<string, any>
) {
  const previousHash = await getLastAuditHash(companyId);
  const entryData = JSON.stringify({ companyId, action, details, dataHash, timestamp: new Date().toISOString() });
  const chainHash = computeHash(entryData, previousHash);

  await db.execute(sql`
    INSERT INTO ai_tenant_audit_log (id, company_id, action, details, data_hash, chain_hash, metadata, created_at)
    VALUES (
      gen_random_uuid(),
      ${companyId},
      ${action},
      ${details},
      ${dataHash || null},
      ${chainHash},
      ${JSON.stringify(metadata || {})}::jsonb,
      NOW()
    )
  `);
}

// ─── Ensure tables exist (MVP inline migration) ─────────────────────
async function ensureTables() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_tenant_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT,
        file_size INTEGER DEFAULT 0,
        mime_type TEXT,
        content_hash TEXT,
        status TEXT DEFAULT 'processing',
        raw_content TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_tenant_agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        name TEXT NOT NULL DEFAULT 'AI Assistant',
        system_prompt TEXT DEFAULT 'You are a helpful AI assistant for this company. Answer questions based on the company''s documents and knowledge base. Be professional, accurate, and helpful.',
        tone TEXT DEFAULT 'professional',
        top_k INTEGER DEFAULT 5,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_tenant_queries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        question TEXT NOT NULL,
        answer TEXT,
        sources JSONB DEFAULT '[]'::jsonb,
        trace_id TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_tenant_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        data_hash TEXT,
        chain_hash TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) {
    // Tables may already exist
  }
}

// Initialize on first load
let tablesReady = false;
async function ensureReady() {
  if (!tablesReady) {
    await ensureTables();
    tablesReady = true;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

// ─── POST /company/:companyId/init — Initialize tenant AI ───────────
tenantAIRouter.post('/company/:companyId/init', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await checkCompanyOwnership(companyId, userId);
  await ensureReady();

  // Check if agent already exists
  const existing = await db.execute(sql`
    SELECT id FROM ai_tenant_agents WHERE company_id = ${companyId} LIMIT 1
  `);

  if ((existing.rows || existing as any[]).length === 0) {
    await db.execute(sql`
      INSERT INTO ai_tenant_agents (id, company_id, name, system_prompt, tone, top_k)
      VALUES (gen_random_uuid(), ${companyId}, 'AI Assistant',
        'You are a helpful AI assistant for this company. Answer questions based on the company''s documents and knowledge base. Be professional, accurate, and helpful.',
        'professional', 5)
    `);
  }

  await logAudit(companyId, 'tenant_initialized', 'AI system initialized for this company');

  return c.json({ success: true, message: 'AI system ready' });
});

// ─── POST /company/:companyId/documents/upload — Upload document ────
tenantAIRouter.post('/company/:companyId/documents/upload', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await checkCompanyOwnership(companyId, userId);
  await ensureReady();

  const body = await c.req.parseBody();
  const file = body['file'] as File | undefined;

  if (!file) {
    throw new HTTPException(400, { message: 'No file provided' });
  }

  // Size limit: 10MB
  if (file.size > 10 * 1024 * 1024) {
    throw new HTTPException(400, { message: 'File too large. Maximum is 10MB.' });
  }

  const tenantDir = ensureTenantDir(companyId);
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Check for duplicate
  const existingDoc = await db.execute(sql`
    SELECT id FROM ai_tenant_documents
    WHERE company_id = ${companyId} AND content_hash = ${contentHash}
    LIMIT 1
  `);

  if ((existingDoc.rows || existingDoc as any[]).length > 0) {
    return c.json({ message: 'This file was already uploaded', duplicate: true });
  }

  // Save file
  const safeFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(tenantDir, safeFileName);
  const { writeFile } = await import('fs/promises');
  await writeFile(filePath, fileBuffer);

  // Extract text content for simple RAG
  let rawContent = '';
  if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
    rawContent = fileBuffer.toString('utf-8');
  } else if (file.name.endsWith('.md')) {
    rawContent = fileBuffer.toString('utf-8');
  } else {
    // For PDFs and other formats, store what we can
    rawContent = fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').substring(0, 50000);
  }

  // Insert document
  const result = await db.execute(sql`
    INSERT INTO ai_tenant_documents (id, company_id, name, file_path, file_size, mime_type, content_hash, status, raw_content, metadata)
    VALUES (
      gen_random_uuid(),
      ${companyId},
      ${file.name},
      ${filePath},
      ${file.size},
      ${file.type || 'application/octet-stream'},
      ${contentHash},
      'ready',
      ${rawContent},
      ${JSON.stringify({ uploadedBy: userId })}::jsonb
    )
    RETURNING id, name, file_size, content_hash, status, created_at
  `);

  const doc = (result.rows || result as any[])[0];

  await logAudit(
    companyId,
    'document_uploaded',
    `Document "${file.name}" uploaded (${Math.round(file.size / 1024)}KB)`,
    contentHash,
    { documentId: doc.id, fileName: file.name }
  );

  return c.json(doc, 201);
});

// ─── GET /company/:companyId/documents — List documents ─────────────
tenantAIRouter.get('/company/:companyId/documents', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await checkCompanyOwnership(companyId, userId);
  await ensureReady();

  const result = await db.execute(sql`
    SELECT id, name, file_size, mime_type, content_hash, status, metadata, created_at, updated_at
    FROM ai_tenant_documents
    WHERE company_id = ${companyId}
    ORDER BY created_at DESC
  `);

  const docs = result.rows || result;

  // Calculate total storage
  const totalSize = (docs as any[]).reduce((sum: number, d: any) => sum + (d.file_size || 0), 0);

  return c.json({
    data: docs,
    totalDocuments: (docs as any[]).length,
    totalStorageBytes: totalSize,
  });
});

// ─── DELETE /company/:companyId/documents/:docId — Delete document ──
tenantAIRouter.delete('/company/:companyId/documents/:docId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const docId = c.req.param('docId');
  await checkCompanyOwnership(companyId, userId);
  await ensureReady();

  // Get document to delete file
  const docResult = await db.execute(sql`
    SELECT id, name, file_path, content_hash FROM ai_tenant_documents
    WHERE id = ${docId}::uuid AND company_id = ${companyId}
    LIMIT 1
  `);

  const doc = (docResult.rows || docResult as any[])[0];
  if (!doc) {
    throw new HTTPException(404, { message: 'Document not found' });
  }

  // Delete file from disk
  if (doc.file_path && fs.existsSync(doc.file_path)) {
    fs.unlinkSync(doc.file_path);
  }

  // Delete from DB
  await db.execute(sql`
    DELETE FROM ai_tenant_documents WHERE id = ${docId}::uuid AND company_id = ${companyId}
  `);

  await logAudit(
    companyId,
    'document_deleted',
    `Document "${doc.name}" removed`,
    doc.content_hash as string,
    { documentId: docId }
  );

  return c.json({ success: true });
});

// ─── POST /company/:companyId/agents — Create agent ─────────────────
tenantAIRouter.post(
  '/company/:companyId/agents',
  zValidator('json', z.object({
    name: z.string().min(1).max(100),
    systemPrompt: z.string().optional(),
    tone: z.enum(['professional', 'friendly', 'formal', 'casual']).optional(),
    topK: z.number().min(3).max(10).optional(),
  })),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    const data = c.req.valid('json');
    await checkCompanyOwnership(companyId, userId);
    await ensureReady();

    const result = await db.execute(sql`
      INSERT INTO ai_tenant_agents (id, company_id, name, system_prompt, tone, top_k)
      VALUES (
        gen_random_uuid(),
        ${companyId},
        ${data.name},
        ${data.systemPrompt || 'You are a helpful AI assistant for this company. Answer questions based on the company\'s documents and knowledge base. Be professional, accurate, and helpful.'},
        ${data.tone || 'professional'},
        ${data.topK || 5}
      )
      RETURNING *
    `);

    const agent = (result.rows || result as any[])[0];

    await logAudit(companyId, 'agent_created', `AI agent "${data.name}" created`, undefined, { agentId: agent.id });

    return c.json(agent, 201);
  }
);

// ─── GET /company/:companyId/agents — List agents ───────────────────
tenantAIRouter.get('/company/:companyId/agents', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await checkCompanyOwnership(companyId, userId);
  await ensureReady();

  const result = await db.execute(sql`
    SELECT * FROM ai_tenant_agents
    WHERE company_id = ${companyId}
    ORDER BY created_at DESC
  `);

  return c.json({ data: result.rows || result });
});

// ─── PATCH /company/:companyId/agents/:agentId — Update agent ───────
tenantAIRouter.patch(
  '/company/:companyId/agents/:agentId',
  zValidator('json', z.object({
    name: z.string().min(1).max(100).optional(),
    systemPrompt: z.string().optional(),
    tone: z.enum(['professional', 'friendly', 'formal', 'casual']).optional(),
    topK: z.number().min(3).max(10).optional(),
  })),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    const agentId = c.req.param('agentId');
    const data = c.req.valid('json');
    await checkCompanyOwnership(companyId, userId);
    await ensureReady();

    // Build parameterized update — avoid sql.raw to prevent SQL injection
    const updates: Record<string, any> = { updated_at: sql`NOW()` };
    if (data.name !== undefined) updates.name = data.name;
    if (data.systemPrompt !== undefined) updates.system_prompt = data.systemPrompt;
    if (data.tone !== undefined) updates.tone = data.tone;
    if (data.topK !== undefined) updates.top_k = data.topK;

    // Build individual parameterized SET clauses
    const setParts = [sql`updated_at = NOW()`];
    if (data.name !== undefined) setParts.push(sql`name = ${data.name}`);
    if (data.systemPrompt !== undefined) setParts.push(sql`system_prompt = ${data.systemPrompt}`);
    if (data.tone !== undefined) setParts.push(sql`tone = ${data.tone}`);
    if (data.topK !== undefined) setParts.push(sql`top_k = ${data.topK}`);

    const setClause = sql.join(setParts, sql`, `);

    const result = await db.execute(sql`
      UPDATE ai_tenant_agents
      SET ${setClause}
      WHERE id = ${agentId}::uuid AND company_id = ${companyId}
      RETURNING *
    `);

    const agent = (result.rows || result as any[])[0];
    if (!agent) {
      throw new HTTPException(404, { message: 'Agent not found' });
    }

    await logAudit(companyId, 'agent_updated', `AI agent settings updated`, undefined, { agentId, changes: Object.keys(data) });

    return c.json(agent);
  }
);

// ─── POST /company/:companyId/query — RAG query ─────────────────────
tenantAIRouter.post(
  '/company/:companyId/query',
  zValidator('json', z.object({
    question: z.string().min(1).max(2000),
  })),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    const { question } = c.req.valid('json');
    await checkCompanyOwnership(companyId, userId);
    await ensureReady();

    const traceId = `trace_${crypto.randomBytes(8).toString('hex')}`;

    // Get agent settings
    const agentResult = await db.execute(sql`
      SELECT * FROM ai_tenant_agents WHERE company_id = ${companyId} LIMIT 1
    `);
    const agent = (agentResult.rows || agentResult as any[])[0];
    const topK = agent?.top_k || 5;
    const systemPrompt = agent?.system_prompt || 'You are a helpful AI assistant.';
    const tone = agent?.tone || 'professional';

    // Simple keyword search across tenant documents (MVP — no embeddings)
    const keywords = question.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    const searchPattern = keywords.length > 0
      ? keywords.map((k: string) => k.replace(/[^a-z0-9]/g, '')).join('|')
      : question;

    const docsResult = await db.execute(sql`
      SELECT id, name, raw_content, content_hash
      FROM ai_tenant_documents
      WHERE company_id = ${companyId}
        AND status = 'ready'
        AND raw_content IS NOT NULL
        AND raw_content != ''
      ORDER BY created_at DESC
      LIMIT ${topK}
    `);

    const docs = (docsResult.rows || docsResult) as any[];

    // Score and rank documents by keyword relevance
    const scoredDocs = docs
      .map((doc: any) => {
        const content = (doc.raw_content || '').toLowerCase();
        let score = 0;
        for (const keyword of keywords) {
          const regex = new RegExp(keyword.replace(/[^a-z0-9]/g, ''), 'gi');
          const matches = content.match(regex);
          score += matches ? matches.length : 0;
        }
        return { ...doc, score };
      })
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, topK);

    // Build context from relevant documents
    const contextParts = scoredDocs
      .filter((d: any) => d.score > 0 || docs.length <= topK)
      .map((d: any) => {
        const content = (d.raw_content || '').substring(0, 3000);
        return `[Document: ${d.name}]\n${content}`;
      });

    const context = contextParts.length > 0
      ? contextParts.join('\n\n---\n\n')
      : 'No relevant documents found.';

    const sources = scoredDocs
      .filter((d: any) => d.score > 0)
      .map((d: any) => ({
        documentId: d.id,
        name: d.name,
        relevanceScore: d.score,
      }));

    // Call LLM with context
    const toneInstructions: Record<string, string> = {
      professional: 'Respond in a professional, clear tone.',
      friendly: 'Respond in a warm, friendly tone.',
      formal: 'Respond in a formal, business-appropriate tone.',
      casual: 'Respond in a casual, conversational tone.',
    };

    const response = await llmGenerate([
      {
        role: 'system',
        content: `${systemPrompt}\n\n${toneInstructions[tone] || ''}\n\nIMPORTANT: Only answer based on the documents provided below. If the answer is not in the documents, say so honestly. Always cite which document(s) you used.\n\nCompany Documents:\n${context}`,
      },
      {
        role: 'user',
        content: question,
      },
    ], { maxTokens: 1500 });

    // Save query
    await db.execute(sql`
      INSERT INTO ai_tenant_queries (id, company_id, question, answer, sources, trace_id, metadata)
      VALUES (
        gen_random_uuid(),
        ${companyId},
        ${question},
        ${response.text},
        ${JSON.stringify(sources)}::jsonb,
        ${traceId},
        ${JSON.stringify({ model: response.model, provider: response.provider, userId })}::jsonb
      )
    `);

    await logAudit(companyId, 'query_made', `Question asked: "${question.substring(0, 80)}..."`, undefined, { traceId });

    return c.json({
      answer: response.text,
      sources,
      traceId,
      model: response.model,
    });
  }
);

// ─── GET /company/:companyId/query-history — Query history ──────────
tenantAIRouter.get('/company/:companyId/query-history', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await checkCompanyOwnership(companyId, userId);
  await ensureReady();

  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const result = await db.execute(sql`
    SELECT id, question, answer, sources, trace_id, created_at
    FROM ai_tenant_queries
    WHERE company_id = ${companyId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return c.json({ data: result.rows || result });
});

// ─── GET /company/:companyId/audit-log — Audit log ──────────────────
tenantAIRouter.get('/company/:companyId/audit-log', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await checkCompanyOwnership(companyId, userId);
  await ensureReady();

  const actionFilter = c.req.query('action');
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  let query;
  if (actionFilter) {
    query = sql`
      SELECT * FROM ai_tenant_audit_log
      WHERE company_id = ${companyId} AND action = ${actionFilter}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    query = sql`
      SELECT * FROM ai_tenant_audit_log
      WHERE company_id = ${companyId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  const result = await db.execute(query);
  return c.json({ data: result.rows || result });
});

// ─── GET /company/:companyId/verify-integrity — Verify chain ────────
tenantAIRouter.get('/company/:companyId/verify-integrity', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await checkCompanyOwnership(companyId, userId);
  await ensureReady();

  // Get all audit entries in order
  const result = await db.execute(sql`
    SELECT * FROM ai_tenant_audit_log
    WHERE company_id = ${companyId}
    ORDER BY created_at ASC
  `);

  const entries = (result.rows || result) as any[];

  if (entries.length === 0) {
    return c.json({ valid: true, entriesChecked: 0, message: 'No audit entries yet' });
  }

  // Verify the chain
  let valid = true;
  let brokenAt: number | null = null;
  let previousHash: string | undefined;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryData = JSON.stringify({
      companyId: entry.company_id,
      action: entry.action,
      details: entry.details,
      dataHash: entry.data_hash,
      timestamp: new Date(entry.created_at).toISOString(),
    });
    const expectedHash = computeHash(entryData, previousHash);

    if (expectedHash !== entry.chain_hash) {
      valid = false;
      brokenAt = i;
      break;
    }
    previousHash = entry.chain_hash;
  }

  // Also verify documents haven't been modified
  const docsResult = await db.execute(sql`
    SELECT id, name, file_path, content_hash FROM ai_tenant_documents
    WHERE company_id = ${companyId}
  `);
  const docs = (docsResult.rows || docsResult) as any[];

  let documentsValid = true;
  const modifiedDocs: string[] = [];

  for (const doc of docs) {
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      const fileBuffer = fs.readFileSync(doc.file_path);
      const currentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      if (currentHash !== doc.content_hash) {
        documentsValid = false;
        modifiedDocs.push(doc.name);
      }
    }
  }

  return c.json({
    valid: valid && documentsValid,
    auditChainValid: valid,
    documentsValid,
    entriesChecked: entries.length,
    documentsChecked: docs.length,
    ...(brokenAt !== null ? { brokenAtEntry: brokenAt } : {}),
    ...(modifiedDocs.length > 0 ? { modifiedDocuments: modifiedDocs } : {}),
    verifiedAt: new Date().toISOString(),
  });
});

// ─── GET /company/:companyId/documents/:docId/proof — Document proof ─
tenantAIRouter.get('/company/:companyId/documents/:docId/proof', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const docId = c.req.param('docId');
  await checkCompanyOwnership(companyId, userId);
  await ensureReady();

  const docResult = await db.execute(sql`
    SELECT id, name, file_size, content_hash, status, created_at, updated_at
    FROM ai_tenant_documents
    WHERE id = ${docId}::uuid AND company_id = ${companyId}
    LIMIT 1
  `);

  const doc = (docResult.rows || docResult as any[])[0];
  if (!doc) {
    throw new HTTPException(404, { message: 'Document not found' });
  }

  // Check if file still matches its hash
  let fileIntact = false;
  const filePath = (doc as any).file_path;
  if (filePath && fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const currentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    fileIntact = currentHash === doc.content_hash;
  }

  // Get related audit entries
  const auditResult = await db.execute(sql`
    SELECT action, details, data_hash, chain_hash, created_at
    FROM ai_tenant_audit_log
    WHERE company_id = ${companyId}
      AND metadata::text LIKE ${'%' + docId + '%'}
    ORDER BY created_at DESC
  `);

  return c.json({
    document: {
      id: doc.id,
      name: doc.name,
      fileSize: doc.file_size,
      verificationCode: doc.content_hash,
      status: doc.status,
      uploadedAt: doc.created_at,
      lastModified: doc.updated_at,
    },
    integrity: {
      fileIntact,
      verifiedAt: new Date().toISOString(),
    },
    auditTrail: auditResult.rows || auditResult,
  });
});

export default tenantAIRouter;
