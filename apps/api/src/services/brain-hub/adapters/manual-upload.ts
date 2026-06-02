/**
 * manual_upload adapter — ingest a single uploaded file as one event.
 *
 * Reuses the existing `pdf-extractor` for PDF/text/markdown extraction.
 * CSV is parsed line-by-line and joined back as text so the event body
 * is searchable; the structured CSV is preserved in `payload` for future
 * watchers that want to walk rows.
 *
 * For now each upload = one event. Splitting a long doc into multiple
 * events is a Phase B refinement (would help the per-event auto-tagger
 * stay focused), tracked but not blocking.
 */
import { db } from '../../../lib/db';
import { dataSources } from '@1person/core/db';
import { ingestEvent } from '../event-service';
// pdf-extractor is dynamically imported below — its top-level pdf-parse
// import errors under ESM, so we defer until actually parsing a file.

export interface UploadIngestArgs {
  companyId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  /** Optional explicit source name; defaults to the filename. */
  sourceName?: string;
  /** Reuse an existing manual_upload source instead of creating one. */
  existingSourceId?: string;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function ingestUpload(args: UploadIngestArgs): Promise<{
  sourceId: string;
  eventId: string;
  chars: number;
}> {
  if (args.buffer.byteLength > MAX_BYTES) {
    throw new Error(`File too large (>${MAX_BYTES} bytes). Split or compress before upload.`);
  }

  // Extract text (PDF, text, markdown, csv-as-text) — lazy import keeps
  // the pdf-parse ESM issue from breaking server boot when no upload runs.
  const { extractTextFromFile } = await import('../../pdf-extractor');
  let text = await extractTextFromFile(args.buffer, args.mimeType);

  // CSV — keep the raw text for embedding, but also stash the rows in payload.
  let csvRows: string[][] | undefined;
  if (args.mimeType === 'text/csv' || args.filename.toLowerCase().endsWith('.csv')) {
    const rawText = args.buffer.toString('utf-8');
    csvRows = parseCsv(rawText);
    if (!text) text = rawText.slice(0, 10000);
  }

  if (!text || text.trim().length === 0) {
    throw new Error('No text could be extracted from this file.');
  }

  // Reuse or create the source row
  let sourceId: string | undefined = args.existingSourceId;
  if (!sourceId) {
    const inserted = await db
      .insert(dataSources)
      .values({
        companyId: args.companyId,
        name: args.sourceName ?? args.filename,
        type: 'manual_upload',
        subtype: inferSubtype(args.filename, args.mimeType),
        config: { filename: args.filename, mimeType: args.mimeType, sizeBytes: args.buffer.byteLength },
        status: 'active',
      })
      .returning({ id: dataSources.id });
    const row = inserted[0];
    if (!row) throw new Error('Failed to create manual_upload source');
    sourceId = row.id;
  }

  // Single event per file (Phase A)
  const event = await ingestEvent({
    companyId: args.companyId,
    sourceId,
    type: 'document',
    subject: truncate(args.filename, 240),
    content: text,
    payload: csvRows ? { rows: csvRows } : { filename: args.filename },
  });

  return { sourceId, eventId: event.id, chars: text.length };
}

function inferSubtype(filename: string, mimeType: string): string {
  const lower = filename.toLowerCase();
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (mimeType === 'text/csv' || lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.md') || mimeType === 'text/markdown') return 'markdown';
  return 'text';
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Minimal CSV parse — handles quoted cells with embedded commas/newlines.
 * Good enough for sales decks / NPS exports / contact lists. Doesn't
 * cover every Excel quirk; users with weird CSVs can paste into bulk_import.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        cur.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (cell || cur.length) {
          cur.push(cell);
          rows.push(cur);
          cur = [];
          cell = '';
        }
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else {
        cell += ch;
      }
    }
  }
  if (cell || cur.length) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows.slice(0, 2000); // cap for sanity
}
