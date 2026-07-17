/**
 * Omnichannel routes (Block 6 / Đợt 6 — FB Messenger MVP).
 *
 * Authenticated CRUD for channel connections (founder paste-in tokens) plus
 * unified message inbox + manual reply. The public Meta webhook itself is
 * mounted under `/webhooks/omnichannel/messenger` in index.ts to skip auth.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import {
  channelConnections,
  omnichannelMessages,
  companies,
  socialConnections,
} from '@1person/core/db';
import { encryptSecret, maskSecret, decryptSecret } from '../lib/crypto';
import {
  verifyWebhook,
  parseIncomingEvent,
  findConnectionByPageId,
  handleInboundMessage,
  sendMessage,
} from '../services/channels/fb-messenger';
import {
  canCreateFacebookPageContent,
  missingFacebookPublishPermissions,
  resolveFacebookPageAccess,
} from '../services/facebook-page-access';
import {
  FacebookOAuthProvider,
  getFacebookClientId,
} from '../services/platforms/providers/facebook';
import { env } from '../lib/env';

const router = new Hono();
const facebookOAuthProvider = new FacebookOAuthProvider();
const FACEBOOK_OAUTH_TTL_MS = 10 * 60 * 1000;

interface FacebookOAuthState {
  companyId: string;
  userId: string;
  expiresAt: number;
}

interface FacebookPageSession extends FacebookOAuthState {
  userAccessToken: string;
}

function publicApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1').replace(/\/+$/, '');
}

function facebookCallbackUrl(): string {
  return `${publicApiBaseUrl()}/omnichannel/facebook/oauth/callback`;
}

function encodeSecurePayload(payload: FacebookOAuthState | FacebookPageSession): string {
  return Buffer.from(encryptSecret(JSON.stringify(payload)), 'utf8').toString('base64url');
}

function decodeSecurePayload<T extends FacebookOAuthState>(payload: string): T {
  try {
    const encrypted = Buffer.from(payload, 'base64url').toString('utf8');
    const decoded = JSON.parse(decryptSecret(encrypted)) as T;
    if (!decoded.companyId || !decoded.userId || decoded.expiresAt < Date.now()) {
      throw new Error('Expired OAuth session');
    }
    return decoded;
  } catch {
    throw new HTTPException(400, { message: 'Facebook connection session is invalid or expired.' });
  }
}

function facebookPopupHtml(
  type: 'facebook_pages_ready' | 'facebook_oauth_error',
  data: Record<string, unknown>,
): string {
  const payload = JSON.stringify({ type, ...data }).replace(/</g, '\\u003c');
  const targetOrigin = JSON.stringify(env.WEB_URL);
  const isSuccess = type === 'facebook_pages_ready';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Facebook connection</title></head>
<body style="font-family:Arial,sans-serif;padding:24px;color:#111827">
  <h2>${isSuccess ? 'Facebook connected' : 'Connection failed'}</h2>
  <p>${isSuccess ? 'Return to 1Person to choose your Page.' : 'Please return to 1Person and try again.'}</p>
  <script>
    if (window.opener) window.opener.postMessage(${payload}, ${targetOrigin});
    setTimeout(function () { window.close(); }, ${isSuccess ? 800 : 2500});
  </script>
</body></html>`;
}

async function assertUserCompanyAccess(userId: string, companyId: string) {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
}

// ---------- Public webhook (NO auth — Meta calls this) ----------
// Mounted via webhook router in index.ts.
export const messengerWebhookRouter = new Hono();

messengerWebhookRouter.get('/messenger', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');
  if (!token) return c.text('Forbidden', 403);

  // FB sends one verify request per channel; match against any connection.
  const rows = await db.select().from(channelConnections).where(
    eq(channelConnections.channel, 'fb_messenger'),
  );
  const match = rows.find((r) => {
    const v = verifyWebhook(mode, token, challenge, (r.connectionData as any)?.verifyToken ?? '');
    return v.ok;
  });
  if (!match) return c.text('Forbidden', 403);
  return c.text(challenge ?? '', 200);
});

messengerWebhookRouter.post('/messenger', async (c) => {
  let payload: unknown;
  try { payload = await c.req.json(); } catch { return c.text('EVENT_RECEIVED', 200); }
  const events = parseIncomingEvent(payload);
  for (const evt of events) {
    try {
      const connection = await findConnectionByPageId(evt.pageId);
      if (!connection) continue;
      await handleInboundMessage(connection.companyId, connection, evt);
    } catch (err) {
      console.error('[omnichannel/messenger] handler error', err);
    }
  }
  // Per Meta spec — always 200 quickly.
  return c.text('EVENT_RECEIVED', 200);
});

// Meta redirects here without the 1Person Bearer token. The encrypted state
// carries the short-lived user/company context and is validated before use.
router.get('/facebook/oauth/callback', async (c) => {
  const code = c.req.query('code');
  const stateParam = c.req.query('state');
  if (!code || !stateParam) {
    return c.html(facebookPopupHtml('facebook_oauth_error', {
      error: 'Facebook did not return an authorization code.',
    }), 400);
  }

  try {
    const state = decodeSecurePayload<FacebookOAuthState>(stateParam);
    await assertUserCompanyAccess(state.userId, state.companyId);
    const tokens = await facebookOAuthProvider.exchangeCode(code, facebookCallbackUrl());
    const pages = ((tokens.extra?.pages ?? []) as Array<{
      id?: string;
      name?: string;
      picture?: { data?: { url?: string } };
      tasks?: string[];
    }>)
      .filter((page): page is typeof page & { id: string } => Boolean(page.id))
      .map((page) => ({
        id: page.id,
        name: page.name || 'Facebook Page',
        pictureUrl: page.picture?.data?.url,
        canPublish: canCreateFacebookPageContent(page.tasks),
      }));

    if (!pages.length) {
      return c.html(facebookPopupHtml('facebook_oauth_error', {
        error: 'No Facebook Pages were found for this account.',
      }), 400);
    }

    const session = encodeSecurePayload({
      ...state,
      expiresAt: Date.now() + FACEBOOK_OAUTH_TTL_MS,
      userAccessToken: tokens.accessToken,
    });
    return c.html(facebookPopupHtml('facebook_pages_ready', { session, pages }));
  } catch (error) {
    console.error('[omnichannel] Facebook OAuth callback failed', error);
    return c.html(facebookPopupHtml('facebook_oauth_error', {
      error: error instanceof Error ? error.message : 'Facebook connection failed.',
    }), 400);
  }
});

// ---------- Authenticated routes ----------
router.use('*', authMiddleware);

async function assertCompanyAccess(c: any, companyId: string) {
  const userId = (c.get('user') as any).userId;
  await assertUserCompanyAccess(userId, companyId);
}

function sanitize(conn: typeof channelConnections.$inferSelect) {
  const data = (conn.connectionData ?? {}) as any;
  return {
    id: conn.id,
    companyId: conn.companyId,
    channel: conn.channel,
    status: conn.status,
    aiAutoReply: conn.aiAutoReply,
    connectedAt: conn.connectedAt,
    lastMessageAt: conn.lastMessageAt,
    // Token NEVER returned in plaintext — masked preview only.
    config: {
      pageId: data.pageId,
      pageName: data.pageName,
      appId: data.appId,
      verifyTokenPreview: data.verifyToken ? maskSecret(data.verifyToken) : null,
      hasAccessToken: !!data.encryptedPageAccessToken,
      publishingEnabled: data.publishingEnabled !== false,
      messagingEnabled: data.messagingEnabled === true || !!data.verifyToken,
    },
  };
}

// List connections for a company
router.get('/company/:companyId', async (c) => {
  const { companyId } = c.req.param();
  await assertCompanyAccess(c, companyId);
  const rows = await db.select().from(channelConnections)
    .where(eq(channelConnections.companyId, companyId))
    .orderBy(desc(channelConnections.connectedAt));
  return c.json({ data: rows.map(sanitize) });
});

router.post('/company/:companyId/facebook/oauth/start', async (c) => {
  const { companyId } = c.req.param();
  await assertCompanyAccess(c, companyId);
  if (!facebookOAuthProvider.isConfigured()) {
    throw new HTTPException(503, { message: 'Facebook connection is not configured.' });
  }
  const userId = (c.get('user') as any).userId as string;
  const state = encodeSecurePayload({
    companyId,
    userId,
    expiresAt: Date.now() + FACEBOOK_OAUTH_TTL_MS,
  });
  return c.json({
    url: facebookOAuthProvider.getPageAuthorizationUrl(state, facebookCallbackUrl()),
  });
});

router.post(
  '/company/:companyId/facebook/oauth/select',
  zValidator('json', z.object({
    pageId: z.string().min(1),
    session: z.string().min(20),
  })),
  async (c) => {
    const { companyId } = c.req.param();
    await assertCompanyAccess(c, companyId);
    const body = c.req.valid('json');
    const session = decodeSecurePayload<FacebookPageSession>(body.session);
    const userId = (c.get('user') as any).userId as string;
    if (session.companyId !== companyId || session.userId !== userId) {
      throw new HTTPException(403, { message: 'This Facebook session belongs to another account.' });
    }
    const pageAccess = await resolveFacebookPageAccess(
      session.userAccessToken,
      body.pageId,
    );
    if (!pageAccess.requestedPageFound) {
      const available = pageAccess.availablePages
        .map((page) => `${page.name || 'Unnamed Page'} (${page.id})`)
        .join(', ');
      throw new HTTPException(400, {
        message: `Page ID ${body.pageId} does not belong to a Page managed by this token.`
          + (available ? ` Use: ${available}.` : ''),
      });
    }
    const missingPermissions = missingFacebookPublishPermissions(pageAccess.permissions);
    if (missingPermissions.length > 0) {
      throw new HTTPException(400, {
        message: `Facebook token is missing: ${missingPermissions.join(', ')}.`,
      });
    }
    if (!canCreateFacebookPageContent(pageAccess.pageTasks)) {
      throw new HTTPException(400, {
        message: 'This Facebook account cannot create content on the selected Page.',
      });
    }

    const connectionData = {
      pageId: body.pageId,
      pageName: pageAccess.pageName,
      appId: getFacebookClientId(),
      encryptedPageAccessToken: encryptSecret(pageAccess.accessToken),
      publishingEnabled: true,
      messagingEnabled: false,
      connectionSource: 'oauth',
    };
    const existingConnections = await db.select().from(channelConnections).where(
      and(
        eq(channelConnections.companyId, companyId),
        eq(channelConnections.channel, 'fb_messenger'),
      ),
    );
    const existing = existingConnections.find(
      (connection) => (connection.connectionData as Record<string, unknown>).pageId === body.pageId,
    ) ?? existingConnections.find(
      (connection) => (connection.connectionData as Record<string, unknown>).connectionSource === 'oauth',
    );
    const [saved] = existing
      ? await db.update(channelConnections)
        .set({ connectionData, status: 'active' })
        .where(eq(channelConnections.id, existing.id))
        .returning()
      : await db.insert(channelConnections).values({
        companyId,
        channel: 'fb_messenger',
        status: 'active',
        aiAutoReply: false,
        connectionData,
      }).returning();

    const socialValues = {
      accessToken: pageAccess.accessToken,
      platformPageId: body.pageId,
      platformAccountName: pageAccess.pageName,
      permissions: pageAccess.permissions,
      status: 'connected' as const,
      connectedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    };
    const socialConnection = await db.query.socialConnections.findFirst({
      where: and(
        eq(socialConnections.companyId, companyId),
        eq(socialConnections.platform, 'facebook'),
      ),
    });
    if (socialConnection) {
      await db.update(socialConnections)
        .set(socialValues)
        .where(eq(socialConnections.id, socialConnection.id));
    } else {
      await db.insert(socialConnections).values({
        companyId,
        platform: 'facebook',
        ...socialValues,
      });
    }

    return c.json(sanitize(saved!));
  },
);

// Toggle AI auto-reply
router.patch(
  '/:id/ai-auto-reply',
  zValidator('json', z.object({ enabled: z.boolean() })),
  async (c) => {
    const id = c.req.param('id');
    const conn = await db.query.channelConnections.findFirst({ where: eq(channelConnections.id, id) });
    if (!conn) throw new HTTPException(404, { message: 'Connection not found' });
    await assertCompanyAccess(c, conn.companyId);
    const [updated] = await db.update(channelConnections)
      .set({ aiAutoReply: c.req.valid('json').enabled })
      .where(eq(channelConnections.id, id))
      .returning();
    return c.json(sanitize(updated!));
  },
);

// Disconnect
router.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const conn = await db.query.channelConnections.findFirst({ where: eq(channelConnections.id, id) });
  if (!conn) throw new HTTPException(404, { message: 'Connection not found' });
  await assertCompanyAccess(c, conn.companyId);
  const data = conn.connectionData as Record<string, unknown>;
  await db.delete(channelConnections).where(eq(channelConnections.id, id));
  if (conn.channel === 'fb_messenger' && data.pageId) {
    await db.update(socialConnections)
      .set({ status: 'revoked', accessToken: '', updatedAt: new Date() })
      .where(and(
        eq(socialConnections.companyId, conn.companyId),
        eq(socialConnections.platform, 'facebook'),
        eq(socialConnections.platformPageId, String(data.pageId)),
      ));
  }
  return c.json({ deleted: true });
});

// List messages (unified inbox)
router.get('/company/:companyId/messages', async (c) => {
  const { companyId } = c.req.param();
  await assertCompanyAccess(c, companyId);
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const ccId = c.req.query('channelConnectionId');
  const conds = [eq(omnichannelMessages.companyId, companyId)];
  if (ccId) conds.push(eq(omnichannelMessages.channelConnectionId, ccId));
  const rows = await db.select().from(omnichannelMessages)
    .where(and(...conds))
    .orderBy(desc(omnichannelMessages.createdAt))
    .limit(limit);
  return c.json({ data: rows });
});

// Manual reply to an inbound message
router.post(
  '/messages/:id/reply',
  zValidator('json', z.object({ text: z.string().min(1).max(2000) })),
  async (c) => {
    const id = c.req.param('id');
    const msg = await db.query.omnichannelMessages.findFirst({ where: eq(omnichannelMessages.id, id) });
    if (!msg) throw new HTTPException(404, { message: 'Message not found' });
    await assertCompanyAccess(c, msg.companyId);
    if (msg.direction !== 'inbound') {
      throw new HTTPException(400, { message: 'Can only reply to inbound messages' });
    }
    const conn = await db.query.channelConnections.findFirst({ where: eq(channelConnections.id, msg.channelConnectionId) });
    if (!conn || !msg.senderExternalId) {
      throw new HTTPException(400, { message: 'Channel connection missing or no recipient' });
    }
    const { text } = c.req.valid('json');
    let externalMessageId: string | undefined;
    try {
      const sent = await sendMessage(conn, msg.senderExternalId, text);
      externalMessageId = sent.externalMessageId;
    } catch (err) {
      console.error('[omnichannel] manual reply send failed', err);
      throw new HTTPException(502, { message: 'Failed to deliver reply via channel' });
    }
    const [outbound] = await db.insert(omnichannelMessages).values({
      companyId: msg.companyId,
      channelConnectionId: msg.channelConnectionId,
      channel: msg.channel,
      externalThreadId: msg.externalThreadId,
      externalMessageId,
      direction: 'outbound',
      senderExternalId: 'human',
      senderName: 'You',
      content: text,
      aiHandled: false,
      sentAt: new Date(),
      status: 'replied',
    }).returning();
    await db.update(omnichannelMessages)
      .set({ status: 'replied' })
      .where(eq(omnichannelMessages.id, msg.id));
    return c.json({ data: outbound });
  },
);

// Tiny helper to confirm token encryption round-trips (used by integration test
// in dev console only — does not leak the secret).
export const __test = { encryptSecret, decryptSecret };

export default router;
