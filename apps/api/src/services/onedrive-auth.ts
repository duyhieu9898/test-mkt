import { inflateRawSync } from 'node:zlib';
import { and, eq } from 'drizzle-orm';
import { oauthIntegrations } from '@1person/core/db';
import { db } from '../lib/db';
import { decryptMaybe, encryptSecret } from '../lib/crypto';
import { extractTextFromFile } from './pdf-extractor';

const ONEDRIVE_PROVIDER = 'onedrive';
const MAX_SOURCE_CHARS = 12000;
const MICROSOFT_TENANT = process.env.MICROSOFT_TENANT_ID || 'common';
const AUTH_BASE = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0`;
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type StoredOneDriveToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  connectedAt: string;
  accountName?: string;
  accountEmail?: string;
  accountId?: string;
};

export type OneDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webUrl?: string;
};

export type OneDriveReadResult = OneDriveFile & {
  text: string;
};

export type OneDriveBinaryResult = OneDriveFile & {
  buffer: Buffer;
  mimeType: string;
};

type GraphDriveItem = {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  lastModifiedDateTime?: string;
  '@microsoft.graph.downloadUrl'?: string;
  file?: { mimeType?: string };
  folder?: unknown;
};

export function isOneDriveConfigured(): boolean {
  return !!process.env.MICROSOFT_CLIENT_ID && !!process.env.MICROSOFT_CLIENT_SECRET;
}

export function buildOneDriveAuthUrl(userId: string, companyId: string, redirectUri: string): string {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    throw new Error('OneDrive is not configured.');
  }

  const scope = [
    'offline_access',
    'User.Read',
    'Files.Read',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope,
    prompt: 'consent',
    state: `${userId}:${ONEDRIVE_PROVIDER}:${companyId}:${Date.now()}`,
  });

  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

export async function connectOneDrive(code: string, redirectUri: string, companyId: string, userId: string): Promise<void> {
  const token = await exchangeCode(code, redirectUri);
  if (!token.access_token) {
    throw new Error(token.error_description || token.error || 'Microsoft did not return OneDrive tokens.');
  }

  const account = await fetchMicrosoftAccountInfo(token.access_token);

  await saveOneDriveToken(companyId, userId, {
    accessToken: encryptSecret(token.access_token),
    refreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : undefined,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : undefined,
    scope: token.scope,
    connectedAt: new Date().toISOString(),
    accountName: account.displayName || account.mail || account.userPrincipalName,
    accountEmail: account.mail || account.userPrincipalName,
    accountId: account.id,
  });
}

export async function getOneDriveStatus(companyId: string, userId: string) {
  const token = await getStoredOneDriveToken(companyId, userId);
  if (!token) return { connected: false };

  return {
    connected: true,
    status: 'connected',
    connectedAt: token.connectedAt,
    accountName: token.accountEmail || token.accountName,
    type: 'social' as const,
  };
}

export async function disconnectOneDrive(companyId: string, userId: string): Promise<void> {
  await db
    .delete(oauthIntegrations)
    .where(and(
      eq(oauthIntegrations.companyId, companyId),
      eq(oauthIntegrations.userId, userId),
      eq(oauthIntegrations.provider, ONEDRIVE_PROVIDER),
    ));
}

export async function listOneDriveFiles(companyId: string, userId: string, query?: string): Promise<OneDriveFile[]> {
  const accessToken = await getValidAccessToken(companyId, userId);
  const trimmed = query?.trim();
  const url = trimmed
    ? `${GRAPH_BASE}/me/drive/root/search(q='${encodeURIComponent(trimmed.replace(/'/g, "''"))}')?$top=20`
    : `${GRAPH_BASE}/me/drive/root/children?$top=20&$orderby=lastModifiedDateTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`OneDrive returned HTTP ${res.status} while listing files.`);
  }

  const data = await res.json() as { value?: GraphDriveItem[] };
  return (data.value || [])
    .filter((item) => item.file && !item.folder)
    .map(mapGraphItem);
}

export async function readOneDriveFileText(companyId: string, userId: string, fileId: string): Promise<OneDriveReadResult> {
  const accessToken = await getValidAccessToken(companyId, userId);
  const metadata = await getDriveItemMetadata(accessToken, fileId);
  const { buffer, mimeType } = await downloadDriveItem(accessToken, metadata);
  const text = normalizeText(await extractOneDriveText(buffer, mimeType, metadata.name)).slice(0, MAX_SOURCE_CHARS);

  if (text.trim().length < 20) {
    throw new Error('No readable text was found in the selected OneDrive file.');
  }

  return { ...mapGraphItem(metadata), mimeType, text };
}

export async function readOneDriveImageFile(
  companyId: string,
  userId: string,
  fileId: string,
): Promise<OneDriveBinaryResult> {
  const accessToken = await getValidAccessToken(companyId, userId);
  const metadata = await getDriveItemMetadata(accessToken, fileId);
  const { buffer, mimeType } = await downloadDriveItem(accessToken, metadata);
  if (!isSupportedOneDriveImage(metadata.name, mimeType)) {
    throw new Error('Choose a JPG or PNG image from OneDrive.');
  }
  return { ...mapGraphItem(metadata), buffer, mimeType };
}

async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json() as TokenResponse;
  if (!res.ok) {
    const message = data.error_description || data.error || `Microsoft token exchange failed with HTTP ${res.status}.`;
    throw new Error(`${message} Redirect URI used: ${redirectUri}`);
  }

  return data;
}

async function fetchMicrosoftAccountInfo(accessToken: string): Promise<{
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me?$select=id,displayName,mail,userPrincipalName`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return {};
    return res.json() as Promise<{ id?: string; displayName?: string; mail?: string; userPrincipalName?: string }>;
  } catch {
    return {};
  }
}

