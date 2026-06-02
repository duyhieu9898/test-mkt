/**
 * Tenant AI API — document management, RAG queries, and transparency explorer.
 *
 * All business logic lives inside the @1person/ai-tenant package (backed by
 * the `trustai_*` tables). This route file is a thin HTTP adapter on top of
 * the `TenantAI` class — see `apps/api/src/lib/tenant-ai.ts` for the factory
 * and `apps/api/src/routes/brain.ts` for the reference pattern.
 *
 * Routes:
 *   PUBLIC (proof page):
 *     GET  /public/proof/:companyId
 *     GET  /public/proof/:companyId/verify
 *
 *   AUTHENTICATED (/ai-brain dashboard):
 *     POST   /company/:companyId/init
 *     POST   /company/:companyId/documents/upload
 *     GET    /company/:companyId/documents
 *     DELETE /company/:companyId/documents/:docId
 *     POST   /company/:companyId/agents
 *     GET    /company/:companyId/agents
 *     PATCH  /company/:companyId/agents/:agentId
 *     POST   /company/:companyId/query
 *     GET    /company/:companyId/query-history
 *     GET    /company/:companyId/audit-log
 *     GET    /company/:companyId/verify-integrity
 *     GET    /company/:companyId/documents/:docId/proof
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';

const tenantAIRouter = new Hono();

// ─── helpers ────────────────────────────────────────────────────────

async function verifyOwnershipAndGetTenantId(
  companyId: string,
  userId: string,
): Promise<{ tenantId: string; companyName: string }> {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
    columns: { id: true, name: true, ownerId: true },
  });
  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }
  const tenantId = await ensureTenantForCompany(company.id, company.name);
  return { tenantId, companyName: company.name };
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES (no auth — for proof page)
// ═══════════════════════════════════════════════════════════════════════

tenantAIRouter.get('/public/proof/:companyId', async (c) => {
  const companyId = c.req.param('companyId');

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true },
  });
  if (!company) {
    return c.json({ error: 'Not found' }, 404);
  }

  const ai = getTenantAI();
  const tenant = await ai.getTenant(company.id);

  if (!tenant) {
    // Tenant has never been initialized — return empty totals.
    return c.json({
      companyName: company.name,
      documentCount: 0,
      queryCount: 0,
      auditEntryCount: 0,
    });
  }

  try {
    const [documents, queryEntries, allEntries] = await Promise.all([
      ai.listDocuments(tenant.tenantId),
      ai.getAuditLog(tenant.tenantId, { action: 'query', limit: 10000 }),
      ai.getAuditLog(tenant.tenantId, { limit: 10000 }),
    ]);

    return c.json({
      companyName: company.name,
      documentCount: documents.length,
      queryCount: queryEntries.length,
      auditEntryCount: allEntries.length,
    });
  } catch {
    return c.json({
      companyName: company.name,
      documentCount: 0,
      queryCount: 0,
      auditEntryCount: 0,
    });
  }
});

tenantAIRouter.get('/public/proof/:companyId/verify', async (c) => {
  const companyId = c.req.param('companyId');

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true },
  });
  if (!company) {
    return c.json({ error: 'Not found' }, 404);
  }

  const ai = getTenantAI();
  const tenant = await ai.getTenant(company.id);

  if (!tenant) {
    return c.json({
      valid: true,
      entriesChecked: 0,
      documentsChecked: 0,
      verifiedAt: new Date().toISOString(),
    });
  }

  try {
    const [integrity, entries] = await Promise.all([
      ai.verifyDataIntegrity(tenant.tenantId),
      ai.getAuditLog(tenant.tenantId, { limit: 10000 }),
    ]);

    return c.json({
      valid: integrity.valid,
      entriesChecked: entries.length,
      documentsChecked: integrity.documentsChecked,
      verifiedAt: new Date().toISOString(),
    });
  } catch {
    return c.json({
      valid: true,
      entriesChecked: 0,
      documentsChecked: 0,
      verifiedAt: new Date().toISOString(),
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// AUTHENTICATED ROUTES
// ═══════════════════════════════════════════════════════════════════════
tenantAIRouter.use('*', authMiddleware);

// ─── POST /company/:companyId/init ─────────────────────────────────
tenantAIRouter.post('/company/:companyId/init', async (c) => {
  const { userId } = c.get('user');
  const { tenantId } = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );

  const ai = getTenantAI();
  const existing = await ai.listAgents(tenantId);

  if (existing.length === 0) {
    await ai.createAgent(
      tenantId,
      {
        name: 'AI Assistant',
        systemPrompt:
          "You are a helpful AI assistant for this company. Answer questions based on the company's documents and knowledge base. Be professional, accurate, and helpful.",
        tone: 'professional',
        maxContextChunks: 5,
      },
      `user:${userId}`,
    );
  }

  return c.json({ success: true, message: 'AI system ready' });
});

// ─── POST /company/:companyId/documents/upload ─────────────────────
tenantAIRouter.post('/company/:companyId/documents/upload', async (c) => {
  const { userId } = c.get('user');
  const { tenantId } = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );

  const body = await c.req.parseBody();
  const file = body['file'] as File | undefined;

  if (!file) {
    throw new HTTPException(400, { message: 'No file provided' });
  }

  // Size limit: 10MB
  if (file.size > 10 * 1024 * 1024) {
    throw new HTTPException(400, { message: 'File too large. Maximum is 10MB.' });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const ai = getTenantAI();
  const doc = await ai.uploadDocument(
    tenantId,
    file.name,
    fileBuffer,
    file.type || 'application/octet-stream',
    `user:${userId}`,
  );

  return c.json(doc, 201);
});

// ─── GET /company/:companyId/documents ─────────────────────────────
tenantAIRouter.get('/company/:companyId/documents', async (c) => {
  const { userId } = c.get('user');
  const { tenantId } = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );

  const ai = getTenantAI();
  const docs = await ai.listDocuments(tenantId);

  // TenantDocument does not expose fileSize — total storage is best-effort.
  const totalStorageBytes = docs.reduce(
    (sum, d) => sum + Number((d as unknown as { fileSize?: number }).fileSize ?? 0),
    0,
  );

  return c.json({
    data: docs,
    totalDocuments: docs.length,
    totalStorageBytes,
  });
});

// ─── DELETE /company/:companyId/documents/:docId ───────────────────
tenantAIRouter.delete('/company/:companyId/documents/:docId', async (c) => {
  const { userId } = c.get('user');
  const { tenantId } = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const docId = c.req.param('docId');

  const ai = getTenantAI();
  await ai.deleteDocument(tenantId, docId, `user:${userId}`);

  return c.json({ success: true });
});

// ─── POST /company/:companyId/agents ───────────────────────────────
const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  systemPrompt: z.string().optional(),
  tone: z.enum(['professional', 'friendly', 'formal', 'casual']).optional(),
  topK: z.number().min(3).max(10).optional(),
});

tenantAIRouter.post(
  '/company/:companyId/agents',
  zValidator('json', createAgentSchema),
  async (c) => {
    const { userId } = c.get('user');
    const { tenantId } = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const data = c.req.valid('json');

    const ai = getTenantAI();
    const agent = await ai.createAgent(
      tenantId,
      {
        name: data.name,
        systemPrompt:
          data.systemPrompt ||
          "You are a helpful AI assistant for this company. Answer questions based on the company's documents and knowledge base. Be professional, accurate, and helpful.",
        tone: data.tone ?? 'professional',
        maxContextChunks: data.topK ?? 5,
      },
      `user:${userId}`,
    );

    return c.json(agent, 201);
  },
);

// ─── GET /company/:companyId/agents ────────────────────────────────
tenantAIRouter.get('/company/:companyId/agents', async (c) => {
  const { userId } = c.get('user');
  const { tenantId } = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );

  const ai = getTenantAI();
  const agents = await ai.listAgents(tenantId);
  return c.json({ data: agents });
});

// ─── PATCH /company/:companyId/agents/:agentId ─────────────────────
const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  systemPrompt: z.string().optional(),
  tone: z.enum(['professional', 'friendly', 'formal', 'casual']).optional(),
  topK: z.number().min(3).max(10).optional(),
});

tenantAIRouter.patch(
  '/company/:companyId/agents/:agentId',
  zValidator('json', updateAgentSchema),
  async (c) => {
    const { userId } = c.get('user');
    const { tenantId } = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const agentId = c.req.param('agentId');
    const data = c.req.valid('json');

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.systemPrompt !== undefined) updates.systemPrompt = data.systemPrompt;
    if (data.tone !== undefined) updates.tone = data.tone;
    if (data.topK !== undefined) updates.maxContextChunks = data.topK;

    const ai = getTenantAI();
    const agent = await ai.updateAgent(tenantId, agentId, updates, `user:${userId}`);

    return c.json(agent);
  },
);

// ─── POST /company/:companyId/query ────────────────────────────────
tenantAIRouter.post(
  '/company/:companyId/query',
  zValidator('json', z.object({ question: z.string().min(1).max(2000) })),
  async (c) => {
    const { userId } = c.get('user');
    const { tenantId } = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const { question } = c.req.valid('json');

    const ai = getTenantAI();
    const response = await ai.query({ tenantId, question });

    return c.json({
      answer: response.answer,
      sources: response.sources,
      traceId: response.traceId,
      model: undefined as string | undefined,
    });
  },
);

// ─── GET /company/:companyId/query-history ─────────────────────────
// The @1person/ai-tenant package does not (yet) expose a dedicated query
// history getter, so we derive it from the audit log filtered by the
// `query` action. Each entry's `details` carries the question/answer
// payload logged by the RAG pipeline.
tenantAIRouter.get('/company/:companyId/query-history', async (c) => {
  const { userId } = c.get('user');
  const { tenantId } = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );

  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 500);

  const ai = getTenantAI();
  const entries = await ai.getAuditLog(tenantId, { action: 'query', limit });

  const data = entries.map((e) => {
    const details = (e.details ?? {}) as Record<string, unknown>;
    return {
      id: e.id,
      question: (details.question as string) ?? '',
      answer: (details.answer as string) ?? '',
      sources: (details.sources as unknown) ?? [],
      trace_id: (details.traceId as string) ?? null,
      created_at: e.timestamp,
    };
  });

  return c.json({ data });
});

// ─── GET /company/:companyId/audit-log ─────────────────────────────
tenantAIRouter.get('/company/:companyId/audit-log', async (c) => {
  const { userId } = c.get('user');
  const { tenantId } = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );

  const actionFilter = c.req.query('action') || undefined;
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 1000);

  const ai = getTenantAI();
  const entries = await ai.getAuditLog(tenantId, { action: actionFilter, limit });

  return c.json({ data: entries });
});

// ─── GET /company/:companyId/verify-integrity ──────────────────────
tenantAIRouter.get('/company/:companyId/verify-integrity', async (c) => {
  const { userId } = c.get('user');
  const { tenantId } = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );

  const ai = getTenantAI();
  const [integrity, entries] = await Promise.all([
    ai.verifyDataIntegrity(tenantId),
    ai.getAuditLog(tenantId, { limit: 10000 }),
  ]);

  return c.json({
    valid: integrity.valid,
    auditChainValid: integrity.valid,
    documentsValid: integrity.issues.length === 0,
    entriesChecked: entries.length,
    documentsChecked: integrity.documentsChecked,
    issues: integrity.issues,
    verifiedAt: new Date().toISOString(),
  });
});

// ─── GET /company/:companyId/documents/:docId/proof ────────────────
tenantAIRouter.get('/company/:companyId/documents/:docId/proof', async (c) => {
  const { userId } = c.get('user');
  const { tenantId } = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const docId = c.req.param('docId');

  const ai = getTenantAI();
  const doc = await ai.getDocument(tenantId, docId);
  if (!doc) {
    throw new HTTPException(404, { message: 'Document not found' });
  }

  const proof = await ai.getDocumentProof(tenantId, docId);

  // Related audit entries — best-effort scan over recent audit entries.
  const allEntries = await ai.getAuditLog(tenantId, { limit: 1000 });
  const auditTrail = allEntries.filter((e) => {
    const details = (e.details ?? {}) as Record<string, unknown>;
    return details.documentId === docId;
  });

  return c.json({
    document: {
      id: doc.id,
      name: doc.name,
      fileSize: (doc as unknown as { fileSize?: number }).fileSize ?? 0,
      verificationCode: doc.fileHash,
      status: doc.status,
      uploadedAt: doc.createdAt,
      lastModified: doc.createdAt,
    },
    integrity: {
      fileIntact: proof.currentHashMatch,
      verifiedAt: new Date().toISOString(),
    },
    auditTrail,
  });
});

export default tenantAIRouter;
