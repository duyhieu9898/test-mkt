/**
 * Chatbot Engine API Routes
 *
 * Config, chat (with knowledge context), conversations, and public widget endpoints.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  chatConversations,
  chatMessages,
  chatbotConfig,
  knowledgeBase,
  leads,
} from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { llmGenerate } from '../lib/llm';
import { buildBusinessContext } from '../services/business-context';

const chatbotRouter = new Hono();

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

// List all chatbots for company
authed.get('/company/:companyId/chatbots', async (c) => {
  const companyId = c.req.param('companyId');
  const bots = await db.select().from(chatbotConfig)
    .where(eq(chatbotConfig.companyId, companyId))
    .orderBy(desc(chatbotConfig.createdAt));

  // Auto-create default if none
  if (bots.length === 0) {
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
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');
    const [created] = await db.insert(chatbotConfig)
      .values({ companyId, ...body, isActive: true })
      .returning();
    return c.json(created);
  }
);

// Delete chatbot
authed.delete('/company/:companyId/chatbots/:botId', async (c) => {
  const botId = c.req.param('botId');
  await db.delete(chatbotConfig).where(eq(chatbotConfig.id, botId));
  return c.json({ deleted: true });
});

// Save/update chatbot config (by ID)
authed.post(
  '/company/:companyId/config',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).optional(),
      greeting: z.string().min(1).optional(),
      tone: z.enum(['professional', 'friendly', 'bold']).optional(),
      mode: z.enum(['sales', 'support', 'both']).optional(),
      primaryColor: z.string().optional(),
      isActive: z.boolean().optional(),
    })
  ),
  async (c) => {
    const companyId = c.req.param('companyId');
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
  const companyId = c.req.param('companyId');

  let config = await db.query.chatbotConfig.findFirst({
    where: eq(chatbotConfig.companyId, companyId),
  });

  if (!config) {
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
      message: z.string().min(1),
      visitorName: z.string().nullish(),
      visitorEmail: z.string().email().nullish(),
    })
  ),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { conversationId, message, visitorName, visitorEmail } = c.req.valid('json');

    const response = await handleChat(companyId, {
      conversationId,
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
  const companyId = c.req.param('companyId');

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
  const convId = c.req.param('id');

  const conversation = await db.query.chatConversations.findFirst({
    where: eq(chatConversations.id, convId),
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
// PUBLIC WIDGET ROUTES (no auth)
// ============================================

// Widget: get config
chatbotRouter.get('/widget/:companyId/config', async (c) => {
  const companyId = c.req.param('companyId');

  const config = await db.query.chatbotConfig.findFirst({
    where: eq(chatbotConfig.companyId, companyId),
  });

  if (!config || !config.isActive) {
    return c.json({ error: 'Chatbot not available' }, 404);
  }

  return c.json({
    name: config.name,
    greeting: config.greeting,
    primaryColor: config.primaryColor,
    tone: config.tone,
    mode: config.mode,
  });
});

// Widget: chat (public, no auth)
chatbotRouter.post(
  '/widget/:companyId/chat',
  zValidator(
    'json',
    z.object({
      conversationId: z.string().uuid().nullish(),
      message: z.string().min(1),
      visitorId: z.string().nullish(),
      visitorName: z.string().nullish(),
      visitorEmail: z.string().email().nullish(),
    })
  ),
  async (c) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (!rateLimit(ip, 30, 60000)) { // 30 messages per minute
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    const companyId = c.req.param('companyId');
    const { conversationId, message, visitorId, visitorName, visitorEmail } =
      c.req.valid('json');

    // Check chatbot is active
    const config = await db.query.chatbotConfig.findFirst({
      where: eq(chatbotConfig.companyId, companyId),
    });

    if (!config || !config.isActive) {
      return c.json({ error: 'Chatbot not available' }, 404);
    }

    const response = await handleChat(companyId, {
      conversationId,
      message,
      visitorId,
      visitorName,
      visitorEmail,
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
    message: string;
    visitorId?: string | null;
    visitorName?: string | null;
    visitorEmail?: string | null;
    channel: 'web' | 'widget';
  }
) {
  const { message, channel } = params;
  const visitorId = params.visitorId || undefined;
  const visitorName = params.visitorName || undefined;
  const visitorEmail = params.visitorEmail || undefined;
  let conversationId = params.conversationId || undefined;

  // 1. Get or create conversation
  if (!conversationId) {
    const [conv] = await db
      .insert(chatConversations)
      .values({
        companyId,
        visitorId,
        visitorName,
        visitorEmail,
        channel: channel as any,
      })
      .returning();
    conversationId = conv.id;
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

  // 3. Load FULL business context (knowledge + meetings + brand + website)
  const businessCtx = await buildBusinessContext(companyId);
  const knowledgeContext = businessCtx.fullContext || 'No company knowledge available yet.';

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

  // 5. Load chatbot config for tone/mode
  const config = await db.query.chatbotConfig.findFirst({
    where: eq(chatbotConfig.companyId, companyId),
  });

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

  const llmResponse = await llmGenerate(llmMessages, { maxTokens: 500 });

  // 8. Save assistant response
  await db.insert(chatMessages).values({
    conversationId,
    role: 'assistant',
    content: llmResponse.text,
  });

  // Update conversation timestamp
  await db
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));

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

  return {
    conversationId,
    response: llmResponse.text,
    model: llmResponse.model,
  };
}

export default chatbotRouter;
