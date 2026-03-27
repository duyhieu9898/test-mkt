/**
 * Leads & Sales API Routes
 *
 * List, create, score leads. Integrates with chatbot auto-capture.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { leads, chatConversations, chatMessages } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';

const leadsRouter = new Hono();
leadsRouter.use('*', authMiddleware);

// List leads with scores
leadsRouter.get('/company/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  const status = c.req.query('status');
  const sortBy = c.req.query('sort') || 'createdAt';

  const conditions = [eq(leads.companyId, companyId)];
  if (status) {
    conditions.push(eq(leads.status, status as any));
  }

  const data = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(sortBy === 'score' ? desc(leads.score) : desc(leads.createdAt))
    .limit(100);

  // Stats
  const allLeads = await db
    .select({
      total: sql<number>`count(*)`,
      qualified: sql<number>`count(*) filter (where ${leads.status} in ('qualified', 'meeting_scheduled', 'proposal_sent'))`,
      converted: sql<number>`count(*) filter (where ${leads.status} = 'won')`,
      avgScore: sql<number>`coalesce(avg(${leads.score}), 0)`,
    })
    .from(leads)
    .where(eq(leads.companyId, companyId));

  const stats = allLeads[0] || { total: 0, qualified: 0, converted: 0, avgScore: 0 };

  return c.json({ data, stats });
});

// Get lead detail (with conversation history if from chatbot)
leadsRouter.get('/company/:companyId/:id', async (c) => {
  const leadId = c.req.param('id');

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
  });

  if (!lead) return c.json({ error: 'Lead not found' }, 404);

  // Find any chatbot conversations from this email
  let conversations: any[] = [];
  if (lead.email) {
    conversations = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.companyId, lead.companyId),
          eq(chatConversations.visitorEmail, lead.email)
        )
      )
      .orderBy(desc(chatConversations.createdAt))
      .limit(5);
  }

  return c.json({ lead, conversations });
});

// Create lead manually
leadsRouter.post(
  '/company/:companyId',
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      jobTitle: z.string().optional(),
      source: z
        .enum([
          'landing_page',
          'form_submission',
          'import',
          'linkedin',
          'referral',
          'cold_outreach',
          'ad_campaign',
          'organic',
        ])
        .optional(),
      score: z.number().min(0).max(100).optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
  ),
  async (c) => {
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');

    // Check for duplicate
    const existing = await db.query.leads.findFirst({
      where: and(eq(leads.companyId, companyId), eq(leads.email, body.email)),
    });

    if (existing) {
      return c.json({ error: 'Lead with this email already exists', existingId: existing.id }, 409);
    }

    const [lead] = await db
      .insert(leads)
      .values({
        companyId,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        company: body.company,
        jobTitle: body.jobTitle,
        source: (body.source || 'organic') as any,
        score: body.score || 0,
        notes: body.notes,
        tags: body.tags as any,
      })
      .returning();

    return c.json(lead, 201);
  }
);

// Update lead score
leadsRouter.patch(
  '/company/:companyId/:id/score',
  zValidator(
    'json',
    z.object({
      score: z.number().min(0).max(100),
    })
  ),
  async (c) => {
    const leadId = c.req.param('id');
    const { score } = c.req.valid('json');

    const [updated] = await db
      .update(leads)
      .set({ score, updatedAt: new Date() })
      .where(eq(leads.id, leadId))
      .returning();

    if (!updated) return c.json({ error: 'Lead not found' }, 404);
    return c.json(updated);
  }
);

// Update lead status
leadsRouter.patch(
  '/company/:companyId/:id/status',
  zValidator(
    'json',
    z.object({
      status: z.enum([
        'new',
        'contacted',
        'engaged',
        'qualified',
        'meeting_scheduled',
        'proposal_sent',
        'won',
        'lost',
        'unsubscribed',
      ]),
    })
  ),
  async (c) => {
    const leadId = c.req.param('id');
    const { status } = c.req.valid('json');

    const [updated] = await db
      .update(leads)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(leads.id, leadId))
      .returning();

    if (!updated) return c.json({ error: 'Lead not found' }, 404);
    return c.json(updated);
  }
);

export default leadsRouter;
