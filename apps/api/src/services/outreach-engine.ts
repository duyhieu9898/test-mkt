/**
 * Outreach Engine
 *
 * Handles email outreach and lead management:
 * - Send cold emails
 * - Manage email sequences
 * - Track opens, clicks, replies
 * - Score and qualify leads
 */

import { db } from '../lib/db';
import { eq, and, lt, gte, desc, isNull, sql } from 'drizzle-orm';
import {
  leads,
  emailSequences,
  sequenceSteps,
  sequenceEnrollments,
  outreachEmails,
  emailConnections,
  type Lead,
  type EmailSequence,
  type SequenceStep,
  type SequenceEnrollment,
  type OutreachEmail,
  type EmailConnection,
} from '@1person/core/db';
import Anthropic from '@anthropic-ai/sdk';
import { renderSkillKnowledge } from '@1person/core';

// Expert email playbooks injected into outreach generation (skill K15).
const EMAILS_FRAMEWORK = renderSkillKnowledge('emails');
const COLD_EMAIL_FRAMEWORK = renderSkillKnowledge('cold-email');

const anthropic = new Anthropic();

// Email provider clients
interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Resend Email Client
 */
class ResendClient {
  constructor(private apiKey: string) {}

  async send(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
  }): Promise<SendEmailResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: options.from,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
          reply_to: options.replyTo,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'Resend API error' };
      }

      const result = await response.json();
      return { success: true, messageId: result.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * SendGrid Email Client
 */
class SendGridClient {
  constructor(private apiKey: string) {}

  async send(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
  }): Promise<SendEmailResult> {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: options.to }] }],
          from: { email: options.from },
          subject: options.subject,
          content: [
            { type: 'text/plain', value: options.text || options.html },
            { type: 'text/html', value: options.html },
          ],
          reply_to: options.replyTo ? { email: options.replyTo } : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: error || 'SendGrid API error' };
      }

      const messageId = response.headers.get('X-Message-Id') || `sg_${Date.now()}`;
      return { success: true, messageId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Outreach Engine Class
 */
export class OutreachEngine {
  // ============================================
  // LEAD MANAGEMENT
  // ============================================

  /**
   * Create a new lead
   */
  async createLead(data: {
    companyId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    company?: string;
    jobTitle?: string;
    linkedinUrl?: string;
    website?: string;
    source?: 'landing_page' | 'form_submission' | 'import' | 'linkedin' | 'referral' | 'cold_outreach' | 'ad_campaign' | 'organic';
    sourceId?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    tags?: string[];
    customFields?: Record<string, string>;
    notes?: string;
  }): Promise<string> {
    const result = await db
      .insert(leads)
      .values({
        companyId: data.companyId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        company: data.company,
        jobTitle: data.jobTitle,
        linkedinUrl: data.linkedinUrl,
        website: data.website,
        source: data.source || 'organic',
        sourceId: data.sourceId,
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
        tags: data.tags || [],
        customFields: data.customFields || {},
        notes: data.notes,
        status: 'new',
        score: 0,
      })
      .returning({ id: leads.id });

    const lead = result[0];
    if (!lead) throw new Error('Failed to create lead');

    console.log(`[Outreach] Created lead ${lead.id}: ${data.email}`);
    return lead.id;
  }

  /**
   * Get leads for a company
   */
  async getLeads(
    companyId: string,
    options?: {
      status?: string;
      source?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Lead[]> {
    const query = db.query.leads.findMany({
      where: eq(leads.companyId, companyId),
      orderBy: desc(leads.createdAt),
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });

    return query;
  }

  /**
   * Score a lead based on engagement and fit
   */
  async scoreLead(leadId: string): Promise<number> {
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
    });

    if (!lead) throw new Error('Lead not found');

    let score = 0;

    // Engagement scoring
    if (lead.totalEmailsOpened > 0) score += 20;
    if (lead.totalEmailsClicked > 0) score += 30;
    if (lead.lastRespondedAt) score += 40;

    // Profile completeness
    if (lead.company) score += 5;
    if (lead.jobTitle) score += 5;
    if (lead.phone) score += 5;
    if (lead.linkedinUrl) score += 5;

    // Recency bonus
    if (lead.lastContactedAt) {
      const daysSinceContact = Math.floor(
        (Date.now() - lead.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceContact < 7) score += 10;
    }

    // Cap at 100
    score = Math.min(100, score);

    // Update lead score
    await db
      .update(leads)
      .set({ score, updatedAt: new Date() })
      .where(eq(leads.id, leadId));

    return score;
  }

  /**
   * Update lead status
   */
  async updateLeadStatus(
    leadId: string,
    status: 'new' | 'contacted' | 'engaged' | 'qualified' | 'meeting_scheduled' | 'proposal_sent' | 'won' | 'lost' | 'unsubscribed'
  ): Promise<void> {
    await db
      .update(leads)
      .set({ status, updatedAt: new Date() })
      .where(eq(leads.id, leadId));
  }

  // ============================================
  // EMAIL CONNECTIONS
  // ============================================

  /**
   * Connect an email provider
   */
  async connectEmailProvider(
    companyId: string,
    provider: 'resend' | 'sendgrid' | 'mailgun' | 'ses' | 'smtp',
    config: {
      apiKey?: string;
      fromEmail: string;
      fromName?: string;
      replyToEmail?: string;
      domain?: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPassword?: string;
    }
  ): Promise<string> {
    // Check for existing connection
    const existing = await db.query.emailConnections.findFirst({
      where: and(
        eq(emailConnections.companyId, companyId),
        eq(emailConnections.provider, provider)
      ),
    });

    if (existing) {
      await db
        .update(emailConnections)
        .set({
          apiKey: config.apiKey,
          fromEmail: config.fromEmail,
          fromName: config.fromName,
          replyToEmail: config.replyToEmail,
          domain: config.domain,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpUser: config.smtpUser,
          smtpPassword: config.smtpPassword,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(emailConnections.id, existing.id));

      return existing.id;
    }

    const result = await db
      .insert(emailConnections)
      .values({
        companyId,
        provider,
        apiKey: config.apiKey,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        replyToEmail: config.replyToEmail,
        domain: config.domain,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpUser: config.smtpUser,
        smtpPassword: config.smtpPassword,
        isDefault: true, // First connection is default
      })
      .returning({ id: emailConnections.id });

    const connection = result[0];
    if (!connection) throw new Error('Failed to create email connection');

    return connection.id;
  }

  /**
   * Get default email connection for a company
   */
  async getDefaultConnection(companyId: string): Promise<EmailConnection | null> {
    const connection = await db.query.emailConnections.findFirst({
      where: and(
        eq(emailConnections.companyId, companyId),
        eq(emailConnections.isActive, true),
        eq(emailConnections.isDefault, true)
      ),
    });

    return connection || null;
  }

  // ============================================
  // EMAIL SEQUENCES
  // ============================================

  /**
   * Create an email sequence
   */
  async createSequence(data: {
    companyId: string;
    name: string;
    description?: string;
    triggerType?: string;
    agentId?: string;
  }): Promise<string> {
    const result = await db
      .insert(emailSequences)
      .values({
        companyId: data.companyId,
        name: data.name,
        description: data.description,
        triggerType: data.triggerType || 'manual',
        createdByAgentId: data.agentId,
        status: 'draft',
      })
      .returning({ id: emailSequences.id });

    const sequence = result[0];
    if (!sequence) throw new Error('Failed to create sequence');

    return sequence.id;
  }

  /**
   * Add a step to a sequence
   */
  async addSequenceStep(data: {
    sequenceId: string;
    stepNumber: number;
    delayDays?: number;
    delayHours?: number;
    subject: string;
    bodyHtml: string;
    bodyText?: string;
  }): Promise<string> {
    const result = await db
      .insert(sequenceSteps)
      .values({
        sequenceId: data.sequenceId,
        stepNumber: data.stepNumber,
        delayDays: data.delayDays || 0,
        delayHours: data.delayHours || 0,
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
      })
      .returning({ id: sequenceSteps.id });

    const step = result[0];
    if (!step) throw new Error('Failed to create sequence step');

    return step.id;
  }

  /**
   * Activate a sequence
   */
  async activateSequence(sequenceId: string): Promise<void> {
    await db
      .update(emailSequences)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(emailSequences.id, sequenceId));
  }

  /**
   * Enroll a lead in a sequence
   */
  async enrollInSequence(
    sequenceId: string,
    leadId: string,
    companyId: string
  ): Promise<string> {
    // Check if already enrolled
    const existing = await db.query.sequenceEnrollments.findFirst({
      where: and(
        eq(sequenceEnrollments.sequenceId, sequenceId),
        eq(sequenceEnrollments.leadId, leadId),
        eq(sequenceEnrollments.status, 'active')
      ),
    });

    if (existing) {
      return existing.id;
    }

    // Get first step to calculate next send time
    const firstStep = await db.query.sequenceSteps.findFirst({
      where: eq(sequenceSteps.sequenceId, sequenceId),
      orderBy: sequenceSteps.stepNumber,
    });

    const nextStepAt = firstStep
      ? new Date(
          Date.now() +
            (firstStep.delayDays || 0) * 24 * 60 * 60 * 1000 +
            (firstStep.delayHours || 0) * 60 * 60 * 1000
        )
      : new Date();

    const result = await db
      .insert(sequenceEnrollments)
      .values({
        sequenceId,
        leadId,
        companyId,
        status: 'active',
        currentStep: 0,
        nextStepAt,
      })
      .returning({ id: sequenceEnrollments.id });

    const enrollment = result[0];
    if (!enrollment) throw new Error('Failed to create enrollment');

    // Update sequence stats
    await db
      .update(emailSequences)
      .set({
        totalEnrolled: sql`${emailSequences.totalEnrolled} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(emailSequences.id, sequenceId));

    return enrollment.id;
  }

  // ============================================
  // EMAIL SENDING
  // ============================================

  /**
   * Send an email
   */
  async sendEmail(data: {
    companyId: string;
    leadId: string;
    subject: string;
    bodyHtml: string;
    bodyText?: string;
    sequenceId?: string;
    enrollmentId?: string;
    stepNumber?: number;
    agentId?: string;
    scheduledFor?: Date;
  }): Promise<{ success: boolean; emailId: string; error?: string }> {
    // Get lead
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, data.leadId),
    });

    if (!lead) {
      return { success: false, emailId: '', error: 'Lead not found' };
    }

    // Get email connection
    const connection = await this.getDefaultConnection(data.companyId);
    if (!connection) {
      return { success: false, emailId: '', error: 'No email provider configured' };
    }

    // Personalize content
    const personalizedSubject = this.personalizeContent(data.subject, lead);
    const personalizedHtml = this.personalizeContent(data.bodyHtml, lead);
    const personalizedText = data.bodyText
      ? this.personalizeContent(data.bodyText, lead)
      : undefined;

    // Create email record
    const fromEmail = connection.fromEmail;
    const fromName = connection.fromName || undefined;

    const result = await db
      .insert(outreachEmails)
      .values({
        companyId: data.companyId,
        leadId: data.leadId,
        sequenceId: data.sequenceId,
        enrollmentId: data.enrollmentId,
        stepNumber: data.stepNumber,
        fromEmail,
        fromName,
        toEmail: lead.email,
        subject: personalizedSubject,
        bodyHtml: personalizedHtml,
        bodyText: personalizedText,
        status: data.scheduledFor ? 'queued' : 'sending',
        scheduledFor: data.scheduledFor,
        createdByAgentId: data.agentId,
      })
      .returning({ id: outreachEmails.id });

    const email = result[0];
    if (!email) {
      return { success: false, emailId: '', error: 'Failed to create email record' };
    }

    // If scheduled for later, return now
    if (data.scheduledFor && data.scheduledFor > new Date()) {
      return { success: true, emailId: email.id };
    }

    // Send immediately
    let sendResult: SendEmailResult;

    if (connection.provider === 'resend' && connection.apiKey) {
      const client = new ResendClient(connection.apiKey);
      sendResult = await client.send({
        from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        to: lead.email,
        subject: personalizedSubject,
        html: personalizedHtml,
        text: personalizedText,
        replyTo: connection.replyToEmail || undefined,
      });
    } else if (connection.provider === 'sendgrid' && connection.apiKey) {
      const client = new SendGridClient(connection.apiKey);
      sendResult = await client.send({
        from: fromEmail,
        to: lead.email,
        subject: personalizedSubject,
        html: personalizedHtml,
        text: personalizedText,
        replyTo: connection.replyToEmail || undefined,
      });
    } else {
      // Simulate send for unsupported providers
      console.log(`[Outreach] Simulating email to ${lead.email}`);
      sendResult = { success: true, messageId: `sim_${Date.now()}` };
    }

    // Update email record
    await db
      .update(outreachEmails)
      .set({
        status: sendResult.success ? 'sent' : 'failed',
        sentAt: sendResult.success ? new Date() : undefined,
        providerId: sendResult.messageId,
        lastError: sendResult.error,
        updatedAt: new Date(),
      })
      .where(eq(outreachEmails.id, email.id));

    // Update lead stats
    if (sendResult.success) {
      await db
        .update(leads)
        .set({
          totalEmailsSent: sql`${leads.totalEmailsSent} + 1`,
          lastContactedAt: new Date(),
          status: lead.status === 'new' ? 'contacted' : lead.status,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, data.leadId));
    }

    return {
      success: sendResult.success,
      emailId: email.id,
      error: sendResult.error,
    };
  }

  /**
   * Personalize email content with lead data
   */
  private personalizeContent(content: string, lead: Lead): string {
    return content
      .replace(/\{\{firstName\}\}/g, lead.firstName || '')
      .replace(/\{\{lastName\}\}/g, lead.lastName || '')
      .replace(/\{\{email\}\}/g, lead.email)
      .replace(/\{\{company\}\}/g, lead.company || '')
      .replace(/\{\{jobTitle\}\}/g, lead.jobTitle || '');
  }

  /**
   * Process due sequence emails
   */
  async processDueSequenceEmails(): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    const result = { processed: 0, sent: 0, failed: 0 };

    // Get enrollments with due emails
    const dueEnrollments = await db
      .select()
      .from(sequenceEnrollments)
      .where(
        and(
          eq(sequenceEnrollments.status, 'active'),
          lt(sequenceEnrollments.nextStepAt, new Date())
        )
      )
      .limit(100);

    for (const enrollment of dueEnrollments) {
      result.processed++;

      try {
        // Get next step
        const step = await db.query.sequenceSteps.findFirst({
          where: and(
            eq(sequenceSteps.sequenceId, enrollment.sequenceId),
            eq(sequenceSteps.stepNumber, enrollment.currentStep + 1)
          ),
        });

        if (!step) {
          // No more steps - mark as completed
          await db
            .update(sequenceEnrollments)
            .set({
              status: 'completed',
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(sequenceEnrollments.id, enrollment.id));

          await db
            .update(emailSequences)
            .set({
              totalCompleted: sql`${emailSequences.totalCompleted} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(emailSequences.id, enrollment.sequenceId));

          continue;
        }

        // Send email
        const sendResult = await this.sendEmail({
          companyId: enrollment.companyId,
          leadId: enrollment.leadId,
          subject: step.subject,
          bodyHtml: step.bodyHtml,
          bodyText: step.bodyText || undefined,
          sequenceId: enrollment.sequenceId,
          enrollmentId: enrollment.id,
          stepNumber: step.stepNumber,
        });

        if (sendResult.success) {
          result.sent++;

          // Get next step for timing
          const nextStep = await db.query.sequenceSteps.findFirst({
            where: and(
              eq(sequenceSteps.sequenceId, enrollment.sequenceId),
              eq(sequenceSteps.stepNumber, step.stepNumber + 1)
            ),
          });

          const nextStepAt = nextStep
            ? new Date(
                Date.now() +
                  (nextStep.delayDays || 0) * 24 * 60 * 60 * 1000 +
                  (nextStep.delayHours || 0) * 60 * 60 * 1000
              )
            : null;

          // Update enrollment
          await db
            .update(sequenceEnrollments)
            .set({
              currentStep: step.stepNumber,
              nextStepAt,
              updatedAt: new Date(),
            })
            .where(eq(sequenceEnrollments.id, enrollment.id));

          // Update step stats
          await db
            .update(sequenceSteps)
            .set({
              totalSent: sql`${sequenceSteps.totalSent} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(sequenceSteps.id, step.id));
        } else {
          result.failed++;
        }
      } catch (error) {
        result.failed++;
        console.error(`[Outreach] Failed to process enrollment ${enrollment.id}:`, error);
      }
    }

    return result;
  }

  // ============================================
  // AI CONTENT GENERATION
  // ============================================

  /**
   * Generate personalized email content
   */
  async generateEmailContent(options: {
    companyId: string;
    leadId: string;
    emailType: 'cold_intro' | 'follow_up' | 'meeting_request' | 'value_prop';
    context?: string;
    tone?: 'professional' | 'casual' | 'friendly';
  }): Promise<{ subject: string; bodyHtml: string; bodyText: string }> {
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, options.leadId),
    });

    if (!lead) throw new Error('Lead not found');

    const typePrompts: Record<string, string> = {
      cold_intro:
        'Write a cold email introduction that establishes relevance and creates curiosity.',
      follow_up:
        'Write a follow-up email that references the previous outreach and adds new value.',
      meeting_request:
        'Write an email requesting a meeting or call, with clear value proposition.',
      value_prop:
        'Write an email highlighting specific benefits and use cases relevant to the lead.',
    };

    const prompt = `You are an expert B2B email copywriter. ${typePrompts[options.emailType]}

Lead Information:
- Name: ${lead.firstName || 'Unknown'} ${lead.lastName || ''}
- Company: ${lead.company || 'Unknown'}
- Job Title: ${lead.jobTitle || 'Unknown'}
${options.context ? `Additional Context: ${options.context}` : ''}

Requirements:
- Tone: ${options.tone || 'professional'}
- Keep subject line under 50 characters
- Keep email body concise (3-4 short paragraphs max)
- Include a clear call-to-action
- Personalize where possible

Return JSON:
{
  "subject": "Email subject line",
  "bodyHtml": "<p>HTML email body...</p>",
  "bodyText": "Plain text version..."
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: [EMAILS_FRAMEWORK, COLD_EMAIL_FRAMEWORK].filter(Boolean).join('\n\n---\n\n') || undefined,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Failed to generate email content');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    return JSON.parse(jsonMatch[0]);
  }
}

export const outreachEngine = new OutreachEngine();