async function saveOneDriveToken(companyId: string, userId: string, token: StoredOneDriveToken): Promise<void> {
  const existing = await db.query.oauthIntegrations.findFirst({
    where: and(
      eq(oauthIntegrations.companyId, companyId),
      eq(oauthIntegrations.userId, userId),
      eq(oauthIntegrations.provider, ONEDRIVE_PROVIDER),
    ),
  });

  const values = {
    status: 'connected',
    accessToken: token.accessToken,
    refreshToken: token.refreshToken || existing?.refreshToken || null,
    tokenExpiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
    providerAccountId: token.accountId,
    providerAccountName: token.accountName,
    providerAccountEmail: token.accountEmail,
    scopes: token.scope?.split(/\s+/).filter(Boolean) || [],
    connectedAt: new Date(token.connectedAt),
    lastError: null,
    metadata: { source: 'campaign_launcher_onedrive' },
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(oauthIntegrations).set(values).where(eq(oauthIntegrations.id, existing.id));
  } else {
    await db.insert(oauthIntegrations).values({
      companyId,
      userId,
      provider: ONEDRIVE_PROVIDER,
      ...values,
    });
  }
}

async function getStoredOneDriveToken(companyId: string, userId: string): Promise<StoredOneDriveToken | null> {
  const integration = await db.query.oauthIntegrations.findFirst({
    where: and(
      eq(oauthIntegrations.companyId, companyId),
      eq(oauthIntegrations.userId, userId),
      eq(oauthIntegrations.provider, ONEDRIVE_PROVIDER),
      eq(oauthIntegrations.status, 'connected'),
    ),
  });
  if (!integration) return null;

  return {
    accessToken: integration.accessToken,
    refreshToken: integration.refreshToken || '',
    expiresAt: integration.tokenExpiresAt?.toISOString(),
    scope: integration.scopes.join(' '),
    connectedAt: integration.connectedAt.toISOString(),
    accountName: integration.providerAccountName || undefined,
    accountEmail: integration.providerAccountEmail || undefined,
    accountId: integration.providerAccountId || undefined,
  };
}

