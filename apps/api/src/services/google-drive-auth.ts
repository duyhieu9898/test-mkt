import { and, eq } from 'drizzle-orm';
import { oauthIntegrations } from '@1person/core/db';
import { db } from '../lib/db';
import { decryptMaybe, encryptSecret } from '../lib/crypto';
import { extractTextFromFile } from './pdf-extractor';

const GOOGLE_DRIVE_PROVIDER = 'google_drive';
const MAX_SOURCE_CHARS = 12000;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type StoredDriveToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
  scope?: string;
  connectedAt: string;
  accountName?: string;
  accountEmail?: string;
  accountId?: string;
};

export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
};

export type GoogleDriveReadResult = GoogleDriveFile & {
  text: string;
};

export function isGoogleDriveConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function buildGoogleDriveAuthUrl(userId: string, companyId: string, redirectUri: string): string {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('Google Drive is not configured.');
  }

  const scope = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
    state: `${userId}:${GOOGLE_DRIVE_PROVIDER}:${companyId}:${Date.now()}`,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function connectGoogleDrive(code: string, redirectUri: string, companyId: string, userId: string): Promise<void> {
  const token = await exchangeCode(code, redirectUri);
  if (!token.access_token || !token.refresh_token) {
    throw new Error(token.error_description || token.error || 'Google did not return Drive tokens.');
  }

  const account = await fetchGoogleAccountInfo(token.access_token);

  // Token ownership is user-level. GOOGLE_CLIENT_ID/SECRET identify the SaaS
  // app, while this encrypted refresh token identifies the user's Drive.
  await saveDriveToken(companyId, userId, {
    accessToken: encryptSecret(token.access_token),
    refreshToken: encryptSecret(token.refresh_token),
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : undefined,
    scope: token.scope,
    connectedAt: new Date().toISOString(),
    accountName: account.name || account.email,
    accountEmail: account.email,
    accountId: account.id,
  });
}

export async function getGoogleDriveStatus(companyId: string, userId: string) {
  const token = await getStoredDriveToken(companyId, userId);
  if (!token) return { connected: false };

  return {
    connected: true,
    status: 'connected',
    connectedAt: token.connectedAt,
    accountName: token.accountEmail || token.accountName,
    type: 'social' as const,
  };
}

export async function disconnectGoogleDrive(companyId: string, userId: string): Promise<void> {
  await db
    .delete(oauthIntegrations)
    .where(and(
      eq(oauthIntegrations.companyId, companyId),
      eq(oauthIntegrations.userId, userId),
      eq(oauthIntegrations.provider, GOOGLE_DRIVE_PROVIDER),
    ));
}

