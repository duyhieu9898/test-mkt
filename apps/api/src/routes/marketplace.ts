import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { skills, agentSkills, skillReviews, skillUsageLogs, agents } from '@1person/core/db';
import { db } from '../lib/db';
import { eq, desc, and, sql, inArray, ilike, or, isNull } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const marketplaceRouter = new Hono();

// Auth middleware
marketplaceRouter.use('*', authMiddleware);

// Browse marketplace skills
marketplaceRouter.get('/browse', async (c) => {
  const category = c.req.query('category');
  const search = c.req.query('search');
  const companyId = c.req.query('companyId');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  const conditions = [
    eq(skills.status, 'published'),
    or(isNull(skills.companyId), companyId ? eq(skills.companyId, companyId) : sql`true`),
  ];

  if (category) {
    conditions.push(eq(skills.category, category as any));
  }

  if (search) {
    conditions.push(
      or(
        ilike(skills.name, `%${search}%`),
        ilike(skills.description, `%${search}%`),
        sql`${skills.tags} @> ARRAY[${search}]::text[]`
      )!
    );
  }

  const results = await db
    .select()
    .from(skills)
    .where(and(...conditions))
    .orderBy(desc(skills.usageCount), desc(skills.rating))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(skills)
    .where(and(...conditions));

  return c.json({ data: results, total: count, limit, offset });
});

// Get skill details
marketplaceRouter.get('/skills/:skillId', async (c) => {
  const skillId = c.req.param('skillId');

  const [skill] = await db.select().from(skills).where(eq(skills.id, skillId));

  if (!skill) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Skill not found' } }, 404);
  }

  // Get reviews
  const reviews = await db
    .select()
    .from(skillReviews)
    .where(eq(skillReviews.skillId, skillId))
    .orderBy(desc(skillReviews.helpfulCount))
    .limit(10);

  // Get usage stats
  const [stats] = await db
    .select({
      totalUsage: sql<number>`count(*)::int`,
      successRate: sql<number>`avg(case when ${skillUsageLogs.success} then 1 else 0 end)::float`,
      avgExecutionTime: sql<number>`avg(${skillUsageLogs.executionTimeMs})::int`,
    })
    .from(skillUsageLogs)
    .where(eq(skillUsageLogs.skillId, skillId));

  return c.json({
    data: {
      ...skill,
      reviews,
      stats,
    },
  });
});

// Get company's installed skills
marketplaceRouter.get('/company/:companyId/installed', async (c) => {
  const companyId = c.req.param('companyId');

  const installed = await db
    .select({
      agentSkill: agentSkills,
      skill: skills,
      agent: {
        id: agents.id,
        name: agents.name,
        role: agents.role,
        color: agents.color,
      },
    })
    .from(agentSkills)
    .innerJoin(skills, eq(agentSkills.skillId, skills.id))
    .innerJoin(agents, eq(agentSkills.agentId, agents.id))
    .where(eq(agentSkills.companyId, companyId))
    .orderBy(desc(agentSkills.installedAt));

  return c.json({ data: installed });
});

// Install skill for agent
marketplaceRouter.post(
  '/agents/:agentId/install',
  zValidator(
    'json',
    z.object({
      skillId: z.string().uuid(),
      companyId: z.string().uuid(),
      customConfig: z.record(z.unknown()).optional(),
    })
  ),
  async (c) => {
    const agentId = c.req.param('agentId');
    const { skillId, companyId, customConfig } = c.req.valid('json');
    const userId = c.get('userId');

    // Check if already installed
    const [existing] = await db
      .select({ id: agentSkills.id })
      .from(agentSkills)
      .where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)));

    if (existing) {
      return c.json({ error: { code: 'ALREADY_INSTALLED', message: 'Skill already installed' } }, 400);
    }

    const [agentSkill] = await db
      .insert(agentSkills)
      .values({
        agentId,
        skillId,
        companyId,
        customConfig,
        installedBy: userId,
      })
      .returning();

    // Update skill usage count
    await db
      .update(skills)
      .set({ usageCount: sql`${skills.usageCount} + 1` })
      .where(eq(skills.id, skillId));

    return c.json({ data: agentSkill }, 201);
  }
);

// Uninstall skill
marketplaceRouter.delete('/agents/:agentId/skills/:skillId', async (c) => {
  const agentId = c.req.param('agentId');
  const skillId = c.req.param('skillId');

  await db
    .delete(agentSkills)
    .where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)));

  return c.json({ success: true });
});

// Create a new skill
marketplaceRouter.post(
  '/skills',
  zValidator(
    'json',
    z.object({
      companyId: z.string().uuid().optional(),
      name: z.string().min(1),
      slug: z.string().min(1),
      description: z.string().optional(),
      shortDescription: z.string().optional(),
      category: z.enum([
        'communication', 'analysis', 'content', 'marketing', 'sales', 'engineering',
        'design', 'operations', 'finance', 'hr', 'legal', 'custom',
      ]),
      definition: z.object({
        triggers: z.array(z.string()),
        prompts: z.object({
          system: z.string(),
          task: z.string(),
        }),
        tools: z.array(z.string()),
        parameters: z.array(z.object({
          name: z.string(),
          type: z.string(),
          required: z.boolean(),
          description: z.string().optional(),
          default: z.unknown().optional(),
        })),
        outputFormat: z.string().optional(),
        examples: z.array(z.object({
          input: z.string(),
          output: z.string(),
        })).optional(),
      }),
      requiredCapabilities: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      isPremium: z.boolean().optional(),
      creditCost: z.number().optional(),
    })
  ),
  async (c) => {
    const data = c.req.valid('json');
    const userId = c.get('userId');

    const [skill] = await db
      .insert(skills)
      .values({
        ...data,
        authorId: userId,
        status: 'draft',
      })
      .returning();

    return c.json({ data: skill }, 201);
  }
);

