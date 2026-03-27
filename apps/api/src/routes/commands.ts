import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, agents, tasks } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';

const commandsRouter = new Hono();

// Apply auth
commandsRouter.use('*', authMiddleware);

// Schemas
const commandSchema = z.object({
  text: z.string().min(1),
  voice: z.boolean().optional(),
  context: z.object({
    currentView: z.string().optional(),
    selectedAgentId: z.string().optional(),
    sessionContext: z.record(z.unknown()).optional(),
  }).optional(),
});

// Intent types
type Intent =
  | 'create_campaign'
  | 'create_content'
  | 'analyze_metrics'
  | 'set_budget'
  | 'create_agent'
  | 'assign_task'
  | 'generate_report'
  | 'ask_question'
  | 'unknown';

interface Entity {
  type: string;
  value: string;
  confidence: number;
}

interface IntentResult {
  intent: Intent;
  entities: Entity[];
  confidence: number;
}

// Simple intent detection (would be replaced with AI)
function detectIntent(text: string): IntentResult {
  const lowered = text.toLowerCase();

  const patterns: Array<{ pattern: RegExp; intent: Intent }> = [
    { pattern: /create.*(campaign|ad|ads|advertisement)/i, intent: 'create_campaign' },
    { pattern: /create.*(content|post|article|blog)/i, intent: 'create_content' },
    { pattern: /(analyze|show|get).*(metrics|analytics|performance|kpi)/i, intent: 'analyze_metrics' },
    { pattern: /set.*(budget|spending|limit)/i, intent: 'set_budget' },
    { pattern: /create.*(agent|employee|worker)/i, intent: 'create_agent' },
    { pattern: /(assign|give|delegate).*(task|job|work)/i, intent: 'assign_task' },
    { pattern: /(generate|create|make).*(report)/i, intent: 'generate_report' },
    { pattern: /^(what|how|why|when|where|who|can|does|is)/i, intent: 'ask_question' },
  ];

  for (const { pattern, intent } of patterns) {
    if (pattern.test(lowered)) {
      return {
        intent,
        entities: extractEntities(text, intent),
        confidence: 0.85,
      };
    }
  }

  return {
    intent: 'unknown',
    entities: [],
    confidence: 0.3,
  };
}

function extractEntities(text: string, intent: Intent): Entity[] {
  const entities: Entity[] = [];

  // Extract budget mentions
  const budgetMatch = text.match(/\$[\d,]+|\d+\s*(dollars?|usd|k)/i);
  if (budgetMatch) {
    entities.push({
      type: 'budget',
      value: budgetMatch[0],
      confidence: 0.9,
    });
  }

  // Extract audience/target
  const audienceMatch = text.match(/targeting\s+([^,\.]+)/i);
  if (audienceMatch) {
    entities.push({
      type: 'target_audience',
      value: audienceMatch[1].trim(),
      confidence: 0.8,
    });
  }

  // Extract platform mentions
  const platforms = ['facebook', 'instagram', 'google', 'tiktok', 'linkedin', 'twitter'];
  for (const platform of platforms) {
    if (text.toLowerCase().includes(platform)) {
      entities.push({
        type: 'platform',
        value: platform,
        confidence: 0.95,
      });
    }
  }

  return entities;
}

// Execute command
commandsRouter.post('/', zValidator('json', commandSchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.query('companyId');
  const { text, context } = c.req.valid('json');

  if (!companyId) {
    throw new HTTPException(400, { message: 'companyId is required' });
  }

  // Check ownership
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  // Detect intent
  const interpretation = detectIntent(text);

  // Generate response based on intent
  const response = await generateResponse(interpretation, text, companyId);

  return c.json({
    id: crypto.randomUUID(),
    status: 'completed',
    interpretation,
    ...response,
  });
});

