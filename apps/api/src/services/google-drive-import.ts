import { extractTextFromFile } from './pdf-extractor';

const MAX_SOURCE_CHARS = 12000;

interface DriveFileRef {
  id: string;
  kind: 'document' | 'spreadsheet' | 'presentation' | 'file';
}

export interface GoogleDriveImportResult {
  fileId: string;
  sourceUrl: string;
  mimeType: string;
  text: string;
}

export async function importGoogleDriveText(url: string): Promise<GoogleDriveImportResult> {
  const ref = parseGoogleDriveUrl(url);
  if (!ref) {
    throw new Error('Enter a valid Google Drive file link.');
  }

  const attempts = buildDownloadAttempts(ref);
  let lastError = '';

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        headers: { 'User-Agent': '1Person/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        lastError = `Google Drive returned HTTP ${res.status}`;
        continue;
      }

      const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || attempt.mimeType;
      const buffer = Buffer.from(await res.arrayBuffer());
      const text = await extractDriveText(buffer, mimeType);

      if (text.trim().length >= 20) {
        return {
          fileId: ref.id,
          sourceUrl: url,
          mimeType,
          text: normalizeText(text).slice(0, MAX_SOURCE_CHARS),
        };
      }

      lastError = 'No readable text was found in the Drive file.';
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Could not read Google Drive file.';
    }
  }

  throw new Error(
    `${lastError || 'Could not read Google Drive file.'} Make sure the file is shared as "Anyone with the link can view".`,
  );
}

function parseGoogleDriveUrl(input: string): DriveFileRef | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (!url.hostname.endsWith('google.com') && !url.hostname.endsWith('googleusercontent.com')) {
    return null;
  }

  const idFromQuery = url.searchParams.get('id');
  if (idFromQuery) return { id: idFromQuery, kind: 'file' };

  const match = url.pathname.match(/\/(document|spreadsheets|presentation|file)\/d\/([^/]+)/);
  if (!match?.[2]) return null;

  const kind =
    match[1] === 'document' ? 'document' :
    match[1] === 'spreadsheets' ? 'spreadsheet' :
    match[1] === 'presentation' ? 'presentation' :
    'file';

  return { id: match[2], kind };
}

function buildDownloadAttempts(ref: DriveFileRef): Array<{ url: string; mimeType: string }> {
  const id = encodeURIComponent(ref.id);
  if (ref.kind === 'document') {
    return [
      { url: `https://docs.google.com/document/d/${id}/export?format=txt`, mimeType: 'text/plain' },
      { url: `https://drive.google.com/uc?export=download&id=${id}`, mimeType: 'application/octet-stream' },
    ];
  }
  if (ref.kind === 'spreadsheet') {
    return [
      { url: `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`, mimeType: 'text/csv' },
      { url: `https://drive.google.com/uc?export=download&id=${id}`, mimeType: 'application/octet-stream' },
    ];
  }
  if (ref.kind === 'presentation') {
    return [
      { url: `https://docs.google.com/presentation/d/${id}/export/txt`, mimeType: 'text/plain' },
      { url: `https://drive.google.com/uc?export=download&id=${id}`, mimeType: 'application/octet-stream' },
    ];
  }
  return [{ url: `https://drive.google.com/uc?export=download&id=${id}`, mimeType: 'application/octet-stream' }];
}

async function extractDriveText(buffer: Buffer, mimeType: string): Promise<string> {
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/octet-stream'
  ) {
    const text = buffer.toString('utf-8');
    if (!looksLikeHtml(text)) return text;
  }

  if (mimeType === 'application/pdf') {
    return extractTextFromFile(buffer, mimeType);
  }

  return '';
}

function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 500).toLowerCase();
  return head.includes('<html') || head.includes('<!doctype html');
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
