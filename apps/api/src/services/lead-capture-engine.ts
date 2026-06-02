/**
 * Lead Capture Engine
 *
 * Comprehensive lead capture and management:
 * - Capture leads from multiple sources (landing pages, forms, API)
 * - Enrich lead data with external APIs
 * - Score and qualify leads
 * - Auto-sync to outreach system for follow-up
 * - Webhook notifications for integrations
 */

import { db } from '../lib/db';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { landingPageLeads, landingPages, leads, emailSequences, sequenceEnrollments } from '@1person/core/db';
import { outreachEngine } from './outreach-engine';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Lead source types
export type LeadSource =
  | 'landing_page'
  | 'embedded_form'
  | 'api'
  | 'import'
  | 'linkedin'
  | 'referral'
  | 'cold_outreach'
  | 'ad_campaign'
  | 'organic';

// Lead qualification status
export type QualificationStatus =
  | 'unqualified'
  | 'marketing_qualified'
  | 'sales_qualified'
  | 'opportunity'
  | 'customer'
  | 'disqualified';

// Webhook event types
export type WebhookEventType =
  | 'lead.created'
  | 'lead.updated'
  | 'lead.qualified'
  | 'lead.converted'
  | 'form.submitted';

interface CaptureLeadInput {
  companyId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  source: LeadSource;
  sourceId?: string; // Landing page ID, form ID, etc.
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  ipAddress?: string;
  userAgent?: string;
  customFields?: Record<string, string>;
  message?: string;
  tags?: string[];
}

interface EnrichedLeadData {
  company?: {
    name: string;
    domain?: string;
    industry?: string;
    size?: string;
    linkedin?: string;
    location?: string;
  };
  social?: {
    linkedin?: string;
    twitter?: string;
  };
  verified?: boolean;
  enrichedAt?: Date;
}

interface LeadScoreFactors {
  emailQuality: number; // Business email vs free email
  engagement: number; // Page views, form interactions
  companyMatch: number; // Fits ICP
  behaviorSignals: number; // Time on page, pages visited
  sourceQuality: number; // Quality of lead source
}

interface Webhook {
  id: string;
  companyId: string;
  url: string;
  events: WebhookEventType[];
  secret?: string;
  active: boolean;
}

/**
 * Lead Capture Engine Class
 */
export class LeadCaptureEngine {
  // In-memory webhook store (would be in DB in production)
  private webhooks: Map<string, Webhook[]> = new Map();

  // ============================================
  // LEAD CAPTURE
  // ============================================

