/**
 * Chatbot Engine API Routes
 *
 * Config, chat (with knowledge context), conversations, and public widget endpoints.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  chatConversations,
  chatMessages,
  chatbotConfig,
  leads,
  companies,
  landingPages,
  landingPageSections,
} from '@1person/core/db';
import { renderSkillKnowledgeBundle } from '@1person/core';
import { authMiddleware } from '../middleware/auth';
import { llmGenerate } from '../lib/llm';
import { buildBusinessContext } from '../services/business-context';
import { authorizeCompanyAccess, type CompanyPermission } from '../lib/company-access';

const chatbotRouter = new Hono();

const ONEPERSON_PLATFORM_CONTEXT = `
1PERSON PLATFORM KNOWLEDGE:
- 1Person is an AI-powered marketing automation platform for non-technical business owners and founders.
- Core promise: build a living Business Brain for each company, then use it to plan, create, publish, track, and learn from marketing work.
- Important areas: Dashboard, Growth Plan, Brand IQ, CEO Advisor, Your AI Team, Knowledge Hub, Brain Hub, Campaigns, Campaign Launcher, Landing Pages, Market & Competitors, AI Visibility/SEO, Analytics, Reports, Channels, Inbox, and Website Chatbox.
- Knowledge Hub/Brain Hub store company knowledge, uploaded files, website information, customer questions, campaign/blog learnings, and other business signals.
- Brand IQ stores brand voice, positioning, target audience, messaging rules, visual style, and customer language.
- CEO Advisor reads company knowledge, Brand IQ, market/competitor signals, campaigns, blogs, customers, and performance data to recommend next actions.
- Campaigns turn strategy into execution: plan the campaign, generate banners/social/blog/landing assets, review, launch, track performance, and learn.
- Landing Pages creates pages that can be hosted publicly or published to a connected WordPress site. Published 1Person landing pages can include this chatbox automatically.
- Market & Competitors helps identify competitors and market signals so strategy and CEO Advisor recommendations become more competitive.
- Website Chatbox is the visitor-facing AI assistant. It can answer using the current landing page, public company knowledge, and safe general marketing guidance.
`.trim();

const MARKETING_QUESTION_PATTERN =
  /\b(marketing|campaign|seo|content|blog|social|facebook|instagram|linkedin|ads?|landing page|conversion|cro|brand|positioning|audience|persona|lead|funnel|competitor|market|growth|strategy|copy|headline|cta|offer|pricing|analytics|roi|tiep thi|marketing|chien dich|quang cao|bai viet|mang xa hoi|doi thu|thi truong|thuong hieu|khach hang|doanh thu|tang truong)\b/i;

const ONEPERSON_QUESTION_PATTERN =
  /\b(1person|oneperson|this system|the system|platform|dashboard|brand iq|ceo advisor|growth plan|knowledge hub|brain hub|campaign launcher|landing pages?|market & competitors|website widget|chatbox|he thong|nen tang|bang dieu khien|tri tue thuong hieu|co van ceo|ke hoach tang truong)\b/i;

const chatbotConfigUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  greeting: z.string().min(1).optional(),
  tone: z.enum(['professional', 'friendly', 'bold']).optional(),
  mode: z.enum(['sales', 'support', 'both']).optional(),
  primaryColor: z.string().optional(),
  isActive: z.boolean().optional(),
  accessLevel: z.enum(['public', 'internal', 'admin']).optional(),
  embedEnabled: z.boolean().optional(),
  embedAllowedDomains: z.array(z.string()).optional(),
  logoUrl: z.string().url().max(1000).optional().nullable(),
  avatarUrl: z.string().url().max(1000).optional().nullable(),
  poweredByVisible: z.boolean().optional(),
});

function normalizeIntentText(message: string): string {
  return message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isMarketingQuestion(message: string): boolean {
  return MARKETING_QUESTION_PATTERN.test(normalizeIntentText(message));
}

function isOnePersonQuestion(message: string): boolean {
  return ONEPERSON_QUESTION_PATTERN.test(normalizeIntentText(message));
}

function buildMarketingAdvisorContext(message: string): string {
  if (!isMarketingQuestion(message)) return '';

  // Keep this bounded: chatbot answers need practical guidance, not the full
  // Marketing Playbooks Studio. The selected frameworks cover most visitor
  // questions about strategy, offers, pages, social, SEO, and measurement.
  const framework = renderSkillKnowledgeBundle(
    ['marketing-plan', 'product-marketing', 'offers', 'cro', 'social', 'ai-seo', 'analytics'],
    { maxCharsEach: 900 },
  );

  return [
    'MARKETING ADVISORY KNOWLEDGE:',
    'Use this only for general marketing advice or when the visitor asks for recommendations. Do not invent company-specific facts.',
    framework,
  ].filter(Boolean).join('\n\n');
}

function stringifyLandingValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(stringifyLandingValue).filter(Boolean).join('; ');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/image|icon|color|style/i.test(key))
      .map(([key, entry]) => {
        const text = stringifyLandingValue(entry);
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

async function buildLandingPageContext(companyId: string, pageId?: string | null): Promise<string> {
  if (!pageId) return '';
  const page = await db.query.landingPages.findFirst({
    where: and(eq(landingPages.id, pageId), eq(landingPages.companyId, companyId)),
  });
  if (!page) return '';

  const sections = await db
    .select({
      type: landingPageSections.type,
      name: landingPageSections.name,
      order: landingPageSections.order,
      content: landingPageSections.content,
    })
    .from(landingPageSections)
    .where(and(
      eq(landingPageSections.pageId, pageId),
      eq(landingPageSections.isVisible, 1),
    ))
    .orderBy(landingPageSections.order);

  const sectionText = sections
    .map((section) => {
      const text = stringifyLandingValue(section.content).slice(0, 900);
      return text ? `- ${section.name || section.type}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');

  return [
    'CURRENT PUBLISHED LANDING PAGE CONTEXT:',
    `Page name: ${page.name}`,
    page.description ? `Description: ${page.description}` : '',
    page.originalPrompt ? `Original request: ${page.originalPrompt}` : '',
    page.businessContext ? `Business context: ${JSON.stringify(page.businessContext).slice(0, 1200)}` : '',
    sectionText ? `Visible page sections:\n${sectionText}` : '',
  ].filter(Boolean).join('\n');
}

type BrowserPageContext = {
  url?: string | null;
  title?: string | null;
  description?: string | null;
  headings?: string[] | null;
  text?: string | null;
};

function cleanPromptText(value: unknown, maxChars: number): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function buildBrowserPageContext(pageContext?: BrowserPageContext | null): string {
  if (!pageContext) return '';
  const headings = Array.isArray(pageContext.headings)
    ? pageContext.headings.map((heading) => cleanPromptText(heading, 180)).filter(Boolean).slice(0, 12)
    : [];
  const pageText = cleanPromptText(pageContext.text, 2600);
  if (!pageText && !pageContext.title && !pageContext.description && headings.length === 0) return '';

  return [
    'CURRENT BROWSER PAGE SNAPSHOT:',
    pageContext.url ? `URL: ${cleanPromptText(pageContext.url, 500)}` : '',
    pageContext.title ? `Title: ${cleanPromptText(pageContext.title, 200)}` : '',
    pageContext.description ? `Meta description: ${cleanPromptText(pageContext.description, 400)}` : '',
    headings.length ? `Headings: ${headings.join(' | ')}` : '',
    pageText ? `Visible page text excerpt: ${pageText}` : '',
  ].filter(Boolean).join('\n');
}

// Website widgets run on customer domains, so these public endpoints need
// explicit cross-origin access. Authenticated chatbot routes keep global CORS.
chatbotRouter.use('/widget/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// Simple in-memory rate limiter for public widget
const chatRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = chatRateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    chatRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

function normalizeWidgetDomain(value: string): string {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return '';

  try {
    const parsed = new URL(cleaned.includes('://') ? cleaned : `https://${cleaned}`);
    return parsed.host.replace(/\.$/, '');
  } catch {
    return cleaned
      .replace(/^https?:\/\//, '')
      .replace(/^\/\//, '')
      .split(/[/?#]/)[0]!
      .replace(/\.$/, '');
  }
}

function hostnameOnly(host: string): string {
  try {
    return new URL(`https://${host}`).hostname.replace(/^www\./, '');
  } catch {
    return host.split(':')[0]!.replace(/^www\./, '');
  }
}

function widgetHostMatches(sourceHost: string, allowedDomain: string): boolean {
  if (!sourceHost || !allowedDomain) return false;
  if (sourceHost === allowedDomain) return true;

  const sourceHostname = hostnameOnly(sourceHost);
  const allowedHostname = hostnameOnly(allowedDomain);
  if (allowedDomain.startsWith('*.')) {
    const base = allowedHostname.replace(/^\*\./, '');
    return sourceHostname !== base && sourceHostname.endsWith(`.${base}`);
  }

  // Be forgiving for non-technical users: adding example.com also permits
  // www.example.com, while app.example.com still requires its own entry or *.
  return sourceHostname === allowedHostname;
}

function getWidgetRequestHost(origin?: string | null, referer?: string | null): string {
  return normalizeWidgetDomain(origin || referer || '');
}

function getWidgetDomainBlockReason(config: typeof chatbotConfig.$inferSelect, sourceHost: string): string | null {
  const allowedDomains = Array.isArray(config.embedAllowedDomains)
    ? config.embedAllowedDomains.map((domain) => normalizeWidgetDomain(String(domain))).filter(Boolean)
    : [];

  // Backward-compatible: if the user has not configured any domain, existing
  // published pages and WordPress installs continue to work unrestricted.
  if (allowedDomains.length === 0) return null;

  if (!sourceHost) {
    return 'This website is not allowed to use this chatbot. Add its domain in Website Widget > Allowed domains.';
  }

  return allowedDomains.some((domain) => widgetHostMatches(sourceHost, domain))
    ? null
    : `This website (${sourceHost}) is not allowed to use this chatbot. Add it in Website Widget > Allowed domains.`;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of chatRateLimitMap) {
    if (now > val.resetAt) chatRateLimitMap.delete(key);
  }
}, 300000);

// ============================================
// AUTHENTICATED ROUTES
// ============================================

const authed = new Hono();
authed.use('*', authMiddleware);

async function requireChatbotAccess(c: any, permission: CompanyPermission) {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(userId, companyId, permission);
  return { userId, companyId };
}

async function canConfigureChatbot(userId: string, companyId: string) {
  try {
    await authorizeCompanyAccess(userId, companyId, 'chatbot.configure');
    return true;
  } catch (error) {
    if (error instanceof Error && 'status' in error && (error as any).status === 403) {
      return false;
    }
    throw error;
  }
}

// List all chatbots for company
authed.get('/company/:companyId/chatbots', async (c) => {
  const { userId, companyId } = await requireChatbotAccess(c, 'company.view');
  const bots = await db.select().from(chatbotConfig)
    .where(eq(chatbotConfig.companyId, companyId))
    .orderBy(desc(chatbotConfig.createdAt));

  // Auto-create default if none
  if (bots.length === 0) {
    if (!await canConfigureChatbot(userId, companyId)) {
      return c.json({ data: [] });
    }
    const [created] = await db.insert(chatbotConfig)
      .values({ companyId, name: 'AI Assistant', isActive: true })
      .returning();
    return c.json({ data: [created] });
  }

  return c.json({ data: bots });
});

// Create new chatbot
authed.post(
  '/company/:companyId/chatbots',
  zValidator('json', z.object({
    name: z.string().min(1),
    greeting: z.string().optional(),
    tone: z.enum(['professional', 'friendly', 'bold']).optional(),
    mode: z.enum(['sales', 'support', 'both']).optional(),
    primaryColor: z.string().optional(),
    knowledgeTags: z.array(z.string()).optional(),
    handoffEnabled: z.boolean().optional(),
  })),
  async (c) => {
    const { companyId } = await requireChatbotAccess(c, 'chatbot.configure');
    const body = c.req.valid('json');
    const [created] = await db.insert(chatbotConfig)
      .values({ companyId, ...body, isActive: true })
      .returning();
    return c.json(created);
  }
);

// Delete chatbot
authed.delete('/company/:companyId/chatbots/:botId', async (c) => {
  const { companyId } = await requireChatbotAccess(c, 'chatbot.configure');
  const botId = c.req.param('botId');
  await db.delete(chatbotConfig).where(and(
    eq(chatbotConfig.id, botId),
    eq(chatbotConfig.companyId, companyId),
  ));
  return c.json({ deleted: true });
});

// Save/update a specific chatbot config. Multi-bot screens must use this
// endpoint so one bot's form state never overwrites another bot.
authed.post(
  '/company/:companyId/chatbots/:botId/config',
  zValidator('json', chatbotConfigUpdateSchema),
  async (c) => {
    const { companyId } = await requireChatbotAccess(c, 'chatbot.configure');
    const botId = c.req.param('botId');
    const body = c.req.valid('json');

    const [updated] = await db
      .update(chatbotConfig)
      .set({ ...body, updatedAt: new Date() })
      .where(and(
        eq(chatbotConfig.id, botId),
        eq(chatbotConfig.companyId, companyId),
      ))
      .returning();

    if (!updated) return c.json({ error: 'Chatbot not found' }, 404);
    return c.json(updated);
  },
);

// Save/update chatbot config (by ID)
authed.post(
  '/company/:companyId/config',
  zValidator('json', chatbotConfigUpdateSchema),
  async (c) => {
    const { companyId } = await requireChatbotAccess(c, 'chatbot.configure');
    const body = c.req.valid('json');

    // Upsert config
    const existing = await db.query.chatbotConfig.findFirst({
      where: eq(chatbotConfig.companyId, companyId),
    });

    if (existing) {
      const [updated] = await db
        .update(chatbotConfig)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(chatbotConfig.id, existing.id))
        .returning();
      return c.json(updated);
    }

    const [created] = await db
      .insert(chatbotConfig)
      .values({ companyId, ...body })
      .returning();
    return c.json(created);
  }
);

// Get chatbot config
authed.get('/company/:companyId/config', async (c) => {
  const { userId, companyId } = await requireChatbotAccess(c, 'company.view');

  let config = await db.query.chatbotConfig.findFirst({
    where: eq(chatbotConfig.companyId, companyId),
  });

  if (!config) {
    if (!await canConfigureChatbot(userId, companyId)) {
      return c.json(null);
    }
    // Auto-create with defaults + active
    const [created] = await db
      .insert(chatbotConfig)
      .values({ companyId, isActive: true })
      .returning();
    config = created;
  }

  return c.json(config);
});

// Send message (authenticated — for test chat in dashboard)
authed.post(
  '/company/:companyId/chat',
  zValidator(
    'json',
    z.object({
      conversationId: z.string().uuid().nullish(),
      botId: z.string().uuid().nullish(),
      message: z.string().min(1),
      visitorName: z.string().nullish(),
      visitorEmail: z.string().email().nullish(),
    })
  ),
  async (c) => {
    const { companyId } = await requireChatbotAccess(c, 'chatbot.view_conversations');
    const { conversationId, botId, message, visitorName, visitorEmail } = c.req.valid('json');

    const response = await handleChat(companyId, {
      conversationId,
      botId,
      message,
      visitorName,
      visitorEmail,
      channel: 'web',
    });

    return c.json(response);
  }
);

// List conversations
authed.get('/company/:companyId/conversations', async (c) => {
  const { companyId } = await requireChatbotAccess(c, 'chatbot.view_conversations');

  const conversations = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.companyId, companyId))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(50);

  return c.json({ data: conversations });
});

// Get conversation messages
authed.get('/company/:companyId/conversations/:id', async (c) => {
  const { companyId } = await requireChatbotAccess(c, 'chatbot.view_conversations');
  const convId = c.req.param('id');

  const conversation = await db.query.chatConversations.findFirst({
    where: and(eq(chatConversations.id, convId), eq(chatConversations.companyId, companyId)),
  });

  if (!conversation) return c.json({ error: 'Conversation not found' }, 404);

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, convId))
    .orderBy(chatMessages.createdAt);

  return c.json({ conversation, messages });
});

// ============================================
// HANDOFF ENDPOINTS
// ============================================

// List conversations waiting for handoff
authed.get('/company/:companyId/handoff-queue', async (c) => {
  const { companyId } = await requireChatbotAccess(c, 'chatbot.view_conversations');
  const waiting = await db
    .select()
    .from(chatConversations)
    .where(and(
      eq(chatConversations.companyId, companyId),
      sql`${chatConversations.metadata}->>'handoffStatus' = 'waiting_handoff'`,
    ))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(50);

  // Attach last message preview to each conversation
  const result = await Promise.all(
    waiting.map(async (conv) => {
      const [lastMsg] = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conv.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      return { ...conv, lastMessage: lastMsg?.content || '' };
    }),
  );
  return c.json({ data: result });
});

// Staff picks up a conversation
authed.post('/company/:companyId/conversations/:convId/pickup', async (c) => {
  const { companyId } = await requireChatbotAccess(c, 'chatbot.view_conversations');
  const convId = c.req.param('convId');
  const user = c.get('user');
  const conv = await db.query.chatConversations.findFirst({
    where: and(eq(chatConversations.id, convId), eq(chatConversations.companyId, companyId)),
  });
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  const [updated] = await db
    .update(chatConversations)
    .set({
      handoffStaffId: user.userId,
      metadata: { ...(conv.metadata as any || {}), handoffStatus: 'staff_handling' },
      updatedAt: new Date(),
    })
    .where(eq(chatConversations.id, convId))
    .returning();
  return c.json(updated);
});

// Staff sends a reply
authed.post(
  '/company/:companyId/conversations/:convId/staff-reply',
  zValidator('json', z.object({ message: z.string().min(1) })),
  async (c) => {
    const { companyId } = await requireChatbotAccess(c, 'chatbot.view_conversations');
    const convId = c.req.param('convId');
    const { message } = c.req.valid('json');
    const conv = await db.query.chatConversations.findFirst({
      where: and(eq(chatConversations.id, convId), eq(chatConversations.companyId, companyId)),
    });
    if (!conv) return c.json({ error: 'Conversation not found' }, 404);

    await db.insert(chatMessages).values({
      conversationId: convId,
      role: 'system',
      content: message,
      metadata: { staffReply: true } as any,
    });
    await db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, convId));
    return c.json({ sent: true });
  },
);

// Staff closes a handoff conversation
authed.post('/company/:companyId/conversations/:convId/close', async (c) => {
  const { companyId } = await requireChatbotAccess(c, 'chatbot.view_conversations');
  const convId = c.req.param('convId');
  const conv = await db.query.chatConversations.findFirst({
    where: and(eq(chatConversations.id, convId), eq(chatConversations.companyId, companyId)),
  });
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  const [updated] = await db
    .update(chatConversations)
    .set({
      status: 'closed',
      metadata: { ...(conv.metadata as any || {}), handoffStatus: 'closed' },
      updatedAt: new Date(),
    })
    .where(eq(chatConversations.id, convId))
    .returning();
  return c.json(updated);
});

// ============================================
// PUBLIC WIDGET ROUTES (no auth)
// ============================================

// Widget: get config
chatbotRouter.get('/widget/:companyId/config', async (c) => {
  const companyId = c.req.param('companyId');
  const botId = c.req.query('botId') || '';

  const config = await db.query.chatbotConfig.findFirst({
    where: botId
      ? and(eq(chatbotConfig.companyId, companyId), eq(chatbotConfig.id, botId))
      : eq(chatbotConfig.companyId, companyId),
  });

  if (!config || !config.isActive || !config.embedEnabled) {
    return c.json({ error: 'Chatbot not available' }, 404);
  }

  const blockReason = getWidgetDomainBlockReason(
    config,
    getWidgetRequestHost(c.req.header('origin'), c.req.header('referer')),
  );
  if (blockReason) {
    return c.json({ error: blockReason, message: blockReason }, 403);
  }

  return c.json({
    name: config.name,
    greeting: config.greeting,
    primaryColor: config.primaryColor,
    tone: config.tone,
    mode: config.mode,
    logoUrl: config.logoUrl,
    avatarUrl: config.avatarUrl,
    poweredByVisible: config.poweredByVisible,
  });
});

// Widget: restore conversation history for the same browser visitor.
chatbotRouter.get('/widget/:companyId/conversations/:conversationId/history', async (c) => {
  const companyId = c.req.param('companyId');
  const conversationId = c.req.param('conversationId');
  const visitorId = c.req.query('visitorId') || '';
  const botId = c.req.query('botId') || '';

  const config = await db.query.chatbotConfig.findFirst({
    where: botId
      ? and(eq(chatbotConfig.companyId, companyId), eq(chatbotConfig.id, botId))
      : eq(chatbotConfig.companyId, companyId),
  });

  if (!config || !config.isActive || !config.embedEnabled) {
    return c.json({ error: 'Chatbot not available' }, 404);
  }

  const blockReason = getWidgetDomainBlockReason(
    config,
    getWidgetRequestHost(c.req.header('origin'), c.req.header('referer')),
  );
  if (blockReason) {
    return c.json({ error: blockReason, message: blockReason }, 403);
  }

  if (!visitorId) {
    return c.json({ error: 'Visitor identity is required' }, 400);
  }

  const conversation = await db.query.chatConversations.findFirst({
    where: and(
      eq(chatConversations.id, conversationId),
      eq(chatConversations.companyId, companyId),
    ),
  });

  // Do not expose whether a conversation exists for another visitor.
  if (
    !conversation
    || conversation.channel !== 'widget'
    || conversation.visitorId !== visitorId
    || (botId && conversation.botId !== botId)
  ) {
    return c.json({ error: 'Conversation not found for this visitor' }, 404);
  }

  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      metadata: chatMessages.metadata,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(50);

  const messages = rows.reverse().map((message) => ({
    id: message.id,
    role: message.role === 'visitor' ? 'user' : 'assistant',
    content: message.content,
    quickReplies: (message.metadata as any)?.quickReplies || [],
    createdAt: message.createdAt,
  }));

  return c.json({ conversationId, messages });
});

// Widget: chat (public, no auth)
chatbotRouter.post(
  '/widget/:companyId/chat',
  zValidator(
    'json',
    z.object({
      conversationId: z.string().uuid().nullish(),
      botId: z.string().uuid().nullish(),
      message: z.string().min(1),
      visitorId: z.string().nullish(),
      visitorName: z.string().nullish(),
      visitorEmail: z.string().email().nullish(),
      pageId: z.string().uuid().nullish(),
      pageContext: z.object({
        url: z.string().max(1000).nullish(),
        title: z.string().max(300).nullish(),
        description: z.string().max(800).nullish(),
        headings: z.array(z.string().max(240)).max(20).nullish(),
        text: z.string().max(3500).nullish(),
      }).nullish(),
    })
  ),
  async (c) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (!rateLimit(ip, 30, 60000)) { // 30 messages per minute
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    const companyId = c.req.param('companyId');
    const { conversationId, botId, message, visitorId, visitorName, visitorEmail, pageId, pageContext } =
      c.req.valid('json');

    // Check chatbot is active
    const config = await db.query.chatbotConfig.findFirst({
      where: botId
        ? and(eq(chatbotConfig.companyId, companyId), eq(chatbotConfig.id, botId))
        : eq(chatbotConfig.companyId, companyId),
    });

    if (!config || !config.isActive || !config.embedEnabled) {
      return c.json({ error: 'Chatbot not available' }, 404);
    }

    const blockReason = getWidgetDomainBlockReason(
      config,
      getWidgetRequestHost(c.req.header('origin'), c.req.header('referer')),
    );
    if (blockReason) {
      return c.json({ error: blockReason, message: blockReason }, 403);
    }

    const response = await handleChat(companyId, {
      conversationId,
      botId,
      message,
      visitorId,
      visitorName,
      visitorEmail,
      pageId,
      pageContext,
      channel: 'widget',
    });

    return c.json(response);
  }
);

// Mount authenticated routes
chatbotRouter.route('/', authed);

// ============================================
// SHARED CHAT HANDLER
// ============================================

async function handleChat(
  companyId: string,
  params: {
    conversationId?: string | null;
    botId?: string | null;
    message: string;
    visitorId?: string | null;
    visitorName?: string | null;
    visitorEmail?: string | null;
    pageId?: string | null;
    pageContext?: BrowserPageContext | null;
    channel: 'web' | 'widget';
  }
) {
  const { message, channel } = params;
  const visitorId = params.visitorId || undefined;
  const visitorName = params.visitorName || undefined;
  const visitorEmail = params.visitorEmail || undefined;
  const botId = params.botId || undefined;
  let conversationId = params.conversationId || undefined;

  // 1. Get or create conversation
  if (!conversationId) {
    const [conv] = await db
      .insert(chatConversations)
      .values({
        companyId,
        botId,
        visitorId,
        visitorName,
        visitorEmail,
        channel: channel as any,
      })
      .returning();
    conversationId = conv!.id;
  } else {
    // Update visitor info if provided
    if (visitorEmail || visitorName) {
      await db
        .update(chatConversations)
        .set({
          ...(visitorEmail ? { visitorEmail } : {}),
          ...(visitorName ? { visitorName } : {}),
          updatedAt: new Date(),
        })
        .where(eq(chatConversations.id, conversationId));
    }
  }

  // 2. Save visitor message
  await db.insert(chatMessages).values({
    conversationId,
    role: 'visitor',
    content: message,
  });

  // 2b. Brain Hub internal tap — every visitor message flows into the
  // event stream so watchers (Phase B) can detect recurring questions.
  // Fire-and-forget; never blocks the chatbot reply path.
  void import('../services/brain-hub/event-service').then(({ ingestInternalTap }) =>
    ingestInternalTap({
      companyId,
      subtype: 'chatbot_message',
      type: 'message',
      subject: `Chatbot · ${visitorName ?? visitorEmail ?? 'visitor'}`,
      content: message,
      payload: {
        conversationId,
        channel,
        visitorId,
        visitorEmail,
        visitorName,
        pageId: params.pageId || null,
        pageContext: params.pageContext
          ? { url: params.pageContext.url, title: params.pageContext.title }
          : null,
      },
    }),
  );

  // 3. Load business context filtered by chatbot access level.
  // Public widget → only 'public' knowledge (never leak internal data).
  // Logged-in dashboard → 'internal' (public + internal).
  // Admin → everything.
  const config = await db.query.chatbotConfig.findFirst({
    where: botId
      ? and(eq(chatbotConfig.companyId, companyId), eq(chatbotConfig.id, botId))
      : eq(chatbotConfig.companyId, companyId),
  });
  const accessLevel = channel === 'widget' ? 'public' : ((config as any)?.accessLevel || 'internal');
  const visibilityFilter = accessLevel === 'public' ? 'public' as const
    : accessLevel === 'admin' ? 'admin' as const
    : 'internal' as const;
  const knowledgeTags = Array.isArray(config?.knowledgeTags) ? config.knowledgeTags : [];

  const contextBlocks: string[] = [];

  const landingPageContext = await buildLandingPageContext(companyId, params.pageId);
  if (landingPageContext) {
    contextBlocks.push(landingPageContext);
  }

  const browserPageContext = buildBrowserPageContext(params.pageContext);
  if (browserPageContext) {
    contextBlocks.push(browserPageContext);
  }

  const businessCtx = await buildBusinessContext(companyId, visibilityFilter, knowledgeTags);
  if (businessCtx.fullContext) {
    contextBlocks.push(`COMPANY / BRAND / KNOWLEDGE CONTEXT:\n${businessCtx.fullContext}`);
  }

  // Tenant RAG currently has tenant isolation but not visibility filters.
  // Only Admin mode can use it; Public/Internal rely on visibility-filtered
  // knowledge_base so confidential entries cannot leak through retrieval.
  if (visibilityFilter === 'admin') {
    try {
      const { getTenantAI, ensureTenantForCompany } = await import('../lib/tenant-ai');
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
        columns: { id: true, name: true },
      });
      if (company) {
        const tenantId = await ensureTenantForCompany(company.id, company.name);
        const ai = getTenantAI();
        const ragResult = await ai.query({ tenantId, question: message, maxChunks: 5 });
        const sourceTexts = (ragResult.sources || [])
          .map((s: any) => s.chunkText || s.chunkContent || '')
          .filter(Boolean)
          .slice(0, 5)
          .join('\n---\n');
        if (sourceTexts || (ragResult.answer && ragResult.answer.length > 20)) {
          contextBlocks.push(`RELEVANT SEMANTIC SEARCH SNIPPETS:\n${sourceTexts || ragResult.answer}`);
        }
      }
    } catch {
      // RAG unavailable - company context above is still enough to answer.
    }
  }

  if (isOnePersonQuestion(message)) {
    contextBlocks.push(ONEPERSON_PLATFORM_CONTEXT);
  }

  const marketingContext = buildMarketingAdvisorContext(message);
  if (marketingContext) {
    contextBlocks.push(marketingContext);
  }

  const knowledgeContext = contextBlocks.join('\n\n---\n\n') || 'No company knowledge available yet.';

  // 4. Load conversation history (last 10 messages)
  const history = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(10);

  const historyMessages = history
    .reverse()
    .slice(0, -1) // exclude the message we just saved
    .map((m) => ({
      role: m.role === 'visitor' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

  const tone = config?.tone || 'friendly';
  const mode = config?.mode || 'both';
  const botName = config?.name || 'AI Assistant';

  // 6. Build system prompt
  const systemPrompt = `You are ${botName}, a ${tone} AI assistant representing this company. You speak as a knowledgeable team member — not a generic chatbot.

COMPANY KNOWLEDGE (use this to answer questions):
${knowledgeContext}

YOUR PERSONALITY:
- Tone: ${tone} — maintain this consistently throughout the conversation
- You are helpful, specific, and genuine — never robotic or evasive
- Use the company's own language and terminology from the knowledge base
- Address visitors by name when known

CONVERSATION RULES:
1. Answer questions using the company knowledge above. Quote specific details (prices, features, services) when available.
2. If a question isn't covered by the knowledge, say "I don't have that specific information, but I can connect you with our team" — then ask for their contact.
3. Keep responses concise: 2-3 sentences for simple questions, more for complex ones. Use bullet points for lists.
4. NEVER make up information not in the knowledge base — accuracy builds trust.
5. If the visitor shares contact info (email, phone), acknowledge warmly and confirm you'll pass it to the team.
6. When you have clear next-step suggestions, return a JSON block at the END of your response:
<!--QUICK_REPLIES-->
[{"label":"See pricing","value":"show me pricing"},{"label":"Book demo","value":"I want a demo"},{"label":"Talk to human","value":"connect me to team"}]
<!--/QUICK_REPLIES-->
Only include this when there are obvious next steps. Max 3 options.

IMPORTANT OVERRIDE FOR SMART ANSWERS:
- The "do not answer if not in knowledge" rule applies to company-specific facts only: prices, policies, addresses, guarantees, availability, and private operational details.
- If the visitor asks about this current website/page, summarize CURRENT PUBLISHED LANDING PAGE CONTEXT or CURRENT BROWSER PAGE SNAPSHOT first.
- If the visitor asks about 1Person or the platform behind this chatbox, answer from 1PERSON PLATFORM KNOWLEDGE.
- If the visitor asks for marketing, SEO, campaign, social, landing page, conversion, competitor, or growth advice, answer with MARKETING ADVISORY KNOWLEDGE and adapt it to the company/page context. Make clear when something is a recommendation rather than a known fact.
- Reply in the same language as the visitor. Vietnamese questions should receive Vietnamese answers.
- Never expose confidential/internal knowledge to public visitors. If unsure, keep the answer high-level and offer to connect the visitor with the team.

${mode === 'sales' ? `SALES MODE:
- Understand the visitor's needs FIRST before recommending products/services
- Ask qualifying questions: What are they looking for? What's their timeline? Budget considerations?
- Connect their stated needs to specific company offerings from the knowledge base
- Gently guide toward booking a call, signing up, or requesting a quote
- If they seem hesitant, offer social proof or a low-commitment next step (free trial, demo, consultation)` : ''}
${mode === 'support' ? `SUPPORT MODE:
- Acknowledge the visitor's issue empathetically before jumping to solutions
- Provide step-by-step solutions when possible
- If you can't resolve it, explain what will happen next and when they'll hear back
- Ask if the issue is resolved before closing the conversation` : ''}
${mode === 'both' ? `DUAL MODE (Sales + Support):
- Detect intent: Is this a sales inquiry or support request?
- Sales signals: asking about pricing, features, comparisons, availability
- Support signals: reporting problems, asking how-to questions, expressing frustration
- Adapt your approach accordingly — helpful for support, consultative for sales
- When appropriate, transition support conversations to upsell/cross-sell opportunities` : ''}`;

  // 7. Call LLM
  const llmMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...historyMessages,
    { role: 'user' as const, content: message },
  ];

  const llmResponse = await llmGenerate(llmMessages, {
    featureKey: 'chatbot',
    maxTokens: 900,
    metadata: {
      channel,
      accessLevel,
      hasPageContext: Boolean(params.pageId || params.pageContext),
      marketingIntent: isMarketingQuestion(message),
      onePersonIntent: isOnePersonQuestion(message),
    },
  });

  // 7b. Parse quick replies from LLM response
  let cleanText = llmResponse.text;
  let quickReplies: Array<{ label: string; value: string }> | undefined;
  const qrMatch = llmResponse.text.match(/<!--QUICK_REPLIES-->\s*([\s\S]*?)\s*<!--\/QUICK_REPLIES-->/);
  if (qrMatch) {
    try {
      quickReplies = JSON.parse(qrMatch[1]!);
    } catch { /* ignore malformed JSON */ }
    cleanText = llmResponse.text.replace(/<!--QUICK_REPLIES-->[\s\S]*?<!--\/QUICK_REPLIES-->/, '').trim();
  }

  // 8. Save assistant response
  await db.insert(chatMessages).values({
    conversationId,
    role: 'assistant',
    content: cleanText,
    metadata: quickReplies ? { quickReplies } as any : undefined,
  });

  // 8b. Handoff trigger — queue for human if bot signals transfer
  const handoffPhrases = ['connect you to', 'let me transfer', 'transfer you', 'human agent', 'speak to a person'];
  const shouldHandoff = config?.handoffEnabled && handoffPhrases.some((p) => cleanText.toLowerCase().includes(p));
  if (shouldHandoff && conversationId) {
    const existingConv = await db.query.chatConversations.findFirst({
      where: eq(chatConversations.id, conversationId),
    });
    await db
      .update(chatConversations)
      .set({
        handoffAt: new Date(),
        metadata: { ...(existingConv?.metadata as any || {}), handoffStatus: 'waiting_handoff' },
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, conversationId));
  } else {
    // Update conversation timestamp
    await db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, conversationId));
  }

  // 9. Auto-create lead if visitor provided email
  if (visitorEmail) {
    try {
      const existingLead = await db.query.leads.findFirst({
        where: and(
          eq(leads.companyId, companyId),
          eq(leads.email, visitorEmail)
        ),
      });

      if (!existingLead) {
        await db.insert(leads).values({
          companyId,
          email: visitorEmail,
          firstName: visitorName || undefined,
          source: 'organic' as any,
          score: 30, // chatbot visitor gets initial score
          notes: `Lead captured from chatbot conversation.`,
        });
      }
    } catch {
      // Non-critical: don't fail chat if lead creation fails
    }
  }

  // 10. Auto-detect VN phone numbers (0xxx, +84xxx, 84xxx)
  const phoneMatch = message.match(/(0|\+84|84)(3|5|7|8|9)\d{8}/);
  if (phoneMatch && conversationId) {
    const phone = phoneMatch[0];
    try {
      await db.update(chatConversations).set({ visitorPhone: phone, updatedAt: new Date() }).where(eq(chatConversations.id, conversationId));
      // Also create/update lead with phone
      if (visitorEmail) {
        await db.update(leads).set({ phone }).where(and(eq(leads.companyId, companyId), eq(leads.email, visitorEmail)));
      } else {
        const existingPhoneLead = await db.query.leads.findFirst({
          where: and(eq(leads.companyId, companyId), eq(leads.phone, phone)),
        });
        if (!existingPhoneLead) {
          await db.insert(leads).values({
            companyId, phone, email: `${phone}@phone.lead`,
            firstName: visitorName || undefined,
            source: 'organic' as any, score: 30,
            notes: 'Lead captured via phone from chatbot.',
          });
        }
      }
    } catch { /* Non-critical */ }
  }

  return {
    conversationId,
    response: cleanText,
    quickReplies,
    model: llmResponse.model,
  };
}

export default chatbotRouter;