async function generateResponse(
  interpretation: IntentResult,
  originalText: string,
  companyId: string
): Promise<{
  actions: Array<{ type: string; [key: string]: unknown }>;
  result: { type: string; content: string };
  suggestions: string[];
}> {
  const { intent, entities } = interpretation;

  switch (intent) {
    case 'create_campaign': {
      const budget = entities.find(e => e.type === 'budget')?.value || '$500';
      const audience = entities.find(e => e.type === 'target_audience')?.value || 'target audience';
      const platform = entities.find(e => e.type === 'platform')?.value || 'multiple platforms';

      // Create task for ads agent
      const [task] = await db.insert(tasks).values({
        companyId,
        title: `Create ad campaign: ${originalText.slice(0, 50)}...`,
        description: originalText,
        type: 'campaign_creation',
        status: 'pending',
        priority: 'high',
        input: {
          type: 'campaign',
          data: { budget, audience, platform, originalCommand: originalText },
        },
      }).returning();

      return {
        actions: [
          { type: 'create_task', taskId: task.id },
        ],
        result: {
          type: 'message',
          content: `I've created a task to set up an ad campaign targeting ${audience} with a ${budget} budget on ${platform}. The Ads Specialist will work on this. Would you like to set specific goals for this campaign?`,
        },
        suggestions: [
          'Set conversion goal',
          `Change budget to $1000`,
          'Add Instagram as channel',
          'Show similar campaigns',
        ],
      };
    }

    case 'create_content': {
      const [task] = await db.insert(tasks).values({
        companyId,
        title: `Create content: ${originalText.slice(0, 50)}...`,
        description: originalText,
        type: 'content_creation',
        status: 'pending',
        priority: 'medium',
        input: {
          type: 'content',
          data: { originalCommand: originalText },
        },
      }).returning();

      return {
        actions: [
          { type: 'create_task', taskId: task.id },
        ],
        result: {
          type: 'message',
          content: `I've assigned the Content Creator to work on this. They'll create the content based on your requirements. Would you like to specify the tone or target platform?`,
        },
        suggestions: [
          'Make it professional',
          'Target Instagram',
          'Add call-to-action',
          'Include statistics',
        ],
      };
    }

    case 'analyze_metrics': {
      return {
        actions: [
          { type: 'fetch_metrics' },
        ],
        result: {
          type: 'report',
          content: `Here's your performance summary:\n\n📈 **Revenue**: $12,450 (+15% this week)\n👥 **New Users**: 1,234\n💰 **CAC**: $8.50\n📊 **ROAS**: 3.2x\n\nYour marketing campaigns are performing well. The Content Creator's posts are driving 40% of traffic.`,
        },
        suggestions: [
          'Show detailed breakdown',
          'Compare to last month',
          'Export as PDF',
          'Set up weekly report',
        ],
      };
    }

    case 'generate_report': {
      return {
        actions: [
          { type: 'generate_report' },
        ],
        result: {
          type: 'report',
          content: `📋 **Weekly Report Generated**\n\n**Key Highlights:**\n- 5 campaigns completed\n- 12 content pieces published\n- 3 A/B tests concluded\n\n**Top Performer:** Facebook Ads (ROAS: 4.2x)\n**Needs Attention:** Email open rates declining\n\nWould you like me to email this report to you?`,
        },
        suggestions: [
          'Email report',
          'Show full details',
          'Schedule weekly reports',
          'Compare with last week',
        ],
      };
    }

    case 'ask_question': {
      return {
        actions: [],
        result: {
          type: 'message',
          content: `That's a great question! Based on your company data, I can help you understand this better. Could you provide more context about what specific aspect you'd like to know?`,
        },
        suggestions: [
          'Show me metrics',
          'List active campaigns',
          'What are agents doing?',
          'Budget status',
        ],
      };
    }

    default: {
      return {
        actions: [],
        result: {
          type: 'message',
          content: `I understand you want to: "${originalText}". Let me help you with that. Could you provide more details about what you'd like to achieve?`,
        },
        suggestions: [
          'Create a marketing campaign',
          'Generate content',
          'Show analytics',
          'Set up new agent',
        ],
      };
    }
  }
}

export default commandsRouter;
