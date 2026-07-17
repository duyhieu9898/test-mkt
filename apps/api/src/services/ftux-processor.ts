import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../lib/db';
import { companies, departments, agents, tasks, users, strategyHorizons, knowledgeBase } from '@1person/core/db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '../lib/env';
import { templateService } from './template-service';
import { playbookService } from './playbook-service';
import { guidanceService } from './guidance-service';
import { brandIdentityService } from './brand-identity-service';
import type { WebsiteAnalysisResult } from './website-analyzer';
import { bootstrapService } from './bootstrap-service';
import { CrawlerAgent } from '../agents/crawler-agent';
import { ContentExtractionAgent } from '../agents/content-extraction-agent';
import { BusinessUnderstandingAgent } from '../agents/business-understanding-agent';
import { SeoAuditAgent } from '../agents/seo-audit-agent';
import { SocialDetectionAgent } from '../agents/social-detection-agent';
import { memorySystem } from '../agents';

// Session storage (in production, use Redis)
const sessions = new Map<string, FTUXSession>();

// Initialize AI clients based on config
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
const anthropic = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

export type ProcessingStep =
  | 'understanding'
  | 'analyzing_website'
  | 'creating_ceo'
  | 'creating_marketing'
  | 'creating_operations'
  | 'generating_strategy'
  | 'setting_up_brand';

export type WebsiteOption = 'has_website' | 'new_business' | 'skip';

export interface FTUXSession {
  id: string;
  userId: string;
  prompt: string;
  websiteOption: WebsiteOption;
  websiteUrl?: string;
  status: 'processing' | 'complete' | 'error';
  currentStep: ProcessingStep | null;
  completedSteps: ProcessingStep[];
  progress: number;
  detectedInfo: {
    market: string;
    model: string;
    strategy: string;
    businessType: string;
  } | null;
  websiteAnalysis: WebsiteAnalysisResult | null;
  masterPlan: any | null;
  results: {
    companyId: string;
    companyName: string;
    agentIds: string[];
    strategyId: string | null;
    playbookId: string | null;
    templateId: string | null;
    guidanceCount: number;
    brandId: string | null;
    brandSource: 'website' | 'ai_generated' | 'default' | null;
  } | null;
  error: string | null;
  createdAt: Date;
}

interface GeneratedAgent {
  name: string;
  role: string;
  title: string;
  description: string;
  capabilities: string[];
  color: string;
  isManager: boolean;
}

interface GeneratedStrategy {
  vision: string;
  days: Array<{
    day: number | string;
    title: string;
    activities: string[];
  }>;
}

interface AIGeneratedCompany {
  companyName: string;
  detectedInfo: {
    market: string;
    model: string;
    strategy: string;
  };
  agents: GeneratedAgent[];
  strategy: GeneratedStrategy;
}

// Color palette for agents
const AGENT_COLORS = [
  '#8b5cf6', // Purple (CEO)
  '#3b82f6', // Blue (Marketing)
  '#10b981', // Green (Content)
  '#f59e0b', // Amber (Ads)
  '#06b6d4', // Cyan (Analyst)
  '#ef4444', // Red (Sales)
  '#ec4899', // Pink (Support)
  '#6366f1', // Indigo
];

const VALID_AGENT_ROLES = [
  'ceo',
  'marketing_manager',
  'sales_manager',
  'content_creator',
  'ads_specialist',
  'analyst',
  'support',
  'developer',
  'custom',
] as const;

const DEFAULT_AGENT_COLOR = '#6366f1';

