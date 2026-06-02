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

const integrationsRouter = new Hono();
integrationsRouter.use('*', authMiddleware);

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
  const companyId = userCompanies[0].id;

  // Query both connection tables
  const [socials, adConns, gscIntegration] = await Promise.all([
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

  return c.json({ connections });
});

// ============================================================================
// 1-CLICK CONNECT: POST /integrations/:platform/connect
// Returns OAuth URL — user clicks, logs in, done.
// No env vars, no developer setup, no technical jargon.
// ============================================================================

integrationsRouter.post('/:platform/connect', async (c) => {
  const platform = c.req.param('platform');

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
  const platform = c.req.param('platform');

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
  const platform = c.req.param('platform');

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

    const config = platformRegistry.getConfig(platform);
    const tokenExpiresAt = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000)
      : undefined;

    // Store in social connections if social provider exists
    if (platformRegistry.hasSocialProvider(platform)) {
      const existing = await db.query.socialConnections.findFirst({
        where: and(eq(socialConnections.companyId, companyId), eq(socialConnections.platform, platform)),
      });

      const values = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt,
        platformUserId: tokens.extra?.userId as string || tokens.extra?.openId as string || undefined,
        platformPageId: (tokens.extra?.pages as any[])?.[0]?.id || tokens.extra?.channelId as string || undefined,
        platformAccountName: (tokens.extra?.pages as any[])?.[0]?.name || tokens.extra?.username as string || tokens.extra?.channelTitle as string || undefined,
        permissions: tokens.scope?.split(',') || [],
        status: 'connected' as const,
        connectedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(socialConnections).set(values).where(eq(socialConnections.id, existing.id));
      } else {
        await db.insert(socialConnections).values({ companyId, platform, ...values });
      }
    }

    // Store in ad connections if ad provider exists
    if (platformRegistry.hasAdProvider(platform)) {
      const existing = await db.query.adConnections.findFirst({
        where: and(eq(adConnections.companyId, companyId), eq(adConnections.platform, platform)),
      });

      const values = {
        accessToken: tokens.accessToken,
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
        await db.insert(adConnections).values({ companyId, platform, ...values });
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
  const platform = c.req.param('platform');
  const { userId } = c.get('user');

  // Special case: Google Search Console
  if (platform === 'google_search_console' || platform === 'google') {
    return handleGSCStatus(c);
  }

  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.length) return c.json({ connected: false });
  const companyId = userCompanies[0].id;

  const socialConn = await db.query.socialConnections.findFirst({
    where: and(eq(socialConnections.companyId, companyId), eq(socialConnections.platform, platform)),
  });

  const adConn = await db.query.adConnections.findFirst({
    where: and(eq(adConnections.companyId, companyId), eq(adConnections.platform, platform)),
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
  const platform = c.req.param('platform');
  const { userId } = c.get('user');

  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.length) return c.json({ success: false, error: 'No company found' }, 400);
  const companyId = userCompanies[0].id;

  // Disconnect from both tables
  await db.update(socialConnections)
    .set({ status: 'revoked', accessToken: '', updatedAt: new Date() })
    .where(and(eq(socialConnections.companyId, companyId), eq(socialConnections.platform, platform)));

  await db.update(adConnections)
    .set({ status: 'revoked', accessToken: '', updatedAt: new Date() })
    .where(and(eq(adConnections.companyId, companyId), eq(adConnections.platform, platform)));

  return c.json({ success: true });
});

// ============================================================================
// LEGACY: Google Search Console (keep backward compatibility)
// ============================================================================

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
