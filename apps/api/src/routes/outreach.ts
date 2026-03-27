import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { outreachEngine } from '../services/outreach-engine';

const outreach = new Hono();

// Apply auth middleware
outreach.use('*', authMiddleware);

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// ============================================
// LEADS
// ============================================

// Create a lead
const createLeadSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  source: z.enum([
    'landing_page',
    'form_submission',
    'import',
    'linkedin',
    'referral',
    'cold_outreach',
    'ad_campaign',
    'organic',
  ]).optional(),
  sourceId: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string()).optional(),
  notes: z.string().optional(),
});

outreach.post(
  '/company/:companyId/leads',
  zValidator('json', createLeadSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const leadId = await outreachEngine.createLead({
      companyId,
      ...body,
    });

    return c.json({
      success: true,
      data: { leadId },
      message: 'Lead created successfully',
    });
  }
);

// Get leads
outreach.get('/company/:companyId/leads', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const status = c.req.query('status');
  const source = c.req.query('source');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const leads = await outreachEngine.getLeads(companyId, {
    status,
    source,
    limit,
    offset,
  });

  return c.json({ data: leads });
});

// Score a lead
outreach.post('/leads/:leadId/score', async (c) => {
  const leadId = c.req.param('leadId');

  const score = await outreachEngine.scoreLead(leadId);

  return c.json({
    success: true,
    data: { leadId, score },
  });
});

// Update lead status
const updateStatusSchema = z.object({
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
});

outreach.patch(
  '/leads/:leadId/status',
  zValidator('json', updateStatusSchema),
  async (c) => {
    const leadId = c.req.param('leadId');
    const { status } = c.req.valid('json');

    await outreachEngine.updateLeadStatus(leadId, status);

    return c.json({
      success: true,
      message: `Lead status updated to ${status}`,
    });
  }
);

// ============================================
// EMAIL CONNECTIONS
// ============================================

const connectEmailSchema = z.object({
  provider: z.enum(['resend', 'sendgrid', 'mailgun', 'ses', 'smtp']),
  apiKey: z.string().optional(),
  fromEmail: z.string().email(),
  fromName: z.string().optional(),
  replyToEmail: z.string().email().optional(),
  domain: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
});

outreach.post(
  '/company/:companyId/email-connections',
  zValidator('json', connectEmailSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const connectionId = await outreachEngine.connectEmailProvider(companyId, body.provider, {
      apiKey: body.apiKey,
      fromEmail: body.fromEmail,
      fromName: body.fromName,
      replyToEmail: body.replyToEmail,
      domain: body.domain,
      smtpHost: body.smtpHost,
      smtpPort: body.smtpPort,
      smtpUser: body.smtpUser,
      smtpPassword: body.smtpPassword,
    });

    return c.json({
      success: true,
      data: { connectionId },
      message: `${body.provider} email provider connected`,
    });
  }
);

// ============================================
// EMAIL SEQUENCES
// ============================================

// Create sequence
const createSequenceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.string().optional(),
});

outreach.post(
  '/company/:companyId/sequences',
  zValidator('json', createSequenceSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const sequenceId = await outreachEngine.createSequence({
      companyId,
      ...body,
    });

    return c.json({
      success: true,
      data: { sequenceId },
      message: 'Email sequence created',
    });
  }
);

// Add step to sequence
const addStepSchema = z.object({
  stepNumber: z.number().min(1),
  delayDays: z.number().min(0).optional(),
  delayHours: z.number().min(0).optional(),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
});

outreach.post(
  '/sequences/:sequenceId/steps',
  zValidator('json', addStepSchema),
  async (c) => {
    const sequenceId = c.req.param('sequenceId');
    const body = c.req.valid('json');

    const stepId = await outreachEngine.addSequenceStep({
      sequenceId,
      ...body,
    });

    return c.json({
      success: true,
      data: { stepId },
      message: `Step ${body.stepNumber} added to sequence`,
    });
  }
);

// Activate sequence
outreach.post('/sequences/:sequenceId/activate', async (c) => {
  const sequenceId = c.req.param('sequenceId');

  await outreachEngine.activateSequence(sequenceId);

  return c.json({
    success: true,
    message: 'Sequence activated',
  });
});

// Enroll lead in sequence
const enrollSchema = z.object({
  leadId: z.string().uuid(),
});

outreach.post(
  '/company/:companyId/sequences/:sequenceId/enroll',
  zValidator('json', enrollSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const sequenceId = c.req.param('sequenceId');
    const { userId } = c.get('user');
    const { leadId } = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const enrollmentId = await outreachEngine.enrollInSequence(sequenceId, leadId, companyId);

    return c.json({
      success: true,
      data: { enrollmentId },
      message: 'Lead enrolled in sequence',
    });
  }
);

// ============================================
// SEND EMAILS
// ============================================

// Send single email
const sendEmailSchema = z.object({
  leadId: z.string().uuid(),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  scheduledFor: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
});

outreach.post(
  '/company/:companyId/emails/send',
  zValidator('json', sendEmailSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const result = await outreachEngine.sendEmail({
      companyId,
      leadId: body.leadId,
      subject: body.subject,
      bodyHtml: body.bodyHtml,
      bodyText: body.bodyText,
      scheduledFor: body.scheduledFor,
    });

    if (!result.success) {
      throw new HTTPException(400, { message: result.error || 'Failed to send email' });
    }

    return c.json({
      success: true,
      data: { emailId: result.emailId },
      message: body.scheduledFor ? 'Email scheduled' : 'Email sent successfully',
    });
  }
);

// Generate AI email content
const generateEmailSchema = z.object({
  leadId: z.string().uuid(),
  emailType: z.enum(['cold_intro', 'follow_up', 'meeting_request', 'value_prop']),
  context: z.string().optional(),
  tone: z.enum(['professional', 'casual', 'friendly']).optional(),
});

outreach.post(
  '/company/:companyId/emails/generate',
  zValidator('json', generateEmailSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const content = await outreachEngine.generateEmailContent({
      companyId,
      leadId: body.leadId,
      emailType: body.emailType,
      context: body.context,
      tone: body.tone,
    });

    return c.json({
      success: true,
      data: content,
    });
  }
);

// Process due sequence emails (for worker)
outreach.post('/process-sequences', async (c) => {
  const result = await outreachEngine.processDueSequenceEmails();

  return c.json({
    success: true,
    data: result,
    message: `Processed ${result.processed} enrollments: ${result.sent} sent, ${result.failed} failed`,
  });
});

export default outreach;
