/**
 * Integrations Routes — Generic OAuth for ALL platforms
 *
 * Every platform uses the same endpoints:
 *   GET  /integrations/:platform/auth-url    → Generate OAuth popup URL
 *   GET  /integrations/:platform/callback    → OAuth callback (exchange code)
 *   GET  /integrations/:platform/status      → Check connection status
 *   POST /integrations/:platform/disconnect  → Disconnect platform
 *   GET  /integrations/platforms             → List all available platforms
 *   GET  /integrations/all-status            → All connection statuses at once
 *
 * No platform-specific code here. Everything goes through the PlatformRegistry.
 */

import { Hono } from 'hono';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { db } from '../lib/db';
import { eq, and } from 'drizzle-orm';
import { socialConnections, adConnections, knowledgeBase } from '@1person/core/db';
import { platformRegistry } from '../services/platforms';
import {
  buildGoogleDrivePickerAuthUrl,
  buildGoogleDriveAuthUrl,
  connectGoogleDrivePickedFile,
  connectGoogleDrive,
  disconnectGoogleDrive,
  getGoogleDriveStatus,
  isGoogleDriveConfigured,
  listGoogleDriveFiles,
} from '../services/google-drive-auth';
import {
  buildOneDriveAuthUrl,
  connectOneDrive,
  disconnectOneDrive,
  getOneDriveStatus,
  isOneDriveConfigured,
  listOneDriveFiles,
} from '../services/onedrive-auth';

const integrationsRouter = new Hono();
integrationsRouter.use('*', async (c, next) => {
  // Provider OAuth callbacks arrive without our Bearer token; state carries
  // the user/company context needed to finish the connection.
  if (c.req.method === 'GET' && /\/integrations\/[^/]+\/callback$/.test(c.req.path)) {
    return next();
  }
  return authMiddleware(c, next);
});

// ============================================================================
// LIST AVAILABLE PLATFORMS (for Settings UI)
// ============================================================================

integrationsRouter.get('/platforms', async (c) => {
  const platforms = platformRegistry.getPlatformStatus();
  // Only return platforms that are ready to use (configured in system env)
  // Users never see unconfigured platforms — this is a business product, not a dev tool
  return c.json({
    platforms: platforms
      .filter((p) => p.configured)
      .map((p) => ({
        platformId: p.platformId,
        displayName: p.displayName,
        description: p.description,
        category: p.category,
        hasSocial: p.hasSocial,
        hasAds: p.hasAds,
        supportedFeatures: p.supportedFeatures,
      })),
  });
});

// ============================================================================
// ALL STATUS AT ONCE (for Settings UI — one API call)
// ============================================================================

integrationsRouter.get('/all-status', async (c) => {
  const { userId } = c.get('user');
  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.length) return c.json({ connections: {} });
  const requestedCompanyId = c.req.query('companyId');
  const companyId = requestedCompanyId && userCompanies.some((company) => company.id === requestedCompanyId)
    ? requestedCompanyId
    : userCompanies[0]!.id;

  // Query both connection tables
  const [socials, adConns, gscIntegration, driveStatus, oneDriveStatus] = await Promise.all([
    db.query.socialConnections.findMany({
      where: eq(socialConnections.companyId, companyId),
    }),
    db.query.adConnections.findMany({
      where: eq(adConnections.companyId, companyId),
    }),
    db.query.knowledgeBase.findFirst({
      where: and(
        eq(knowledgeBase.companyId, companyId),
        eq(knowledgeBase.category, 'integration_google')
      ),
    }),
    getGoogleDriveStatus(companyId, userId),
    getOneDriveStatus(companyId, userId),
  ]);

  const connections: Record<string, {
    connected: boolean;
    status: string;
    connectedAt?: string;
    accountName?: string;
    type: 'social' | 'ads' | 'both';
  }> = {};

  // Social connections
  for (const conn of socials) {
    connections[conn.platform] = {
      connected: conn.status === 'connected',
      status: conn.status,
      connectedAt: conn.connectedAt?.toISOString(),
      accountName: conn.platformAccountName || undefined,
      type: platformRegistry.hasAdProvider(conn.platform) ? 'both' : 'social',
    };
  }

  // Ad connections (merge — don't overwrite social)
  for (const conn of adConns) {
    const existing = connections[conn.platform];
    if (existing) {
      existing.type = 'both';
    } else {
      connections[conn.platform] = {
        connected: conn.status === 'connected',
        status: conn.status,
        connectedAt: conn.connectedAt?.toISOString(),
        accountName: conn.platformAccountName || undefined,
        type: 'ads',
      };
    }
  }

  // Google Search Console (legacy — stored in knowledge_base)
  if (gscIntegration) {
    try {
      const data = JSON.parse(gscIntegration.content);
      connections['google_search_console'] = {
        connected: true,
        status: 'connected',
        connectedAt: data.connectedAt,
        type: 'social',
      };
    } catch {}
  }

  if (driveStatus.connected) {
    connections['google_drive'] = {
      connected: true,
      status: 'connected',
      connectedAt: 'connectedAt' in driveStatus ? driveStatus.connectedAt : undefined,
      accountName: 'accountName' in driveStatus ? driveStatus.accountName : undefined,
      type: 'social',
    };
  }
  if (oneDriveStatus.connected) {
    connections['onedrive'] = {
      connected: true,
      status: 'connected',
      connectedAt: 'connectedAt' in oneDriveStatus ? oneDriveStatus.connectedAt : undefined,
      accountName: 'accountName' in oneDriveStatus ? oneDriveStatus.accountName : undefined,
      type: 'social',
    };
  }

  return c.json({ connections });
});

