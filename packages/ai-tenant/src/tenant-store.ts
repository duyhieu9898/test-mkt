// =============================================================================
// @1person/ai-tenant — Tenant Store (Document Management)
// =============================================================================
// Manages document upload, storage, processing, and deletion with full
// data isolation per tenant. Every document is stored in a tenant-specific
// directory and every DB query filters by tenantId.
//
// RULES:
// - File storage is per-tenant: {storagePath}/{tenantId}/
// - EVERY database query MUST filter by tenantId
// - EVERY mutation creates an audit log entry
// =============================================================================

import { createHash } from 'crypto';
import { mkdir, writeFile, readFile, unlink, access } from 'fs/promises';
import { join } from 'path';
import { eq, and } from 'drizzle-orm';
import { tenantDocuments, documentChunks } from './schema.js';
import { logAction, sha256 } from './audit-trail.js';
import { chunkText, storeChunks } from './rag-pipeline.js';
import type { Database } from './db.js';
import type { TenantDocument, EmbeddingConfig } from './types.js';

// ---------------------------------------------------------------------------
// Document upload
// ---------------------------------------------------------------------------

/**
 * Upload a document for a tenant.
 * Computes a SHA-256 hash for integrity verification, stores the file
 * in a tenant-isolated directory, and creates a database record.
 */
export async function uploadDocument(
  db: Database,
  storagePath: string,
  tenantId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
  actor: string = 'system',
): Promise<TenantDocument> {
  // Compute file hash for integrity verification
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

  // Ensure tenant storage directory exists
  const tenantDir = join(storagePath, tenantId);
  await mkdir(tenantDir, { recursive: true });

  // Save file to tenant-isolated directory
  // Use hash prefix in filename to avoid collisions
  const safeFileName = `${fileHash.slice(0, 8)}_${sanitizeFileName(fileName)}`;
  const filePath = join(tenantDir, safeFileName);
  await writeFile(filePath, fileBuffer);

  // Create document record
  const [doc] = await db
    .insert(tenantDocuments)
    .values({
      tenantId,
      name: fileName,
      mimeType,
      fileSize: fileBuffer.length,
      fileHash,
      filePath,
      chunkCount: 0,
      status: 'uploading',
      metadata: {},
    })
    .returning();

  if (!doc) {
    throw new Error('Unable to save document record. Please try again.');
  }

  // Log to audit trail
  await logAction(db, tenantId, 'document_upload', actor, {
    documentId: doc.id,
    fileName,
    mimeType,
    fileSize: fileBuffer.length,
    fileHash,
  }, fileHash);

  return mapToTenantDocument(doc);
}

// ---------------------------------------------------------------------------
// Document processing (extract text -> chunk -> embed -> store)
// ---------------------------------------------------------------------------

/**
 * Process an uploaded document: extract text, chunk it, generate embeddings,
 * and store the chunks in the database.
 */
export async function processDocument(
  db: Database,
  storagePath: string,
  tenantId: string,
  documentId: string,
  embeddingConfig: EmbeddingConfig,
): Promise<void> {
  // Fetch the document record — ALWAYS filter by tenantId
  const docs = await db
    .select()
    .from(tenantDocuments)
    .where(
      and(
        eq(tenantDocuments.id, documentId),
        eq(tenantDocuments.tenantId, tenantId),
      ),
    )
    .limit(1);

  const doc = docs[0];
  if (!doc) {
    throw new Error('Document not found. It may have been deleted.');
  }

  try {
    // Update status to processing
    await db
      .update(tenantDocuments)
      .set({ status: 'processing' })
      .where(
        and(
          eq(tenantDocuments.id, documentId),
          eq(tenantDocuments.tenantId, tenantId),
        ),
      );

    // Read the file
    const filePath = doc.filePath;
    if (!filePath) {
      throw new Error('Document file path is missing.');
    }

    const fileBuffer = await readFile(filePath);

    // Extract text based on mime type
    const text = extractText(fileBuffer, doc.mimeType);

    if (!text || text.trim().length === 0) {
      throw new Error('No text content could be extracted from this document.');
    }

    // Chunk the text
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw new Error('Document produced no usable text chunks.');
    }

    // Generate embeddings and store chunks
    await storeChunks(db, tenantId, documentId, chunks, embeddingConfig);

    // Update document status to ready
    await db
      .update(tenantDocuments)
      .set({ status: 'ready', chunkCount: chunks.length })
      .where(
        and(
          eq(tenantDocuments.id, documentId),
          eq(tenantDocuments.tenantId, tenantId),
        ),
      );

    // Log processing completion
    await logAction(db, tenantId, 'data_access', 'system', {
      action: 'document_processed',
      documentId,
      chunkCount: chunks.length,
    });
  } catch (error) {
    // Mark document as failed
    await db
      .update(tenantDocuments)
      .set({ status: 'failed' })
      .where(
        and(
          eq(tenantDocuments.id, documentId),
          eq(tenantDocuments.tenantId, tenantId),
        ),
      );

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Document deletion
// ---------------------------------------------------------------------------

/**
 * Delete a document, its file, and all associated chunks.
 * Logs the deletion to the audit trail including the file hash.
 */
export async function deleteDocument(
  db: Database,
  tenantId: string,
  documentId: string,
  actor: string = 'system',
): Promise<void> {
  // Fetch document — ALWAYS filter by tenantId
  const docs = await db
    .select()
    .from(tenantDocuments)
    .where(
      and(
        eq(tenantDocuments.id, documentId),
        eq(tenantDocuments.tenantId, tenantId),
      ),
    )
    .limit(1);

  const doc = docs[0];
  if (!doc) {
    throw new Error('Document not found. It may have already been deleted.');
  }

  // Delete the physical file
  if (doc.filePath) {
    try {
      await access(doc.filePath);
      await unlink(doc.filePath);
    } catch {
      // File may already be deleted — continue with DB cleanup
    }
  }

  // Delete chunks first (child records)
  await db
    .delete(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, documentId),
        eq(documentChunks.tenantId, tenantId),
      ),
    );

  // Delete the document record
  await db
    .delete(tenantDocuments)
    .where(
      and(
        eq(tenantDocuments.id, documentId),
        eq(tenantDocuments.tenantId, tenantId),
      ),
    );

  // Log to audit trail — include hash of deleted data for verification
  await logAction(db, tenantId, 'document_delete', actor, {
    documentId,
    fileName: doc.name,
    fileHash: doc.fileHash,
  }, doc.fileHash);
}