  /**
   * Capture a lead from any source
   */
  async captureLead(input: CaptureLeadInput): Promise<{
    leadId: string;
    isNew: boolean;
    score?: number;
    outreachLeadId?: string;
  }> {
    console.log(`[LeadCapture] Capturing lead: ${input.email} from ${input.source}`);

    // Check for existing lead by email
    const existingOutreachLead = await db.query.leads.findFirst({
      where: and(eq(leads.companyId, input.companyId), eq(leads.email, input.email)),
    });

    let outreachLeadId: string;
    let isNew = true;

    if (existingOutreachLead) {
      // Update existing lead with new information
      outreachLeadId = existingOutreachLead.id;
      isNew = false;

      await db
        .update(leads)
        .set({
          firstName: input.firstName || existingOutreachLead.firstName,
          lastName: input.lastName || existingOutreachLead.lastName,
          phone: input.phone || existingOutreachLead.phone,
          company: input.company || existingOutreachLead.company,
          jobTitle: input.jobTitle || existingOutreachLead.jobTitle,
          utmSource: input.utmSource || existingOutreachLead.utmSource,
          utmMedium: input.utmMedium || existingOutreachLead.utmMedium,
          utmCampaign: input.utmCampaign || existingOutreachLead.utmCampaign,
          tags: input.tags?.length
            ? [...(existingOutreachLead.tags || []), ...input.tags]
            : existingOutreachLead.tags,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, existingOutreachLead.id));

      console.log(`[LeadCapture] Updated existing lead: ${outreachLeadId}`);
    } else {
      // Create new lead in outreach system
      outreachLeadId = await outreachEngine.createLead({
        companyId: input.companyId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        company: input.company,
        jobTitle: input.jobTitle,
        source: input.source,
        sourceId: input.sourceId,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        tags: input.tags,
        customFields: input.customFields,
        notes: input.message,
      });

      console.log(`[LeadCapture] Created new lead: ${outreachLeadId}`);
    }

    // Score the lead
    const score = await this.scoreLead(outreachLeadId);

    // Trigger webhook
    await this.triggerWebhook(input.companyId, isNew ? 'lead.created' : 'lead.updated', {
      leadId: outreachLeadId,
      email: input.email,
      source: input.source,
      score,
      isNew,
    });

    // Auto-enroll in sequence if configured
    await this.autoEnrollInSequence(input.companyId, outreachLeadId, input.source);

    // Brain Hub internal tap — every captured lead becomes an event so
    // watchers (Phase B) can detect ICP signals and spike anomalies.
    void import('./brain-hub/event-service').then(({ ingestInternalTap }) =>
      ingestInternalTap({
        companyId: input.companyId,
        subtype: 'lead_capture',
        type: 'lead',
        subject: `Lead · ${input.email}${input.company ? ` (${input.company})` : ''}`,
        content: [
          input.firstName && `Name: ${input.firstName}${input.lastName ? ' ' + input.lastName : ''}`,
          input.jobTitle && `Title: ${input.jobTitle}`,
          input.company && `Company: ${input.company}`,
          input.message && `Message: ${input.message}`,
          input.source && `Source: ${input.source}`,
        ].filter(Boolean).join('\n'),
        payload: {
          email: input.email,
          source: input.source,
          score,
          isNew,
          utmSource: input.utmSource,
          utmCampaign: input.utmCampaign,
          jobTitle: input.jobTitle,
          company: input.company,
        },
      }),
    );

    return {
      leadId: outreachLeadId,
      isNew,
      score,
      outreachLeadId,
    };
  }

  /**
   * Capture lead from landing page form submission
   */
  async captureFromLandingPage(data: {
    pageId: string;
    companyId: string;
    email: string;
    name?: string;
    phone?: string;
    message?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    referrer?: string;
    ipAddress?: string;
  }): Promise<{
    landingPageLeadId: string;
    outreachLeadId: string;
    score: number;
  }> {
    // Insert into landing page leads table
    const [landingPageLead] = await db
      .insert(landingPageLeads)
      .values({
        pageId: data.pageId,
        companyId: data.companyId,
        email: data.email,
        name: data.name,
        phone: data.phone,
        message: data.message,
        source: data.utmSource,
        medium: data.utmMedium,
        campaign: data.utmCampaign,
      })
      .returning();

    if (!landingPageLead) {
      throw new Error('Failed to capture landing page lead');
    }

    // Update landing page lead count
    await db
      .update(landingPages)
      .set({
        totalLeads: sql`${landingPages.totalLeads} + 1`,
      })
      .where(eq(landingPages.id, data.pageId));

    // Parse name into first/last
    const nameParts = data.name?.split(' ') || [];
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    // Sync to outreach system
    const result = await this.captureLead({
      companyId: data.companyId,
      email: data.email,
      firstName,
      lastName,
      phone: data.phone,
      source: 'landing_page',
      sourceId: data.pageId,
      utmSource: data.utmSource,
      utmMedium: data.utmMedium,
      utmCampaign: data.utmCampaign,
      message: data.message,
    });

    return {
      landingPageLeadId: landingPageLead.id,
      outreachLeadId: result.leadId,
      score: result.score || 0,
    };
  }

  // ============================================
  // LEAD ENRICHMENT
  // ============================================