// ============================================================================
// 1-CLICK CONNECT: POST /integrations/:platform/connect
// Returns OAuth URL — user clicks, logs in, done.
// No env vars, no developer setup, no technical jargon.
// ============================================================================

integrationsRouter.post('/:platform/connect', async (c) => {
  const platform = c.req.param('platform')!;

  if (platform === 'google_drive') {
    return handleGoogleDriveAuthUrl(c);
  }
  if (platform === 'onedrive') {
    return handleOneDriveAuthUrl(c);
  }

  if (platform === 'google_search_console') {
    return handleGSCAuthUrl(c);
  }

  if (!platformRegistry.hasOAuthProvider(platform)) {
    return c.json({ error: `${platform} is not available` }, 400);
  }

  const provider = platformRegistry.getOAuthProvider(platform);
  if (!provider.isConfigured()) {
    return c.json({ error: `${platform} is not available at this time` }, 400);
  }

  const { userId } = c.get('user');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
  const redirectUri = `${apiUrl}/integrations/${platform}/callback`;
  const state = `${userId}:${platform}:${Date.now()}`;

  const url = provider.getAuthorizationUrl(state, redirectUri);

  return c.json({ url });
});

// Keep GET for backward compatibility (popup flow)
integrationsRouter.get('/:platform/auth-url', async (c) => {
  const platform = c.req.param('platform')!;

  if (platform === 'google_drive') {
    return handleGoogleDriveAuthUrl(c);
  }
  if (platform === 'onedrive') {
    return handleOneDriveAuthUrl(c);
  }

  if (platform === 'google_search_console') {
    return handleGSCAuthUrl(c);
  }

  if (!platformRegistry.hasOAuthProvider(platform)) {
    return c.json({ error: `${platform} is not available` }, 400);
  }

  const provider = platformRegistry.getOAuthProvider(platform);
  if (!provider.isConfigured()) {
    return c.json({ error: `${platform} is not available at this time` }, 400);
  }

  const { userId } = c.get('user');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
  const redirectUri = `${apiUrl}/integrations/${platform}/callback`;
  const state = `${userId}:${platform}:${Date.now()}`;

  const url = provider.getAuthorizationUrl(state, redirectUri);

  return c.json({ url });
});

// ============================================================================
// GENERIC OAUTH: CALLBACK
// ============================================================================

