/**
 * Facebook Messenger channel service (Block 6 / Đợt 6 — MVP).
 *
 * Responsibilities:
 *   - Verify FB webhook subscription handshake.
 *   - Parse inbound Messenger webhook payloads → normalized message objects.
 *   - Send outbound text messages via Graph API.
 *   - Persist inbound/outbound messages in `omnichannel_messages`.
 *   - When connection has `aiAutoReply` ON, generate a reply using the same
 *     chat logic as the website widget chatbot (Brand IQ + knowledge context).
 *
 * Tokens come from `channel_connections.connectionData.encryptedPageAccessToken`
 * (encrypted via lib/crypto.ts). No FB_APP_* env vars are required at runtime —
 * the founder pastes their page token via the admin UI per existing platform
 * pattern.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import {
  channelConnections,
  socialConnections,
  omnichannelMessages,
  chatbotConfig,
  type ChannelConnection,
  type SocialConnection,
} from '@1person/core/db';
import { decryptMaybe, decryptSecret } from '../../lib/crypto';
import { llmGenerate } from '../../lib/llm';
import { buildBusinessContext } from '../business-context';
import {
  missingFacebookPublishPermissions,
  resolveFacebookPageAccess,
} from '../facebook-page-access';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export type FacebookPublishConnection = ChannelConnection | SocialConnection;

export function isFacebookReconnectRequiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return [
    /reconnect facebook/i,
    /not a page managed by this token/i,
    /missing pages_[a-z_]+/i,
    /facebook page connection is incomplete/i,
    /invalid.*access token/i,
    /error validating access token/i,
    /access token.*expired/i,
    /session has expired/i,
  ].some((pattern) => pattern.test(message));
}

export interface NormalizedInbound {
  pageId: string;
  senderId: string;
  senderName?: string;
  threadId: string;
  externalMessageId?: string;
  text: string;
  attachments: Array<Record<string, unknown>>;
  receivedAt: Date;
}

/** Webhook GET handshake — Meta requires echo of `hub.challenge` when token matches. */
export function verifyWebhook(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
  expectedToken: string,
): { ok: boolean; challenge?: string } {
  if (mode === 'subscribe' && token && expectedToken && token === expectedToken) {
    return { ok: true, challenge: challenge ?? '' };
  }
  return { ok: false };
}

/** Parse FB Messenger webhook payload into normalized messages. */
export function parseIncomingEvent(payload: unknown): NormalizedInbound[] {
  const out: NormalizedInbound[] = [];
  const body = payload as { object?: string; entry?: Array<Record<string, unknown>> };
  if (!body?.entry || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry) {
    const pageId = String(entry.id ?? '');
    const messaging = (entry.messaging ?? []) as Array<Record<string, any>>;
    for (const evt of messaging) {
      const msg = evt.message;
      const senderId = evt.sender?.id;
      // Skip echoes (replies we sent ourselves) and delivery/read receipts.
      if (!msg || msg.is_echo || !senderId) continue;
      const text = typeof msg.text === 'string' ? msg.text : '';
      const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
      if (!text && attachments.length === 0) continue;
      out.push({
        pageId,
        senderId: String(senderId),
        threadId: String(senderId), // 1:1 thread keyed by PSID
        externalMessageId: msg.mid ? String(msg.mid) : undefined,
        text: text || '[attachment]',
        attachments,
        receivedAt: evt.timestamp ? new Date(Number(evt.timestamp)) : new Date(),
      });
    }
  }
  return out;
}

/** Resolve which company owns a given FB page (from connectionData.pageId). */
export async function findConnectionByPageId(pageId: string): Promise<ChannelConnection | null> {
  const rows = await db.select().from(channelConnections).where(
    and(
      eq(channelConnections.channel, 'fb_messenger'),
      eq(channelConnections.status, 'active'),
    ),
  );
  return rows.find((r) => (r.connectionData as any)?.pageId === pageId) ?? null;
}

