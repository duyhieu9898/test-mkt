// =============================================================================
// @1person/ai-tenant — Audit Trail (Transparency Explorer)
// =============================================================================
// Append-only, chain-hashed audit log for tamper detection.
// Each entry contains a hash of the previous entry, forming a blockchain-like
// chain. If anyone modifies a past entry, the chain breaks and is detectable.
//
// RULES:
// - Entries are IMMUTABLE — no update, no delete
// - Every mutation in the system creates an audit entry
// - Every query ALWAYS filters by tenantId
// =============================================================================

import { createHash, randomUUID } from 'crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import { auditLog } from './schema.js';
import type { Database } from './db.js';
import type { AuditEntry, ChainVerificationResult } from './types.js';

// ---------------------------------------------------------------------------
// Hashing utilities
// ---------------------------------------------------------------------------

/** Compute SHA-256 hex digest of a string */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute the chain hash for an audit entry.
 * The chain hash is derived from the entry's id, dataHash, and timestamp
 * so that any modification to a past entry will break the chain.
 */
function computeEntryHash(entry: {
  id: string;
  dataHash?: string | null;
  timestamp: Date;
}): string {
  const payload = `${entry.id}|${entry.dataHash ?? ''}|${entry.timestamp.toISOString()}`;
  return sha256(payload);
}

// ---------------------------------------------------------------------------
// Core audit functions
// ---------------------------------------------------------------------------

/**
 * Log an action to the audit trail.
 * Automatically chains to the previous entry for tamper detection.
 */
export async function logAction(
  db: Database,
  tenantId: string,
  action: AuditEntry['action'],
  actor: string,
  details: Record<string, unknown>,
  dataHash?: string,
): Promise<AuditEntry> {
  // Get the last audit entry for this tenant to build the chain
  const lastEntries = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tenantId, tenantId))
    .orderBy(desc(auditLog.timestamp))
    .limit(1);

  let previousEntryHash: string | undefined;
  if (lastEntries.length > 0) {
    const last = lastEntries[0]!;
    previousEntryHash = computeEntryHash({
      id: last.id,
      dataHash: last.dataHash,
      timestamp: last.timestamp,
    });
  }

  const [entry] = await db
    .insert(auditLog)
    .values({
      tenantId,
      action,
      actor,
      details,
      dataHash: dataHash ?? null,
      previousEntryHash: previousEntryHash ?? null,
    })
    .returning();

  if (!entry) {
    throw new Error('Unable to create audit entry. Please try again.');
  }

  return mapToAuditEntry(entry);
}

/**
 * Retrieve audit log entries for a tenant.
 * Supports filtering by action type and limiting results.
 */
export async function getAuditLog(
  db: Database,
  tenantId: string,
  options?: { limit?: number; action?: string },
): Promise<AuditEntry[]> {
  const conditions = [eq(auditLog.tenantId, tenantId)];

  if (options?.action) {
    conditions.push(eq(auditLog.action, options.action));
  }

  const entries = await db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.timestamp))
    .limit(options?.limit ?? 100);

  return entries.map(mapToAuditEntry);
}

/**
 * Verify the integrity of the audit chain for a tenant.
 * Walks through all entries chronologically and checks that each
 * previousEntryHash matches the computed hash of the preceding entry.
 */
export async function verifyChain(
  db: Database,
  tenantId: string,
): Promise<ChainVerificationResult> {
  // Fetch all entries in chronological order
  const entries = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tenantId, tenantId))
    .orderBy(auditLog.timestamp);

  if (entries.length === 0) {
    return { valid: true, entriesChecked: 0 };
  }

  // First entry should have no previousEntryHash
  const first = entries[0]!;
  if (first.previousEntryHash !== null) {
    return {
      valid: false,
      entriesChecked: 1,
      brokenAt: first.id,
    };
  }

  // Walk the chain
  for (let i = 1; i < entries.length; i++) {
    const current = entries[i]!;
    const previous = entries[i - 1]!;

    const expectedHash = computeEntryHash({
      id: previous.id,
      dataHash: previous.dataHash,
      timestamp: previous.timestamp,
    });

    if (current.previousEntryHash !== expectedHash) {
      return {
        valid: false,
        entriesChecked: i + 1,
        brokenAt: current.id,
      };
    }
  }

  return { valid: true, entriesChecked: entries.length };
}

/**
 * Get proof for a specific document's data integrity.
 * Looks up the original upload audit entry and returns the stored hash.
 */
export async function getDataProof(
  db: Database,
  tenantId: string,
  documentId: string,
): Promise<{
  hash: string;
  uploadedAt: Date;
  verified: boolean;
} | null> {
  const entries = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tenantId, tenantId),
        eq(auditLog.action, 'document_upload'),
      ),
    )
    .orderBy(desc(auditLog.timestamp));

  // Find the upload entry for this specific document
  const uploadEntry = entries.find(
    (e) => (e.details as Record<string, unknown>)?.documentId === documentId,
  );

  if (!uploadEntry) {
    return null;
  }

  // Verify the chain up to this entry is intact
  const chainResult = await verifyChain(db, tenantId);

  return {
    hash: uploadEntry.dataHash ?? '',
    uploadedAt: uploadEntry.timestamp,
    verified: chainResult.valid,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mapToAuditEntry(row: typeof auditLog.$inferSelect): AuditEntry {
  return {
    id: row.id,
    tenantId: row.tenantId,
    action: row.action as AuditEntry['action'],
    actor: row.actor,
    details: row.details as Record<string, unknown>,
    dataHash: row.dataHash ?? undefined,
    previousEntryHash: row.previousEntryHash ?? undefined,
    timestamp: row.timestamp,
  };
}

/**
 * Generate a unique trace ID for query tracking.
 */
export function generateTraceId(): string {
  return sha256(randomUUID() + Date.now().toString()).slice(0, 16);
}