function normalizeGeneratedCompany(generated: AIGeneratedCompany): AIGeneratedCompany {
  const agents = Array.isArray(generated.agents) && generated.agents.length > 0
    ? generated.agents
    : generateFallback(generated.companyName || 'Business').agents;

  const normalizedAgents: GeneratedAgent[] = agents.map((agent, i) => {
    const normalizedRole = VALID_AGENT_ROLES.includes(agent.role as typeof VALID_AGENT_ROLES[number])
      ? agent.role
      : 'custom';

    return {
      ...agent,
      role: i === 0 ? 'ceo' : normalizedRole,
      isManager: i === 0 ? true : Boolean(agent.isManager),
      color: AGENT_COLORS[i % AGENT_COLORS.length] || DEFAULT_AGENT_COLOR,
      capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
    };
  });

  if (!normalizedAgents.some((agent) => agent.role === 'ceo')) {
    normalizedAgents.unshift({
      name: 'Alex Morgan',
      role: 'ceo',
      title: 'CEO',
      description: 'Strategic planning and team coordination',
      capabilities: ['strategic_planning', 'team_building', 'decision_making'],
      color: AGENT_COLORS[0] || DEFAULT_AGENT_COLOR,
      isManager: true,
    });
  }

  return {
    ...generated,
    agents: normalizedAgents.slice(0, 6),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function limitText(value: string | undefined | null, maxLength: number, fallback: string): string {
  const normalized = decodeHtmlEntities(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return fallback;
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

function cleanCompanyName(value: string | undefined | null, fallback: string): string {
  const decoded = limitText(value, 255, fallback);
  const withoutTasteWpSuffix = decoded
    .replace(/\s+[-–—]\s+.*$/u, '')
    .replace(/\s+trang web\b.*$/iu, '')
    .replace(/\s+bản quyền bởi TasteWP\.com\b.*$/iu, '')
    .trim();

  return limitText(withoutTasteWpSuffix || decoded, 255, fallback);
}

function createCompanySlug(companyName: string, websiteUrl?: string): string {
  const suffix = nanoid(6);
  let source = companyName;

  if (websiteUrl) {
    try {
      source = new URL(websiteUrl).hostname.replace(/^www\./, '').split('.')[0] || source;
    } catch {
      // Keep companyName as source when URL parsing fails.
    }
  }

  const maxBaseLength = 100 - suffix.length - 1;
  const base = decodeHtmlEntities(source)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, maxBaseLength)
    .replace(/-+$/g, '');

  return `${base || 'company'}-${suffix}`;
}

async function generateWithAI(prompt: string): Promise<AIGeneratedCompany> {
  const provider = env.FTUX_AI_PROVIDER;
  const model = env.FTUX_AI_MODEL;

  // Check if the selected provider has API key configured
  if (provider === 'openai' && !openai) {
    console.log('No OpenAI API key, using fallback templates');
    return generateFallback(prompt);
  }
  if (provider === 'anthropic' && !anthropic) {
    console.log('No Anthropic API key, using fallback templates');
    return generateFallback(prompt);
  }

  const systemPrompt = `You are an AI business consultant helping create an AI-powered company structure.
Given a business idea, generate:
1. A company name (2-3 words, professional)
2. Market analysis (what market/industry)
3. Business model (how it makes money)
4. Growth strategy (main approach)
5. 4-6 AI agents with specific roles for THIS business
6. A 7-day launch strategy

Respond ONLY with valid JSON in this exact format:
{
  "companyName": "Company Name",
  "detectedInfo": {
    "market": "Industry/Market",
    "model": "Business Model",
    "strategy": "Growth Strategy"
  },
  "agents": [
    {
      "name": "Full Name",
      "role": "role_key",
      "title": "Job Title",
      "description": "What this agent does",
      "capabilities": ["capability1", "capability2", "capability3"],
      "isManager": true/false
    }
  ],
  "strategy": {
    "vision": "7-day vision statement",
    "days": [
      {
        "day": 1,
        "title": "Day Title",
        "activities": ["Activity 1", "Activity 2", "Activity 3"]
      }
    ]
  }
}

Rules:
- First agent must be CEO with role "ceo" and isManager: true
- Include 4-6 agents total
- Role MUST be one of: "ceo", "marketing_manager", "sales_manager", "content_creator", "ads_specialist", "analyst", "support", "developer", "custom"
- Title can be specific to the business (e.g., "Restaurant Success Manager", "Product Lead")
- Use realistic names
- Capabilities should be specific actions the agent can do
- Strategy should have 5-7 day entries (can combine days like "4-5")`;

  try {
    let content: string | null = null;

    if (provider === 'anthropic' && anthropic) {
      // Use Anthropic/Claude
      console.log(`Using Anthropic with model: ${model}`);
      const response = await anthropic.messages.create({
        model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Create an AI company structure for this business idea: "${prompt}"`,
          },
        ],
      });
      const textBlock = response.content.find((block) => block.type === 'text');
      content = textBlock && 'text' in textBlock ? textBlock.text : null;
    } else if (openai) {
      // Use OpenAI (default)
      console.log(`Using OpenAI with model: ${model}`);
      const response = await openai.chat.completions.create({
        model,
        max_tokens: 2000,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Create an AI company structure for this business idea: "${prompt}"`,
          },
        ],
        response_format: { type: 'json_object' },
      });
      content = response.choices[0]?.message?.content ?? null;
    }

    if (!content) {
      throw new Error(`No response from ${provider}`);
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const generated = JSON.parse(jsonMatch[0]) as AIGeneratedCompany;

    return normalizeGeneratedCompany(generated);
  } catch (error) {
    console.error('AI generation failed, using fallback:', error);
    return normalizeGeneratedCompany(generateFallback(prompt));
  }
}

function generateFallback(prompt: string): AIGeneratedCompany {
  const lower = prompt.toLowerCase();

  // Detect business type
  let businessType = 'default';
  if (lower.includes('restaurant') || lower.includes('food') || lower.includes('cafe')) {
    businessType = 'restaurant';
  } else if (lower.includes('saas') || lower.includes('software') || lower.includes('app')) {
    businessType = 'saas';
  } else if (lower.includes('ecommerce') || lower.includes('store') || lower.includes('shop')) {
    businessType = 'ecommerce';
  } else if (lower.includes('agency') || lower.includes('consulting')) {
    businessType = 'agency';
  }

  const templates: Record<string, AIGeneratedCompany> = {
    restaurant: {
      companyName: 'Smart Kitchen Co',
      detectedInfo: {
        market: 'Food & Hospitality Tech',
        model: 'SaaS for Restaurants',
        strategy: 'Product-led Growth',
      },
      agents: [
        { name: 'Chen Wei', role: 'ceo', title: 'CEO', description: 'Strategic vision and restaurant partnerships', capabilities: ['strategic_planning', 'partnership_development', 'market_expansion'], color: '#8b5cf6', isManager: true },
        { name: 'Maria Santos', role: 'developer', title: 'Product Lead', description: 'Restaurant software features and UX', capabilities: ['feature_planning', 'user_research', 'roadmap_management'], color: '#3b82f6', isManager: true },
        { name: 'James O\'Brien', role: 'support', title: 'Restaurant Success Manager', description: 'Onboarding and training restaurant clients', capabilities: ['client_onboarding', 'training_programs', 'success_metrics'], color: '#10b981', isManager: false },
        { name: 'Priya Sharma', role: 'marketing_manager', title: 'Marketing Manager', description: 'Restaurant industry marketing', capabilities: ['content_marketing', 'industry_events', 'case_studies'], color: '#f59e0b', isManager: true },
      ],
      strategy: {
        vision: 'Launch MVP and acquire first 10 restaurant clients',
        days: [
          { day: 1, title: 'Market Research', activities: ['Analyze competitor restaurant software', 'Interview 5 restaurant owners', 'Define MVP features'] },
          { day: 2, title: 'Product Setup', activities: ['Set up demo environment', 'Create onboarding flow', 'Prepare training materials'] },
          { day: 3, title: 'Marketing Launch', activities: ['Create restaurant-focused landing page', 'Write case study template', 'Set up social media'] },
          { day: '4-5', title: 'Outreach', activities: ['Contact 50 local restaurants', 'Attend restaurant association meetup', 'Launch referral program'] },
          { day: '6-7', title: 'Optimization', activities: ['Analyze signup metrics', 'Gather early feedback', 'Iterate on messaging'] },
        ],
      },
    },
    saas: {
      companyName: 'CloudFlow Labs',
      detectedInfo: {
        market: 'Enterprise Software',
        model: 'B2B SaaS Subscription',
        strategy: 'Product-led Growth',
      },
      agents: [
        { name: 'Alex Thompson', role: 'ceo', title: 'CEO', description: 'Product vision and company strategy', capabilities: ['strategic_planning', 'investor_relations', 'team_building'], color: '#8b5cf6', isManager: true },
        { name: 'Sarah Kim', role: 'developer', title: 'Product Manager', description: 'Feature prioritization and user research', capabilities: ['feature_planning', 'user_interviews', 'analytics'], color: '#3b82f6', isManager: true },
        { name: 'Marcus Johnson', role: 'marketing_manager', title: 'Growth Lead', description: 'User acquisition and retention', capabilities: ['growth_experiments', 'funnel_optimization', 'retention_strategies'], color: '#10b981', isManager: false },
        { name: 'Emily Chen', role: 'content_creator', title: 'Content Lead', description: 'Documentation and educational content', capabilities: ['documentation', 'tutorials', 'blog_posts'], color: '#f59e0b', isManager: false },
      ],
      strategy: {
        vision: 'Launch beta and acquire first 100 users',
        days: [
          { day: 1, title: 'Foundation', activities: ['Define value proposition', 'Set up analytics', 'Create user personas'] },
          { day: 2, title: 'Landing Page', activities: ['Design high-converting landing page', 'Write compelling copy', 'Set up A/B testing'] },
          { day: 3, title: 'Content', activities: ['Create getting started guide', 'Record demo video', 'Write first blog post'] },
          { day: '4-5', title: 'Launch Prep', activities: ['Set up email sequences', 'Prepare Product Hunt launch', 'Reach out to beta testers'] },
          { day: '6-7', title: 'Go Live', activities: ['Launch on Product Hunt', 'Monitor feedback', 'Respond to users'] },
        ],
      },
    },
    ecommerce: {
      companyName: 'Direct Brand Co',
      detectedInfo: {
        market: 'E-commerce & Retail',
        model: 'Direct-to-Consumer',
        strategy: 'Performance Marketing',
      },
      agents: [
        { name: 'Jordan Blake', role: 'ceo', title: 'CEO', description: 'Brand strategy and supplier relations', capabilities: ['brand_strategy', 'supplier_negotiations', 'growth_planning'], color: '#8b5cf6', isManager: true },
        { name: 'Nina Patel', role: 'marketing_manager', title: 'Marketing Manager', description: 'Paid ads and email marketing', capabilities: ['paid_advertising', 'email_campaigns', 'influencer_outreach'], color: '#3b82f6', isManager: true },
        { name: 'Tyler Ross', role: 'content_creator', title: 'Creative Lead', description: 'Product photography and ad creative', capabilities: ['product_photography', 'ad_creative', 'brand_visuals'], color: '#10b981', isManager: false },
        { name: 'Lisa Wang', role: 'support', title: 'Operations Manager', description: 'Inventory and fulfillment', capabilities: ['inventory_management', 'fulfillment_optimization', 'customer_service'], color: '#f59e0b', isManager: false },
      ],
      strategy: {
        vision: 'Launch store and hit $10K in first month sales',
        days: [
          { day: 1, title: 'Store Setup', activities: ['Finalize product catalog', 'Optimize product pages', 'Set up payment processing'] },
          { day: 2, title: 'Creative', activities: ['Product photoshoot', 'Write product descriptions', 'Create ad templates'] },
          { day: 3, title: 'Marketing Setup', activities: ['Set up Facebook pixel', 'Create email welcome series', 'Plan influencer outreach'] },
          { day: '4-5', title: 'Launch', activities: ['Launch paid ads', 'Send to email list', 'Post on social media'] },
          { day: '6-7', title: 'Optimize', activities: ['Analyze ROAS', 'A/B test ads', 'Retarget visitors'] },
        ],
      },
    },
    agency: {
      companyName: 'Apex Consulting',
      detectedInfo: {
        market: 'Professional Services',
        model: 'Agency Retainer',
        strategy: 'Thought Leadership',
      },
      agents: [
        { name: 'David Miller', role: 'ceo', title: 'CEO', description: 'Client relationships and business development', capabilities: ['client_management', 'business_development', 'strategic_consulting'], color: '#8b5cf6', isManager: true },
        { name: 'Rachel Green', role: 'support', title: 'Account Director', description: 'Client success and project delivery', capabilities: ['project_management', 'client_success', 'team_coordination'], color: '#3b82f6', isManager: true },
        { name: 'Kevin Park', role: 'content_creator', title: 'Content Strategist', description: 'Thought leadership and case studies', capabilities: ['content_strategy', 'case_studies', 'white_papers'], color: '#10b981', isManager: false },
        { name: 'Amanda Torres', role: 'sales_manager', title: 'Sales Lead', description: 'Lead qualification and proposals', capabilities: ['lead_qualification', 'proposal_writing', 'sales_calls'], color: '#f59e0b', isManager: false },
      ],
      strategy: {
        vision: 'Establish authority and sign 3 retainer clients',
        days: [
          { day: 1, title: 'Positioning', activities: ['Define niche expertise', 'Create ideal client profile', 'Set pricing tiers'] },
          { day: 2, title: 'Credibility', activities: ['Write 2 case studies', 'Update LinkedIn profiles', 'Publish thought piece'] },
          { day: 3, title: 'Outreach', activities: ['Build prospect list', 'Create outreach sequences', 'Prepare proposal template'] },
          { day: '4-5', title: 'Networking', activities: ['Attend industry events', 'Schedule discovery calls', 'Ask for referrals'] },
          { day: '6-7', title: 'Follow-up', activities: ['Send proposals', 'Handle objections', 'Close first deal'] },
        ],
      },
    },
    default: {
      companyName: 'Innovate Labs',
      detectedInfo: {
        market: 'General Business',
        model: 'Service/Product',
        strategy: 'Multi-channel Growth',
      },
      agents: [
        { name: 'Alex Morgan', role: 'ceo', title: 'CEO', description: 'Strategic planning and team coordination', capabilities: ['strategic_planning', 'team_building', 'decision_making'], color: '#8b5cf6', isManager: true },
        { name: 'Jordan Lee', role: 'marketing_manager', title: 'Marketing Manager', description: 'Brand building and lead generation', capabilities: ['marketing_strategy', 'lead_generation', 'brand_management'], color: '#3b82f6', isManager: true },
        { name: 'Sam Rivera', role: 'content_creator', title: 'Content Creator', description: 'Content creation and social media', capabilities: ['content_creation', 'social_media', 'copywriting'], color: '#10b981', isManager: false },
        { name: 'Taylor Kim', role: 'support', title: 'Operations', description: 'Process optimization and support', capabilities: ['process_optimization', 'customer_support', 'quality_assurance'], color: '#f59e0b', isManager: false },
      ],
      strategy: {
        vision: 'Build foundation and establish market presence',
        days: [
          { day: 1, title: 'Foundation', activities: ['Define value proposition', 'Identify target audience', 'Competitive analysis'] },
          { day: 2, title: 'Online Presence', activities: ['Set up website', 'Create social profiles', 'Google Business listing'] },
          { day: 3, title: 'Content', activities: ['Create initial content', 'Set up email list', 'Plan content calendar'] },
          { day: '4-5', title: 'Marketing', activities: ['Launch campaigns', 'Start outreach', 'Build partnerships'] },
          { day: '6-7', title: 'Optimize', activities: ['Analyze results', 'Gather feedback', 'Iterate strategy'] },
        ],
      },
    },
  };

  // Extract meaningful words for company name
  const words = prompt.split(' ').filter((w) => w.length > 3 && !['with', 'that', 'this', 'from', 'for', 'the'].includes(w.toLowerCase()));
  const meaningful = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const template = templates[businessType] || templates.default!;
  const customName = meaningful.length >= 2 ? `${meaningful[0]} ${meaningful[1]} Co` : meaningful.length === 1 ? `${meaningful[0]} AI Co` : template.companyName;

  return {
    ...template,
    companyName: customName,
  };
}

// =============================================================================
// FTUX → Knowledge Base Bridge
// Populates structured knowledge entries from website analysis
// =============================================================================

async function populateKnowledgeFromAnalysis(companyId: string, analysis: any) {
  const entries: Array<{ category: string; title: string; content: string; source: string }> = [];

  // Products/Services
  if (analysis.businessInfo?.offerings) {
    for (const offering of analysis.businessInfo.offerings) {
      entries.push({
        category: 'product',
        title: offering,
        content: `Product/service offered: ${offering}`,
        source: 'website_analysis',
      });
    }
  }

  // Target Audience
  if (analysis.businessInfo?.audience) {
    entries.push({
      category: 'customer',
      title: 'Target Audience',
      content: analysis.businessInfo.audience,
      source: 'website_analysis',
    });
  }

  // Business Type + Value Proposition
  if (analysis.businessInfo?.businessType) {
    entries.push({
      category: 'company_info',
      title: 'Business Type',
      content: `${analysis.businessInfo.businessType}. ${analysis.businessInfo.valueProposition || ''}`,
      source: 'website_analysis',
    });
  }

  // Industry + Market
  if (analysis.businessInfo?.industry) {
    entries.push({
      category: 'company_info',
      title: 'Industry',
      content: `Industry: ${analysis.businessInfo.industry}. Market: ${analysis.businessInfo.market || ''}`,
      source: 'website_analysis',
    });
  }

  // Competitors
  if (analysis.competitors?.length) {
    for (const comp of analysis.competitors) {
      entries.push({
        category: 'competitor',
        title: comp.name,
        content: `Competitor: ${comp.name} (${comp.domain}). Strengths: ${(comp.strengths || []).join(', ')}`,
        source: 'website_analysis',
      });
    }
  }

  // Keywords
  if (analysis.keywordOpportunities?.length) {
    for (const kw of analysis.keywordOpportunities.slice(0, 10)) {
      entries.push({
        category: 'keyword',
        title: kw.keyword,
        content: `Keyword opportunity: "${kw.keyword}" — volume: ${kw.volume}, competition: ${kw.competition}, relevance: ${kw.relevance}`,
        source: 'website_analysis',
      });
    }
  }

  // SEO Issues
  if (analysis.seoIssues?.length) {
    entries.push({
      category: 'seo_issue',
      title: 'SEO Issues Found',
      content: analysis.seoIssues.join('; '),
      source: 'website_analysis',
    });
  }

  // Insert all entries
  for (const entry of entries) {
    await db.insert(knowledgeBase).values({
      companyId,
      ...entry,
    }).onConflictDoNothing();
  }

  console.log(`[FTUX] Populated ${entries.length} knowledge entries for company ${companyId}`);
}

export class FTUXProcessor {
  async startSession(
    userId: string,
    prompt: string,
    options?: {
      websiteOption?: WebsiteOption;
      websiteUrl?: string;
    }
  ): Promise<string> {
    const sessionId = uuidv4();
    const session: FTUXSession = {
      id: sessionId,
      userId,
      prompt,
      websiteOption: options?.websiteOption || 'skip',
      websiteUrl: options?.websiteUrl,
      status: 'processing',
      currentStep: null,
      completedSteps: [],
      progress: 0,
      detectedInfo: null,
      websiteAnalysis: null,
      masterPlan: null,
      results: null,
      error: null,
      createdAt: new Date(),
    };
    sessions.set(sessionId, session);
    return sessionId;
  }

  async processAsync(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    try {
      // Step 1: Understanding - Generate with AI
      await this.updateSession(sessionId, {
        currentStep: 'understanding',
        progress: 10,
      });

      let websiteAnalysis: WebsiteAnalysisResult | null = null;
      let enrichedPrompt = session.prompt;
      let businessProfile: any = null;

      session.completedSteps.push('understanding');

      // If website URL provided, run 3-layer agent pipeline
      if (session.websiteUrl) {
        await this.updateSession(sessionId, {
          currentStep: 'analyzing_website' as any,
          progress: 15,
        });

        try {
          // Create agent context
          const agentContext = {
            companyId: sessionId, // temporary, real companyId not yet created
            executionId: sessionId,
            memory: memorySystem.createAccessor(sessionId, sessionId),
          };

          // === LAYER 1: Smart Crawler ===
          console.log(`[FTUX] Layer 1: Crawling ${session.websiteUrl}`);
          const crawlerAgent = new CrawlerAgent();
          const crawlResult = await withTimeout(
            crawlerAgent.execute({ url: session.websiteUrl }, agentContext),
            20_000,
            'Website crawl'
          );

          if (!crawlResult.success) {
            console.warn(`[FTUX] Crawler failed: ${crawlResult.error}`);
            throw new Error(`Crawler failed: ${crawlResult.error}`);
          }

          // DEBUG: Log crawler output
          const crawlData = crawlResult.data;
          console.log(`[FTUX] Crawler output:
  Title: ${crawlData.title}
  H1: ${JSON.stringify((crawlData as any).h1)}
  H2: ${JSON.stringify((crawlData as any).h2)}
  Paragraphs: ${(crawlData as any).paragraphs?.length || 0}
  Total text: ${(crawlData as any).rawTextLength || 0} chars`);

          await this.updateSession(sessionId, { progress: 25 });

          // === LAYER 2: Content Extraction ===
          console.log(`[FTUX] Layer 2: Extracting semantic content`);
          const contentAgent = new ContentExtractionAgent();
          const extractResult = await withTimeout(
            contentAgent.execute(
              { structuredData: crawlData, url: session.websiteUrl },
              agentContext
            ),
            20_000,
            'Website content extraction'
          );

          if (!extractResult.success) {
            console.warn(`[FTUX] Content extraction failed: ${extractResult.error}`);
          }

          const extractedContent = extractResult.data?.extractedContent;

          // DEBUG: Log extracted content
          console.log(`[FTUX] Extracted content:
  Hero: ${(extractedContent as any)?.heroMessage || 'EMPTY'}
  What they do: ${(extractedContent as any)?.whatTheyDo || 'EMPTY'}
  Services: ${JSON.stringify((extractedContent as any)?.services || [])}
  Target signals: ${JSON.stringify((extractedContent as any)?.targetSignals || [])}
  Keywords: ${JSON.stringify((extractedContent as any)?.keywords || [])}`);

          // === DATA VALIDATION ===
          const contentQuality = this.assessContentQuality(extractedContent);
          console.log(`[FTUX] Content quality: ${contentQuality.level} (score: ${contentQuality.score})`);

          await this.updateSession(sessionId, { progress: 35 });

          // === LAYER 3: Business Understanding ===
          console.log(`[FTUX] Layer 3: Analyzing business (user input: "${session.prompt.substring(0, 50)}")`);
          const businessAgent = new BusinessUnderstandingAgent();
          const businessResult = await withTimeout(
            businessAgent.execute(
              {
                extractedContent: contentQuality.level !== 'insufficient' ? extractedContent : undefined,
                userInput: session.prompt,
                url: session.websiteUrl,
              },
              agentContext
            ),
            25_000,
            'Business understanding'
          );

          // DEBUG: Log final LLM input/output
          if (businessResult.success && businessResult.data.businessInfo) {
            businessProfile = businessResult.data.businessInfo;
            console.log(`[FTUX] Business profile:
  Type: ${businessProfile?.businessType}
  Audience: ${businessProfile?.targetAudience}
  Offering: ${businessProfile?.coreOffering}
  Industry: ${businessProfile?.industry}
  Confidence: ${businessProfile?.confidence}
  Reasoning: ${businessProfile?.reasoning?.substring(0, 100)}`);
          } else {
            // Layer 3 FAILED — use Layer 2 extracted content as fallback
            console.warn(`[FTUX] Layer 3 failed: ${businessResult.error || 'No data'}. Using Layer 2 fallback.`);
            const ec = extractedContent as any;
            if (ec) {
              businessProfile = {
                businessType: ec.whatTheyDo || ec.heroMessage || 'Business',
                targetAudience: ec.targetSignals?.join(', ') || 'General',
                coreOffering: ec.services?.slice(0, 3).join(', ') || ec.whatTheyDo || '',
                industry: ec.keywords?.slice(0, 2).join(', ') || 'Unknown',
                offerings: ec.services || [],
                valueProposition: ec.heroMessage || ec.whatTheyDo || '',
                monetizationModel: '',
                market: ec.keywords?.[0] || '',
                strategy: 'Content marketing and SEO',
                confidence: 0.4,
                reasoning: 'Extracted from website content (AI analysis unavailable)',
              };
              console.log(`[FTUX] Fallback profile from Layer 2: Type=${businessProfile.businessType}`);
            }
          }

          // === SEO Audit (parallel, non-blocking) ===
          let seoAudit: WebsiteAnalysisResult['seoAudit'] | null = null;
          let socialProfiles: WebsiteAnalysisResult['socialProfiles'] = [];
          try {
            const seoAgent = new SeoAuditAgent();
            const seoResult = await withTimeout(
              seoAgent.execute({ html: crawlData.html, url: session.websiteUrl }, agentContext),
              10_000,
              'SEO audit'
            );
            seoAudit = (seoResult.data?.seoAudit as WebsiteAnalysisResult['seoAudit'] | undefined) || null;

            const socialAgent = new SocialDetectionAgent();
            const socialResult = await withTimeout(
              socialAgent.execute({ html: crawlData.html }, agentContext),
              10_000,
              'Social profile detection'
            );
            const detectedSocialProfiles = socialResult.data?.socialProfiles as WebsiteAnalysisResult['socialProfiles'] | undefined;
            socialProfiles = Array.isArray(detectedSocialProfiles) ? detectedSocialProfiles : [];
          } catch (e) {
            console.warn('[FTUX] SEO/Social detection failed:', e);
          }

          // Build websiteAnalysis from agent results
          websiteAnalysis = {
            businessInfo: {
              companyName: cleanCompanyName((crawlData as any).title, businessProfile?.businessType || 'Business'),
              industry: businessProfile?.industry || (extractedContent as any)?.keywords?.[0] || 'Unknown',
              model: businessProfile?.monetizationModel || businessProfile?.coreOffering || (extractedContent as any)?.whatTheyDo || 'Unknown',
              audience: businessProfile?.targetAudience || (extractedContent as any)?.targetSignals?.join(', ') || 'Unknown',
              offerings: businessProfile?.offerings || (extractedContent as any)?.services || [],
              valueProposition: businessProfile?.valueProposition || (extractedContent as any)?.heroMessage || '',
              market: businessProfile?.market || businessProfile?.industry || 'Unknown',
              strategy: businessProfile?.strategy || '',
            },
            seoAudit: seoAudit || { score: 0, metaTags: { title: '', description: '', hasOgTags: false }, headings: { h1Count: 0, h2Count: 0, issues: [] }, missingElements: [], performanceHints: [] },
            competitors: [],
            socialProfiles,
            keywordOpportunities: [],
            masterPlan: null as any,
          };

          await this.updateSession(sessionId, {
            websiteAnalysis,
            progress: 40,
          });

          // Enrich the prompt with REAL extracted data (not guesses)
          enrichedPrompt = `${session.prompt}

Verified Website Analysis (confidence: ${businessProfile?.confidence || 0}):
- Business Type: ${businessProfile?.businessType || 'Unknown'}
- Target Audience: ${businessProfile?.targetAudience || 'Unknown'}
- Core Offering: ${businessProfile?.coreOffering || 'Unknown'}
- Industry: ${businessProfile?.industry || 'Unknown'}
- Services: ${businessProfile?.offerings?.join(', ') || 'Unknown'}
- Value Proposition: ${businessProfile?.valueProposition || 'Unknown'}
- Reasoning: ${businessProfile?.reasoning || 'No reasoning'}`;

        } catch (error) {
          console.warn('[FTUX] Website analysis pipeline failed, continuing with prompt only:', error);
        }

        session.completedSteps.push('analyzing_website');
      }

      const finalWebsiteAnalysis = websiteAnalysis as WebsiteAnalysisResult | null;
      const generated = await generateWithAI(enrichedPrompt);

      // If website analysis gave us a company name, use it
      if (finalWebsiteAnalysis?.businessInfo?.companyName) {
        generated.companyName = cleanCompanyName(finalWebsiteAnalysis.businessInfo.companyName, generated.companyName);
        generated.detectedInfo = {
          market: finalWebsiteAnalysis.businessInfo.market || generated.detectedInfo.market,
          model: finalWebsiteAnalysis.businessInfo.model || generated.detectedInfo.model,
          strategy: finalWebsiteAnalysis.businessInfo.strategy || generated.detectedInfo.strategy,
        };
      }

      await this.updateSession(sessionId, {
        detectedInfo: {
          ...generated.detectedInfo,
          businessType: finalWebsiteAnalysis ? 'website_analyzed' : 'ai_generated',
        },
        progress: 25,
      });

      // Step 2: Create company
      await this.updateSession(sessionId, { currentStep: 'creating_ceo', progress: 30 });

      const companyName = cleanCompanyName(generated.companyName, 'Business');
      const slug = createCompanySlug(companyName, session.websiteUrl);
      const [company] = await db.insert(companies).values({
        ownerId: session.userId,
        name: companyName,
        slug,
        description: session.prompt,
        industry: limitText(generated.detectedInfo.market, 100, 'Unknown'),
        businessType: limitText(generated.detectedInfo.model, 100, 'Unknown'),
        settings: {
          timezone: 'UTC',
          currency: 'USD',
          language: 'en',
          websiteUrl: session.websiteUrl,
          websiteOption: session.websiteOption,
          approvalThresholds: {
            spending: 1000,
            majorDecision: true,
          },
        } as any,
        totalBudget: '500',
        monthlyBudget: '500',
      }).returning();
      if (!company) {
        throw new Error('Failed to create company');
      }

      // Create departments
      const defaultDepts = [
        { name: 'Executive', color: '#8b5cf6', icon: 'crown' },
        { name: 'Marketing', color: '#3b82f6', icon: 'megaphone' },
        { name: 'Product', color: '#10b981', icon: 'box' },
        { name: 'Operations', color: '#f59e0b', icon: 'settings' },
      ];
      await db.insert(departments).values(defaultDepts.map((dept) => ({ companyId: company.id, ...dept })));

      await this.delay(500);
      session.completedSteps.push('creating_ceo');

      // Step 3: Create agents
      await this.updateSession(sessionId, { currentStep: 'creating_marketing', progress: 50 });

      const agentIdMap = new Map<string, string>();
      const createdAgentIds: string[] = [];

      // Sort agents: CEO first, then managers, then workers
      const sortedAgents = [...generated.agents].sort((a, b) => {
        if (a.role === 'ceo') return -1;
        if (b.role === 'ceo') return 1;
        if (a.isManager && !b.isManager) return -1;
        if (!a.isManager && b.isManager) return 1;
        return 0;
      });

      for (const agentTemplate of sortedAgents) {
        // Find supervisor (CEO for managers, first manager for workers)
        let supervisorId: string | undefined;
        if (agentTemplate.role !== 'ceo') {
          if (agentTemplate.isManager) {
            supervisorId = agentIdMap.get('ceo');
          } else {
            // Find first manager
            const firstManager = sortedAgents.find((a) => a.isManager && a.role !== 'ceo');
            if (firstManager) {
              supervisorId = agentIdMap.get(firstManager.role);
            }
          }
        }

        const [agent] = await db.insert(agents).values({
          companyId: company.id,
          name: agentTemplate.name,
          role: agentTemplate.role as any,
          title: agentTemplate.title,
          description: agentTemplate.description,
          capabilities: agentTemplate.capabilities,
          color: agentTemplate.color,
          supervisorId,
          status: 'ready',
          budgetLimit: '100',
        } as any).returning();
        if (!agent) {
          throw new Error(`Failed to create agent: ${agentTemplate.name}`);
        }

        agentIdMap.set(agentTemplate.role, agent.id);
        createdAgentIds.push(agent.id);
      }

      await this.delay(500);
      session.completedSteps.push('creating_marketing');

      // Step 4: Creating operations
      await this.updateSession(sessionId, { currentStep: 'creating_operations', progress: 70 });
      await this.delay(500);
      session.completedSteps.push('creating_operations');

      // Step 5: Generate strategy
      await this.updateSession(sessionId, { currentStep: 'generating_strategy', progress: 85 });

      const now = new Date();
      const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const [strategy] = await db.insert(strategyHorizons).values({
        companyId: company.id,
        horizon: 'weekly',
        status: 'active',
        periodStart: now,
        periodEnd: weekEnd,
        vision: generated.strategy.vision,
        objectives: generated.strategy.days.map((day, i) => ({
          id: uuidv4(),
          title: day.title,
          description: `Day ${day.day}: ${day.activities.join(', ')}`,
          keyResults: day.activities.map((activity) => ({
            metric: activity,
            target: 1,
            current: 0,
            unit: 'complete',
          })),
          progress: 0,
          status: 'not_started',
        })),
        priorities: generated.strategy.days.map((day, i) => ({
          rank: i + 1,
          title: day.title,
          description: day.activities.join(', '),
          category: 'growth',
          effort: 'medium',
          impact: 'high',
        })),
        overallProgress: 0,
        healthScore: 100,
      } as any).returning();
      if (!strategy) {
        throw new Error('Failed to create strategy');
      }

      // Create tasks from strategy
      const ceoId = agentIdMap.get('ceo');
      for (const day of generated.strategy.days) {
        for (const activity of day.activities) {
          await db.insert(tasks).values({
            companyId: company.id,
            title: activity,
            description: `Part of ${day.title} (Day ${day.day})`,
            type: 'ftux_task',
            priority: 'medium',
            status: 'pending',
            assignedAgentId: ceoId,
          });
        }
      }

      await this.delay(500);
      session.completedSteps.push('generating_strategy');

      // Step 6: Set up brand identity
      await this.updateSession(sessionId, { currentStep: 'setting_up_brand', progress: 90 });

      let brandId: string | null = null;
      let brandSource: 'website' | 'ai_generated' | 'default' | null = null;

      try {
        if (session.websiteOption === 'has_website' && session.websiteUrl) {
          // Extract brand from existing website
          console.log(`[FTUX] Extracting brand from website: ${session.websiteUrl}`);
          const extracted = await withTimeout(
            brandIdentityService.extractFromWebsite(session.websiteUrl),
            25_000,
            'Brand extraction'
          );
          brandId = await brandIdentityService.saveExtractedBrand(company.id, extracted, session.websiteUrl);
          brandSource = 'website';
        } else if (session.websiteOption === 'new_business') {
          // Generate brand using AI
          console.log(`[FTUX] Generating AI brand for new business`);
          brandId = await withTimeout(
            brandIdentityService.generateBrandFromDescription(
              company.id,
              session.prompt,
              generated.detectedInfo.market
            ),
            25_000,
            'Brand generation'
          );
          brandSource = 'ai_generated';
        } else {
          // Skip - create default brand
          console.log(`[FTUX] Creating default brand (skipped)`);
          brandId = await brandIdentityService.createDefaultBrand(
            company.id,
            generated.detectedInfo.market
          );
          brandSource = 'default';
        }
      } catch (error) {
        console.warn('[FTUX] Brand setup failed, using defaults:', error);
        // Fallback to default brand
        brandId = await brandIdentityService.createDefaultBrand(
          company.id,
          generated.detectedInfo.market
        );
        brandSource = 'default';
      }

      await this.delay(300);
      session.completedSteps.push('setting_up_brand');

      // Step 7: Start playbook and generate guidance
      let playbookId: string | null = null;
      let templateId: string | null = null;
      let guidanceCount = 0;

      try {
        // Try to match a template from the database
        const templateMatch = await templateService.matchTemplate(session.prompt);

        if (templateMatch && templateMatch.score > 0) {
          templateId = templateMatch.templateId;

          // Get associated playbook
          const playbook = await templateService.getPlaybookForTemplate(templateId);

          if (playbook) {
            playbookId = playbook.id;

            // Start the playbook for this company
            await playbookService.startPlaybook(company.id, playbookId);

            // Generate tasks from the current stage (idea stage)
            await playbookService.generateStageTasks(company.id);

            // Generate initial guidance items
            const guidance = await guidanceService.generateInitialGuidance(company.id, playbookId);
            guidanceCount = guidance.length;

            // Increment template usage
            await templateService.incrementUsage(templateId);

            console.log(`Started playbook ${playbookId} for company ${company.id} with ${guidanceCount} guidance items`);
          }
        }
      } catch (error) {
        // Log error but don't fail FTUX - playbook/guidance are optional enhancements
        console.warn('Failed to set up playbook/guidance:', error);
      }

      // The growth plan is finalized after the founder confirms the detected
      // business details. This prevents Brand IQ and CEO Advisor from being
      // grounded in an AI draft that the founder subsequently edits.
      const masterPlan = null;

      // BOOTSTRAP: Create real system state — landing pages, tasks, active agents
      // This runs SYNCHRONOUSLY so data exists when user reaches dashboard
      try {
        console.log(`[FTUX] Bootstrapping company ${company.id}...`);
        const bootstrapResult = await bootstrapService.bootstrapCompany({
          companyId: company.id,
          companyName: company.name,
          businessType: businessProfile?.businessType || generated.detectedInfo.model,
          targetAudience: businessProfile?.targetAudience,
          offerings: businessProfile?.offerings || [],
          industry: businessProfile?.industry || generated.detectedInfo.market,
          websiteUrl: session.websiteUrl,
          prompt: session.prompt,
        });
        console.log(`[FTUX] Bootstrap done: ${bootstrapResult.pagesCreated} pages, ${bootstrapResult.tasksCreated} tasks`);
      } catch (err) {
        console.warn('[FTUX] Bootstrap failed (non-critical):', err);
      }

      // Populate knowledge base from website analysis (FTUX → Knowledge Base Bridge)
      if (finalWebsiteAnalysis) {
        try {
          await populateKnowledgeFromAnalysis(company.id, finalWebsiteAnalysis);
        } catch (err) {
          console.warn('[FTUX] Knowledge base population failed (non-critical):', err);
        }
      }

      // Mark the processing stage complete only after all source data that the
      // finalization step consumes has been persisted.
      await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, session.userId));
      await this.updateSession(sessionId, {
        status: 'complete',
        progress: 100,
        currentStep: null,
        websiteAnalysis: finalWebsiteAnalysis,
        masterPlan,
        results: {
          companyId: company.id,
          companyName: company.name,
          agentIds: createdAgentIds,
          strategyId: strategy.id,
          playbookId,
          templateId,
          guidanceCount,
          brandId,
          brandSource,
        },
      });

      // Also fire orchestrator in background for deeper analysis
      this.autoTriggerOrchestrator(company.id, session.prompt, session.websiteUrl, businessProfile).catch(
        (err) => console.warn('[FTUX] Auto-trigger orchestrator failed (non-blocking):', err)
      );
    } catch (error) {
      console.error('FTUX processing error:', error);
      await this.updateSession(sessionId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getStatus(sessionId: string): Promise<FTUXSession | null> {
    return sessions.get(sessionId) || null;
  }

  private async updateSession(sessionId: string, update: Partial<FTUXSession>): Promise<void> {
    const session = sessions.get(sessionId);
    if (session) {
      Object.assign(session, update);
      sessions.set(sessionId, session);
    }
  }

  /**
   * Auto-trigger the orchestrator after FTUX completes.
   * This creates real tasks and starts executing immediately.
   * By the time user reaches the dashboard, the system is already working.
   */
  private async autoTriggerOrchestrator(
    companyId: string,
    prompt: string,
    websiteUrl?: string,
    businessProfile?: any
  ): Promise<void> {
    const { orchestrator } = await import('../agents');

    const goal = websiteUrl
      ? `Analyze ${websiteUrl}, discover keywords, create SEO content plan, and generate initial landing pages for the business`
      : `Analyze market, discover keywords, create content plan, and generate initial landing pages for: ${prompt}`;

    console.log(`[FTUX] Auto-triggering orchestrator for company ${companyId}`);

    const result = await orchestrator.executeGoal(companyId, goal, {
      websiteUrl,
      prompt,
      businessInfo: businessProfile,
      autoMode: true,
    });

    console.log(`[FTUX] Auto-trigger complete: ${result.summary}`);
  }

  private assessContentQuality(content: any): { level: 'rich' | 'moderate' | 'insufficient'; score: number } {
    if (!content) return { level: 'insufficient', score: 0 };

    let score = 0;

    // Hero message
    if (content.heroMessage && content.heroMessage.length > 5) score += 20;

    // What they do
    if (content.whatTheyDo && content.whatTheyDo.length > 10) score += 20;

    // Services
    if (content.services?.length > 0) score += 15;
    if (content.services?.length > 2) score += 10;

    // Target signals
    if (content.targetSignals?.length > 0) score += 15;

    // Keywords
    if (content.keywords?.length > 0) score += 10;

    // Raw text
    if (content.rawTextSample?.length > 100) score += 10;

    const level = score >= 50 ? 'rich' : score >= 25 ? 'moderate' : 'insufficient';
    return { level, score };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