/** Send a plain-text message via Graph API; throws on non-2xx. */
export async function sendMessage(
  connection: ChannelConnection,
  recipientId: string,
  text: string,
): Promise<{ externalMessageId?: string }> {
  const data = connection.connectionData as Record<string, unknown>;
  const encrypted = data?.encryptedPageAccessToken as string | undefined;
  if (!encrypted) throw new Error('Channel connection missing page access token');
  const accessToken = decryptSecret(encrypted);

  const res = await fetch(`${GRAPH_API_BASE}/me/messages?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text: text.slice(0, 2000) },
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(`FB send failed (${res.status}): ${payload?.error?.message ?? 'unknown'}`);
  }
  return { externalMessageId: payload?.message_id };
}

/** Find the active FB Page connection for a company (for organic publishing). */
export async function findActiveFbConnections(companyId: string): Promise<FacebookPublishConnection[]> {
  const socialRows = await db
    .select()
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.companyId, companyId),
        eq(socialConnections.platform, 'facebook'),
        eq(socialConnections.status, 'connected'),
      ),
    )
    .orderBy(desc(socialConnections.updatedAt), desc(socialConnections.connectedAt));

  const omnichannelRows = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.companyId, companyId),
        eq(channelConnections.channel, 'fb_messenger'),
        eq(channelConnections.status, 'active'),
      ),
    )
    .orderBy(desc(channelConnections.connectedAt));

  return [...socialRows, ...omnichannelRows];
}

export async function findActiveFbConnection(companyId: string): Promise<FacebookPublishConnection | null> {
  return (await findActiveFbConnections(companyId))[0] ?? null;
}

function getFacebookPublishCredentials(connection: FacebookPublishConnection): {
  pageId?: string;
  accessToken?: string;
} {
  if ('connectionData' in connection) {
    const data = connection.connectionData as Record<string, unknown>;
    const pageId = data?.pageId as string | undefined;
    const encrypted = data?.encryptedPageAccessToken as string | undefined;
    return {
      pageId,
      accessToken: encrypted ? decryptSecret(encrypted) : undefined,
    };
  }

  return {
    pageId: connection.platformPageId ?? connection.platformUserId ?? undefined,
    accessToken: decryptMaybe(connection.accessToken),
  };
}

/**
 * Resolve and validate the Page token once before publishing or reading
 * insights. Keeping this in the connection service prevents callers from
 * needing to know whether the token came from Channels or Social Distribution.
 */
export async function resolveFacebookPublishAccess(
  connection: FacebookPublishConnection,
  options: { requirePublishing?: boolean } = {},
): Promise<{ pageId: string; accessToken: string }> {
  const { pageId, accessToken } = getFacebookPublishCredentials(connection);
  if (!pageId || !accessToken) throw new Error('Facebook Page connection is incomplete');
  const pageAccess = await resolveFacebookPageAccess(accessToken, pageId);
  if (!pageAccess.requestedPageFound) {
    const available = pageAccess.availablePages
      .map((page) => `${page.name || 'Unnamed Page'} (${page.id})`)
      .join(', ');
    throw new Error(
      `The configured Facebook Page ID ${pageId} is not a Page managed by this token.`
      + (available ? ` Available Page: ${available}.` : '')
      + ' Reconnect Facebook with the correct Page ID.',
    );
  }
  const missingPermissions = options.requirePublishing === false
    ? (
      pageAccess.permissions.length > 0
      && !pageAccess.permissions.includes('pages_read_engagement')
        ? ['pages_read_engagement']
        : []
    )
    : missingFacebookPublishPermissions(pageAccess.permissions);
  if (missingPermissions.length > 0) {
    throw new Error(
      `Facebook connection is missing ${missingPermissions.join(', ')}. `
      + 'Reconnect the Page with an admin account and grant the requested permissions.',
    );
  }
  if (
    options.requirePublishing !== false
    &&
    pageAccess.pageTasks?.length
    && !pageAccess.pageTasks.includes('CREATE_CONTENT')
  ) {
    throw new Error(
      'Your Facebook account does not have permission to create content on this Page. '
      + 'Ask a Page owner to grant Full control, then reconnect.',
    );
  }
  return { pageId, accessToken: pageAccess.accessToken };
}

/**
 * Try every active Facebook connection for a company. This handles legacy
 * duplicate rows safely: a stale Social Distribution row must not block a
 * newer valid connection saved by Channels.
 */
export async function resolveActiveFacebookAccess(
  companyId: string,
  options: { requirePublishing?: boolean } = {},
): Promise<{ connection: FacebookPublishConnection; pageId: string; accessToken: string }> {
  const connections = await findActiveFbConnections(companyId);
  let lastError: unknown;
  for (const connection of connections) {
    try {
      const access = await resolveFacebookPublishAccess(connection, options);
      return { connection, ...access };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('No Facebook Page connected. Connect a Facebook Page in Channels first.');
}

/**
 * Publish an organic post to the connected Facebook Page feed (T04).
 * Reuses the page access token stored for Messenger. Requires the token to
 * carry `pages_manage_posts`; if it doesn't, Graph returns a clear error we surface.
 */
export async function publishPagePost(
  connection: FacebookPublishConnection,
  text: string,
  options?: string | { link?: string; mediaUrls?: string[]; mediaType?: 'image' | 'video' },
): Promise<{ externalId: string; externalUrl?: string }> {
  const { pageId, accessToken } = await resolveFacebookPublishAccess(connection);

  const link = typeof options === 'string' ? options : options?.link;
  const mediaUrl = typeof options === 'object'
    ? options.mediaUrls?.find((url) => typeof url === 'string' && url.trim().length > 0)
    : undefined;
  const mediaType = typeof options === 'object' ? options.mediaType : undefined;
  const body: Record<string, string> = {
    message: text.slice(0, 5000),
    access_token: accessToken,
  };
  if (mediaUrl && mediaType === 'video') {
    body.description = text.slice(0, 5000);
    body.file_url = mediaUrl;
    delete body.message;
  } else if (mediaUrl) {
    body.url = mediaUrl;
  } else if (link) {
    body.link = link;
  }

  const endpoint = mediaUrl ? (mediaType === 'video' ? 'videos' : 'photos') : 'feed';
  const res = await fetch(`${GRAPH_API_BASE}/${encodeURIComponent(pageId)}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    if (payload?.error?.code === 200) {
      throw new Error(
        'Facebook rejected this Page token. Reconnect Facebook and grant '
        + 'pages_read_engagement and pages_manage_posts using a Page admin account.',
      );
    }
    throw new Error(`FB page publish failed (${res.status}): ${payload?.error?.message ?? 'unknown'}`);
  }
  const externalId = payload?.post_id ?? payload?.id ?? '';
  let externalUrl = externalId ? `https://www.facebook.com/${externalId}` : undefined;
  if (externalId) {
    try {
      const permalinkUrl = new URL(`${GRAPH_API_BASE}/${encodeURIComponent(externalId)}`);
      permalinkUrl.searchParams.set('fields', 'permalink_url');
      permalinkUrl.searchParams.set('access_token', accessToken);
      const permalinkResponse = await fetch(permalinkUrl);
      const permalinkPayload = (await permalinkResponse.json().catch(() => ({}))) as {
        permalink_url?: string;
      };
      if (permalinkResponse.ok && permalinkPayload.permalink_url) {
        externalUrl = permalinkPayload.permalink_url;
      }
    } catch (error) {
      console.warn('[facebook] Could not resolve published post permalink:', error);
    }
  }
  return {
    externalId,
    externalUrl,
  };
}

