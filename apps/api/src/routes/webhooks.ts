/** Public webhook endpoints for Facebook Messenger & Zalo OA */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { chatbotChannels, chatbotConfig, chatConversations, chatMessages } from '@1person/core/db';
import { llmGenerate } from '../lib/llm';
import { buildBusinessContext } from '../services/business-context';

const webhooksRouter = new Hono();

// Resolve channel, generate reply, return { reply, channel }
async function handleChannelMessage(platform: string, pageId: string, senderId: string, text: string) {
  const configKey = platform === 'zalo_oa' ? 'oaId' : 'pageId';
  const allCh = await db.select().from(chatbotChannels).where(eq(chatbotChannels.platform, platform));
  const channel = allCh.find((c) => (c.config as any)?.[configKey] === pageId && c.isActive);
  if (!channel) throw new Error(`No channel for ${platform}:${pageId}`);

  const bot = await db.query.chatbotConfig.findFirst({ where: eq(chatbotConfig.id, channel.botId) });
  if (!bot) throw new Error('Bot not found');

  const visitorId = `${platform}:${senderId}`;
  const existing = await db.query.chatConversations.findFirst({ where: eq(chatConversations.visitorId, visitorId) });
  let convId: string;
  if (existing && existing.companyId === bot.companyId) { convId = existing.id; }
  else { const [c] = await db.insert(chatConversations).values({ companyId: bot.companyId, botId: bot.id, visitorId, channel: 'web' as any }).returning(); convId = c!.id; }

  await db.insert(chatMessages).values({ conversationId: convId, role: 'visitor', content: text });

  // Knowledge context via RAG or SQL fallback
  let knowledge = '';
  try {
    const { getTenantAI, ensureTenantForCompany } = await import('../lib/tenant-ai');
    const { companies } = await import('@1person/core/db');
    const co = await db.query.companies.findFirst({ where: eq(companies.id, bot.companyId), columns: { id: true, name: true } });
    if (co) { const tid = await ensureTenantForCompany(co.id, co.name); const r = await getTenantAI().query({ tenantId: tid, question: text }); if (r.answer?.length > 20) knowledge = (r.sources || []).map((s: any) => s.chunkText || '').filter(Boolean).slice(0, 5).join('\n---\n') || r.answer; }
  } catch { /* RAG unavailable */ }
  if (!knowledge) { const ctx = await buildBusinessContext(bot.companyId, 'public'); knowledge = ctx.fullContext || 'No knowledge available.'; }

  const history = await db.select().from(chatMessages).where(eq(chatMessages.conversationId, convId)).orderBy(chatMessages.createdAt).limit(10);
  const histMsgs = history.slice(0, -1).map((m) => ({ role: m.role === 'visitor' ? 'user' as const : 'assistant' as const, content: m.content }));

  const sys = `You are ${bot.name || 'AI Assistant'}, a ${bot.tone || 'friendly'} assistant. Answer using this knowledge:\n${knowledge}\n\nKeep responses concise (2-3 sentences). Never make up facts.`;
  const res = await llmGenerate([{ role: 'system', content: sys }, ...histMsgs, { role: 'user', content: text }], { maxTokens: 400 });
  const reply = res.text.replace(/<!--QUICK_REPLIES-->[\s\S]*?<!--\/QUICK_REPLIES-->/, '').trim();

  await db.insert(chatMessages).values({ conversationId: convId, role: 'assistant', content: reply });
  await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, convId));
  return { reply, channel };
}

// -- Messenger --
webhooksRouter.get('/messenger', (c) => {
  const token = c.req.query('hub.verify_token'), challenge = c.req.query('hub.challenge');
  return token === (process.env.MESSENGER_VERIFY_TOKEN || '1person_verify') ? c.text(challenge || '', 200) : c.text('Forbidden', 403);
});

webhooksRouter.post('/messenger', async (c) => {
  const body = await c.req.json() as any;
  for (const entry of body.entry || []) {
    for (const evt of entry.messaging || []) {
      if (!evt.message?.text) continue;
      try {
        const { reply, channel } = await handleChannelMessage('messenger', entry.id, evt.sender.id, evt.message.text);
        await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${(channel.config as any).accessToken}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient: { id: evt.sender.id }, message: { text: reply } }),
        });
      } catch (err) { console.error('Messenger webhook error:', err); }
    }
  }
  return c.text('EVENT_RECEIVED', 200);
});

// -- Zalo OA --
webhooksRouter.post('/zalo', async (c) => {
  const body = await c.req.json() as any;
  if (body.event_name !== 'user_send_text' || !body.message?.text) return c.json({ status: 'ignored' });
  try {
    const { reply, channel } = await handleChannelMessage('zalo_oa', body.oa_id || body.recipient?.id || '', body.sender?.id || '', body.message.text);
    await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST', headers: { 'Content-Type': 'application/json', access_token: (channel.config as any).accessToken },
      body: JSON.stringify({ recipient: { user_id: body.sender?.id }, message: { text: reply } }),
    });
  } catch (err) { console.error('Zalo webhook error:', err); }
  return c.json({ status: 'ok' });
});

export default webhooksRouter;
