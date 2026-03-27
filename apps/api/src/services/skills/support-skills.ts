import Anthropic from '@anthropic-ai/sdk';
import { brandIdentityService } from '../brand-identity-service';
import type { BrandVoice } from '@1person/core/db';
import type { SkillResult } from './marketing-skills';

const anthropic = new Anthropic();

// ============================================
// ANSWER QUESTION SKILL
// ============================================
export interface AnswerQuestionInput {
  companyId: string;
  question: string;
  context?: {
    knowledgeBase?: string;
    previousMessages?: { role: 'user' | 'agent'; content: string }[];
    productInfo?: string;
    userInfo?: {
      name?: string;
      plan?: string;
      accountAge?: string;
    };
  };
  tone?: 'formal' | 'friendly' | 'technical';
  maxLength?: number;
  includeLinks?: boolean;
}

export interface SupportAnswer {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  category: string;
  suggestedActions?: string[];
  relatedArticles?: string[];
  needsEscalation: boolean;
  escalationReason?: string;
}

export async function answerQuestion(input: AnswerQuestionInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as BrandVoice | undefined;

    const prompt = `You are a helpful customer support agent. Answer this question:

Question: ${input.question}

${input.context?.knowledgeBase ? `Knowledge Base:\n${input.context.knowledgeBase}\n` : ''}
${input.context?.productInfo ? `Product Information:\n${input.context.productInfo}\n` : ''}
${input.context?.userInfo ? `Customer Info: ${input.context.userInfo.name || 'Customer'}, Plan: ${input.context.userInfo.plan || 'Unknown'}\n` : ''}
${input.context?.previousMessages?.length ? `
Previous conversation:
${input.context.previousMessages.map((m) => `${m.role}: ${m.content}`).join('\n')}
` : ''}

Tone: ${input.tone || 'friendly'}
${voice?.tone ? `Brand Voice: ${voice.tone.join(', ')}` : ''}
${input.maxLength ? `Maximum answer length: ${input.maxLength} characters` : ''}

Provide a helpful response and determine if escalation is needed.

Return JSON:
{
  "answer": "Helpful response to the customer...",
  "confidence": "high/medium/low",
  "category": "billing/technical/general/account/other",
  "suggestedActions": ["action1", "action2"],
  "relatedArticles": ["article title 1", "article title 2"],
  "needsEscalation": true/false,
  "escalationReason": "reason if escalation needed"
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

    const answer: SupportAnswer = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { answer },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[SupportSkills] answerQuestion failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// CREATE TICKET SKILL
// ============================================
export interface CreateTicketInput {
  companyId: string;
  customerId: string;
  customerEmail: string;
  subject: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  assignTo?: string;
}

export interface CreatedTicket {
  ticketId: string;
  subject: string;
  status: 'open';
  priority: string;
  category: string;
  assignedTo?: string;
  estimatedResponseTime: string;
}

export async function createTicket(input: CreateTicketInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    // In production, this would integrate with a ticketing system
    const ticketId = `TICKET-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Auto-categorize and prioritize
    const prompt = `Analyze this support ticket and categorize it:

Subject: ${input.subject}
Description: ${input.description}

Return JSON:
{
  "suggestedCategory": "billing/technical/account/feature_request/bug/other",
  "suggestedPriority": "low/medium/high/urgent",
  "estimatedResponseTime": "timeframe like '2 hours', '1 business day'",
  "tags": ["tag1", "tag2"]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    let analysis = {
      suggestedCategory: input.category || 'general',
      suggestedPriority: input.priority || 'medium',
      estimatedResponseTime: '24 hours',
    };

    if (content && content.type === 'text') {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = { ...analysis, ...JSON.parse(jsonMatch[0]) };
      }
    }

    const ticket: CreatedTicket = {
      ticketId,
      subject: input.subject,
      status: 'open',
      priority: input.priority || analysis.suggestedPriority,
      category: input.category || analysis.suggestedCategory,
      assignedTo: input.assignTo,
      estimatedResponseTime: analysis.estimatedResponseTime,
    };

    console.log(`[SupportSkills] Created ticket: ${ticketId}`);

    return {
      success: true,
      data: { ticket },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.001 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[SupportSkills] createTicket failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// SUMMARIZE CONVERSATION SKILL
// ============================================
export interface SummarizeConversationInput {
  companyId: string;
  ticketId?: string;
  messages: { role: 'user' | 'agent'; content: string; timestamp?: string }[];
  includeActionItems?: boolean;
  includeSentiment?: boolean;
}

export interface ConversationSummary {
  summary: string;
  keyPoints: string[];
  customerIntent: string;
  resolution?: string;
  isResolved: boolean;
  actionItems?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative' | 'frustrated';
  tags: string[];
}

export async function summarizeConversation(input: SummarizeConversationInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const conversation = input.messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const prompt = `Summarize this customer support conversation:

${input.ticketId ? `Ticket ID: ${input.ticketId}` : ''}

Conversation:
${conversation}

Analyze and return JSON:
{
  "summary": "Brief 2-3 sentence summary of the conversation",
  "keyPoints": ["point1", "point2"],
  "customerIntent": "What the customer was trying to accomplish",
  "resolution": "How it was resolved (if resolved)",
  "isResolved": true/false,
  ${input.includeActionItems ? '"actionItems": ["action1", "action2"],' : ''}
  ${input.includeSentiment ? '"sentiment": "positive/neutral/negative/frustrated",' : ''}
  "tags": ["tag1", "tag2"]
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

    const summary: ConversationSummary = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { summary },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.001 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[SupportSkills] summarizeConversation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// GENERATE KNOWLEDGE ARTICLE SKILL
// ============================================
export interface GenerateKnowledgeArticleInput {
  companyId: string;
  topic: string;
  targetAudience: 'customers' | 'agents' | 'both';
  type: 'how_to' | 'troubleshooting' | 'faq' | 'policy' | 'feature_guide';
  existingInfo?: string;
  relatedArticles?: string[];
}

export interface KnowledgeArticle {
  title: string;
  slug: string;
  summary: string;
  content: string;
  tags: string[];
  relatedArticles: string[];
  seoTitle: string;
  seoDescription: string;
}

export async function generateKnowledgeArticle(input: GenerateKnowledgeArticleInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as BrandVoice | undefined;

    const typeGuides = {
      how_to: 'Step-by-step guide with clear instructions',
      troubleshooting: 'Problem-solution format with common issues and fixes',
      faq: 'Question and answer format',
      policy: 'Clear policy statement with explanations',
      feature_guide: 'Feature explanation with use cases and examples',
    };

    const prompt = `Generate a knowledge base article:

Topic: ${input.topic}
Type: ${input.type} - ${typeGuides[input.type]}
Target Audience: ${input.targetAudience}
${voice?.tone ? `Tone: ${voice.tone.join(', ')}` : ''}
${input.existingInfo ? `Existing Information:\n${input.existingInfo}` : ''}
${input.relatedArticles?.length ? `Related Articles: ${input.relatedArticles.join(', ')}` : ''}

Create a comprehensive, well-structured article that:
- Uses clear headings and subheadings
- Includes practical examples
- Is easy to scan and read
- Provides complete information

Return JSON:
{
  "title": "...",
  "slug": "url-friendly-slug",
  "summary": "Brief 1-2 sentence summary",
  "content": "Full article content in Markdown format",
  "tags": ["tag1", "tag2"],
  "relatedArticles": ["suggested related article 1", "..."],
  "seoTitle": "SEO optimized title",
  "seoDescription": "Meta description"
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

    const article: KnowledgeArticle = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { article },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[SupportSkills] generateKnowledgeArticle failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// DRAFT RESPONSE SKILL
// ============================================
export interface DraftResponseInput {
  companyId: string;
  ticketSubject: string;
  ticketDescription: string;
  responseType: 'initial' | 'follow_up' | 'resolution' | 'escalation';
  context?: string;
  customerName?: string;
  previousResponses?: string[];
}

export interface DraftedResponse {
  greeting: string;
  body: string;
  closing: string;
  fullResponse: string;
  suggestedActions: string[];
  internalNotes: string;
}

export async function draftResponse(input: DraftResponseInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as BrandVoice | undefined;

    const responseTypeGuides = {
      initial: 'First response acknowledging the issue and providing initial help',
      follow_up: 'Following up on an ongoing issue',
      resolution: 'Confirming the issue has been resolved',
      escalation: 'Informing about escalation to specialized team',
    };

    const prompt = `Draft a customer support response:

Ticket Subject: ${input.ticketSubject}
Ticket Description: ${input.ticketDescription}
Response Type: ${input.responseType} - ${responseTypeGuides[input.responseType]}
Customer Name: ${input.customerName || 'Customer'}
${voice?.tone ? `Brand Voice: ${voice.tone.join(', ')}` : ''}
${input.context ? `Additional Context: ${input.context}` : ''}
${input.previousResponses?.length ? `Previous Responses:\n${input.previousResponses.join('\n---\n')}` : ''}

Draft a professional, helpful response that:
- Addresses the customer's concern
- Is empathetic and solution-focused
- Provides clear next steps
- Matches the brand voice

Return JSON:
{
  "greeting": "Personalized greeting",
  "body": "Main response content",
  "closing": "Professional closing with next steps",
  "fullResponse": "Complete formatted response",
  "suggestedActions": ["action for agent to take"],
  "internalNotes": "Notes for the support team"
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

    const draft: DraftedResponse = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { draft },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[SupportSkills] draftResponse failed:', error);
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
export const supportSkillExecutors: Record<string, (input: unknown) => Promise<SkillResult>> = {
  answer_question: (input) => answerQuestion(input as AnswerQuestionInput),
  create_ticket: (input) => createTicket(input as CreateTicketInput),
  summarize_conversation: (input) => summarizeConversation(input as SummarizeConversationInput),
  generate_knowledge_article: (input) => generateKnowledgeArticle(input as GenerateKnowledgeArticleInput),
  draft_response: (input) => draftResponse(input as DraftResponseInput),
};