integrationsRouter.get('/:platform/callback', async (c) => {
  const platform = c.req.param('platform')!;
  const platformForDb = platform as any;

  if (platform === 'google_drive') {
    return handleGoogleDriveCallback(c);
  }
  if (platform === 'onedrive') {
    return handleOneDriveCallback(c);
  }

  // Special case: Google Search Console (legacy + new redirect)
  if (platform === 'google_search_console' || platform === 'google') {
    return handleGSCCallback(c);
  }

  const code = c.req.query('code');
  const state = c.req.query('state') || '';
  const [userId] = state.split(':');

  if (!code) {
    return c.html('<html><body><h1>Error</h1><p>No authorization code received.</p><script>window.close();</script></body></html>');
  }

  if (!platformRegistry.hasOAuthProvider(platform)) {
    return c.html(`<html><body><h1>Error</h1><p>Platform ${platform} not supported.</p><script>window.close();</script></body></html>`);
  }

  const provider = platformRegistry.getOAuthProvider(platform);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
  const redirectUri = `${apiUrl}/integrations/${platform}/callback`;

  try {
    const tokens = await provider.exchangeCode(code, redirectUri);

    // Find user's company
    const { companies } = await import('@1person/core/db');
    const userCompanies = userId
      ? await db.query.companies.findMany({ where: eq(companies.ownerId, userId) })
      : [];

    const companyId = userCompanies[0]?.id;
    if (!companyId) {
      return c.html('<html><body><h1>Error</h1><p>No company found.</p><script>window.close();</script></body></html>');
    }
    const targetCompanyId: string = companyId;

    const config = platformRegistry.getConfig(platform);
    const tokenExpiresAt = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000)
      : undefined;

    // Store in social connections if social provider exists
    if (platformRegistry.hasSocialProvider(platform)) {
      const existing = await db.query.socialConnections.findFirst({
        where: and(eq(socialConnections.companyId, targetCompanyId), eq(socialConnections.platform, platformForDb)),
      });

      const firstFacebookPage = platform === 'facebook'
        ? (tokens.extra?.pages as Array<{ id?: string; name?: string; access_token?: string }> | undefined)?.[0]
        : undefined;
      const values = {
        accessToken: firstFacebookPage?.access_token || tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt,
        platformUserId: tokens.extra?.userId as string || tokens.extra?.openId as string || undefined,
        platformPageId: firstFacebookPage?.id || tokens.extra?.channelId as string || undefined,
        platformAccountName: firstFacebookPage?.name || tokens.extra?.username as string || tokens.extra?.channelTitle as string || undefined,
        permissions: tokens.scope?.split(',') || [],
        status: 'connected' as const,
        connectedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(socialConnections).set(values).where(eq(socialConnections.id, existing.id));
      } else {
        await db.insert(socialConnections).values({ companyId: targetCompanyId, platform: platformForDb, ...values });
      }
    }

    // Store in ad connections if ad provider exists
    if (platformRegistry.hasAdProvider(platform)) {
      const existing = await db.query.adConnections.findFirst({
        where: and(eq(adConnections.companyId, targetCompanyId), eq(adConnections.platform, platformForDb)),
      });

      const values = {
        accessToken: (tokens.extra?.userAccessToken as string | undefined) || tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt,
        platformAccountId: tokens.extra?.adAccountId as string || (tokens.extra?.pages as any[])?.[0]?.id || undefined,
        platformAccountName: (tokens.extra?.pages as any[])?.[0]?.name || tokens.extra?.username as string || undefined,
        platformBusinessId: tokens.extra?.businessId as string || undefined,
        permissions: tokens.scope?.split(',') || [],
        status: 'connected' as const,
        connectedAt: new Date(),
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(adConnections).set(values).where(eq(adConnections.id, existing.id));
      } else {
        await db.insert(adConnections).values({ companyId: targetCompanyId, platform: platformForDb, ...values });
      }
    }

    // Close popup and notify parent window
    const webUrl = process.env.WEB_URL || 'http://localhost:3004';
    return c.html(`
      <html><body>
        <h2>Connected ${config?.displayName || platform}!</h2>
        <p>You can close this window.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'oauth_success', platform: '${platform}' }, '${webUrl}');
          }
          setTimeout(() => window.close(), 1500);
        </script>
      </body></html>
    `);
  } catch (err) {
    console.error(`[Integrations] OAuth callback failed for ${platform}:`, err);
    const safeErrorMsg = 'Connection failed. Please try again.';
    const webUrl = process.env.WEB_URL || 'http://localhost:3004';
    return c.html(`
      <html><body>
        <h2>Connection Failed</h2>
        <p>${safeErrorMsg}</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'oauth_error', platform: '${platform}', error: '${safeErrorMsg}' }, '${webUrl}');
          }
          setTimeout(() => window.close(), 3000);
        </script>
      </body></html>
    `);
  }
});

// ============================================================================
// STATUS CHECK
// ============================================================================