// Publish skill
marketplaceRouter.post('/skills/:skillId/publish', async (c) => {
  const skillId = c.req.param('skillId');

  const [skill] = await db
    .update(skills)
    .set({ status: 'published', updatedAt: new Date() })
    .where(eq(skills.id, skillId))
    .returning();

  if (!skill) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Skill not found' } }, 404);
  }

  return c.json({ data: skill });
});

// Add review
marketplaceRouter.post(
  '/skills/:skillId/reviews',
  zValidator(
    'json',
    z.object({
      companyId: z.string().uuid(),
      rating: z.number().min(1).max(5),
      title: z.string().optional(),
      content: z.string().optional(),
    })
  ),
  async (c) => {
    const skillId = c.req.param('skillId');
    const data = c.req.valid('json');
    const userId = c.get('userId');

    const [review] = await db
      .insert(skillReviews)
      .values({
        skillId,
        companyId: data.companyId,
        rating: data.rating,
        title: data.title,
        content: data.content,
        reviewerId: userId,
      })
      .returning();

    // Update skill rating
    const [{ avgRating, reviewCount }] = await db
      .select({
        avgRating: sql<number>`avg(${skillReviews.rating})::float`,
        reviewCount: sql<number>`count(*)::int`,
      })
      .from(skillReviews)
      .where(eq(skillReviews.skillId, skillId));

    await db
      .update(skills)
      .set({ rating: avgRating, reviewCount, updatedAt: new Date() })
      .where(eq(skills.id, skillId));

    return c.json({ data: review }, 201);
  }
);

// Get featured/popular skills
marketplaceRouter.get('/featured', async (c) => {
  const featured = await db
    .select()
    .from(skills)
    .where(eq(skills.status, 'published'))
    .orderBy(desc(skills.rating), desc(skills.usageCount))
    .limit(10);

  return c.json({ data: featured });
});

// Get skill categories with counts
marketplaceRouter.get('/categories', async (c) => {
  const categories = await db
    .select({
      category: skills.category,
      count: sql<number>`count(*)::int`,
    })
    .from(skills)
    .where(eq(skills.status, 'published'))
    .groupBy(skills.category)
    .orderBy(desc(sql<number>`count(*)`));

  return c.json({ data: categories });
});

// Create default skills
marketplaceRouter.post('/defaults', async (c) => {
  const defaultSkills = [
    {
      name: 'Email Composer',
      slug: 'email-composer',
      description: 'Compose professional emails with customizable tone and style',
      shortDescription: 'Professional email writing',
      category: 'communication' as const,
      status: 'published' as const,
      authorId: 'system',
      authorName: 'System',
      definition: {
        triggers: ['compose email', 'write email', 'draft email'],
        prompts: {
          system: 'You are an expert email writer who crafts clear, professional communications.',
          task: 'Write an email based on the given context and requirements.',
        },
        tools: [],
        parameters: [
          { name: 'recipient', type: 'string', required: true, description: 'Email recipient' },
          { name: 'subject', type: 'string', required: true, description: 'Email subject' },
          { name: 'tone', type: 'string', required: false, description: 'Tone: formal, casual, friendly' },
          { name: 'context', type: 'string', required: true, description: 'Context for the email' },
        ],
      },
      tags: ['email', 'communication', 'writing'],
    },
    {
      name: 'Data Analyzer',
      slug: 'data-analyzer',
      description: 'Analyze data and provide insights with visualizations',
      shortDescription: 'Data analysis and insights',
      category: 'analysis' as const,
      status: 'published' as const,
      authorId: 'system',
      authorName: 'System',
      definition: {
        triggers: ['analyze data', 'data analysis', 'insights'],
        prompts: {
          system: 'You are a data analyst who extracts meaningful insights from data.',
          task: 'Analyze the provided data and generate insights.',
        },
        tools: ['python_executor', 'chart_generator'],
        parameters: [
          { name: 'data', type: 'object', required: true, description: 'Data to analyze' },
          { name: 'questions', type: 'array', required: false, description: 'Specific questions to answer' },
        ],
      },
      tags: ['data', 'analysis', 'insights', 'charts'],
    },
    {
      name: 'Content Writer',
      slug: 'content-writer',
      description: 'Create engaging content for blogs, social media, and marketing',
      shortDescription: 'Content creation',
      category: 'content' as const,
      status: 'published' as const,
      authorId: 'system',
      authorName: 'System',
      definition: {
        triggers: ['write content', 'create content', 'blog post', 'social media'],
        prompts: {
          system: 'You are a creative content writer who produces engaging, SEO-friendly content.',
          task: 'Create content based on the given topic and format.',
        },
        tools: [],
        parameters: [
          { name: 'topic', type: 'string', required: true, description: 'Content topic' },
          { name: 'format', type: 'string', required: true, description: 'blog, social, newsletter' },
          { name: 'tone', type: 'string', required: false, description: 'Content tone' },
          { name: 'keywords', type: 'array', required: false, description: 'SEO keywords' },
        ],
      },
      tags: ['content', 'writing', 'blog', 'social media', 'SEO'],
    },
  ];

  const createdSkills = await db.insert(skills).values(defaultSkills).returning();

  return c.json({ data: createdSkills }, 201);
});

export default marketplaceRouter;