export async function listGoogleDriveFiles(companyId: string, userId: string, query?: string): Promise<GoogleDriveFile[]> {
  const accessToken = await getValidAccessToken(companyId, userId);
  const params = new URLSearchParams({
    pageSize: '20',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
    q: buildDriveQuery(query),
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Google Drive returned HTTP ${res.status} while listing files.`);
  }

  const data = await res.json() as { files?: GoogleDriveFile[] };
  return data.files || [];
}

export async function readGoogleDriveFileText(companyId: string, userId: string, fileId: string): Promise<GoogleDriveReadResult> {
  const accessToken = await getValidAccessToken(companyId, userId);
  const metadata = await getDriveFileMetadata(accessToken, fileId);
  const { buffer, mimeType } = await downloadDriveFile(accessToken, metadata);
  const text = normalizeText(await extractDriveText(buffer, mimeType)).slice(0, MAX_SOURCE_CHARS);

  if (text.trim().length < 20) {
    throw new Error('No readable text was found in the selected Google Drive file.');
  }

  return { ...metadata, mimeType, text };
}

async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  return res.json() as Promise<TokenResponse>;
}

async function fetchGoogleAccountInfo(accessToken: string): Promise<{ id?: string; email?: string; name?: string }> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return {};
    const data = await res.json() as { id?: string; email?: string; name?: string };
    return data;
  } catch {
    return {};
  }
}

async function saveDriveToken(companyId: string, userId: string, token: StoredDriveToken): Promise<void> {
  const existing = await db.query.oauthIntegrations.findFirst({
    where: and(
      eq(oauthIntegrations.companyId, companyId),
      eq(oauthIntegrations.userId, userId),
      eq(oauthIntegrations.provider, GOOGLE_DRIVE_PROVIDER),
    ),
  });

  const values = {
    status: 'connected',
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    tokenExpiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
    providerAccountId: token.accountId,
    providerAccountName: token.accountName,
    providerAccountEmail: token.accountEmail,
    scopes: token.scope?.split(/\s+/).filter(Boolean) || [],
    connectedAt: new Date(token.connectedAt),
    lastError: null,
    metadata: { source: 'campaign_launcher_drive' },
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(oauthIntegrations).set(values).where(eq(oauthIntegrations.id, existing.id));
  } else {
    await db.insert(oauthIntegrations).values({
      companyId,
      userId,
      provider: GOOGLE_DRIVE_PROVIDER,
      ...values,
    });
  }
}

async function getStoredDriveToken(companyId: string, userId: string): Promise<StoredDriveToken | null> {
  const integration = await db.query.oauthIntegrations.findFirst({
    where: and(
      eq(oauthIntegrations.companyId, companyId),
      eq(oauthIntegrations.userId, userId),
      eq(oauthIntegrations.provider, GOOGLE_DRIVE_PROVIDER),
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
  const token = await getStoredDriveToken(companyId, userId);
  if (!token) throw new Error('Google Drive is not connected for this user in this company.');

  const accessToken = decryptMaybe(token.accessToken);
  const expiresAt = token.expiresAt ? new Date(token.expiresAt).getTime() : 0;
  if (accessToken && expiresAt > Date.now() + 60_000) {
    return accessToken;
  }

  const refreshToken = decryptMaybe(token.refreshToken);
  if (!refreshToken) throw new Error('Google Drive needs to be reconnected for this user.');

  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed.access_token) {
    throw new Error(refreshed.error_description || refreshed.error || 'Could not refresh Google Drive access.');
  }

  await saveDriveToken(companyId, userId, {
    ...token,
    accessToken: encryptSecret(refreshed.access_token),
    expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : token.expiresAt,
  });

  return refreshed.access_token;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  return res.json() as Promise<TokenResponse>;
}

async function getDriveFileMetadata(accessToken: string, fileId: string): Promise<GoogleDriveFile> {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,modifiedTime,size,webViewLink',
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Google Drive returned HTTP ${res.status} while reading file metadata.`);
  }

  return res.json() as Promise<GoogleDriveFile>;
}

async function downloadDriveFile(
  accessToken: string,
  file: GoogleDriveFile,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const exportMimeType = getGoogleWorkspaceExportMime(file.mimeType);
  const url = exportMimeType
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(exportMimeType)}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Google Drive returned HTTP ${res.status} while downloading ${file.name}.`);
  }

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: exportMimeType || res.headers.get('content-type')?.split(';')[0]?.trim() || file.mimeType,
  };
}

function getGoogleWorkspaceExportMime(mimeType: string): string | null {
  if (mimeType === 'application/vnd.google-apps.document') return 'text/plain';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'text/csv';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'text/plain';
  return null;
}

async function extractDriveText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'text/csv') {
    return buffer.toString('utf-8');
  }
  if (mimeType === 'application/pdf') {
    return extractTextFromFile(buffer, mimeType);
  }
  return '';
}

function buildDriveQuery(query?: string): string {
  const base = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
  const trimmed = query?.trim();
  if (!trimmed) return base;
  return `${base} and name contains '${trimmed.replace(/'/g, "\\'")}'`;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