integrationsRouter.get('/:platform/status', async (c) => {
  const platform = c.req.param('platform')!;
  const platformForDb = platform as any;
  const { userId } = c.get('user');

  if (platform === 'google_drive') {
    const userCompanies = await getUserCompanies(userId);
    if (!userCompanies.length) return c.json({ connected: false });
    return c.json(await getGoogleDriveStatus(userCompanies[0]!.id, userId));
  }
  if (platform === 'onedrive') {
    const userCompanies = await getUserCompanies(userId);
    if (!userCompanies.length) return c.json({ connected: false });
    return c.json(await getOneDriveStatus(userCompanies[0]!.id, userId));
  }

  // Special case: Google Search Console
  if (platform === 'google_search_console' || platform === 'google') {
    return handleGSCStatus(c);
  }

  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.length) return c.json({ connected: false });
  const companyId = userCompanies[0]!.id;

  const socialConn = await db.query.socialConnections.findFirst({
    where: and(eq(socialConnections.companyId, companyId), eq(socialConnections.platform, platformForDb)),
  });

  const adConn = await db.query.adConnections.findFirst({
    where: and(eq(adConnections.companyId, companyId), eq(adConnections.platform, platformForDb)),
  });

  const conn = socialConn || adConn;
  if (!conn) return c.json({ connected: false });

  return c.json({
    connected: conn.status === 'connected',
    status: conn.status,
    connectedAt: conn.connectedAt?.toISOString(),
    accountName: conn.platformAccountName,
  });
});

// ============================================================================
// DISCONNECT
// ============================================================================

integrationsRouter.post('/:platform/disconnect', async (c) => {
  const platform = c.req.param('platform')!;
  const platformForDb = platform as any;
  const { userId } = c.get('user');

  const body = await c.req.json().catch(() => ({}));
  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.length) return c.json({ success: false, error: 'No company found' }, 400);
  const requestedCompanyId = typeof body.companyId === 'string' ? body.companyId : undefined;
  const companyId = requestedCompanyId || userCompanies[0]!.id;
  if (!userCompanies.some((company) => company.id === companyId)) {
    return c.json({ success: false, error: 'No company found' }, 400);
  }

  if (platform === 'google_drive') {
    await disconnectGoogleDrive(companyId, userId);
    return c.json({ success: true });
  }
  if (platform === 'onedrive') {
    await disconnectOneDrive(companyId, userId);
    return c.json({ success: true });
  }

  // Disconnect from both tables
  await db.update(socialConnections)
    .set({ status: 'revoked', accessToken: '', updatedAt: new Date() })
    .where(and(eq(socialConnections.companyId, companyId), eq(socialConnections.platform, platformForDb)));

  await db.update(adConnections)
    .set({ status: 'revoked', accessToken: '', updatedAt: new Date() })
    .where(and(eq(adConnections.companyId, companyId), eq(adConnections.platform, platformForDb)));

  return c.json({ success: true });
});

integrationsRouter.get('/google_drive/company/:companyId/files', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  try {
    await verifyCompanyAccess(userId, companyId);
    const files = await listGoogleDriveFiles(companyId, userId, c.req.query('q'));
    return c.json({ files });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read Google Drive files.';
    return c.json({ message }, 400);
  }
});

