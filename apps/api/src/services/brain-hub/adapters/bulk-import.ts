/**
 * bulk_import adapter — paste a block of text and turn it into events.
 *
 * Modes:
 *   - "single"   one event with the whole text (default)
 *   - "lines"    one event per non-empty line (e.g. pasted question list)
 *   - "csv"      one event per CSV row, joined back to "col1: a, col2: b"
 *   - "double-newline"  split on blank lines (e.g. pasted FAQ entries)
 *
 * Each call lazily creates a fresh `bulk_import` source so multiple
 * imports don't collapse into a single growing source.
 */
import { db } from '../../../lib/db';
import { dataSources } from '@1person/core/db';
import { ingestEvent } from '../event-service';

export type BulkSplitMode = 'single' | 'lines' | 'csv' | 'double-newline';

export interface BulkImportArgs {
  companyId: string;
  name: string;            // user-facing source name (e.g. "Customer interview Q3 quotes")
  text: string;
  mode?: BulkSplitMode;
  subjectPrefix?: string;  // optional prefix for the per-event subject
}

const MAX_EVENTS_PER_IMPORT = 500;
const MAX_TOTAL_CHARS = 200_000;

export async function ingestBulkImport(args: BulkImportArgs): Promise<{
  sourceId: string;
  eventCount: number;
}> {
  const text = (args.text ?? '').slice(0, MAX_TOTAL_CHARS).trim();
  if (text.length === 0) {
    throw new Error('Nothing to import — text is empty.');
  }
  const mode = args.mode ?? 'single';

  // Create one source row per import
  const inserted = await db
    .insert(dataSources)
    .values({
      companyId: args.companyId,
      name: args.name.slice(0, 120),
      type: 'bulk_import',
      subtype: mode,
      config: { mode, originalChars: text.length },
      status: 'active',
    })
    .returning({ id: dataSources.id });
  const src = inserted[0];
  if (!src) throw new Error('Failed to create bulk_import source');

  const items = splitForMode(text, mode).slice(0, MAX_EVENTS_PER_IMPORT);

  let count = 0;
  for (const item of items) {
    if (!item.content.trim()) continue;
    await ingestEvent({
      companyId: args.companyId,
      sourceId: src.id,
      type: 'document',
      subject: (args.subjectPrefix ? `${args.subjectPrefix} — ` : '') + item.subject,
      content: item.content,
      payload: item.payload,
    });
    count++;
  }

  return { sourceId: src.id, eventCount: count };
}

interface SplitItem {
  subject: string;
  content: string;
  payload?: Record<string, unknown>;
}

function splitForMode(text: string, mode: BulkSplitMode): SplitItem[] {
  if (mode === 'single') {
    return [{ subject: firstLine(text), content: text }];
  }

  if (mode === 'lines') {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => ({ subject: truncate(l, 240), content: l }));
  }

  if (mode === 'double-newline') {
    return text
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => ({ subject: truncate(firstLine(p), 240), content: p }));
  }

  // csv
  const rows = quickCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0] ?? [];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i] ?? `col${i + 1}`;
      obj[key] = row[i] ?? '';
    }
    const content = Object.entries(obj)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    return { subject: truncate(row[0] ?? content, 240), content, payload: obj };
  });
}

function firstLine(s: string): string {
  const line = s.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return truncate(line || s.slice(0, 240), 240);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Same minimal CSV parser as manual-upload, inlined to keep adapters independent.
function quickCsv(text: string): string[][] {
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
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
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
      } else cell += ch;
    }
  }
  if (cell || cur.length) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows;
}
