/**
 * Knowledge Center API Routes
 *
 * Upload documents, ingest URLs, manage knowledge.
 * All extracted knowledge flows into Memory System for agents/chatbot.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, ilike, or } from 'drizzle-orm';
import { db } from '../lib/db';
import { documents, knowledgeBase, companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { queueTaskExecution } from '../lib/queue';
import { knowledgeExtractionService } from '../services/knowledge-extraction';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';

const knowledgeRouter = new Hono();
knowledgeRouter.use('*', authMiddleware);

// Auto-mark stuck documents as failed (>5 min in processing)
setInterval(async () => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    await db.update(documents)
      .set({ status: 'failed', errorMessage: 'Processing timed out. Try re-uploading a smaller file.' })
      .where(and(
        eq(documents.status, 'processing' as any),
        // @ts-ignore
        documents.createdAt ? undefined : undefined // drizzle lt workaround below
      ));
    // Use raw SQL for the date comparison
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      UPDATE documents SET status = 'failed', error_message = 'Processing timed out. Try a smaller file.'
      WHERE status = 'processing' AND created_at < ${fiveMinAgo}
    `);
  } catch {}
}, 60000); // Check every minute

// Upload file (PDF, doc, image)
knowledgeRouter.post('/company/:companyId/upload', async (c) => {
  const companyId = c.req.param('companyId');
  const body = await c.req.parseBody();
  const file = body['file'] as File | undefined;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const name = (body['name'] as string) || file.name || 'Uploaded Document';

  // File size limit: 10MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    return c.json({
      error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 10MB.`,
    }, 400);
  }

  // Prevent duplicate file uploads
  const existingFile = await db.query.documents.findFirst({
    where: and(eq(documents.companyId, companyId), eq(documents.name, name)),
  });
  if (existingFile) {
    return c.json({ id: existingFile.id, name: existingFile.name, message: 'This file was already uploaded' });
  }

  const fileType = file.name?.endsWith('.pdf') ? 'pdf' :
    file.name?.match(/\.(png|jpg|jpeg|gif)$/i) ? 'image' :
    file.name?.match(/\.(mp3|wav|m4a)$/i) ? 'audio' :
    file.name?.match(/\.(doc|docx)$/i) ? 'doc' : 'text';

  // Save file to local storage
  const fs = await import('fs');
  const path = await import('path');
  const uploadDir = path.join(process.cwd(), '..', '..', 'deploy', 'knowledge', companyId);
  fs.mkdirSync(uploadDir, { recursive: true });

  const fileName = `${Date.now()}-${file.name || 'document'}`;
  const filePath = path.join(uploadDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Create document record
  const [doc] = await db.insert(documents).values({
    companyId,
    name,
    type: fileType as any,
    fileUrl: filePath,
    fileSize: buffer.length,
    status: 'processing',
  }).returning();

  // W0.1 — dual-write to the trust-grade @1person/ai-tenant pipeline.
  // Non-fatal: the legacy `documents` table is still authoritative for
  // Phase 0 so any failure here must not break the upload. Once Phase 1A
  // lands (pgvector + multi-LLM) the trust pipeline becomes authoritative
  // and this dual-write collapses into a single call.
  (async () => {
    try {
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
        columns: { id: true, name: true },
      });
      if (!company) return;

      const tenantId = await ensureTenantForCompany(company.id, company.name);
      const ai = getTenantAI();
      await ai.uploadDocument(
        tenantId,
        name,
        buffer,
        file.type || 'application/octet-stream',
        'user:upload',
      );
    } catch (err) {
      // Log only — legacy path already succeeded so the user is unaffected.
      console.error('[W0.1 dual-write] TenantAI.uploadDocument failed:', err);
    }
  })();

  // For text/PDF: extract immediately (small enough)
  if (fileType === 'pdf' || fileType === 'text' || fileType === 'doc') {
    // Queue extraction task
    try {
      await queueTaskExecution({
        taskId: doc.id,
        agentId: '',
        companyId,
        taskType: 'extract_document',
        title: `Extract knowledge from ${name}`,
        description: `Processing uploaded ${fileType} document`,
        input: { documentId: doc.id },
        priority: 'high',
      });
    } catch {
      // If queue unavailable, extract inline with timeout
      try {
        const extractionPromise = async () => {
          const rawText = fileType === 'pdf'
            ? await knowledgeExtractionService.extractFromPDF(buffer)
            : buffer.toString('utf-8');
          const truncated = rawText.substring(0, 15000); // Limit text for LLM
          const entries = await knowledgeExtractionService.structureContent(truncated, name);
          return { rawText: truncated, entries };
        };

        // 60 second timeout
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Extraction timed out. Try a smaller file.')), 60000)
        );

        const { rawText, entries } = await Promise.race([extractionPromise(), timeout]);

        await db.update(documents).set({
          status: 'extracted',
          rawContent: rawText.substring(0, 50000),
          extractedContent: entries as any,
          updatedAt: new Date(),
        }).where(eq(documents.id, doc.id));
      } catch (err) {
        await db.update(documents).set({
          status: 'failed',
          errorMessage: 'Could not process this document. Please try uploading again.',
        }).where(eq(documents.id, doc.id));
      }
    }
  }

  return c.json({ id: doc.id, status: doc.status, name: doc.name });
});

// Ingest URL
knowledgeRouter.post(
  '/company/:companyId/ingest-url',
  zValidator('json', z.object({ url: z.string().min(5), name: z.string().optional() })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { url, name } = c.req.valid('json');

    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const docName = name || new URL(normalizedUrl).hostname;

    // Prevent duplicate URLs
    const existing = await db.query.documents.findFirst({
      where: and(
        eq(documents.companyId, companyId),
        eq(documents.sourceUrl, normalizedUrl)
      ),
    });

    if (existing) {
      return c.json({ id: existing.id, name: existing.name, message: 'This URL was already added' });
    }

    const [doc] = await db.insert(documents).values({
      companyId,
      name: docName,
      type: 'url',
      sourceUrl: normalizedUrl,
      status: 'processing',
    }).returning();

    // Extract inline (URLs are fast)
    try {
      const rawText = await knowledgeExtractionService.extractFromURL(url);
      const entries = await knowledgeExtractionService.structureContent(rawText, docName);

      await db.update(documents).set({
        status: 'extracted',
        rawContent: rawText.substring(0, 50000),
        extractedContent: entries as any,
        updatedAt: new Date(),
      }).where(eq(documents.id, doc.id));
    } catch (err) {
      await db.update(documents).set({
        status: 'failed',
        errorMessage: 'Could not extract content from this URL. Please check the link and try again.',
      }).where(eq(documents.id, doc.id));
    }

    return c.json({ id: doc.id, name: docName });
  }
);

// Add manual text knowledge
knowledgeRouter.post(
  '/company/:companyId/add-text',
  zValidator('json', z.object({
    title: z.string().min(2),
    content: z.string().min(10),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { title, content, category, tags } = c.req.valid('json');

    // Create document
    const [doc] = await db.insert(documents).values({
      companyId,
      name: title,
      type: 'text',
      rawContent: content,
      extractedContent: [{
        category: category || 'general',
        title,
        content,
        tags: tags || [],
        confidence: 1.0,
      }] as any,
      status: 'approved', // Manual text is auto-approved
      approvedAt: new Date(),
    }).returning();

    // Also save directly to knowledge_base (approved = active knowledge)
    await db.insert(knowledgeBase).values({
      companyId,
      category: category || 'general',
      title,
      content,
      source: `document:${doc.id}`,
    });

    return c.json({ id: doc.id, status: 'approved' });
  }
);

// List documents
knowledgeRouter.get('/company/:companyId/documents', async (c) => {
  const companyId = c.req.param('companyId');
  const status = c.req.query('status');

  const conditions = [eq(documents.companyId, companyId)];
  if (status) conditions.push(eq(documents.status, status as any));

  const docs = await db
    .select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt))
    .limit(50);

  return c.json({ data: docs });
});

// Get document detail
knowledgeRouter.get('/company/:companyId/documents/:id', async (c) => {
  const docId = c.req.param('id');

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, docId),
  });

  if (!doc) return c.json({ error: 'Document not found' }, 404);
  return c.json(doc);
});

// Update document metadata (visibility, name)
knowledgeRouter.patch(
  '/company/:companyId/documents/:docId',
  zValidator('json', z.object({
    visibility: z.enum(['public', 'internal', 'confidential']).optional(),
    name: z.string().optional(),
  })),
  async (c) => {
    const docId = c.req.param('docId');
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');
    const [updated] = await db.update(documents).set({
      ...(body.visibility ? { visibility: body.visibility as any } : {}),
      ...(body.name ? { name: body.name } : {}),
      updatedAt: new Date(),
    }).where(and(eq(documents.id, docId), eq(documents.companyId, companyId))).returning();
    if (!updated) return c.json({ error: 'Document not found' }, 404);
    return c.json(updated);
  }
);

// Approve document → save extracted knowledge to knowledge_base
knowledgeRouter.patch('/company/:companyId/documents/:id/approve', async (c) => {
  const companyId = c.req.param('companyId');
  const docId = c.req.param('id');
  const { userId } = c.get('user');

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, docId),
  });

  if (!doc) return c.json({ error: 'Document not found' }, 404);

  // Update document status
  await db.update(documents).set({
    status: 'approved',
    approvedAt: new Date(),
    approvedBy: userId,
    updatedAt: new Date(),
  }).where(eq(documents.id, docId));

  // Save extracted entries to knowledge_base (active knowledge for agents/chatbot)
  const entries = (doc.extractedContent as any[]) || [];
  let saved = 0;

  for (const entry of entries) {
    try {
      await db.insert(knowledgeBase).values({
        companyId,
        category: entry.category || 'general',
        title: entry.title,
        content: entry.content,
        source: `document:${docId}`,
        confidence: entry.confidence,
        // B1 fix (doc 11 §7): copy document visibility so public docs
        // produce public knowledge entries reachable by public chatbot widgets
        visibility: (doc as any).visibility || 'internal',
      });
      saved++;
    } catch {}
  }

  return c.json({ approved: true, knowledgeEntriesSaved: saved });
});

// Reject document
knowledgeRouter.patch('/company/:companyId/documents/:id/reject', async (c) => {
  const docId = c.req.param('id');

  await db.update(documents).set({
    status: 'rejected',
    updatedAt: new Date(),
  }).where(eq(documents.id, docId));

  return c.json({ rejected: true });
});

// Delete document
knowledgeRouter.delete('/company/:companyId/documents/:id', async (c) => {
  const docId = c.req.param('id');
  await db.delete(documents).where(eq(documents.id, docId));
  return c.json({ deleted: true });
});

// Search knowledge
knowledgeRouter.get('/company/:companyId/search', async (c) => {
  const companyId = c.req.param('companyId');
  const q = c.req.query('q') || '';
  const category = c.req.query('category');

  const conditions = [eq(knowledgeBase.companyId, companyId)];
  if (category) conditions.push(eq(knowledgeBase.category, category));

  let query = db
    .select()
    .from(knowledgeBase)
    .where(and(...conditions))
    .orderBy(desc(knowledgeBase.updatedAt))
    .limit(30);

  const results = await query;

  // Filter by search term in JS (simpler than dynamic SQL)
  const filtered = q
    ? results.filter((r) =>
        r.title.toLowerCase().includes(q.toLowerCase()) ||
        r.content.toLowerCase().includes(q.toLowerCase())
      )
    : results;

  return c.json({ data: filtered });
});

export default knowledgeRouter;