async function getValidAccessToken(companyId: string, userId: string): Promise<string> {
  const token = await getStoredOneDriveToken(companyId, userId);
  if (!token) throw new Error('OneDrive is not connected for this user in this company.');

  const accessToken = decryptMaybe(token.accessToken);
  const expiresAt = token.expiresAt ? new Date(token.expiresAt).getTime() : 0;
  if (accessToken && expiresAt > Date.now() + 60_000) {
    return accessToken;
  }

  const refreshToken = decryptMaybe(token.refreshToken);
  if (!refreshToken) throw new Error('OneDrive needs to be reconnected for this user.');

  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed.access_token) {
    throw new Error(refreshed.error_description || refreshed.error || 'Could not refresh OneDrive access.');
  }

  await saveOneDriveToken(companyId, userId, {
    ...token,
    accessToken: encryptSecret(refreshed.access_token),
    expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : token.expiresAt,
  });

  return refreshed.access_token;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  return res.json() as Promise<TokenResponse>;
}

async function getDriveItemMetadata(accessToken: string, fileId: string): Promise<GraphDriveItem> {
  const res = await fetch(`${GRAPH_BASE}/me/drive/items/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`OneDrive returned HTTP ${res.status} while reading file metadata.`);
  }
  return res.json() as Promise<GraphDriveItem>;
}

async function downloadDriveItem(
  accessToken: string,
  file: GraphDriveItem,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const mimeType = file.file?.mimeType || guessMimeFromName(file.name);
  const url = `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(file.id)}/content`;

  let res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/octet-stream',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok && file['@microsoft.graph.downloadUrl']) {
    res = await fetch(file['@microsoft.graph.downloadUrl'], {
      headers: { Accept: 'application/octet-stream' },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });
  }

  if (!res.ok) {
    throw new Error(`OneDrive returned HTTP ${res.status} while downloading ${file.name}.`);
  }

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get('content-type')?.split(';')[0]?.trim() || mimeType,
  };
}

function mapGraphItem(item: GraphDriveItem): OneDriveFile {
  return {
    id: item.id,
    name: item.name,
    mimeType: item.file?.mimeType || guessMimeFromName(item.name),
    modifiedTime: item.lastModifiedDateTime,
    size: item.size ? String(item.size) : undefined,
    webUrl: item.webUrl,
  };
}

async function extractOneDriveText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'text/csv') {
    return buffer.toString('utf-8');
  }
  if (mimeType === 'application/pdf') {
    return extractTextFromFile(buffer, mimeType);
  }
  if (isDocxFile(fileName, mimeType)) {
    return extractDocxText(buffer);
  }
  return '';
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function isDocxFile(fileName: string, mimeType: string): boolean {
  return fileName.toLowerCase().endsWith('.docx')
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function isSupportedOneDriveImage(name: string, mimeType: string): boolean {
  if (['image/jpeg', 'image/png'].includes(mimeType)) return true;
  return /\.(jpe?g|jpe|jfif|png)$/i.test(name);
}

function extractDocxText(buffer: Buffer): string {
  const documentXml = readZipTextFile(buffer, 'word/document.xml');
  if (!documentXml) return '';

  // DOCX stores paragraphs/runs as XML inside a ZIP. We only need readable
  // source context for the AI prompt, so a lightweight OOXML text extraction is
  // enough and avoids relying on Microsoft Graph export formats.
  return documentXml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function readZipTextFile(buffer: Buffer, fileName: string): string | null {
  const entries = readZipEntries(buffer);
  const entry = entries.find((item) => item.name === fileName);
  if (!entry) return null;

  const localHeaderOffset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) return null;

  const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const compressedOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
  const compressed = buffer.subarray(compressedOffset, compressedOffset + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressed.toString('utf-8');
  if (entry.compressionMethod === 8) return inflateRawSync(compressed).toString('utf-8');
  return null;
}

function readZipEntries(buffer: Buffer): Array<{
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}> {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) return [];

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ReturnType<typeof readZipEntries> = [];

  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf-8');

    entries.push({ name, compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