// ---------------------------------------------------------------------------
// Document listing
// ---------------------------------------------------------------------------

/**
 * List all documents for a tenant. ALWAYS filters by tenantId.
 */
export async function listDocuments(
  db: Database,
  tenantId: string,
): Promise<TenantDocument[]> {
  const docs = await db
    .select()
    .from(tenantDocuments)
    .where(eq(tenantDocuments.tenantId, tenantId))
    .orderBy(tenantDocuments.createdAt);

  return docs.map(mapToTenantDocument);
}

/**
 * Get a single document by ID. ALWAYS filters by tenantId.
 */
export async function getDocument(
  db: Database,
  tenantId: string,
  documentId: string,
): Promise<TenantDocument | null> {
  const docs = await db
    .select()
    .from(tenantDocuments)
    .where(
      and(
        eq(tenantDocuments.id, documentId),
        eq(tenantDocuments.tenantId, tenantId),
      ),
    )
    .limit(1);

  return docs[0] ? mapToTenantDocument(docs[0]) : null;
}

/**
 * Verify document integrity by recomputing the file hash and comparing
 * it against the stored hash.
 */
export async function verifyDocumentIntegrity(
  db: Database,
  tenantId: string,
  documentId: string,
): Promise<{ hash: string; uploadedAt: Date; currentHashMatch: boolean }> {
  const docs = await db
    .select()
    .from(tenantDocuments)
    .where(
      and(
        eq(tenantDocuments.id, documentId),
        eq(tenantDocuments.tenantId, tenantId),
      ),
    )
    .limit(1);

  const doc = docs[0];
  if (!doc) {
    throw new Error('Document not found.');
  }

  let currentHashMatch = false;

  if (doc.filePath) {
    try {
      const fileBuffer = await readFile(doc.filePath);
      const currentHash = createHash('sha256').update(fileBuffer).digest('hex');
      currentHashMatch = currentHash === doc.fileHash;
    } catch {
      // File not accessible — hash cannot be verified
      currentHashMatch = false;
    }
  }

  return {
    hash: doc.fileHash,
    uploadedAt: doc.createdAt,
    currentHashMatch,
  };
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Extract text from a file buffer based on its MIME type.
 * Supports plain text, markdown, and basic text-based formats.
 * For PDF and other binary formats, extend with appropriate libraries.
 */
function extractText(buffer: Buffer, mimeType: string): string {
  const textTypes = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'text/xml',
    'application/json',
    'application/xml',
  ];

  if (textTypes.some((t) => mimeType.startsWith(t))) {
    return buffer.toString('utf-8');
  }

  // For HTML, do a basic tag strip
  if (mimeType === 'text/html') {
    return buffer
      .toString('utf-8')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // For PDF: basic text extraction (production should use pdf-parse or similar)
  if (mimeType === 'application/pdf') {
    // Extract any readable ASCII text from the PDF binary
    // This is a fallback — for production, integrate a proper PDF parser
    const raw = buffer.toString('utf-8');
    const textParts: string[] = [];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(raw)) !== null) {
      const content = match[1];
      if (content) {
        // Extract text between parentheses (PDF text operators)
        const textRegex = /\(([^)]*)\)/g;
        let textMatch;
        while ((textMatch = textRegex.exec(content)) !== null) {
          if (textMatch[1]) {
            textParts.push(textMatch[1]);
          }
        }
      }
    }

    if (textParts.length > 0) {
      return textParts.join(' ');
    }

    // If no text found via streams, try to get any readable content
    return raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Unsupported type — attempt to read as text
  return buffer.toString('utf-8');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitize a filename to prevent path traversal and special character issues */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 200);
}

function mapToTenantDocument(
  row: typeof tenantDocuments.$inferSelect,
): TenantDocument {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    mimeType: row.mimeType,
    fileHash: row.fileHash,
    chunkCount: row.chunkCount,
    status: row.status as TenantDocument['status'],
    createdAt: row.createdAt,
  };
}