integrationsRouter.post('/google_drive/company/:companyId/picker-url', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const body = await c.req.json().catch(() => ({}));

  if (!isGoogleDriveConfigured()) {
    return c.json({ error: 'Google Drive is not available at this time' }, 400);
  }

  try {
    await verifyCompanyAccess(userId, companyId);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
    const apiBase = baseUrl.includes('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;
    const redirectUri = `${apiBase}/integrations/google_drive/callback`;
    const mimeTypes = typeof body.mimeTypes === 'string' ? body.mimeTypes : undefined;
    return c.json({
      url: buildGoogleDrivePickerAuthUrl(userId, companyId, redirectUri, { mimeTypes }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open Google Drive picker.';
    return c.json({ message }, 400);
  }
});

integrationsRouter.get('/onedrive/company/:companyId/files', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  try {
    await verifyCompanyAccess(userId, companyId);
    const files = await listOneDriveFiles(companyId, userId, c.req.query('q'));
    return c.json({ files });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read OneDrive files.';
    return c.json({ message }, 400);
  }
});

// ============================================================================
// LEGACY: Google Search Console (keep backward compatibility)
// ============================================================================

async function handleGoogleDriveAuthUrl(c: any) {
  if (!isGoogleDriveConfigured()) {
    return c.json({ error: 'Google Drive is not available at this time' }, 400);
  }

  const { userId } = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const userCompanies = await getUserCompanies(userId);
  const companyId = body.companyId || userCompanies[0]?.id;
  if (!companyId || !userCompanies.some((company) => company.id === companyId)) {
    return c.json({ error: 'Company not found' }, 400);
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
  const apiBase = baseUrl.includes('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;
  const redirectUri = `${apiBase}/integrations/google_drive/callback`;
  return c.json({ url: buildGoogleDriveAuthUrl(userId, companyId, redirectUri) });
}

async function handleGoogleDriveCallback(c: any) {
  const code = c.req.query('code');
  const oauthError = c.req.query('error');
  const oauthErrorDescription = c.req.query('error_description');
  const pickedFileIds = c.req.query('picked_file_ids');
  const state = c.req.query('state') || '';
  const [userId, platform, maybePicker, maybeCompanyId] = state.split(':');
  const isPickerFlow = maybePicker === 'picker';
  const companyId = isPickerFlow ? maybeCompanyId : maybePicker;
  const webUrl = process.env.WEB_URL || 'http://localhost:3004';

  if (oauthError) {
    return c.html(oauthPopupHtml(
      webUrl,
      'oauth_error',
      'google_drive',
      oauthErrorDescription || oauthError,
    ));
  }

  if (!code || platform !== 'google_drive' || !userId || !companyId) {
    return c.html(oauthPopupHtml(webUrl, 'oauth_error', 'google_drive', 'Invalid Google Drive authorization response.'));
  }

  try {
    await verifyCompanyAccess(userId, companyId);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
    const apiBase = baseUrl.includes('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;
    const redirectUri = `${apiBase}/integrations/google_drive/callback`;
    if (isPickerFlow) {
      const fileId = typeof pickedFileIds === 'string'
        ? pickedFileIds.split(',').map((id: string) => id.trim()).find(Boolean)
        : undefined;
      if (!fileId) {
        return c.html(oauthPopupHtml(webUrl, 'oauth_error', 'google_drive', 'No Google Drive file was selected.'));
      }
      const selectedFile = await connectGoogleDrivePickedFile(code, redirectUri, companyId, userId, fileId);
      return c.html(oauthPopupHtml(webUrl, 'oauth_success', 'google_drive', undefined, {
        picker: true,
        selectedFile,
      }));
    }
    await connectGoogleDrive(code, redirectUri, companyId, userId);
    return c.html(oauthPopupHtml(webUrl, 'oauth_success', 'google_drive'));
  } catch (err) {
    console.error('[Integrations] Google Drive OAuth callback failed:', err);
    return c.html(oauthPopupHtml(webUrl, 'oauth_error', 'google_drive', 'Connection failed. Please try again.'));
  }
}

async function handleOneDriveAuthUrl(c: any) {
  if (!isOneDriveConfigured()) {
    return c.json({ error: 'OneDrive is not available at this time' }, 400);
  }

  const { userId } = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const userCompanies = await getUserCompanies(userId);
  const companyId = body.companyId || userCompanies[0]?.id;
  if (!companyId || !userCompanies.some((company) => company.id === companyId)) {
    return c.json({ error: 'Company not found' }, 400);
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
  const apiBase = baseUrl.includes('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;
  const redirectUri = `${apiBase}/integrations/onedrive/callback`;
  return c.json({ url: buildOneDriveAuthUrl(userId, companyId, redirectUri) });
}

async function handleOneDriveCallback(c: any) {
  const code = c.req.query('code');
  const oauthError = c.req.query('error');
  const oauthErrorDescription = c.req.query('error_description');
  const state = c.req.query('state') || '';
  const [userId, platform, companyId] = state.split(':');
  const webUrl = process.env.WEB_URL || 'http://localhost:3004';

  if (oauthError) {
    return c.html(oauthPopupHtml(
      webUrl,
      'oauth_error',
      'onedrive',
      oauthErrorDescription || oauthError,
    ));
  }

  if (!code || platform !== 'onedrive' || !userId || !companyId) {
    return c.html(oauthPopupHtml(webUrl, 'oauth_error', 'onedrive', 'Invalid OneDrive authorization response.'));
  }

  try {
    await verifyCompanyAccess(userId, companyId);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
    const apiBase = baseUrl.includes('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;
    const redirectUri = `${apiBase}/integrations/onedrive/callback`;
    await connectOneDrive(code, redirectUri, companyId, userId);
    return c.html(oauthPopupHtml(webUrl, 'oauth_success', 'onedrive'));
  } catch (err) {
    console.error('[Integrations] OneDrive OAuth callback failed:', err);
    const message = err instanceof Error ? err.message : 'Connection failed. Please try again.';
    return c.html(oauthPopupHtml(webUrl, 'oauth_error', 'onedrive', message));
  }
}

async function verifyCompanyAccess(userId: string, companyId: string) {
  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.some((company) => company.id === companyId)) {
    throw new Error('Company not found');
  }
}

function oauthPopupHtml(
  webUrl: string,
  type: 'oauth_success' | 'oauth_error',
  platform: string,
  error?: string,
  extraPayload?: Record<string, unknown>,
) {
  const platformName = platform === 'google_drive' ? 'Google Drive' : platform === 'onedrive' ? 'OneDrive' : platform;
  const title = type === 'oauth_success' ? `Connected ${platformName}!` : 'Connection Failed';
  const payload = JSON.stringify({ type, platform, error, ...extraPayload });
  const safeError = error ? escapeHtml(error) : '';
  return `
    <html><body style="font-family: Arial, sans-serif; padding: 24px; color: #111827;">
      <h2>${escapeHtml(title)}</h2>
      ${safeError
        ? `<p style="max-width: 560px; color: #b91c1c; line-height: 1.5;">${safeError}</p>`
        : '<p>You can close this window.</p>'}
      <script>
        if (window.opener) {
          window.opener.postMessage(${payload}, '${webUrl}');
        }
        setTimeout(() => window.close(), ${type === 'oauth_success' ? 1500 : 3000});
      </script>
    </body></html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function handleGSCAuthUrl(c: any) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return c.json({ error: 'Google services are not available at this time' }, 400);

  // Ensure redirect URI includes /api/v1 and matches Google Cloud Console config
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
  const apiBase = baseUrl.includes('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;
  const redirectUri = `${apiBase}/integrations/google/callback`;
  // One Google connect grants both Search Console AND Analytics (GA4) read access.
  const scope = [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/analytics.readonly',
  ].join(' ');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${c.get('user').userId}`;
  return c.json({ url });
}

async function handleGSCCallback(c: any) {
  const code = c.req.query('code');
  const userId = c.req.query('state');
  if (!code) return c.html('<html><body><h1>Error</h1><p>No code received.</p></body></html>');

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
  const apiBase = baseUrl.includes('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;
  const redirectUri = `${apiBase}/integrations/google/callback`;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
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

    const data = await response.json();
    if (data.refresh_token && userId) {
      const { companies } = await import('@1person/core/db');
      const userCompanies = await db.query.companies.findMany({ where: eq(companies.ownerId, userId) });
      for (const company of userCompanies) {
        await db.insert(knowledgeBase).values({
          companyId: company.id,
          category: 'integration_google',
          title: 'Google Search Console Token',
          content: JSON.stringify({ refreshToken: data.refresh_token, accessToken: data.access_token, connectedAt: new Date().toISOString() }),
          source: 'oauth',
        }).onConflictDoNothing();
      }

      const webUrl = process.env.WEB_URL || 'http://localhost:3004';
      return c.redirect(`${webUrl}/companies?google=connected`);
    }

    return c.html(`<html><body><h1>Error</h1><p>Failed to get refresh token</p></body></html>`);
  } catch {
    return c.html(`<html><body><h1>Error</h1><p>OAuth exchange failed</p></body></html>`);
  }
}

async function handleGSCStatus(c: any) {
  const { userId } = c.get('user');
  const { companies } = await import('@1person/core/db');
  const userCompanies = await db.query.companies.findMany({ where: eq(companies.ownerId, userId) });

  for (const company of userCompanies) {
    const integration = await db.query.knowledgeBase.findFirst({
      where: and(eq(knowledgeBase.companyId, company.id), eq(knowledgeBase.category, 'integration_google')),
    });
    if (integration) {
      const data = JSON.parse(integration.content);
      return c.json({ connected: true, connectedAt: data.connectedAt });
    }
  }

  return c.json({ connected: false });
}

export default integrationsRouter;
