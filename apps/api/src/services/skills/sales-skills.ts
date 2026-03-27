import Anthropic from '@anthropic-ai/sdk';
import { brandIdentityService } from '../brand-identity-service';
import type { BrandVoice } from '@1person/core/db';
import type { SkillResult } from './marketing-skills';

const anthropic = new Anthropic();

// ============================================
// SCORE LEAD SKILL
// ============================================
export interface ScoreLeadInput {
  companyId: string;
  lead: {
    name: string;
    email: string;
    company?: string;
    title?: string;
    industry?: string;
    companySize?: string;
    source: string;
    pageVisits?: number;
    contentDownloads?: string[];
    emailOpens?: number;
    lastActivity?: string;
    customFields?: Record<string, string>;
  };
  scoringCriteria?: {
    idealCustomerProfile?: string;
    priorityIndustries?: string[];
    minimumCompanySize?: string;
  };
}

export interface LeadScore {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  signals: {
    type: 'positive' | 'negative' | 'neutral';
    factor: string;
    impact: number;
  }[];
  recommendation: 'hot' | 'warm' | 'nurture' | 'disqualify';
  nextActions: string[];
  notes: string;
}

export async function scoreLead(input: ScoreLeadInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const prompt = `Score this sales lead based on their profile and behavior:

Lead Information:
- Name: ${input.lead.name}
- Email: ${input.lead.email}
- Company: ${input.lead.company || 'Unknown'}
- Title: ${input.lead.title || 'Unknown'}
- Industry: ${input.lead.industry || 'Unknown'}
- Company Size: ${input.lead.companySize || 'Unknown'}
- Lead Source: ${input.lead.source}
- Page Visits: ${input.lead.pageVisits || 0}
- Content Downloads: ${input.lead.contentDownloads?.join(', ') || 'None'}
- Email Opens: ${input.lead.emailOpens || 0}
- Last Activity: ${input.lead.lastActivity || 'Unknown'}
${input.lead.customFields ? `- Custom Fields: ${JSON.stringify(input.lead.customFields)}` : ''}

${input.scoringCriteria ? `
Scoring Criteria:
- Ideal Customer Profile: ${input.scoringCriteria.idealCustomerProfile || 'Not specified'}
- Priority Industries: ${input.scoringCriteria.priorityIndustries?.join(', ') || 'Any'}
- Minimum Company Size: ${input.scoringCriteria.minimumCompanySize || 'Any'}
` : ''}

Evaluate the lead and return JSON:
{
  "score": 0-100,
  "grade": "A/B/C/D/F",
  "signals": [
    { "type": "positive/negative/neutral", "factor": "description", "impact": +/-points }
  ],
  "recommendation": "hot/warm/nurture/disqualify",
  "nextActions": ["action1", "action2"],
  "notes": "Brief summary of lead quality"
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const leadScore: LeadScore = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { leadScore },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.001 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[SalesSkills] scoreLead failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// SEND OUTREACH EMAIL SKILL
// ============================================
export interface SendOutreachEmailInput {
  companyId: string;
  recipient: {
    name: string;
    email: string;
    company?: string;
    title?: string;
  };
  purpose: 'cold_outreach' | 'follow_up' | 'meeting_request' | 'proposal' | 're_engagement';
  context?: string;
  previousInteractions?: string[];
  productOrService: string;
  valueProposition: string;
  callToAction: string;
  tone?: 'professional' | 'casual' | 'consultative';
}

export interface GeneratedOutreachEmail {
  subject: string;
  body: string;
  followUpSequence?: {
    delay: string;
    subject: string;
    body: string;
  }[];
}

export async function sendOutreachEmail(input: SendOutreachEmailInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as BrandVoice | undefined;

    const purposeGuides = {
      cold_outreach: 'First contact, focus on value and relevance. Keep it brief and personalized.',
      follow_up: 'Reference previous interaction, add new value, create urgency.',
      meeting_request: 'Clear ask for meeting, provide specific time options, highlight value of meeting.',
      proposal: 'Professional, detailed, focus on solving their specific problems.',
      re_engagement: 'Acknowledge gap, provide new reason to connect, low-pressure approach.',
    };

    const prompt = `Generate a ${input.purpose.replace('_', ' ')} email:

Recipient:
- Name: ${input.recipient.name}
- Company: ${input.recipient.company || 'their company'}
- Title: ${input.recipient.title || 'decision maker'}

Email Purpose: ${purposeGuides[input.purpose]}
Product/Service: ${input.productOrService}
Value Proposition: ${input.valueProposition}
Call to Action: ${input.callToAction}
Tone: ${input.tone || 'professional'}
${voice?.tone ? `Brand Voice: ${voice.tone.join(', ')}` : ''}
${input.context ? `Additional Context: ${input.context}` : ''}
${input.previousInteractions?.length ? `Previous Interactions: ${input.previousInteractions.join('; ')}` : ''}

Requirements:
- Personalize using recipient details
- Keep subject line compelling and under 50 chars
- Body should be concise (under 200 words)
- Include a clear, single call-to-action
- Sound human, not template-like

Return JSON:
{
  "subject": "...",
  "body": "...",
  "followUpSequence": [
    { "delay": "3 days", "subject": "...", "body": "..." }
  ]
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const email: GeneratedOutreachEmail = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { email },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[SalesSkills] sendOutreachEmail failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// GENERATE PROPOSAL SKILL
// ============================================
export interface GenerateProposalInput {
  companyId: string;
  clientName: string;
  clientCompany: string;
  projectScope: string;
  requirements: string[];
  pricing?: {
    model: 'fixed' | 'hourly' | 'retainer' | 'custom';
    amount?: number;
    currency?: string;
  };
  timeline?: string;
  includeTerms?: boolean;
}

export interface GeneratedProposal {
  title: string;
  executiveSummary: string;
  scopeOfWork: string;
  deliverables: string[];
  timeline: string;
  pricing: string;
  termsAndConditions?: string;
  nextSteps: string;
}

export async function generateProposal(input: GenerateProposalInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as BrandVoice | undefined;

    const prompt = `Generate a professional business proposal:

Client: ${input.clientName} at ${input.clientCompany}
Project: ${input.projectScope}
Requirements:
${input.requirements.map((r) => `- ${r}`).join('\n')}
${input.timeline ? `Timeline: ${input.timeline}` : ''}
${input.pricing ? `Pricing Model: ${input.pricing.model}${input.pricing.amount ? `, $${input.pricing.amount}` : ''}` : ''}
${voice?.tone ? `Tone: ${voice.tone.join(', ')}` : ''}

Create a complete proposal with:
1. Executive Summary (compelling overview)
2. Scope of Work (detailed description)
3. Deliverables (specific items)
4. Timeline
5. Pricing
${input.includeTerms ? '6. Terms and Conditions' : ''}
7. Next Steps

Return JSON:
{
  "title": "...",
  "executiveSummary": "...",
  "scopeOfWork": "...",
  "deliverables": ["...", "..."],
  "timeline": "...",
  "pricing": "...",
  ${input.includeTerms ? '"termsAndConditions": "...",' : ''}
  "nextSteps": "..."
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const proposal: GeneratedProposal = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { proposal },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[SalesSkills] generateProposal failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// QUALIFY LEAD SKILL
// ============================================
export interface QualifyLeadInput {
  companyId: string;
  lead: {
    name: string;
    company: string;
    title: string;
    industry: string;
    companySize: string;
    budget?: string;
    timeline?: string;
    currentSolution?: string;
    painPoints?: string[];
    notes?: string;
  };
  qualificationFramework?: 'BANT' | 'MEDDIC' | 'CHAMP' | 'custom';
  idealCustomerProfile?: string;
}

export interface LeadQualification {
  isQualified: boolean;
  qualificationScore: number;
  framework: string;
  criteria: {
    name: string;
    score: number;
    notes: string;
  }[];
  gaps: string[];
  recommendation: string;
  suggestedQuestions: string[];
}

export async function qualifyLead(input: QualifyLeadInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const framework = input.qualificationFramework || 'BANT';

    const frameworkCriteria = {
      BANT: 'Budget, Authority, Need, Timeline',
      MEDDIC: 'Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion',
      CHAMP: 'Challenges, Authority, Money, Prioritization',
      custom: 'Custom criteria based on ICP',
    };

    const prompt = `Qualify this sales lead using the ${framework} framework:

Lead Information:
- Name: ${input.lead.name}
- Company: ${input.lead.company}
- Title: ${input.lead.title}
- Industry: ${input.lead.industry}
- Company Size: ${input.lead.companySize}
- Budget: ${input.lead.budget || 'Unknown'}
- Timeline: ${input.lead.timeline || 'Unknown'}
- Current Solution: ${input.lead.currentSolution || 'Unknown'}
- Pain Points: ${input.lead.painPoints?.join(', ') || 'Unknown'}
- Notes: ${input.lead.notes || 'None'}

Framework: ${framework} (${frameworkCriteria[framework]})
${input.idealCustomerProfile ? `Ideal Customer Profile: ${input.idealCustomerProfile}` : ''}

Evaluate each criterion and return JSON:
{
  "isQualified": true/false,
  "qualificationScore": 0-100,
  "framework": "${framework}",
  "criteria": [
    { "name": "criterion", "score": 0-100, "notes": "explanation" }
  ],
  "gaps": ["gap1", "gap2"],
  "recommendation": "Detailed recommendation on next steps",
  "suggestedQuestions": ["question to ask", "..."]
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const qualification: LeadQualification = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { qualification },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.001 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[SalesSkills] qualifyLead failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// SKILL EXECUTOR MAP
// ============================================
export const salesSkillExecutors: Record<string, (input: unknown) => Promise<SkillResult>> = {
  score_lead: (input) => scoreLead(input as ScoreLeadInput),
  send_outreach_email: (input) => sendOutreachEmail(input as SendOutreachEmailInput),
  generate_proposal: (input) => generateProposal(input as GenerateProposalInput),
  qualify_lead: (input) => qualifyLead(input as QualifyLeadInput),
};
