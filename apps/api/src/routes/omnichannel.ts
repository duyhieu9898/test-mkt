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
} from '@1person/core/db';
import { encryptSecret, maskSecret, decryptSecret } from '../lib/crypto';
import {
  verifyWebhook,
  parseIncomingEvent,
  findConnectionByPageId,
  handleInboundMessage,
  sendMessage,
} from '../services/channels/fb-messenger';

const router = new Hono();

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

// ---------- Authenticated routes ----------
router.use('*', authMiddleware);

async function assertCompanyAccess(c: any, companyId: string) {
  const userId = (c.get('user') as any).userId;
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
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

// Connect FB Messenger
router.post(
  '/company/:companyId/fb-messenger/connect',
  zValidator('json', z.object({
    pageId: z.string().min(1),
    pageName: z.string().optional(),
    pageAccessToken: z.string().min(20),
    appId: z.string().min(1),
    verifyToken: z.string().min(8),
    aiAutoReply: z.boolean().optional(),
  })),
  async (c) => {
    const { companyId } = c.req.param();
    await assertCompanyAccess(c, companyId);
    const body = c.req.valid('json');
    const [created] = await db.insert(channelConnections).values({
      companyId,
      channel: 'fb_messenger',
      status: 'active',
      aiAutoReply: body.aiAutoReply ?? false,
      connectionData: {
        pageId: body.pageId,
        pageName: body.pageName,
        appId: body.appId,
        verifyToken: body.verifyToken,
        encryptedPageAccessToken: encryptSecret(body.pageAccessToken),
      },
    }).returning();
    return c.json(sanitize(created!));
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
  await db.delete(channelConnections).where(eq(channelConnections.id, id));
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
