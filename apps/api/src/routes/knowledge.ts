/**
 * Knowledge Center API Routes
 *
 * Upload documents, ingest URLs, manage knowledge.
 * All extracted knowledge flows into Memory System for agents/chatbot.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { eq, and, desc, ilike, or, count, like } from 'drizzle-orm';
import { db } from '../lib/db';
import { documents, knowledgeBase } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { queueTaskExecution } from '../lib/queue';
import { knowledgeExtractionService } from '../services/knowledge-extraction';
import { assertCompanyAccess } from '../lib/company-access';
import { llmGenerate } from '../lib/llm';
import { semanticSearch } from '../services/embedding-service';
import {
  ensureApprovedKnowledgeIndexed,
  removeApprovedKnowledge,
  replaceApprovedKnowledge,
} from '../services/knowledge-lifecycle';
import { discoverKnowledgeCrawlData } from '../services/knowledge-crawl-discovery';
import { ensureSufficientCredits, chargeFixedCredits } from '../lib/credits';
import { FIXED_CREDIT_COSTS } from '../lib/credit-costs';
import {
  deleteObjectByStorageReference,
  isObjectStorageReference,
  objectStorageReference,
  saveObject,
} from '../services/object-storage';

const knowledgeRouter = new Hono();
knowledgeRouter.use('*', authMiddleware);
knowledgeRouter.use('/company/:companyId/*', async (c, next) => {
  await assertCompanyAccess(c.req.param('companyId'), c.get('user').userId);
  await next();
});

// Auto-mark stuck documents as failed (>5 min in processing)
setInterval(async () => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      UPDATE documents SET status = 'failed', error_message = 'Processing timed out. Try a smaller file.'
      WHERE status = 'processing' AND created_at < ${fiveMinAgo}
    `);
  } catch {}
}, 60000); // Check every minute

function sanitizeFileName(name?: string): string {
  return (name || 'document').replace(/[/\\]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function contentTypeForDocument(file: File): string {
  if (file.type) return file.type;
  const lower = (file.name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

async function resolveLegacyKnowledgePath(companyId: string, fileUrl: string): Promise<string | null> {
  const path = await import('node:path');
  const storageRoot = path.resolve(process.cwd(), '..', '..', 'deploy', 'knowledge', companyId);
  const resolvedPath = path.resolve(fileUrl);
  const relativePath = path.relative(storageRoot, resolvedPath);

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return resolvedPath;
}

async function deleteStoredDocumentFile(companyId: string, fileUrl?: string | null): Promise<void> {
  if (!fileUrl) return;
  if (isObjectStorageReference(fileUrl)) {
    await deleteObjectByStorageReference(fileUrl).catch(() => undefined);
    return;
  }

  const localPath = await resolveLegacyKnowledgePath(companyId, fileUrl);
  if (localPath) {
    const fileSystem = await import('node:fs/promises');
    await fileSystem.unlink(localPath).catch(() => undefined);
  }
}

// Upload file (PDF, doc, image)
knowledgeRouter.post('/company/:companyId/upload', async (c) => {
  const companyId = c.req.param('companyId');
  const body = await c.req.parseBody();
  const file = body['file'] as File | undefined;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const name = (body['name'] as string) || file.name || 'Uploaded Document';
  const lowerFileName = (file.name || '').toLowerCase();
  const supportedExtension = ['.pdf', '.docx', '.txt', '.md'].some((extension) =>
    lowerFileName.endsWith(extension)
  );
  if (!supportedExtension) {
    return c.json({
      error: 'Unsupported file. Upload a PDF, DOCX, TXT, or Markdown document.',
    }, 400);
  }

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
    const isStale = ['processing', 'uploading'].includes(existingFile.status)
      && Date.now() - existingFile.updatedAt.getTime() > 2 * 60 * 1000;
    const canRetry = ['failed', 'rejected'].includes(existingFile.status) || isStale;

    if (!canRetry) {
      return c.json({
        id: existingFile.id,
        name: existingFile.name,
        status: existingFile.status,
        message: 'This file was already uploaded',
      });
    }

    // A failed/stale attempt must not block the user from selecting the same
    // file again. Its derived knowledge and stored source file are cleaned first.
    await removeApprovedKnowledge(companyId, `document:${existingFile.id}`);
    await db.delete(documents).where(and(
      eq(documents.id, existingFile.id),
      eq(documents.companyId, companyId),
    ));
    await deleteStoredDocumentFile(companyId, existingFile.fileUrl);
  }

  const fileType = lowerFileName.endsWith('.pdf') ? 'pdf' :
    file.name?.match(/\.(png|jpg|jpeg|gif)$/i) ? 'image' :
    file.name?.match(/\.(mp3|wav|m4a)$/i) ? 'audio' :
    lowerFileName.endsWith('.docx') ? 'doc' : 'text';

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeOriginalName = sanitizeFileName(file.name || 'document');
  const fileName = `${randomUUID()}-${safeOriginalName}`;
  const stored = await saveObject({
    key: `knowledge/${companyId}/documents/${fileName}`,
    body: buffer,
    contentType: contentTypeForDocument(file),
    cacheControl: 'private, max-age=0, no-store',
  });

  // Create document record
  const [doc] = await db.insert(documents).values({
    companyId,
    name,
    type: fileType as any,
    fileUrl: objectStorageReference(stored.key),
    fileSize: buffer.length,
    status: 'processing',
  }).returning();
  if (!doc) return c.json({ error: 'Could not create document' }, 500);

  // For text/PDF: extract immediately (small enough)
  if (fileType === 'pdf' || fileType === 'text' || fileType === 'doc') {
    // Queue extraction task
    try {
      await Promise.race([
        queueTaskExecution({
          taskId: doc.id,
          agentId: '',
          companyId,
          taskType: 'extract_document',
          title: `Extract knowledge from ${name}`,
          description: `Processing uploaded ${fileType} document`,
          input: { documentId: doc.id },
          priority: 'high',
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Document processing queue is unavailable')), 5000)
        ),
      ]);
    } catch {
      // If queue unavailable, extract inline with timeout
      try {
        const extractionPromise = async () => {
          const rawText = await knowledgeExtractionService.extractFromDocument(
            buffer,
            file.name || name,
            fileType,
          );
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
        const message = err instanceof Error
          ? err.message
          : 'Could not process this document. Please try uploading again.';
        await db.update(documents).set({
          status: 'failed',
          errorMessage: message,
          updatedAt: new Date(),
        }).where(eq(documents.id, doc.id));
      }
    }
  }

  return c.json({ id: doc.id, status: 'processing', name: doc.name }, 202);
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
    if (!doc) return c.json({ error: 'Could not create document' }, 500);

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

// Discover public company data from the saved website + public search sources.
// This route is intentionally read-only: the user reviews sources before they
// become Knowledge documents.
knowledgeRouter.get('/company/:companyId/crawl/discover', async (c) => {
  const companyId = c.req.param('companyId');
  await ensureSufficientCredits(companyId, FIXED_CREDIT_COSTS.knowledgeCrawlDiscover);
  const result = await discoverKnowledgeCrawlData(companyId, {
    query: c.req.query('q')?.trim() || null,
    websiteUrl: c.req.query('websiteUrl')?.trim() || null,
    language: c.req.query('language')?.trim() || null,
  });
  await chargeFixedCredits(companyId, FIXED_CREDIT_COSTS.knowledgeCrawlDiscover, {
    featureKey: 'knowledge_crawl_discover',
    refKind: 'knowledge_crawl',
    refId: companyId,
    note: 'Discovered public crawl sources for Knowledge',
  });
  return c.json(result);
});

const crawlImportSchema = z.object({
  visibility: z.enum(['public', 'internal', 'confidential']).optional(),
  sources: z.array(z.object({
    url: z.string().min(5).max(2048),
    title: z.string().max(255).optional(),
    type: z.string().max(80).optional(),
    snippet: z.string().max(1000).optional(),
  })).min(1).max(8),
});

function normalizeImportUrl(value: string): string {
  const raw = value.trim();
  const url = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

// Import selected crawl sources into the existing Knowledge document lifecycle.
// Imported URLs become `extracted` documents, so the user can inspect and
// approve them before they affect the company brain/chatbot.
knowledgeRouter.post(
  '/company/:companyId/crawl/import',
  zValidator('json', crawlImportSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { sources, visibility } = c.req.valid('json');

    const results: Array<{
      url: string;
      ok: boolean;
      status: 'imported' | 'skipped' | 'failed';
      documentId?: string;
      message?: string;
    }> = [];

    for (const source of sources) {
      let normalizedUrl = '';
      try {
        normalizedUrl = normalizeImportUrl(source.url);
      } catch {
        results.push({ url: source.url, ok: false, status: 'failed', message: 'Invalid URL' });
        continue;
      }

      const existing = await db.query.documents.findFirst({
        where: and(
          eq(documents.companyId, companyId),
          eq(documents.sourceUrl, normalizedUrl),
        ),
      });
      if (existing) {
        results.push({
          url: normalizedUrl,
          ok: true,
          status: 'skipped',
          documentId: existing.id,
          message: 'Already added',
        });
        continue;
      }

      const docName = (source.title || new URL(normalizedUrl).hostname).slice(0, 255);
      const [doc] = await db.insert(documents).values({
        companyId,
        name: docName,
        type: 'url',
        sourceUrl: normalizedUrl,
        status: 'processing',
        visibility: visibility || 'internal',
        tags: ['crawl-data', source.type || 'web'],
      }).returning();

      if (!doc) {
        results.push({ url: normalizedUrl, ok: false, status: 'failed', message: 'Could not create document' });
        continue;
      }

      try {
        const rawText = await knowledgeExtractionService.extractFromURL(normalizedUrl);
        const contentForAi = [
          source.snippet ? `Search snippet: ${source.snippet}` : '',
          rawText,
        ].filter(Boolean).join('\n\n');
        const entries = await knowledgeExtractionService.structureContent(contentForAi, docName);

        await db.update(documents).set({
          status: 'extracted',
          rawContent: contentForAi.substring(0, 50000),
          extractedContent: entries as any,
          updatedAt: new Date(),
        }).where(eq(documents.id, doc.id));

        results.push({
          url: normalizedUrl,
          ok: true,
          status: 'imported',
          documentId: doc.id,
          message: 'Ready for review',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not read this source';
        await db.update(documents).set({
          status: 'failed',
          errorMessage: message,
          updatedAt: new Date(),
        }).where(eq(documents.id, doc.id));
        results.push({ url: normalizedUrl, ok: false, status: 'failed', documentId: doc.id, message });
      }
    }

    return c.json({
      imported: results.filter((result) => result.status === 'imported').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      failed: results.filter((result) => result.status === 'failed').length,
      results,
    });
  },
);

// Add manual text knowledge
knowledgeRouter.post(
  '/company/:companyId/add-text',
  zValidator('json', z.object({
    title: z.string().min(2),
    content: z.string().min(10),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    visibility: z.enum(['public', 'internal', 'confidential']).optional(),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { title, content, category, tags, visibility } = c.req.valid('json');

    // Create document
    const [doc] = await db.insert(documents).values({
      companyId,
      name: title,
      type: 'text',
      tags: tags || [],
      visibility: visibility || 'internal',
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
    if (!doc) return c.json({ error: 'Could not create document' }, 500);

    const sync = await replaceApprovedKnowledge({
      companyId,
      source: `document:${doc.id}`,
      verifiedByUserId: c.get('user').userId,
      items: [{
        category: category || 'general',
        title,
        content,
        visibility: visibility || 'internal',
        tags: tags || [],
      }],
    });

    return c.json({ id: doc.id, status: 'approved', ...sync });
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
  const companyId = c.req.param('companyId');
  const docId = c.req.param('id');

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.companyId, companyId)),
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

    // Keep approved chatbot knowledge in sync when visibility changes after
    // approval; otherwise Public/Internal/Admin levels read stale access data.
    if (body.visibility) {
      await db
        .update(knowledgeBase)
        .set({ visibility: body.visibility, updatedAt: new Date() })
        .where(and(
          eq(knowledgeBase.companyId, companyId),
          eq(knowledgeBase.source, `document:${docId}`),
        ));
    }

    return c.json(updated);
  }
);

// Approve document → save extracted knowledge to knowledge_base
knowledgeRouter.patch('/company/:companyId/documents/:id/approve', async (c) => {
  const companyId = c.req.param('companyId');
  const docId = c.req.param('id');
  const { userId } = c.get('user');

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.companyId, companyId)),
  });

  if (!doc) return c.json({ error: 'Document not found' }, 404);

  if (doc.status !== 'extracted' && doc.status !== 'approved') {
    return c.json({ error: 'This document is not ready for review yet' }, 409);
  }

  const entries = (doc.extractedContent as any[]) || [];
  if (entries.length === 0) {
    return c.json({ error: 'No knowledge was extracted from this document' }, 400);
  }
  const documentTags = Array.isArray((doc as any).tags) ? ((doc as any).tags as string[]) : [];
  const sync = await replaceApprovedKnowledge({
    companyId,
    source: `document:${docId}`,
    verifiedByUserId: userId,
    items: entries.map((entry) => ({
      category: entry.category || 'general',
      title: entry.title || doc.name,
      content: entry.content || '',
      confidence: entry.confidence,
      visibility: (doc as any).visibility || 'internal',
      tags: [...new Set([
        ...documentTags,
        ...(Array.isArray(entry.tags) ? entry.tags : []),
      ])],
    })),
  });

  await db.update(documents).set({
    status: 'approved',
    approvedAt: new Date(),
    approvedBy: userId,
    updatedAt: new Date(),
  }).where(and(eq(documents.id, docId), eq(documents.companyId, companyId)));

  return c.json({
    approved: true,
    knowledgeEntriesSaved: sync.saved,
    searchEntriesIndexed: sync.indexed,
    indexingFailed: sync.indexingFailed,
  });
});

// Reject document
knowledgeRouter.patch('/company/:companyId/documents/:id/reject', async (c) => {
  const companyId = c.req.param('companyId');
  const docId = c.req.param('id');

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.companyId, companyId)),
    columns: { id: true },
  });
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  await removeApprovedKnowledge(companyId, `document:${docId}`);
  await db.update(documents).set({
    status: 'rejected',
    updatedAt: new Date(),
  }).where(and(eq(documents.id, docId), eq(documents.companyId, companyId)));

  return c.json({ rejected: true });
});

// Delete document
knowledgeRouter.delete('/company/:companyId/documents/:id', async (c) => {
  const companyId = c.req.param('companyId');
  const docId = c.req.param('id');
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.companyId, companyId)),
  });
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  await removeApprovedKnowledge(companyId, `document:${docId}`);
  await db.delete(documents).where(and(eq(documents.id, docId), eq(documents.companyId, companyId)));
  await deleteStoredDocumentFile(companyId, doc.fileUrl);
  return c.json({ deleted: true });
});

// Search knowledge
knowledgeRouter.get('/company/:companyId/search', async (c) => {
  const companyId = c.req.param('companyId');
  const q = c.req.query('q') || '';
  const category = c.req.query('category');

  const sourceFilter = or(
    like(knowledgeBase.source, 'document:%'),
    like(knowledgeBase.source, 'meeting:%'),
  );
  const conditions = [eq(knowledgeBase.companyId, companyId), sourceFilter];
  if (category) conditions.push(eq(knowledgeBase.category, category));
  if (q) {
    const textFilter = or(
      ilike(knowledgeBase.title, `%${q}%`),
      ilike(knowledgeBase.content, `%${q}%`),
    );
    if (textFilter) conditions.push(textFilter);
  }

  const results = await db
    .select()
    .from(knowledgeBase)
    .where(and(...conditions))
    .orderBy(desc(knowledgeBase.updatedAt))
    .limit(100);
  const [summary] = await db
    .select({ total: count() })
    .from(knowledgeBase)
    .where(and(eq(knowledgeBase.companyId, companyId), sourceFilter));

  return c.json({ data: results, total: summary?.total ?? 0 });
});

// Ask only approved company knowledge using the shared vector index.
knowledgeRouter.post(
  '/company/:companyId/query',
  zValidator('json', z.object({ question: z.string().trim().min(3).max(2000) })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { question } = c.req.valid('json');
    await ensureApprovedKnowledgeIndexed(companyId);
    const hits = await semanticSearch(companyId, question, {
      sourceTypes: ['knowledge_base'],
      limit: 8,
      minScore: 0.15,
    });

    if (hits.length === 0) {
      return c.json({
        answer: "I couldn't find enough approved knowledge to answer that yet.",
        sources: [],
      });
    }

    const context = hits.map((hit, index) =>
      `[Source ${index + 1}: ${String(hit.metadata.title || 'Company knowledge')}]\n${hit.chunkText}`
    ).join('\n\n');
    const response = await llmGenerate([
      {
        role: 'system',
        content: 'Answer using only the approved company knowledge provided. Cite supporting sources as [Source N]. If the sources do not contain the answer, say so clearly. Be concise and factual.',
      },
      {
        role: 'user',
        content: `APPROVED KNOWLEDGE:\n${context}\n\nQUESTION:\n${question}`,
      },
    ], {
      maxTokens: 1000,
      traceName: 'knowledge.query',
      metadata: { companyId, sourceCount: hits.length },
    });

    return c.json({
      answer: response.text,
      traceId: response.traceId,
      sources: hits.map((hit) => ({
        documentId: hit.sourceId,
        documentName: String(hit.metadata.title || 'Company knowledge'),
        chunkText: hit.chunkText,
        score: hit.score,
      })),
    });
  },
);

export default knowledgeRouter;