  /**
   * Enrich lead with additional data
   */
  async enrichLead(
    leadId: string
  ): Promise<{ success: boolean; enrichedData?: EnrichedLeadData; error?: string }> {
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
    });

    if (!lead) {
      return { success: false, error: 'Lead not found' };
    }

    try {
      // Extract domain from email
      const emailDomain = lead.email.split('@')[1];
      const isFreeDomain = this.isFreeDomain(emailDomain || '');

      // In production, this would call external APIs like:
      // - Clearbit
      // - Hunter.io
      // - LinkedIn Sales Navigator
      // - ZoomInfo

      // For now, use AI to simulate enrichment based on available data
      const prompt = `Based on this lead information, generate realistic enrichment data:
Email: ${lead.email}
Name: ${lead.firstName || ''} ${lead.lastName || ''}
Company: ${lead.company || 'Unknown'}
Job Title: ${lead.jobTitle || 'Unknown'}

Generate JSON with:
{
  "company": {
    "name": "inferred company name",
    "industry": "likely industry",
    "size": "estimated size (1-10, 11-50, 51-200, 201-500, 500+)",
    "location": "likely location"
  },
  "verified": boolean,
  "confidence": 0-100
}

Return ONLY valid JSON.`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('Failed to get enrichment response');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid enrichment response format');
      }

      const enrichedData = JSON.parse(jsonMatch[0]) as EnrichedLeadData;
      enrichedData.verified = !isFreeDomain;
      enrichedData.enrichedAt = new Date();

      // Update lead with enriched data
      await db
        .update(leads)
        .set({
          company: enrichedData.company?.name || lead.company,
          customFields: {
            ...(lead.customFields as Record<string, string>),
            enrichedCompany: JSON.stringify(enrichedData.company),
            enrichedAt: enrichedData.enrichedAt.toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));

      return { success: true, enrichedData };
    } catch (error) {
      console.error(`[LeadCapture] Enrichment failed for lead ${leadId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Enrichment failed',
      };
    }
  }

  private isFreeDomain(domain: string): boolean {
    const freeDomains = [
      'gmail.com',
      'yahoo.com',
      'hotmail.com',
      'outlook.com',
      'aol.com',
      'icloud.com',
      'mail.com',
      'protonmail.com',
      'zoho.com',
    ];
    return freeDomains.includes(domain.toLowerCase());
  }

  // ============================================
  // LEAD SCORING
  // ============================================

  /**
   * Calculate lead score
   */
  async scoreLead(leadId: string): Promise<number> {
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
    });

    if (!lead) {
      return 0;
    }

    const factors: LeadScoreFactors = {
      emailQuality: 0,
      engagement: 0,
      companyMatch: 0,
      behaviorSignals: 0,
      sourceQuality: 0,
    };

    // Email quality (0-25)
    const emailDomain = lead.email.split('@')[1] || '';
    if (!this.isFreeDomain(emailDomain)) {
      factors.emailQuality = 25; // Business email
    } else {
      factors.emailQuality = 10; // Free email
    }

    // Data completeness (0-20)
    let completeness = 0;
    if (lead.firstName) completeness += 5;
    if (lead.lastName) completeness += 5;
    if (lead.company) completeness += 5;
    if (lead.jobTitle) completeness += 5;
    factors.companyMatch = completeness;

    // Source quality (0-25)
    const sourceScores: Record<string, number> = {
      landing_page: 20,
      form_submission: 20,
      referral: 25,
      linkedin: 20,
      ad_campaign: 15,
      organic: 15,
      cold_outreach: 10,
      import: 5,
    };
    factors.sourceQuality = sourceScores[lead.source || ''] || 10;

    // Job title signals (0-15)
    const seniorTitles = ['ceo', 'cto', 'cfo', 'coo', 'vp', 'director', 'head', 'founder', 'owner'];
    if (lead.jobTitle) {
      const titleLower = lead.jobTitle.toLowerCase();
      if (seniorTitles.some((t) => titleLower.includes(t))) {
        factors.behaviorSignals = 15;
      } else if (titleLower.includes('manager')) {
        factors.behaviorSignals = 10;
      } else {
        factors.behaviorSignals = 5;
      }
    }

    // Engagement (0-15) - based on UTM parameters indicating paid traffic
    if (lead.utmSource && lead.utmMedium === 'cpc') {
      factors.engagement = 15; // Clicked on a paid ad
    } else if (lead.utmSource) {
      factors.engagement = 10;
    } else {
      factors.engagement = 5;
    }

    // Calculate total score (0-100)
    const totalScore = Object.values(factors).reduce((sum, val) => sum + val, 0);

    // Update lead score
    await db
      .update(leads)
      .set({
        score: totalScore,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    console.log(`[LeadCapture] Scored lead ${leadId}: ${totalScore}`);

    // Check if lead is now qualified
    if (totalScore >= 70) {
      await this.qualifyLead(leadId, 'marketing_qualified');
    }

    return totalScore;
  }

  /**
   * Qualify a lead
   */
  async qualifyLead(leadId: string, status: QualificationStatus): Promise<void> {
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
    });

    if (!lead) return;

    // Map qualification status to lead status
    const statusMap: Record<QualificationStatus, string> = {
      unqualified: 'new',
      marketing_qualified: 'qualified',
      sales_qualified: 'qualified',
      opportunity: 'meeting_scheduled',
      customer: 'won',
      disqualified: 'lost',
    };

    await db
      .update(leads)
      .set({
        status: statusMap[status] as any,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    // Trigger webhook
    await this.triggerWebhook(lead.companyId, 'lead.qualified', {
      leadId,
      email: lead.email,
      qualification: status,
    });

    console.log(`[LeadCapture] Lead ${leadId} qualified as ${status}`);
  }

  // ============================================
  // AUTO-ENROLLMENT
  // ============================================

  /**
   * Auto-enroll lead in appropriate sequence
   */
  async autoEnrollInSequence(
    companyId: string,
    leadId: string,
    source: LeadSource
  ): Promise<string | null> {
    // Find an active sequence for this source/trigger
    const sequences = await db.query.emailSequences.findMany({
      where: and(eq(emailSequences.companyId, companyId), eq(emailSequences.status, 'active')),
    });

    // Find sequence that matches the source as trigger
    const matchingSequence = sequences.find(
      (seq) => seq.triggerType === source || seq.triggerType === 'lead_capture'
    );

    if (!matchingSequence) {
      console.log(`[LeadCapture] No matching sequence for source: ${source}`);
      return null;
    }

    // Check if already enrolled
    const existingEnrollment = await db.query.sequenceEnrollments.findFirst({
      where: and(
        eq(sequenceEnrollments.sequenceId, matchingSequence.id),
        eq(sequenceEnrollments.leadId, leadId)
      ),
    });

    if (existingEnrollment) {
      console.log(`[LeadCapture] Lead ${leadId} already enrolled in sequence ${matchingSequence.id}`);
      return existingEnrollment.id;
    }

    // Enroll the lead
    const enrollmentId = await outreachEngine.enrollInSequence(matchingSequence.id, leadId, companyId);

    console.log(
      `[LeadCapture] Auto-enrolled lead ${leadId} in sequence ${matchingSequence.id}: ${enrollmentId}`
    );

    return enrollmentId;
  }

  // ============================================
  // WEBHOOKS
  // ============================================

  /**
   * Register a webhook
   */
  async registerWebhook(
    companyId: string,
    url: string,
    events: WebhookEventType[],
    secret?: string
  ): Promise<string> {
    const webhook: Webhook = {
      id: crypto.randomUUID(),
      companyId,
      url,
      events,
      secret,
      active: true,
    };

    const companyWebhooks = this.webhooks.get(companyId) || [];
    companyWebhooks.push(webhook);
    this.webhooks.set(companyId, companyWebhooks);

    console.log(`[LeadCapture] Registered webhook ${webhook.id} for ${companyId}`);

    return webhook.id;
  }

  /**
   * Trigger webhooks for an event
   */
  private async triggerWebhook(
    companyId: string,
    event: WebhookEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    const companyWebhooks = this.webhooks.get(companyId) || [];
    const activeWebhooks = companyWebhooks.filter(
      (wh) => wh.active && wh.events.includes(event)
    );

    for (const webhook of activeWebhooks) {
      try {
        const body = {
          event,
          timestamp: new Date().toISOString(),
          data: payload,
        };

        await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhook.secret && { 'X-Webhook-Secret': webhook.secret }),
          },
          body: JSON.stringify(body),
        });

        console.log(`[LeadCapture] Triggered webhook ${webhook.id} for event ${event}`);
      } catch (error) {
        console.error(`[LeadCapture] Webhook ${webhook.id} failed:`, error);
      }
    }
  }

  // ============================================
  // ANALYTICS
  // ============================================

  /**
   * Get lead capture stats for a company
   */
  async getStats(
    companyId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{
    totalLeads: number;
    newLeadsToday: number;
    bySource: Record<string, number>;
    avgScore: number;
    qualifiedCount: number;
    conversionRate: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = options?.startDate || new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = options?.endDate || new Date();

    // Get all leads in range
    const allLeads = await db.query.leads.findMany({
      where: and(
        eq(leads.companyId, companyId),
        gte(leads.createdAt, startDate),
        lte(leads.createdAt, endDate)
      ),
    });

    // Get today's leads
    const todayLeads = allLeads.filter(
      (lead) => lead.createdAt && lead.createdAt >= today
    );

    // Group by source
    const bySource: Record<string, number> = {};
    for (const lead of allLeads) {
      const source = lead.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    }

    // Calculate average score
    const scoredLeads = allLeads.filter((lead) => lead.score && lead.score > 0);
    const avgScore =
      scoredLeads.length > 0
        ? scoredLeads.reduce((sum, lead) => sum + (lead.score || 0), 0) / scoredLeads.length
        : 0;

    // Count qualified leads
    const qualifiedLeads = allLeads.filter((lead) => lead.status === 'qualified');

    // Calculate conversion rate (qualified / total)
    const conversionRate = allLeads.length > 0 ? (qualifiedLeads.length / allLeads.length) * 100 : 0;

    return {
      totalLeads: allLeads.length,
      newLeadsToday: todayLeads.length,
      bySource,
      avgScore,
      qualifiedCount: qualifiedLeads.length,
      conversionRate,
    };
  }

  /**
   * Get top performing lead sources
   */
  async getTopSources(
    companyId: string,
    limit: number = 5
  ): Promise<
    Array<{
      source: string;
      count: number;
      avgScore: number;
      conversionRate: number;
    }>
  > {
    const allLeads = await db.query.leads.findMany({
      where: eq(leads.companyId, companyId),
    });

    // Group by source
    const sourceStats: Map<
      string,
      { count: number; totalScore: number; qualified: number }
    > = new Map();

    for (const lead of allLeads) {
      const source = lead.source || 'unknown';
      const stats = sourceStats.get(source) || { count: 0, totalScore: 0, qualified: 0 };
      stats.count++;
      stats.totalScore += lead.score || 0;
      if (lead.status === 'qualified' || lead.status === 'won') {
        stats.qualified++;
      }
      sourceStats.set(source, stats);
    }

    // Convert to array and sort by count
    return Array.from(sourceStats.entries())
      .map(([source, stats]) => ({
        source,
        count: stats.count,
        avgScore: stats.count > 0 ? stats.totalScore / stats.count : 0,
        conversionRate: stats.count > 0 ? (stats.qualified / stats.count) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}

export const leadCaptureEngine = new LeadCaptureEngine();
