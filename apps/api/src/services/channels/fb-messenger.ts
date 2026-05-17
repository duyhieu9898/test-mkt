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
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import {
  channelConnections,
  omnichannelMessages,
  chatbotConfig,
  type ChannelConnection,
} from '@1person/core/db';
import { decryptSecret } from '../../lib/crypto';
import { llmGenerate } from '../../lib/llm';
import { buildBusinessContext } from '../business-context';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

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