/** Persist inbound + (optionally) generate & send an AI reply. */
export async function handleInboundMessage(
  companyId: string,
  connection: ChannelConnection,
  normalized: NormalizedInbound,
): Promise<void> {
  // 1) Save inbound
  const [inbound] = await db.insert(omnichannelMessages).values({
    companyId,
    channelConnectionId: connection.id,
    channel: 'fb_messenger',
    externalThreadId: normalized.threadId,
    externalMessageId: normalized.externalMessageId,
    direction: 'inbound',
    senderExternalId: normalized.senderId,
    senderName: normalized.senderName,
    content: normalized.text,
    attachments: normalized.attachments,
    receivedAt: normalized.receivedAt,
    status: connection.aiAutoReply ? 'received' : 'pending_human',
  }).returning();

  await db.update(channelConnections)
    .set({ lastMessageAt: new Date() })
    .where(eq(channelConnections.id, connection.id));

  // 1b) Brain Hub internal tap — fire-and-forget. Watchers (Phase B)
  // detect recurring DM topics from this stream.
  void import('../brain-hub/event-service').then(({ ingestInternalTap }) =>
    ingestInternalTap({
      companyId,
      subtype: 'omnichannel_message',
      type: 'message',
      subject: `FB Messenger · ${normalized.senderName ?? normalized.senderId}`,
      content: normalized.text,
      payload: {
        channel: 'fb_messenger',
        threadId: normalized.threadId,
        senderId: normalized.senderId,
        senderName: normalized.senderName,
      },
      occurredAt: normalized.receivedAt,
    }),
  );

  // 2) Optional AI auto-reply (opt-in per connection — default off).
  if (!connection.aiAutoReply || !inbound) return;

  try {
    const bot = await db.query.chatbotConfig.findFirst({
      where: eq(chatbotConfig.companyId, companyId),
    });
    const ctx = await buildBusinessContext(companyId, 'public');
    const knowledge = ctx.fullContext || 'No knowledge base configured.';
    const persona = `You are ${bot?.name || 'AI Assistant'}, a ${bot?.tone || 'friendly'} assistant`
      + ` replying on Facebook Messenger. Use this knowledge:\n${knowledge}\n\n`
      + `Keep replies under 3 sentences. Never invent facts.`;
    const res = await llmGenerate(
      [{ role: 'system', content: persona }, { role: 'user', content: normalized.text }],
      { maxTokens: 300 },
    );
    const reply = res.text.trim();
    if (!reply) return;
    const sent = await sendMessage(connection, normalized.senderId, reply);
    await db.insert(omnichannelMessages).values({
      companyId,
      channelConnectionId: connection.id,
      channel: 'fb_messenger',
      externalThreadId: normalized.threadId,
      externalMessageId: sent.externalMessageId,
      direction: 'outbound',
      senderExternalId: 'ai',
      senderName: bot?.name || 'AI Assistant',
      content: reply,
      aiHandled: true,
      sentAt: new Date(),
      status: 'replied',
    });
    await db.update(omnichannelMessages)
      .set({ status: 'replied', aiHandled: true })
      .where(eq(omnichannelMessages.id, inbound.id));
  } catch (err) {
    console.error('[fb-messenger] auto-reply failed', err);
    await db.update(omnichannelMessages)
      .set({ status: 'failed' })
      .where(eq(omnichannelMessages.id, inbound.id));
  }
}
